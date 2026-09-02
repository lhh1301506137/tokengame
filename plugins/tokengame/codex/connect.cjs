#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { UUID } = require("../../../src/host/codex-queue-transport.cjs");
const { readModelConnectionFile } = require("../../../src/shared/model-connection-file.cjs");
const { projectConnectionFile } = require("../../../src/host/project-model-connection.cjs");
const { CONNECTOR_CONTROL_SCHEMA } = require("./run-connector.cjs");
const { resolveCodexExecutable } = require("./play.cjs");
const { configureCodexProject, resolveCodexProject } = require("./project-config.cjs");

function failure(code) { return Object.assign(new Error(code), { code }); }

function connectorEnvironment(environment, config) {
  const result = {};
  for (const [key, value] of Object.entries(environment)) {
    const upper = key.toUpperCase();
    if (upper.startsWith("TOKENGAME_") || upper === "CODEX_THREAD_ID" || upper === "CODEX_SESSION_ID") continue;
    result[key] = value;
  }
  return { ...result,
    TOKENGAME_MODEL_CONNECTION_FILE: config.connectionFile,
    TOKENGAME_CODEX_EXECUTABLE: config.executable,
    TOKENGAME_CODEX_CWD: config.project,
    TOKENGAME_CODEX_THREAD: config.threadId,
  };
}

// 只脱离本次拥有的 Node 子进程。启动必须等到服务器确认注册；不会把 spawn 成功当成已连接。
function launchConnector(config, dependencies = {}) {
  const spawnImpl = dependencies.spawn ?? spawn;
  const startupMs = dependencies.startupMs ?? 10_000;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(process.execPath, [path.join(config.repository, "plugins", "tokengame", "codex", "run-connector.cjs")], {
        cwd: config.repository, env: config.env, shell: false, windowsHide: true, detached: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
    } catch { reject(failure("wake_connector_start_failed")); return; }
    let settled = false;
    let stopping = false;
    let startupTimer;
    let killTimer;
    const cleanup = () => {
      clearTimeout(startupTimer);
      clearTimeout(killTimer);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("close", onClose);
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === null) resolve({ connected: true });
      else reject(error);
    };
    let stopCode = "wake_connector_start_failed";
    const stopOwned = (code) => {
      if (stopping || settled) return;
      stopping = true;
      stopCode = code;
      try { if (child.connected) child.send({ schema: CONNECTOR_CONTROL_SCHEMA, event: "stop" }, () => {}); } catch { /* 有界回收兜底。 */ }
      killTimer = setTimeout(() => {
        try { child.kill(); } catch { /* 只针对本次创建的子进程。 */ }
        if (child.connected) { try { child.disconnect(); } catch { /* 保留失败。 */ } }
        child.unref();
        finish(failure("wake_connector_cleanup_unknown"));
      }, 2_000);
    };
    const onMessage = (message) => {
      if (settled || stopping || message?.schema !== CONNECTOR_CONTROL_SCHEMA) return;
      if (message.event === "connected" && Object.keys(message).length === 2) {
        try { if (child.connected) child.disconnect(); child.unref(); } catch {
          stopOwned("wake_connector_detach_failed");
          return;
        }
        finish();
      } else if (message.event === "failed") {
        const code = typeof message.code === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(message.code)
          ? message.code : "wake_connector_start_failed";
        stopOwned(code);
      }
    };
    const onError = () => stopOwned("wake_connector_start_failed");
    const onClose = () => finish(failure(stopCode));
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("close", onClose);
    startupTimer = setTimeout(() => stopOwned("wake_connector_start_timeout"), startupMs);
  });
}

async function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw failure("tokengame_codex_project_invalid");
    const environment = options.env ?? process.env;
    const resolveProject = options.resolveProject ?? resolveCodexProject;
    const resolved = resolveProject(options.cwd ?? process.cwd(), argv[0]);
    const rawThread = environment.CODEX_THREAD_ID;
    if (typeof rawThread !== "string" || !UUID.test(rawThread)) throw failure("tokengame_codex_thread_invalid");
    const executable = (options.resolveExecutable ?? resolveCodexExecutable)(environment);
    const connectionFile = (options.connectionFile ?? projectConnectionFile)(resolved.repository);
    (options.readConnection ?? readModelConnectionFile)(connectionFile);
    const config = { ...resolved, executable, connectionFile, threadId: rawThread.toLowerCase() };
    config.env = connectorEnvironment(environment, config);
    const configured = (options.configure ?? configureCodexProject)(resolved.repository, resolved.project);
    if (configured?.changed === true) {
      stdout.write("TokenGame 项目工具配置已更新。请重启专用游戏任务后再次启动连接器。\n");
      return 0;
    }
    if (configured?.changed !== false) throw failure("tokengame_codex_config_result_invalid");
    const started = await (options.launch ?? launchConnector)(config);
    if (started?.connected !== true) throw failure("wake_connector_start_failed");
    stdout.write("TokenGame 本机连接器已接入。请结束这条回复，让专用游戏任务空闲，再到 Web 牌桌由本人开启有限通知窗口。\n");
    stdout.write("连接器只出站、最长运行 1 小时；不改模型或推理强度，不会自行开启 AI。撤销本席 AI 连接可让它退出。\n");
    return 0;
  } catch (error) {
    const code = typeof error?.code === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(error.code)
      ? error.code : "wake_connector_start_failed";
    stderr.write(`TokenGame 连接器未启动：${code}。未输出路径、任务编号或凭据。\n`);
    return 1;
  }
}

if (require.main === module) run().then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });

module.exports = { run, launchConnector, connectorEnvironment };
