"use strict";

const crypto = require("node:crypto");

class ProbeError extends Error {
  constructor(code, status = 400, details = undefined) {
    super(code);
    this.name = "ProbeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function requiredString(value, field, maxLength = 4096) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProbeError(`missing_${field}`, 400);
  }
  if (value.length > maxLength) {
    throw new ProbeError(`${field}_too_long`, 400, { max_length: maxLength });
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class EventStore {
  constructor({ now = () => Date.now(), idFactory = () => crypto.randomUUID() } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.listeners = new Set();
    this.resetState();
  }

  resetState() {
    this.nextSequence = 1;
    this.windowCounter = 0;
    this.events = [];
    this.currentWindow = null;
    this.requestsByTurn = new Map();
    this.idempotency = new Map();
  }

  reset({ auto_open = false, duration_ms = 30_000 } = {}) {
    this.resetState();
    const resetEvent = this.record("PROBE_RESET", {
      mode: "local-probe-only",
    });
    let actionWindow = null;
    if (auto_open) {
      actionWindow = this.openActionWindow({ duration_ms });
    }
    return { reset: true, event: resetEvent, action_window: actionWindow };
  }

  openActionWindow({ duration_ms = 30_000 } = {}) {
    this.expireOpenWindow();
    if (this.currentWindow?.status === "open") {
      throw new ProbeError("window_already_open", 409, {
        window_id: this.currentWindow.id,
      });
    }

    const duration = Number(duration_ms);
    if (!Number.isFinite(duration) || duration < 1 || duration > 10 * 60_000) {
      throw new ProbeError("invalid_duration_ms", 400, {
        min: 1,
        max: 10 * 60_000,
      });
    }

    const openedAt = this.now();
    this.windowCounter += 1;
    this.currentWindow = {
      id: `window-${this.windowCounter}-${this.idFactory()}`,
      status: "open",
      opened_at: openedAt,
      deadline_at: openedAt + duration,
      ai_request: null,
      answer: null,
      closed_at: null,
      close_reason: null,
    };

    this.record("ACTION_WINDOW_OPENED", {
      window_id: this.currentWindow.id,
      actor: "a",
      deadline_at: this.currentWindow.deadline_at,
    });
    return this.publicWindow(this.currentWindow);
  }

  closeActionWindow({ reason = "manual_probe_close" } = {}) {
    this.expireOpenWindow();
    const actionWindow = this.currentWindow;
    if (!actionWindow) {
      throw new ProbeError("no_action_window", 404);
    }
    if (actionWindow.status === "closed") {
      return { closed: true, replay: true, action_window: this.publicWindow(actionWindow) };
    }

    actionWindow.status = "closed";
    actionWindow.closed_at = this.now();
    actionWindow.close_reason = String(reason).slice(0, 120);
    const event = this.record("ACTION_WINDOW_CLOSED", {
      window_id: actionWindow.id,
      reason: actionWindow.close_reason,
    });
    return { closed: true, replay: false, event, action_window: this.publicWindow(actionWindow) };
  }

  submitPrompt(input) {
    const sessionId = requiredString(input.session_id, "session_id", 256);
    const turnId = requiredString(input.turn_id, "turn_id", 256);
    const prompt = requiredString(input.prompt, "prompt", 4_000).trim();
    const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key", 512);
    const fingerprint = JSON.stringify({ sessionId, turnId, prompt });
    const replay = this.lookupIdempotency(`prompt:${idempotencyKey}`, fingerprint);
    if (replay) {
      return { ...clone(replay), replay: true };
    }

    const actionWindow = this.requireOpenWindow();
    if (actionWindow.ai_request) {
      throw new ProbeError("ai_request_quota_used", 409, {
        request_id: actionWindow.ai_request.request_id,
        window_id: actionWindow.id,
      });
    }

    const turnKey = `${sessionId}\u0000${turnId}`;
    if (this.requestsByTurn.has(turnKey)) {
      throw new ProbeError("turn_already_registered", 409);
    }

    const request = {
      request_id: `ai-${this.idFactory()}`,
      window_id: actionWindow.id,
      session_id: sessionId,
      turn_id: turnId,
      prompt,
      accepted_at: this.now(),
      status: "awaiting_answer",
    };
    actionWindow.ai_request = request;
    this.requestsByTurn.set(turnKey, request);

    const event = this.record("AI_PROMPT_PUBLISHED", {
      request_id: request.request_id,
      window_id: actionWindow.id,
      actor: "a",
      prompt,
    });
    const result = {
      accepted: true,
      replay: false,
      request_id: request.request_id,
      window_id: actionWindow.id,
      event_seq: event.seq,
      accepted_at: request.accepted_at,
      deadline_at: actionWindow.deadline_at,
    };
    this.storeIdempotency(`prompt:${idempotencyKey}`, fingerprint, result);
    return clone(result);
  }

  submitAnswer(input) {
    const sessionId = requiredString(input.session_id, "session_id", 256);
    const turnId = requiredString(input.turn_id, "turn_id", 256);
    const message = requiredString(input.message, "message", 8_000).trim();
    const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key", 512);
    const fingerprint = JSON.stringify({ sessionId, turnId, message });
    const replay = this.lookupIdempotency(`answer:${idempotencyKey}`, fingerprint);
    if (replay) {
      return { ...clone(replay), replay: true };
    }

    const request = this.requestsByTurn.get(`${sessionId}\u0000${turnId}`);
    if (!request) {
      throw new ProbeError("unknown_ai_request", 404);
    }
    const actionWindow = this.currentWindow;
    if (!actionWindow || actionWindow.id !== request.window_id) {
      throw new ProbeError("request_window_missing", 409);
    }
    this.requireOpenWindow();
    if (request.status !== "awaiting_answer" || actionWindow.answer) {
      throw new ProbeError("ai_answer_already_submitted", 409, {
        request_id: request.request_id,
      });
    }

    request.status = "answered";
    request.answered_at = this.now();
    actionWindow.answer = {
      request_id: request.request_id,
      message,
      accepted_at: request.answered_at,
    };
    const event = this.record("AI_ANSWER_PUBLISHED", {
      request_id: request.request_id,
      window_id: actionWindow.id,
      actor: "ai:a",
      message,
    });
    const result = {
      accepted: true,
      replay: false,
      request_id: request.request_id,
      window_id: actionWindow.id,
      event_seq: event.seq,
      accepted_at: request.answered_at,
    };
    this.storeIdempotency(`answer:${idempotencyKey}`, fingerprint, result);
    return clone(result);
  }

  requireOpenWindow() {
    if (!this.currentWindow || this.currentWindow.status !== "open") {
      throw new ProbeError("action_window_closed", 409);
    }
    if (this.expireOpenWindow()) {
      throw new ProbeError("action_window_expired", 409, {
        deadline_at: this.currentWindow.deadline_at,
      });
    }
    return this.currentWindow;
  }

  expireOpenWindow() {
    if (!this.currentWindow || this.currentWindow.status !== "open") {
      return false;
    }
    const now = this.now();
    if (now < this.currentWindow.deadline_at) {
      return false;
    }
    this.currentWindow.status = "closed";
    this.currentWindow.closed_at = now;
    this.currentWindow.close_reason = "deadline_elapsed";
    this.record("ACTION_WINDOW_CLOSED", {
      window_id: this.currentWindow.id,
      reason: "deadline_elapsed",
    });
    return true;
  }

  lookupIdempotency(key, fingerprint) {
    const entry = this.idempotency.get(key);
    if (!entry) {
      return null;
    }
    if (entry.fingerprint !== fingerprint) {
      throw new ProbeError("idempotency_key_conflict", 409);
    }
    return entry.result;
  }

  storeIdempotency(key, fingerprint, result) {
    this.idempotency.set(key, { fingerprint, result: clone(result) });
  }

  record(type, payload) {
    const event = {
      seq: this.nextSequence,
      type,
      server_time: this.now(),
      payload: clone(payload),
    };
    this.nextSequence += 1;
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(clone(event));
    }
    return clone(event);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publicWindow(actionWindow) {
    if (!actionWindow) {
      return null;
    }
    return {
      id: actionWindow.id,
      status: actionWindow.status,
      opened_at: actionWindow.opened_at,
      deadline_at: actionWindow.deadline_at,
      closed_at: actionWindow.closed_at,
      close_reason: actionWindow.close_reason,
      ai_request: actionWindow.ai_request
        ? {
            request_id: actionWindow.ai_request.request_id,
            status: actionWindow.ai_request.status,
            accepted_at: actionWindow.ai_request.accepted_at,
          }
        : null,
      answer: actionWindow.answer ? clone(actionWindow.answer) : null,
    };
  }

  publicState() {
    this.expireOpenWindow();
    return {
      contract: "tokengame.local-probe.v1",
      mode: "local-probe-only",
      server_time: this.now(),
      table: {
        id: "probe-table",
        hand: "bridge-spike",
        seats: [
          { id: "a", label: "A / YOU", status: "connected" },
          { id: "b", label: "B", status: "observer" },
          { id: "c", label: "C", status: "observer" },
          { id: "d", label: "D", status: "observer" }
        ],
      },
      action_window: this.publicWindow(this.currentWindow),
      events: clone(this.events),
    };
  }
}

module.exports = { EventStore, ProbeError };
