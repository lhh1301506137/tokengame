#!/usr/bin/env node
"use strict";

const { configureProjectMcp } = require("./host/project-model-connection.cjs");

function run(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const environment = options.environment ?? process.env;
  const stderr = options.stderr ?? process.stderr;
  const loadServer = options.loadServer ?? require;
  try {
    const configured = configureProjectMcp(cwd, environment);
    const server = loadServer(configured.server);
    if (typeof server.runStdio !== "function") throw new Error("tokengame_mcp_entry_invalid");
    server.runStdio(options.stdio);
    return 0;
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "tokengame_mcp_start_failed";
    stderr.write(`TokenGame project MCP failed: ${code}.\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = run();

module.exports = { run };
