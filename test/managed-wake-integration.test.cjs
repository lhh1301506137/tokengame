"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { createCodexQueueSender } = require("../src/host/codex-queue-sender.cjs");
const { startSeatMcp } = require("../test-support/mcp-stdio-client.cjs");

test("完整本地链路：真人HTTP→协调器→脚本queue进程→逐席MCP，两轮公开/沉默且单槽", { timeout: 20000 }, async (t) => {
  const root = path.resolve(__dirname, "..");
  const tempRoot = path.join(root, "artifacts");
  await fs.mkdir(tempRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(tempRoot, "b15-integration-private-"));
  const clients = [];
  const children = [];
  const notices = [];
  let host;
  t.after(async () => {
    const cleanup = await Promise.allSettled([
      ...clients.map((client) => client.stop()),
      ...children.map(async ({ child, closed }) => { if (child.exitCode === null && child.signalCode === null) child.kill(); await closed; }),
      host?.stop(),
    ]);
    // Only this test's freshly created directory; never any prior probe file.
    assert.ok(dir.startsWith(path.join(tempRoot, "b15-integration-private-")));
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(cleanup.filter((result) => result.status === "rejected").length, 0, "本批资源收尾有失败");
  });

  const threadId = randomUUID();
  const sender = createCodexQueueSender({ codexExecutable: process.execPath, cwd: root, threadId }, {
    spawn(exe, args, options) {
      assert.equal(exe, process.execPath); assert.equal(options.shell, false); assert.equal(args.length, 5);
      // This substitution is explicit test support, never a native Codex call.
      const child = spawn(process.execPath, [path.join(root, "test-support/fixtures/codex-queue-receiver.cjs"), "accept", ...args], options);
      const closed = new Promise((resolve) => child.once("close", resolve));
      children.push({ child, closed, message: args[4] });
      return child;
    },
  });
  const wakeQueue = async (input) => {
    const result = await sender(input);
    if (result.queued) notices.push({ intentId: input.intentId, threadId: input.threadId });
    return result;
  };
  Object.defineProperty(wakeQueue, "allowsThread", { value: sender.allowsThread });
  let at = 1_000_000;
  const now = () => at;
  const surface = new CommandSurface({ now });
  const core = new InProcessCoreClient({ surface });
  host = new TableWebHost({ core, now, modelBindingEnabled: true, wakeQueue,
    driveIntervalMs: 999999, sweepIntervalMs: 999999, wakeOptions: { pollIntervalMs: 10 } });
  const origin = await host.start({ port: 0 });
  const post = async (route, body) => {
    const response = await fetch(`${origin}${route}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    return { status: response.status, body: await response.json() };
  };
  const goodPost = async (route, body) => {
    const response = await post(route, body);
    assert.equal(response.status, 200, response.body.code); assert.equal(response.body.ok, true);
    return response.body;
  };
  const a = await goodPost("/api/room/create", { player_id: "managed-local-a", table_rules_version: "managed-rules" });
  const b = await goodPost("/api/room/join", { player_id: "managed-local-b", invite_code: a.invite_code });
  const act = (seat, command, params = {}) => goodPost("/api/action", { session_token: seat.session_token, command, params });
  const connections = [];
  for (const [index, seat] of [a, b].entries()) {
    await act(seat, "room.confirm_public_scope", { acknowledged: true });
    const bound = await goodPost("/api/model/bind", { session_token: seat.session_token, acknowledged: true, binding_request_id: randomUUID() });
    connections.push(bound.connection);
    const file = path.join(dir, `${index}.json`);
    await fs.writeFile(file, JSON.stringify(bound.connection), { flag: "wx", mode: 0o600 });
    const client = startSeatMcp(file); clients.push(client);
    const initialized = await client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "local-b15-script", version: "1" } });
    assert.ok(initialized.result);
    const listed = await client.request("tools/list");
    assert.equal(listed.result.tools.filter((tool) => tool.name === "tokengame_table").length, 1);
    await act(seat, "seat.ready", { ready: true });
  }
  await core.dispatch("hand.evaluate_start"); at += 3000; await core.dispatch("hand.start_if_due");
  assert.equal(surface.orchestrator.hand.status, "active");
  await act(b, "chat.say", { text: "local-source-one", idempotency_key: randomUUID() });
  const requestId = randomUUID();
  const startBody = { session_token: a.session_token, acknowledged: true, request_id: requestId,
    thread_id: threadId, max_notifications: 2, max_duration_ms: 10000 };
  await goodPost("/api/model/wake/start", startBody);
  const status = async () => (await goodPost("/api/model/wake/status", { session_token: a.session_token })).wake;
  const until = async (predicate) => {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const value = await predicate(); if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("本地整合条件在5秒内未达成");
  };
  await until(() => notices.length === 1);
  assert.equal((await clients[1].table("ai.start", { intent_id: notices[0].intentId })).isError, true);
  const started1 = await clients[0].table("ai.start", { intent_id: notices[0].intentId });
  assert.equal(started1.isError, false, started1.body.code);
  const context = started1.body.result.model_context;
  assert.equal(context.seat_id, a.seat_id);
  assert.equal(context.hand.seats.filter((seat) => seat.hole_cards !== null).length, 1);
  assert.equal(context.hand.seats.find((seat) => seat.id === "managed-local-a").hole_cards.length, 2);
  at += 5500;
  await act(b, "chat.say", { text: "local-source-two", idempotency_key: randomUUID() });
  const whileBusy = await status();
  assert.equal(whileBusy.queued_count, 1); assert.equal(whileBusy.resolved_count, 0);
  assert.equal(notices.length, 1, "只有queue ACK不能释放槽");
  const resolved1 = await clients[0].table("ai.resolve", { turn_id: started1.body.result.started.turn_id,
    decision: "public_speech", text: "本地脚本公开结果，不是真实模型生成。" });
  assert.equal(resolved1.isError, false, resolved1.body.code);
  await until(() => notices.length === 2);
  const started2 = await clients[0].table("ai.start", { intent_id: notices[1].intentId });
  assert.equal(started2.isError, false, started2.body.code);
  const resolved2 = await clients[0].table("ai.resolve", { turn_id: started2.body.result.started.turn_id, decision: "silent" });
  assert.equal(resolved2.isError, false, resolved2.body.code);
  const final = await until(async () => { const value = await status(); return value.state === "stopped" && value; });
  assert.equal(final.reason, "max_notifications"); assert.equal(final.cleanup_ok, true);
  assert.equal(final.attempted_count, 2); assert.equal(final.queued_count, 2); assert.equal(final.resolved_count, 2);
  assert.equal(final.native_turn_state, "unknown");
  const events = (await clients[1].table("view.timeline")).body.result.timeline;
  const players = events.filter((event) => event.type === "PLAYER_PUBLIC_SPEECH");
  const speeches = events.filter((event) => event.type === "AI_PUBLIC_SPEECH");
  assert.equal(players.length, 2); assert.equal(speeches.length, 1);
  assert.equal(speeches[0].payload.source_event_id, players[0].event_id);
  assert.equal(started2.body.result.started.source_event_id, players[1].event_id);
  assert.equal((await goodPost("/api/model/wake/start", startBody)).wake.state, "stopped");
  const foreign = await post("/api/model/wake/start", { ...startBody, session_token: b.session_token, request_id: randomUUID() });
  assert.equal(foreign.body.code, "wake_thread_in_use", "A的已结束上下文也不能给B");
  assert.equal(children.length, 2);
  for (const secret of [a.session_token, b.session_token, ...connections.map((connection) => connection.model_token), "local-source-one", "local-source-two"]) {
    assert.equal(JSON.stringify(final).includes(secret), false);
    assert.equal(children.some(({ message }) => message.includes(secret)), false);
  }
  await goodPost("/api/model/unbind", { session_token: a.session_token });
  assert.equal((await clients[0].table("view.projection")).body.code, "model_command_token_rejected");
});
