"use strict";

// Shared process boundary for the old one-shot probe and the opt-in wake sender.
// No I/O on import. This module does not claim intents or call a model.
const path = require("node:path");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ProbeFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code) { throw new ProbeFailure(code); }
function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value) && !/[\0\r\n]/.test(value)
    // Root-relative Windows paths depend on the caller's current drive.
    && (process.platform !== "win32" || /^[A-Za-z]:[\\/]/.test(value))
    && !/^[\\/]{2}/.test(value);
}
function intentId(value) {
  return typeof value === "string" && value.startsWith("intent-") && UUID.test(value.slice(7));
}

function buildQueueCommand(config, id) {
  if (!intentId(id) || typeof config.probeId !== "string" || !UUID.test(config.probeId)
    || typeof config.threadId !== "string" || !UUID.test(config.threadId)
    || !absolute(config.codexExecutable) || !absolute(config.cwd)
    || ![undefined, "managed"].includes(config.noticeKind)) fail("invalid_configuration");
  const message = config.noticeKind === "managed"
    ? `[LOCAL_CONTROL:tokengame-managed-wake]\nnotification_id=${config.probeId}\nintent_id=${id}\n`
      + "除宿主强制的一句极短进度外，不先分析、计划、复述通知、读取文件、查找任务、读取牌桌投影或调用任何其他工具。"
      + "第一项工具调用必须立即是已配置 tokengame_table 的 ai.start，并使用上面的 intent_id。"
      + "ai.start拒绝则立即停止且不重试。成功后只使用其返回的本席 model_context 决定一次 silent 或 public_speech，"
      + "再以返回的 turn_id 调用一次 ai.resolve。不得替玩家发言或下注；不得领取其他待办、读取文件或其他任务、创建线程；"
      + "不得改变当前任务模型、推理强度、权限或宿主配置。这不是玩家公开聊天。"
    : `[LOCAL_CONTROL:tokengame-b10-wake]\nprobe_id=${config.probeId}\nintent_id=${id}\n`
      + "这是一次测试控制通知，不是玩家公开聊天。只使用已配置的 tokengame_table，"
      + "以此 intent_id 调用一次 ai.start，不再领取待办。若拒绝就停止，不重试。"
      + "仅在成功后使用返回的本席 model_context，自主决定一次 silent 或 public_speech，"
      + "再以返回的 turn_id 调用一次 ai.resolve。不要替玩家发言或下注，不读取文件或其他任务，"
      + "不创建新线程，不改变当前任务模型、推理强度、权限或宿主配置。";
  return Object.freeze({
    executable: config.codexExecutable, cwd: config.cwd,
    args: Object.freeze(["queue", "--thread", config.threadId, "--message", message]),
    shell: false, windowsHide: true,
  });
}

function ownChild(executable, args, options, children, spawnImpl) {
  let child;
  try { child = spawnImpl(executable, args, { ...options, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); }
  catch { fail("child_start_failed"); }
  let closed = false;
  let closing;
  const errors = new Set();
  const ended = new Promise((resolve) => {
    child.once("close", (code, signal) => {
      closed = true;
      resolve({ exit_code: code, signal });
    });
  });
  child.on("error", () => { errors.add("child_error"); });
  child.stdin.on("error", () => { errors.add("child_stdin_error"); });
  child.stdout.on("error", () => { errors.add("child_stdout_error"); });
  child.stderr.on("error", () => { errors.add("child_stderr_error"); });
  const owned = {
    child, ended, errors,
    isClosed: () => closed,
    close(ms) { closing ??= close(ms); return closing; },
  };
  async function close(ms) {
    let timer;
    let clean = true;
    try {
      if (!closed) {
        try { child.stdin.destroy(); } catch { clean = false; }
        try { child.kill(); } catch { clean = false; }
      }
      await Promise.race([ended, new Promise((resolve) => { timer = setTimeout(resolve, ms); })]);
      if (!closed) {
        try { child.kill("SIGKILL"); } catch { /* The unconfirmed close remains a failure. */ }
        clean = false;
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
      }
      return clean && closed;
    } finally { clearTimeout(timer); }
  }
  children.add(owned);
  return owned;
}

async function sendQueue(plan, context, config, children, spawnImpl, env = process.env) {
  if (context.signal.aborted) fail("cancelled");
  const owned = ownChild(plan.executable, [...plan.args], { cwd: plan.cwd, env }, children, spawnImpl);
  let bytes = 0;
  const limited = new Promise((_, reject) => {
    const count = (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > config.maxOutputBytes) reject(new ProbeFailure("queue_output_limit"));
    };
    owned.child.stdout.on("data", count);
    owned.child.stderr.on("data", count);
    owned.child.on("error", () => reject(new ProbeFailure("queue_child_error")));
    for (const stream of [owned.child.stdin, owned.child.stdout, owned.child.stderr]) {
      stream.on("error", () => reject(new ProbeFailure("queue_io_error")));
    }
  });
  owned.child.stdin.end();
  const exit = await Promise.race([owned.ended, limited]);
  if (owned.errors.size > 0) fail("queue_child_error");
  return exit;
}

async function cleanup(call, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(call).then((value) => value === true, () => false),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

module.exports = { UUID, ProbeFailure, fail, absolute, intentId, buildQueueCommand, ownChild, sendQueue, cleanup };
