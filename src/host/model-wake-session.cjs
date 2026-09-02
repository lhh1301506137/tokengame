"use strict";

// 有界的本机通知窗口，不是模型运行时或游戏权威。只领取本绑定的权威意图；
// queue ACK 不释放单槽，只有 ModelCommandSurface 观察到的实际 resolve 成功可以。
const { randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { CoreError } = require("./core-client.cjs");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT_ID = /^intent-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const WAKE_LIMITS = Object.freeze({
  maxNotifications: 4,
  maxDurationMs: 600_000,
  maxRequests: 128,
  maxThreadBindings: 128,
  ioTimeoutMs: 5_000,
  queueTimeoutMs: 10_000,
  cleanupTimeoutMs: 2_000,
  resultTimeoutMs: 120_000,
  pollIntervalMs: 250,
});

// 同一个模型面只有一份有限控制历史和 thread→席位配对。模型任务会保留私有上下文，
// resolve 成功也不能把任务转借给另一席。重建管理器不等于重建绑定。凭据不在此账中。
const registries = new WeakMap();

function positiveBound(value, fallback, field) {
  const chosen = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(chosen) || chosen < 1 || chosen > fallback) {
    throw new CoreError("invalid_field", 400, { field });
  }
  return chosen;
}

function uuid(value, field) {
  if (typeof value !== "string" || !UUID.test(value)) throw new CoreError("invalid_field", 400, { field });
  return value.toLowerCase();
}

function queueReceipt(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || typeof value.queued !== "boolean" || typeof value.attempted !== "boolean"
      || typeof value.cleanup_ok !== "boolean" || (value.queued && !value.attempted)
      || !(value.reason === null || typeof value.reason === "string")) return null;
    // sender 的错误正文不能成为控制响应正文。只记已确认的三件传输事实。
    return { queued: value.queued, attempted: value.attempted, cleanup_ok: value.cleanup_ok };
  } catch { return null; }
}

class ModelWakeSessionManager {
  constructor(options = {}) {
    if (typeof options.modelSurface?.captureScope !== "function" || typeof options.readState !== "function") {
      throw new CoreError("invalid_field", 400, { field: "wake_dependencies" });
    }
    if (options.wakeQueue != null && typeof options.wakeQueue !== "function") {
      throw new CoreError("invalid_field", 400, { field: "wakeQueue" });
    }
    this.#surface = options.modelSurface;
    this.#readState = options.readState;
    this.#queue = options.wakeQueue ?? null;
    this.#now = options.now ?? (() => performance.now());
    this.#setTimeout = options.setTimeout ?? setTimeout;
    this.#clearTimeout = options.clearTimeout ?? clearTimeout;
    this.#limits = Object.fromEntries(Object.entries(WAKE_LIMITS).map(([key, value]) =>
      [key, positiveBound(options[key], value, key)]));
    if (!registries.has(this.#surface)) registries.set(this.#surface, { handles: new Map(), threads: new Map() });
    this.#registry = registries.get(this.#surface);
  }

  #surface;
  #readState;
  #queue;
  #now;
  #setTimeout;
  #clearTimeout;
  #limits;
  #registry;
  #closed = false;
  #lastNow = null;

  get enabled() { return this.#queue !== null && !this.#closed; }

  get targetConfigured() { return this.enabled && this.#selectedThread() !== null; }

  targetConfiguredFor(trustedScope) {
    if (!this.enabled) return false;
    try {
      const scope = this.#scope(trustedScope);
      if (typeof this.#queue.targetConfigured === "function") {
        return this.#queue.targetConfigured(scope) === true;
      }
      return this.#selectedThread(undefined, scope) !== null;
    } catch { return false; }
  }

  // 只公开真人窗口可选的实际边界；不暴露发送器目标、路径或内部调度配置。
  get limits() {
    return { max_notifications: this.#limits.maxNotifications, max_duration_ms: this.#limits.maxDurationMs };
  }

  #scope(trustedScope) {
    const scope = this.#surface.captureScope(trustedScope);
    if (scope.bindingId === null) throw new CoreError("model_binding_required", 403);
    return scope;
  }

  start(trustedScope, input = {}) {
    if (!this.enabled) throw new CoreError("wake_disabled", 503);
    const scope = this.#scope(trustedScope);
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new CoreError("invalid_field", 400, { field: "wake_start" });
    }
    if (input.acknowledged !== true) throw new CoreError("invalid_field", 400, { field: "acknowledged" });
    for (const key of Object.keys(input)) {
      if (!["acknowledged", "request_id", "thread_id", "max_notifications", "max_duration_ms"].includes(key)) {
        throw new CoreError("invalid_field", 400, { field: "wake_start" });
      }
    }
    const requestId = uuid(input.request_id, "request_id");
    let threadId;
    if (!Object.hasOwn(input, "thread_id")) {
      threadId = this.#selectedThread(undefined, scope);
      if (threadId === null) throw new CoreError("invalid_field", 400, { field: "thread_id" });
    } else {
      threadId = uuid(input.thread_id, "thread_id");
      if (typeof this.#queue.selectThread === "function") {
        const selected = this.#selectedThread(threadId, scope);
        if (selected === null || selected !== threadId) throw new CoreError("wake_thread_not_authorized", 403);
        threadId = selected;
      } else if (this.#queue.allowsThread !== undefined && this.#queue.allowsThread(threadId, scope) !== true) {
        throw new CoreError("wake_thread_not_authorized", 403);
      }
    }
    const maxNotifications = positiveBound(input.max_notifications, this.#limits.maxNotifications, "max_notifications");
    const maxDurationMs = positiveBound(input.max_duration_ms, this.#limits.maxDurationMs, "max_duration_ms");
    let history = this.#registry.handles.get(scope.handle);
    if (history === undefined) {
      history = new Map();
      this.#registry.handles.set(scope.handle, history);
    }
    const previous = history.get(requestId);
    if (previous !== undefined) {
      if (previous.scope.bindingId !== scope.bindingId || previous.scope.generation !== scope.generation
        || previous.threadId !== threadId || previous.maxNotifications !== maxNotifications || previous.maxDurationMs !== maxDurationMs) {
        throw new CoreError("wake_request_conflict", 409);
      }
      return previous.owner.#snapshot(previous); // stopped 也只回放，绝不重新排任务。
    }
    if ([...history.values()].some((request) => !request.done)) throw new CoreError("wake_session_active", 409);
    if ([...history.values()].some((request) => request.cleanupOk !== true)) {
      throw new CoreError("wake_cleanup_failed", 500);
    }
    if ([...history.values()].some((request) => !request.owner.#settledAuthority(request))) {
      // 单槽属于同一席位。停止/撤权、换绑定、换键或换thread都不证明旧通知已经结清。
      throw new CoreError("wake_result_pending", 409);
    }
    if (history.size >= this.#limits.maxRequests) throw new CoreError("wake_history_full", 409);
    const occupant = this.#registry.threads.get(threadId);
    if (occupant === undefined && this.#registry.threads.size >= this.#limits.maxThreadBindings) {
      throw new CoreError("wake_thread_history_full", 409);
    }
    if (occupant !== undefined && !(occupant.scope.handle === scope.handle && occupant.done
      && occupant.owner.#settledAuthority(occupant))) {
      throw new CoreError("wake_thread_in_use", 409);
    }
    const request = {
      owner: this, scope, trustedScope: { seat_handle: scope.handle, binding_id: scope.bindingId },
      requestId, threadId, maxNotifications, maxDurationMs,
      startedAt: this.#time(), stoppedAt: null, state: "waiting", reason: null,
      attemptedCount: 0, queuedCount: 0, resolvedCount: 0, dispatchCount: 0,
      pending: null, cleanupOk: true, queueTask: null, controller: new AbortController(),
      resolvedBeforeInvalidation: false, failureCode: null,
      done: false, work: null, deadlineTimer: null,
    };
    history.set(requestId, request);
    this.#registry.threads.set(threadId, request);
    request.deadlineTimer = this.#timer(() => this.#cancel(request, "max_duration"), maxDurationMs);
    request.work = Promise.resolve().then(() => this.#run(request));
    return this.#snapshot(request);
  }

  #selectedThread(candidate = undefined, scope = undefined) {
    if (typeof this.#queue?.selectThread !== "function") return null;
    try {
      const selected = this.#queue.selectThread(candidate, scope);
      return typeof selected === "string" && UUID.test(selected) ? selected.toLowerCase() : null;
    } catch { return null; }
  }

  status(trustedScope, requestId = undefined) {
    const scope = this.#scope(trustedScope);
    const request = this.#find(scope, requestId);
    return request === null ? this.#idle() : request.owner.#snapshot(request);
  }

  async stop(trustedScope, requestId = undefined) {
    const scope = this.#scope(trustedScope);
    const request = this.#find(scope, requestId);
    if (request === null) return this.#idle();
    request.owner.#cancel(request, "stopped_by_owner");
    await request.work;
    this.#surface.assertScopeCurrent(scope);
    return request.owner.#snapshot(request);
  }

  #find(scope, requestId) {
    const history = this.#registry.handles.get(scope.handle);
    if (requestId !== undefined) {
      const validRequestId = uuid(requestId, "request_id");
      const request = history?.get(validRequestId);
      if (request === undefined || request.scope.bindingId !== scope.bindingId || request.scope.generation !== scope.generation) {
        throw new CoreError("wake_request_unknown", 404);
      }
      return request;
    }
    return [...(history?.values() ?? [])].filter((request) => request.scope.bindingId === scope.bindingId
      && request.scope.generation === scope.generation).at(-1) ?? null;
  }

  stopHandle(handle, reason = "model_binding_changed") {
    const requests = [...(this.#registry.handles.get(handle)?.values() ?? [])].filter((request) => !request.done);
    for (const request of requests) {
      // revokeModelBinding immediately clears the surface receipt after this
      // synchronous call returns. Preserve only an already precise resolve so
      // a queue ACK still in flight cannot turn a settled authority result into
      // a permanent wake_result_pending. Sender cleanup must still succeed.
      request.owner.#rememberResolvedAuthority(request);
      request.owner.#cancel(request, reason);
    }
    return Promise.all(requests.map((request) => request.work));
  }

  forgetHandle(handle) {
    const closing = this.stopHandle(handle);
    this.#registry.handles.delete(handle);
    return closing;
  }

  async close() {
    this.#closed = true;
    const requests = [...new Set([...this.#registry.handles.values()].flatMap((history) => [...history.values()])
      .concat([...this.#registry.threads.values()]))].filter((request) => request.owner === this);
    for (const request of requests) this.#cancel(request, "host_stopped");
    await Promise.all(requests.map((request) => request.work));
    return { cleanup_ok: requests.every((request) => request.cleanupOk === true) };
  }

  #idle() {
    return { state: "idle", reason: this.enabled ? null : "wake_disabled", request_id: null,
      attempted_count: 0, queued_count: 0, resolved_count: 0, cleanup_ok: true, cleanup_pending: false };
  }

  #snapshot(request) {
    let at = request.stoppedAt;
    if (at === null) {
      try { at = this.#time(); } catch { this.#cancel(request, "wake_clock_invalid"); at = request.stoppedAt; }
    }
    return {
      state: request.state, reason: request.reason, request_id: request.requestId, thread_id: request.threadId,
      max_notifications: request.maxNotifications, max_duration_ms: request.maxDurationMs,
      elapsed_ms: Math.max(0, at - request.startedAt),
      attempted_count: request.attemptedCount, queued_count: request.queuedCount, resolved_count: request.resolvedCount,
      pending_intent_id: request.pending?.intentId ?? null,
      ...(request.failureCode === null ? {} : { failure_code: request.failureCode }),
      cleanup_ok: request.cleanupOk, cleanup_pending: request.state === "stopped" && !request.done,
      // 公开成功不是 native task idle；停止监听也不能撤回宿主已接收的消息。
      native_turn_state: "unknown", accepted_notifications_retracted: false,
    };
  }

  #timer(callback, ms) {
    const timer = this.#setTimeout(callback, ms);
    timer?.unref?.();
    return timer;
  }

  #time() {
    let at;
    try { at = this.#now(); } catch { throw new CoreError("wake_clock_invalid", 500); }
    if (!Number.isFinite(at) || at < 0 || at > Number.MAX_SAFE_INTEGER || (this.#lastNow !== null && at < this.#lastNow)) {
      throw new CoreError("wake_clock_invalid", 500);
    }
    this.#lastNow = at;
    return at;
  }

  #cancel(request, reason) {
    if (request.state === "stopped") return;
    request.state = "stopped";
    request.reason = reason;
    try { request.stoppedAt = this.#time(); } catch {
      request.stoppedAt = this.#lastNow ?? request.startedAt;
      request.reason = "wake_clock_invalid";
    }
    request.controller.abort();
  }

  #assertCurrent(request) {
    if (request.controller.signal.aborted) throw new CoreError("wake_cancelled", 409);
    this.#surface.assertScopeCurrent(request.scope);
    if (this.#time() - request.startedAt >= request.maxDurationMs) {
      this.#cancel(request, "max_duration");
      throw new CoreError("wake_cancelled", 409);
    }
  }

  async #bounded(request, action, ms, timeoutCode) {
    this.#assertCurrent(request);
    let timer;
    let abort;
    const failure = new Promise((_, reject) => {
      timer = this.#timer(() => reject(new CoreError(timeoutCode, 504)), ms);
      abort = () => reject(new CoreError("wake_cancelled", 409));
      request.controller.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const value = await Promise.race([Promise.resolve().then(() => {
        this.#assertCurrent(request);
        return action(request.controller.signal);
      }), failure]);
      this.#assertCurrent(request);
      return value;
    } finally {
      this.#clearTimeout(timer);
      request.controller.signal.removeEventListener("abort", abort);
    }
  }

  async #pause(request) {
    this.#assertCurrent(request);
    let timer;
    let abort;
    try {
      await new Promise((resolve) => {
        timer = this.#timer(resolve, this.#limits.pollIntervalMs);
        abort = resolve;
        request.controller.signal.addEventListener("abort", abort, { once: true });
      });
      this.#assertCurrent(request);
    } finally {
      this.#clearTimeout(timer);
      request.controller.signal.removeEventListener("abort", abort);
    }
  }

  async #state(request) {
    const state = await this.#bounded(request, (signal) => this.#readState(request.trustedScope, { signal }),
      this.#limits.ioTimeoutMs, "wake_io_timeout");
    if (state?.mode === "OFF") { this.#cancel(request, "seat_ai_off"); throw new CoreError("wake_cancelled", 409); }
    if (state?.mode !== "ON" || !(state.active_turn_id === null || typeof state.active_turn_id === "string")) {
      throw new CoreError("wake_protocol_invalid", 502);
    }
    return state;
  }

  #consumeResolve(request) {
    const observation = this.#surface.wakeReceipt(request.scope, request.pending.intentId);
    if (!observation.available || observation.receipt === null) throw new CoreError("wake_receipt_unavailable", 502);
    const receipt = observation.receipt;
    if (receipt.phase === "start_failed" || receipt.phase === "resolve_failed") {
      request.failureCode = typeof receipt.error_code === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(receipt.error_code)
        ? receipt.error_code : null;
      if (receipt.phase === "start_failed") throw new CoreError("wake_start_failed", 409);
      throw new CoreError("wake_resolve_failed", 409);
    }
    if (receipt.phase === "unknown") throw new CoreError("wake_result_unknown", 502);
    if (receipt.phase === "resolved") {
      request.resolvedCount += 1;
      request.pending = null;
      request.state = "waiting";
      return true;
    }
    if (this.#time() >= request.pending.deadlineAt) throw new CoreError("wake_result_unknown", 504);
    return false;
  }

  #rememberResolvedAuthority(request) {
    if (request.pending === null || request.resolvedBeforeInvalidation) return;
    try {
      const observation = this.#surface.wakeReceipt(request.scope, request.pending.intentId);
      if (observation.available && observation.receipt?.phase === "resolved") {
        request.resolvedBeforeInvalidation = true;
      }
    } catch { /* Absence or stale scope remains unknown; never infer resolve. */ }
  }

  async #dispatch(request, intentId) {
    this.#assertCurrent(request);
    const reservation = this.#surface.reserveWakeIntent(request.scope, intentId);
    if (!reservation.accepted) throw new CoreError(reservation.reason, 409);
    request.pending = { intentId, deadlineAt: this.#time() + this.#limits.resultTimeoutMs };
    request.state = "dispatching";
    request.dispatchCount += 1;
    request.attemptedCount += 1;
    request.cleanupOk = null;
    const task = { called: false, settled: false, receipt: null, counted: false, promise: null };
    request.queueTask = task;
    task.promise = Promise.resolve().then(() => {
      this.#assertCurrent(request);
      task.called = true;
      const input = { threadId: request.threadId, intentId, notificationId: randomUUID(), signal: request.controller.signal };
      if (this.#queue.scopeAware === true) input.scope = request.scope;
      return this.#queue(input);
    }).then((value) => { task.receipt = queueReceipt(value); }, () => {
      // 围栏可能在调用sender之前拒绝。此时零调用/无发送资源是已知事实；
      // 进入sender后的异常仍为unknown。已预留intent的去重记录仍保留，不因此自动重试。
      if (!task.called) task.receipt = { queued: false, attempted: false, cleanup_ok: true };
    }).then(() => { task.settled = true; });
    await this.#bounded(request, () => task.promise, this.#limits.queueTimeoutMs, "wake_queue_timeout");
    this.#consumeQueue(request);
    if (task.receipt === null) throw new CoreError("wake_queue_unknown", 502);
    if (!task.receipt.cleanup_ok) throw new CoreError("wake_cleanup_failed", 500);
    if (!task.receipt.queued) throw new CoreError("wake_queue_failed", 502);
    request.queueTask = null;
    request.state = "awaiting_result";
  }

  #consumeQueue(request) {
    const task = request.queueTask;
    if (task === null || !task.settled || task.counted) return;
    task.counted = true;
    request.cleanupOk = task.receipt?.cleanup_ok ?? null;
    if (task.receipt?.queued === true) request.queuedCount += 1;
    if (task.receipt?.attempted === false) request.attemptedCount -= 1;
    // 已settled且没有进入sender，便不存在要等原生回填的通知；surface里的预留去重不撤销。
    if (!task.called) request.pending = null;
  }

  #settledAuthority(request) {
    if (request.cleanupOk !== true) return false;
    if (request.pending === null) return true;
    if (request.resolvedBeforeInvalidation) return true;
    try {
      const observed = this.#surface.wakeReceipt(request.scope, request.pending.intentId);
      return observed.available && observed.receipt?.phase === "resolved";
    } catch { return false; } // 换代后旧回执已清空，不能把 unknown 猜成原生任务已空闲。
  }

  async #cleanup(request) {
    request.controller.abort();
    this.#clearTimeout(request.deadlineTimer);
    const task = request.queueTask;
    if (task !== null && !task.settled) {
      let timer;
      try {
        // 取消后只等待本次 sender 的关闭回执，不能被已经 abort 的信号抢先跳过清理。
        await Promise.race([task.promise, new Promise((resolve) => { timer = this.#timer(resolve, this.#limits.cleanupTimeoutMs); })]);
      } finally { this.#clearTimeout(timer); }
    }
    this.#consumeQueue(request);
    request.done = true;
    // 配对不删除：结束/撤权都不能擦除原生任务里已经读过的私有上下文。
  }

  async #run(request) {
    try {
      while (true) {
        this.#assertCurrent(request);
        if (request.pending !== null && this.#consumeResolve(request)
          && request.dispatchCount >= request.maxNotifications) { this.#cancel(request, "max_notifications"); break; }
        const before = request.pending === null ? null : this.#surface.wakeReceipt(request.scope, request.pending.intentId).receipt;
        const state = await this.#state(request);
        if (request.pending !== null) {
          if (!this.#consumeResolve(request)) {
            const after = this.#surface.wakeReceipt(request.scope, request.pending.intentId).receipt;
            if (before?.phase === "started" && after?.phase === "started" && before.turn_id === after.turn_id
              && state.active_turn_id !== after.turn_id) throw new CoreError("wake_result_unknown", 502);
            await this.#pause(request);
            continue;
          }
        }
        if (request.dispatchCount >= request.maxNotifications) { this.#cancel(request, "max_notifications"); break; }
        request.state = "waiting";
        const claim = await this.#bounded(request, (signal) => this.#surface.call("ai.take_intents", {}, request.trustedScope, { signal }),
          this.#limits.ioTimeoutMs, "wake_io_timeout");
        const result = claim?.body?.result;
        if (claim?.ok !== true || result?.seats_polled !== 1 || !Array.isArray(result.intents)
          || result.intents.length > 1 || (result.failures !== undefined && (!Array.isArray(result.failures) || result.failures.length > 0))) {
          throw new CoreError("wake_protocol_invalid", 502);
        }
        if (result.intents.length === 0) { await this.#pause(request); continue; }
        const intent = result.intents[0];
        if (intent?.accepted !== true || typeof intent.intent_id !== "string" || !INTENT_ID.test(intent.intent_id)) {
          throw new CoreError("wake_protocol_invalid", 502);
        }
        const intentId = intent.intent_id;
        await this.#state(request); // 领取返回后再查 OFF；不把领取 ACK 当作持续资格。
        await this.#dispatch(request, intentId);
      }
    } catch (error) {
      const known = ["model_binding_changed", "model_scope_rejected", "wake_io_timeout", "wake_queue_timeout",
        "wake_queue_unknown", "wake_queue_failed", "wake_cleanup_failed", "wake_protocol_invalid", "wake_receipt_unavailable",
        "wake_start_failed", "wake_resolve_failed", "wake_result_unknown", "wake_intent_already_attempted", "wake_intent_history_full", "wake_clock_invalid"];
      this.#cancel(request, known.includes(error?.code) ? error.code : "wake_result_unknown");
    } finally {
      await this.#cleanup(request);
    }
  }
}

module.exports = { ModelWakeSessionManager, WAKE_LIMITS };
