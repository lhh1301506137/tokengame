"use strict";

// 宿主中立的远程通知交接点。协调器仍不运行任何玩家模型：它只把已经由真人开启的
// 有界 wake window 所领取的 intent，交给持有同一席 model token 的出站连接器。
// 连接器回执只说明一次本机 queue 尝试；AI 是否真正 start / resolve 仍由
// ModelCommandSurface 的权威回执判断。
const { CoreError } = require("./core-client.cjs");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT_ID = /^intent-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const REMOTE_WAKE_LIMITS = Object.freeze({
  leaseMs: 45_000,
  maxPollMs: 25_000,
  maxBindings: 256,
  maxAcksPerBinding: 128,
});

function positive(value, fallback, field) {
  const selected = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > fallback) {
    throw new CoreError("invalid_field", 400, { field });
  }
  return selected;
}

function uuid(value, field) {
  if (typeof value !== "string" || !UUID.test(value)) throw new CoreError("invalid_field", 400, { field });
  return value.toLowerCase();
}

function scopeValue(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.handle !== "string" || value.handle === ""
    || typeof value.bindingId !== "string" || value.bindingId === ""
    || !Number.isSafeInteger(value.generation) || value.generation < 1) {
    throw new CoreError("model_scope_rejected", 403);
  }
  return { handle: value.handle, bindingId: value.bindingId, generation: value.generation };
}

function receiptValue(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 4
    || Object.keys(value).some((key) => !["queued", "attempted", "cleanup_ok", "reason"].includes(key))
    || typeof value.queued !== "boolean" || typeof value.attempted !== "boolean"
    || typeof value.cleanup_ok !== "boolean" || (value.queued && !value.attempted)
    || !(value.reason === null || (typeof value.reason === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value.reason)))) {
    throw new CoreError("invalid_field", 400, { field: "receipt" });
  }
  return { queued: value.queued, attempted: value.attempted, cleanup_ok: value.cleanup_ok, reason: value.reason };
}

function sameReceipt(left, right) {
  return left.queued === right.queued && left.attempted === right.attempted
    && left.cleanup_ok === right.cleanup_ok && left.reason === right.reason;
}

class RemoteWakeBroker {
  constructor(options = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#setTimeout = options.setTimeout ?? setTimeout;
    this.#clearTimeout = options.clearTimeout ?? clearTimeout;
    this.#assertScopeCurrent = options.assertScopeCurrent ?? (() => {});
    if (typeof this.#now !== "function" || typeof this.#setTimeout !== "function"
      || typeof this.#clearTimeout !== "function" || typeof this.#assertScopeCurrent !== "function") {
      throw new CoreError("invalid_field", 400, { field: "remote_wake_dependencies" });
    }
    this.#limits = {
      leaseMs: positive(options.leaseMs, REMOTE_WAKE_LIMITS.leaseMs, "leaseMs"),
      maxPollMs: positive(options.maxPollMs, REMOTE_WAKE_LIMITS.maxPollMs, "maxPollMs"),
      maxBindings: positive(options.maxBindings, REMOTE_WAKE_LIMITS.maxBindings, "maxBindings"),
      maxAcksPerBinding: positive(options.maxAcksPerBinding, REMOTE_WAKE_LIMITS.maxAcksPerBinding, "maxAcksPerBinding"),
    };
    const queue = (input) => this.queue(input);
    Object.defineProperties(queue, {
      selectThread: { value: (candidate, scope) => this.selectThread(candidate, scope) },
      allowsThread: { value: (candidate, scope) => this.selectThread(candidate, scope) !== null },
      targetConfigured: { value: (scope) => this.targetConfigured(scope) },
      scopeAware: { value: true },
    });
    this.wakeQueue = queue;
  }

  #now;
  #setTimeout;
  #clearTimeout;
  #assertScopeCurrent;
  #limits;
  #entries = new Map();
  #closed = false;

  wakeQueue;

  #time() {
    const value = this.#now();
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new CoreError("wake_clock_invalid", 500);
    }
    return value;
  }

  #scope(value) {
    const scope = scopeValue(value);
    this.#assertScopeCurrent(scope);
    return scope;
  }

  #key(scope) {
    return `${scope.handle}\0${scope.bindingId}\0${scope.generation}`;
  }

  #entry(scope) {
    return this.#entries.get(this.#key(scope)) ?? null;
  }

  #active(entry) {
    return entry !== null && entry.leaseUntil > this.#time();
  }

  #notification(pending) {
    return { notification_id: pending.notificationId, intent_id: pending.intentId };
  }

  #pollResult(entry, pending = entry.pending) {
    if (pending !== null) pending.delivered = true;
    return {
      connected: true,
      lease_ms: this.#limits.leaseMs,
      notification: pending === null ? null : this.#notification(pending),
    };
  }

  #settlePoll(entry, result, error = null) {
    const waiter = entry.poll;
    if (waiter === null) return;
    entry.poll = null;
    this.#clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener("abort", waiter.abort);
    if (error === null) waiter.resolve(result);
    else waiter.reject(error);
  }

  #finishPending(entry, receipt) {
    const pending = entry.pending;
    if (pending === null) return;
    entry.pending = null;
    pending.signal?.removeEventListener("abort", pending.abort);
    pending.resolve(receipt);
  }

  targetConfigured(scopeValueInput) {
    if (this.#closed) return false;
    try {
      const scope = this.#scope(scopeValueInput);
      return this.#active(this.#entry(scope));
    } catch { return false; }
  }

  selectThread(candidate = undefined, scopeValueInput) {
    if (this.#closed) return null;
    try {
      const scope = this.#scope(scopeValueInput);
      const entry = this.#entry(scope);
      if (!this.#active(entry)) return null;
      if (candidate === undefined) return entry.targetId;
      return typeof candidate === "string" && UUID.test(candidate)
        && candidate.toLowerCase() === entry.targetId ? entry.targetId : null;
    } catch { return null; }
  }

  async poll(scopeValueInput, input = {}, operation = {}) {
    if (this.#closed) throw new CoreError("wake_disabled", 503);
    const scope = this.#scope(scopeValueInput);
    if (input === null || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some((key) => !["connector_id", "target_id", "wait_ms"].includes(key))) {
      throw new CoreError("invalid_field", 400, { field: "wake_connector_poll" });
    }
    const connectorId = uuid(input.connector_id, "connector_id");
    const targetId = uuid(input.target_id, "target_id");
    const waitMs = positive(input.wait_ms, this.#limits.maxPollMs, "wait_ms");
    const signal = operation?.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new CoreError("invalid_field", 400, { field: "signal" });
    if (signal?.aborted) throw new CoreError("wake_connector_cancelled", 409);

    const key = this.#key(scope);
    let entry = this.#entries.get(key);
    const active = this.#active(entry ?? null);
    if (entry === undefined) {
      if (this.#entries.size >= this.#limits.maxBindings) throw new CoreError("wake_connector_capacity", 503);
      entry = { scope, connectorId, targetId, leaseUntil: 0, poll: null, pending: null, acks: new Map() };
      this.#entries.set(key, entry);
    } else if (entry.connectorId !== connectorId || entry.targetId !== targetId) {
      if (active || entry.pending !== null) throw new CoreError("wake_connector_in_use", 409);
      this.#settlePoll(entry, null, new CoreError("wake_connector_changed", 409));
      entry.connectorId = connectorId;
      entry.targetId = targetId;
      entry.acks.clear();
    }
    if (entry.poll !== null) throw new CoreError("wake_connector_poll_active", 409);
    entry.leaseUntil = this.#time() + this.#limits.leaseMs;
    if (entry.pending !== null) return this.#pollResult(entry);

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, timer: null, abort: null };
      waiter.abort = () => this.#settlePoll(entry, null, new CoreError("wake_connector_cancelled", 409));
      waiter.timer = this.#setTimeout(() => this.#settlePoll(entry, this.#pollResult(entry, null)), waitMs);
      waiter.timer?.unref?.();
      signal?.addEventListener("abort", waiter.abort, { once: true });
      entry.poll = waiter;
    });
  }

  async queue(input = {}) {
    const failed = (reason, attempted = false) => ({ queued: false, attempted, cleanup_ok: true, reason });
    if (this.#closed) return failed("wake_connector_unavailable");
    if (input === null || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some((key) => !["scope", "threadId", "intentId", "notificationId", "signal"].includes(key))) {
      return failed("invalid_configuration");
    }
    let scope;
    try { scope = this.#scope(input.scope); } catch { return failed("model_binding_changed"); }
    if (typeof input.threadId !== "string" || !UUID.test(input.threadId)
      || typeof input.intentId !== "string" || !INTENT_ID.test(input.intentId)
      || typeof input.notificationId !== "string" || !UUID.test(input.notificationId)
      || (input.signal !== undefined && !(input.signal instanceof AbortSignal))) return failed("invalid_configuration");
    if (input.signal?.aborted) return failed("cancelled");
    const entry = this.#entry(scope);
    if (!this.#active(entry)) return failed("wake_connector_unavailable");
    // 沿用内部 sender 接口的 threadId 槽位，但远端值只能是连接器提供的别名。
    if (input.threadId.toLowerCase() !== entry.targetId) return failed("wake_thread_not_authorized");
    if (entry.pending !== null) return failed("wake_connector_busy");
    const notificationId = input.notificationId.toLowerCase();
    const intentId = input.intentId;
    return new Promise((resolve) => {
      const pending = {
        notificationId, intentId, delivered: false, resolve,
        signal: input.signal, abort: null,
      };
      pending.abort = () => {
        if (entry.pending !== pending) return;
        // 通知已出站但尚无 ACK 时，服务器无法证明远端 queue 子进程已经关闭。
        // 只清掉本地 Promise 不等于远端 cleanup 成功，必须保留未知为失败关闭。
        this.#finishPending(entry, { ...failed("cancelled", pending.delivered), cleanup_ok: !pending.delivered });
      };
      input.signal?.addEventListener("abort", pending.abort, { once: true });
      entry.pending = pending;
      if (entry.poll !== null) this.#settlePoll(entry, this.#pollResult(entry));
    });
  }

  ack(scopeValueInput, input = {}) {
    if (this.#closed) throw new CoreError("wake_disabled", 503);
    const scope = this.#scope(scopeValueInput);
    if (input === null || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).length !== 3
      || Object.keys(input).some((key) => !["connector_id", "notification_id", "receipt"].includes(key))) {
      throw new CoreError("invalid_field", 400, { field: "wake_connector_ack" });
    }
    const connectorId = uuid(input.connector_id, "connector_id");
    const notificationId = uuid(input.notification_id, "notification_id");
    const receipt = receiptValue(input.receipt);
    const entry = this.#entry(scope);
    if (entry === null) throw new CoreError("wake_notification_unknown", 404);
    if (entry.connectorId !== connectorId) throw new CoreError("wake_connector_changed", 409);
    const replay = entry.acks.get(notificationId);
    if (replay !== undefined) {
      if (!sameReceipt(replay, receipt)) throw new CoreError("wake_ack_conflict", 409);
      return { acked: true, replayed: true };
    }
    if (entry.pending === null || entry.pending.notificationId !== notificationId || !entry.pending.delivered) {
      throw new CoreError("wake_notification_unknown", 404);
    }
    if (entry.acks.size >= this.#limits.maxAcksPerBinding) {
      const oldest = entry.acks.keys().next().value;
      entry.acks.delete(oldest);
    }
    entry.acks.set(notificationId, receipt);
    this.#finishPending(entry, receipt);
    return { acked: true, replayed: false };
  }

  forgetScope(scopeValueInput) {
    let scope;
    try { scope = scopeValue(scopeValueInput); } catch { return; }
    const key = this.#key(scope);
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    this.#settlePoll(entry, null, new CoreError("model_binding_changed", 403));
    if (entry.pending !== null) this.#finishPending(entry, {
      queued: false, attempted: entry.pending.delivered, cleanup_ok: !entry.pending.delivered, reason: "model_binding_changed",
    });
    this.#entries.delete(key);
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const entry of this.#entries.values()) {
      this.#settlePoll(entry, null, new CoreError("wake_disabled", 503));
      if (entry.pending !== null) this.#finishPending(entry, {
        queued: false, attempted: entry.pending.delivered, cleanup_ok: !entry.pending.delivered, reason: "cancelled",
      });
    }
    this.#entries.clear();
  }
}

module.exports = { RemoteWakeBroker, REMOTE_WAKE_LIMITS };
