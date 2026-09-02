"use strict";

const { spawn } = require("node:child_process");
const {
  UUID, ProbeFailure, absolute, buildQueueCommand, sendQueue, cleanup,
} = require("./codex-queue-transport.cjs");

const SENDER_LIMITS = Object.freeze({ queueTimeoutMs: 10_000, cleanupTimeoutMs: 2_000, maxOutputBytes: 1024 * 1024 });
const REASONS = new Set([
  "cancelled", "queue_timeout", "child_start_failed", "queue_output_limit", "queue_child_error", "queue_io_error",
]);

// Constructing a sender does not run Codex. Configuration is server-owned,
// never supplied by the model or copied from a player's message.
function createCodexQueueSender(options = {}, dependencies = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some((key) => !["codexExecutable", "cwd", "threadId", ...Object.keys(SENDER_LIMITS)].includes(key))
    || !absolute(options.codexExecutable) || !absolute(options.cwd)
    || typeof options.threadId !== "string" || !UUID.test(options.threadId)) {
    throw new ProbeFailure("invalid_configuration");
  }
  const config = { codexExecutable: options.codexExecutable, cwd: options.cwd, threadId: options.threadId.toLowerCase() };
  for (const [key, upper] of Object.entries(SENDER_LIMITS)) {
    const value = options[key] ?? upper;
    if (!Number.isSafeInteger(value) || value < 1 || value > upper) throw new ProbeFailure("invalid_configuration");
    config[key] = value;
  }
  Object.freeze(config);
  const spawnImpl = dependencies.spawn ?? spawn;
  if (typeof spawnImpl !== "function") throw new ProbeFailure("invalid_configuration");
  const selectThread = (candidate) => {
    if (candidate === undefined) return config.threadId;
    if (typeof candidate !== "string" || !UUID.test(candidate) || candidate.toLowerCase() !== config.threadId) return null;
    return config.threadId;
  };

  async function wakeQueue(input = {}) {
    const result = { queued: false, attempted: false, cleanup_ok: true, reason: "invalid_configuration" };
    if (input === null || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some((key) => !["threadId", "intentId", "notificationId", "signal"].includes(key))
      || typeof input.threadId !== "string" || !UUID.test(input.threadId)
      || (input.signal !== undefined && !(input.signal instanceof AbortSignal))) return result;
    const threadId = selectThread(input.threadId);
    if (threadId === null) return { ...result, reason: "wake_thread_not_authorized" };
    let plan;
    try {
      plan = buildQueueCommand({ ...config, threadId, probeId: input.notificationId, noticeKind: "managed" }, input.intentId);
    } catch { return result; }
    if (input.signal?.aborted) return { ...result, reason: "cancelled" };

    const children = new Set();
    const controller = new AbortController();
    let timer;
    let rejectStop;
    const stopped = new Promise((_, reject) => { rejectStop = reject; });
    const cancel = (reason) => { controller.abort(); rejectStop(new ProbeFailure(reason)); };
    const onAbort = () => cancel("cancelled");
    input.signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => cancel("queue_timeout"), config.queueTimeoutMs);
    try {
      // queue does not need table credentials. It uses the existing native task
      // through the caller's unchanged Codex environment, not a new provider.
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("TOKENGAME_")));
      const exit = await Promise.race([stopped, Promise.resolve().then(() => {
        if (input.signal?.aborted || controller.signal.aborted) throw new ProbeFailure("cancelled");
        result.attempted = true;
        return sendQueue(plan, { signal: controller.signal }, config, children, spawnImpl, env);
      })]);
      if (input.signal?.aborted || controller.signal.aborted) throw new ProbeFailure("cancelled");
      if (exit?.exit_code === 0 && exit.signal === null) {
        result.queued = true;
        result.reason = null;
      } else result.reason = "queue_acceptance_unknown";
    } catch (error) {
      result.reason = error instanceof ProbeFailure && REASONS.has(error.code) ? error.code : "queue_failed";
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      controller.abort();
      // At most one process was created; its close includes stream closure.
      for (const child of children) {
        if (!await cleanup(() => child.close(config.cleanupTimeoutMs), config.cleanupTimeoutMs + 10)) result.cleanup_ok = false;
        if (child.errors.size > 0 && result.queued) {
          result.queued = false;
          result.reason = "queue_io_error";
        }
      }
      if (!result.cleanup_ok) { result.queued = false; result.reason = "queue_cleanup_failed"; }
    }
    return result;
  }
  Object.defineProperty(wakeQueue, "selectThread", { value: selectThread });
  Object.defineProperty(wakeQueue, "allowsThread", { value: (id) => id !== undefined && selectThread(id) !== null });
  return wakeQueue;
}

// Two independent opt-ins: this only installs a sender; the player must still
// start a bounded window through the authenticated human control route.
function loadCodexWakeQueue(env = process.env) {
  const enabled = env.TOKENGAME_CODEX_WAKE;
  if (enabled === undefined || enabled === "" || enabled === "0") return null;
  if (enabled !== "1") throw new ProbeFailure("invalid_configuration");
  return createCodexQueueSender({ codexExecutable: env.TOKENGAME_CODEX_EXECUTABLE, cwd: env.TOKENGAME_CODEX_CWD,
    threadId: env.TOKENGAME_CODEX_THREAD });
}

module.exports = { SENDER_LIMITS, createCodexQueueSender, loadCodexWakeQueue };
