"use strict";

const readline = require("node:readline");
const { bridgeRequest } = require("../hooks/hook-lib.cjs");

const tools = [
  {
    name: "tokengame_probe_status",
    description: "读取 TokenGame 本地桥探针的公开状态。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "tokengame_open_action_window",
    description: "在本地伪权威服务中打开一个新的行动窗口。仅用于桥接探针。",
    inputSchema: {
      type: "object",
      properties: {
        duration_ms: { type: "integer", minimum: 1, maximum: 600000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "tokengame_close_action_window",
    description: "关闭当前本地探针行动窗口。",
    inputSchema: {
      type: "object",
      properties: { reason: { type: "string", maxLength: 120 } },
      additionalProperties: false,
    },
  },
  {
    name: "tokengame_reset_probe",
    description: "重置本地伪权威事件流，并默认打开一个新行动窗口。",
    inputSchema: {
      type: "object",
      properties: {
        auto_open: { type: "boolean" },
        duration_ms: { type: "integer", minimum: 1, maximum: 600000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "publish_ai_answer",
    description: "当 Stop Hook 未能提交时，显式补交某个已登记公开提示的最终 AI 回答。",
    inputSchema: {
      type: "object",
      required: ["session_id", "turn_id", "message"],
      properties: {
        session_id: { type: "string", minLength: 1 },
        turn_id: { type: "string", minLength: 1 },
        message: { type: "string", minLength: 1, maxLength: 8000 },
      },
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  const routes = {
    tokengame_probe_status: ["/v1/status", "GET", undefined],
    tokengame_open_action_window: ["/v1/windows/open", "POST", args],
    tokengame_close_action_window: ["/v1/windows/close", "POST", args],
    tokengame_reset_probe: ["/v1/probe/reset", "POST", args],
    publish_ai_answer: [
      "/v1/answers",
      "POST",
      {
        session_id: args.session_id,
        turn_id: args.turn_id,
        message: args.message,
        idempotency_key: `answer:${args.session_id}:${args.turn_id}`,
      },
    ],
  };
  const route = routes[name];
  if (!route) {
    throw Object.assign(new Error(`unknown_tool:${name}`), { code: -32602 });
  }

  try {
    const result = await bridgeRequest(route[0], { method: route[1], body: route[2] });
    return {
      content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
      isError: !result.ok,
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `TokenGame bridge unavailable: ${error.message}` }],
      isError: true,
    };
  }
}

async function handleMessage(message) {
  if (message.method === "notifications/initialized") return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "tokengame-local-probe", version: "0.1.0" },
      },
    };
  }
  if (message.method === "ping") {
    return { jsonrpc: "2.0", id: message.id, result: {} };
  }
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id: message.id, result: { tools } };
  }
  if (message.method === "tools/call") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: await callTool(message.params?.name, message.params?.arguments || {}),
    };
  }
  return {
    jsonrpc: "2.0",
    id: message.id ?? null,
    error: { code: -32601, message: `Method not found: ${message.method}` },
  };
}

if (require.main === module) {
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    try {
      const response = await handleMessage(JSON.parse(line));
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: error.code || -32603, message: error.message || "Internal error" },
      })}\n`);
    }
  });
}

module.exports = { callTool, handleMessage, tools };
