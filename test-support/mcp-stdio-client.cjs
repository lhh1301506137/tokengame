"use strict";

// 验收用真实 MCP 子进程。没有模型调用；每个实例只读取传入的私有连接文件。
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");

function startSeatMcp(connectionFile) {
  const child = spawn(process.execPath, [path.resolve(__dirname, "../plugins/tokengame/mcp/server.cjs"), "--stdio"], {
    env: {
      ...process.env,
      TOKENGAME_MODEL_CONNECTION_FILE: connectionFile ?? "",
      TOKENGAME_MODEL_TOKEN: "",
      TOKENGAME_TABLE_ORIGIN: "",
      TOKENGAME_COMMAND_ORIGIN: "",
      TOKENGAME_AUTHORITY_TOKEN: "",
      TOKENGAME_CORE_TIMEOUT_MS: "3000",
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  const transcript = [];
  let stderr = "";
  let sequence = 0;
  let closed = false;
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  function failAll(error) {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  }
  const stopped = new Promise((resolve) => child.once("close", () => {
    closed = true;
    lines.close();
    failAll(new Error("mcp_process_closed"));
    resolve();
  }));
  child.on("error", () => failAll(new Error("mcp_process_start_failed")));
  child.stdin.on("error", () => failAll(new Error("mcp_stdin_closed")));
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  lines.on("line", (line) => {
    transcript.push(line);
    let response;
    try { response = JSON.parse(line); } catch {
      failAll(new Error("mcp_stdout_is_not_json"));
      return;
    }
    const waiter = pending.get(response.id);
    if (waiter === undefined) return;
    pending.delete(response.id);
    clearTimeout(waiter.timer);
    waiter.resolve(response);
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error("mcp_process_closed")); return; }
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`mcp_request_timeout:${method}`));
    }, 8_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
      if (error) failAll(new Error("mcp_stdin_closed"));
    });
  });
  return {
    transcript,
    stderr: () => stderr,
    request,
    async table(command, params = {}) {
      const reply = await request("tools/call", { name: "tokengame_table", arguments: { command, params } });
      if (reply.error) throw new Error(`mcp_protocol_error:${reply.error.code}`);
      const raw = reply.result.content[0].text;
      return { isError: reply.result.isError === true, body: JSON.parse(raw), raw };
    },
    async stop() {
      if (!closed) {
        child.stdin.end();
        child.kill();
      }
      await stopped;
    },
  };
}

module.exports = { startSeatMcp };
