"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { finished } = require("node:stream/promises");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { run, launchConnector, connectorEnvironment } = require("../plugins/tokengame/codex/connect.cjs");
const { CONNECTOR_CONTROL_SCHEMA } = require("../plugins/tokengame/codex/run-connector.cjs");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");

function fixture(extra = {}) {
  let output = "";
  let errors = "";
  const calls = [];
  const repository = path.resolve(__dirname, "..");
  const threadId = randomUUID();
  const options = {
    env: { CODEX_THREAD_ID: threadId, CODEX_SESSION_ID: "old-session", TOKENGAME_MODEL_TOKEN: "must-not-inherit",
      TOKENGAME_PUBLIC_ORIGIN: "https://not-connector-config.example", OPENAI_BASE_URL: "user-provider-unchanged", KEEP: "yes" },
    resolveProject: () => ({ repository, project: repository }),
    resolveExecutable: () => process.execPath,
    connectionFile: () => path.join(repository, ".tokengame-private", "active-model-connection.json"),
    readConnection: () => { calls.push("read"); return { origin: "https://table.example", token: "private" }; },
    configure: () => { calls.push("configure"); return { changed: false }; },
    launch: async (config) => { calls.push(config); return { connected: true }; },
    stdout: { write: (text) => { output += text; } }, stderr: { write: (text) => { errors += text; } },
    ...extra,
  };
  return { options, calls, threadId, output: () => output, errors: () => errors };
}

test("codex:connect 固定当前游戏任务并等注册成功；不继承 TokenGame 旧配置或覆盖模型", async () => {
  const f = fixture();
  assert.equal(await run([process.cwd()], f.options), 0);
  assert.deepEqual(f.calls.slice(0, 2), ["read", "configure"]);
  const launch = f.calls[2];
  assert.equal(launch.threadId, f.threadId);
  assert.equal(launch.env.TOKENGAME_MODEL_TOKEN, undefined);
  assert.equal(launch.env.TOKENGAME_PUBLIC_ORIGIN, undefined);
  assert.equal(launch.env.CODEX_THREAD_ID, undefined);
  assert.equal(launch.env.CODEX_SESSION_ID, undefined);
  assert.equal(launch.env.OPENAI_BASE_URL, "user-provider-unchanged");
  assert.equal(launch.env.TOKENGAME_CODEX_THREAD, f.threadId);
  assert.match(f.output(), /已接入/);
  assert.match(f.output(), /专用游戏任务空闲/);
  assert.equal(f.output().includes(f.threadId), false);
  assert.equal(f.errors(), "");
});

test("缺少当前任务、活动连接无效或需要重启时，不启动后台进程", async () => {
  for (const extra of [
    { env: {} },
    { readConnection: () => { throw Object.assign(new Error("secret path"), { code: "model_connection_unavailable" }); } },
    { configure: () => ({ changed: true }) },
  ]) {
    let launched = false;
    const f = fixture({ ...extra, launch: async () => { launched = true; } });
    await run([process.cwd()], f.options);
    assert.equal(launched, false);
    assert.equal(f.errors().includes("secret path"), false);
  }
});

test("launcher 缺失肯定就绪回执时不能打印已接入", async () => {
  for (const result of [undefined, null, {}, { connected: false }]) {
    const f = fixture({ launch: async () => result });
    assert.equal(await run([process.cwd()], f.options), 1);
    assert.equal(f.output().includes("已接入"), false);
    assert.match(f.errors(), /wake_connector_start_failed/);
  }
});

test("后台 launcher 使用隐藏无 shell 子进程，收到精确 ready 后才脱离", async () => {
  const child = new EventEmitter();
  child.connected = true;
  child.disconnect = () => { child.connected = false; };
  let unref = false;
  child.unref = () => { unref = true; };
  let observed;
  const config = { repository: path.resolve(__dirname, ".."), env: { TEST: "unchanged" } };
  const started = launchConnector(config, { spawn: (executable, args, options) => {
    observed = { executable, args, options };
    setImmediate(() => child.emit("message", { schema: CONNECTOR_CONTROL_SCHEMA, event: "connected" }));
    return child;
  } });
  assert.deepEqual(await started, { connected: true });
  assert.equal(observed.executable, process.execPath);
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.windowsHide, true);
  assert.equal(observed.options.detached, true);
  assert.deepEqual(observed.options.stdio, ["ignore", "ignore", "ignore", "ipc"]);
  assert.equal(child.connected, false);
  assert.equal(unref, true);
});

test("启动超时只取消自己创建的子进程，并等待 close 而非假报成功", async () => {
  const child = new EventEmitter();
  child.connected = true;
  child.disconnect = () => { child.connected = false; };
  child.unref = () => {};
  let stopMessage;
  let killed = false;
  child.kill = () => { killed = true; };
  child.send = (message, done) => {
    stopMessage = message;
    done();
    setImmediate(() => child.emit("close", 0, null));
  };
  await assert.rejects(launchConnector({ repository: process.cwd(), env: {} }, {
    spawn: () => child, startupMs: 1,
  }), { code: "wake_connector_start_timeout" });
  assert.deepEqual(stopMessage, { schema: CONNECTOR_CONTROL_SCHEMA, event: "stop" });
  assert.equal(killed, false, "正常 IPC 清理无需强制终止");
});

test("真实 Node 连接器入口经 IPC 等本地 Broker 注册；未开窗口零 queue，撤权后实际退出", async (t) => {
  const surface = new CommandSurface({});
  const host = new TableWebHost({ core: new InProcessCoreClient({ surface }), modelBindingEnabled: true,
    remoteWakeEnabled: true });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-connector-ipc-"));
  let child;
  let exit;
  let resolveExit;
  let outputClosed = Promise.resolve();
  let stdout = "";
  let stderr = "";
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  const waitExit = async () => {
    let timer;
    try {
      return await Promise.race([Promise.all([exited, outputClosed]), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("本次 Node 连接器未在撤权后退出"), {
          observed: { exitCode: child?.exitCode, signalCode: child?.signalCode,
            connected: child?.connected, stdoutDestroyed: child?.stdout?.destroyed,
            stderrDestroyed: child?.stderr?.destroyed, events: stdout, errors: stderr },
        })), 5_000);
      })]);
    } finally { clearTimeout(timer); }
  };
  t.after(async () => {
    try {
      if (child && !exit) { child.kill("SIGKILL"); await waitExit(); }
    } finally {
      await host.stop();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  const origin = await host.start({ port: 0 });
  const post = async (route, body) => {
    const response = await fetch(`${origin}${route}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(3_000) });
    const result = await response.json();
    assert.equal(response.ok, true, JSON.stringify(result));
    return result;
  };
  const seat = await post("/api/room/create", { player_id: "real-node-connector", max_seats: 2 });
  await post("/api/action", { session_token: seat.session_token, command: "room.confirm_public_scope",
    params: { acknowledged: true } });
  const binding = await post("/api/model/bind", { session_token: seat.session_token, acknowledged: true,
    binding_request_id: randomUUID() });
  const config = { repository: path.resolve(__dirname, ".."), project: path.resolve(__dirname, ".."),
    executable: process.execPath, threadId: randomUUID(), connectionFile: path.join(directory, "connection.json") };
  fs.writeFileSync(config.connectionFile, JSON.stringify(binding.connection), { flag: "wx", mode: 0o600 });
  config.env = connectorEnvironment(process.env, config);
  const started = await launchConnector(config, { spawn: (executable, args, options) => {
    // 只将输出接到证据采集管道；可执行入口、隐藏/无 shell、detached 与 IPC 采用真实 launcher 参数。
    child = spawn(executable, args, { ...options, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    // detached + IPC 已断开时，不以 close 事件代替 OS 进程退出；分别确认退出和两条输出流结束。
    child.once("exit", (code, signal) => { exit = { code, signal }; resolveExit(exit); });
    outputClosed = Promise.all([finished(child.stdout), finished(child.stderr)]);
    outputClosed.catch(() => {});
    return child;
  } });
  assert.deepEqual(started, { connected: true });
  assert.ok(Number.isInteger(child.pid) && child.pid > 0);
  const view = (await post("/api/view", { session_token: seat.session_token })).view;
  assert.equal(view.model_wake.target_configured, true, "真实 Broker 已注册，不是仅看到 spawn/IPC 通道存在");
  assert.equal(view.model_wake.window.state, "idle");
  assert.equal(view.model_wake.window.attempted_count, 0);
  await post("/api/model/unbind", { session_token: seat.session_token });
  await waitExit();
  const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(events.filter((event) => event.type === "connected").length, 1);
  const stops = events.filter((event) => event.type === "stopped");
  assert.equal(stops.length, 1);
  // 撤权恰好在 HTTP 鉴权前/后发生会分别得到 token_rejected / binding_changed；均必须退出且零发送。
  assert.ok(["model_command_token_rejected", "model_binding_changed"].includes(stops[0].reason), stops[0].reason);
  assert.equal(exit.code, 0, "同一次已知干净撤权，无论发生在鉴权前后都应正常退出");
  assert.equal(exit.signal, null);
  assert.ok(events.every((event) => event.queue_attempted === 0 && event.queue_accepted === 0));
  assert.equal(events.some((event) => event.type === "queue_receipt"), false);
  assert.equal(stderr, "");
  for (const secret of [binding.connection.model_token, config.threadId, config.connectionFile]) {
    assert.equal(stdout.includes(secret), false);
  }
});

test("真实 Node 连接器启动超时经 IPC 停止，只在自己子进程实际退出后返回", async (t) => {
  let requests = 0;
  // 故意不完成首次 poll，既没有 ready 也不投递通知；只验 launcher 的真实 IPC 撤销链。
  const server = createServer((_request, _response) => { requests += 1; });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-connector-start-timeout-"));
  let child;
  let exit;
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  t.after(async () => {
    let timer;
    try {
      if (child && !exit) {
        child.kill("SIGKILL");
        await Promise.race([exited, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("本次超时测试子进程清理未确认")), 5_000);
        })]);
      }
    } finally {
      clearTimeout(timer);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const config = { repository: path.resolve(__dirname, ".."), project: path.resolve(__dirname, ".."),
    executable: process.execPath, threadId: randomUUID(), connectionFile: path.join(directory, "connection.json") };
  fs.writeFileSync(config.connectionFile, JSON.stringify({ schema: "tokengame.model-connection.v1",
    table_origin: `http://127.0.0.1:${server.address().port}`, model_token: "test-startup-token-".padEnd(40, "x") }),
  { flag: "wx", mode: 0o600 });
  config.env = connectorEnvironment(process.env, config);
  await assert.rejects(launchConnector(config, { startupMs: 700, spawn: (executable, args, options) => {
    child = spawn(executable, args, options);
    child.once("exit", (code, signal) => { exit = { code, signal }; resolveExit(exit); });
    return child;
  } }), { code: "wake_connector_start_timeout" });
  assert.ok(requests > 0, "必须进入真实 run-connector HTTP poll，不能只测未启动的空壳子进程");
  assert.deepEqual(exit, { code: 0, signal: null });
});
