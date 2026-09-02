"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { run } = require("../src/run-remote-beta.cjs");
const { startBeta } = require("../src/run-beta.cjs");

test("beta:remote 只启用出站连接器 transport，显式 HTTPS 地址不改变回环监听", async () => {
  let captured;
  const code = await run(["https://Friends.Example/"], {
    env: { KEEP: "same", TOKENGAME_CODEX_WAKE: "1", TOKENGAME_CODEX_THREAD: "stale",
      TOKENGAME_MODEL_ADAPTER: "must-not-load", TOKENGAME_COMMAND_ORIGIN: "http://wrong-core",
      TOKENGAME_WEB_HOST: "0.0.0.0", TOKENGAME_WEB_PORT: "43112" },
    betaMain: async ({ env }) => { captured = env; return true; },
  });
  assert.equal(code, 0);
  assert.equal(captured.TOKENGAME_PUBLIC_ORIGIN, "https://friends.example");
  assert.equal(captured.TOKENGAME_WEB_HOST, "127.0.0.1");
  assert.equal(captured.TOKENGAME_REMOTE_WAKE, "1");
  assert.equal(captured.TOKENGAME_CODEX_WAKE, "0");
  assert.equal(captured.TOKENGAME_CODEX_THREAD, undefined);
  assert.equal(captured.TOKENGAME_MODEL_ADAPTER, "");
  assert.equal(captured.TOKENGAME_COMMAND_ORIGIN, "");
  assert.equal(captured.KEEP, "same");
});

test("beta:remote 无效地址在启动前失败，错误不回显用户输入", async () => {
  for (const argv of [[], ["http://127.0.0.1:43112"], ["https://example.invalid/private?secret=DO_NOT_PRINT"]]) {
    let called = false;
    let errors = "";
    const code = await run(argv, { env: {}, betaMain: async () => { called = true; },
      stderr: { write: (text) => { errors += text; } } });
    assert.equal(code, 1);
    assert.equal(called, false);
    assert.equal(errors.includes("DO_NOT_PRINT"), false);
    assert.equal(errors.includes("example.invalid"), false);
  }
});

test("真实 beta 启动 remote broker 但不自动开启任何真人通知窗口", async (t) => {
  const run = await startBeta({ env: { TOKENGAME_WEB_PORT: "0", TOKENGAME_REMOTE_WAKE: "1",
    TOKENGAME_PUBLIC_ORIGIN: "https://friends.example" } });
  t.after(() => run.close());
  assert.match(run.origin, /^http:\/\/127\.0\.0\.1:/);
  assert.equal(run.banner.origin, "https://friends.example");
  assert.equal(run.banner.remote_wake_connector, "available");
  assert.equal(run.banner.managed_wake, "available");
  assert.equal(run.banner.proactive_wake_verified, false);
  assert.equal(run.host.wakeSessions.targetConfigured, false);
});

test("显式公共 origin 不可退回明文回环地址；本地默认启动不受影响", async (t) => {
  let running;
  t.after(async () => { if (running) await running.close(); });
  await assert.rejects(async () => {
    running = await startBeta({ env: { TOKENGAME_WEB_PORT: "0", TOKENGAME_PUBLIC_ORIGIN: "http://127.0.0.1:7802" } });
  }, (error) => error.code === "invalid_field" && error.details?.field === "public_origin");
});

test("两个 wake transport 同时指定会失败，不静默选择一方", async () => {
  await assert.rejects(startBeta({ env: { TOKENGAME_WEB_PORT: "0", TOKENGAME_REMOTE_WAKE: "1",
    TOKENGAME_CODEX_WAKE: "1", TOKENGAME_CODEX_EXECUTABLE: process.execPath,
    TOKENGAME_CODEX_CWD: process.cwd(), TOKENGAME_CODEX_THREAD: randomUUID() } }),
  (error) => error.code === "invalid_field" && error.details?.field === "wake_transport");
});
