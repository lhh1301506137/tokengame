"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { startBeta } = require("../src/run-beta.cjs");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { createCommandServer } = require("../src/authority/command-server.cjs");
const { MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");
const { summarizeAiReceipts } = require("../test-support/summarize-ai-receipts.cjs");
const { startBetaProcess } = require("../test-support/beta-process.cjs");

const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "src/run-beta.cjs");
function isolatedEnv(extra = {}) {
  return {
    ...process.env, TOKENGAME_WEB_PORT: "0", TOKENGAME_WEB_HOST: "127.0.0.1",
    TOKENGAME_COMMAND_ORIGIN: "", TOKENGAME_MODEL_ADAPTER: "", TOKENGAME_MODEL_TOKEN: "",
    TOKENGAME_MODEL_CONNECTION_FILE: "", TOKENGAME_AI_RECEIPT_FILE: "",
    TOKENGAME_CODEX_WAKE: "", TOKENGAME_CODEX_EXECUTABLE: "", TOKENGAME_CODEX_CWD: "", TOKENGAME_CODEX_THREAD: "", ...extra,
  };
}
function resources(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-beta-receipts-"));
  const cleanup = [];
  t.after(async () => {
    for (const close of cleanup.reverse()) await close();
    const actual = fs.realpathSync(dir);
    assert.equal(path.dirname(actual).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(actual).startsWith("tokengame-beta-receipts-"));
    fs.rmSync(actual, { recursive: true, force: true });
  });
  return { dir, file: path.join(dir, "capture.jsonl"), own: (close) => cleanup.push(close) };
}

async function seats(origin) {
  const post = async (route, body, headers = {}) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
    const value = await response.json();
    assert.equal(response.status, 200, `${route}: ${value.code ?? "status"}`);
    assert.equal(value.ok, true, `${route}: ${value.code ?? "not_ok"}`);
    return value;
  };
  const a = await post("/api/room/create", { player_id: "NICK_PRIVATE_SENTINEL_A", table_rules_version: "rules" });
  const b = await post("/api/room/join", { player_id: "NICK_PRIVATE_SENTINEL_B", invite_code: a.invite_code });
  const act = (seat, command, params = {}) => post("/api/action", { session_token: seat.session_token, command, params });
  for (const seat of [a, b]) await act(seat, "room.confirm_public_scope", { acknowledged: true });
  const binding = await post("/api/model/bind", {
    session_token: a.session_token, acknowledged: true, binding_request_id: "receipt-private-binding-request-01",
  });
  const modelToken = binding.connection.model_token;
  const model = async (command, params = {}) => {
    const value = await post("/api/model/command", requestEnvelope(command, params), { [MODEL_COMMAND_TOKEN_HEADER]: modelToken });
    return value.result;
  };
  const say = (text) => act(b, "chat.say", { text, idempotency_key: require("node:crypto").randomUUID() });
  return { a, b, act, model, modelToken, say };
}

test("真实 beta 可调用入口经 HTTP 模型命令产生 public/silent 回执，不用测试替身替代权威", async (t) => {
  const own = resources(t);
  let at = 1_000_000;
  const surface = new CommandSurface({ now: () => at });
  const run = await startBeta({ env: isolatedEnv({ TOKENGAME_AI_RECEIPT_FILE: own.file }), surface });
  own.own(() => run.close());
  assert.equal(run.banner.proactive_wake_verified, false);
  assert.equal(run.banner.core_transport, "in_process");
  assert.equal(surface.orchestrator.ai.listeners.size, 1);
  const f = await seats(run.origin);
  for (const seat of [f.a, f.b]) await f.act(seat, "seat.ready");
  surface.dispatch("hand.evaluate_start");
  at += 3500;
  surface.dispatch("hand.start_if_due");
  assert.equal(surface.orchestrator.ai.handIndex, 1);
  const privateCards = [];
  for (const decision of ["public_speech", "silent"]) {
    await f.say(`CHAT_PRIVATE_SENTINEL_${decision}`);
    const claim = await f.model("ai.take_intents");
    assert.equal(claim.intents.length, 1);
    at += 19;
    const started = await f.model("ai.start", { intent_id: claim.intents[0].intent_id });
    const ownSeat = started.model_context.hand.seats.find((seat) => seat.id === "NICK_PRIVATE_SENTINEL_A");
    assert.equal(ownSeat.hole_cards.length, 2, "本次测试必须真的经过私有手牌上下文");
    privateCards.push(...ownSeat.hole_cards);
    at += 31;
    await f.model("ai.resolve", { turn_id: started.started.turn_id, decision, text: "AI_PRIVATE_SENTINEL_OUTPUT" });
    at += 5000;
  }
  const close = run.close();
  assert.equal(run.close(), close);
  assert.equal((await close).capture_complete, true);
  assert.equal(surface.orchestrator.ai.listeners.size, 0);
  assert.equal(run.host.server.listening, false);
  const raw = fs.readFileSync(own.file, "utf8");
  for (const secret of ["PRIVATE_SENTINEL", f.modelToken, f.a.session_token, f.b.session_token,
    "model_context", "hole_cards", ...privateCards.map((card) => JSON.stringify(card))]) {
    assert.equal(raw.includes(secret), false, "回执泄漏了真实 HTTP 链路的敏感字段");
  }
  const summary = summarizeAiReceipts(raw);
  assert.equal(summary.status, "complete", JSON.stringify(summary.issues));
  assert.equal(summary.counts.turns, 2);
  assert.equal(summary.counts.public_speech, 1);
  assert.equal(summary.counts.silent, 1);
  assert.equal(summary.gate5_evaluated, false);
  for (const turn of summary.turns) assert.deepEqual(turn.timing_ms, {
    source_to_start: 19, start_to_terminal: 31, source_to_terminal: 50, reclaim_to_late_output: null,
  });
});

test("默认 beta 不订阅/不建文件；远程 core 默认兼容但显式回执配置在监听前拒绝", async (t) => {
  const own = resources(t);
  const surface = new CommandSurface({});
  const local = await startBeta({ env: isolatedEnv(), surface });
  own.own(() => local.close());
  assert.equal(local.receipts, null);
  assert.equal(surface.orchestrator.ai.listeners.size, 0);
  assert.deepEqual(fs.readdirSync(own.dir), []);
  await local.close();
  const commandServer = createCommandServer({ surface: new CommandSurface({}), dueWork: false, internalToken: "owned-test-core" });
  const commandOrigin = await commandServer.start({ port: 0 });
  own.own(() => commandServer.stop());
  const env = isolatedEnv({ TOKENGAME_COMMAND_ORIGIN: commandOrigin, TOKENGAME_AUTHORITY_TOKEN: "owned-test-core" });
  const remote = await startBeta({ env });
  own.own(() => remote.close());
  assert.equal(remote.banner.core_transport, "http");
  assert.equal(remote.receipts, null);
  await seats(remote.origin);
  await remote.close();
  await assert.rejects(async () => {
    const unexpected = await startBeta({ env: { ...env, TOKENGAME_AI_RECEIPT_FILE: own.file } });
    own.own(() => unexpected.close());
  }, { code: "ai_receipt_remote_core_unsupported", message: "ai_receipt_remote_core_unsupported" });
  assert.equal(fs.existsSync(own.file), false);
});

test("beta 监听启动失败释放订阅与本批句柄，尾记录明确 startup_failed", async (t) => {
  const own = resources(t);
  const surface = new CommandSurface({});
  await assert.rejects(async () => {
    const unexpected = await startBeta({
      env: isolatedEnv({ TOKENGAME_AI_RECEIPT_FILE: own.file, TOKENGAME_WEB_HOST: "0.0.0.0" }), surface,
    });
    own.own(() => unexpected.close());
  }, { code: "local_bridge_auth_unresolved" });
  assert.equal(surface.orchestrator.ai.listeners.size, 0);
  const before = fs.readFileSync(own.file, "utf8");
  surface.orchestrator.ai.startHand();
  assert.equal(fs.readFileSync(own.file, "utf8"), before);
  const summary = summarizeAiReceipts(before);
  assert.equal(summary.status, "partial", JSON.stringify(summary.issues));
  assert.equal(summary.capture.stop_reason, "startup_failed");
  // Windows 上 rename 也实际检查启动失败没有留下本批打开的可写句柄。
  const moved = path.join(own.dir, "failed-start.jsonl");
  fs.renameSync(own.file, moved);
  assert.equal(fs.existsSync(moved), true);
});

test("CLI 文件冲突、不可写目录和远程配置的失败输出不泄漏私有路径", (t) => {
  const own = resources(t);
  fs.writeFileSync(own.file, "OLD_EVIDENCE_PRIVATE_SENTINEL", { flag: "wx" });
  const cases = [
    { env: { TOKENGAME_AI_RECEIPT_FILE: own.file }, code: "ai_receipt_file_exists" },
    { env: { TOKENGAME_AI_RECEIPT_FILE: path.join(own.dir, "PATH_PRIVATE_SENTINEL", "absent.jsonl") }, code: "ai_receipt_open_failed" },
    { env: { TOKENGAME_AI_RECEIPT_FILE: own.file, TOKENGAME_COMMAND_ORIGIN: "http://127.0.0.1:1" }, code: "ai_receipt_remote_core_unsupported" },
  ];
  for (const item of cases) {
    const child = spawnSync(process.execPath, [ENTRY], { env: isolatedEnv(item.env), cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 10_000 });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.ok(child.stderr.includes(item.code));
    assert.equal(child.stderr.includes("PRIVATE_SENTINEL"), false);
    assert.equal(child.stderr.includes(own.dir), false);
  }
  assert.equal(fs.readFileSync(own.file, "utf8"), "OLD_EVIDENCE_PRIVATE_SENTINEL");
});

for (const fault of ["none", "close", "footer_write"]) {
  test(`真实 beta CLI ${fault} 收尾：文件完整性与 writer/close 回执分别报告`, async (t) => {
    const own = resources(t);
    const preload = path.join(own.dir, "owned-io-fault.cjs");
    // 仅此测试子进程的 Node preload：不新增产品调试通道，不改宿主/模型配置。
    fs.writeFileSync(preload, `"use strict";
const fs = require("node:fs/promises");
const open = fs.open;
const fault = ${JSON.stringify(fault)};
fs.open = async (...args) => {
  const handle = await open(...args);
  if (args[0] !== process.env.TOKENGAME_AI_RECEIPT_FILE) return handle;
  return {
    async write(...values) {
      const result = await handle.write(...values);
      if (fault === "footer_write" && values[0].toString().includes('"kind":"footer"')) throw new Error("PRIVATE_IO_SENTINEL");
      return result;
    },
    async close() { await handle.close(); if (fault === "close") throw new Error("PRIVATE_IO_SENTINEL"); },
  };
};
`, { flag: "wx" });
    const run = startBetaProcess({ env: { TOKENGAME_AI_RECEIPT_FILE: own.file }, execArgv: ["--require", preload] });
    own.own(() => run.forceKill());
    await run.ready;
    let ended;
    if (fault === "none") ended = await run.stop();
    else await assert.rejects(run.stop(), (error) => {
      ended = error.result;
      return ended?.graceful === false && ended?.exit_code === 1;
    });
    assert.equal(ended.exit_observed, true);
    assert.equal(ended.forced, false);
    const child = { status: ended.exit_code, stdout: run.stdout(), stderr: run.stderr() };
    assert.equal(child.status, fault === "none" ? 0 : 1, child.stderr);
    const statuses = child.stderr.split("\n").filter((line) => line.startsWith("{")).map(JSON.parse);
    assert.equal(statuses.length, 1);
    const status = statuses[0];
    assert.equal(status.schema, "tokengame.ai-lifecycle-close.v1");
    assert.equal(status.run_complete, fault === "none");
    assert.equal(status.capture_complete, fault === "footer_write" ? null : true);
    assert.equal(status.write_acknowledged, fault !== "footer_write");
    assert.equal(status.close_succeeded, fault !== "close");
    const raw = fs.readFileSync(own.file, "utf8");
    assert.equal(status.run_ref, JSON.parse(raw.split("\n")[0]).run_ref);
    const summary = summarizeAiReceipts(raw);
    assert.equal(summary.capture.complete, true);
    assert.equal(summary.resource_close_status, "unknown");
    assert.equal(summary.writer_acknowledgement_status, "unknown");
    assert.equal(summary.gate5_evaluated, false);
    assert.equal((raw + child.stdout + child.stderr).includes("PRIVATE_IO_SENTINEL"), false);
    assert.equal((child.stdout + child.stderr).includes(own.dir), false);
  });
}

async function startCli(own) {
  const run = startBetaProcess({ env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
  own.own(() => run.forceKill());
  await run.ready;
  return { ...run, output: () => run.stdout() + run.stderr() };
}

test("真实 fork + 两席 HTTP 脚本终态经正常 IPC 收尾，非空文件与进程回执对应", async (t) => {
  const own = resources(t);
  const run = await startCli(own);
  const f = await seats(run.banner.origin);
  await f.say("CHAT_PRIVATE_SENTINEL_GRACEFUL");
  const claim = await f.model("ai.take_intents");
  assert.equal(claim.intents.length, 1);
  const started = await f.model("ai.start", { intent_id: claim.intents[0].intent_id });
  await f.model("ai.resolve", {
    turn_id: started.started.turn_id, decision: "public_speech", text: "AI_PRIVATE_SENTINEL_GRACEFUL",
  });
  const ended = await run.stop();
  assert.deepEqual(ended, { graceful: true, exit_code: 0, signal: null, forced: false,
    exit_observed: true, output_complete: true, reason: null });
  const { hostname, port } = new URL(run.banner.origin);
  await assert.rejects(new Promise((resolve, reject) => {
    const socket = require("node:net").connect({ host: hostname, port: Number(port) });
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error("port_check_timeout")); });
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("error", (error) => { socket.destroy(); reject(error); });
  }), { code: "ECONNREFUSED" });
  const raw = fs.readFileSync(own.file, "utf8");
  const rows = raw.trim().split("\n").map(JSON.parse);
  assert.equal(rows.filter((row) => row.type === "PLAYER_PUBLIC_SPEECH").length, 1);
  assert.equal(rows.filter((row) => row.type === "SEAT_AI_EVALUATION_STARTED").length, 1);
  assert.equal(rows.filter((row) => row.type === "AI_PUBLIC_SPEECH").length, 1);
  assert.equal(rows.filter((row) => row.kind === "footer").length, 1);
  const statuses = run.stderr().split("\n").filter((line) => line.startsWith("{")).map(JSON.parse);
  assert.equal(statuses.length, 1);
  const status = statuses[0];
  assert.equal(status.schema, "tokengame.ai-lifecycle-close.v1");
  assert.equal(status.run_ref, rows[0].run_ref);
  assert.equal(status.run_ref, rows.at(-1).run_ref);
  assert.equal(status.capture_complete, true);
  assert.equal(status.write_acknowledged, true);
  assert.equal(status.close_succeeded, true);
  assert.equal(status.run_complete, true);
  const summary = summarizeAiReceipts(raw);
  assert.equal(summary.status, "complete", JSON.stringify(summary.issues));
  assert.equal(summary.counts.turns, 1);
  assert.equal(summary.counts.public_speech, 1);
  assert.equal(summary.counts.silent, 0);
  assert.equal(summary.gate5_evaluated, false);
  assert.equal(run.banner.proactive_wake_verified, false);
  for (const secret of ["PRIVATE_SENTINEL", f.modelToken, f.a.session_token, f.b.session_token, own.file]) {
    assert.equal((raw + run.output()).includes(secret), false);
  }
});

test("真实 CLI + HTTP 脚本 AI 可记录终态；非正常进程终止缺 footer 只能 partial", async (t) => {
  const own = resources(t);
  const run = await startCli(own);
  const f = await seats(run.banner.origin);
  await f.say("CHAT_PRIVATE_SENTINEL_CLI");
  const claim = await f.model("ai.take_intents");
  assert.equal(claim.intents.length, 1);
  const started = await f.model("ai.start", { intent_id: claim.intents[0].intent_id });
  await f.model("ai.resolve", { turn_id: started.started.turn_id, decision: "public_speech", text: "AI_PRIVATE_SENTINEL_CLI" });
  // HTTP 已证终态发生；这里只等异步文件排空，不靠睡眠推进游戏时钟。
  const deadline = Date.now() + 5000;
  let raw = "";
  while (Date.now() < deadline) {
    raw = fs.readFileSync(own.file, "utf8");
    if (raw.split("\n").some((line) => {
      try { return JSON.parse(line).type === "AI_PUBLIC_SPEECH"; } catch { return false; }
    })) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const summary = summarizeAiReceipts(raw);
  assert.equal(summary.counts.starts_observed, 1);
  assert.equal(summary.counts.public_speech, 1);
  assert.equal(summary.status, "partial");
  assert.equal(summary.capture.complete, false);
  assert.equal(summary.turns[0].terminal.type, "AI_PUBLIC_SPEECH");
  assert.equal(summary.turns[0].timing_ms.start_to_terminal, null);
  const exit = await run.forceKill();
  assert.equal(exit.graceful, false);
  assert.equal(exit.forced, true);
  assert.equal(exit.exit_observed, true);
  assert.equal(summarizeAiReceipts(fs.readFileSync(own.file, "utf8")).status, "partial");
  for (const secret of ["PRIVATE_SENTINEL", f.modelToken, f.a.session_token, f.b.session_token, own.file]) {
    assert.equal((raw + run.output()).includes(secret), false, "真实进程输出/回执泄漏敏感内容");
  }
  assert.equal(run.banner.proactive_wake_verified, false);
});
