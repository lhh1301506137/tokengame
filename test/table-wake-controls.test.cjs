"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const moduleReady = import("../web/table/wake-controls.mjs");

const THREAD = "16b00000-0000-4000-8000-000000000001";
const OTHER_THREAD = "16b00000-0000-4000-8000-000000000002";
const LIMITS = Object.freeze({ max_notifications: 2, max_duration_ms: 600_000 });
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const error = (code) => Object.assign(new Error(code), { code });
const idle = () => ({ state: "idle", reason: null, request_id: null, attempted_count: 0,
  queued_count: 0, resolved_count: 0, cleanup_ok: true, cleanup_pending: false });
function windowFor(input, changes = {}) {
  return { state: "waiting", reason: null, request_id: input.request_id,
    max_notifications: input.max_notifications, max_duration_ms: input.max_duration_ms, elapsed_ms: 0,
    attempted_count: 0, queued_count: 0, resolved_count: 0, cleanup_ok: true, cleanup_pending: false,
    pending_intent_id: null, native_turn_state: "unknown", accepted_notifications_retracted: false, ...changes };
}
function viewFor({ binding = "binding-a", mode = "ON", enabled = true, targetConfigured = undefined,
  window = idle(), limits = LIMITS, confirmed = true, leaving = false, sessionSeat = "seat-a" } = {}) {
  return { viewer_seat_id: sessionSeat, seats: [{ seat_id: sessionSeat, is_viewer: true,
    public_scope_confirmed: confirmed, leave_requested: leaving, ai: { mode } }],
  model_connection: { state: binding === null ? "unbound" : "host_seen", binding_id: binding,
    seat_id: sessionSeat, proactive_wake_verified: false },
  model_wake: { enabled, ...(targetConfigured === undefined ? {} : { target_configured: targetConfigured }),
    limits: { ...limits }, window: binding === null ? null : window } };
}

async function fixture({ handler, view = viewFor(), makeRequestId } = {}) {
  const { WakeControls } = await moduleReady;
  const calls = [];
  let serverWindow = null;
  let generated = 0;
  let fences = 0;
  const defaultReply = (route, body) => {
    if (route.endsWith("/start")) serverWindow ??= windowFor(body);
    else if (serverWindow === null || serverWindow.request_id !== body.request_id) throw error("wake_request_unknown");
    else if (route.endsWith("/stop")) serverWindow = { ...serverWindow, state: "stopped", reason: "stopped_by_owner" };
    return { ok: true, wake: { ...serverWindow,
      ...(view.model_wake?.target_configured === undefined ? {} : { target_configured: view.model_wake.target_configured }) } };
  };
  const ui = new WakeControls({
    request: async (route, body, options) => {
      calls.push({ route, body: structuredClone(body), signal: options.signal });
      return handler ? handler({ route, body, options, calls, reply: () => defaultReply(route, body) }) : defaultReply(route, body);
    },
    makeRequestId: makeRequestId ?? (() => { generated += 1; return randomUUID(); }),
    onFence: () => { fences += 1; },
  });
  ui.setSession("test-session-a");
  const apply = (nextView = view) => ui.acceptView(ui.viewTicket(), nextView);
  apply();
  const ready = ({ thread = THREAD, notifications = "2", duration = "60" } = {}) => {
    ui.setField("threadId", thread);
    ui.setField("maxNotifications", notifications);
    ui.setField("durationSeconds", duration);
    ui.setConsent(true);
  };
  return { ui, calls, apply, ready, generated: () => generated, fences: () => fences,
    server: () => serverWindow, setServer: (value) => { serverWindow = value; } };
}

test("默认关闭、未绑定、OFF和未确认范围均零通知，不把配置或host_seen当能力验证", async () => {
  for (const [view, expected] of [[viewFor({ enabled: false }), "unavailable"],
    [viewFor({ binding: null }), "unbound"], [viewFor({ mode: "OFF" }), "off"],
    [viewFor({ confirmed: false }), "blocked"], [viewFor({ leaving: true }), "blocked"]]) {
    const f = await fixture({ view });
    f.ready();
    assert.equal(f.ui.snapshot().ui_state, expected);
    assert.equal(await f.ui.start(), false);
    assert.equal(f.calls.length, 0);
    assert.equal(f.generated(), 0);
  }
  const f = await fixture();
  assert.equal(f.ui.snapshot().ui_state, "idle");
  assert.equal(f.calls.length, 0);
  assert.equal(Object.hasOwn(f.ui.visibleState(), "proactive_wake_verified"), false);
});

test("缺失或非法能力投影失败关闭，包括不能被正则强转通过的缺失reason", async (t) => {
  const mutations = [
    ["整个能力缺失", (v) => { delete v.model_wake; }],
    ["enabled缺失", (v) => { delete v.model_wake.enabled; }],
    ["enabled字符串", (v) => { v.model_wake.enabled = "true"; }],
    ["固定目标布尔值畸形", (v) => { v.model_wake.target_configured = "true"; }],
    ["limits缺失", (v) => { delete v.model_wake.limits; }],
    ["通知上限为零", (v) => { v.model_wake.limits.max_notifications = 0; }],
    ["时长上限小数", (v) => { v.model_wake.limits.max_duration_ms = 0.5; }],
    ["上限非安全整数", (v) => { v.model_wake.limits.max_duration_ms = Number.MAX_SAFE_INTEGER + 1; }],
    ["窗口缺失", (v) => { delete v.model_wake.window; }],
    ["绑定却无窗口", (v) => { v.model_wake.window = null; }],
    ["未知窗口状态", (v) => { v.model_wake.window.state = "running"; }],
    ["reason缺失", (v) => { delete v.model_wake.window.reason; }],
    ["reason数字", (v) => { v.model_wake.window.reason = 1; }],
    ["失败码含自由文本", (v) => { v.model_wake.window.failure_code = "bad failure text"; }],
    ["请求编号缺失", (v) => { delete v.model_wake.window.request_id; }],
    ["尝试计数缺失", (v) => { delete v.model_wake.window.attempted_count; }],
    ["计数字符串", (v) => { v.model_wake.window.queued_count = "0"; }],
    ["resolve大于接收", (v) => { v.model_wake.window.resolved_count = 1; }],
    ["清理状态缺失", (v) => { delete v.model_wake.window.cleanup_ok; }],
    ["清理等待缺失", (v) => { delete v.model_wake.window.cleanup_pending; }],
    ["窗口泄漏任务UUID", (v) => { v.model_wake.window.thread_id = THREAD; }],
    ["无本人座位", (v) => { v.seats = []; }],
    ["两个本人座位", (v) => { v.seats.push({ ...v.seats[0] }); }],
    ["连接错席", (v) => { v.model_connection.seat_id = "seat-other"; }],
    ["连接未知状态", (v) => { v.model_connection.state = "connected"; }],
    ["绑定编号缺失", (v) => { delete v.model_connection.binding_id; }],
    ["AI未知状态", (v) => { v.seats[0].ai.mode = "MAYBE"; }],
  ];
  for (const [label, mutate] of mutations) await t.test(label, async () => {
    const view = viewFor(); mutate(view);
    const f = await fixture({ view }); f.ready();
    assert.equal(f.ui.snapshot().ui_state, "invalid");
    assert.equal(f.ui.snapshot().can_start, false);
    await f.ui.start();
    assert.equal(f.calls.length, 0);
  });
});

test("启动失败展示受限业务错误码，不接受详情或自由文本", async () => {
  const stopped = windowFor({ request_id: randomUUID(), thread_id: THREAD, max_notifications: 1,
    max_duration_ms: 60_000 }, { state: "stopped", reason: "wake_start_failed", attempted_count: 1,
    queued_count: 1, failure_code: "intent_not_found" });
  const f = await fixture({ view: viewFor({ window: stopped }) });
  assert.match(f.ui.snapshot().status_text, /牌局上下文已经推进.*intent_not_found/);
  assert.equal(f.ui.visibleState().window.failure_code, "intent_not_found");
  assert.equal(JSON.stringify(f.ui.visibleState()).includes("details"), false);
});

test("输入只使用实际降低上限，持续时长支持小于60秒乃至1ms", async () => {
  for (const duration of [1, 59, 550]) {
    const f = await fixture({ view: viewFor({ limits: { max_notifications: 1, max_duration_ms: duration } }) });
    assert.equal(f.ui.snapshot().fields.durationSeconds, String(duration / 1000));
    f.ready({ notifications: "1", duration: String(duration / 1000) });
    assert.equal(f.ui.snapshot().can_start, true);
    assert.equal(await f.ui.start(), true);
    assert.equal(f.calls[0].body.max_duration_ms, duration);
    assert.equal(f.calls[0].body.max_notifications, 1);
    assert.equal(f.calls[0].body.thread_id, THREAD, "缺失固定目标投影时保留旧手填兼容路径");
    await f.ui.stop();
    f.ready({ notifications: "2", duration: String(duration / 1000) });
    assert.equal(f.ui.snapshot().can_start, false);
    f.ready({ notifications: "1", duration: String((duration + 1) / 1000) });
    assert.equal(f.ui.snapshot().can_start, false);
  }
});

test("发送器固定目标时页面不接收UUID，开启请求完全省略thread_id", async () => {
  const f = await fixture({ view: viewFor({ targetConfigured: true }) });
  const before = f.ui.snapshot();
  assert.equal(before.target_configured, true);
  assert.equal(before.fields.threadId, "");
  assert.doesNotMatch(before.validation, /UUID|请输入/);
  f.ui.setField("threadId", OTHER_THREAD);
  f.ready({ thread: OTHER_THREAD, notifications: "1", duration: "60" });
  assert.equal(f.ui.snapshot().fields.threadId, "", "页面代码也不能替换服务端固定目标");
  assert.equal(f.ui.snapshot().can_start, true);
  assert.equal(await f.ui.start(), true);
  assert.equal(Object.hasOwn(f.calls[0].body, "thread_id"), false);
  assert.equal(f.ui.visibleState().target_configured, true);
});

test("固定目标投影或响应畸形时失败关闭，不回退到页面手填", async (t) => {
  for (const [label, mutate] of [
    ["响应缺少固定目标标记", (reply) => { delete reply.wake.target_configured; }],
    ["响应固定目标标记畸形", (reply) => { reply.wake.target_configured = "true"; }],
    ["响应伪装成手填目标", (reply) => { reply.wake.target_configured = false; }],
    ["响应泄漏目标UUID", (reply) => { reply.wake.thread_id = THREAD; }],
  ]) await t.test(label, async () => {
    const f = await fixture({ view: viewFor({ targetConfigured: true }), handler: ({ reply }) => {
      const result = reply(); mutate(result); return result;
    } });
    f.ready({ notifications: "1" });
    assert.equal(await f.ui.start(), false);
    assert.equal(f.ui.snapshot().ui_state, "start_unknown");
    assert.equal(Object.hasOwn(f.calls[0].body, "thread_id"), false);
  });
});

test("参数合法不等于同意；改参数或成功后新开窗口都必须重新勾选", async () => {
  const f = await fixture();
  f.ready(); f.ui.setConsent(false);
  assert.equal(await f.ui.start(), false);
  f.ui.setConsent(true); f.ui.setField("durationSeconds", "61");
  assert.equal(f.ui.snapshot().consent, false);
  f.ui.setConsent(true);
  assert.equal(await f.ui.start(), true);
  assert.equal(f.ui.snapshot().consent, false);
  assert.equal(f.ui.snapshot().can_start, false);
  await f.ui.stop();
  assert.equal(f.ui.snapshot().editable, true);
  assert.equal(f.ui.snapshot().can_start, false);
  assert.equal(f.calls.filter((c) => c.route.endsWith("/start")).length, 1);
});

test("重复点击只生成一个不可变UUID和参数；没有乐观running或stopped", async (t) => {
  const startGate = deferred(); const stopGate = deferred();
  t.after(() => { startGate.resolve(); stopGate.resolve(); });
  const f = await fixture({ handler: ({ route, reply }) => route.endsWith("/start")
    ? startGate.promise.then(reply) : stopGate.promise.then(reply) });
  f.ready();
  const pendingStart = f.ui.start();
  assert.equal(f.ui.snapshot().ui_state, "starting");
  assert.equal(f.ui.snapshot().window, null, "本次请求尚无权威回执");
  const duplicate = f.ui.start();
  // 先断言已发请求数量，再等待第二个Promise；防双击变异不能把测试悬成未评估。
  assert.equal(f.calls.length, 1);
  assert.equal(await duplicate, false);
  f.ui.setField("threadId", OTHER_THREAD); f.ui.setField("maxNotifications", "1");
  assert.equal(f.ui.snapshot().fields.threadId, THREAD);
  assert.equal(f.calls.length, 1); assert.equal(f.generated(), 1);
  startGate.resolve(); await pendingStart;
  assert.equal(f.ui.snapshot().ui_state, "waiting");
  const pendingStop = f.ui.stop();
  assert.equal(f.ui.snapshot().ui_state, "stopping");
  assert.equal(f.ui.snapshot().window.state, "waiting");
  assert.equal(await f.ui.stop(), false);
  stopGate.resolve(); await pendingStop;
  assert.equal(f.ui.snapshot().ui_state, "stopped");
  assert.equal(f.calls.length, 2);
});

test("开启结果丢失后无自动请求；显式status未知才同键同参数重试start", async () => {
  let first = true;
  const f = await fixture({ handler: ({ route, reply }) => {
    if (route.endsWith("/start") && first) { first = false; throw new Error("lost-response"); }
    return reply();
  } });
  f.ready(); assert.equal(await f.ui.start(), false);
  assert.equal(f.ui.snapshot().ui_state, "start_unknown");
  f.ui.setField("durationSeconds", "99"); f.ui.setField("threadId", OTHER_THREAD);
  assert.equal(f.ui.snapshot().fields.durationSeconds, "60");
  f.apply(viewFor());
  assert.equal(f.ui.snapshot().ui_state, "start_unknown", "轮询idle不是服务端未接收的证明");
  assert.equal(f.calls.length, 1); assert.equal(f.generated(), 1);
  assert.equal(await f.ui.retry(), true);
  assert.deepEqual(f.calls.map((c) => c.route.split("/").at(-1)), ["start", "status", "start"]);
  assert.deepEqual(f.calls[0].body, f.calls[2].body);
  assert.equal(f.generated(), 1);
  assert.equal(f.ui.snapshot().ui_state, "waiting");
});

test("已接收但丢ACK的开启，status找到原窗口后不再start", async () => {
  let first = true;
  const f = await fixture({ handler: ({ route, reply }) => {
    const result = reply();
    if (route.endsWith("/start") && first) { first = false; throw new Error("lost-after-accept"); }
    return result;
  } });
  f.ready(); await f.ui.start();
  assert.equal(f.ui.snapshot().ui_state, "start_unknown");
  assert.equal(await f.ui.retry(), true);
  assert.deepEqual(f.calls.map((c) => c.route.split("/").at(-1)), ["start", "status"]);
  assert.equal(f.ui.snapshot().consent, false);
});

test("上一窗口2次已结清后新开启未知，不把旧原因计数时长显示成本次回执", async (t) => {
  const previous = windowFor({ request_id: randomUUID(), thread_id: THREAD, max_notifications: 2,
    max_duration_ms: 60_000 }, { state: "stopped", reason: "max_notifications", attempted_count: 2,
    queued_count: 2, resolved_count: 2, elapsed_ms: 3210 });
  const gate = deferred();
  t.after(() => gate.resolve({ ok: false }));
  const f = await fixture({ view: viewFor({ window: previous }), handler: ({ route }) => {
    if (route.endsWith("/start")) return gate.promise;
    throw error("wake_request_unknown");
  } });
  assert.match(f.ui.snapshot().status_text, /已到通知次数上限/);
  assert.match(f.ui.snapshot().counts_text, /已接收 2.*权威已结清 2/);
  f.ready(); const pending = f.ui.start();
  const requestId = f.calls[0].body.request_id;
  assert.notEqual(requestId, previous.request_id);
  const noOldReceipt = () => {
    const display = f.ui.snapshot();
    assert.equal(display.window, null);
    assert.equal(f.ui.visibleState().window, null, "机器采样与可见状态同义");
    assert.doesNotMatch(display.status_text, /已到通知次数上限/);
    assert.equal(display.counts_text, "尚无本席窗口回执。");
    assert.doesNotMatch(display.timing_text, /3\.21/);
    assert.equal(display.cleanup_text, "");
  };
  assert.equal(f.ui.snapshot().ui_state, "starting"); noOldReceipt();
  gate.reject(new Error("lost-next-start")); assert.equal(await pending, false);
  assert.equal(f.ui.snapshot().ui_state, "start_unknown"); noOldReceipt();
  f.apply(viewFor({ window: previous }));
  assert.equal(f.ui.snapshot().ui_state, "start_unknown"); noOldReceipt();
  await f.ui.stop();
  assert.equal(f.calls[1].body.request_id, requestId, "保留内部原请求目标，不去停止上一窗口");
  assert.equal(f.ui.snapshot().ui_state, "stop_unknown"); noOldReceipt();
  await f.ui.retry();
  assert.deepEqual(f.calls.map((c) => c.route.split("/").at(-1)), ["start", "stop", "status"]);
});

test("既有view轮询可核对原请求但不能凭另一窗口或改参窗口确认成功", async () => {
  const f = await fixture({ handler: () => { throw new Error("lost"); } });
  f.ready(); await f.ui.start();
  const expected = windowFor(f.calls[0].body);
  f.apply(viewFor({ window: { ...expected, request_id: randomUUID() } }));
  assert.equal(f.ui.snapshot().ui_state, "start_unknown");
  f.apply(viewFor({ window: { ...expected, max_notifications: 1 } }));
  assert.equal(f.ui.snapshot().ui_state, "start_unknown");
  f.apply(viewFor({ window: expected }));
  assert.equal(f.ui.snapshot().ui_state, "waiting");
  assert.equal(f.ui.snapshot().consent, false);
  assert.equal(f.calls.length, 1);
});

test("确定拒绝允许修正参数但不复用同意，也不自动创建新请求", async () => {
  const f = await fixture({ handler: () => { throw error("wake_thread_not_authorized"); } });
  f.ready(); await f.ui.start();
  assert.equal(f.ui.snapshot().ui_state, "idle");
  assert.equal(f.ui.snapshot().can_retry, false);
  assert.equal(f.ui.snapshot().consent, false);
  assert.match(f.ui.snapshot().error, /不能通知任意任务/);
  assert.equal(f.calls.length, 1);
});

test("畸形start回执不冒充成功，保留原请求而不是再生成UUID", async (t) => {
  const cases = [
    ["未知状态", (r) => { r.wake.state = "RUNNING"; }],
    ["错请求ID", (r) => { r.wake.request_id = randomUUID(); }],
    ["改参", (r) => { r.wake.max_notifications = 1; }],
    ["响应泄漏任务UUID", (r) => { r.wake.thread_id = OTHER_THREAD; }],
    ["ok缺失", (r) => { delete r.ok; }],
    ["reason缺失", (r) => { delete r.wake.reason; }],
    ["原生回合完成伪声明", (r) => { r.wake.native_turn_state = "idle"; }],
    ["已接收工作撤回伪声明", (r) => { r.wake.accepted_notifications_retracted = true; }],
  ];
  for (const [label, change] of cases) await t.test(label, async () => {
    const f = await fixture({ handler: ({ reply }) => { const result = reply(); change(result); return result; } });
    f.ready(); assert.equal(await f.ui.start(), false);
    assert.equal(f.ui.snapshot().ui_state, "start_unknown");
    assert.equal(f.ui.snapshot().can_start, false);
    assert.equal(f.ui.snapshot().can_retry, true);
    assert.equal(f.generated(), 1);
  });
});

test("停止响应未知时保持未知，晚到的权威stopped可核对；不乐观确认", async () => {
  const f = await fixture({ handler: ({ route, reply }) => {
    const result = reply();
    if (route.endsWith("/stop")) throw new Error("lost-stop-response");
    return result;
  } });
  f.ready(); await f.ui.start();
  assert.equal(await f.ui.stop(), false);
  assert.equal(f.ui.snapshot().ui_state, "stop_unknown");
  assert.equal(f.ui.snapshot().window.state, "waiting");
  assert.equal(f.ui.snapshot().can_start, false);
  f.apply(viewFor({ window: f.server() }));
  assert.equal(f.ui.snapshot().ui_state, "stopped");
  assert.equal(f.calls.length, 2);
});

test("未知开启后请求停止，此后的显式重试也绝不再start", async () => {
  const f = await fixture({ handler: ({ route }) => {
    if (route.endsWith("/start")) throw new Error("lost-start");
    throw error("wake_request_unknown");
  } });
  f.ready(); await f.ui.start();
  assert.equal(f.ui.snapshot().can_stop, true);
  await f.ui.stop();
  assert.equal(f.ui.snapshot().ui_state, "stop_unknown");
  assert.match(f.ui.snapshot().retry_text, /停止原窗口/);
  await f.ui.retry(); await f.ui.retry();
  assert.deepEqual(f.calls.map((c) => c.route.split("/").at(-1)), ["start", "stop", "status", "status"]);
  assert.equal(f.generated(), 1);
  assert.equal(f.ui.snapshot().can_start, false);
});

test("停止结果未知但status仍活动时，重试只对原UUID停止", async () => {
  let first = true;
  const f = await fixture({ handler: ({ route, reply }) => {
    if (route.endsWith("/stop") && first) { first = false; throw new Error("lost-before-stop"); }
    return reply();
  } });
  f.ready(); await f.ui.start(); await f.ui.stop();
  assert.equal(await f.ui.retry(), true);
  assert.deepEqual(f.calls.map((c) => c.route.split("/").at(-1)), ["start", "stop", "status", "stop"]);
  assert.equal(f.calls.every((c) => c.body.request_id === f.calls[0].body.request_id), true);
});

test("命令前和命令期间的旧poll都不能覆盖开启/停止的新回执", async () => {
  const gate = deferred();
  const f = await fixture({ handler: ({ route, reply }) => route.endsWith("/stop") ? gate.promise.then(reply) : reply() });
  const preStart = f.ui.viewTicket();
  f.ready(); await f.ui.start();
  assert.equal(f.ui.acceptView(preStart, viewFor()), false);
  const preStop = f.ui.viewTicket();
  const waiting = f.server();
  const pending = f.ui.stop();
  const duringStop = f.ui.viewTicket();
  gate.resolve(); await pending;
  assert.equal(f.ui.acceptView(preStop, viewFor({ window: waiting })), false);
  assert.equal(f.ui.acceptView(duringStop, viewFor({ window: waiting })), false);
  assert.equal(f.ui.snapshot().ui_state, "stopped");
  assert.ok(f.fences() >= 4);
});

test("已有停止状态不被同请求较旧waiting、接收或resolve计数倒退覆盖", async () => {
  const f = await fixture(); f.ready(); await f.ui.start();
  const waiting = f.server();
  const resolved = { ...waiting, state: "stopped", reason: "max_notifications", attempted_count: 2, queued_count: 2, resolved_count: 2 };
  f.apply(viewFor({ window: resolved }));
  f.apply(viewFor({ window: waiting }));
  assert.equal(f.ui.snapshot().ui_state, "stopped");
  assert.equal(f.ui.snapshot().window.resolved_count, 2);
});

test("本地撤销/离桌/换绑/OFF先隔离在途成功，晚到结果不能恢复表单或窗口", async (t) => {
  for (const reason of ["正在撤销", "正在离桌", "正在换绑", "正在关闭AI"]) await t.test(reason, async () => {
    const gate = deferred();
    const f = await fixture({ handler: ({ reply }) => gate.promise.then(reply) });
    f.ready(); const pending = f.ui.start();
    const oldPoll = f.ui.viewTicket();
    const ticket = f.ui.pause(reason);
    assert.equal(f.calls[0].signal.aborted, true);
    assert.equal(f.ui.snapshot().ui_state, "blocked");
    assert.equal(f.ui.snapshot().fields.threadId, "");
    gate.resolve(); assert.equal(await pending, false);
    assert.equal(f.ui.snapshot().ui_state, "blocked");
    f.ui.resume(ticket);
    f.apply(viewFor({ binding: null }));
    assert.equal(f.ui.snapshot().ui_state, "unbound");
    assert.equal(f.ui.acceptView(oldPoll, viewFor({ window: f.server() })), false);
    assert.equal(f.ui.visibleState().window, null);
    assert.equal(f.ui.snapshot().consent, false);
  });
});

test("服务端换绑、OFF、公开撤权、错席投影也能隔离已发请求的迟到成功", async (t) => {
  for (const [label, view, state] of [["换绑", viewFor({ binding: "binding-new" }), "idle"],
    ["OFF", viewFor({ mode: "OFF" }), "off"], ["撤公开范围", viewFor({ confirmed: false }), "blocked"],
    ["错席", { ...viewFor(), viewer_seat_id: "seat-other" }, "invalid"]]) await t.test(label, async () => {
    const gate = deferred();
    const f = await fixture({ handler: ({ reply }) => gate.promise.then(reply) });
    f.ready(); const pending = f.ui.start();
    f.apply(view);
    gate.resolve(); assert.equal(await pending, false);
    assert.equal(f.ui.snapshot().ui_state, state);
    assert.equal(f.ui.snapshot().fields.threadId, "");
    assert.equal(f.ui.snapshot().consent, false);
  });
});

test("旧会话的finally不清除新会话的pending，也不泄漏旧成功", async () => {
  const a = deferred(); const b = deferred();
  const f = await fixture({ handler: ({ body }) => (body.session_token === "test-session-a" ? a : b).promise
    .then(() => ({ ok: true, wake: windowFor(body) })) });
  f.ready(); const first = f.ui.start();
  const oldTicket = f.ui.viewTicket();
  f.ui.setSession("test-session-b");
  f.apply(viewFor({ binding: "binding-b", sessionSeat: "seat-b" }));
  f.ready({ thread: OTHER_THREAD }); const second = f.ui.start();
  a.resolve(); assert.equal(await first, false);
  assert.equal(f.ui.snapshot().ui_state, "starting");
  assert.equal(f.ui.snapshot().fields.threadId, OTHER_THREAD);
  assert.equal(f.ui.acceptView(oldTicket, viewFor()), false);
  b.resolve(); assert.equal(await second, true);
  assert.equal(f.ui.snapshot().ui_state, "waiting");
  assert.equal(f.ui.snapshot().window.request_id, f.calls[1].body.request_id);
  f.ui.setSession(null);
  assert.equal(f.ui.snapshot().ui_state, "unbound");
  assert.equal(f.ui.visibleState().window, null);
});

test("排队接收不是权威resolve，silent包含在结清数内，清理未知不伪造完成", async () => {
  const f = await fixture(); f.ready(); await f.ui.start();
  const base = f.server();
  f.apply(viewFor({ window: { ...base, state: "dispatching", attempted_count: 1, cleanup_ok: null, pending_intent_id: "intent-local" } }));
  assert.equal(f.ui.snapshot().ui_state, "sending");
  assert.match(f.ui.snapshot().counts_text, /已接收 0.*权威已结清 0/);
  f.apply(viewFor({ window: { ...base, state: "awaiting_result", attempted_count: 1, queued_count: 1, pending_intent_id: "intent-local" } }));
  assert.equal(f.ui.snapshot().ui_state, "awaiting_resolution");
  assert.match(f.ui.snapshot().counts_text, /已接收 1.*权威已结清 0.*silent.*不是公开回复数/);
  for (const cleanup of [null, false, true]) {
    f.apply(viewFor({ window: { ...base, state: "stopped", reason: "max_notifications", attempted_count: 2,
      queued_count: 2, resolved_count: 2, cleanup_ok: cleanup } }));
    assert.equal(f.ui.snapshot().ui_state, "stopped");
    assert.equal(f.ui.snapshot().editable, cleanup === true);
    assert.match(f.ui.snapshot().counts_text, /权威已结清 2/);
    assert.equal(f.ui.visibleState().window.native_turn_state, "unknown");
    assert.equal(f.ui.visibleState().window.accepted_notifications_retracted, false);
  }
  f.apply(viewFor({ window: { ...base, state: "stopped", reason: "stopped_by_owner", attempted_count: 2,
    queued_count: 2, resolved_count: 2, cleanup_pending: true } }));
  assert.equal(f.ui.snapshot().ui_state, "stopping");
  assert.equal(f.ui.snapshot().can_start, false);
});

test("机器采样和快照不可改写内部状态，也不包含目标任务/本人会话或响应额外字段", async () => {
  const f = await fixture({ handler: ({ reply }) => ({ ...reply(), private_path: "secret-path-canary" }) });
  f.ready(); await f.ui.start();
  const snapshot = f.ui.snapshot();
  snapshot.limits.max_notifications = 99; snapshot.window.state = "stopped"; snapshot.fields.threadId = OTHER_THREAD;
  assert.equal(f.ui.snapshot().window.state, "waiting");
  assert.equal(f.ui.snapshot().fields.threadId, THREAD);
  assert.equal(f.ui.snapshot().limits.max_notifications, 2);
  const visible = f.ui.visibleState();
  assert.equal(Object.hasOwn(visible.window, "thread_id"), false,
    "机器采样不能以undefined属性夹带目标字段");
  const serialized = JSON.stringify(visible);
  for (const sentinel of [THREAD, "thread_id", "test-session-a", "session_token", "private_path", "secret-path-canary"]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
});

test("安全UUID源失效时零请求，不退回Math.random", async () => {
  const f = await fixture({ makeRequestId: () => { throw new Error("no-random"); } });
  f.ready(); assert.equal(await f.ui.start(), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.ui.snapshot().consent, false);
  assert.match(f.ui.snapshot().error, /安全随机数不可用/);
});
