#!/usr/bin/env node
"use strict";

const { configureCodexProject } = require("./project-config.cjs");

function run(argv = process.argv.slice(2), options = {}) {
  const repository = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  try {
    if (argv.length !== 1) {
      stderr.write("TokenGame Codex 项目配置无效：请提供当前 Codex 项目根的绝对路径。\n");
      return 2;
    }
    const result = configureCodexProject(repository, argv[0]);
    if (!result.changed) {
      stdout.write("TokenGame 项目 MCP 已是当前配置，无需改动或重启。\n");
      return 0;
    }
    stdout.write("TokenGame 项目 MCP 已配置。请由真人重启一次 Codex 宿主；以后换发本席连接无需再重启。\n");
    return 0;
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "tokengame_codex_config_failed";
    stderr.write(`TokenGame Codex 项目配置失败：${code}。未改用户级配置。\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = run();

module.exports = { run };
