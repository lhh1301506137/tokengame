"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { getEventListeners } = require("node:events");
const { RemoteWakeBroker } = require("../src/host/remote-wake-broker.cjs");

const scope = (suffix) => ({ handle: `seat-handle-${suffix}`, bindingId: `binding-${suffix}`, generation: 1 });
const queued = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });

function connectorInput(extra = {}) {
  return { connector_id: randomUUID(), target_id: randomUUID(), wait_ms: 20, ...extra };
}

// 生产 poll 的 unref 定时器由 HTTP server/socket 持有事件循环所有权；纯单元测试没有
// 那些句柄。注入并显式推进计时器，不让 Node 版本或其他测试的偶然句柄决定是否完成。
function brokerFixture(t, options = {}) {
  let at = 1_000;
  const timers = new Set();
  const broker = new RemoteWakeBroker({ leaseMs: 2_000, maxPollMs: 100, ...options,
    now: () => at,
    setTimeout: (callback, ms) => {
      const timer = { callback, at: at + ms, refed: true, unref() { this.refed = false; } };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer) => { timers.delete(timer); },
  });
  const advance = (ms) => {
    at += ms;
    for (const timer of [...timers]) {
      if (timer.at <= at && timers.delete(timer)) timer.callback();
    }
  };
  t.after(() => {
    broker.close();
    assert.equal(timers.size, 0, "关闭后不得遗留 poll 定时器");
  });
  return { broker, timers, advance,
    pollToTimeout: (own, input) => {
      const waiting = broker.poll(own, input);
      advance(input.wait_ms);
      return waiting;
    },
  };
}

test("远程连接器按绑定隔离，长轮询只收到本席通知并以 ACK 结清 queue", async (t) => {
  const f = brokerFixture(t);
  const { broker } = f;
  const a = scope("a");
  const b = scope("b");
  const aConnector = connectorInput();
  const bConnector = connectorInput();

  await f.pollToTimeout(a, { ...aConnector, wait_ms: 1 });
  await f.pollToTimeout(b, { ...bConnector, wait_ms: 1 });
  assert.equal(broker.targetConfigured(a), true);
  assert.equal(broker.selectThread(undefined, a), aConnector.target_id.toLowerCase());
  assert.equal(broker.selectThread(bConnector.target_id, a), null);

  const controller = new AbortController();
  const next = broker.poll(a, aConnector, { signal: controller.signal });
  assert.equal(f.timers.size, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  const notificationId = randomUUID();
  const queue = broker.queue({
    scope: a,
    threadId: aConnector.target_id,
    intentId: `intent-${randomUUID()}`,
    notificationId,
  });
  let queueSettled = false;
  const markQueueSettled = () => { queueSettled = true; };
  queue.then(markQueueSettled, markQueueSettled);
  assert.equal(f.timers.size, 0, "发送通知立即结清 poll，不等待截止");
  const delivered = await next;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(queueSettled, false, "投递通知不等于收到 queue ACK");
  assert.deepEqual(delivered.notification, {
    notification_id: notificationId.toLowerCase(),
    intent_id: delivered.notification.intent_id,
  });
  assert.equal(Object.hasOwn(delivered.notification, "thread_id"), false, "本地任务编号不经公网响应回传");

  assert.throws(() =>
    broker.ack(b, { connector_id: bConnector.connector_id, notification_id: notificationId, receipt: queued }),
    { code: "wake_notification_unknown" },
  );
  const ack = broker.ack(a, {
    connector_id: aConnector.connector_id,
    notification_id: notificationId,
    receipt: queued,
  });
  assert.deepEqual(ack, { acked: true, replayed: false });
  assert.deepEqual(await queue, queued);
});

test("ACK 响应丢失可同值重放，但不同回执与不同连接器均失败关闭", async (t) => {
  const f = brokerFixture(t);
  const { broker } = f;
  const own = scope("ack");
  const connector = connectorInput();
  await f.pollToTimeout(own, { ...connector, wait_ms: 1 });

  const waiting = broker.poll(own, connector);
  const notificationId = randomUUID();
  const queue = broker.queue({ scope: own, threadId: connector.target_id,
    intentId: `intent-${randomUUID()}`, notificationId });
  await waiting;
  assert.deepEqual(broker.ack(own, { connector_id: connector.connector_id,
    notification_id: notificationId, receipt: queued }), { acked: true, replayed: false });
  assert.deepEqual(await queue, queued);
  assert.deepEqual(broker.ack(own, { connector_id: connector.connector_id,
    notification_id: notificationId, receipt: queued }), { acked: true, replayed: true });
  assert.throws(() => broker.ack(own, { connector_id: connector.connector_id,
    notification_id: notificationId,
    receipt: { queued: false, attempted: true, cleanup_ok: true, reason: "queue_failed" } }),
  { code: "wake_ack_conflict" });
  assert.throws(() => broker.ack(own, { connector_id: randomUUID(),
    notification_id: notificationId, receipt: queued }), { code: "wake_connector_changed" });
});

test("无活跃连接器、错任务、并发轮询与换连接器均不会误投递", async (t) => {
  const f = brokerFixture(t, { leaseMs: 50 });
  const { broker } = f;
  const own = scope("guard");
  const connector = connectorInput();
  const base = { scope: own, intentId: `intent-${randomUUID()}`, notificationId: randomUUID() };
  assert.deepEqual(await broker.queue({ ...base, threadId: connector.target_id }), {
    queued: false, attempted: false, cleanup_ok: true, reason: "wake_connector_unavailable",
  });
  await f.pollToTimeout(own, { ...connector, wait_ms: 1 });
  assert.deepEqual(await broker.queue({ ...base, notificationId: randomUUID(), threadId: randomUUID() }), {
    queued: false, attempted: false, cleanup_ok: true, reason: "wake_thread_not_authorized",
  });

  const active = broker.poll(own, connector);
  await assert.rejects(broker.poll(own, connector), { code: "wake_connector_poll_active" });
  await assert.rejects(broker.poll(own, { ...connector, connector_id: randomUUID() }),
    { code: "wake_connector_in_use" });
  f.advance(connector.wait_ms);
  await active;
  f.advance(51);
  assert.equal(broker.targetConfigured(own), false);
  const replacement = { ...connector, connector_id: randomUUID() };
  await f.pollToTimeout(own, { ...replacement, wait_ms: 1 });
  assert.equal(broker.selectThread(undefined, own), replacement.target_id.toLowerCase());
});

test("断线重连重复交付同一 notification，取消后有界清理且不伪造 queued", async (t) => {
  const f = brokerFixture(t, { leaseMs: 50 });
  const { broker } = f;
  const own = scope("retry");
  const connector = connectorInput();
  await f.pollToTimeout(own, { ...connector, wait_ms: 1 });
  const notificationId = randomUUID();
  const firstPoll = broker.poll(own, connector);
  const controller = new AbortController();
  const queue = broker.queue({ scope: own, threadId: connector.target_id,
    intentId: `intent-${randomUUID()}`, notificationId, signal: controller.signal });
  const first = await firstPoll;
  f.advance(51);
  await assert.rejects(broker.poll(own, { ...connector, connector_id: randomUUID(), wait_ms: 1 }),
    { code: "wake_connector_in_use" }, "租约到期不代表旧 queue 没有发生，新进程不得重领待 ACK 通知");
  const second = await broker.poll(own, { ...connector, wait_ms: 1 });
  assert.deepEqual(second.notification, first.notification);
  controller.abort();
  assert.deepEqual(await queue, {
    queued: false, attempted: true, cleanup_ok: false, reason: "cancelled",
  });
  const empty = await f.pollToTimeout(own, { ...connector, wait_ms: 1 });
  assert.equal(empty.notification, null);
});

test("撤权换代后的旧 scope/ACK 不能进入新绑定，已出站未 ACK 的清理仍为未知", async (t) => {
  const own = scope("generation");
  let current = own;
  const f = brokerFixture(t, { assertScopeCurrent: (value) => {
    if (value.bindingId !== current.bindingId || value.generation !== current.generation) {
      throw Object.assign(new Error("model_binding_changed"), { code: "model_binding_changed" });
    }
  } });
  const { broker } = f;
  const connector = connectorInput();
  await f.pollToTimeout(own, { ...connector, wait_ms: 1 });
  const waiting = broker.poll(own, connector);
  const notificationId = randomUUID();
  const queuedWork = broker.queue({ scope: own, threadId: connector.target_id,
    intentId: `intent-${randomUUID()}`, notificationId });
  await waiting;
  broker.forgetScope(own);
  current = { ...own, bindingId: "next-binding", generation: 2 };
  assert.deepEqual(await queuedWork, {
    queued: false, attempted: true, cleanup_ok: false, reason: "model_binding_changed",
  });
  // 错误放行旧 scope 时也推进到期，让负例产生断言失败而非悬空取消。
  await assert.rejects(f.pollToTimeout(own, connector), { code: "model_binding_changed" });
  await f.pollToTimeout(current, { ...connector, wait_ms: 1 });
  assert.throws(() => broker.ack(current, { connector_id: connector.connector_id,
    notification_id: notificationId, receipt: queued }), { code: "wake_notification_unknown" });
});

test("空长轮询在请求截止时返回，并清除定时器和 abort 监听", async (t) => {
  const f = brokerFixture(t);
  const own = scope("timeout");
  const connector = connectorInput();
  const controller = new AbortController();
  let settled = false;
  const waiting = f.broker.poll(own, connector, { signal: controller.signal });
  const markSettled = () => { settled = true; };
  waiting.then(markSettled, markSettled);
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers][0].refed, false, "poll 不应独自阻止生产进程退出");
  f.advance(connector.wait_ms - 1);
  await Promise.resolve();
  assert.equal(settled, false, "截止前仍须等待通知");
  assert.equal(f.timers.size, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  f.advance(1);
  assert.deepEqual(await waiting, { connected: true, lease_ms: 2_000, notification: null });
  assert.equal(f.timers.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal((await f.pollToTimeout(own, connector)).notification, null, "超时释放本席 poll 槽");
});

test("取消立即释放本席长轮询，另一席的等待不受影响", async (t) => {
  const f = brokerFixture(t);
  const a = scope("abort-a");
  const b = scope("abort-b");
  const aConnector = connectorInput();
  const bConnector = connectorInput();
  const aController = new AbortController();
  const bController = new AbortController();
  const aWaiting = f.broker.poll(a, aConnector, { signal: aController.signal });
  const bWaiting = f.broker.poll(b, bConnector, { signal: bController.signal });
  const rejected = assert.rejects(aWaiting, { code: "wake_connector_cancelled" });
  assert.equal(f.timers.size, 2);
  aController.abort();
  await rejected;
  assert.equal(f.timers.size, 1, "取消无需推进时间且只清理本席计时器");
  assert.equal(getEventListeners(aController.signal, "abort").length, 0);
  assert.equal(getEventListeners(bController.signal, "abort").length, 1);
  assert.equal((await f.pollToTimeout(a, { ...aConnector, wait_ms: 1 })).notification, null);
  assert.equal(f.timers.size, 1, "本席可重连，另一席仍在等待");
  f.advance(bConnector.wait_ms - 1);
  assert.equal((await bWaiting).notification, null);
  assert.equal(f.timers.size, 0);
  assert.equal(getEventListeners(bController.signal, "abort").length, 0);
});

for (const [label, code, stop] of [
  ["撤权", "model_binding_changed", (broker, own) => broker.forgetScope(own)],
  ["关闭", "wake_disabled", (broker) => broker.close()],
]) {
  test(`${label}立即拒绝待决长轮询并清除计时器与 abort 监听`, async (t) => {
    const f = brokerFixture(t);
    const own = scope("stop-poll");
    const controller = new AbortController();
    const waiting = f.broker.poll(own, connectorInput(), { signal: controller.signal });
    const rejected = assert.rejects(waiting, { code });
    assert.equal(f.timers.size, 1);
    stop(f.broker, own);
    await rejected;
    assert.equal(f.timers.size, 0, "清理无需等待 poll 截止");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    f.advance(100);
    assert.equal(f.timers.size, 0);
  });
}
