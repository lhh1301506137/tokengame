#!/usr/bin/env node
"use strict";

const { RemoteWakeConnector } = require("../../../src/host/remote-wake-connector.cjs");
const { createCodexQueueSender } = require("../../../src/host/codex-queue-sender.cjs");

const CONNECTOR_CONTROL_SCHEMA = "tokengame.remote-connector-control.v1";

async function run(options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const controller = new AbortController();
  const stop = () => controller.abort();
  const onMessage = (message) => {
    if (message?.schema === CONNECTOR_CONTROL_SCHEMA && message?.event === "stop"
      && Object.keys(message).length === 2) stop();
  };
  if (options.installSignals !== false) {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    process.on("message", onMessage);
  }
  const send = options.send ?? (typeof process.send === "function" ? (message) => {
    if (process.connected) process.send(message, () => {});
  } : () => {});
  let reportedReady = false;
  const report = (event) => {
    // 只输出本地传输事实，不输出连接文件、地址、令牌、任务编号或模型正文。
    stdout.write(`${JSON.stringify({ schema: CONNECTOR_CONTROL_SCHEMA, ...event })}\n`);
    if (event.type === "connected" && !reportedReady) {
      reportedReady = true;
      send({ schema: CONNECTOR_CONTROL_SCHEMA, event: "connected" });
    }
  };
  try {
    const connector = options.connector ?? new RemoteWakeConnector({
      connectionFile: env.TOKENGAME_MODEL_CONNECTION_FILE,
      threadId: env.TOKENGAME_CODEX_THREAD,
    }, {
      onEvent: report,
      wakeQueue: createCodexQueueSender({ codexExecutable: env.TOKENGAME_CODEX_EXECUTABLE,
        cwd: env.TOKENGAME_CODEX_CWD, threadId: env.TOKENGAME_CODEX_THREAD }),
    });
    const result = await connector.run({ signal: controller.signal });
    if (!reportedReady) send({ schema: CONNECTOR_CONTROL_SCHEMA, event: "failed", code: result.reason });
    return result;
  } catch (error) {
    const code = typeof error?.code === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(error.code)
      ? error.code : "wake_connector_failed";
    send({ schema: CONNECTOR_CONTROL_SCHEMA, event: "failed", code });
    return { status: "stopped", reason: code, cleanup_ok: false };
  } finally {
    if (options.installSignals !== false) {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      process.off("message", onMessage);
    }
  }
}

if (require.main === module) {
  run().then((result) => {
    process.exitCode = ["cancelled", "max_duration", "max_notifications", "model_command_token_rejected",
      "model_binding_changed", "model_connection_unavailable", "model_connection_changed"].includes(result.reason)
      && result.cleanup_ok ? 0 : 1;
    if (process.connected) process.disconnect();
  }, () => { process.exitCode = 1; if (process.connected) process.disconnect(); });
}

module.exports = { run, CONNECTOR_CONTROL_SCHEMA };
