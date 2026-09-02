#!/usr/bin/env node
"use strict";

const { connectionOrigin } = require("./shared/model-connection-file.cjs");
const { main: betaMain } = require("./run-beta.cjs");

async function run(argv = process.argv.slice(2), options = {}) {
  const stderr = options.stderr ?? process.stderr;
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw Object.assign(new Error("remote_origin_required"), { code: "remote_origin_required" });
    const origin = connectionOrigin(argv[0]);
    if (!origin.startsWith("https://")) throw Object.assign(new Error("remote_https_required"), { code: "remote_https_required" });
    const source = options.env ?? process.env;
    const env = Object.fromEntries(Object.entries(source).filter(([key]) => !key.toUpperCase().startsWith("TOKENGAME_")));
    Object.assign(env, {
      TOKENGAME_WEB_HOST: "127.0.0.1",
      TOKENGAME_WEB_PORT: source.TOKENGAME_WEB_PORT ?? "",
      TOKENGAME_PUBLIC_ORIGIN: origin,
      TOKENGAME_REMOTE_WAKE: "1",
      TOKENGAME_CODEX_WAKE: "0",
      TOKENGAME_COMMAND_ORIGIN: "",
      TOKENGAME_MODEL_ADAPTER: "",
      TOKENGAME_AI_RECEIPT_FILE: source.TOKENGAME_AI_RECEIPT_FILE ?? "",
    });
    const started = await (options.betaMain ?? betaMain)({ env });
    if (started === false) throw Object.assign(new Error("remote_beta_start_failed"), { code: "remote_beta_start_failed" });
    return 0;
  } catch (error) {
    const code = typeof error?.code === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(error.code)
      ? error.code : "remote_beta_start_failed";
    stderr.write(`TokenGame 好友服务未启动：${code}。需要显式 HTTPS 根地址；不会输出原地址或凭据。\n`);
    return 1;
  }
}

if (require.main === module) run().then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });

module.exports = { run };
