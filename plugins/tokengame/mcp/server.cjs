"use strict";

const readline = require("node:readline");
const { bridgeRequest } = require("../hooks/hook-lib.cjs");
const { HOST_COMMANDS } = require("../../../src/authority/host-surface.cjs");

// 牌桌命令走 HTTP 打到已经在跑的权威核心（npm run core），不在本进程构造牌桌。
// 这一条是架构的分水岭：进程内 require CommandSurface 会让每个宿主各自持有一张牌桌，
// 于是两个宿主就是两场牌局——正是 L2 章程点名的「不同房间命名空间或独立玩家身份」。
//
// 鉴权沿用 command-server 既有的 x-tokengame-authority-token 约定，不另造一套：
// U-TG-LOCAL-BRIDGE-AUTH 是 professional_design_unknown、blocking_boundary: release，
// 不由这里发明。这个令牌只说明「这个进程有资格说话」，不说明「你拥有哪一席」——
// 后者要席位凭据，由核心校验。
const DEFAULT_CORE_ORIGIN = "http://127.0.0.1:7801";

async function coreRequest(command, params = {}) {
  const origin = process.env.TOKENGAME_COMMAND_ORIGIN || DEFAULT_CORE_ORIGIN;
  const token = process.env.TOKENGAME_AUTHORITY_TOKEN || "local-probe-only-authority-token";
  const response = await fetch(`${origin}/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tokengame-authority-token": token,
    },
    body: JSON.stringify({ command, params }),
    signal: AbortSignal.timeout(Number(process.env.TOKENGAME_CORE_TIMEOUT_MS || 5_000)),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { code: "invalid_core_response" };
  }
  return { ok: response.ok, status: response.status, body: payload };
}

const tools = [
  {
    name: "tokengame_table",
    description:
      "向 TokenGame 权威核心发一条牌桌命令。需要席位的命令要一并给 seat_id 与 recovery_credential。",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        // 枚举直接取自 host-surface.cjs，不在这里手抄一份：手抄的清单就是延迟发作的分叉。
        command: { type: "string", enum: [...HOST_COMMANDS] },
        params: { type: "object" },
      },
      additionalProperties: false,
    },
  },
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
  if (name === "tokengame_table") {
    const command = args.command;
    // 白名单在本地先挡一道。核心当然也会拒未知命令，但把权威自驱命令挡在这里是为了让
    // 拒绝的理由说得出来：那几条是核心自己按时钟推进的，不是宿主该催的。
    if (!HOST_COMMANDS.includes(command)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: "command_not_host_facing",
            command: command ?? null,
            host_commands: [...HOST_COMMANDS],
          }, null, 2),
        }],
        isError: true,
      };
    }
    try {
      const result = await coreRequest(command, args.params || {});
      return {
        content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
        isError: !result.ok,
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `TokenGame core unavailable: ${error.message}（核心未启动时先运行 npm run core）`,
        }],
        isError: true,
      };
    }
  }

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
