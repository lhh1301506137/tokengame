"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { setImmediate: immediate } = require("node:timers/promises");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { createCommandServer } = require("../src/authority/command-server.cjs");
const { InProcessCoreClient, HttpCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost, MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");

const QUEUED = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });
const ABORTED = Object.freeze({ queued: false, attempted: true, cleanup_ok: true, reason: "cancelled" });
const requestFields = (extra = {}) => ({ acknowledged: true, request_id: randomUUID(), thread_id: randomUUID(), ...extra });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function until(check, label = "等待本机HTTP/队列屏障") {
  const deadline = Date.now() + 2_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `${label}没有在2秒内发生`);
    await immediate();
  }
}

async function setup(t, { transport = "in_process", ...options } = {}) {
  let at = 1_000_000;
  const now = () => at;
  const surface = new CommandSurface({ now });
  let core = new InProcessCoreClient({ surface });
  let coreServer = null;
  if (transport === "http") {
    coreServer = createCommandServer({ surface, dueWork: false, internalToken: "wake-control-core-local-test" });
    core = new HttpCoreClient({ origin: await coreServer.start({ port: 0 }), token: "wake-control-core-local-test" });
  }
  const calls = [];
  const host = new TableWebHost({ core, now, modelBindingEnabled: true,
    driveIntervalMs: 999_999, sweepIntervalMs: 999_999,
    wakeQueue: async (input) => { calls.push(input); return QUEUED; },
    ...options, wakeOptions: { pollIntervalMs: 2, ...options.wakeOptions },
  });
  const origin = await host.start({ port: 0 });
  let expectedCleanupFailure = false;
  t.after(async () => {
    try {
      if (expectedCleanupFailure) await assert.rejects(host.stop(), { code: "wake_cleanup_failed" });
      else await host.stop();
    } finally { if (coreServer !== null) await coreServer.stop(); }
  });
  const post = async (route, body, headers = {}) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
    });
    return { status: response.status, body: await response.json() };
  };
  const a = (await post("/api/room/create", { player_id: "wake-http-a", table_rules_version: "wake-http-rules" })).body;
  const b = (await post("/api/room/join", { player_id: "wake-http-b", invite_code: a.invite_code })).body;
  assert.ok(a.session_token && b.session_token);
  const action = (seat, command, params = {}) => post("/api/action", { session_token: seat.session_token, command, params });
  for (const seat of [a, b]) assert.equal((await action(seat, "room.confirm_public_scope", { acknowledged: true })).status, 200);
  const bind = (seat) => post("/api/model/bind", { session_token: seat.session_token, acknowledged: true, binding_request_id: randomUUID() });
  const model = (token, command, params = {}) => post("/api/model/command", requestEnvelope(command, params), { [MODEL_COMMAND_TOKEN_HEADER]: token });
  const wake = (seat, actionName, input = {}) => post(`/api/model/wake/${actionName}`, { session_token: seat.session_token, ...input });
  const say = (seat, text) => action(seat, "chat.say", { text, idempotency_key: randomUUID() });
  const scope = (seat) => {
    const session = host.requireSession(seat.session_token);
    return { seat_handle: session.seat_handle, binding_id: host.modelBindings.get(session.seat_handle)?.binding_id };
  };
  const status = (seat) => host.wakeSessions.status(scope(seat));
  return { host, core, surface, origin, post, a, b, calls, action, bind, model, wake, say, scope, status,
    advance: (ms) => { at += ms; }, expectCleanupFailure: () => { expectedCleanupFailure = true; } };
}

for (const transport of ["in_process", "http"]) {
  test(`${transport}+view：实际降低上限、仅本人窗口，未绑定和换绑不泄漏旧窗口或目标任务`, async (t) => {
    const f = await setup(t, { transport, wakeOptions: { maxNotifications: 2, maxDurationMs: 55_000 } });
    const view = async (seat, extra = {}) => {
      const result = await f.post("/api/view", { session_token: seat.session_token, ...extra });
      assert.equal(result.status, 200);
      return result.body.view;
    };
    assert.deepEqual((await view(f.a)).model_wake, {
      enabled: true, target_configured: false,
      limits: { max_notifications: 2, max_duration_ms: 55_000 }, window: null,
    });
    assert.equal((await f.post("/api/view", {})).body.code, "web_session_unknown");
    const aBound = (await f.bind(f.a)).body;
    await f.bind(f.b);
    assert.equal((await view(f.a)).model_wake.window.state, "idle");
    const alteredCopy = f.host.wakeSessions.limits;
    alteredCopy.max_notifications = 200;
    assert.equal(f.host.wakeSessions.limits.max_notifications, 2);
    assert.equal((await f.wake(f.a, "start", requestFields({ max_notifications: 3 }))).body.code, "invalid_field");
    assert.equal((await f.wake(f.a, "start", requestFields({ max_duration_ms: 55_001 }))).body.code, "invalid_field");
    const fields = requestFields();
    const started = await f.wake(f.a, "start", fields);
    assert.equal(started.status, 200);
    assert.equal(started.body.wake.target_configured, false);
    assert.equal(Object.hasOwn(started.body.wake, "thread_id"), false);
    const own = await view(f.a);
    assert.equal(own.model_connection.proactive_wake_verified, false);
    assert.equal(own.model_wake.window.state, "waiting");
    assert.equal(own.model_wake.window.max_notifications, 2);
    assert.equal(own.model_wake.window.max_duration_ms, 55_000);
    assert.equal(own.model_wake.window.request_id, fields.request_id);
    assert.equal(Object.hasOwn(own.model_wake.window, "thread_id"), false);
    const other = await view(f.b, { seat_id: f.a.seat_id, binding_id: aBound.binding_id, request_id: fields.request_id });
    assert.equal(other.model_wake.window.state, "idle");
    assert.equal(other.model_wake.window.request_id, null);
    assert.equal(other.model_wake.window.resolved_count, 0);
    for (const sentinel of [fields.thread_id, aBound.connection.model_token, "thread_id", "model_token", "TOKENGAME_"]) {
      assert.equal(JSON.stringify(own.model_wake).includes(sentinel), false, sentinel);
    }
    assert.equal(JSON.stringify(other.model_wake).includes(fields.request_id), false);
    await f.post("/api/model/unbind", { session_token: f.a.session_token });
    assert.equal((await view(f.a)).model_wake.window, null);
    await f.bind(f.a);
    const rebound = await view(f.a);
    assert.equal(rebound.model_wake.window.state, "idle");
    assert.equal(rebound.model_wake.window.request_id, null);
    assert.equal(f.calls.length, 0, "只读view和无待办窗口不得通知");
  });
}

test("view默认关闭仍报告实际限制；启用绑定和host_seen都不使发送器可用", async (t) => {
  const f = await setup(t, { wakeQueue: null, wakeOptions: { maxNotifications: 1, maxDurationMs: 25_000 } });
  const before = (await f.post("/api/view", { session_token: f.a.session_token })).body.view;
  assert.deepEqual(before.model_wake, { enabled: false, target_configured: false,
    limits: { max_notifications: 1, max_duration_ms: 25_000 }, window: null });
  const bound = (await f.bind(f.a)).body;
  await f.model(bound.connection.model_token, "view.timeline");
  const after = (await f.post("/api/view", { session_token: f.a.session_token })).body.view;
  assert.equal(after.model_connection.state, "host_seen");
  assert.equal(after.model_connection.proactive_wake_verified, false);
  assert.equal(after.model_wake.enabled, false);
  assert.equal(after.model_wake.window.state, "idle");
  assert.equal(after.model_wake.window.reason, "wake_disabled");
  assert.equal(f.calls.length, 0);
});

test("view在异步读取期间撤销授权，最终只读投影不返回旧窗口", async (t) => {
  const f = await setup(t);
  await f.bind(f.a);
  const start = (await f.wake(f.a, "start", requestFields())).body.wake;
  const entered = deferred(); const release = deferred();
  const original = f.core.dispatch.bind(f.core);
  let held = false;
  f.core.dispatch = async (command, params, options) => {
    const result = await original(command, params, options);
    if (!held && command === "view.timeline") { held = true; entered.resolve(); await release.promise; }
    return result;
  };
  const pendingView = f.post("/api/view", { session_token: f.a.session_token });
  try {
    await entered.promise;
    assert.equal((await f.post("/api/model/unbind", { session_token: f.a.session_token })).status, 200);
  } finally { release.resolve(); }
  const final = (await pendingView).body.view;
  assert.equal(final.model_wake.window, null);
  assert.equal(final.model_connection.state, "unbound");
  assert.equal(JSON.stringify(final.model_wake).includes(start.request_id), false);
});

test("通知模块只按精确静态白名单提供，不扩大任意文件读取", async (t) => {
  const f = await setup(t);
  const page = await fetch(`${f.origin}/`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /id="modelWakeTaskField"/);
  assert.match(html, /id="modelWakeFixedTarget" hidden>发送器已固定当前游戏任务，UUID不向页面公开。/);
  const script = await fetch(`${f.origin}/wake-controls.mjs`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /text\/javascript/);
  assert.match(await script.text(), /export class WakeControls/);
  const denied = await fetch(`${f.origin}/model-wake-session.cjs`);
  assert.equal(denied.status, 404);
});

for (const transport of ["in_process", "http"]) {
  test(`${transport}+协调器HTTP：两次通知按实际公开/silent收敛，没有模型白名单扩权`, async (t) => {
    let f;
    let token;
    const notifications = [];
    const modelResults = [];
    f = await setup(t, { transport, wakeQueue: async (input) => {
      notifications.push(input);
      const started = await f.model(token, "ai.start", { intent_id: input.intentId });
      modelResults.push(started);
      if (!started.body.ok) return ABORTED;
      const result = await f.model(token, "ai.resolve", { turn_id: started.body.result.started.turn_id,
        decision: notifications.length === 1 ? "public_speech" : "silent",
        ...(notifications.length === 1 ? { text: "wake-http-real-public" } : {}),
      });
      modelResults.push(result);
      return QUEUED;
    } });
    token = (await f.bind(f.a)).body.connection.model_token;
    const otherToken = (await f.bind(f.b)).body.connection.model_token;
    assert.deepEqual([...f.host.modelSurface.commands].sort(), ["ai.resolve", "ai.start", "ai.take_intents", "view.projection", "view.timeline"]);
    for (const command of ["model.wake.start", "ai.set_mode", "hand.act", "seat.ready", "chat.say"]) {
      assert.equal((await f.model(token, command)).body.code, "command_not_model_facing");
    }
    assert.equal((await f.action(f.a, "ai.start")).body.code, "action_not_permitted");
    assert.equal((await f.say(f.a, "wake-http-first")).status, 200);
    const start = await f.wake(f.a, "start", requestFields({ max_notifications: 2 }));
    assert.equal(start.status, 200, JSON.stringify(start.body));
    await until(() => f.status(f.a).resolved_count === 1);
    assert.equal(notifications.length, 1);
    f.advance(5_001);
    assert.equal((await f.say(f.b, "wake-http-second")).status, 200);
    await until(() => f.status(f.a).state === "stopped");
    const final = await f.wake(f.a, "status");
    assert.equal(final.body.wake.reason, "max_notifications");
    assert.equal(final.body.wake.queued_count, 2);
    assert.equal(final.body.wake.resolved_count, 2);
    assert.equal(notifications.length, 2);
    assert.equal(modelResults.length, 4);
    assert.equal(modelResults.every((entry) => entry.status === 200 && entry.body.ok), true);
    for (const notification of notifications) {
      assert.deepEqual(Object.keys(notification).sort(), ["intentId", "notificationId", "signal", "threadId"]);
      assert.match(notification.notificationId, /^[0-9a-f-]{36}$/);
    }
    assert.notEqual(notifications[0].notificationId, notifications[1].notificationId);
    const timeline = (await f.core.dispatch("view.timeline")).timeline;
    assert.deepEqual(timeline.filter((event) => event.type === "AI_PUBLIC_SPEECH").map((event) => [event.payload.seat_id, event.payload.text]),
      [[f.a.seat_id, "wake-http-real-public"]]);
    const rejected = await f.model(otherToken, "ai.start", { intent_id: notifications[0].intentId });
    assert.equal(rejected.body.ok, false);
    assert.equal((await f.action(f.a, "seat.ready")).body.ok, true);
    assert.equal(final.body.wake.native_turn_state, "unknown");
    assert.equal(final.body.wake.accepted_notifications_retracted, false);
    const serialized = JSON.stringify(final.body);
    for (const secret of [token, otherToken, f.a.session_token, f.b.session_token, ...f.host.custody.knownSecrets]) {
      assert.equal(serialized.includes(secret), false);
    }
    assert.equal(serialized.includes("wake-http-first"), false);
    assert.equal(serialized.includes("model_context"), false);
  });
}

test("HTTP默认关闭需本人会话/现有绑定；model_token不能操控start/status/stop", async (t) => {
  const f = await setup(t, { wakeQueue: null });
  for (const action of ["start", "status", "stop"]) {
    assert.equal((await f.post(`/api/model/wake/${action}`, {})).body.code, "web_session_unknown");
    assert.equal((await f.wake(f.a, action, action === "start" ? requestFields() : {})).body.code, "model_binding_required");
  }
  const bound = (await f.bind(f.a)).body;
  for (const action of ["start", "status", "stop"]) {
    const refused = await f.post(`/api/model/wake/${action}`, { session_token: bound.connection.model_token },
      { [MODEL_COMMAND_TOKEN_HEADER]: bound.connection.model_token });
    assert.equal(refused.body.code, "web_session_unknown");
  }
  assert.equal((await f.wake(f.a, "start", requestFields())).body.code, "wake_disabled");
  assert.equal((await f.wake(f.a, "status")).body.wake.reason, "wake_disabled");
  assert.equal((await f.wake(f.a, "stop")).body.wake.state, "idle");
  assert.equal(f.calls.length, 0);
});

test("HTTP坏输入先拒绝；幂等start、旧stop键和预算响应保持独立", async (t) => {
  const f = await setup(t);
  await f.bind(f.a);
  let claims = 0;
  const dispatch = f.core.dispatch.bind(f.core);
  f.core.dispatch = (command, params, operation) => {
    if (command === "ai.take_intents") claims += 1;
    return dispatch(command, params, operation);
  };
  const invalid = [{ acknowledged: false }, { request_id: null }, { thread_id: "not-a-task" },
    { max_notifications: -1 }, { max_notifications: 5 }, { max_notifications: "2" },
    { max_duration_ms: 600_001 }, { max_duration_ms: 1.2 }, { max_duration_ms: null }, { threadId: randomUUID() }];
  for (const input of invalid) assert.equal((await f.wake(f.a, "start", requestFields(input))).body.code, "invalid_field");
  assert.equal(claims, 0);
  assert.equal((await f.wake(f.a, "status", { request_id: "bad" })).body.code, "invalid_field");
  assert.equal((await f.wake(f.a, "stop", { acknowledged: true })).body.code, "invalid_field");
  assert.equal((await f.wake(f.a, "status", { request_id: randomUUID() })).body.code, "wake_request_unknown");
  const first = requestFields();
  const pair = await Promise.all([f.wake(f.a, "start", first), f.wake(f.a, "start", first)]);
  assert.equal(pair.every((entry) => entry.status === 200), true);
  assert.equal(pair[0].body.wake.request_id, pair[1].body.wake.request_id);
  assert.equal(pair[0].body.wake.max_notifications, 4);
  assert.equal(pair[0].body.wake.max_duration_ms, 600_000);
  assert.equal((await f.wake(f.a, "start", { ...first, max_duration_ms: 20 })).body.code, "wake_request_conflict");
  assert.equal((await f.wake(f.a, "start", requestFields())).body.code, "wake_session_active");
  assert.equal((await f.wake(f.a, "stop")).body.wake.reason, "stopped_by_owner");
  assert.equal((await f.wake(f.a, "start", first)).body.wake.state, "stopped");
  const second = requestFields({ thread_id: first.thread_id });
  assert.equal((await f.wake(f.a, "start", second)).status, 200);
  assert.equal((await f.wake(f.a, "stop", { request_id: first.request_id })).body.wake.request_id, first.request_id);
  assert.equal((await f.wake(f.a, "status")).body.wake.request_id, second.request_id);
  assert.equal((await f.wake(f.a, "status")).body.wake.state, "waiting");
});

test("HTTP固定运营者thread由服务端选择且不回传；页面显式外来ID仍拒绝", async (t) => {
  const threadId = randomUUID();
  const sender = async () => QUEUED;
  sender.selectThread = (candidate) => candidate === undefined
    || (typeof candidate === "string" && candidate.toLowerCase() === threadId)
    ? threadId : null;
  sender.allowsThread = (candidate) => sender.selectThread(candidate) !== null;
  const f = await setup(t, { wakeQueue: sender });
  await f.bind(f.a);
  await f.bind(f.b);
  let claims = 0;
  const dispatch = f.core.dispatch.bind(f.core);
  f.core.dispatch = (command, params, operation) => {
    if (command === "ai.take_intents") claims += 1;
    return dispatch(command, params, operation);
  };
  const projected = (await f.post("/api/view", { session_token: f.a.session_token })).body.view.model_wake;
  assert.equal(projected.target_configured, true);
  assert.equal(JSON.stringify(projected).includes(threadId), false);
  const foreignThread = randomUUID();
  const wrong = await f.wake(f.a, "start", requestFields({ thread_id: foreignThread }));
  assert.equal(wrong.body.code, "wake_thread_not_authorized");
  for (const sentinel of [threadId, foreignThread, "thread_id"]) {
    assert.equal(JSON.stringify(wrong.body).includes(sentinel), false, `错误响应泄漏 ${sentinel}`);
  }
  assert.equal(claims, 0);
  const requestId = randomUUID();
  const started = await f.wake(f.a, "start", { acknowledged: true, request_id: requestId });
  assert.equal(started.status, 200);
  assert.equal(started.body.wake.target_configured, true);
  assert.equal(Object.hasOwn(started.body.wake, "thread_id"), false);
  const status = await f.wake(f.a, "status", { request_id: requestId });
  assert.equal(status.body.wake.target_configured, true);
  assert.equal(Object.hasOwn(status.body.wake, "thread_id"), false);
  const occupied = await f.wake(f.b, "start", requestFields({ thread_id: threadId }));
  assert.equal(occupied.body.code, "wake_thread_in_use");
  assert.equal(JSON.stringify(occupied.body).includes(threadId), false, "占用错误不得回显固定任务");
  assert.equal(JSON.stringify(occupied.body).includes("thread_id"), false);
  const stopped = await f.wake(f.a, "stop");
  assert.equal(stopped.body.wake.target_configured, true);
  assert.equal(Object.hasOwn(stopped.body.wake, "thread_id"), false);
  assert.equal((await f.wake(f.b, "start", requestFields({ thread_id: threadId.toUpperCase() }))).body.code, "wake_thread_in_use");
});

test("HTTP stop不会撤回已queue消息，也不冒充OFF；手动模型晚到仍由原权限判定", async (t) => {
  const f = await setup(t);
  const token = (await f.bind(f.a)).body.connection.model_token;
  await f.say(f.a, "wake-after-stop-source");
  await f.wake(f.a, "start", requestFields());
  await until(() => f.status(f.a).queued_count === 1);
  const result = await f.wake(f.a, "stop");
  assert.equal(result.body.wake.reason, "stopped_by_owner");
  assert.equal(result.body.wake.accepted_notifications_retracted, false);
  assert.equal(result.body.wake.native_turn_state, "unknown");
  const started = await f.model(token, "ai.start", { intent_id: f.calls[0].intentId });
  assert.equal(started.status, 200);
  assert.equal((await f.model(token, "ai.resolve", { turn_id: started.body.result.started.turn_id,
    decision: "public_speech", text: "wake-after-stop-allowed" })).status, 200);
  assert.equal((await f.core.dispatch("view.timeline")).timeline.filter((event) => event.type === "AI_PUBLIC_SPEECH").length, 1);
  assert.equal(f.calls.length, 1);
});

for (const action of ["OFF", "leave", "unbind", "rebind"]) {
  test(`HTTP ${action}在await前停止后续通知，已接收通知不能伪称撤回`, async (t) => {
    let signal;
    let queued = 0;
    const f = await setup(t, { wakeQueue: ({ signal: incoming }) => {
      queued += 1;
      signal = incoming;
      return new Promise((resolve) => incoming.addEventListener("abort", () => resolve(ABORTED), { once: true }));
    } });
    const old = (await f.bind(f.a)).body;
    await f.say(f.a, `wake-${action}-race`);
    await f.wake(f.a, "start", requestFields());
    await until(() => signal !== undefined);
    let response;
    if (action === "OFF") response = await f.action(f.a, "ai.set_mode", { mode: "OFF" });
    else if (action === "leave") response = await f.action(f.a, "seat.leave");
    else if (action === "unbind") response = await f.post("/api/model/unbind", { session_token: f.a.session_token });
    else response = await f.bind(f.a);
    assert.equal(response.status, 200);
    assert.equal(signal.aborted, true);
    assert.equal(queued, 1);
    if (action === "OFF") {
      assert.equal((await f.wake(f.a, "status")).body.wake.reason, "seat_ai_off");
      assert.equal((await f.model(old.connection.model_token, "view.projection")).status, 200);
    } else {
      assert.equal((await f.model(old.connection.model_token, "view.projection")).status, 403);
    }
    assert.equal((await f.core.dispatch("view.timeline")).timeline.some((event) => event.type === "AI_PUBLIC_SPEECH"), false);
  });
}

test("HTTP OFF在核心响应仍被屏障挡住时已经abort，不等下一轮view.seat", async (t) => {
  let signal;
  const f = await setup(t, { wakeQueue: ({ signal: incoming }) => {
    signal = incoming;
    return new Promise((resolve) => incoming.addEventListener("abort", () => resolve(ABORTED), { once: true }));
  } });
  await f.bind(f.a);
  await f.say(f.a, "wake-held-off");
  await f.wake(f.a, "start", requestFields());
  await until(() => signal !== undefined);
  const release = deferred();
  let reached = false;
  const dispatch = f.core.dispatch.bind(f.core);
  f.core.dispatch = async (command, params, operation) => {
    if (command === "ai.set_mode") { reached = true; await release.promise; }
    return dispatch(command, params, operation);
  };
  const off = f.action(f.a, "ai.set_mode", { mode: "OFF" });
  try {
    await until(() => reached);
    assert.equal(signal.aborted, true);
    assert.equal((await f.core.dispatch("view.seat", { seat_id: f.a.seat_id })).ai.mode, "ON", "权威OFF尚未执行");
  } finally { release.resolve(); }
  assert.equal((await off).status, 200);
});

test("HTTP停止围住已领但延迟返回的intent；CoreClient operation.signal不进入协议params", async (t) => {
  const f = await setup(t, { transport: "http" });
  await f.bind(f.a);
  await f.say(f.a, "wake-held-http-claim");
  const release = deferred();
  let signal;
  const dispatch = f.core.dispatch.bind(f.core);
  f.core.dispatch = async (command, params, operation) => {
    const result = await dispatch(command, params, operation);
    if (command === "ai.take_intents") {
      assert.equal(params.signal, undefined);
      signal = operation.signal;
      await release.promise;
    }
    return result;
  };
  await f.wake(f.a, "start", requestFields());
  try {
    await until(() => signal !== undefined);
    const stopped = await f.wake(f.a, "stop");
    assert.equal(stopped.status, 200);
    assert.equal(signal.aborted, true);
    assert.equal(stopped.body.wake.attempted_count, 0);
  } finally { release.resolve(); }
  await immediate();
  assert.equal(f.calls.length, 0);
  assert.equal(f.host.modelSurface.trackedCount, 0);
});

test("host.stop同步abort并等待sender清理，正常退出无需放大既有5秒门", async (t) => {
  const release = deferred();
  let signal;
  const f = await setup(t, { wakeQueue: ({ signal: incoming }) => { signal = incoming; return release.promise; } });
  await f.bind(f.a);
  await f.say(f.a, "wake-host-stop");
  await f.wake(f.a, "start", requestFields());
  await until(() => signal !== undefined);
  const at = Date.now();
  let returned = false;
  const stopping = f.host.stop().then(() => { returned = true; });
  assert.equal(signal.aborted, true);
  await immediate();
  assert.equal(returned, false);
  release.resolve(QUEUED);
  await stopping;
  assert.ok(Date.now() - at < 1_000);
  const stopped = f.status(f.a);
  assert.equal(stopped.reason, "host_stopped");
  assert.equal(stopped.cleanup_ok, true);
  assert.equal(stopped.queued_count, 1, "取消前已被接受的queue事实仍保留");
  assert.equal(stopped.accepted_notifications_retracted, false);
});

test("host.stop保留cleanup失败事实且关掉自己的HTTP服务，不静默成功", async (t) => {
  const f = await setup(t, { wakeQueue: async () => ({ ...QUEUED, cleanup_ok: false }) });
  f.expectCleanupFailure();
  await f.bind(f.a);
  await f.say(f.a, "wake-cleanup-failure");
  await f.wake(f.a, "start", requestFields());
  await until(() => f.status(f.a).state === "stopped");
  assert.equal(f.status(f.a).reason, "wake_cleanup_failed");
  await assert.rejects(f.host.stop(), { code: "wake_cleanup_failed" });
  assert.equal(f.host.server.listening, false);
});
