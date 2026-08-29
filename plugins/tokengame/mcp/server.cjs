"use strict";

const readline = require("node:readline");
const { bridgeRequest } = require("../hooks/hook-lib.cjs");
const { HUMAN_COMMANDS, MODEL_COMMANDS } = require("../../../src/authority/host-surface.cjs");
const {
  CredentialLeak,
  SeatCustody,
} = require("../../../src/host/seat-custody.cjs");
const { ModelCommandSurface, ModelSurfaceError } = require("../../../src/host/model-command-surface.cjs");
const { requestEnvelope } = require("../../../src/contract/adapter-contract.cjs");

// F6：席位凭据托管在这个进程里，不进模型上下文。
//
// 这个 MCP 服务器就是章程说的「本机协调器」：它是唯一同时接触模型和核心的地方。凭据在
// room.create / room.join 的返回里产生，被这里截下换成句柄；之后模型只发句柄，凭据由
// 这里注入。模型从头到尾没见过那串秘密，所以也没有「记得别说出来」这回事。
//
// 进程级单例而不是每次调用新建：句柄的作用域就是这个进程的生命周期。每次新建等于每条
// 命令都换一套句柄，模型上一条拿到的句柄下一条就失效了。
const custody = new SeatCustody();

// 分权：这个进程里有两条路，只有一条是工具。
//
// MCP 的规则是「登记成工具就等于模型可调用」，所以真人命令不能作为工具存在——加一个
// tokengame_human_table 工具再叮嘱模型别用它，等于没有边界。真人那条路是下面的
// hostCommand()，它导出给宿主适配器（以及测试）直接调用，不出现在 tools 里。
//
// 单栈牌桌的真人入口本来就不在这个进程：web/table 经 src/host/table-web-host.cjs 打到
// 同一个核心，那条路没有模型参与。hostCommand() 是给「宿主自己提供结构化 UI」的那种
// 情形留的入口（阶段 2 的 HostCommand/UI Adapter），此刻它的用途是让分权可被自动验证：
// 有一条真人路径存在，才能证明真人命令是被移走了而不是被删掉了。
const modelSurface = new ModelCommandSurface({ custody, request: coreRequest });

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
    // 请求信封由合同层构造。服务端校验 contract_version，缺了就 400——
    // 这条检查存在的意义是让「跨版本客户端」这件事有可判定的错误码，而不是表现为
    // 某个字段静默地被忽略。
    body: JSON.stringify(requestEnvelope(command, params)),
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
      "以你负责的那一席的 AI 身份参赛：ai.take_intents 领取待办，ai.start 开始评估，"
      + "ai.resolve 回填公开发言或沉默；view.projection / view.timeline 读公开牌面。"
      + "只传权威给你的 intent_id / turn_id，不要传 seat_id、seat_handle 或凭据——"
      + "席位身份由本机协调器补齐。下注、按 Ready、确认公开范围、亮牌都是真人的决定，"
      + "这里发不出去。",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        // 枚举取自 host-surface.cjs 的模型面，不在这里手抄：手抄的清单就是延迟发作的分叉。
        // 用 MODEL_COMMANDS 而不是 HOST_COMMANDS 是这次分权的关键一行——枚举本身就是
        // 模型看到的能力清单，把真人命令列在这里，模型不必绕过任何东西就能调用。
        command: { type: "string", enum: [...MODEL_COMMANDS] },
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

// 真人操作面。刻意不是工具：登记成工具就等于模型可调用。
//
// 句柄在这里产生也在这里留下——凭据只在 room.create / room.join 的返回里出现，而这两条
// 是真人命令。所以托管的入口整体搬到了这条路上，模型那一侧一张句柄也拿不到。
//
// 真人路径同样按句柄说话，凭据也不进 UI 层。凭据只在这个进程内部存在，UI 拿着句柄就够了：
// 少一层持有秘密的代码就少一处泄漏面，而 UI 层恰恰是要往屏幕上渲染的那一层。
//
// 返回值不过模型可见文本的泄漏扫描——扫描会把句柄之外的东西一并扣下，而真人 UI 需要
// room.create 的完整返回（邀请码要给人看）。真人路径的对应约束是别把返回原样喂给模型，
// 那由阶段 2 的 UI Adapter 合同承担。这里只保证凭据字段已被 sanitize 摘掉。
async function hostCommand(command, params = {}) {
  if (!HUMAN_COMMANDS.includes(command)) {
    return {
      ok: false,
      status: 400,
      body: {
        code: MODEL_COMMANDS.includes(command) ? "command_is_model_facing" : "command_not_host_facing",
        command: command ?? null,
      },
    };
  }
  let injected;
  try {
    injected = custody.inject(command, params || {});
  } catch (error) {
    return { ok: false, status: 400, body: { code: error.code ?? "custody_rejected", command } };
  }
  const result = await coreRequest(command, injected);
  // 凭据只在 room.create / room.join 的返回里产生，托管的入口因此整体落在这条真人路径上。
  const bound = custody.bindFromResult(result.body);
  return {
    ok: result.ok,
    status: result.status,
    body: bound.seat_handle === null ? custody.sanitizeResult(result.body) : bound.result,
    seat_handle: bound.seat_handle,
  };
}

async function callTool(name, args = {}) {
  if (name === "tokengame_table") {
    const command = args.command;
    try {
      // 分权 + 托管都在模型命令面里。真人命令、模型自带席位身份、伪造的权威 id 都在
      // 这一层抛出，一次请求也不发——挡在核心里也能拒，但那说明请求已经出去了。
      const result = await modelSurface.call(command, args.params || {});
      // 出门前仍然净化并扫描：模型面不该收到秘密，但「不该」要有一道实测的门兜住。
      return safeResult(custody.sanitizeResult(result.body), !result.ok, null);
    } catch (error) {
      if (error instanceof CredentialLeak) throw error;
      if (error instanceof ModelSurfaceError) {
        // 拒绝理由要说得出来。model_commands 一起回去，模型才知道自己能用什么，
        // 而不是逐条试探。details 里没有秘密，也没有句柄清单。
        return errorResult({
          code: error.code,
          command: command ?? null,
          ...(error.details === undefined ? {} : { details: error.details }),
          ...(error.code === "command_not_model_facing"
            ? {
              model_commands: [...MODEL_COMMANDS],
              hint: "下注、按 Ready、确认公开范围、亮牌是真人的决定，不经模型工具。",
            }
            : {}),
        });
      }
      // 注入失败（句柄不认等）当普通工具错误回报，不抛出去：抛出去 MCP 那层会把栈打进
      // 日志，而参数里可能正带着模型不该有的东西。
      if (typeof error?.code === "string") {
        return errorResult({ code: error.code, command: command ?? null });
      }
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

// hostCommand 导出但不登记为工具：它是真人路径，模型经 tools/list 看不到它。
// custody 一并导出给测试——它是分权的另一半（模型手里有没有句柄），测试要能直接问。
module.exports = { callTool, custody, handleMessage, hostCommand, tools };
