"use strict";

// B16 浏览器夹具：真实权威/HTTP/通知管理器，接收端明确为本地脚本。
// 没有 Codex 发送器、模型进程、私有连接文件或额外 HTTP 控制入口。
const { randomUUID } = require("node:crypto");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost, MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");

const FIXTURE_THREAD_ID = "16b00000-0000-4000-8000-000000000001";
const ACCEPTED = Object.freeze({ queued: true, attempted: true, cleanup_ok: true, reason: null });

async function createManagedWakeUiFixture({ enabled = true, fixedTarget = false } = {}) {
  if (typeof enabled !== "boolean" || typeof fixedTarget !== "boolean") throw new Error("fixture_invalid_options");
  let clock = 1_000_000;
  const now = () => clock;
  const surface = new CommandSurface({ now });
  const core = new InProcessCoreClient({ surface });
  const notifications = [];
  const commands = [];
  let queueMode = "accept";
  let targetHandle = null;
  let origin;
  let closed = false;
  const queue = async (input) => {
    notifications.push({ intent_id: input.intentId, notification_id: input.notificationId,
      thread_id: input.threadId, seat_handle: targetHandle, mode: queueMode, resolved: false });
    if (queueMode === "reject") {
      return { queued: false, attempted: true, cleanup_ok: true, reason: "queue_rejected" };
    }
    if (queueMode === "hold") {
      await new Promise((resolve) => {
        if (input.signal.aborted) resolve();
        else input.signal.addEventListener("abort", resolve, { once: true });
      });
      return { queued: false, attempted: true, cleanup_ok: true, reason: "cancelled" };
    }
    return ACCEPTED;
  };
  Object.defineProperty(queue, "allowsThread", { value: (id) => typeof id === "string"
    && id.toLowerCase() === FIXTURE_THREAD_ID });
  if (fixedTarget) Object.defineProperty(queue, "selectThread", { value: (candidate) => candidate === undefined
    || (typeof candidate === "string" && candidate.toLowerCase() === FIXTURE_THREAD_ID)
    ? FIXTURE_THREAD_ID : null });
  const host = new TableWebHost({ core, now, modelBindingEnabled: true,
    wakeQueue: enabled ? queue : null,
    wakeOptions: { maxNotifications: 2, maxDurationMs: 600_000, pollIntervalMs: 20 },
    driveIntervalMs: 999_999, sweepIntervalMs: 999_999,
  });

  async function post(route, body, headers = {}) {
    const response = await fetch(`${origin}${route}`, { method: "POST",
      headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(4_000) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.code ?? `HTTP ${response.status}`),
      { code: payload.code, status: response.status });
    return payload;
  }
  function session(index) {
    if (!Number.isSafeInteger(index) || index < 0) throw new Error("fixture_invalid_seat_index");
    const value = [...host.sessions.values()][index];
    if (!value) throw new Error("fixture_seat_not_created");
    return value;
  }
  const action = (seat, command, params = {}) => post("/api/action", {
    session_token: seat.token, command, params,
  });
  async function model(token, command, params = {}) {
    const result = await post("/api/model/command", requestEnvelope(command, params), {
      [MODEL_COMMAND_TOKEN_HEADER]: token,
    });
    commands.push({ command, ok: result.ok });
    return result.result;
  }
  async function begin(entry, binding) {
    if (entry.turn_id !== undefined) return entry.turn_id;
    const started = await model(binding.token, "ai.start", { intent_id: entry.intent_id });
    entry.turn_id = started.started.turn_id;
    return entry.turn_id;
  }
  function snapshot() {
    return { service: "tokengame-b16-scripted-ui-fixture", origin, closed, target_configured: fixedTarget,
      native_model_calls: 0, native_queue_calls: 0, seat_count: host.sessions.size,
      notifications: notifications.map(({ intent_id, mode, resolved }) => ({ intent_id, mode, resolved })),
      commands: commands.slice(), windows: [...host.sessions.values()].map((seat) => {
        const binding = host.modelBindings.get(seat.seat_handle);
        return { seat_id: seat.seat_id, bound: Boolean(binding),
          wake: binding ? host.wakeSessions.status({ seat_handle: seat.seat_handle, binding_id: binding.binding_id }) : null };
      }) };
  }
  async function control(input) {
    if (closed) throw new Error("fixture_closed");
    switch (input.command) {
      case "bind": {
        const seat = session(input.seat ?? 0);
        if (targetHandle !== null && targetHandle !== seat.seat_handle) throw new Error("fixture_target_is_already_bound");
        const bound = await post("/api/model/bind", { session_token: seat.token,
          acknowledged: true, binding_request_id: randomUUID() });
        targetHandle = seat.seat_handle;
        // 凭据只在本夹具内存临时经过真实模型 HTTP 路由，不打印/不下载。
        await model(bound.connection.model_token, "view.projection");
        return { seat_id: seat.seat_id, binding_id: bound.binding.binding_id, thread_id: FIXTURE_THREAD_ID };
      }
      case "source": {
        const text = input.text ?? "本地脚本来源：这一手你怎么看？";
        if (typeof text !== "string" || text.length > 100) throw new Error("fixture_invalid_source");
        clock += 5_500;
        await action(session(input.seat ?? 1), "chat.say", { text, idempotency_key: randomUUID() });
        return { source_sent: true };
      }
      case "begin":
      case "resolve": {
        const entry = notifications[input.index ?? notifications.length - 1];
        if (!entry || entry.resolved || entry.mode !== "accept") throw new Error("fixture_notification_not_resolvable");
        const binding = host.modelBindings.get(entry.seat_handle);
        if (!binding) throw new Error("fixture_binding_revoked");
        if (input.command === "begin") {
          await begin(entry, binding);
          return { started: true, index: input.index ?? notifications.length - 1 };
        }
        const decision = input.decision ?? "public_speech";
        if (!["public_speech", "silent"].includes(decision)) throw new Error("fixture_invalid_decision");
        const turnId = await begin(entry, binding);
        const result = await model(binding.token, "ai.resolve", { turn_id: turnId,
          decision, ...(decision === "public_speech"
            ? { text: "这是本地脚本的测试吐槽，不是真实模型生成。" } : {}) });
        entry.resolved = true;
        return { resolved: true, decision, result };
      }
      case "mode":
        if (!["accept", "reject", "hold"].includes(input.mode)) throw new Error("fixture_invalid_mode");
        queueMode = input.mode;
        return { mode: queueMode };
      case "advance":
        if (!Number.isSafeInteger(input.ms) || input.ms < 0 || input.ms > 60_000) throw new Error("fixture_invalid_advance");
        clock += input.ms;
        return { advanced_ms: input.ms };
      case "start_hand":
        await core.dispatch("hand.evaluate_start"); clock += 3_000;
        await core.dispatch("hand.start_if_due");
        return { hand_status: surface.orchestrator.hand.status };
      case "summary": return snapshot();
      default: throw new Error("fixture_unknown_control");
    }
  }
  async function stop() {
    if (closed) return { already_closed: true };
    await host.stop();
    closed = true;
    return { closed: true, ...snapshot() };
  }
  try { origin = await host.start({ port: 0 }); }
  catch (error) { await host.stop().catch(() => {}); throw error; }
  return { origin, threadId: FIXTURE_THREAD_ID, post, control, snapshot, stop };
}

if (require.main === module) {
  const readline = require("node:readline");
  void (async () => {
    const fixture = await createManagedWakeUiFixture({ enabled: !process.argv.includes("--disabled") });
    process.stdout.write(`${JSON.stringify({ service: "tokengame-b16-scripted-ui-fixture", origin: fixture.origin,
      thread_id: fixture.threadId, native_model_calls: 0, native_queue_calls: 0 })}\n`);
    const lines = readline.createInterface({ input: process.stdin });
    try {
      for await (const line of lines) {
        try {
          const input = JSON.parse(line);
          if (input.command === "stop") break;
          process.stdout.write(`${JSON.stringify({ ok: true, result: await fixture.control(input) })}\n`);
        } catch (error) {
          process.stdout.write(`${JSON.stringify({ ok: false, code: error.code ?? error.message })}\n`);
        }
      }
    } finally {
      lines.close();
      process.stdout.write(`${JSON.stringify({ ok: true, cleanup: await fixture.stop() })}\n`);
    }
  })().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1; });
}

module.exports = { createManagedWakeUiFixture, FIXTURE_THREAD_ID };
