"use strict";

const readline = require("node:readline");
const { bridgeRequest } = require("../hooks/hook-lib.cjs");
const { HUMAN_COMMANDS, MODEL_COMMANDS } = require("../../../src/authority/host-surface.cjs");
const { requestEnvelope } = require("../../../src/contract/adapter-contract.cjs");
const {
  connectionOrigin,
  readModelConnectionFile,
} = require("../../../src/shared/model-connection-file.cjs");

// 这个进程不持有核心席位凭据，只从本人的私有连接文件读取受限模型传输令牌。
//
// 此前它自己 new SeatCustody()，注释里写着「这个 MCP 服务器就是章程说的本机协调器」。
// 那句话在当时是意图，不是事实——往那份托管里 bind 句柄的唯一入口是下面的 hostCommand()，
// 而它有**零个产品调用者**。于是 custody.handles() 恒为空，ai.take_intents 扇出到零席，
// 模型收到空意图，一个席位也驱动不了。浏览器里之所以能看到座位旁的气泡，是因为
// TableWebHost 另有一份托管加一条自己的 AI 循环，喂它的是进程内脚本运行时。
//
// 两条路径不相交：一条跑着但只接得上模拟运行时，一条接得上真实模型但永远看不见席位。
//
// 收敛后协调器只有一个，就是 Web 牌桌那个进程：凭据只能住在一个地方，而两个面都必须
// 够得着它——浏览器是筹码操作面，它够不着别的进程；本进程本来就是 HTTP 客户端。所以
// 这里降级为一条 stdio 到 HTTP 的转运，托管、注入、扇出、泄漏扫描全在协调器里。
//
// 少了什么保护吗：没有。净化与泄漏扫描原本在本进程的出门处，现在在协调器的出门处，
// 而那一处同时服务进程内驱动与本进程——两种传输共用同一道门，比两份各扫一遍更难漂。

// 分权：这个进程里有两条路，只有一条是工具。
//
// MCP 的规则是「登记成工具就等于模型可调用」，所以真人命令不能作为工具存在——加一个
// tokengame_human_table 工具再叮嘱模型别用它，等于没有边界。真人那条路是下面的
// hostCommand()，它导出给宿主（以及测试）直接调用，不出现在 tools 里。

// 协调器在哪。模型命令与真人命令都打它。
//
// 与 TOKENGAME_COMMAND_ORIGIN（权威核心）刻意分开：本进程收敛后不再直接打核心，
// 因为直接打核心就必须自己持有席位凭据——那正是上面删掉的东西。留着两个变量名而不是
// 复用一个，是为了让配错的人看得出自己配的是哪一层：指向核心时模型命令会因为缺
// seat_id 被核心拒，那个报错读不出「你把协调器地址填成了核心地址」。
// 协调器地址的默认值取自共享常量，不在这里抄一个数字。抄一份的坏法很具体：改了一侧的
// 端口，表现是「模型说连不上牌桌，而牌桌明明开着」——读起来像网络问题，实际是两个数字。
const { DEFAULT_TABLE_ORIGIN } = require("../../../src/shared/endpoints.cjs");
const MODEL_TOKEN_HEADER = "x-tokengame-model-token";
const knownModelTokens = new Set();

function modelConnection() {
  const file = process.env.TOKENGAME_MODEL_CONNECTION_FILE;
  if (typeof file === "string" && file !== "") {
    return readModelConnectionFile(file, { explicitOrigin: process.env.TOKENGAME_TABLE_ORIGIN });
  }
  const token = process.env.TOKENGAME_MODEL_TOKEN;
  if (typeof token !== "string" || token === "") return null;
  return { origin: connectionOrigin(process.env.TOKENGAME_TABLE_ORIGIN || DEFAULT_TABLE_ORIGIN), token };
}

// 本进程不再直接打核心。
//
// 此前这里有一个 coreRequest()：它带权威令牌、经 requestEnvelope 构造信封、打
// /command。收敛后它有零个调用者——真人命令与模型命令都打协调器，而协调器自己持有
// HttpCoreClient 去打核心。留着一个没有调用者的传输不是「以后可能用得上」：它带着
// 权威令牌，而权威令牌能发任何命令，包括模型面绝不该有的那些。

// 打协调器的那一跳。模型命令走这条。
//
// 令牌从环境变量来，没配就不发请求：本进程无法自己生成一个（协调器那边校验的是它自己
// 那份），而带着空令牌发出去只会换回一个 403，读起来像「令牌不对」而真正的原因是没配。
async function tableRequest(route, body, { modelToken = false } = {}) {
  let origin = process.env.TOKENGAME_TABLE_ORIGIN || DEFAULT_TABLE_ORIGIN;
  const headers = { "content-type": "application/json" };
  if (modelToken) {
    const connection = modelConnection();
    if (connection === null) {
      return {
        ok: false,
        status: 503,
        body: {
          code: "model_command_token_not_configured",
          hint: "请真人先完成一次 npm run codex:configure 并重启宿主；运行 npm run beta 入座下载"
            + "「本席 AI 连接文件」后，用 npm run connection:activate 激活。"
            + "手工 MCP 也可显式配置 TOKENGAME_MODEL_CONNECTION_FILE 或该席令牌；不再使用旧全桌令牌。",
        },
      };
    }
    origin = connection.origin;
    headers[MODEL_TOKEN_HEADER] = connection.token;
    knownModelTokens.add(connection.token);
  }
  const response = await fetch(`${origin}${route}`, {
    method: "POST",
    headers,
    redirect: "error",
    // 模型命令经 requestEnvelope 构造信封，真人入口不。
    //
    // 差别的理由是「两端会不会各自升级」。本进程与协调器是两个可独立安装的东西：插件登记
    // 在宿主自己的配置里，协调器从仓库跑起来，两者完全可能停在不同的提交上。所以模型命令
    // 这条要带版本，让跨版本表现为一个可判定的错误码，而不是某个字段静默地被忽略。
    //
    // 真人入口（/api/room/*、/api/action）不带：那些路由的主要客户端是浏览器，而浏览器的
    // JS 由协调器自己发，两者不可能不同版本。给它们加一个必填版本字段就必须同时改前端，
    // 而那道闸门在那一侧永远不会红——一条永远为真的检查。本进程是它们的次要客户端，
    // 版本漂移时它会从字段校验那里拿到明确的拒绝。
    body: JSON.stringify(modelToken ? requestEnvelope(body.command, body.params) : body),
    signal: AbortSignal.timeout(Number(process.env.TOKENGAME_CORE_TIMEOUT_MS || 5_000)),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, code: "invalid_core_response" };
  }
  // HTTP 200 / JSON 可解析都不等于协调器信封有效；错端口不能伪装成接入成功。
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)
    || typeof payload.ok !== "boolean"
    || (modelToken && payload.ok && (payload.result === null || typeof payload.result !== "object" || Array.isArray(payload.result)))) {
    payload = { ok: false, code: "invalid_core_response" };
  }
  return { ok: response.ok && payload.ok !== false, status: response.status, body: payload };
}

const tools = [
  {
    name: "tokengame_table",
    description:
      "以你负责的那一席的 AI 身份参赛：ai.take_intents 领取待办，ai.start 开始评估，"
      + "使用 ai.start 返回的 model_context 分析本席牌面与公开聊天，ai.resolve 回填公开发言或沉默；"
      + "view.projection / view.timeline 只读公共信息。"
      + "只传权威给你的 intent_id / turn_id，不要传 seat_id、seat_handle 或凭据——"
      + "席位身份由本机协调器补齐。下注、按 Ready、补测试筹码、确认公开范围、亮牌都是真人的决定，"
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

// 模型可见文本里绝不该出现的字段名。清单引托管层的权威定义，不在这里写第二份——
// 两份清单的漂移方向是某一侧漏一条，而漏掉的那一条表现为一个字段静默地被放过。
const { SECRET_FIELDS } = require("../../../src/host/seat-custody.cjs");

// 只扫**键位**，不扫子串。
//
// 这一条是照托管层 assertNoLeak 的判断抄的，而抄它的理由值得写下来：先写成子串扫描，
// 于是公开投影里那个合法的 credential_revoked 布尔（这一席的凭据被吊销了没有）被判成
// 泄漏，模型每次读牌面都收到一份「本进程已扣下」。安全边界报不出自己拒了什么时，
// 读日志的人会得到完全相反的结论。
//
// 句柄按值的前缀扫，因为它没有固定键名——协调器要是把句柄塞进任何字段，前缀都在。
const SECRET_KEY_PATTERNS = Object.freeze(
  SECRET_FIELDS.map((field) => new RegExp(`"${field}"\\s*:`)),
);
const HANDLE_VALUE_PATTERN = /seat[-_]handle-/;

// 出门前最后一道扫描。命中就整份扣下，不打码后放过：打码只是让这一次看不见，搬运秘密的
// 那条路径还在，换个字段名下次照样漏。扣下会让功能明显坏掉，坏掉才会被修。
//
// 与协调器那道门方向不同，两道都要。协调器按**秘密原文**扫（它认得那串凭据），本进程
// 按**字段名与句柄前缀**扫（它不持有秘密，所以扫不了原文）。本进程这一道在连接的另一端
// 出问题时才起作用——协调器自己扫自己，两者同处一个进程，那份缺陷两道都躲不过。
function safeResult(body, isError) {
  const text = JSON.stringify(body, null, 2);
  if ([...knownModelTokens].some((token) => text.includes(token)) || /"model_token"\s*:/.test(text)) {
    return errorResult({
      code: "response_withheld_secret_detected",
      where: "tool_result",
      field: "model_token",
      hint: "返回含模型连接权限，已扣下。请勿把连接文件内容粘贴到会话或公开牌桌。",
    });
  }
  const hitKey = SECRET_KEY_PATTERNS.findIndex((pattern) => pattern.test(text));
  if (hitKey !== -1) {
    return errorResult({
      code: "response_withheld_secret_detected",
      where: "tool_result",
      field: SECRET_FIELDS[hitKey],
      hint: "协调器返回里含席位秘密的字段名，本进程已扣下。这是实现缺陷，不是用户操作问题。",
    });
  }
  if (HANDLE_VALUE_PATTERN.test(text)) {
    return errorResult({
      code: "response_withheld_secret_detected",
      where: "tool_result",
      field: "seat_handle",
      hint: "协调器返回里含席位句柄，本进程已扣下。句柄一样代表该席的行动能力。",
    });
  }
  return { content: [{ type: "text", text }], isError };
}

// 真人操作面。刻意不是工具：登记成工具就等于模型可调用。
//
// 收敛后它是**协调器真人路由的客户端**，不再自己注入凭据。此前它调 custody.inject 并
// 从返回里 bindFromResult——那份托管就是上面删掉的那一份，而它有零个产品调用者，所以
// 那条注入路径从未在产品里执行过一次。
//
// 会话令牌由调用方持有并逐次传进来，本进程不存。存一份等于「谁 require 了这个模块就能
// 替那一席行动」，而本模块同时导出模型可见的 callTool——两者在同一个进程里，少一处
// 可被取到的席位能力就少一处越权面。
//
// 分工：room.create / room.join 打协调器的入口路由（它们不需要先有席位），其余真人命令
// 打 /api/action（需要会话令牌）。协调器那边按 BROWSER_ACTIONS 再把关一次。
async function hostCommand(command, params = {}, { sessionToken = null } = {}) {
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
  if (command === "room.create" || command === "room.join") {
    const route = command === "room.create" ? "/api/room/create" : "/api/room/join";
    const result = await tableRequest(route, params || {});
    return { ok: result.ok, status: result.status, body: result.body };
  }
  if (sessionToken === null) {
    // 不猜。没带会话令牌就是不知道替谁行动，而「反正只有一个会话就用那个」在多席宿主上
    // 的表现是替错的人行动——与托管层拒绝猜席位同一条理由。
    return {
      ok: false,
      status: 400,
      body: { code: "web_session_required", command },
    };
  }
  const result = await tableRequest("/api/action", {
    session_token: sessionToken,
    command,
    params: params || {},
  });
  return { ok: result.ok, status: result.status, body: result.body };
}

async function callTool(name, args = {}) {
  if (name === "tokengame_table") {
    const command = args.command;
    // 本地先拒不在模型面上的命令。挡在协调器里也能拒，而且协调器那一侧才是权威判断——
    // 这里这一道的作用是让「协调器没起来」和「你发错了命令」有不同的报错：不先拒的话，
    // 协调器不可达时一条真人命令会得到 table_unavailable，而那读不出真正的原因
    // （运维会去查协调器，而实际上是调用方发了一条不该模型发的命令）。
    //
    // 只重复 MODEL_COMMANDS 这一份清单，因为它本来就在本文件里（工具 schema 的 enum 用
    // 的是同一个常量）。「模型不得自带哪些身份字段」那份清单不在这里，也不抄过来——
    // 抄的话漏一条表现为某个越权参数被静默放过。
    if (!MODEL_COMMANDS.includes(command)) {
      return errorResult({
        code: "command_not_model_facing",
        command: command ?? null,
        model_commands: [...MODEL_COMMANDS],
        hint: "下注、按 Ready、补测试筹码、确认公开范围、亮牌是真人的决定，不经模型工具。",
      });
    }
    try {
      // 分权、托管、注入、逐席扇出全在协调器里。本进程只转运。
      const result = await tableRequest(
        "/api/model/command",
        { command, params: args.params || {} },
        { modelToken: true },
      );
      return safeResult(result.body, !result.ok);
    } catch (error) {
      if (error.modelConnectionError) {
        const hints = {
          model_connection_invalid: "本席 AI 连接文件格式无效或地址不属于本地回环服务。请由真人重新下载，勿粘贴文件内容。",
          model_connection_unavailable: "无法读取本席 AI 连接文件。请真人重新下载并运行 npm run connection:activate；手工 MCP 再检查 TOKENGAME_MODEL_CONNECTION_FILE。",
          model_connection_origin_conflict: "连接文件与 TOKENGAME_TABLE_ORIGIN 指向不同牌桌。请真人核对配置，模型不会替你选择另一桌。",
        };
        return safeResult({ code: error.code, hint: hints[error.code] }, true);
      }
      // 协调器不可达。回一条说得出下一步的错误，而不是把 fetch 的栈丢给模型。
      return safeResult(
        {
          code: "table_unavailable",
          hint: "协调器不可达或拒绝请求。请真人确认 npm run beta 正在运行，并核对本席连接文件；模型不会切换其他服务。",
        },
        true,
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

function runStdio(options = {}) {
  const input = options?.input ?? process.stdin;
  const output = options?.output ?? process.stdout;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    try {
      const response = await handleMessage(JSON.parse(line));
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      output.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: error.code || -32603, message: error.message || "Internal error" },
      })}\n`);
    }
  });
  return lines;
}

if (require.main === module) runStdio();

// hostCommand 导出但不登记为工具：它是真人路径，模型经 tools/list 看不到它。
// custody 不再导出：本进程不持有它。分权的另一半（模型手里有没有句柄）现在由协调器那一侧
// 回答——test/coordinator-model-route.test.cjs 按「模型路由的返回里没有凭据也没有句柄原文」
// 钉住它，而那条断言测的是真正出门的那份字节，比问一个进程内对象更接近事实。
module.exports = { callTool, handleMessage, hostCommand, runStdio, tools };
