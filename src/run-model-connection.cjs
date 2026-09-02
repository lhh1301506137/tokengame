#!/usr/bin/env node
"use strict";

const {
  activateProjectConnection,
  clearProjectConnection,
} = require("./host/project-model-connection.cjs");

function run(argv = process.argv.slice(2), options = {}) {
  const root = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  try {
    if (argv[0] === "activate" && argv.length === 2) {
      const result = activateProjectConnection(root, argv[1]);
      stdout.write(result.replaced
        ? "TokenGame 本席连接已完整换发；MCP 无需重启。原下载文件仍存在，请由真人自行安全删除。\n"
        : "TokenGame 本席连接已激活；MCP 无需重启。原下载文件仍存在，请由真人自行安全删除。\n");
      return 0;
    }
    if (argv[0] === "clear" && argv.length === 1) {
      const result = clearProjectConnection(root);
      stdout.write(result.removed
        ? "TokenGame 项目活动连接已清除。服务端撤权仍以牌桌中的撤销操作为准。\n"
        : "TokenGame 项目没有活动连接，无需清除。\n");
      return 0;
    }
    stderr.write("TokenGame 连接命令无效：使用 activate <绝对路径> 或 clear。\n");
    return 2;
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "model_connection_operation_failed";
    stderr.write(`TokenGame 连接操作失败：${code}。未输出文件路径或凭据。\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = run();

module.exports = { run };
