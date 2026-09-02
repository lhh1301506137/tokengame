"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { setImmediate: immediate } = require("node:timers/promises");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost, MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { CONTRACT_VERSION, requestEnvelope } = require("../src/contract/adapter-contract.cjs");
const { RemoteWakeConnector, deriveWakeTargetId } = require("../src/host/remote-wake-connector.cjs");
const path = require("node:path");

const QUEUED = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });

async function setup(t, options = {}) {
  const surface = new CommandSurface({});
  const host = new TableWebHost({ core: new InProcessCoreClient({ surface }), modelBindingEnabled: true,
    remoteWakeEnabled: true, wakeOptions: { pollIntervalMs: 2 },
    remoteWakeOptions: { maxPollMs: 500, leaseMs: 2_000 }, ...options });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const observedHttp = [];
  const post = async (route, body, headers = {}, operation = {}) => {
    observedHttp.push({ route, body, headers });
    const response = await fetch(`${origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body), signal: operation.signal ?? AbortSignal.timeout(3_000),
      redirect: "error",
    });
    return { status: response.status, body: await response.json() };
  };
  const a = (await post("/api/room/create", { player_id: "remote-a", max_seats: 2 })).body;
  const b = (await post("/api/room/join", { player_id: "remote-b", invite_code: a.invite_code })).body;
  const action = (seat, command, params = {}) => post("/api/action", { session_token: seat.session_token, command, params });
  for (const seat of [a, b]) {
    assert.equal((await action(seat, "room.confirm_public_scope", { acknowledged: true })).status, 200);
    const binding = await post("/api/model/bind", { session_token: seat.session_token,
      acknowledged: true, binding_request_id: randomUUID() });
    assert.equal(binding.status, 200);
    seat.modelToken = binding.body.connection.model_token;
    seat.threadId = randomUUID();
    seat.connector = { connector_id: randomUUID(), target_id: deriveWakeTargetId(seat.threadId) };
  }
  const connector = (seat, actionName, input = {}, operation) => post(`/api/model/wake/connector/${actionName}`,
    { contract_version: CONTRACT_VERSION, ...input }, { [MODEL_COMMAND_TOKEN_HEADER]: seat.modelToken }, operation);
  const model = (seat, command, params = {}) => post("/api/model/command", requestEnvelope(command, params),
    { [MODEL_COMMAND_TOKEN_HEADER]: seat.modelToken });
  const view = async (seat) => (await post("/api/view", { session_token: seat.session_token })).body.view;
  const wake = (seat, actionName, input = {}) => post(`/api/model/wake/${actionName}`,
    { session_token: seat.session_token, ...input });
  return { host, surface, origin, post, a, b, action, connector, model, view, wake, observedHttp };
}

test("远程 HTTP：连接器在线不自启；真人有限窗口→本席通知→真实模型面 resolve", async (t) => {
  let at = 1_000;
  const f = await setup(t, { remoteWakeOptions: { now: () => at, maxPollMs: 500, leaseMs: 2_000 } });
  for (const seat of [f.a, f.b]) {
    const connected = await f.connector(seat, "poll", { ...seat.connector, wait_ms: 1 });
    assert.equal(connected.status, 200);
    assert.equal(connected.body.notification, null);
  }
  const before = (await f.view(f.a)).model_wake;
  assert.equal(before.transport, "remote_connector");
  assert.equal(before.target_configured, true);
  assert.equal(before.window.state, "idle");
  assert.equal(before.window.attempted_count, 0);

  const waiting = f.connector(f.a, "poll", { ...f.a.connector, wait_ms: 500 });
  assert.equal((await f.wake(f.a, "start", {
    acknowledged: true, request_id: randomUUID(), max_notifications: 1, max_duration_ms: 5_000,
  })).status, 200);
  await f.action(f.a, "chat.say", { text: "远程连接器测试公开消息", idempotency_key: randomUUID() });
  const notification = (await waiting).body.notification;
  assert.match(notification.intent_id, /^intent-/);
  assert.deepEqual(Object.keys(notification).sort(), ["intent_id", "notification_id"]);
  assert.equal((await f.connector(f.b, "poll", { ...f.b.connector, wait_ms: 1 })).body.notification, null,
    "B 未开真人窗口，A 的通知不可流入 B");

  const wrongAck = await f.connector(f.b, "ack", { connector_id: f.b.connector.connector_id,
    notification_id: notification.notification_id, receipt: QUEUED });
  assert.equal(wrongAck.status, 404);
  const ack = await f.connector(f.a, "ack", { connector_id: f.a.connector.connector_id,
    notification_id: notification.notification_id, receipt: QUEUED });
  assert.equal(ack.status, 200);
  const started = await f.model(f.a, "ai.start", { intent_id: notification.intent_id });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const resolved = await f.model(f.a, "ai.resolve", { turn_id: started.body.result.started.turn_id, decision: "silent" });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  const deadline = Date.now() + 2_000;
  let final;
  do {
    final = (await f.wake(f.a, "status")).body.wake;
    if (final.resolved_count === 1) break;
    assert.ok(Date.now() < deadline, "本机权威 resolve 未进入通知回执");
    await immediate();
  } while (true);
  assert.equal(final.queued_count, 1);
  assert.equal(final.resolved_count, 1);
  assert.equal(JSON.stringify((await f.view(f.b)).model_wake).includes(notification.intent_id), false);
  at += 2_001;
  f.b.connector.target_id = f.a.connector.target_id;
  assert.equal((await f.connector(f.b, "poll", { ...f.b.connector, wait_ms: 1 })).status, 200);
  const borrowed = await f.wake(f.b, "start", { acknowledged: true, request_id: randomUUID(), max_notifications: 1 });
  assert.equal(borrowed.body.code, "wake_thread_in_use", "A 已 resolve 仍不代表其模型上下文可借给 B");
});

test("远程 HTTP：认证先于协议，不能用网页 token、额外 scope 或旧绑定冒领", async (t) => {
  const f = await setup(t);
  const route = "/api/model/wake/connector/poll";
  const unauthenticated = await f.post(route, { secret: "not-echoed" });
  assert.deepEqual(unauthenticated.body, { ok: false, code: "model_command_token_rejected" });
  const human = await f.post(route, { contract_version: CONTRACT_VERSION, ...f.a.connector, wait_ms: 1 },
    { [MODEL_COMMAND_TOKEN_HEADER]: f.a.session_token });
  assert.equal(human.status, 403);
  const missingVersion = await f.post(route, { ...f.a.connector, wait_ms: 1 },
    { [MODEL_COMMAND_TOKEN_HEADER]: f.a.modelToken });
  assert.equal(missingVersion.body.code, "contract_version_missing");
  const injected = await f.connector(f.a, "poll", { ...f.a.connector, wait_ms: 1, seat_id: f.b.seat_id });
  assert.equal(injected.body.code, "invalid_field");

  const waiting = f.connector(f.a, "poll", { ...f.a.connector, wait_ms: 500 });
  await immediate();
  assert.equal((await f.post("/api/model/unbind", { session_token: f.a.session_token })).status, 200);
  assert.equal((await waiting).status, 403);
  const stale = await f.connector(f.a, "poll", { ...f.a.connector, wait_ms: 1 });
  assert.equal(stale.body.code, "model_command_token_rejected");
});

test("远程 HTTP：两种 wake transport 不可同时启用；默认端点关闭", async (t) => {
  const core = new InProcessCoreClient({ surface: new CommandSurface({}) });
  assert.throws(() => new TableWebHost({ core, modelBindingEnabled: true,
    remoteWakeEnabled: true, wakeQueue: async () => QUEUED }), { code: "invalid_field" });
  const f = await setup(t, { remoteWakeEnabled: false });
  const result = await f.connector(f.a, "poll", { ...f.a.connector, wait_ms: 1 });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "wake_connector_disabled");
});

test("双席真实 HTTP Connector→Broker→模型命令面各自闭环，不借用另一席上下文", async (t) => {
  const f = await setup(t);
  const controllers = [new AbortController(), new AbortController()];
  t.after(() => controllers.forEach((entry) => entry.abort()));
  const ready = [];
  const readyPromises = [0, 1].map((index) => new Promise((resolve) => { ready[index] = resolve; }));
  const contexts = [];
  const connectorHttp = [];
  const connectorEvents = [];
  const runs = [f.a, f.b].map((seat, index) => {
    const connector = new RemoteWakeConnector({ connectionFile: path.resolve(`connector-${index}.json`),
      threadId: seat.threadId, connectorId: seat.connector.connector_id,
      codexExecutable: process.execPath, cwd: process.cwd(), maxNotifications: 1,
      pollMs: 400, retryMs: 1, maxDurationMs: 5_000,
    }, {
      readConnection: () => ({ origin: f.origin, token: seat.modelToken }),
      fetchImpl: (url, request) => { connectorHttp.push({ url, request }); return fetch(url, request); },
      onEvent: (event) => { connectorEvents.push(event); if (event.type === "connected") ready[index](); },
      wakeQueue: async ({ intentId, threadId }) => {
        assert.equal(threadId, seat.threadId, "只有本机 sender 拿到原生任务 ID");
        const started = await f.model(seat, "ai.start", { intent_id: intentId });
        assert.equal(started.status, 200, JSON.stringify(started.body));
        contexts.push({ seat: seat.seat_id, started: started.body.result.started });
        const resolved = await f.model(seat, "ai.resolve", {
          turn_id: started.body.result.started.turn_id, decision: "public_speech", text: `connector-seat-${index}-speech`,
        });
        assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
        return QUEUED;
      },
    });
    return connector.run({ signal: controllers[index].signal });
  });
  await Promise.all(readyPromises);
  for (const seat of [f.a, f.b]) {
    assert.equal((await f.wake(seat, "start", { acknowledged: true, request_id: randomUUID(),
      max_notifications: 1, max_duration_ms: 5_000 })).status, 200);
  }
  await f.action(f.a, "chat.say", { text: "双席 Connector 集成测试", idempotency_key: randomUUID() });
  const results = await Promise.all(runs);
  assert.equal(results.every((result) => result.acks_confirmed === 1 && result.queue_accepted === 1), true);
  assert.equal(contexts.length, 2);
  const timeline = (await f.host.core.dispatch("view.timeline")).timeline;
  const speeches = timeline.filter((event) => event.type === "AI_PUBLIC_SPEECH");
  assert.deepEqual(speeches.map((event) => [event.payload.seat_id, event.payload.text]).sort(), [
    [f.a.seat_id, "connector-seat-0-speech"], [f.b.seat_id, "connector-seat-1-speech"],
  ].sort());
  const wrong = await f.model(f.b, "ai.resolve", { turn_id: contexts.find((entry) => entry.seat === f.a.seat_id).started.turn_id,
    decision: "public_speech", text: "must-not-publish" });
  assert.equal(wrong.body.ok, false);
  assert.ok(connectorHttp.length >= 4, "两席至少各经历 poll 与 ACK，不能在空请求列表上证明隐私");
  const visible = JSON.stringify({ http: f.observedHttp, connectorHttp, connectorEvents, timeline, results });
  for (const seat of [f.a, f.b]) assert.equal(visible.includes(seat.threadId), false, "原生 UUID 不出玩家本机 sender");
});
