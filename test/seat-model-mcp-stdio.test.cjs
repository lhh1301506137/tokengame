"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { createCommandServer } = require("../src/authority/command-server.cjs");
const { HttpCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { startSeatMcp } = require("../test-support/mcp-stdio-client.cjs");

async function setup(t) {
  const coreServer = createCommandServer({ internalToken: "stdio-test-core-only" });
  const coreOrigin = await coreServer.start({ port: 0 });
  const host = new TableWebHost({
    core: new HttpCoreClient({ origin: coreOrigin, token: "stdio-test-core-only" }), modelBindingEnabled: true,
  });
  const origin = await host.start({ port: 0 });
  const artifactRoot = path.resolve(__dirname, "../artifacts");
  fs.mkdirSync(artifactRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(artifactRoot, "seat-mcp-stdio-"));
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map((client) => client.stop()));
    await host.stop();
    await coreServer.stop();
    assert.equal(path.dirname(dir), artifactRoot);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const post = async (route, body) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const value = await response.json();
    assert.equal(response.status, 200, `${route}:${value.code ?? ""}`);
    assert.equal(value.ok, true, `${route}:${value.code ?? ""}`);
    return value;
  };
  const act = (seat, command, params = {}) => post("/api/action", { session_token: seat.session_token, command, params });
  const mcp = (file) => {
    const client = startSeatMcp(file);
    clients.push(client);
    return client;
  };
  return { host, coreServer, post, act, mcp, dir, origin };
}

test("两个独立 MCP stdio 进程从各自文件接到同桌本席：私有上下文、发言、撤销不串席", async (t) => {
  const f = await setup(t);
  const a = await f.post("/api/room/create", { player_id: "stdio-a", table_rules_version: "rules-v1" });
  const b = await f.post("/api/room/join", { player_id: "stdio-b", invite_code: a.invite_code });
  const seats = [a, b];
  const connections = [];
  const clients = [];
  for (let index = 0; index < seats.length; index++) {
    const seat = seats[index];
    await f.act(seat, "room.confirm_public_scope", { acknowledged: true });
    const bound = await f.post("/api/model/bind", {
      session_token: seat.session_token, acknowledged: true, binding_request_id: `stdio-model-binding-request-${index}`,
    });
    connections.push(bound.connection);
    const file = path.join(f.dir, `${index}.json`);
    fs.writeFileSync(file, JSON.stringify(bound.connection), { mode: 0o600 });
    const client = f.mcp(file);
    clients.push(client);
    const initialized = await client.request("initialize", { protocolVersion: "2025-06-18" });
    assert.equal(initialized.error, undefined);
    const tools = (await client.request("tools/list")).result.tools;
    assert.ok(tools.some((tool) => tool.name === "tokengame_table"));
    const idle = await client.table("ai.take_intents");
    assert.equal(idle.isError, false, idle.body.code);
    assert.equal(idle.body.result.seats_polled, 1);
    await f.act(seat, "seat.ready", { ready: true });
  }
  let publicHand = null;
  for (let attempt = 0; attempt < 80 && publicHand === null; attempt++) {
    const result = await clients[0].table("view.projection");
    assert.equal(result.isError, false, result.body.code);
    publicHand = result.body.result.public_hand;
    if (publicHand === null) await new Promise((resolve) => setTimeout(resolve, 75));
  }
  assert.ok(publicHand !== null, "权威到期驱动必须开局，不能拿空结果通过下文");
  const contexts = [];
  for (let index = 0; index < clients.length; index++) {
    const client = clients[index];
    const claim = await client.table("ai.take_intents");
    assert.equal(claim.isError, false, claim.body.code);
    assert.equal(claim.body.result.seats_polled, 1);
    assert.equal(claim.body.result.intents.length, 1);
    const intentId = claim.body.result.intents[0].intent_id;
    const foreign = await clients[1 - index].table("ai.start", { intent_id: intentId });
    assert.equal(foreign.isError, true, "另一 stdio 进程不能使用本席待办");
    const start = await client.table("ai.start", { intent_id: intentId });
    assert.equal(start.isError, false, start.body.code);
    const context = start.body.result.model_context;
    assert.equal(context.schema, "tokengame.seat-ai-context.v1");
    assert.equal(context.seat_id, seats[index].seat_id);
    const own = context.hand.seats.find((seat) => seat.id === `stdio-${index === 0 ? "a" : "b"}`);
    assert.equal(own.hole_cards.length, 2);
    assert.ok(context.hand.seats.filter((seat) => seat !== own).every((seat) => seat.hole_cards === null));
    contexts.push(context);
    const done = await client.table("ai.resolve", {
      turn_id: start.body.result.started.turn_id, decision: "public_speech", text: `本席 stdio-${index} 的测试发言`,
    });
    assert.equal(done.isError, false, done.body.code);
  }
  assert.notDeepEqual(contexts[0].hand, contexts[1].hand, "两席私有投影必须不同");
  const timeline = await clients[1].table("view.timeline");
  assert.equal(timeline.isError, false, timeline.body.code);
  for (const text of ["本席 stdio-0 的测试发言", "本席 stdio-1 的测试发言"]) {
    assert.ok(timeline.raw.includes(text), "两个进程的发言必须进入同一条公共时间线");
  }
  assert.equal(timeline.raw.includes('"model_context"'), false);
  await f.post("/api/model/unbind", { session_token: a.session_token });
  assert.equal((await clients[0].table("view.projection")).isError, true);
  assert.equal((await clients[1].table("view.projection")).isError, false);
  const secrets = [
    ...connections.map((item) => item.model_token), ...seats.map((item) => item.session_token),
    ...[...f.coreServer.surface.orchestrator.rooms.seats.values()].map((seat) => seat.recovery_credential),
    ...f.host.custody.handles(),
  ];
  for (const client of clients) {
    const transcript = client.transcript.join("\n") + client.stderr();
    assert.ok(transcript.includes("tokengame.seat-ai-context.v1"));
    for (const secret of secrets) {
      assert.equal(typeof secret, "string");
      assert.ok(secret.length >= 8);
      assert.equal(transcript.includes(secret), false, "私有传输/真人/核心权限不得进入 MCP 输出");
    }
    assert.equal(client.stderr(), "");
  }
});

test("真实 MCP stdio 对未配置、错误文件、错误逐席令牌明确失败而非空转成功", async (t) => {
  const f = await setup(t);
  const unconfigured = f.mcp();
  const missing = await unconfigured.table("ai.take_intents");
  assert.equal(missing.isError, true);
  assert.equal(missing.body.code, "model_command_token_not_configured");
  assert.match(missing.body.hint, /下载/);
  const file = path.join(f.dir, "broken.json");
  fs.writeFileSync(file, "broken-file-do-not-echo");
  const broken = await f.mcp(file).table("ai.take_intents");
  assert.equal(broken.isError, true);
  assert.equal(broken.body.code, "model_connection_invalid");
  assert.equal(broken.raw.includes("broken-file-do-not-echo"), false);
  assert.equal(broken.raw.includes(file), false);
  // 不是坏文件，而是形状合法、服务端未授权的连接文件。
  const wrongToken = "unbound-token-".padEnd(48, "x");
  fs.writeFileSync(file, JSON.stringify({
    schema: "tokengame.model-connection.v1", table_origin: f.origin, model_token: wrongToken,
  }));
  const denied = await f.mcp(file).table("ai.take_intents");
  assert.equal(denied.isError, true);
  assert.notEqual(denied.body.code, "model_connection_invalid", "必须到达协调器，不可把无效测试夹具当成授权检查");
  assert.equal(denied.raw.includes(wrongToken), false);
});
