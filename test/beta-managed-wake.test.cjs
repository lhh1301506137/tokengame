"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { startBetaProcess } = require("../test-support/beta-process.cjs");

async function boot(t, enabled) {
  const threadId = randomUUID();
  const run = startBetaProcess({ env: enabled ? {
    TOKENGAME_CODEX_WAKE: "1", TOKENGAME_CODEX_EXECUTABLE: process.execPath,
    TOKENGAME_CODEX_CWD: path.resolve(__dirname, ".."), TOKENGAME_CODEX_THREAD: threadId,
  } : {} });
  // Node is intentionally pinned in this test, never Codex. No public source
  // is created in this fixture, so no queue invocation should be scheduled.
  t.after(async () => { await run.stop().catch(() => run.forceKill()); });
  const banner = await run.ready;
  const post = async (route, body) => {
    const response = await fetch(`${banner.origin}${route}`, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  };
  const created = await post("/api/room/create", { player_id: "wake-beta-local", table_rules_version: "rules-wake-beta" });
  assert.equal(created.status, 200);
  const sessionToken = created.body.session_token;
  assert.equal((await post("/api/action", { session_token: sessionToken, command: "room.confirm_public_scope",
    params: { acknowledged: true } })).status, 200);
  assert.equal((await post("/api/model/bind", { session_token: sessionToken, acknowledged: true,
    binding_request_id: randomUUID() })).status, 200);
  return { run, banner, post, sessionToken, threadId };
}

test("真实beta默认不配置自动通知，真人绑定本身不启动窗口", { timeout: 15000 }, async (t) => {
  const f = await boot(t, false);
  assert.equal(f.banner.managed_wake, "disabled"); assert.equal(f.banner.proactive_wake_verified, false);
  const view = await f.post("/api/view", { session_token: f.sessionToken });
  assert.equal(view.body.view.model_wake.target_configured, false);
  const response = await f.post("/api/model/wake/start", { session_token: f.sessionToken,
    acknowledged: true, request_id: randomUUID(), thread_id: f.threadId });
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "wake_disabled");
  const final = await f.run.stop();
  assert.equal(final.graceful, true); assert.equal(final.forced, false); assert.equal(final.output_complete, true);
});

test("真实beta显式配置仍需另行启动；无事件窗口停止与IPC关停均完成", { timeout: 15000 }, async (t) => {
  const f = await boot(t, true);
  assert.equal(f.banner.managed_wake, "available"); assert.equal(f.banner.proactive_wake_verified, false);
  const view = await f.post("/api/view", { session_token: f.sessionToken });
  assert.equal(view.body.view.model_wake.target_configured, true);
  assert.equal(JSON.stringify(view.body.view.model_wake).includes(f.threadId), false);
  const wrong = await f.post("/api/model/wake/start", { session_token: f.sessionToken,
    acknowledged: true, request_id: randomUUID(), thread_id: randomUUID() });
  assert.equal(wrong.body.code, "wake_thread_not_authorized");
  const requestId = randomUUID();
  const started = await f.post("/api/model/wake/start", { session_token: f.sessionToken,
    acknowledged: true, request_id: requestId, max_notifications: 1 });
  assert.equal(started.body.ok, true, JSON.stringify(started.body));
  assert.equal(started.body.wake.target_configured, true);
  assert.equal(Object.hasOwn(started.body.wake, "thread_id"), false);
  assert.equal(started.body.wake.attempted_count, 0);
  const stopped = await f.post("/api/model/wake/stop", { session_token: f.sessionToken, request_id: requestId });
  assert.equal(stopped.body.ok, true); assert.equal(stopped.body.wake.state, "stopped");
  assert.equal(stopped.body.wake.target_configured, true);
  assert.equal(Object.hasOwn(stopped.body.wake, "thread_id"), false);
  assert.equal(stopped.body.wake.attempted_count, 0);
  assert.equal(stopped.body.wake.queued_count, 0); assert.equal(stopped.body.wake.resolved_count, 0);
  assert.equal(stopped.body.wake.cleanup_ok, true);
  const again = await f.post("/api/model/wake/start", { session_token: f.sessionToken,
    acknowledged: true, request_id: requestId, max_notifications: 1 });
  assert.equal(again.body.wake.state, "stopped"); assert.equal(again.body.wake.attempted_count, 0);
  const final = await f.run.stop();
  assert.equal(final.graceful, true); assert.equal(final.output_complete, true);
  assert.equal(final.forced, false); assert.equal(final.exit_code, 0);
  assert.doesNotMatch(f.run.stdout(), /model-token-|web-session-/);
});
