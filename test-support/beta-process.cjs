"use strict";

// 仅控制本函数 fork 的 beta；不查找/接管已有服务，也不调用宿主或模型。
const { fork } = require("node:child_process");
const path = require("node:path");
const { BETA_SHUTDOWN_MESSAGE } = require("../src/run-beta.cjs");

function deadline(promise, ms, code) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function startBetaProcess({ env = {}, execArgv = [], startupTimeoutMs = 10_000,
  shutdownTimeoutMs = 8_000, maxOutputBytes = 64 * 1024 } = {}) {
  for (const value of [startupTimeoutMs, shutdownTimeoutMs]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw new Error("beta_invalid_timeout");
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 1024 * 1024) {
    throw new Error("beta_invalid_output_limit");
  }
  const child = fork(path.resolve(__dirname, "../src/run-beta.cjs"), [], {
    cwd: path.resolve(__dirname, ".."), execPath: process.execPath, execArgv,
    env: {
      ...process.env, TOKENGAME_WEB_PORT: "0", TOKENGAME_WEB_HOST: "127.0.0.1",
      TOKENGAME_COMMAND_ORIGIN: "", TOKENGAME_MODEL_ADAPTER: "", TOKENGAME_MODEL_TOKEN: "",
      TOKENGAME_MODEL_CONNECTION_FILE: "", TOKENGAME_AI_RECEIPT_FILE: "",
      TOKENGAME_CODEX_WAKE: "", TOKENGAME_CODEX_EXECUTABLE: "", TOKENGAME_CODEX_CWD: "", TOKENGAME_CODEX_THREAD: "", ...env,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  const chunks = { stdout: [], stderr: [] };
  let outputBytes = 0;
  let banner = null;
  let closed = false;
  const pipes = { stdout: { ended: false, closed: false }, stderr: { ended: false, closed: false } };
  let forced = false;
  let exitObserved = false;
  let failure = null;
  let outputFailed = false;
  let stopPromise = null;
  let disconnectPromise = null;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // 早于 banner 的 stop/disconnect 也可用；调用者仍可 await ready 的拒绝。
  void ready.catch(() => {});
  const output = (name) => Buffer.concat(chunks[name]).toString("utf8");
  const result = (code, signal) => ({
    graceful: stopPromise !== null && failure === null && !forced && code === 0 && signal === null && exitObserved,
    exit_code: code, signal, forced, exit_observed: exitObserved,
    output_complete: closed && Object.values(pipes).every((pipe) => pipe.ended)
      && !outputFailed,
    reason: failure,
  });
  const fail = (code) => {
    // 保留最先失败的原因，但后来的截断/I/O 故障仍独立影响输出完整性。
    if (code === "beta_output_limit" || code === "beta_output_failed") outputFailed = true;
    failure ??= code;
    rejectReady(new Error(code));
  };
  const killOwned = () => {
    if (closed || child.exitCode !== null || child.signalCode !== null) return;
    forced = true;
    failure ??= "beta_forced_kill";
    child.kill("SIGKILL");
  };
  const startupTimer = setTimeout(() => { fail("beta_startup_timeout"); killOwned(); }, startupTimeoutMs);
  const exited = new Promise((resolve) => {
    let exitCode = null;
    let exitSignal = null;
    const complete = () => {
      if (closed || !exitObserved || !Object.values(pipes).every((pipe) => pipe.closed)) return;
      closed = true;
      clearTimeout(startupTimer);
      if (banner === null) rejectReady(new Error(failure ?? "beta_exited_before_ready"));
      resolve(result(exitCode, exitSignal));
    };
    child.once("exit", (code, signal) => {
      exitObserved = true;
      exitCode = code;
      exitSignal = signal;
      complete();
    });
    // Windows Node 24 父主动 disconnect 时可缺 ChildProcess.close。
    // 分别确认实际 exit 与两条管道的 end/close；不能用 destroy 假造排空。
    for (const name of ["stdout", "stderr"]) {
      child[name].once("end", () => { pipes[name].ended = true; });
      child[name].once("close", () => {
        pipes[name].closed = true;
        if (!pipes[name].ended) fail("beta_output_failed");
        complete();
      });
    }
  });
  child.on("error", () => { fail("beta_process_failed"); killOwned(); });
  for (const name of ["stdout", "stderr"]) {
    child[name].on("error", () => { fail("beta_output_failed"); killOwned(); });
    child[name].on("data", (chunk) => {
      const remaining = Math.max(0, maxOutputBytes - outputBytes);
      if (remaining > 0) chunks[name].push(chunk.subarray(0, remaining));
      outputBytes += Math.min(remaining, chunk.length);
      if (chunk.length > remaining) { fail("beta_output_limit"); killOwned(); return; }
      if (name !== "stdout" || banner !== null) return;
      const text = output("stdout");
      const end = text.indexOf("\n");
      if (end < 0) return;
      try {
        const value = JSON.parse(text.slice(0, end));
        if (value.service !== "tokengame-beta" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(value.origin)) {
          throw new Error("beta_bad_banner");
        }
        banner = value;
        clearTimeout(startupTimer);
        resolveReady(value);
      } catch { fail("beta_bad_banner"); killOwned(); }
    });
  }
  async function boundedExit(work) {
    try {
      return await deadline(Promise.resolve().then(work).then(() => exited), shutdownTimeoutMs, "beta_shutdown_timeout");
    } catch (error) {
      fail(error.message);
      killOwned();
      let final;
      try { final = await deadline(exited, 2_000, "beta_kill_timeout"); } catch {
        throw Object.assign(new Error("beta_kill_timeout"), { result: { graceful: false, forced, exit_observed: exitObserved } });
      }
      throw Object.assign(new Error(failure), { result: final });
    }
  }
  function stop() {
    if (stopPromise !== null) return stopPromise;
    stopPromise = boundedExit(() => new Promise((resolve, reject) => {
      if (closed || !child.connected) { reject(new Error("beta_ipc_unavailable")); return; }
      // 固定形状；不传任意命令、文件路径、牌桌凭据或宿主参数。
      child.send(BETA_SHUTDOWN_MESSAGE, (error) => {
        if (error) reject(new Error("beta_ipc_send_failed"));
        else resolve();
      });
    })).then((final) => {
      if (!final.graceful) throw Object.assign(new Error(final.reason ?? "beta_shutdown_failed"), { result: final });
      return final;
    });
    return stopPromise;
  }
  function disconnect() {
    if (disconnectPromise !== null) return disconnectPromise;
    failure ??= "beta_parent_disconnected";
    disconnectPromise = boundedExit(() => {
      if (!child.connected) throw new Error("beta_ipc_unavailable");
      child.disconnect();
    });
    return disconnectPromise;
  }
  async function forceKill() {
    killOwned();
    return deadline(exited, 2_000, "beta_kill_timeout");
  }
  return { child, ready, get banner() { return banner; },
    stdout: () => output("stdout"), stderr: () => output("stderr"), stop, disconnect, forceKill };
}

module.exports = { startBetaProcess };
