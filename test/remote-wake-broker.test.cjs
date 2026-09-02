"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { RemoteWakeBroker } = require("../src/host/remote-wake-broker.cjs");

const scope = (suffix) => ({ handle: `seat-handle-${suffix}`, bindingId: `binding-${suffix}`, generation: 1 });
const queued = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });

function connectorInput(extra = {}) {
  return { connector_id: randomUUID(), target_id: randomUUID(), wait_ms: 20, ...extra };
}

test("远程连接器按绑定隔离，长轮询只收到本席通知并以 ACK 结清 queue", async (t) => {
  const broker = new RemoteWakeBroker({ leaseMs: 2_000, maxPollMs: 100 });
  t.after(() => broker.close());
  const a = scope("a");
  const b = scope("b");
  const aConnector = connectorInput();
  const bConnector = connectorInput();

  await broker.poll(a, { ...aConnector, wait_ms: 1 });
  await broker.poll(b, { ...bConnector, wait_ms: 1 });
  assert.equal(broker.targetConfigured(a), true);
  assert.equal(broker.selectThread(undefined, a), aConnector.target_id.toLowerCase());
  assert.equal(broker.selectThread(bConnector.target_id, a), null);

  const next = broker.poll(a, aConnector);
  const notificationId = randomUUID();
  const queue = broker.queue({
    scope: a,
    threadId: aConnector.target_id,
    intentId: `intent-${randomUUID()}`,
    notificationId,
  });
  const delivered = await next;
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
  const broker = new RemoteWakeBroker({ leaseMs: 2_000, maxPollMs: 100 });
  t.after(() => broker.close());
  const own = scope("ack");
  const connector = connectorInput();
  await broker.poll(own, { ...connector, wait_ms: 1 });

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
  let at = 1_000;
  const broker = new RemoteWakeBroker({ now: () => at, leaseMs: 50, maxPollMs: 100 });
  t.after(() => broker.close());
  const own = scope("guard");
  const connector = connectorInput();
  const base = { scope: own, intentId: `intent-${randomUUID()}`, notificationId: randomUUID() };
  assert.deepEqual(await broker.queue({ ...base, threadId: connector.target_id }), {
    queued: false, attempted: false, cleanup_ok: true, reason: "wake_connector_unavailable",
  });
  await broker.poll(own, { ...connector, wait_ms: 1 });
  assert.deepEqual(await broker.queue({ ...base, notificationId: randomUUID(), threadId: randomUUID() }), {
    queued: false, attempted: false, cleanup_ok: true, reason: "wake_thread_not_authorized",
  });

  const active = broker.poll(own, connector);
  await assert.rejects(broker.poll(own, connector), { code: "wake_connector_poll_active" });
  await assert.rejects(broker.poll(own, { ...connector, connector_id: randomUUID() }),
    { code: "wake_connector_in_use" });
  await active;
  at += 51;
  assert.equal(broker.targetConfigured(own), false);
  const replacement = { ...connector, connector_id: randomUUID() };
  await broker.poll(own, { ...replacement, wait_ms: 1 });
  assert.equal(broker.selectThread(undefined, own), replacement.target_id.toLowerCase());
});

test("断线重连重复交付同一 notification，取消后有界清理且不伪造 queued", async (t) => {
  let at = 1_000;
  const broker = new RemoteWakeBroker({ now: () => at, leaseMs: 50, maxPollMs: 100 });
  t.after(() => broker.close());
  const own = scope("retry");
  const connector = connectorInput();
  await broker.poll(own, { ...connector, wait_ms: 1 });
  const notificationId = randomUUID();
  const firstPoll = broker.poll(own, connector);
  const controller = new AbortController();
  const queue = broker.queue({ scope: own, threadId: connector.target_id,
    intentId: `intent-${randomUUID()}`, notificationId, signal: controller.signal });
  const first = await firstPoll;
  at += 51;
  await assert.rejects(broker.poll(own, { ...connector, connector_id: randomUUID(), wait_ms: 1 }),
    { code: "wake_connector_in_use" }, "租约到期不代表旧 queue 没有发生，新进程不得重领待 ACK 通知");
  const second = await broker.poll(own, { ...connector, wait_ms: 1 });
  assert.deepEqual(second.notification, first.notification);
  controller.abort();
  assert.deepEqual(await queue, {
    queued: false, attempted: true, cleanup_ok: false, reason: "cancelled",
  });
  const empty = await broker.poll(own, { ...connector, wait_ms: 1 });
  assert.equal(empty.notification, null);
});

test("撤权换代后的旧 scope/ACK 不能进入新绑定，已出站未 ACK 的清理仍为未知", async (t) => {
  const own = scope("generation");
  let current = own;
  const broker = new RemoteWakeBroker({ maxPollMs: 100, assertScopeCurrent: (value) => {
    if (value.bindingId !== current.bindingId || value.generation !== current.generation) {
      throw Object.assign(new Error("model_binding_changed"), { code: "model_binding_changed" });
    }
  } });
  t.after(() => broker.close());
  const connector = connectorInput();
  await broker.poll(own, { ...connector, wait_ms: 1 });
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
  await assert.rejects(broker.poll(own, connector), { code: "model_binding_changed" });
  await broker.poll(current, { ...connector, wait_ms: 1 });
  assert.throws(() => broker.ack(current, { connector_id: connector.connector_id,
    notification_id: notificationId, receipt: queued }), { code: "wake_notification_unknown" });
});
