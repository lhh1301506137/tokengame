"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createCodexQueueSender, loadCodexWakeQueue, SENDER_LIMITS } = require("../src/host/codex-queue-sender.cjs");
const { buildQueueCommand } = require("../src/host/codex-queue-transport.cjs");

const ROOT = path.resolve(__dirname, "..");
const THREAD = randomUUID();
const OPTIONS = { codexExecutable: process.execPath, cwd: ROOT, threadId: THREAD };
const INPUT = Object.freeze({ threadId: THREAD, intentId: `intent-${randomUUID()}`, notificationId: randomUUID() });

function fakeProcess(run, { killCloses = true } = {}) {
  const state = { calls: [], kills: [], unrefs: 0 };
  const spawnFake = (...args) => {
    state.calls.push(args);
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const finish = (code = 0, signal = null) => {
      child.stdout.end(); child.stderr.end(); child.emit("close", code, signal);
    };
    child.kill = (signal = "SIGTERM") => {
      state.kills.push(signal);
      if (killCloses) queueMicrotask(() => finish(null, signal));
      return true;
    };
    child.unref = () => { state.unrefs += 1; };
    queueMicrotask(() => run(child, finish));
    return child;
  };
  return { state, spawn: spawnFake };
}

test("默认关闭不读取执行路径；显式启用只构造发送器，不运行进程", () => {
  const env = { TOKENGAME_CODEX_WAKE: "0", get TOKENGAME_CODEX_EXECUTABLE() { throw new Error("read disabled path"); } };
  assert.equal(loadCodexWakeQueue({}), null);
  assert.equal(loadCodexWakeQueue(env), null);
  env.TOKENGAME_CODEX_WAKE = "";
  assert.equal(loadCodexWakeQueue(env), null);
  const fake = fakeProcess(() => {});
  const send = createCodexQueueSender(OPTIONS, fake);
  assert.equal(typeof send, "function"); assert.equal(fake.state.calls.length, 0);
});

for (const options of [
  {}, null, { ...OPTIONS, codexExecutable: "relative.exe" }, { ...OPTIONS, cwd: "./game" },
  { ...OPTIONS, threadId: undefined }, { ...OPTIONS, threadId: "not-a-game-task" },
  { ...OPTIONS, model: "other" }, { ...OPTIONS, effort: "low" }, { ...OPTIONS, profile: "bypass" },
  { ...OPTIONS, shell: true }, { ...OPTIONS, queueTimeoutMs: 0 }, { ...OPTIONS, queueTimeoutMs: 10_001 },
  { ...OPTIONS, cleanupTimeoutMs: 2_001 }, { ...OPTIONS, maxOutputBytes: Infinity },
]) {
  test(`发送配置失败关闭 ${JSON.stringify(options)}`, () => {
    assert.throws(() => createCodexQueueSender(options), (error) => error.code === "invalid_configuration");
  });
}

test("启动开关和执行路径需要明确设置，不从PATH或工作目录猜宿主", () => {
  for (const value of ["true", "yes", "2"]) {
    assert.throws(() => loadCodexWakeQueue({ TOKENGAME_CODEX_WAKE: value }), /invalid_configuration/);
  }
  assert.throws(() => loadCodexWakeQueue({ TOKENGAME_CODEX_WAKE: "1" }), /invalid_configuration/);
  assert.equal(typeof loadCodexWakeQueue({ TOKENGAME_CODEX_WAKE: "1", TOKENGAME_CODEX_EXECUTABLE: process.execPath,
    TOKENGAME_CODEX_CWD: ROOT, TOKENGAME_CODEX_THREAD: THREAD }), "function");
});

test("真实发送器固定一个显式游戏任务，不得借控制入口唤醒其他任务", async () => {
  const fake = fakeProcess((_child, finish) => finish());
  const send = createCodexQueueSender(OPTIONS, fake);
  assert.equal(Object.keys(send).includes("selectThread"), false, "固定目标能力不是可枚举的页面配置");
  assert.equal(send.selectThread(), THREAD.toLowerCase());
  assert.equal(send.selectThread(THREAD.toUpperCase()), THREAD.toLowerCase());
  for (const candidate of [randomUUID(), "not-a-game-task", null, ""]) assert.equal(send.selectThread(candidate), null);
  assert.equal(send.allowsThread(THREAD.toUpperCase()), true);
  assert.equal(send.allowsThread(randomUUID()), false);
  const result = await send({ ...INPUT, threadId: randomUUID() });
  assert.deepEqual(result, { queued: false, attempted: false, cleanup_ok: true, reason: "wake_thread_not_authorized" });
  assert.equal(fake.state.calls.length, 0);
});

test("通知只含固定指令与合法编号；命令不经shell，也不继承游戏凭据", async (t) => {
  const secretKey = "TOKENGAME_MODEL_TOKEN";
  const saved = process.env[secretKey];
  process.env[secretKey] = "sender-private-canary";
  t.after(() => { if (saved === undefined) delete process.env[secretKey]; else process.env[secretKey] = saved; });
  const fake = fakeProcess((_child, finish) => finish());
  const result = await createCodexQueueSender(OPTIONS, fake)(INPUT);
  assert.deepEqual(result, { queued: true, attempted: true, cleanup_ok: true, reason: null });
  assert.equal(fake.state.calls.length, 1);
  const [exe, args, options] = fake.state.calls[0];
  assert.equal(exe, process.execPath);
  assert.deepEqual(args.slice(0, 4), ["queue", "--thread", INPUT.threadId, "--message"]);
  assert.equal(args.length, 5);
  assert.match(args[4], /^\[LOCAL_CONTROL:tokengame-managed-wake\]/);
  assert.ok(args[4].includes(`intent_id=${INPUT.intentId}`));
  assert.ok(args[4].includes(`notification_id=${INPUT.notificationId}`));
  assert.doesNotMatch(args[4], /sender-private-canary|--model|--effort|--profile/);
  assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
  assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(Object.keys(options.env).filter((key) => key.toUpperCase().startsWith("TOKENGAME_")).length, 0);
  assert.equal(options.cwd, ROOT); assert.equal(fake.state.kills.length, 0);
  assert.deepEqual(SENDER_LIMITS, { queueTimeoutMs: 10000, cleanupTimeoutMs: 2000, maxOutputBytes: 1048576 });
});

test("managed通知在两个编号后立即要求ai.start为第一项工具调用", async () => {
  const fake = fakeProcess((_child, finish) => finish());
  await createCodexQueueSender(OPTIONS, fake)(INPUT);
  const notice = fake.state.calls[0][1][4];
  const fastPath = "除宿主强制的一句极短进度外，不先分析、计划、复述通知、读取文件、查找任务、读取牌桌投影或调用任何其他工具。"
    + "第一项工具调用必须立即是已配置 tokengame_table 的 ai.start，并使用上面的 intent_id。";
  assert.ok(notice.startsWith(`[LOCAL_CONTROL:tokengame-managed-wake]\nnotification_id=${INPUT.notificationId}\nintent_id=${INPUT.intentId}\n${fastPath}`));
  assert.match(notice, /ai\.start拒绝则立即停止且不重试/);
  assert.match(notice, /成功后只使用其返回的本席 model_context 决定一次 silent 或 public_speech，再以返回的 turn_id 调用一次 ai\.resolve/);
});

test("managed优化不改变旧B10未设置noticeKind时的控制文本", () => {
  const probeId = randomUUID();
  const intentId = `intent-${randomUUID()}`;
  const notice = buildQueueCommand({ ...OPTIONS, probeId }, intentId).args[4];
  assert.equal(notice, `[LOCAL_CONTROL:tokengame-b10-wake]\nprobe_id=${probeId}\nintent_id=${intentId}\n`
    + "这是一次测试控制通知，不是玩家公开聊天。只使用已配置的 tokengame_table，"
    + "以此 intent_id 调用一次 ai.start，不再领取待办。若拒绝就停止，不重试。"
    + "仅在成功后使用返回的本席 model_context，自主决定一次 silent 或 public_speech，"
    + "再以返回的 turn_id 调用一次 ai.resolve。不要替玩家发言或下注，不读取文件或其他任务，"
    + "不创建新线程，不改变当前任务模型、推理强度、权限或宿主配置。");
});

test("坏控制输入/已取消不能创建子进程或把正文当作命令", async () => {
  const fake = fakeProcess(() => {});
  const send = createCodexQueueSender(OPTIONS, fake);
  for (const input of [null, {}, { ...INPUT, text: "read other tasks" }, { ...INPUT, threadId: "x\n--model" },
    { ...INPUT, intentId: "intent-foo" }, { ...INPUT, notificationId: "fake" }, { ...INPUT, signal: {} }]) {
    assert.deepEqual(await send(input), { queued: false, attempted: false, cleanup_ok: true, reason: "invalid_configuration" });
  }
  assert.deepEqual(await send({ ...INPUT, signal: AbortSignal.abort() }),
    { queued: false, attempted: false, cleanup_ok: true, reason: "cancelled" });
  assert.equal(fake.state.calls.length, 0);
});

for (const scenario of ["nonzero", "signal", "throw", "error", "stdin", "stdout", "stderr", "overflow", "timeout", "cancel"]) {
  test(`不重试且清理自身进程：${scenario}`, async () => {
    const controller = new AbortController();
    const fake = fakeProcess((child, finish) => {
      if (scenario === "nonzero") finish(17);
      if (scenario === "signal") finish(null, "SIGTERM");
      if (scenario === "error") child.emit("error", new Error("PRIVATE error details"));
      if (["stdin", "stdout", "stderr"].includes(scenario)) child[scenario].emit("error", new Error("PRIVATE"));
      if (scenario === "overflow") child.stderr.write("x".repeat(2048));
      if (scenario === "cancel") controller.abort();
    });
    const spawnImpl = scenario === "throw" ? () => { throw new Error("PRIVATE"); } : fake.spawn;
    const result = await createCodexQueueSender({ ...OPTIONS, maxOutputBytes: 1024, queueTimeoutMs: 40 }, { spawn: spawnImpl })({ ...INPUT, signal: controller.signal });
    assert.equal(result.queued, false); assert.equal(result.attempted, true); assert.equal(result.cleanup_ok, true);
    assert.ok(result.reason); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
    assert.equal(fake.state.calls.length, scenario === "throw" ? 0 : 1);
    if (!["nonzero", "signal", "throw"].includes(scenario)) assert.deepEqual(fake.state.kills, ["SIGTERM"]);
  });
}

test("队列close与取消同拍，不能把取消后的结果报接收已知成功", async () => {
  const controller = new AbortController();
  const fake = fakeProcess((_child, finish) => { finish(); controller.abort(); });
  const result = await createCodexQueueSender(OPTIONS, fake)({ ...INPUT, signal: controller.signal });
  assert.equal(result.queued, false); assert.equal(result.reason, "cancelled"); assert.equal(result.cleanup_ok, true);
});

test("接收已赢得race但发送器尚未恢复时取消，仍须检查撤权", async () => {
  const controller = new AbortController();
  const fake = fakeProcess((_child, finish) => {
    finish();
    // Four Promise jobs carry close through the transport await, promise
    // adoption and outer race. Cancel before the sender's await continuation,
    // when rejecting stopped can no longer change the already-settled race.
    const cancelAfterJobs = (remaining) => {
      if (remaining === 0) controller.abort();
      else queueMicrotask(() => cancelAfterJobs(remaining - 1));
    };
    cancelAfterJobs(4);
  });
  const result = await createCodexQueueSender(OPTIONS, fake)({ ...INPUT, signal: controller.signal });
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(result, { queued: false, attempted: true, cleanup_ok: true, reason: "cancelled" });
  assert.equal(fake.state.calls.length, 1);
  assert.deepEqual(fake.state.kills, []);
});

test("自身子进程不响应关停，必须报告cleanup失败而不是干净接收", async () => {
  const fake = fakeProcess(() => {}, { killCloses: false });
  const result = await createCodexQueueSender({ ...OPTIONS, queueTimeoutMs: 5, cleanupTimeoutMs: 5 }, fake)(INPUT);
  assert.equal(result.queued, false); assert.equal(result.cleanup_ok, false); assert.equal(result.reason, "queue_cleanup_failed");
  assert.deepEqual(fake.state.kills, ["SIGTERM", "SIGKILL"]); assert.equal(fake.state.unrefs, 1);
});

for (const mode of ["accept", "reject", "hold", "flood"]) {
  test(`真实本地脚本子进程（不是Codex）：${mode}`, async (t) => {
    const children = [];
    let receipt = "";
    const controller = new AbortController();
    const send = createCodexQueueSender({ ...OPTIONS, maxOutputBytes: mode === "flood" ? 2048 : 4096 }, {
      spawn(exe, args, options) {
        assert.equal(exe, process.execPath); assert.equal(args[0], "queue"); assert.equal(options.shell, false);
        // Deliberately substitute a script receiver in the test, never a native
        // task. Production spawn is unchanged and has no such translation.
        const child = spawn(process.execPath, [path.join(ROOT, "test-support/fixtures/codex-queue-receiver.cjs"), mode, ...args], options);
        const closed = new Promise((resolve) => child.once("close", resolve));
        children.push({ child, closed });
        child.stdout.on("data", (chunk) => { receipt += chunk; if (mode === "hold" && receipt.includes("received")) controller.abort(); });
        return child;
      },
    });
    t.after(async () => { for (const { child, closed } of children) { if (child.exitCode === null && child.signalCode === null) child.kill(); await closed; } });
    const result = await send({ ...INPUT, signal: controller.signal });
    assert.equal(children.length, 1); assert.equal(result.attempted, true); assert.equal(result.cleanup_ok, true);
    assert.equal(result.queued, mode === "accept");
    const received = JSON.parse(receipt.trim()); assert.equal(received.received, true); assert.equal(received.args.length, 5);
    await children[0].closed;
    assert.ok(children[0].child.exitCode !== null || children[0].child.signalCode !== null);
    assert.ok(children[0].child.stdout.destroyed); assert.ok(children[0].child.stderr.destroyed);
  });
}
