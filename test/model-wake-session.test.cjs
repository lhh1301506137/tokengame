"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { SeatCustody } = require("../src/host/seat-custody.cjs");
const { ModelCommandSurface } = require("../src/host/model-command-surface.cjs");
const { ModelWakeSessionManager, WAKE_LIMITS } = require("../src/host/model-wake-session.cjs");

const QUEUED = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });
const ABORTED = Object.freeze({ queued: false, attempted: true, cleanup_ok: true, reason: "cancelled" });
const optionsForStart = (extra = {}) => ({ acknowledged: true, request_id: randomUUID(), thread_id: randomUUID(), ...extra });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

class Clock {
  at = 1_000_000;
  timers = new Set();
  now = () => this.at;
  setTimeout = (fn, ms) => {
    const timer = { fn, at: this.at + ms, unref() {} };
    this.timers.add(timer);
    return timer;
  };
  clearTimeout = (timer) => { this.timers.delete(timer); };
  async flush() { for (let i = 0; i < 160; i += 1) await Promise.resolve(); }
  async advance(ms) {
    this.at += ms;
    for (let i = 0; i < 100; i += 1) {
      const due = [...this.timers].filter((timer) => timer.at <= this.at);
      for (const timer of due) if (this.timers.delete(timer)) timer.fn();
      await this.flush();
      if (![...this.timers].some((timer) => timer.at <= this.at)) return;
    }
    assert.fail("测试定时器出现无界重复调度");
  }
}

// 调度时间可控，核心的真实意图、领取租约、start/resolve 和公开账不替身。
async function fixture(t, options = {}) {
  const clock = new Clock();
  const authority = new CommandSurface({ now: clock.now });
  const core = new InProcessCoreClient({ surface: authority });
  const custody = new SeatCustody();
  const bindings = new Map();
  const calls = [];
  const receipts = [];
  let requestHook = null;
  let stateHook = null;
  const request = async (command, params, operation) => {
    try {
      const result = await core.dispatch(command, params, operation);
      return { ok: true, status: 200, body: { ok: true, result } };
    } catch (error) { return { ok: false, status: error.status ?? 400, body: { ok: false, code: error.code } }; }
  };
  const surface = new ModelCommandSurface({ custody,
    request: (command, params, operation) => requestHook === null ? request(command, params, operation)
      : requestHook(request, command, params, operation),
    scopeIsCurrent: ({ seat_handle, binding_id }) => bindings.get(seat_handle) === binding_id,
    onWakeReceipt: options.onWakeReceipt ?? ((entry) => receipts.push(entry)),
    ...(options.maxWakeReceipts === undefined ? {} : { maxWakeReceipts: options.maxWakeReceipts }),
    ...(options.maxWakeAttempts === undefined ? {} : { maxWakeAttempts: options.maxWakeAttempts }),
  });
  const created = await core.dispatch("room.create", { player_id: "wake-player-a", table_rules_version: "wake-test-rules" });
  const a = custody.bindFromResult(created);
  const joined = await core.dispatch("room.join", { player_id: "wake-player-b", invite_code: created.invite_code });
  const b = custody.bindFromResult(joined);
  for (const seat of [a, b]) {
    bindings.set(seat.seat_handle, `binding-${randomUUID()}`);
    await core.dispatch("room.confirm_public_scope", custody.inject("room.confirm_public_scope", { seat_handle: seat.seat_handle, acknowledged: true }));
    await core.dispatch("seat.connect", custody.inject("seat.connect", { seat_handle: seat.seat_handle, connection_id: randomUUID() }));
  }
  const scopeFor = (seat) => ({ seat_handle: seat.seat_handle, binding_id: bindings.get(seat.seat_handle) });
  const readState = async (trustedScope, operation) => {
    const { seat_id } = custody.resolve(trustedScope.seat_handle);
    const { ai } = await core.dispatch("view.seat", { seat_id }, operation);
    return { mode: ai.mode, active_turn_id: ai.active_turn_id };
  };
  const managers = [];
  const makeManager = (extra = {}) => {
    const manager = new ModelWakeSessionManager({ modelSurface: surface,
      readState: (scope, operation) => stateHook === null ? readState(scope, operation) : stateHook(readState, scope, operation),
      wakeQueue: async (input) => { calls.push(input); return QUEUED; },
      now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, pollIntervalMs: 10,
      ...extra,
    });
    managers.push(manager);
    return manager;
  };
  const manager = makeManager(options.manager);
  t.after(async () => {
    const closing = managers.map((entry) => entry.close());
    await clock.flush();
    await clock.advance(WAKE_LIMITS.cleanupTimeoutMs);
    await Promise.all(closing);
    assert.equal(clock.timers.size, 0, "只创建本次任务定时器，并在关闭时清空");
  });
  const scope = scopeFor(a);
  const action = (command, params = {}, seat = a) => core.dispatch(command, custody.inject(command, { seat_handle: seat.seat_handle, ...params }));
  const say = (text, seat = a) => action("chat.say", { text, idempotency_key: randomUUID() }, seat);
  const model = (command, params = {}, trustedScope = scope) => surface.call(command, params, trustedScope);
  return { clock, authority, core, custody, surface, manager, calls, receipts, a, b, scope, scopeFor,
    bindings, makeManager, action, say, model,
    setRequestHook: (hook) => { requestHook = hook; }, setStateHook: (hook) => { stateHook = hook; },
    start: (extra) => manager.start(scope, optionsForStart(extra)),
    status: () => manager.status(scope),
  };
}

test("真实权威：公开+silent终态才释放单槽，等待中多来源只合并最新一项", async (t) => {
  const f = await fixture(t);
  await f.say("wake-initial");
  f.start({ max_notifications: 2 });
  await f.clock.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.status().state, "awaiting_result");
  assert.equal(f.status().resolved_count, 0);
  const first = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  assert.equal(first.ok, true);
  await f.say("wake-merged-middle");
  await f.say("wake-merged-final");
  await f.clock.advance(5_001);
  assert.equal(f.calls.length, 1, "queue ACK 和 pending 合并都不能变成第二次唤醒");
  assert.equal((await f.model("ai.resolve", { turn_id: first.body.result.started.turn_id, decision: "public_speech", text: "wake-ai-public" })).ok, true);
  await f.clock.advance(10);
  assert.equal(f.calls.length, 2);
  assert.notEqual(f.calls[0].intentId, f.calls[1].intentId);
  const second = await f.model("ai.start", { intent_id: f.calls[1].intentId });
  assert.equal(second.ok, true);
  assert.equal(second.body.result.model_context.source_event.payload.text, "wake-merged-final");
  assert.equal((await f.model("ai.resolve", { turn_id: second.body.result.started.turn_id, decision: "silent" })).ok, true);
  await f.clock.advance(10);
  assert.equal(f.status().reason, "max_notifications");
  assert.equal(f.status().queued_count, 2);
  assert.equal(f.status().resolved_count, 2);
  const timeline = (await f.core.dispatch("view.timeline")).timeline;
  assert.deepEqual(timeline.filter((event) => event.type === "AI_PUBLIC_SPEECH").map((event) => event.payload.text), ["wake-ai-public"]);
  assert.equal(f.status().native_turn_state, "unknown");
  assert.equal(f.status().accepted_notifications_retracted, false);
});

test("真实扑克事件也可领取：不依赖某条真人聊天作为自动通知触发源", async (t) => {
  const f = await fixture(t);
  await f.action("seat.ready");
  await f.action("seat.ready", {}, f.b);
  await f.core.dispatch("hand.evaluate_start");
  await f.clock.advance(3_500);
  assert.equal((await f.core.dispatch("hand.start_if_due")).started, true);
  f.start({ max_notifications: 1 });
  await f.clock.flush();
  assert.equal(f.calls.length, 1);
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  assert.equal(started.ok, true);
  assert.notEqual(started.body.result.model_context.source_event.source_event_type, "PLAYER_PUBLIC_SPEECH");
  assert.match(started.body.result.model_context.source_event.source_event_id, /^engine-/);
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  await f.clock.advance(10);
  assert.equal(f.status().resolved_count, 1);
});

test("start/resolve在queue ACK之前完成：回执保留且只结清精确的intent→turn", async (t) => {
  const f = await fixture(t);
  const ack = deferred();
  const calls = [];
  const manager = f.makeManager({ wakeQueue: async (input) => { calls.push(input); return ack.promise; } });
  await f.say("wake-fast-resolve");
  manager.start(f.scope, optionsForStart({ max_notifications: 1 }));
  await f.clock.flush();
  assert.equal(calls.length, 1);
  const started = await f.model("ai.start", { intent_id: calls[0].intentId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  assert.equal(manager.status(f.scope).resolved_count, 0, "尚未拿到本次sender清理事实");
  ack.resolve(QUEUED);
  await f.clock.flush();
  assert.equal(manager.status(f.scope).resolved_count, 1);
  assert.equal(manager.status(f.scope).reason, "max_notifications");
  assert.equal(calls.length, 1);
});

test("ACK成功后无模型回填：不重复领取/发通知，等到终态上限后unknown停止", async (t) => {
  const f = await fixture(t, { manager: { resultTimeoutMs: 80 } });
  await f.say("wake-no-resolve");
  f.start();
  await f.clock.flush();
  assert.equal(f.calls.length, 1);
  const initialId = f.calls[0].intentId;
  await f.say("wake-wait-more-events");
  await f.clock.advance(79);
  assert.equal(f.calls.length, 1);
  assert.equal(f.status().pending_intent_id, initialId);
  await f.clock.advance(10);
  assert.equal(f.status().reason, "wake_result_unknown");
  assert.equal(f.status().resolved_count, 0);
  assert.equal(f.calls.length, 1);
});

test("只有模型面见证的精确resolve算终态：绕过观察账的权威成功不伪造silent", async (t) => {
  const f = await fixture(t);
  await f.say("wake-missing-observer");
  f.start();
  await f.clock.flush();
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  await f.action("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  await f.clock.advance(10);
  assert.equal(f.status().reason, "wake_result_unknown");
  assert.equal(f.status().resolved_count, 0);
});

test("ai.resolve业务拒绝不当作终态；仍活跃的权威回合和通知计数各自如实", async (t) => {
  const f = await fixture(t);
  await f.say("wake-invalid-decision");
  f.start();
  await f.clock.flush();
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  const turnId = started.body.result.started.turn_id;
  const refused = await f.model("ai.resolve", { turn_id: turnId, decision: "invalid-decision" });
  assert.equal(refused.ok, false);
  assert.equal((await f.core.dispatch("view.seat", { seat_id: f.a.seat_id })).ai.active_turn_id, turnId);
  await f.clock.advance(10);
  assert.equal(f.status().reason, "wake_resolve_failed");
  assert.equal(f.status().failure_code, refused.body.code);
  assert.equal(f.status().resolved_count, 0);
  assert.equal((await f.model("ai.resolve", { turn_id: turnId, decision: "silent" })).ok, true, "观察失败不改变原模型命令权限");
});

test("ai.start业务拒绝保守停止；收到错误不自动回填silent", async (t) => {
  const f = await fixture(t);
  await f.say("wake-start-failure");
  f.start();
  await f.clock.flush();
  await f.clock.advance(30_001);
  await f.action("ai.take_intents"); // 另一宿主在权威侧续领，同一旧ID的本地claim令牌已过代。
  const refused = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  assert.equal(refused.ok, false);
  assert.equal(refused.body.code, "intent_claim_superseded");
  await f.clock.advance(10);
  assert.equal(f.status().reason, "wake_start_failed");
  assert.equal(f.status().failure_code, "intent_claim_superseded");
  assert.equal(f.status().resolved_count, 0);
});

test("自动通知失败回执只保留稳定错误码，不透传上游详情或自由文本", async (t) => {
  const f = await fixture(t);
  await f.say("wake-start-private-error");
  f.start();
  await f.clock.flush();
  const intentId = f.calls[0].intentId;
  f.setRequestHook(async (request, command, params, operation) => command === "ai.start"
    ? { ok: false, status: 409, body: { code: "secret failure text", details: { private: "canary-private-detail" } } }
    : request(command, params, operation));
  assert.equal((await f.model("ai.start", { intent_id: intentId })).ok, false);
  await f.clock.advance(10);
  const status = f.status();
  assert.equal(status.reason, "wake_start_failed");
  assert.equal(Object.hasOwn(status, "failure_code"), false);
  const receipt = f.surface.wakeReceipt(f.surface.captureScope(f.scope), intentId).receipt;
  assert.deepEqual(receipt, { intent_id: intentId, turn_id: null, phase: "start_failed", error_code: null });
  assert.equal(JSON.stringify({ status, receipt }).includes("canary-private-detail"), false);
  assert.equal(JSON.stringify({ status, receipt }).includes("secret failure text"), false);
});

for (const shape of ["missing-start", "missing-resolve", "wrong-turn"]) {
  test(`权威成功响应的回执缺失/错配（${shape}）不释放槽`, async (t) => {
    const f = await fixture(t);
    await f.say(`wake-malformed-${shape}`);
    f.start();
    await f.clock.flush();
    f.setRequestHook(async (request, command, params, operation) => {
      const result = await request(command, params, operation);
      if (command === "ai.start" && shape === "missing-start") result.body.result.started = {};
      if (command === "ai.resolve") result.body.result.resolved = shape === "wrong-turn" ? { turn_id: "turn-other" } : {};
      return result;
    });
    const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
    assert.equal(started.ok, true, "旁路观察不会篡改业务返回");
    if (shape !== "missing-start") {
      assert.equal((await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" })).ok, true);
    }
    await f.clock.advance(10);
    assert.equal(f.status().reason, shape === "missing-start" ? "wake_result_unknown" : "wake_resolve_failed");
    assert.equal(f.status().resolved_count, 0);
    assert.equal(f.calls.length, 1);
  });
}

for (const receipt of [null, {}, { ...QUEUED, attempted: false }, { ...QUEUED, cleanup_ok: "yes" },
  { queued: false, attempted: false, cleanup_ok: true, reason: "secret-sender-error" }, { ...QUEUED, cleanup_ok: false }]) {
  test(`sender回执严格解读，错误正文不进入状态：${JSON.stringify(receipt)}`, async (t) => {
    const f = await fixture(t);
    const manager = f.makeManager({ wakeQueue: async () => receipt });
    await f.say("wake-queue-malformed");
    manager.start(f.scope, optionsForStart());
    await f.clock.flush();
    const state = manager.status(f.scope);
    assert.equal(state.state, "stopped");
    assert.equal(state.resolved_count, 0);
    const refused = receipt?.queued === false && receipt?.cleanup_ok === true;
    const cleanupFailed = receipt?.cleanup_ok === false;
    assert.equal(state.reason, refused ? "wake_queue_failed" : cleanupFailed ? "wake_cleanup_failed" : "wake_queue_unknown");
    assert.equal(state.cleanup_ok, refused ? true : cleanupFailed ? false : null);
    if (refused) assert.equal(state.attempted_count, 0);
    assert.equal(JSON.stringify(state).includes("secret-sender-error"), false);
  });
}

test("surface参数校验拒绝也停止本意图；另一席的错误不能污染本席回执", async (t) => {
  const f = await fixture(t);
  await f.say("wake-scoped-failure");
  f.start();
  await f.clock.flush();
  const intentId = f.calls[0].intentId;
  await assert.rejects(f.model("ai.start", { intent_id: intentId }, f.scopeFor(f.b)), { code: "authority_id_scope_mismatch" });
  assert.equal(f.surface.wakeReceipt(f.surface.captureScope(f.scope), intentId).receipt.phase, "claimed");
  await assert.rejects(f.model("ai.start", { intent_id: intentId, seat_id: f.a.seat_id }), { code: "seat_identity_not_model_supplied" });
  await f.clock.advance(10);
  assert.equal(f.status().reason, "wake_start_failed");
  assert.equal(f.status().failure_code, "seat_identity_not_model_supplied");
});

test("停止/重开和管理器重建共享去重：claim续期后同intent也不重投", async (t) => {
  const f = await fixture(t);
  await f.say("wake-restart-dedup");
  const start = optionsForStart();
  f.manager.start(f.scope, start);
  await f.clock.flush();
  const first = f.calls[0].intentId;
  assert.equal((await f.manager.stop(f.scope)).state, "stopped");
  assert.equal(f.manager.start(f.scope, start).state, "stopped", "原键仅回放");
  await f.clock.advance(30_001);
  const other = f.makeManager();
  assert.throws(() => other.start(f.scope, optionsForStart({ thread_id: start.thread_id })), { code: "wake_result_pending" });
  const renewed = (await f.model("ai.take_intents")).body.result.intents[0];
  assert.equal(renewed.intent_id, first);
  assert.deepEqual(f.surface.reserveWakeIntent(f.surface.captureScope(f.scope), first),
    { accepted: false, reason: "wake_intent_already_attempted" });
  const begun = await f.model("ai.start", { intent_id: first });
  await f.model("ai.resolve", { turn_id: begun.body.result.started.turn_id, decision: "silent" });
  other.start(f.scope, optionsForStart({ thread_id: start.thread_id }));
  await f.clock.flush();
  assert.equal(other.status(f.scope).state, "waiting");
  assert.equal(f.calls.length, 1);
  assert.equal(f.surface.wakeReceipt(f.surface.captureScope(f.scope), first).receipt.phase, "resolved");
  assert.equal(f.surface.reserveWakeIntent(f.surface.captureScope(f.scope), first).reason, "wake_intent_already_attempted");
});

test("ACK后stop再来新事件：新键/新thread都不能绕过未决单槽", async (t) => {
  const f = await fixture(t);
  await f.say("wake-window-slot-first");
  const first = optionsForStart();
  f.manager.start(f.scope, first);
  await f.clock.flush();
  assert.equal(f.status().queued_count, 1);
  await f.manager.stop(f.scope);
  await f.say("wake-window-slot-new-source");
  await f.clock.advance(30_001);
  for (const threadId of [first.thread_id, randomUUID()]) {
    assert.throws(() => f.start({ thread_id: threadId }), { code: "wake_result_pending" });
  }
  assert.equal(f.calls.length, 1);
});

for (const cleanupOk of [true, false]) {
  test(`撤权重绑并重建固定发送器不能绕过旧窗口事实（cleanup=${cleanupOk}）`, async (t) => {
    const f = await fixture(t);
    const notifications = [];
    const firstThread = randomUUID();
    const firstSender = async (input) => {
      notifications.push(input);
      return { ...QUEUED, cleanup_ok: cleanupOk };
    };
    firstSender.allowsThread = (candidate) => candidate === firstThread;
    const firstManager = f.makeManager({ wakeQueue: firstSender });
    await f.say("wake-rebound-old-unsettled");
    firstManager.start(f.scope, optionsForStart({ thread_id: firstThread }));
    await f.clock.flush();
    assert.equal(notifications.length, 1);
    await firstManager.stop(f.scope);

    // 旧权限被撤销后，同一席位使用新绑定、新窗口和另一个明确固定的发送器。
    // 这是管理器边界测试，不模拟 beta 在运行中更改操作者的固定 thread 配置。
    f.surface.invalidateHandle(f.a.seat_handle);
    f.bindings.set(f.a.seat_handle, `binding-${randomUUID()}`);
    const reboundScope = f.scopeFor(f.a);
    const nextThread = randomUUID();
    const nextSender = async (input) => { notifications.push(input); return QUEUED; };
    nextSender.allowsThread = (candidate) => candidate === nextThread;
    const nextManager = f.makeManager({ wakeQueue: nextSender });
    await f.clock.advance(30_001);
    let refused = null;
    try { nextManager.start(reboundScope, optionsForStart({ thread_id: nextThread })); }
    catch (error) { refused = error.code; }
    await f.clock.flush();
    assert.deepEqual({ refused, notifications: notifications.length }, {
      refused: cleanupOk ? "wake_result_pending" : "wake_cleanup_failed", notifications: 1,
    });
  });
}

test("撤权前已观察精确resolve的干净窗口仍可在新绑定中显式重开", async (t) => {
  const f = await fixture(t);
  await f.say("wake-rebound-settled");
  f.start({ max_notifications: 1 });
  await f.clock.flush();
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  await f.clock.advance(10);
  assert.equal(f.status().resolved_count, 1);
  f.surface.invalidateHandle(f.a.seat_handle);
  f.bindings.set(f.a.seat_handle, `binding-${randomUUID()}`);
  const reboundScope = f.scopeFor(f.a);
  f.manager.start(reboundScope, optionsForStart());
  await f.clock.flush();
  assert.equal(f.manager.status(reboundScope).state, "waiting");
  assert.equal(f.calls.length, 1);
});

test("queue ACK在途时已精确resolve，撤权清空surface后仍按已结清而非永久pending", async (t) => {
  const f = await fixture(t);
  const ack = deferred();
  const notifications = [];
  const threadId = randomUUID();
  const sender = async (input) => { notifications.push(input); return ack.promise; };
  sender.allowsThread = (candidate) => candidate === threadId;
  const manager = f.makeManager({ wakeQueue: sender });

  await f.say("wake-resolved-before-revoke-and-queue-ack");
  manager.start(f.scope, optionsForStart({ thread_id: threadId, max_notifications: 1 }));
  await f.clock.flush();
  assert.equal(notifications.length, 1);
  const started = await f.model("ai.start", { intent_id: notifications[0].intentId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });

  // Match TableWebHost ordering: stopHandle is initiated synchronously, then
  // the binding generation and its surface receipts are invalidated before the
  // queue sender has returned its acceptance receipt.
  const stopping = manager.stopHandle(f.a.seat_handle);
  f.surface.invalidateHandle(f.a.seat_handle);
  f.bindings.set(f.a.seat_handle, `binding-${randomUUID()}`);
  ack.resolve(QUEUED);
  await f.clock.flush();
  await stopping;

  const reboundScope = f.scopeFor(f.a);
  assert.doesNotThrow(() => manager.start(reboundScope, optionsForStart({ thread_id: threadId })));
  await f.clock.flush();
  assert.equal(manager.status(reboundScope).state, "waiting");
  assert.equal(notifications.length, 1, "旧intent已结清且没有新待办，不能重复通知");
});

test("同一thread配对不借给另一席：运行中、停止未resolve、已resolve均拒绝", async (t) => {
  const f = await fixture(t);
  await f.say("wake-thread-affinity");
  const start = optionsForStart();
  f.manager.start(f.scope, start);
  await f.clock.flush();
  const otherScope = f.scopeFor(f.b);
  const takeover = () => f.manager.start(otherScope, optionsForStart({ thread_id: start.thread_id.toUpperCase() }));
  assert.throws(takeover, { code: "wake_thread_in_use" });
  await f.manager.stop(f.scope);
  assert.throws(takeover, { code: "wake_thread_in_use" });
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  assert.throws(takeover, { code: "wake_thread_in_use" }, "resolve不是擦除原生任务私有上下文");
  f.manager.start(f.scope, optionsForStart({ thread_id: start.thread_id }));
  await f.clock.flush();
  assert.equal(f.status().state, "waiting", "原handle仍可本人明确重开");
});

test("请求历史和thread配对都有上限，满额不逐出旧键/旧配对", async (t) => {
  const f = await fixture(t, { manager: { maxRequests: 2, maxThreadBindings: 2 } });
  const first = optionsForStart();
  f.manager.start(f.scope, first);
  await f.manager.stop(f.scope);
  f.start();
  await f.manager.stop(f.scope);
  assert.throws(() => f.start(), { code: "wake_history_full" });
  assert.equal(f.manager.start(f.scope, first).state, "stopped");
  assert.throws(() => f.manager.start(f.scopeFor(f.b), optionsForStart()), { code: "wake_thread_history_full" });
  assert.throws(() => f.manager.start(f.scopeFor(f.b), optionsForStart({ thread_id: first.thread_id })), { code: "wake_thread_in_use" });
});

test("去重满额失败关闭，已尝试事实不靠逐出复活", async (t) => {
  const f = await fixture(t, { maxWakeAttempts: 1 });
  await f.say("wake-attempt-limit-first");
  f.start();
  await f.clock.flush();
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  await f.clock.advance(5_001);
  await f.say("wake-attempt-limit-second");
  await f.clock.advance(10);
  assert.equal(f.status().reason, "wake_intent_history_full");
  assert.equal(f.calls.length, 1);
});

test("回执仅存最小ID/阶段，副本不可改权威观察账，撤权换代清空", async (t) => {
  const f = await fixture(t);
  await f.say("wake-private-context-canary");
  f.start({ max_notifications: 1 });
  await f.clock.flush();
  const intentId = f.calls[0].intentId;
  const captured = f.surface.captureScope(f.scope);
  const claimed = f.surface.wakeReceipt(captured, intentId);
  claimed.receipt.phase = "resolved";
  assert.equal(f.surface.wakeReceipt(captured, intentId).receipt.phase, "claimed");
  const started = await f.model("ai.start", { intent_id: intentId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "public_speech", text: "wake-private-result-canary" });
  await f.clock.advance(10);
  for (const entry of f.receipts) {
    assert.deepEqual(Object.keys(entry).sort(), ["intent_id", "phase", "turn_id"]);
    assert.equal(Object.isFrozen(entry), true);
  }
  const observable = JSON.stringify({ receipts: f.receipts, status: f.status(), surface: f.surface });
  for (const canary of ["wake-private-context-canary", "wake-private-result-canary", f.a.seat_handle,
    ...f.custody.knownSecrets]) assert.equal(observable.includes(canary), false);
  f.surface.invalidateHandle(f.a.seat_handle);
  const newScope = f.surface.captureScope(f.scope);
  assert.deepEqual(f.surface.wakeReceipt(newScope, intentId), { available: true, receipt: null });
  assert.throws(() => f.surface.wakeReceipt(captured, intentId), { code: "model_binding_changed" });
});

for (const asynchronous of [false, true]) {
  test(`观察异常不改变模型/权威结果，但自动通知失败关闭（async=${asynchronous}）`, async (t) => {
    const f = await fixture(t, { onWakeReceipt: () => {
      if (asynchronous) return Promise.reject(new Error("observer failure"));
      throw new Error("observer failure");
    } });
    await f.say("wake-observer-error");
    const claim = await f.model("ai.take_intents");
    assert.equal(claim.ok, true);
    const intentId = claim.body.result.intents[0].intent_id;
    const started = await f.model("ai.start", { intent_id: intentId });
    assert.equal(started.ok, true);
    assert.equal((await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" })).ok, true);
    await f.clock.advance(5_001);
    await f.say("wake-observer-error-second");
    f.start();
    await f.clock.flush();
    assert.equal(f.status().reason, "wake_receipt_unavailable");
    assert.equal(f.calls.length, 0);
  });
}

test("回执历史满额不能丢旧条目继续通知；普通模型命令仍可执行", async (t) => {
  const f = await fixture(t, { maxWakeReceipts: 1 });
  await f.say("wake-receipt-limit-one");
  const claimed = await f.model("ai.take_intents");
  const firstId = claimed.body.result.intents[0].intent_id;
  const started = await f.model("ai.start", { intent_id: firstId });
  await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  await f.clock.advance(5_001);
  await f.say("wake-receipt-limit-two");
  f.start();
  await f.clock.flush();
  assert.equal(f.status().reason, "wake_receipt_unavailable");
  assert.equal(f.calls.length, 0);
  assert.equal(f.surface.wakeReceipt(f.surface.captureScope(f.scope), firstId).receipt.phase, "resolved");
  await f.clock.advance(30_001);
  const second = (await f.model("ai.take_intents")).body.result.intents[0];
  assert.equal((await f.model("ai.start", { intent_id: second.intent_id })).ok, true);
});

test("停止发生在领取await中：同步取消、迟到领取不登记/不投递", async (t) => {
  const f = await fixture(t);
  const release = deferred();
  let signal;
  f.setRequestHook(async (request, command, params, operation) => {
    const result = await request(command, params, operation);
    if (command === "ai.take_intents") { signal = operation.signal; await release.promise; }
    return result;
  });
  await f.say("wake-held-claim");
  f.start();
  await f.clock.flush();
  assert.ok(signal);
  const stopped = f.manager.stop(f.scope);
  assert.equal(signal.aborted, true);
  await stopped;
  release.resolve();
  await f.clock.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.surface.trackedCount, 0);
});

test("领取响应await后换代：旧manager不回填旧scope，也不投递旧intent", async (t) => {
  const f = await fixture(t);
  const release = deferred();
  let reached = false;
  f.setRequestHook(async (request, command, params, operation) => {
    const result = await request(command, params, operation);
    if (command === "ai.take_intents") { reached = true; await release.promise; }
    return result;
  });
  await f.say("wake-generation-race");
  f.start();
  await f.clock.flush();
  assert.equal(reached, true);
  f.surface.invalidateHandle(f.a.seat_handle);
  release.resolve();
  await f.clock.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.surface.trackedCount, 0);
  assert.equal(f.clock.timers.size, 0);
});

test("stop等待本次sender关闭回执，不抢跑cleanup；只取消自己的signal", async (t) => {
  const f = await fixture(t);
  const closing = deferred();
  let signal;
  const manager = f.makeManager({ wakeQueue: ({ signal: incoming }) => { signal = incoming; return closing.promise; } });
  await f.say("wake-queue-cancel");
  manager.start(f.scope, optionsForStart());
  await f.clock.flush();
  let returned = false;
  const stopped = manager.stop(f.scope).then((result) => { returned = true; return result; });
  assert.equal(signal.aborted, true);
  await f.clock.flush();
  assert.equal(returned, false);
  assert.equal(manager.status(f.scope).cleanup_pending, true);
  closing.resolve(ABORTED);
  const result = await stopped;
  assert.equal(result.cleanup_ok, true);
  assert.equal(result.cleanup_pending, false);
  assert.equal(result.queued_count, 0);
  assert.equal(result.accepted_notifications_retracted, false);
});

test("不响应abort的sender也只等有界清理；unknown不写成cleanup成功", async (t) => {
  const f = await fixture(t);
  const manager = f.makeManager({ wakeQueue: () => new Promise(() => {}), cleanupTimeoutMs: 20 });
  await f.say("wake-stuck-sender");
  manager.start(f.scope, optionsForStart());
  await f.clock.flush();
  const stopped = manager.stop(f.scope);
  await f.clock.flush();
  await f.clock.advance(20);
  const result = await stopped;
  assert.equal(result.cleanup_ok, null);
  assert.equal(result.cleanup_pending, false);
  assert.throws(() => manager.start(f.scope, optionsForStart()), { code: "wake_cleanup_failed" });
  assert.equal((await manager.close()).cleanup_ok, false);
});

test("I/O和queue各有上限，计时到期会abort且不发后续通知", async (t) => {
  for (const boundary of ["state", "queue"]) {
    const f = await fixture(t);
    let signal;
    if (boundary === "state") f.setStateHook((_read, _scope, operation) => {
      signal = operation.signal; return new Promise(() => {});
    });
    const manager = f.makeManager({ ioTimeoutMs: 20, queueTimeoutMs: 20, cleanupTimeoutMs: 10,
      wakeQueue: ({ signal: incoming }) => {
        signal = incoming;
        return new Promise((resolve) => incoming.addEventListener("abort", () => resolve(ABORTED), { once: true }));
      },
    });
    await f.say(`wake-${boundary}-timeout`);
    manager.start(f.scope, optionsForStart());
    await f.clock.flush();
    await f.clock.advance(20);
    assert.equal(signal.aborted, true);
    assert.equal(manager.status(f.scope).reason, boundary === "state" ? "wake_io_timeout" : "wake_queue_timeout");
    assert.equal(manager.status(f.scope).cleanup_ok, true);
  }
});

test("窗口时长上限覆盖空等和在途通知，OFF独立由权威阻止公开", async (t) => {
  const f = await fixture(t);
  f.start({ max_duration_ms: 30 });
  await f.clock.flush();
  await f.clock.advance(30);
  assert.equal(f.status().reason, "max_duration");
  assert.equal(f.calls.length, 0);
  await f.say("wake-off-after-queue");
  f.start();
  await f.clock.flush();
  const started = await f.model("ai.start", { intent_id: f.calls[0].intentId });
  await f.action("ai.set_mode", { mode: "OFF" });
  await f.clock.advance(10);
  assert.equal(f.status().reason, "seat_ai_off");
  const resolved = await f.model("ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "public_speech", text: "must-not-publish" });
  assert.equal(resolved.body.result.resolved.reason, "seat_ai_off");
  assert.equal((await f.core.dispatch("view.timeline")).timeline.some((event) => event.type === "AI_PUBLIC_SPEECH"), false);
});

test("预留意图后、调用sender前到达上限：已知零调用与干净收尾不可写成unknown", async (t) => {
  const f = await fixture(t);
  const reserve = f.surface.reserveWakeIntent.bind(f.surface);
  f.surface.reserveWakeIntent = (scope, intentId) => {
    const result = reserve(scope, intentId);
    f.clock.at += 30;
    return result;
  };
  await f.say("wake-deadline-before-sender");
  f.start({ max_duration_ms: 30 });
  await f.clock.flush();
  const status = f.status();
  assert.equal(f.calls.length, 0, "时间围栏在真实sender调用之前触发");
  assert.deepEqual({ reason: status.reason, attempted: status.attempted_count,
    queued: status.queued_count, cleanup: status.cleanup_ok, cleanupPending: status.cleanup_pending }, {
    reason: "max_duration", attempted: 0, queued: 0, cleanup: true, cleanupPending: false,
  });
  assert.equal(status.pending_intent_id, null, "未发通知不制造永久未决的原生请求");
  const claimed = f.receipts.find((entry) => entry.phase === "claimed");
  assert.deepEqual(reserve(f.surface.captureScope(f.scope), claimed.intent_id), {
    accepted: false, reason: "wake_intent_already_attempted",
  }, "清除未发送通知的槽不撤销已预留intent去重");
  f.surface.reserveWakeIntent = reserve;
  assert.equal(f.start().state, "waiting", "真人仍可显式创建下一窗口");
  await f.clock.flush();
  await f.clock.advance(30_001);
  assert.equal(f.status().reason, "wake_intent_already_attempted");
  assert.equal(f.calls.length, 0, "claim续领也不得自动重投同一预留intent");
});

for (const kind of ["NaN", "Infinity", "rollback", "throw"]) {
  test(`坏时钟${kind}失败关闭，仍报告有限elapsed并abort`, async (t) => {
    const f = await fixture(t);
    let at = 100;
    const manager = f.makeManager({ now: () => { if (kind === "throw" && at !== 100) throw new Error("clock"); return at; } });
    manager.start(f.scope, optionsForStart());
    await f.clock.flush();
    at = kind === "NaN" ? NaN : kind === "Infinity" ? Infinity : 99;
    const status = manager.status(f.scope);
    assert.equal(status.reason, "wake_clock_invalid");
    assert.equal(Number.isFinite(status.elapsed_ms), true);
    await f.clock.flush();
    assert.equal(f.calls.length, 0);
    assert.equal(f.clock.timers.size, 0);
  });
}

test("默认disabled；UUID/预算/确认/固定thread验证在领取之前，旧stop键不影响新窗口", async (t) => {
  const f = await fixture(t);
  const disabled = f.makeManager({ wakeQueue: null });
  assert.throws(() => disabled.start(f.scope, optionsForStart()), { code: "wake_disabled" });
  const invalid = [{ acknowledged: false }, { request_id: "bad" }, { thread_id: "bad" },
    { max_notifications: 0 }, { max_notifications: 5 }, { max_notifications: 1.5 },
    { max_duration_ms: 0 }, { max_duration_ms: 600_001 }, { max_duration_ms: "5" }, { injected: "bad" }];
  for (const extra of invalid) assert.throws(() => f.manager.start(f.scope, optionsForStart(extra)), { code: "invalid_field" });
  const threadId = randomUUID();
  const sender = async () => QUEUED;
  sender.allowsThread = (value) => value === threadId;
  const restricted = f.makeManager({ wakeQueue: sender });
  assert.throws(() => restricted.start(f.scope, optionsForStart()), { code: "wake_thread_not_authorized" });
  const first = optionsForStart({ thread_id: threadId.toUpperCase() });
  const firstResult = restricted.start(f.scope, first);
  assert.equal(firstResult.thread_id, threadId);
  assert.equal(firstResult.max_notifications, 4);
  assert.equal(firstResult.max_duration_ms, 600_000);
  assert.throws(() => restricted.start(f.scope, { ...first, max_notifications: 3 }), { code: "wake_request_conflict" });
  await restricted.stop(f.scope);
  const second = optionsForStart({ thread_id: threadId });
  restricted.start(f.scope, second);
  await restricted.stop(f.scope, first.request_id);
  assert.equal(restricted.status(f.scope).state, "waiting");
  assert.equal(restricted.status(f.scope).request_id, second.request_id);
  assert.throws(() => restricted.start(f.scope, optionsForStart({ thread_id: threadId })), { code: "wake_session_active" });
  assert.equal(f.calls.length, 0);
});

test("固定sender可在服务端选择唯一目标；旧queue仍要求真人显式UUID", async (t) => {
  const f = await fixture(t);
  assert.equal(f.manager.targetConfigured, false);
  assert.throws(() => f.manager.start(f.scope, optionsForStart({ thread_id: undefined })),
    (error) => error.code === "invalid_field" && error.details?.field === "thread_id");

  const fixedThread = randomUUID();
  const calls = [];
  const fixedSender = async (input) => { calls.push(input); return QUEUED; };
  fixedSender.selectThread = (candidate) => candidate === undefined
    || (typeof candidate === "string" && candidate.toLowerCase() === fixedThread)
    ? fixedThread : null;
  fixedSender.allowsThread = (candidate) => fixedSender.selectThread(candidate) !== null;
  const fixed = f.makeManager({ wakeQueue: fixedSender });
  assert.equal(fixed.targetConfigured, true);
  const requestId = randomUUID();
  const started = fixed.start(f.scope, { acknowledged: true, request_id: requestId, max_notifications: 1 });
  assert.equal(started.request_id, requestId);
  assert.equal(started.thread_id, fixedThread);
  assert.throws(() => fixed.start(f.scope, optionsForStart({ thread_id: randomUUID() })),
    { code: "wake_thread_not_authorized" });
  await fixed.stop(f.scope, requestId);
  assert.equal(calls.length, 0, "没有权威来源时不会仅因选中固定任务而通知");

  const malformed = async () => QUEUED;
  malformed.selectThread = () => "not-a-task";
  const failClosed = f.makeManager({ wakeQueue: malformed });
  assert.equal(failClosed.targetConfigured, false);
  assert.throws(() => failClosed.start(f.scope, { acknowledged: true, request_id: randomUUID() }),
    (error) => error.code === "invalid_field" && error.details?.field === "thread_id");
});

test("scope-aware sender 只按本绑定选目标，并在通知时收到协调器捕获的 scope", async (t) => {
  const f = await fixture(t);
  const fixedThread = randomUUID();
  const observed = [];
  const sender = async (input) => { observed.push({ phase: "queue", input }); return QUEUED; };
  Object.defineProperties(sender, {
    scopeAware: { value: true },
    selectThread: { value: (candidate, scope) => {
      observed.push({ phase: "select", scope });
      return candidate === undefined && scope?.bindingId === f.scope.binding_id ? fixedThread : null;
    } },
    targetConfigured: { value: (scope) => scope?.bindingId === f.scope.binding_id },
  });
  const manager = f.makeManager({ wakeQueue: sender });
  assert.equal(manager.targetConfigured, false, "无绑定上下文的全局状态不能替远端席位猜目标");
  assert.equal(manager.targetConfiguredFor(f.scope), true);
  await f.say("scope-aware-wake");
  manager.start(f.scope, { acknowledged: true, request_id: randomUUID(), max_notifications: 1 });
  await f.clock.flush();
  const queuedCall = observed.find((entry) => entry.phase === "queue")?.input;
  const scopedSelection = observed.find((entry) => entry.phase === "select" && entry.scope !== undefined)?.scope;
  assert.equal(queuedCall.threadId, fixedThread);
  assert.deepEqual(queuedCall.scope, scopedSelection);
  assert.equal(queuedCall.scope.handle, f.a.seat_handle);
  assert.equal(queuedCall.scope.bindingId, f.scope.binding_id);
});
