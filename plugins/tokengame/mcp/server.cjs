"use strict";

const readline = require("node:readline");
const { bridgeRequest } = require("../hooks/hook-lib.cjs");
const { HOST_COMMANDS } = require("../../../src/authority/host-surface.cjs");
const {
  CredentialLeak,
  SeatCustody,
} = require("../../../src/host/seat-custody.cjs");

// F6：席位凭据托管在这个进程里，不进模型上下文。
//
// 这个 MCP 服务器就是章程说的「本机协调器」：它是唯一同时接触模型和核心的地方。凭据在
// room.create / room.join 的返回里产生，被这里截下换成句柄；之后模型只发句柄，凭据由
// 这里注入。模型从头到尾没见过那串秘密，所以也没有「记得别说出来」这回事。
//
// 进程级单例而不是每次调用新建：句柄的作用域就是这个进程的生命周期。每次新建等于每条
// 命令都换一套句柄，模型上一条拿到的句柄下一条就失效了。
const custody = new SeatCustody();

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
      "向 TokenGame 权威核心发一条牌桌命令。需要席位的命令在 params 里给 seat_handle"
      + "（room.create / room.join 的返回会给你一个）。不要传 seat_id 或凭据："
      + "席位秘密由本机协调器托管，不经过这里。",
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

function errorResult(body) {
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
}

// 出门前最后一道扫描。命中就整份扣下，不打码后放过：打码只是让这一次看不见，搬运秘密的
// 那条路径还在，换个字段名下次照样漏。扣下会让功能明显坏掉，坏掉才会被修。
function safeResult(body, isError, seatHandle) {
  const payload = seatHandle === null || seatHandle === undefined
    ? body
    : { ...body, seat_handle: seatHandle };
  let text;
  try {
    text = custody.assertNoLeak(JSON.stringify(payload, null, 2), "tool_result");
  } catch (error) {
    if (!(error instanceof CredentialLeak)) throw error;
    return errorResult({
      code: "response_withheld_secret_detected",
      where: error.details.where,
      field: error.details.field,
      hint: "核心返回里含席位秘密，本机协调器已扣下。这是实现缺陷，不是用户操作问题。",
    });
  }
  return { content: [{ type: "text", text }], isError };
}

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
    // F6：句柄换凭据发生在这里，模型那一侧只有句柄。注入失败（模型自带 seat_id 或
    // 凭据、句柄不认）要当成普通工具错误回报，不能抛出去——抛出去 MCP 那层会把栈
    // 打进日志，而参数里可能正带着模型不该有的东西。
    let params;
    try {
      params = custody.inject(command, args.params || {});
    } catch (error) {
      return errorResult({ code: error.code ?? "custody_rejected", command });
    }

    try {
      const result = await coreRequest(command, params);
      // 凭据只在 create / join 的返回里产生，所以托管的入口只有这里。
      const bound = custody.bindFromResult(result.body);
      const visible = bound.seat_handle === null
        ? { body: custody.sanitizeResult(result.body) }
        : { body: bound.result, seat_handle: bound.seat_handle };
      return safeResult(visible.body, !result.ok, visible.seat_handle);
    } catch (error) {
      if (error instanceof CredentialLeak) throw error;
      // 核心的错误消息可能回显了请求参数，而参数里刚被注入过凭据。所以错误文本也要过扫描。
      return safeResult(
        { code: "core_unavailable", message: error.message, hint: "核心未启动时先运行 npm run core" },
        true,
        null,
      );
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
