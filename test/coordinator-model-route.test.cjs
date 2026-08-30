"use strict";

// 远端模型客户端经协调器落到同一份托管上。
//
// B6-1 把进程内驱动收敛到了模型命令面，但那只解决了「协调器自己」那一半。真实宿主
// （Codex CLI / Claude Desktop）里说话的是 MCP 进程里的模型，而那个进程原本自持一份
// SeatCustody——往里 bind 的唯一入口 hostCommand() 有零个产品调用者，于是它的
// custody.handles() 恒为空。模型收到空意图，一个席位也驱动不了，而这件事在日志里
// 看起来一切正常。
//
// 这个文件钉住收敛后的那条路：MCP 进程不持有任何秘密，模型命令经 HTTP 打到协调器，
// 落在浏览器建的那些席位上。
//
// 令牌这道门为什么必须有：协调器的真人路由不带鉴权（只听回环，会话令牌本身就是能力），
// 而模型路由是**进程级**的——持有它就能替这个协调器上所有席位发言。没有门的话，本机
// 任何一个进程都能挂上来替别人的 AI 说话。
//
// 已知限制，写在这里而不是只写在文档里：一个协调器 = 一台机器 = 一个人的席位。两个朋友
// 共用一个协调器时，甲的宿主持有令牌就能替乙席发言。朋友内测的形态是每人各跑一个协调器，
// 所以本轮不做逐席配对；要做的话是给每席发一张只覆盖该席的令牌，而那需要一条把令牌
// 交到「那一席的宿主」手上的路，属于入口那一步（B7）。

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { CONTRACT_VERSION, requestEnvelope } = require("../src/contract/adapter-contract.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const ROOT = path.join(__dirname, "..");
const RULES = "table-rules-v1";
const TOKEN = "test-model-token-0123456789abcdef";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

function fixedClock(start = 1_000_000) {
  const state = { at: start };
  return { now: () => state.at, advance: (ms) => { state.at += ms; } };
}

async function withHost(t, options = {}) {
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: deck, now: clock.now });
  const core = new InProcessCoreClient({ surface });
  const host = new TableWebHost({ core, now: clock.now, ...options });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const post = async (route, body, headers = {}) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const client = {
    post,
    act: (token, command, params = {}) => post("/api/action", { session_token: token, command, params }),
    // 按 requestEnvelope 构造，与 MCP 进程那条真实客户端同形。手写一份 {command, params}
    // 的话，测试就是一个比产品更旧的客户端——而版本闸门正是为这种客户端存在的，于是
    // 每条断言都会先撞在闸门上，测不到它本来要测的东西。
    model: (command, params = {}, token = TOKEN) => post(
      "/api/model/command",
      requestEnvelope(command, params),
      token === null ? {} : { [MODEL_COMMAND_TOKEN_HEADER]: token },
    ),
    // 原样发一份 body，供版本闸门的负向断言用。
    modelRaw: (body, token = TOKEN) => post(
      "/api/model/command",
      body,
      token === null ? {} : { [MODEL_COMMAND_TOKEN_HEADER]: token },
    ),
    health: async () => (await fetch(`${origin}/api/health`)).json(),
  };
  return { host, core, surface, clock, origin, client };
}

async function seatTwo(client) {
  const created = (await client.post("/api/room/create", { player_id: "p1", table_rules_version: RULES })).body;
  const joined = (await client.post("/api/room/join", {
    player_id: "p2",
    invite_code: created.invite_code,
  })).body;
  for (const token of [created.session_token, joined.session_token]) {
    await client.act(token, "room.confirm_public_scope", { acknowledged: true });
  }
  return { created, joined, a: created.session_token, b: joined.session_token };
}

test("带对令牌的模型命令落在浏览器建的那些席位上", async (t) => {
  const { client } = await withHost(t, { modelCommandToken: TOKEN });
  await seatTwo(client);

  const result = await client.model("ai.take_intents");
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true, JSON.stringify(result.body));
  assert.equal(result.body.result.seats_polled, 2,
    "远端模型客户端必须看到协调器托管的全部席位——0 说明它看的是另一份托管");
});

test("没带令牌、带错令牌都拒，且不透露命令是否存在", async (t) => {
  const { client } = await withHost(t, { modelCommandToken: TOKEN });
  await seatTwo(client);

  for (const [label, token] of [["没带", null], ["带错", "wrong-token-same-length-padding0"]]) {
    const rejected = await client.model("ai.take_intents", {}, token);
    assert.equal(rejected.status, 403, `${label}令牌应当 403`);
    assert.equal(rejected.body.code, "model_command_token_rejected");
    // 拒绝理由里不得出现命令名或席位数：那会让这条路变成枚举口——不带令牌就能问出
    // 「这个协调器上有几席」「这条命令存不存在」。
    const text = JSON.stringify(rejected.body);
    assert.ok(!text.includes("ai.take_intents"), "拒绝信息不得回显命令名");
    assert.ok(!/seats_polled|seat-/.test(text), "拒绝信息不得透露席位");
  }

  // 等长但不同的令牌必须走完逐字符比较，不能靠长度短路——否则长度本身成了旁路。
  const sameLength = "x".repeat(TOKEN.length);
  const rejected = await client.model("ai.take_intents", {}, sameLength);
  assert.equal(rejected.status, 403);
});

test("没配令牌时模型路由整条关闭，而且关得看得见", async (t) => {
  // 失败关闭。默认开一个开发用令牌是本轮明确禁止的事：那种默认值会跟着文档一起
  // 被复制到能被别人打到的地方，而它在回环上从来不报错，所以没人会发现。
  const { client } = await withHost(t);
  await seatTwo(client);

  const off = await client.model("ai.take_intents", {}, null);
  assert.equal(off.status, 503);
  assert.equal(off.body.code, "model_command_route_disabled");

  // 带上任何令牌也一样：路由是关的，不是「令牌不对」。两者混同会让运维以为自己
  // 令牌配错了，于是去改令牌而不是去配上它。
  const withToken = await client.model("ai.take_intents", {}, TOKEN);
  assert.equal(withToken.status, 503);
  assert.equal(withToken.body.code, "model_command_route_disabled");

  // 关闭状态必须能从健康检查上看出来。看不见的失败关闭等于静默卡住：宿主那边只看到
  // 「模型什么都不做」，而原因是一个没设的环境变量。
  const health = await client.health();
  assert.equal(health.model_command_route, "disabled",
    "健康检查必须如实说模型路由是关的");

  // 反面：配了令牌时它得说 enabled，否则上面那条断言对任何实现都成立。
  const { client: on } = await withHost(t, { modelCommandToken: TOKEN });
  assert.equal((await on.health()).model_command_route, "enabled");
});

test("跨版本的模型客户端被挡在门外，缺版本与错版本各有自己的码", async (t) => {
  // 为什么这条边界需要闸门：插件登记在宿主自己的配置里，协调器从仓库跑起来，两者完全
  // 可能停在不同的提交上。没有闸门的话，跨版本表现为某个字段静默地被忽略——而那种失败
  // 会被读成「这个功能坏了」，排查方向完全错。
  const { client } = await withHost(t, { modelCommandToken: TOKEN });
  await seatTwo(client);

  const missing = await client.modelRaw({ command: "view.projection", params: {} });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, "contract_version_missing",
    "缺版本必须拒，不能当成「旧客户端」放行——放行等于这条检查永远不会红");
  assert.equal(missing.body.details.expected, CONTRACT_VERSION,
    "要说出本机期望哪一版，否则跨版本调试只能靠猜");

  const wrong = await client.modelRaw({
    contract_version: CONTRACT_VERSION + 1,
    command: "view.projection",
    params: {},
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.code, "contract_version_mismatch");
  assert.equal(wrong.body.details.received, CONTRACT_VERSION + 1,
    "两边的版本都要说出来");

  // 闸门在令牌之后：未鉴权的调用者不该问出本机跑的是哪一版。
  const unauthenticated = await client.modelRaw({ command: "view.projection", params: {} }, null);
  assert.equal(unauthenticated.body.code, "model_command_token_rejected",
    "没带令牌时应当先撞令牌门，而不是先被告知版本要求");
  assert.ok(!JSON.stringify(unauthenticated.body).includes(String(CONTRACT_VERSION)),
    "未鉴权的拒绝里不得透露合同版本");
});

test("模型路由上发不出真人命令，也不许自带席位身份", async (t) => {
  const { client } = await withHost(t, { modelCommandToken: TOKEN });
  const { created } = await seatTwo(client);

  for (const command of ["hand.act", "seat.ready", "room.confirm_public_scope", "hand.reveal", "view.hand"]) {
    const rejected = await client.model(command, {});
    assert.equal(rejected.body.ok, false, `${command} 必须被拒`);
    assert.equal(rejected.body.code, "command_not_model_facing",
      `${command} 的拒绝理由必须点名「不在模型面上」`);
  }

  for (const field of ["seat_id", "seat_handle", "recovery_credential", "viewer_seat_id"]) {
    const forged = await client.model("view.timeline", { [field]: created.seat_id });
    assert.equal(forged.body.ok, false, `${field} 必须被拒`);
    assert.equal(forged.body.code, "seat_identity_not_model_supplied");
  }
});

test("模型路由的返回里没有凭据也没有句柄原文", async (t) => {
  const { client } = await withHost(t, { modelCommandToken: TOKEN });
  await seatTwo(client);

  for (const command of ["view.projection", "view.timeline", "ai.take_intents"]) {
    const result = await client.model(command);
    // 先钉住「这一跳真的成功了」。少了这一条，一个 404 或 503 也能通过下面的扫描——
    // 空响应里当然没有凭据，而那种通过什么都没证明。
    assert.equal(result.status, 200, `${command} 应当成功：${JSON.stringify(result.body)}`);
    assert.equal(result.body.ok, true, JSON.stringify(result.body));
    const text = JSON.stringify(result.body);
    assert.ok(!text.includes("recovery_credential"), `${command} 的返回不得出现凭据字段名`);
    assert.ok(!/seat_handle-/.test(text), `${command} 的返回不得出现句柄原文`);
  }
});

test("MCP 服务端不再自持托管，也不再自己构造模型命令面", () => {
  // 静态断言，因为这件事的失效方式是「有人为了方便又 new 了一个」，而那种改动在运行时
  // 看起来一切正常：模型照样能调工具，只是永远收到空意图。
  const server = fs.readFileSync(
    path.join(ROOT, "plugins/tokengame/mcp/server.cjs"), "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  assert.doesNotMatch(server, /new\s+SeatCustody\s*\(/,
    "MCP 进程自持托管等于模型永远扇出到零席");
  assert.doesNotMatch(server, /new\s+ModelCommandSurface\s*\(/,
    "模型命令面必须在协调器里，与真人命令共用同一份托管");
  // 正面：它得真的打到协调器上，而不是「谁都不构造」。
  assert.match(server, /TOKENGAME_TABLE_ORIGIN/,
    "MCP 进程必须知道协调器在哪");
});

test("等时比较只有一份实现", () => {
  // 抄一份常量时间比较的风险方向很具体：某一份被改成早返回，而那份的调用点从此
  // 泄漏令牌长度与前缀。两处各写一遍时，改对了一处不会让另一处变红。
  const files = ["src/authority/command-server.cjs", "src/host/table-web-host.cjs"];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /require\("(\.\.\/shared|\.\.\/shared)\/tokens\.cjs"\)/,
      `${file} 应当引用共享的等时比较，而不是自己写一遍`);
  }
  // 全仓扫一遍「谁定义了 sameToken」。只断言两个调用点 require 了共享实现是不够的：
  // 引了共享的那一份、同时又在本文件里定义一个同名函数，后者会遮住前者，而上面那两条
  // 断言照旧通过。
  const definitions = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    if (/(?:function\s+sameToken\s*\(|sameToken\s*=\s*(?:function|\())/.test(source)) {
      definitions.push(path.relative(ROOT, file).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(definitions, ["src/shared/tokens.cjs"],
    `等时比较有多份实现：${definitions.join("、")}。两份的漂移方向是某一处被改成早返回而另一处不会红。`);

  const shared = stripComments(fs.readFileSync(path.join(ROOT, "src/shared/tokens.cjs"), "utf8"));
  // 逐字符比较必须无条件走完。`return false` 出现在循环里就是早返回。
  const loop = shared.slice(shared.indexOf("for ("));
  assert.ok(loop.length > 20, "没截到比较循环，这条断言什么都没验证");
  assert.doesNotMatch(loop.slice(0, loop.indexOf("}")), /return/,
    "比较循环里不得有 return——那让比较时间随匹配前缀长度变化");
  // 循环之前不得整串比较。留着循环、在上面加一句 `if (provided !== expected) return false`
  // 会让循环变成死代码：功能不变，上面那条「循环里没有 return」照旧通过，而比较又回到了
  // 按前缀短路。只允许比 .length。
  const body = shared.slice(shared.indexOf("function sameToken"), shared.indexOf("for ("));
  assert.doesNotMatch(body, /provided\s*!==\s*expected|expected\s*!==\s*provided|provided\s*===\s*expected/,
    "整串比较让下面的逐字符循环变成死代码——比较时间又随前缀变化了");
});

test("空串不算配了令牌", async (t) => {
  // `TOKENGAME_MODEL_TOKEN=` 在 shell 里是一个合法赋值，读出来是空串。把空串当成「配了」
  // 的后果不是「门更松」，是门对所有人开着：请求方不带这个头时 Node 那边读到的也是空，
  // 于是 sameToken("", "") 成立。
  const { client } = await withHost(t, { modelCommandToken: "" });
  assert.equal((await client.health()).model_command_route, "disabled",
    "空串必须与没配同等对待");
  // 三种问法都得撞在同一道门上：不带头、带空头、带任意值。
  for (const [label, headers] of [
    ["不带头", {}],
    ["带空头", { [MODEL_COMMAND_TOKEN_HEADER]: "" }],
    ["带任意值", { [MODEL_COMMAND_TOKEN_HEADER]: "anything" }],
  ]) {
    const denied = await client.post("/api/model/command", requestEnvelope("ai.take_intents", {}), headers);
    assert.equal(denied.status, 503, `${label}时应当 503，实得 ${denied.status}`);
    assert.equal(denied.body.code, "model_command_route_disabled", label);
  }
});

test("出门那两道门各有各的活，缺一道都会实际漏或实际坏", async (t) => {
  // 这一条用故障注入，测的是两道门各自存在的理由。
  //
  // 正常流量里协调器的模型命令结果不含秘密字段，所以两道门平时都无事可做——而「平时
  // 无事可做」正是它们容易被当成冗余删掉的原因。注入的那份结果模拟的是「将来某一版核心
  // 在结果里多带了一个字段」，也就是它们唯一会起作用的场合。
  const { host, client } = await withHost(t, { modelCommandToken: TOKEN });
  await seatTwo(client);

  const original = host.coreRequest.bind(host);
  // 净化 + 扫描都在：该摘的字段被摘掉，这一跳照常成功。
  host.coreRequest = async () => ({
    ok: true,
    status: 200,
    body: { ok: true, result: { note: "ok", recovery_credential: "seat-secret-abc" } },
  });
  const cleaned = await client.model("view.projection");
  assert.equal(cleaned.status, 200, `净化在时这一跳应当成功：${JSON.stringify(cleaned.body)}`);
  assert.equal(cleaned.body.ok, true, JSON.stringify(cleaned.body));
  assert.equal(JSON.stringify(cleaned.body).includes("recovery_credential"), false,
    "净化必须把秘密字段摘掉，而不是靠下游扫描整份扣下");
  assert.equal(cleaned.body.result.note, "ok",
    "净化只摘秘密字段，其余内容照常返回——整份扣下会让模型面完全不可用");

  // 只剩扫描：模拟净化漏掉了一个它不认识的字段。扫描必须把整份扣下，而不是放行。
  const sanitize = host.custody.sanitizeResult.bind(host.custody);
  host.custody.sanitizeResult = (value) => value;
  const withheld = await client.model("view.projection");
  assert.equal(withheld.status, 500,
    `净化失手时扫描必须失败关闭，实得 ${withheld.status}：${JSON.stringify(withheld.body)}`);
  assert.equal(withheld.body.code, "credential_leak");
  assert.equal(JSON.stringify(withheld.body).includes("seat-secret-abc"), false,
    "扣下的响应本身不得把秘密带出去");

  host.custody.sanitizeResult = sanitize;
  host.coreRequest = original;
});

// 注释与字符串都会干扰静态断言：一句提到 `function sameToken` 的注释会被当成一处实现。
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".cjs")) yield full;
  }
}
