"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { createCommandServer } = require("../src/authority/command-server.cjs");
const { HttpCoreClient, InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost, MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function withHeldOperation({ operation, reached, release }, checkWhileHeld) {
  try {
    const reachedCore = await Promise.race([reached.promise.then(() => true), operation.then(() => false)]);
    assert.equal(reachedCore, true, "请求提前结束，未到达预定核心屏障；不能继续等一个不会发生的通知");
    await checkWhileHeld();
  } finally {
    // 断言失败也必须放走在途请求，再让setup的host.stop收尾。allSettled仅用于清理：
    // 原断言仍会抛出；正常路径的请求失败由下面return重新传播，不把失败算成通过。
    release.resolve();
    await Promise.allSettled([operation]);
  }
  return operation;
}

function postWithRawHeaders(origin, route, body, headers) {
  return new Promise((resolve, reject) => {
    const request = require("node:http").request(new URL(route, origin), {
      method: "POST", headers: { "content-type": "application/json", ...headers },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(text) }); } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

async function setup(t, { transport = "in_process", ...options } = {}) {
  let at = 1_000_000;
  const now = () => at;
  const surface = new CommandSurface({ now });
  let core = new InProcessCoreClient({ surface });
  if (transport === "http") {
    const server = createCommandServer({ surface, dueWork: false, internalToken: "binding-core-only" });
    const address = await server.start({ port: 0 });
    t.after(() => server.stop());
    core = new HttpCoreClient({ origin: address, token: "binding-core-only" });
  }
  const host = new TableWebHost({
    core, now, modelBindingEnabled: true, driveIntervalMs: 999_999, sweepIntervalMs: 999_999, ...options,
  });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const post = async (route, body, headers = {}) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const created = (await post("/api/room/create", { player_id: "binding-a", table_rules_version: "rules-binding" })).body;
  const joined = (await post("/api/room/join", { player_id: "binding-b", invite_code: created.invite_code })).body;
  assert.ok(created.session_token && joined.session_token);
  const act = (seat, command, params = {}) => post("/api/action", { session_token: seat.session_token, command, params });
  for (const seat of [created, joined]) {
    assert.equal((await act(seat, "room.confirm_public_scope", { acknowledged: true })).status, 200);
  }
  const bind = (seat, key = require("node:crypto").randomUUID(), extra = {}) => post("/api/model/bind", {
    session_token: seat.session_token, acknowledged: true, binding_request_id: key, ...extra,
  });
  const unbind = (seat) => post("/api/model/unbind", { session_token: seat.session_token });
  const model = (token, command, params = {}) => post("/api/model/command", requestEnvelope(command, params),
    token === null ? {} : { [MODEL_COMMAND_TOKEN_HEADER]: token });
  const view = (seat) => post("/api/view", { session_token: seat.session_token });
  const say = (seat, text) => act(seat, "chat.say", { text, idempotency_key: require("node:crypto").randomUUID() });
  return { host, core, surface, origin, post, created, joined, act, bind, unbind, model, view, say, advance: (ms) => { at += ms; } };
}

for (const transport of ["in_process", "http"]) {
  test(`${transport}: 同桌双席只能领取及回填本席；外部绑定不改变真人权限`, async (t) => {
    const f = await setup(t, { transport });
    const a = (await f.bind(f.created)).body;
    const b = (await f.bind(f.joined)).body;
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.notEqual(a.connection.model_token, b.connection.model_token);
    assert.notEqual(a.binding.binding_id, b.binding.binding_id);
    assert.equal((await f.say(f.created, "binding-scope-canary")).status, 200);
    const ai = await f.model(a.connection.model_token, "ai.take_intents");
    const bi = await f.model(b.connection.model_token, "ai.take_intents");
    assert.equal(ai.body.result.seats_polled, 1);
    assert.equal(bi.body.result.seats_polled, 1);
    assert.equal(ai.body.result.intents.length, 1);
    assert.equal(bi.body.result.intents.length, 1);
    const aIntent = ai.body.result.intents[0].intent_id;
    const bIntent = bi.body.result.intents[0].intent_id;
    assert.notEqual(aIntent, bIntent);
    const denied = await f.model(a.connection.model_token, "ai.start", { intent_id: bIntent });
    assert.equal(denied.body.ok, false);
    assert.equal(denied.body.code, "authority_id_scope_mismatch");
    const started = await f.model(b.connection.model_token, "ai.start", { intent_id: bIntent });
    assert.equal(started.body.ok, true, JSON.stringify(started.body));
    assert.equal(started.body.result.model_context.seat_id, f.joined.seat_id);
    const turnId = started.body.result.started.turn_id;
    assert.equal((await f.model(a.connection.model_token, "ai.resolve", { turn_id: turnId, decision: "public_speech", text: "forged" })).body.code,
      "authority_id_scope_mismatch");
    assert.equal((await f.model(b.connection.model_token, "ai.resolve", { turn_id: turnId, decision: "public_speech", text: "binding-own-ai" })).body.ok, true);
    const timeline = (await f.core.dispatch("view.timeline")).timeline;
    const published = timeline.filter((event) => event.type === "AI_PUBLIC_SPEECH");
    assert.equal(published.length, 1);
    assert.equal(published[0].payload.seat_id, f.joined.seat_id);
    assert.equal(published[0].payload.text, "binding-own-ai");
    assert.equal((await f.act(f.created, "seat.ready")).body.ok, true);
    for (const field of ["seat_id", "seat_handle", "binding_id", "trustedScope", "trusted_scope", "scope", "model_token"]) {
      const bad = await f.model(a.connection.model_token, "ai.take_intents", { [field]: "forged-scope" });
      assert.equal(bad.body.code, "seat_identity_not_model_supplied", field);
    }
  });
}

test("绑定需本人确认与足够长的请求键，文件只含连接能力且 origin 不信 Host 头", async (t) => {
  const f = await setup(t);
  assert.equal((await f.view(f.created)).body.view.model_connection.state, "unbound");
  for (const extra of [{ acknowledged: false }, { acknowledged: undefined }, { binding_request_id: "short" }, { binding_request_id: undefined }]) {
    assert.equal((await f.bind(f.created, "valid-request-key-01", extra)).body.ok, false);
  }
  assert.equal((await f.bind({ session_token: "forged" })).status, 403);
  const key = "same-binding-request-0001";
  let receivedHost;
  const observeHost = (request) => { if (request.url === "/api/model/bind") receivedHost = request.headers.host; };
  f.host.server.on("request", observeHost);
  let first;
  try {
    first = await postWithRawHeaders(f.origin, "/api/model/bind", {
      session_token: f.created.session_token, acknowledged: true, binding_request_id: key,
    }, { host: "attacker.invalid:6666" });
  } finally {
    f.host.server.off("request", observeHost);
  }
  assert.equal(receivedHost, "attacker.invalid:6666", "伪造Host必须真的到达被测协调器，不能只相信fetch的调用参数");
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(Object.keys(first.body.connection).sort(), ["model_token", "schema", "table_origin"]);
  assert.equal(first.body.connection.schema, "tokengame.model-connection.v1");
  assert.equal(first.body.connection.table_origin, f.origin);
  assert.deepEqual(Object.keys(first.body.binding).sort(), ["binding_id", "last_seen_at", "seat_id", "state"]);
  assert.equal(first.body.binding.state, "awaiting_host");
  assert.equal(first.body.binding.seat_id, f.created.seat_id);
  assert.equal(first.body.binding.last_seen_at, null);
  assert.deepEqual((await f.bind(f.created, key)).body, first.body);
  const other = (await f.bind(f.joined, key)).body;
  assert.notEqual(other.connection.model_token, first.body.connection.model_token);
  const before = (await f.view(f.created)).body.view.model_connection;
  assert.equal(before.state, "awaiting_host");
  assert.equal(before.proactive_wake_verified, false);
  assert.equal((await f.model(first.body.connection.model_token, "view.projection")).status, 200);
  const after = (await f.view(f.created)).body.view.model_connection;
  assert.equal(after.state, "host_seen");
  assert.equal(typeof after.last_seen_at, "number");
  assert.equal(after.proactive_wake_verified, false);
  assert.equal(JSON.stringify(after).includes(first.body.connection.model_token), false);
  assert.equal(JSON.stringify(first.body.connection).includes(f.created.session_token), false);
});

test("显式 HTTPS public origin 只进入下载文件，不改变回环监听且不信 Host/Forwarded", async (t) => {
  const publicOrigin = "https://friends-tunnel.example";
  const f = await setup(t, { publicOrigin });
  assert.match(f.origin, /^http:\/\/127\.0\.0\.1:\d+$/);

  const response = await postWithRawHeaders(f.origin, "/api/model/bind", {
    session_token: f.created.session_token,
    acknowledged: true,
    binding_request_id: "remote-public-origin-binding-01",
  }, {
    host: "attacker.invalid:6666",
    forwarded: "host=forwarded.invalid;proto=http",
    "x-forwarded-host": "x-forwarded.invalid",
    "x-forwarded-proto": "http",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.connection.table_origin, publicOrigin);
  assert.equal(JSON.stringify(response.body).includes("attacker.invalid"), false);
  assert.equal(JSON.stringify(response.body).includes("forwarded.invalid"), false);
  assert.equal(JSON.stringify(response.body).includes("x-forwarded.invalid"), false);

  await assert.rejects(
    () => f.host.start({ host: "0.0.0.0", port: 0 }),
    { code: "local_bridge_auth_unresolved" },
  );
});

test("换发与撤销即时废除旧 token/authority id，旧请求键不能复活；历史有界", async (t) => {
  const f = await setup(t);
  const key = "binding-first-request-key";
  const old = (await f.bind(f.created, key)).body;
  assert.equal(old.ok, true, JSON.stringify(old));
  await f.say(f.created, "rotation-canary");
  const intents = (await f.model(old.connection.model_token, "ai.take_intents")).body.result.intents;
  assert.equal(intents.length, 1);
  const started = (await f.model(old.connection.model_token, "ai.start", { intent_id: intents[0].intent_id })).body;
  assert.equal(started.ok, true);
  const turnId = started.result.started.turn_id;
  const fresh = (await f.bind(f.created, "binding-second-request-key")).body;
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.binding.binding_id, old.binding.binding_id);
  assert.equal((await f.model(old.connection.model_token, "view.projection")).status, 403);
  assert.equal((await f.model(fresh.connection.model_token, "ai.resolve", { turn_id: turnId, decision: "public_speech", text: "old-turn" })).body.ok, false);
  assert.equal((await f.bind(f.created, key)).status, 409);
  assert.equal((await f.unbind(f.created)).body.ok, true);
  assert.equal((await f.model(fresh.connection.model_token, "view.projection")).status, 403);
  assert.equal((await f.bind(f.created, "binding-second-request-key")).status, 409);
  assert.equal((await f.view(f.created)).body.view.model_connection.state, "unbound");
  const speech = (await f.core.dispatch("view.timeline")).timeline.filter((event) => event.type === "AI_PUBLIC_SPEECH");
  assert.equal(speech.length, 0);
  let full = null;
  for (let i = 0; i < 130; i += 1) {
    const result = await f.bind(f.created, `bounded-binding-key-${String(i).padStart(4, "0")}`);
    if (!result.body.ok) { full = result; break; }
  }
  assert.equal(full?.body.code, "model_binding_history_full");
  assert.equal((await f.bind(f.created, key)).status, 409, "满额也不能逐出旧键后允许复活");
});

test("同键并发只发同一张文件；撤销能围住正在等待核心检查的绑定", async (t) => {
  const f = await setup(t);
  const key = "parallel-binding-request";
  const pair = await Promise.all([f.bind(f.created, key), f.bind(f.created, key)]);
  assert.equal(pair[0].status, 200, JSON.stringify(pair));
  assert.deepEqual(pair[0].body, pair[1].body);
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  let hold = true;
  f.core.dispatch = async (command, params) => {
    const result = await dispatch(command, params);
    if (command === "view.hand" && hold) { hold = false; reached.resolve(); await release.promise; }
    return result;
  };
  const pending = f.bind(f.created, "parallel-rotating-request");
  const refused = await withHeldOperation({ operation: pending, reached, release }, async () => {
    assert.equal((await f.unbind(f.created)).status, 200);
  });
  assert.equal(refused.body.ok, false);
  assert.equal(refused.body.connection, undefined);
  assert.equal((await f.view(f.created)).body.view.model_connection.state, "unbound");
});

test("撤销后的在途 ai.start 响应不得带出私有上下文或重新登记 turn", async (t) => {
  const f = await setup(t);
  const binding = (await f.bind(f.created)).body;
  assert.equal(binding.ok, true, JSON.stringify(binding));
  await f.say(f.created, "in-flight-context-canary");
  const intents = (await f.model(binding.connection.model_token, "ai.take_intents")).body.result.intents;
  assert.equal(intents.length, 1);
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  f.core.dispatch = async (command, params) => {
    const result = await dispatch(command, params);
    if (command === "ai.start") { reached.resolve(); await release.promise; }
    return result;
  };
  const pending = f.model(binding.connection.model_token, "ai.start", { intent_id: intents[0].intent_id });
  const refused = await withHeldOperation({ operation: pending, reached, release }, async () => {
    assert.equal((await f.unbind(f.created)).status, 200);
  });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.ok, false);
  assert.equal(refused.body.result, undefined);
  assert.equal(JSON.stringify(refused.body).includes("in-flight-context-canary"), false);
  assert.equal(f.host.modelSurface.trackedCount, 0);
});

test("刷新/短断保留绑定，离桌与保留窗到期废除绑定且不能重新配对", async (t) => {
  const f = await setup(t);
  const a = (await f.bind(f.created)).body;
  assert.equal(a.ok, true, JSON.stringify(a));
  await f.post("/api/session/disconnect", { session_token: f.created.session_token, connection_id: f.created.connection_id });
  f.advance(1_000);
  const resumed = await f.post("/api/session/resume", { session_token: f.created.session_token });
  assert.equal(resumed.body.seat_id, f.created.seat_id);
  assert.equal((await f.model(a.connection.model_token, "view.projection")).status, 200);
  assert.equal((await f.view(f.created)).body.view.model_connection.binding_id, a.binding.binding_id);
  assert.equal((await f.act(f.created, "seat.leave")).status, 200);
  assert.equal((await f.model(a.connection.model_token, "view.projection")).status, 403);
  assert.equal((await f.bind(f.created)).body.ok, false);
  const b = (await f.bind(f.joined)).body;
  assert.equal(b.ok, true);
  await f.post("/api/session/disconnect", { session_token: f.joined.session_token, connection_id: f.joined.connection_id });
  f.advance(120_001);
  assert.equal((await f.model(b.connection.model_token, "ai.take_intents")).status, 403,
    "不能靠公开投影的顺便清理才发现模型权限过期");
  assert.equal((await f.bind(f.joined)).body.ok, false);
});

test("内部模拟驱动不能领取外部绑定席位，并消费 ai.start 的权威 model_context", async (t) => {
  const calls = [];
  const f = await setup(t, { modelAdapter: { simulated: true, evaluate: async (input) => { calls.push(input); return { decision: "silent" }; } } });
  const a = (await f.bind(f.created)).body;
  assert.equal(a.ok, true, JSON.stringify(a));
  await f.say(f.created, "driver-context-canary");
  const round = await f.host.driveOnce();
  assert.equal(round.started, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].seat_id, f.joined.seat_id);
  assert.equal(calls[0].context.schema, "tokengame.seat-ai-context.v1");
  assert.equal(calls[0].context.seat_id, f.joined.seat_id);
  assert.equal((await f.model(a.connection.model_token, "ai.take_intents")).body.result.intents.length, 1);
});

test("模型令牌只在受限下载中出现；公开视图、工具结果连令牌值也扫描", async (t) => {
  const f = await setup(t);
  const a = (await f.bind(f.created)).body;
  assert.equal(a.ok, true, JSON.stringify(a));
  const token = a.connection.model_token;
  const realRequest = f.host.coreRequest.bind(f.host);
  f.host.coreRequest = async () => ({ ok: true, status: 200, body: { result: { note: `initial-${token}-tail` } } });
  const initialLeak = await f.model(token, "view.projection");
  assert.equal(initialLeak.status, 500, "新铸造token须立即纳入值扫描，不能靠以后净化某个同名字段才登记");
  assert.equal(JSON.stringify(initialLeak.body).includes(token), false);
  f.host.coreRequest = async (command, params) => command === "view.projection"
    ? { ok: true, status: 200, body: { result: { model_token: token, note: "safe" } } }
    : realRequest(command, params);
  const clean = await f.model(token, "view.projection");
  assert.equal(clean.status, 200);
  assert.deepEqual(clean.body.result, { note: "safe" });
  f.host.coreRequest = async () => ({ ok: true, status: 200, body: { result: { note: `hidden-${token}-tail` } } });
  const withheld = await f.model(token, "view.projection");
  assert.equal(withheld.status, 500);
  assert.equal(withheld.body.code, "credential_leak");
  assert.equal(JSON.stringify(withheld.body).includes(token), false);
  const visible = await f.view(f.created);
  assert.equal(visible.status, 200);
  assert.equal(JSON.stringify(visible.body).includes(token), false);
  await f.say(f.created, token);
  const poisoned = await f.view(f.joined);
  assert.equal(poisoned.status, 500, "不能把能力藏在公开自由文本中带到别人视图");
  assert.equal(JSON.stringify(poisoned.body).includes(token), false);
});

test("普通实例仍 disabled，旧共享令牌只能收到迁移拒绝", async (t) => {
  const f = await setup(t, { modelBindingEnabled: false, modelCommandToken: "legacy-shared-token" });
  assert.equal((await f.bind(f.created)).status, 503);
  assert.equal((await f.view(f.created)).body.view.model_connection.state, "disabled");
  const legacy = await f.model("legacy-shared-token", "ai.take_intents");
  assert.equal(legacy.status, 403);
  assert.equal(legacy.body.code, "model_binding_required");
  assert.equal((await f.model(null, "ai.take_intents")).status, 503);
});

test("逐席接入已开启也不允许旧共享令牌借用现有绑定", async (t) => {
  const f = await setup(t, { modelCommandToken: "legacy-enabled-token" });
  const binding = await f.bind(f.created);
  assert.equal(binding.status, 200);
  assert.equal((await f.model(binding.body.connection.model_token, "ai.take_intents")).status, 200);
  await f.say(f.created, "legacy-must-not-claim");
  const dispatch = f.core.dispatch.bind(f.core);
  let coreCalls = 0;
  f.core.dispatch = async (...args) => { coreCalls += 1; return dispatch(...args); };
  const legacy = await f.model("legacy-enabled-token", "ai.take_intents");
  assert.equal(legacy.status, 403);
  assert.equal(legacy.body.code, "model_binding_required");
  assert.equal(legacy.body.result, undefined);
  assert.equal((await f.model("legacy-enabled-token", "ai.resolve", { turn_id: "forged", decision: "public_speech", text: "forged" })).status, 403);
  assert.equal(coreCalls, 0, "旧令牌在协调器鉴权即拒，既不能领取也不能发言");
  assert.equal([...f.surface.orchestrator.ai.workItems.values()].every((item) => item.claim_count === 0), true);
  assert.equal(f.surface.orchestrator.ai.events.some((event) => event.type === "AI_PUBLIC_SPEECH"), false);
});

test("模型命令仍在资格检查时撤销，旧世代不能继续提交到权威", async (t) => {
  const f = await setup(t);
  const binding = (await f.bind(f.created)).body;
  await f.say(f.created, "not-submitted-canary");
  const claimed = (await f.model(binding.connection.model_token, "ai.take_intents")).body.result.intents;
  assert.equal(claimed.length, 1);
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  let hold = true;
  let starts = 0;
  f.core.dispatch = async (command, params) => {
    if (command === "ai.start") starts += 1;
    const result = await dispatch(command, params);
    if (command === "view.hand" && hold) { hold = false; reached.resolve(); await release.promise; }
    return result;
  };
  const waiting = f.model(binding.connection.model_token, "ai.start", { intent_id: claimed[0].intent_id });
  const refused = await withHeldOperation({ operation: waiting, reached, release }, async () => {
    assert.equal((await f.unbind(f.created)).status, 200);
  });
  assert.equal(refused.status, 403);
  assert.equal(starts, 0, "资格检查后必须再验世代，不能在撤销后才把旧命令送进核心");
  assert.equal(f.surface.orchestrator.ai.seats.get(f.created.seat_id).active_turn, null);
});

test("在手席位离桌立即围住并发绑定；凭据尚未正式释放也不能重新配对", async (t) => {
  const f = await setup(t);
  for (const seat of [f.created, f.joined]) await f.act(seat, "seat.ready");
  await f.core.dispatch("hand.evaluate_start");
  f.advance(3_500);
  assert.equal((await f.core.dispatch("hand.start_if_due")).started, true);
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  let hold = true;
  f.core.dispatch = async (command, params) => {
    const result = await dispatch(command, params);
    if (command === "view.hand" && hold) { hold = false; reached.resolve(); await release.promise; }
    return result;
  };
  const pending = f.bind(f.created, "leave-racing-binding-key");
  const refused = await withHeldOperation({ operation: pending, reached, release }, async () => {
    assert.equal((await f.act(f.created, "seat.leave")).status, 200);
  });
  assert.equal(refused.body.ok, false);
  assert.equal(refused.body.connection, undefined);
  const seat = (await f.core.dispatch("view.seat", { seat_id: f.created.seat_id })).seat;
  assert.equal(seat.privacy_fence, true);
  assert.equal(seat.credential_revoked, false, "这条覆盖离桌栅栏而不是只覆盖凭据已吊销");
  assert.equal((await f.bind(f.created)).status, 403);
});

test("较晚的新键绑定先完成后，较早的在途请求不能覆盖它", async (t) => {
  const f = await setup(t);
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  let hold = true;
  f.core.dispatch = async (command, params) => {
    const result = await dispatch(command, params);
    if (command === "view.hand" && hold) { hold = false; reached.resolve(); await release.promise; }
    return result;
  };
  const first = f.bind(f.created, "older-binding-request-key");
  let latest;
  const stale = await withHeldOperation({ operation: first, reached, release }, async () => {
    latest = await f.bind(f.created, "newer-binding-request-key");
    assert.equal(latest.status, 200);
  });
  assert.equal(stale.body.ok, false);
  assert.equal(stale.body.connection, undefined);
  assert.equal((await f.view(f.created)).body.view.model_connection.binding_id, latest.body.binding.binding_id);
  assert.deepEqual((await f.bind(f.created, "newer-binding-request-key")).body.connection, latest.body.connection);
});

test("绑定资格检查尚未完成时，内部驱动也不能抢这席", async (t) => {
  const calls = [];
  const f = await setup(t, { modelAdapter: { simulated: true, evaluate: async (input) => { calls.push(input); return { decision: "silent" }; } } });
  await f.say(f.created, "pending-binding-driver");
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  let hold = true;
  f.core.dispatch = async (command, params) => {
    const result = await dispatch(command, params);
    if (command === "view.hand" && hold) { hold = false; reached.resolve(); await release.promise; }
    return result;
  };
  const pending = f.bind(f.created);
  const binding = await withHeldOperation({ operation: pending, reached, release }, async () => {
    const round = await f.host.driveOnce();
    assert.equal(round.started, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].seat_id, f.joined.seat_id);
  });
  assert.equal(binding.status, 200);
  assert.equal((await f.model(binding.body.connection.model_token, "ai.take_intents")).body.result.intents.length, 1);
});

test("内部领取已经送出时换绑，只拒这一席响应，其他席位继续驱动", async (t) => {
  const calls = [];
  const f = await setup(t, { modelAdapter: { simulated: true, evaluate: async (input) => { calls.push(input); return { decision: "silent" }; } } });
  await f.say(f.created, "in-flight-internal-claim");
  const reached = deferred();
  const release = deferred();
  const dispatch = f.core.dispatch.bind(f.core);
  let hold = true;
  f.core.dispatch = async (command, params) => {
    const result = await dispatch(command, params);
    if (command === "ai.take_intents" && params.seat_id === f.created.seat_id && hold) {
      hold = false; reached.resolve(); await release.promise;
    }
    return result;
  };
  const driving = f.host.driveOnce();
  let binding;
  const round = await withHeldOperation({ operation: driving, reached, release }, async () => {
    binding = await f.bind(f.created);
    assert.equal(binding.status, 200);
  });
  assert.equal(round.started, 1);
  assert.equal(round.resolved, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].seat_id, f.joined.seat_id);
  assert.equal(f.host.modelSurface.trackedCount, 0);
  // 已提交核心的旧 claim 不回滚；既有30秒领取租约到期后，本席新绑定可重新领取。
  f.advance(30_001);
  const fresh = await f.model(binding.body.connection.model_token, "ai.take_intents");
  assert.equal(fresh.body.result.intents.length, 1);
  const started = await f.model(binding.body.connection.model_token, "ai.start", { intent_id: fresh.body.result.intents[0].intent_id });
  assert.equal(started.body.ok, true);
  assert.equal(started.body.result.model_context.seat_id, f.created.seat_id);
});

test("首次绑定资格检查暂时失败，核心恢复后相同请求键可重试；撤销过的失败键不能复活", async (t) => {
  const f = await setup(t);
  const dispatch = f.core.dispatch.bind(f.core);
  let failures = 1;
  f.core.dispatch = async (command, params) => {
    if (command === "view.hand" && failures > 0) {
      failures -= 1;
      throw Object.assign(new Error("temporary core outage"), { code: "core_request_failed", status: 502 });
    }
    return dispatch(command, params);
  };
  const key = "retryable-binding-request";
  const failed = await f.bind(f.created, key);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.code, "core_request_failed");
  assert.equal(failed.body.connection, undefined);
  const retried = await f.bind(f.created, key);
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.deepEqual((await f.bind(f.created, key)).body.connection, retried.body.connection);
  failures = 1;
  const cancelledKey = "cancelled-failed-request";
  assert.equal((await f.bind(f.created, cancelledKey)).status, 502);
  assert.equal((await f.unbind(f.created)).status, 200);
  assert.equal((await f.bind(f.created, cancelledKey)).status, 409);
  assert.equal((await f.view(f.created)).body.view.model_connection.state, "unbound");
});

for (const failure of ["injected", "transport"]) {
  test(`离桌提交前 ${failure} 失败后，仅本人新授权且权威复核通过才能重新绑定`, async (t) => {
    const evaluations = [];
    const f = await setup(t, { modelAdapter: { simulated: true, evaluate: async (input) => { evaluations.push(input); return { decision: "silent" }; } } });
    const oldKey = `failed-leave-old-key-${failure}`;
    const old = (await f.bind(f.created, oldKey)).body;
    await f.say(f.created, "failed-leave-does-not-resume-ai");
    const dispatch = f.core.dispatch.bind(f.core);
    let failLeave = true;
    let recordQualification = false;
    const qualifications = [];
    f.core.dispatch = async (command, params) => {
      if (recordQualification && ["view.hand", "view.seat"].includes(command)) qualifications.push(command);
      if (command === "seat.leave" && failLeave) {
        throw Object.assign(new Error("leave did not reach core"), { code: "core_request_failed", status: 502 });
      }
      return dispatch(command, params);
    };
    const failed = await f.act(f.created, "seat.leave", failure === "injected" ? { seat_id: f.joined.seat_id } : {});
    assert.equal(failed.status, failure === "injected" ? 400 : 502);
    assert.equal(failed.body.code, failure === "injected" ? "seat_id_not_model_supplied" : "core_request_failed");
    failLeave = false;
    const seat = (await dispatch("view.seat", { seat_id: f.created.seat_id })).seat;
    assert.equal(seat.privacy_fence, false);
    assert.equal(seat.leave_requested, false);
    assert.equal(seat.credential_revoked, false);
    assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
    assert.equal((await f.view(f.created)).body.view.model_connection.state, "unbound");
    assert.equal((await f.post("/api/session/resume", { session_token: f.created.session_token })).status, 200);
    assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
    assert.equal((await f.host.driveOnce()).started, 1);
    assert.deepEqual(evaluations.map((input) => input.seat_id), [f.joined.seat_id], "失败和刷新都不能自动恢复退出席的内部AI驱动");
    assert.notEqual((await f.bind(f.created, oldKey)).status, 200, "旧请求键不能恢复退出前的授权");
    assert.notEqual((await f.bind(f.created, `unconfirmed-new-key-${failure}`, { acknowledged: false })).status, 200);
    recordQualification = true;
    const fresh = await f.bind(f.created, `explicit-rebind-after-leave-${failure}`);
    assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
    assert.deepEqual(qualifications.slice(0, 2), ["view.hand", "view.seat"], "新授权须重新向权威验证本人凭据和席位栅栏");
    assert.notEqual(fresh.body.connection.model_token, old.connection.model_token);
    assert.notEqual(fresh.body.binding.binding_id, old.binding.binding_id);
    assert.equal((await f.model(fresh.body.connection.model_token, "ai.take_intents")).status, 200);
    assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
    assert.equal((await f.bind(f.created, oldKey)).status, 409);
  });
}

for (const inHand of [false, true]) {
  test(`离桌已提交但响应丢失，${inHand ? "在手privacy fence" : "已释放席位"}不能被新绑定恢复`, async (t) => {
    const f = await setup(t);
    const old = (await f.bind(f.created)).body;
    if (inHand) {
      for (const seat of [f.created, f.joined]) await f.act(seat, "seat.ready");
      await f.core.dispatch("hand.evaluate_start");
      f.advance(3_500);
      assert.equal((await f.core.dispatch("hand.start_if_due")).started, true);
    }
    const dispatch = f.core.dispatch.bind(f.core);
    f.core.dispatch = async (command, params) => {
      const result = await dispatch(command, params);
      if (command === "seat.leave") {
        throw Object.assign(new Error("committed leave response lost"), { code: "core_request_failed", status: 502 });
      }
      return result;
    };
    assert.equal((await f.act(f.created, "seat.leave")).status, 502);
    const seat = (await dispatch("view.seat", { seat_id: f.created.seat_id })).seat;
    assert.equal(seat.privacy_fence, true);
    assert.equal(seat.leave_requested, true);
    assert.equal(seat.credential_revoked, !inHand);
    const denied = await f.bind(f.created);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.connection, undefined);
    assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
    assert.equal(f.host.modelBindings.size, 0);
  });
}

test("外部单席领取的核心502必须直接返回错误，不能伪装为无待办", async (t) => {
  const f = await setup(t);
  const binding = (await f.bind(f.created)).body;
  const dispatch = f.core.dispatch.bind(f.core);
  let failTake = true;
  let qualifications = 0;
  f.core.dispatch = async (command, params) => {
    if (["view.hand", "view.seat"].includes(command)) qualifications += 1;
    if (command === "ai.take_intents" && failTake) {
      throw Object.assign(new Error("claim core unavailable"), { code: "core_request_failed", status: 502 });
    }
    return dispatch(command, params);
  };
  const failed = await f.model(binding.connection.model_token, "ai.take_intents");
  assert.equal(failed.status, 502, JSON.stringify(failed.body));
  assert.equal(failed.body.ok, false);
  assert.equal(failed.body.code, "core_request_failed");
  assert.equal(failed.body.result, undefined, "不能同时带waiting_on或空intents给MCP解释为空闲");
  assert.equal(qualifications, 4, "领取前后的凭据和席位检查都正常，失败只来自领取操作");
  failTake = false;
  assert.equal((await f.model(binding.connection.model_token, "ai.take_intents")).status, 200);
});

test("任一离桌仍在途时不能新授权；较早失败不能解除较晚离桌的围栏", async (t) => {
  const f = await setup(t);
  const old = (await f.bind(f.created)).body;
  const dispatch = f.core.dispatch.bind(f.core);
  const reached = [deferred(), deferred()];
  const release = [deferred(), deferred()];
  let leaves = 0;
  f.core.dispatch = async (command, params) => {
    if (command === "seat.leave") {
      const index = leaves++;
      reached[index].resolve();
      await release[index].promise;
      throw Object.assign(new Error("pending leave never committed"), { code: "core_request_failed", status: 502 });
    }
    return dispatch(command, params);
  };
  const first = f.act(f.created, "seat.leave");
  await withHeldOperation({ operation: first, reached: reached[0], release: release[0] }, async () => {
    const second = f.act(f.created, "seat.leave");
    const secondResult = await withHeldOperation({ operation: second, reached: reached[1], release: release[1] }, async () => {
      assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
      assert.equal((await f.bind(f.created)).status, 403);
      release[0].resolve();
      assert.equal((await first).status, 502);
      assert.equal((await f.bind(f.created)).status, 403, "一次失败不能把另一条在途leave当作已结束");
    });
    assert.equal(secondResult.status, 502);
  });
  assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
  const fresh = await f.bind(f.created);
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.equal((await f.model(fresh.body.connection.model_token, "ai.take_intents")).status, 200);
});

for (const committed of [false, true]) {
  test(`恢复绑定的权威复核响应晚于新leave（${committed ? "已提交" : "未提交"}），不能撤回新围栏`, async (t) => {
    const f = await setup(t);
    const old = (await f.bind(f.created)).body;
    const dispatch = f.core.dispatch.bind(f.core);
    let leaves = 0;
    let holdQualification = false;
    const reached = deferred();
    const release = deferred();
    f.core.dispatch = async (command, params) => {
      if (command === "seat.leave" && (++leaves === 1 || !committed)) {
        throw Object.assign(new Error("leave did not reach authority"), { code: "core_request_failed", status: 502 });
      }
      const result = await dispatch(command, params);
      if (command === "view.seat" && params.seat_id === f.created.seat_id && holdQualification) {
        holdQualification = false;
        reached.resolve();
        await release.promise;
      }
      return result;
    };
    assert.equal((await f.act(f.created, "seat.leave")).status, 502);
    holdQualification = true;
    const pending = f.bind(f.created, "stale-recovery-qualification-key");
    const stale = await withHeldOperation({ operation: pending, reached, release }, async () => {
      assert.equal((await f.act(f.created, "seat.leave")).status, committed ? 200 : 502);
    });
    assert.equal(stale.status, 403);
    assert.equal(stale.body.connection, undefined);
    assert.equal(f.host.modelBindings.size, 0);
    assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
    assert.equal((await f.bind(f.created, "stale-recovery-qualification-key")).status, 409);
    const latest = await f.bind(f.created);
    assert.equal(latest.status, committed ? 403 : 200, JSON.stringify(latest.body));
  });
}

test("离桌失败后的新授权若资格传输也暂时失败，同世代未生效的新键仍可重试", async (t) => {
  const f = await setup(t);
  const old = (await f.bind(f.created, "before-failed-leave-key")).body;
  const dispatch = f.core.dispatch.bind(f.core);
  let failedQualifications = 1;
  f.core.dispatch = async (command, params) => {
    if (command === "seat.leave" || (command === "view.hand" && failedQualifications-- > 0)) {
      throw Object.assign(new Error("temporary leave/qualification outage"), { code: "core_request_failed", status: 502 });
    }
    return dispatch(command, params);
  };
  assert.equal((await f.act(f.created, "seat.leave")).status, 502);
  const key = "retry-new-authorization-key";
  assert.equal((await f.bind(f.created, key)).status, 502);
  assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
  const fresh = await f.bind(f.created, key);
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.deepEqual((await f.bind(f.created, key)).body.connection, fresh.body.connection);
  assert.equal((await f.bind(f.created, "before-failed-leave-key")).status, 409);
  assert.equal((await f.model(old.connection.model_token, "ai.take_intents")).status, 403);
});

for (const command of ["ai.take_intents", "ai.start"]) {
  test(`席位保留窗已到期，直接${command}不得领取或启动未消费意图（不经公开投影）`, async (t) => {
    const f = await setup(t);
    await f.say(f.created, "unconsumed-intent-before-expiry");
    const ai = f.surface.orchestrator.ai;
    const item = [...ai.workItems.values()].find((entry) => entry.seat_id === f.created.seat_id);
    assert.ok(item);
    assert.equal(item.claim_count, 0);
    const session = f.host.sessions.get(f.created.session_token);
    const params = f.host.injected(command, session, command === "ai.start" ? { intent_id: item.intent_id } : {});
    assert.equal((await f.post("/api/session/disconnect", { session_token: f.created.session_token, connection_id: f.created.connection_id })).status, 200);
    f.advance(120_001);
    // 只读原始测试对象，确保断线后没有projection/tick/资格探针先替命令做清理。
    assert.equal(f.surface.orchestrator.rooms.seats.get(f.created.seat_id).credential_revoked, false);
    let error;
    try { await f.core.dispatch(command, params); } catch (caught) { error = caught; }
    assert.equal(item.claim_count, 0, "不能先领取再靠响应净化或读取projection释放席位来掩盖副作用");
    assert.equal(ai.events.some((event) => event.type === "SEAT_AI_EVALUATION_STARTED" && event.payload.seat_id === f.created.seat_id), false);
    assert.equal(error?.code, "seat_credential_revoked");
    assert.equal(error?.status, 403);
    assert.equal(f.surface.orchestrator.rooms.seats.get(f.created.seat_id).credential_revoked, true);
  });
}
