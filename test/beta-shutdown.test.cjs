"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { startBetaProcess } = require("../test-support/beta-process.cjs");
const { BETA_SHUTDOWN_MESSAGE } = require("../src/run-beta.cjs");

function resources(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-beta-shutdown-"));
  const runs = [];
  t.after(async () => {
    await Promise.all(runs.map((run) => run.forceKill()));
    const actual = fs.realpathSync(dir);
    assert.equal(path.dirname(actual).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(actual).startsWith("tokengame-beta-shutdown-"));
    fs.rmSync(actual, { recursive: true, force: true });
  });
  return { dir, file: path.join(dir, "capture.jsonl"), start(options = {}) {
    const run = startBetaProcess(options);
    runs.push(run);
    return run;
  } };
}

async function assertPortClosed(origin) {
  const { hostname, port } = new URL(origin);
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: hostname, port: Number(port) });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("port_check_timeout")); }, 1000);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); reject(new Error("beta_port_still_open")); });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve();
      else reject(error);
    });
  });
}

function closeStatus(run) {
  const values = run.stderr().split("\n").filter((line) => line.startsWith("{")).map(JSON.parse);
  assert.equal(values.length, 1);
  assert.equal(values[0].schema, "tokengame.ai-lifecycle-close.v1");
  return values[0];
}

function send(child, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("test_ipc_send_timeout")), 1000);
    child.send(message, (error) => { clearTimeout(timer); if (error) reject(error); else resolve(); });
  });
}

function nextMessage(child) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off("message", onMessage); child.off("close", onClose); };
    const onMessage = (value) => { cleanup(); resolve(value); };
    const onClose = () => { cleanup(); reject(new Error("test_child_closed_before_message")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("test_ipc_receive_timeout")); }, 2000);
    child.once("message", onMessage);
    child.once("close", onClose);
  });
}

function preload(own, source) {
  const file = path.join(own.dir, "owned-preload.cjs");
  fs.writeFileSync(file, `"use strict";\n${source}`, { flag: "wx" });
  return ["--require", file];
}

test("真正 fork 的 beta 由父 IPC 关停一次，文件/footer/收尾回执与退出一致", async (t) => {
  const own = resources(t);
  const run = own.start({ env: { TOKENGAME_AI_RECEIPT_FILE: own.file }, shutdownTimeoutMs: 1500 });
  const banner = await run.ready;
  const health = await fetch(`${banner.origin}/api/health`, { signal: AbortSignal.timeout(1000) });
  assert.equal(health.status, 200);
  await health.arrayBuffer();
  const stop = run.stop();
  assert.equal(run.stop(), stop);
  // 同时再送两条真正的 IPC 请求，而不只覆盖控制器的 Promise 缓存。
  const repeats = Promise.all([send(run.child, BETA_SHUTDOWN_MESSAGE), send(run.child, BETA_SHUTDOWN_MESSAGE)]);
  const exited = await stop;
  await repeats;
  assert.equal(exited.graceful, true);
  assert.equal(exited.forced, false);
  assert.equal(exited.exit_observed, true);
  assert.equal(exited.output_complete, true);
  assert.equal(exited.exit_code, 0);
  assert.equal(exited.signal, null);
  await assertPortClosed(banner.origin);
  const records = fs.readFileSync(own.file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 2);
  assert.equal(records[0].kind, "header");
  assert.equal(records[1].kind, "footer");
  assert.equal(records[1].capture_complete, true);
  const status = closeStatus(run);
  assert.equal(status.run_ref, records[0].run_ref);
  assert.equal(status.run_ref, records[1].run_ref);
  assert.equal(status.run_complete, true);
  assert.equal(status.write_acknowledged, true);
  assert.equal(status.close_succeeded, true);
  assert.equal((run.stderr().match(/正在关停/g) ?? []).length, 1);
  assert.equal((run.stderr().match(/端口已释放/g) ?? []).length, 1);
  assert.equal(banner.proactive_wake_verified, false);
});

test("非法 IPC 消息处理后 HTTP 仍可用；默认关闭捕获不产生文件", async (t) => {
  const own = resources(t);
  const execArgv = preload(own, `
process.on("message", () => setImmediate(() => { if (process.connected) process.send({ observed: true }); }));
`);
  const run = own.start({ execArgv });
  await run.ready;
  const invalid = [null, [], "shutdown", {}, { command: "shutdown" }, { schema: "tokengame.beta-control.v1" },
    { schema: "tokengame.beta-control.v2", command: "shutdown" }, { ...BETA_SHUTDOWN_MESSAGE, command: "SHUTDOWN" },
    { ...BETA_SHUTDOWN_MESSAGE, extra: true }, { ...BETA_SHUTDOWN_MESSAGE, command: { value: "shutdown" } }];
  assert.equal(invalid.length, 10);
  for (const message of invalid) {
    const observed = nextMessage(run.child);
    await send(run.child, message);
    assert.deepEqual(await observed, { observed: true });
    assert.equal(run.child.exitCode, null);
    const health = await fetch(`${run.banner.origin}/api/health`, { signal: AbortSignal.timeout(1000) });
    assert.equal(health.status, 200);
    await health.arrayBuffer();
  }
  assert.equal((await run.stop()).graceful, true);
  assert.deepEqual(fs.readdirSync(own.dir), ["owned-preload.cjs"]);
  assert.doesNotMatch(run.stderr(), /ai-lifecycle-close/);
  await assertPortClosed(run.banner.origin);
});

test("父 IPC 断开有界关闭且标记 abnormal_close，不冒充正常捕获", async (t) => {
  const own = resources(t);
  const run = own.start({ env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
  await run.ready;
  const done = run.disconnect();
  assert.equal(run.disconnect(), done);
  const ended = await done;
  assert.equal(ended.graceful, false);
  assert.equal(ended.exit_code, 1);
  assert.equal(ended.forced, false);
  assert.equal(ended.exit_observed, true);
  assert.equal(ended.reason, "beta_parent_disconnected");
  await assertPortClosed(run.banner.origin);
  const status = closeStatus(run);
  assert.equal(status.stop_reason, "abnormal_close");
  assert.equal(status.capture_complete, false);
  assert.equal(status.write_acknowledged, true);
  assert.equal(status.close_succeeded, true);
  assert.equal(status.run_complete, false);
  const rows = fs.readFileSync(own.file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].kind, "footer");
  assert.equal(rows[1].stop_reason, "abnormal_close");
  assert.equal(rows[1].run_ref, status.run_ref);
});

for (const action of ["stop", "disconnect"]) {
  test(`异步启动期间父进程 ${action} 不留下孤儿服务`, async (t) => {
    const own = resources(t);
    const execArgv = preload(own, `
const fs = require("node:fs/promises");
const open = fs.open;
let release;
const gate = new Promise((resolve) => { release = resolve; });
process.on("message", (message) => { if (message?.test === "release_startup") release(); });
process.once("disconnect", release);
fs.open = async (...args) => {
  if (args[0] === process.env.TOKENGAME_AI_RECEIPT_FILE) {
    process.send({ opening: true });
    await gate;
  }
  return open(...args);
};
`);
    const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
    assert.deepEqual(await nextMessage(run.child), { opening: true });
    const done = run[action]();
    if (action === "stop") {
      // 确认真正的 stop 消息先入通道，再放开启动；不依赖微任务调度顺序。
      await send(run.child, BETA_SHUTDOWN_MESSAGE);
      await send(run.child, { test: "release_startup" });
    }
    const ended = await done;
    assert.equal(ended.exit_code, action === "stop" ? 0 : 1);
    assert.equal(ended.graceful, action === "stop");
    assert.equal(ended.forced, false);
    assert.equal(ended.exit_observed, true);
    await assert.rejects(run.ready, action === "stop" ? /beta_exited_before_ready/ : /beta_parent_disconnected/);
    assert.equal(run.stdout(), "");
    const status = closeStatus(run);
    assert.equal(status.stop_reason, action === "stop" ? "normal_close" : "abnormal_close");
    assert.equal(status.close_succeeded, true);
  });
}

for (const streamName of ["stdout", "stderr"]) for (const firstEvent of ["callback", "drain"]) {
  test(`${streamName} ${firstEvent} 先到时仍须等另一个输出屏障后才断开 IPC`, async (t) => {
    const own = resources(t);
    const execArgv = preload(own, `
const flags = {};
const name = ${JSON.stringify(streamName)};
const stream = process[name];
const write = stream.write.bind(stream);
stream.write = (value, ...args) => {
  if (value !== "") return write(value, ...args);
  const callback = () => { flags.callback = true; args.at(-1)(); };
  const drain = () => { flags.drain = true; stream.emit("drain"); };
  setImmediate(() => {
    ${firstEvent === "callback" ? "callback" : "drain"}();
    setImmediate(${firstEvent === "callback" ? "drain" : "callback"});
  });
  return false;
};
process.once("disconnect", () => {
  process.stderr.write("TEST_FLUSH_BEFORE_DISCONNECT=" + JSON.stringify(flags) + "\\n");
});
`);
    const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
    await run.ready;
    assert.equal((await run.stop()).graceful, true);
    const line = run.stderr().split("\n").find((value) => value.startsWith("TEST_FLUSH_BEFORE_DISCONNECT="));
    assert.ok(line);
    assert.deepEqual(JSON.parse(line.split("=")[1]), { callback: true, drain: true });
    assert.equal(closeStatus(run).run_complete, true);
    await assertPortClosed(run.banner.origin);
  });
}

for (const streamName of ["stdout", "stderr"]) {
  test(`${streamName} 输出 callback 失败只报告去敏类别，不误判为 graceful`, async (t) => {
    const own = resources(t);
    const execArgv = preload(own, `
const stream = process[${JSON.stringify(streamName)}];
const write = stream.write.bind(stream);
stream.write = (value, ...args) => {
  if (value !== "") return write(value, ...args);
  setImmediate(() => args.at(-1)(new Error("PRIVATE_OUTPUT_SENTINEL")));
  return true;
};
`);
    const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
    await run.ready;
    await assert.rejects(run.stop(), (error) => error.result?.exit_code === 1 && error.result.graceful === false
      && error.result.forced === false && error.result.exit_observed === true);
    assert.match(run.stderr(), /output_flush_failed/);
    assert.doesNotMatch(run.stdout() + run.stderr(), /PRIVATE_OUTPUT_SENTINEL/);
    assert.equal(closeStatus(run).run_complete, true);
    await assertPortClosed(run.banner.origin);
  });
}

test("stdout 无法排空时有界失败退出，不能因文件完整而报告进程成功", async (t) => {
  const own = resources(t);
  const execArgv = preload(own, `
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (value, ...args) => value === "" ? false : write(value, ...args);
`);
  const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
  await run.ready;
  await assert.rejects(run.stop(), (error) => error.result?.exit_code === 1 && error.result.graceful === false
    && error.result.forced === false && error.result.exit_observed === true);
  assert.match(run.stderr(), /output_flush_timeout/);
  // 记录器本身成功与进程输出失败是不同事实，退出码不能被这行覆盖。
  assert.equal(closeStatus(run).run_complete, true);
  await assertPortClosed(run.banner.origin);
});

test("父控制器超时只强杀自己的子进程并报告失败，缺 footer 不补写", async (t) => {
  const own = resources(t);
  const execArgv = preload(own, `
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (...args) => {
  if (String(args[0]).includes('"service":"tokengame-beta"')) process.removeAllListeners("message");
  return write(...args);
};
`);
  const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file }, shutdownTimeoutMs: 150 });
  await run.ready;
  await assert.rejects(run.stop(), (error) => error.message === "beta_shutdown_timeout"
    && error.result?.forced === true && error.result.graceful === false && error.result.exit_observed === true);
  await assertPortClosed(run.banner.origin);
  const records = fs.readFileSync(own.file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, "header");
  assert.doesNotMatch(run.stderr(), /ai-lifecycle-close/);
});

test("父控制器的输出超过上限就失败，内存捕获也受同一字节上限限制", async (t) => {
  const own = resources(t);
  const run = own.start({ maxOutputBytes: 32 });
  await assert.rejects(run.ready, /beta_output_limit/);
  const ended = await run.forceKill();
  assert.equal(ended.graceful, false);
  assert.equal(ended.forced, true);
  assert.equal(ended.exit_observed, true);
  assert.equal(ended.output_complete, false);
  assert.equal(Buffer.byteLength(run.stdout()) + Buffer.byteLength(run.stderr()), 32);
});

for (const phase of ["host_stop", "after_footer"]) {
  test(`B13 关停中父通道断开 ${phase} 不能被已开始关闭的标记吞掉`, async (t) => {
    const own = resources(t);
    const execArgv = preload(own, phase === "host_stop" ? `
const { TableWebHost } = require(process.cwd() + "/src/host/table-web-host.cjs");
const stop = TableWebHost.prototype.stop;
TableWebHost.prototype.stop = async function () {
  const disconnected = new Promise((resolve) => process.once("disconnect", resolve));
  process.send({ shutdown_phase: "host_stop" });
  await disconnected;
  return stop.call(this);
};
` : `
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (value, ...args) => {
  if (value !== "") return write(value, ...args);
  process.once("disconnect", () => args.at(-1)());
  process.send({ shutdown_phase: "after_footer" });
  return true;
};
`);
    const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
    await run.ready;
    const reached = nextMessage(run.child);
    const stopping = run.stop();
    void stopping.catch(() => {});
    assert.deepEqual(await reached, { shutdown_phase: phase });
    const ended = await run.disconnect();
    await assert.rejects(stopping, (error) => error.result?.graceful === false);
    assert.equal(ended.exit_code, 1, "父通道在子进程主动断开前丢失，进程不得正常退出");
    assert.equal(ended.exit_observed, true);
    assert.equal(ended.forced, false);
    assert.equal(ended.output_complete, true);
    await assertPortClosed(run.banner.origin);
    const status = closeStatus(run);
    const rows = fs.readFileSync(own.file, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, 2);
    assert.equal(status.run_ref, rows[1].run_ref);
    if (phase === "host_stop") {
      assert.equal(status.stop_reason, "abnormal_close");
      assert.equal(status.run_complete, false);
      assert.equal(rows[1].capture_complete, false);
    } else {
      // 已成功关闭的文件不能追写失败；最终通道/进程失败是后来的独立事实。
      assert.equal(status.run_complete, true);
      assert.equal(rows[1].capture_complete, true);
      assert.match(run.stderr(), /parent_ipc_disconnected/);
    }
  });
}

test("B13 父断连之后输出再超限仍必须报告捕获不完整", async (t) => {
  const own = resources(t);
  const execArgv = preload(own, `
process.once("disconnect", () => process.stdout.write(Buffer.alloc(32 * 1024, 120)));
`);
  const run = own.start({ execArgv, maxOutputBytes: 8192 });
  await run.ready;
  const ended = await run.disconnect();
  assert.equal(ended.reason, "beta_parent_disconnected", "保持最先发生的失败原因");
  assert.equal(ended.graceful, false);
  assert.equal(ended.exit_observed, true);
  assert.equal(Buffer.byteLength(run.stdout()) + Buffer.byteLength(run.stderr()), 8192);
  assert.equal(ended.output_complete, false, "先前原因不能抹去后续输出截断");
  await assertPortClosed(run.banner.origin);
});

test("B13 IPC 断开期间才到达的输出错误仍强制非零退出", async (t) => {
  const own = resources(t);
  const execArgv = preload(own, `
const disconnect = process.disconnect.bind(process);
process.disconnect = () => {
  process.stdout.destroy(new Error("PRIVATE_OUTPUT_LATE_SENTINEL"));
  return disconnect();
};
`);
  const run = own.start({ execArgv, env: { TOKENGAME_AI_RECEIPT_FILE: own.file } });
  await run.ready;
  await assert.rejects(run.stop(), (error) => error.result?.exit_code === 1
    && error.result.graceful === false && error.result.exit_observed === true && error.result.forced === false);
  assert.equal(closeStatus(run).run_complete, true, "记录器完整不能抹掉稍后发生的进程输出故障");
  assert.doesNotMatch(run.stdout() + run.stderr(), /PRIVATE_OUTPUT_LATE_SENTINEL/);
  await assertPortClosed(run.banner.origin);
});
