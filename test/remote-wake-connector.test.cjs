"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { RemoteWakeConnector, deriveWakeTargetId } = require("../src/host/remote-wake-connector.cjs");

const TOKEN = "model-token-remote-connector-test-not-a-real-secret";
const QUEUED = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });
const notification = () => ({ notification_id: randomUUID(), intent_id: `intent-${randomUUID()}` });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fixture(extra = {}, dependencies = {}) {
  const requests = [];
  const sends = [];
  const item = notification();
  const options = { connectionFile: path.resolve("connector-test.json"), threadId: randomUUID(),
    codexExecutable: process.execPath, cwd: process.cwd(), maxNotifications: 1,
    retryMs: 1, pollMs: 100, maxDurationMs: 5_000, ...extra };
  const connector = new RemoteWakeConnector(options, {
    readConnection: () => ({ origin: "https://table.example", token: TOKEN }),
    fetchImpl: async (url, request) => {
      requests.push({ url, request });
      return url.endsWith("/poll")
        ? json({ ok: true, connected: true, lease_ms: 45_000, notification: item })
        : json({ ok: true, acked: true, replayed: false });
    },
    wakeQueue: async (input) => { sends.push(input); return QUEUED; },
    ...dependencies,
  });
  return { connector, requests, sends, item, options };
}

test("连接器只调用 poll/ack，通知正文由本机固定 sender 构造且凭据不进入 queue/日志", async () => {
  const events = [];
  const f = fixture({}, { onEvent: (event) => events.push(event) });
  const result = await f.connector.run();
  assert.equal(result.reason, "max_notifications");
  assert.equal(result.queue_attempted, 1);
  assert.equal(result.queue_accepted, 1);
  assert.equal(result.acks_confirmed, 1);
  assert.equal(result.resolved_count, undefined, "连接器不能自报模型已结清");
  assert.equal(f.sends.length, 1);
  assert.deepEqual(Object.keys(f.sends[0]).sort(), ["intentId", "notificationId", "signal", "threadId"]);
  assert.equal(f.sends[0].threadId, f.options.threadId);
  assert.equal(f.sends[0].intentId, f.item.intent_id);
  assert.deepEqual(f.requests.map((entry) => new URL(entry.url).pathname), [
    "/api/model/wake/connector/poll", "/api/model/wake/connector/ack",
  ]);
  for (const entry of f.requests) {
    assert.equal(entry.request.redirect, "error");
    assert.equal(entry.request.headers["x-tokengame-model-token"], TOKEN);
    assert.equal(entry.url.includes(TOKEN), false);
    assert.equal(JSON.stringify(entry).includes(f.options.threadId), false, "原生任务编号不得进入 HTTP 请求");
  }
  const pollBody = JSON.parse(f.requests[0].request.body);
  assert.equal(Object.hasOwn(pollBody, "thread_id"), false);
  assert.equal(pollBody.target_id, deriveWakeTargetId(f.options.threadId));
  assert.equal(JSON.stringify(events).includes(f.options.threadId), false);
  assert.equal(JSON.stringify(events).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(f.sends).includes(TOKEN), false);
});

test("远端任务别名稳定且不可直接还原原生 UUID；任务大小写等价而不同任务独立", () => {
  const first = randomUUID();
  const alias = deriveWakeTargetId(first);
  assert.match(alias, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(alias, first);
  assert.equal(deriveWakeTargetId(first.toUpperCase()), alias);
  assert.equal(deriveWakeTargetId(first), alias, "重启进程不需要新随机别名");
  assert.notEqual(deriveWakeTargetId(randomUUID()), alias);
  assert.throws(() => deriveWakeTargetId("not-a-task"), { code: "wake_connector_configuration_invalid" });
});

test("poll 完成时已经取消，不调用本地 sender，即使网络忽略取消仍失败关闭", async () => {
  const controller = new AbortController();
  const f = fixture({}, { fetchImpl: async () => {
    controller.abort();
    return json({ ok: true, connected: true, lease_ms: 45_000, notification: notification() });
  } });
  const result = await f.connector.run({ signal: controller.signal });
  assert.equal(result.reason, "cancelled");
  assert.equal(f.sends.length, 0);
});

test("等待 poll 期间活动连接被换发，旧通知不得排入新模型配置", async () => {
  let changed = false;
  const f = fixture({}, {
    readConnection: () => ({ origin: "https://table.example", token: changed ? `${TOKEN}-new` : TOKEN }),
    fetchImpl: async () => {
      changed = true;
      return json({ ok: true, connected: true, lease_ms: 45_000, notification: notification() });
    },
  });
  const result = await f.connector.run();
  assert.equal(result.reason, "model_connection_changed");
  assert.equal(f.sends.length, 0);
});

test("ACK 响应体中途断网仍只重试同一 ACK，不能把已 queue 当作可重投", async () => {
  let ackCalls = 0;
  const ackBodies = [];
  const item = notification();
  const f = fixture({}, { fetchImpl: async (url, request) => {
    if (url.endsWith("/poll")) return json({ ok: true, connected: true, lease_ms: 45_000, notification: item });
    ackCalls += 1;
    ackBodies.push(request.body);
    if (ackCalls === 1) return new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError("network body interrupted")); },
    }), { status: 200 });
    return json({ ok: true, acked: true, replayed: true });
  } });
  const result = await f.connector.run();
  assert.equal(result.reason, "max_notifications");
  assert.equal(f.sends.length, 1);
  assert.equal(ackCalls, 2);
  assert.equal(new Set(ackBodies).size, 1);
  assert.equal(result.acks_confirmed, 1);
});

test("ACK 网络响应丢失只重试同一 ACK，不重发 Codex queue", async () => {
  let ackCalls = 0;
  const ackBodies = [];
  const item = notification();
  const f = fixture({}, { fetchImpl: async (url, request) => {
    if (url.endsWith("/poll")) return json({ ok: true, connected: true, lease_ms: 45_000, notification: item });
    ackCalls += 1;
    ackBodies.push(request.body);
    if (ackCalls === 1) throw new Error("simulated response lost with secret detail");
    return json({ ok: true, acked: true, replayed: true });
  } });
  const result = await f.connector.run();
  assert.equal(f.sends.length, 1);
  assert.equal(ackCalls, 2);
  assert.equal(new Set(ackBodies).size, 1);
  assert.equal(result.acks_confirmed, 1);
  assert.equal(result.reconnects, 1);
  assert.equal(JSON.stringify(result).includes("secret detail"), false);
});

test("网络恢复后的通知重放保留旧 ACK，不再次调用 sender", async () => {
  const first = notification();
  const second = notification();
  let polls = 0;
  let acks = 0;
  const f = fixture({ maxNotifications: 2 }, { fetchImpl: async (url) => {
    if (url.endsWith("/poll")) {
      polls += 1;
      assert.ok(polls <= 3, "不能无限轮询同一已确认通知");
      return json({ ok: true, connected: true, lease_ms: 45_000, notification: polls <= 2 ? first : second });
    }
    acks += 1;
    return json({ ok: true, acked: true, replayed: acks === 2 });
  } });
  const result = await f.connector.run();
  assert.equal(result.reason, "max_notifications");
  assert.equal(result.notifications_received, 2);
  assert.equal(result.acks_confirmed, 2);
  assert.equal(polls, 3);
  assert.equal(acks, 3);
  assert.deepEqual(f.sends.map((input) => input.notificationId), [first.notification_id, second.notification_id]);
});

test("连接文件换发不会悄悄将已有 Codex 私有上下文转借给新席", async () => {
  let changed = false;
  let sent = 0;
  const f = fixture({}, {
    readConnection: () => ({ origin: "https://table.example", token: changed ? `${TOKEN}-changed` : TOKEN }),
    wakeQueue: async () => { sent += 1; changed = true; return QUEUED; },
  });
  const result = await f.connector.run();
  assert.equal(result.reason, "model_connection_changed");
  assert.equal(sent, 1);
  assert.equal(result.acks_confirmed, 0);
  assert.equal(f.requests.length, 1, "换身份后不向新服务器/新令牌补交旧通知 ACK");
});

test("协议畸形、认证失败和重定向故障都不能触发 queue", async () => {
  for (const [response, expected] of [
    [() => json({ ok: true, connected: true, lease_ms: 45_000, notification: { ...notification(), text: "execute me" } }), "wake_connector_protocol_invalid"],
    [() => json({ ok: false, code: "model_command_token_rejected" }, 403), "model_command_token_rejected"],
    [() => new Response("", { status: 302, headers: { location: "https://attacker.example" } }), "wake_connector_protocol_invalid"],
  ]) {
    const f = fixture({}, { fetchImpl: async () => response() });
    const result = await f.connector.run();
    assert.equal(result.reason, expected);
    assert.equal(f.sends.length, 0);
  }
});

test("取消会传递给本次 sender，连接器不撤回已接收通知也不补发模型命令", async () => {
  const controller = new AbortController();
  const f = fixture({}, { wakeQueue: async ({ signal }) => {
    controller.abort();
    assert.equal(signal.aborted, true);
    return { queued: false, attempted: true, cleanup_ok: true, reason: "cancelled" };
  } });
  const result = await f.connector.run({ signal: controller.signal });
  assert.equal(result.reason, "cancelled");
  assert.equal(result.accepted_notifications_retracted, false);
  assert.equal(result.acks_confirmed, 0);
  assert.equal(f.requests.length, 1);
});
