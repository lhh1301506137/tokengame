"use strict";

// MCP 牌桌面：宿主真正看得见的那一层。
//
// 这层的意义在于它是不是同一张牌桌。L2-SESSION-LAUNCH 章程把失败形态写得很直白：
// 「为每个宿主做一个看似能启动游戏的入口，但它们使用不同房间命名空间或独立玩家身份」。
// 所以这里不测 MCP 协议细节，测的是：命令有没有真的落到外部核心、隐藏信息过了这一层
// 还成不成立、以及 MCP 进程自己有没有偷偷持有一张牌桌。

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { createCommandServer, DEFAULT_AUTHORITY_TOKEN } = require("../src/authority/command-server.cjs");
const { HOST_COMMANDS, HUMAN_COMMANDS, MODEL_COMMANDS } = require("../src/authority/host-surface.cjs");
const { HttpCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const mcp = require("../plugins/tokengame/mcp/server.cjs");

const RULES = "table-rules-v1";
const MCP_SOURCE = path.join(__dirname, "..", "plugins", "tokengame", "mcp", "server.cjs");
const MODEL_TOKEN = "mcp-surface-test-model-token-0001";

// 真核心 + 真协调器 + 真端口 + 真时钟。
//
// 为什么现在要三个进程角色而不是两个：B6 收敛后 MCP 进程不再持有托管，模型命令经协调器
// 落到那份唯一的 SeatCustody 上。只起核心的话本文件测的是一条产品里不存在的路——而它
// 原本正是这么测的，于是「模型能不能真的驱动一个席位」这件事在这里看起来一直是对的。
//
// 不注入 now()：本文件要证明的恰是「宿主不推进规则，核心自己走表也会开局」，到期驱动
// 必须开着。
async function coreAt(t, { token = DEFAULT_AUTHORITY_TOKEN } = {}) {
  const service = createCommandServer({ internalToken: token });
  const origin = await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());

  // 协调器接同一个核心。真人命令与模型命令都落到它这一份托管上。
  const core = new HttpCoreClient({ origin, token });
  const host = new TableWebHost({ core, modelBindingEnabled: true });
  const tableOrigin = await host.start({ port: 0 });
  t.after(() => host.stop());

  const saved = {
    command: process.env.TOKENGAME_COMMAND_ORIGIN,
    authority: process.env.TOKENGAME_AUTHORITY_TOKEN,
    table: process.env.TOKENGAME_TABLE_ORIGIN,
    model: process.env.TOKENGAME_MODEL_TOKEN,
    file: process.env.TOKENGAME_MODEL_CONNECTION_FILE,
  };
  process.env.TOKENGAME_COMMAND_ORIGIN = origin;
  process.env.TOKENGAME_AUTHORITY_TOKEN = token;
  process.env.TOKENGAME_TABLE_ORIGIN = tableOrigin;
  process.env.TOKENGAME_MODEL_TOKEN = MODEL_TOKEN;
  delete process.env.TOKENGAME_MODEL_CONNECTION_FILE;
  t.after(() => {
    for (const [key, value] of [
      ["TOKENGAME_COMMAND_ORIGIN", saved.command],
      ["TOKENGAME_AUTHORITY_TOKEN", saved.authority],
      ["TOKENGAME_TABLE_ORIGIN", saved.table],
      ["TOKENGAME_MODEL_TOKEN", saved.model],
      ["TOKENGAME_MODEL_CONNECTION_FILE", saved.file],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return { origin, service, host, tableOrigin };
}

// 直接打协调器的真人路由。
//
// 为什么不都走 mcp.hostCommand：它只覆盖 create / join 与 /api/action，而本文件要用到
// /api/view（读底牌）与 /api/session/resume（掉线恢复）。给 hostCommand 加这两条路由只为
// 让测试跑通，那是为可测性扩产品面——真人面的完整实现是浏览器那一侧，它已经被
// test/table-web-host.test.cjs 一整套盯着。
async function tableRoute(tableOrigin, route, body) {
  const response = await fetch(`${tableOrigin}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

// 真人显式授权这一席；MCP 的兼容环境变量路径也只能携带逐席令牌。
async function bindModel(tableOrigin, sessionToken) {
  const response = await tableRoute(tableOrigin, "/api/model/bind", {
    session_token: sessionToken, acknowledged: true, binding_request_id: "mcp-test-binding-request-0001",
  });
  assert.equal(response.body.ok, true, response.body.code);
  const token = response.body.connection.model_token;
  process.env.TOKENGAME_MODEL_TOKEN = token;
  return token;
}

// 经模型可见的 MCP 工具发一条命令。这是模型能走的唯一一条路。
async function table(command, params = {}) {
  const out = await mcp.callTool("tokengame_table", { command, params });
  const body = JSON.parse(out.content[0].text);
  return { isError: out.isError === true, body, raw: out.content[0].text };
}

// 真人操作面。刻意不经 callTool：真人命令不是工具，模型在 tools/list 里看不到它们。
// 形状对齐 table() 以便同一段流程读起来一致，但走的是完全不同的入口。
//
// 会话令牌逐次传进去，本进程不存一份。存的话「谁 require 了那个模块就能替那一席行动」，
// 而同一个模块同时导出模型可见的 callTool。
async function human(command, params = {}, sessionToken = null) {
  const out = await mcp.hostCommand(command, params, { sessionToken });
  return {
    isError: out.ok !== true,
    body: out.body,
    session_token: out.body?.session_token ?? null,
    raw: JSON.stringify(out.body),
  };
}

test("MCP：牌桌命令真的落到外部核心，不是本进程自己编的", async (t) => {
  const { service } = await coreAt(t);

  // room.create 是真人命令（分权后模型发不出它），所以走真人入口。
  // 本条测试要证的是「这一跳打到了核心」，与哪一面发出无关。
  //
  // 收敛后这一跳是两段：MCP -> 协调器 -> 核心。中间多一段不削弱这条断言——它要否证的是
  // 「MCP 在本进程构造了一张牌桌」，而那种情况下核心这边会是空的，无论中间有几段。
  const created = await human("room.create", { player_id: "p-host", table_rules_version: RULES });
  assert.equal(created.isError, false, created.raw);
  const roomId = created.body.room_id;
  assert.equal(typeof roomId, "string");
  assert.equal(typeof created.body.session_token, "string",
    "入口必须回一个会话令牌——真人后续的每条命令都按它说话");
  assert.ok(!created.raw.includes("recovery_credential"),
    "入口的返回不得出现凭据字段名：凭据只在协调器的托管层里");
  assert.ok(!/seat_handle/.test(created.raw),
    "入口的返回不得出现句柄：句柄是协调器托管层的对象，不该经过 MCP 进程");

  // 同一个房间必须在核心那一侧存在。
  const inCore = service.surface.dispatch("view.projection").room.room;
  assert.equal(inCore.room_id, roomId, "MCP 建的房间必须就是核心里的那个房间");
});

test("MCP：没带会话令牌的真人命令被本地拒，不猜「反正只有一个会话」", async (t) => {
  await coreAt(t);
  const created = await human("room.create", { player_id: "p-solo", table_rules_version: RULES });
  assert.equal(created.isError, false, created.raw);

  // 只建了一席，所以「猜」在这一刻一定猜得对——这正是要拒的时刻。多席宿主上同一段代码
  // 会替错的人行动，而单席场景下永远看不出来。
  const guessed = await human("seat.ready", { ready: true });
  assert.equal(guessed.isError, true, "没带会话令牌居然被接受了");
  assert.equal(guessed.body.code, "web_session_required", guessed.raw);

  // 带上就该通。少了这一条，上面那条对一个「永远拒绝」的实现也成立。
  const ok = await human("room.confirm_public_scope", { acknowledged: true }, created.body.session_token);
  assert.equal(ok.isError, false, ok.raw);
});

// 白名单在本地挡，且不经过网络。把 origin 指向一个死端口来证明这一点：
// 若拒绝理由变成 core unavailable，说明它先发了请求，那这层白名单就是装饰。
test("MCP：权威自驱命令被本地挡住，且根本不发请求", async (t) => {
  await coreAt(t);
  process.env.TOKENGAME_COMMAND_ORIGIN = "http://127.0.0.1:1";

  for (const command of ["hand.start_if_due", "hand.settle_expired", "view.ai_events"]) {
    const out = await table(command, {});
    assert.equal(out.isError, true, `${command} 应被拒`);
    assert.equal(
      out.body.code,
      "command_not_model_facing",
      `${command} 的拒绝理由必须是本地白名单，而不是网络失败: ${out.raw}`,
    );
  }
  // 真人入口也不该放行权威自驱命令：它们归核心的时钟，不归任何一方适配器。
  for (const command of ["hand.start_if_due", "ai.reclaim_expired", "view.room_events"]) {
    const out = await human(command, {});
    assert.equal(out.isError, true, `${command} 经真人入口也应被拒`);
    assert.equal(out.body.code, "command_not_host_facing", out.raw);
  }
});

// 枚举就是模型看到的能力清单。把真人命令列在这里，模型不必绕过任何东西就能调用——
// 所以这一条是分权的门面，与 test/model-command-isolation.test.cjs 的行为断言配对。
test("MCP：工具枚举就是模型面清单本身，真人命令一条都不在", () => {
  const tool = mcp.tools.find((entry) => entry.name === "tokengame_table");
  assert.ok(tool !== undefined, "必须有 tokengame_table 工具");
  const enumerated = tool.inputSchema.properties.command.enum;
  assert.deepEqual(
    enumerated,
    [...MODEL_COMMANDS],
    "枚举与模型面清单必须逐条相等，手抄一份就是延迟发作的分叉",
  );
  // 正面对账之外再来一次反面：模型面清单万一被改宽，上面那条会跟着变绿。
  for (const humanOnly of ["room.confirm_public_scope", "seat.ready", "hand.act", "hand.reveal"]) {
    assert.ok(!enumerated.includes(humanOnly), `${humanOnly} 出现在模型可见的工具枚举里`);
  }
  assert.ok(
    enumerated.length >= 5 && enumerated.length < HOST_COMMANDS.length,
    `模型面应窄于宿主面: ${enumerated.length} / ${HOST_COMMANDS.length}`,
  );
});

// tools/list 是模型看见的全部能力。真人命令不能以任何工具的形式出现在这里——
// 加一个 tokengame_human_table 工具再叮嘱模型别用它，等于没有边界。
test("MCP：tools/list 里没有任何以真人命令为入口的工具", async () => {
  const listed = await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const listedTools = listed.result.tools;
  assert.ok(listedTools.length >= 6, `工具数看起来不对: ${listedTools.length}`);
  const text = JSON.stringify(listedTools);
  for (const humanOnly of HUMAN_COMMANDS) {
    assert.ok(!text.includes(humanOnly), `真人命令 ${humanOnly} 出现在 tools/list 里`);
  }
  assert.ok(
    HUMAN_COMMANDS.length >= 16,
    `真人面只剩 ${HUMAN_COMMANDS.length} 条，上面的循环形同虚设`,
  );
});

// 原有探针工具承载着已被接受的宿主证据，删掉等于让那些证据失效。
test("MCP：原有桥接探针工具仍在", () => {
  const names = mcp.tools.map((entry) => entry.name);
  for (const kept of [
    "tokengame_probe_status",
    "tokengame_open_action_window",
    "tokengame_close_action_window",
    "tokengame_reset_probe",
    "publish_ai_answer",
  ]) {
    assert.ok(names.includes(kept), `${kept} 不得删除：它承载已被接受的宿主证据`);
  }
});

// 这是本文件的主证据。
//
// 注意两面加起来也没有任何一条能开局的命令——hand.start_if_due 已归权威自驱。所以这一手牌
// 只可能是核心自己按时钟开出来的。换句话说：适配器只负责表达玩家意愿，规则前进不靠它在场。
// 同时验隐藏信息过了 MCP 这一层还成不成立：各席只看见自己的两张，公开投影里没有底牌。
//
// 分权之后入座与准备走真人入口，读牌面走模型工具。这不是把断言放松了：原来那一版用同一个
// 模型可见工具跑完全程，恰恰说明当时模型能替玩家按 Ready。现在两条路都要真的能走通，
// 才证明真人命令是被移到另一条路上了，而不是被删掉了。
test("MCP：两面配合就能进入牌局，且开局由核心自己走表", async (t) => {
  const { tableOrigin } = await coreAt(t);

  // F6：create / join 的返回给的是会话令牌，不是凭据也不是句柄。邀请码仍然可见——建房的人
  // 必须看得见才能转给朋友，理由见 seat-custody.cjs 的 SECRET_FIELDS 注释。
  //
  // 句柄不再经过这个进程。它是协调器托管层的对象，而托管层收敛到那一侧之后，本进程连
  // 「有这么一张句柄」都不需要知道。
  const created = await human("room.create", { player_id: "p-a", table_rules_version: RULES });
  assert.equal(created.isError, false, created.raw);
  const joined = await human("room.join", {
    player_id: "p-b",
    invite_code: created.body.invite_code,
    room_id: created.body.room_id,
  });
  assert.equal(joined.isError, false, joined.raw);

  const seats = [
    { token: created.body.session_token, seat_id: created.body.seat_id, player: "p-a" },
    { token: joined.body.session_token, seat_id: joined.body.seat_id, player: "p-b" },
  ];
  for (const seat of seats) {
    assert.equal(typeof seat.token, "string", "create / join 必须回一个会话令牌");
    // F3：确认按席位记账；F6：这一层给的是会话令牌，凭据由协调器的托管层注入。
    const confirmed = await human("room.confirm_public_scope", { acknowledged: true }, seat.token);
    assert.equal(confirmed.isError, false, confirmed.raw);
    // 连接由入口本身建立（协调器的 openSession 就建了首个连接），所以这里不再单发
    // seat.connect。再发一次不是错，但它会让读者以为「不发就没连上」，而那是错的。
    const ready = await human("seat.ready", { ready: true }, seat.token);
    assert.equal(ready.isError, false, ready.raw);

    // 同一条命令经模型工具必须发不出去。就地验一次而不是只在别的文件里验：
    // 这里手上正好有一个真会话，是最像「模型试一下」的时刻。
    const asModel = await table("seat.ready", { ready: true });
    assert.equal(asModel.isError, true, "模型工具居然按下了 Ready");
    assert.equal(asModel.body.code, "command_not_model_facing", asModel.raw);
  }

  await bindModel(tableOrigin, seats[0].token);

  // 从这里往下，不再发任何能推进规则的命令。只读投影，等核心自己开局。
  // 只读命令不写状态，所以这个轮询不构成「宿主在推进规则」。
  let started = false;
  for (let poll = 0; poll < 60 && !started; poll += 1) {
    // 用 ?. 而不是直接取：失败时模型路由回的是 { ok:false, code }，没有 result。
    // 直接取会把「还没开局」变成一次 TypeError，而那读起来像测试自己坏了。
    const view = (await table("view.projection")).body.result;
    started = view?.public_hand !== null && view?.public_hand !== undefined;
    if (!started) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(started, "倒计时走完后核心必须自己开局：宿主面上没有任何开局命令可用");

  // 隐藏信息边界：公开投影里每一席的 hole_cards 都必须是 null。
  // 按值断言，不按序列化文本断言——字段名本身就含 "hole"，查子串区分不了「字段在但为 null」
  // 和「真漏了牌」。
  const publicView = (await table("view.projection")).body.result;
  const publicSeats = publicView.public_hand.seats;
  assert.equal(publicSeats.length, 2);
  for (const seat of publicSeats) {
    assert.equal(seat.hole_cards, null, `公开投影漏了底牌: ${JSON.stringify(seat)}`);
  }

  // 模型不能主动索取任意席位底牌。B8 由授权后的 ai.start 在同次权威派发中返回
  // model_context（含本席底牌），而不是把 view.hand 扩进模型面。
  const holeByModel = await table("view.hand", {});
  assert.equal(holeByModel.isError, true, "模型工具居然能读底牌");
  assert.equal(holeByModel.body.code, "command_not_model_facing", holeByModel.raw);

  // 各席只看见自己的两张。
  //
  // 走协调器的 /api/view 而不是 hostCommand：view.hand 不在 BROWSER_ACTIONS 里，它由
  // /api/view 组装成视图模型再回。给 hostCommand 加一条 view 路由只为让这里跑通，那是
  // 为可测性扩产品面——真人读牌的完整路径是浏览器那一侧。
  const seen = [];
  for (const seat of seats) {
    const view = (await tableRoute(tableOrigin, "/api/view", { session_token: seat.token })).body.view;
    const own = view.seats.find((entry) => entry.player_id === seat.player);
    assert.ok(own !== undefined, `${seat.player} 没在自己的手牌视图里找到本席`);
    assert.equal(own.hole_cards.length, 2, `${seat.player} 应看到自己的两张底牌`);
    seen.push(own.hole_cards.join("|"));

    for (const other of view.seats) {
      if (other.player_id === seat.player) continue;
      assert.equal(
        other.hole_cards,
        null,
        `${seat.player} 看到了别人的底牌: ${JSON.stringify(other)}`,
      );
    }
  }
  assert.notEqual(seen[0], seen[1], "两席不该拿到同一副底牌");

  // 「拿别人的 seat_id 配自己的会话」在这一层表达不出来：托管层不接受调用方自带 seat_id。
  // 真人路径同样过这道门——UI 也没有理由自己拼 seat_id，协调器手里就有句柄。
  // 核心那一侧的跨席拒绝仍然由 test/seat-authorization.test.cjs 直接钉住。
  const stolen = await human("seat.ready", { seat_id: seats[1].seat_id, ready: true }, seats[0].token);
  assert.equal(stolen.isError, true, `自带 seat_id 居然被接受了: ${stolen.raw}`);
  assert.equal(stolen.body.code, "seat_id_not_model_supplied", stolen.raw);
});

// F6 要求 4：「工具返回与模型可见 transcript 不含 credential」。
//
// 为什么要单独一条端到端的：前面那些断言查的是单次返回。但泄漏是累积的——模型看见的是整个
// 会话，凭据只要在任何一条命令的任何一次返回里出现过一次，它就永久留在上下文里，之后会跟着
// 每一次续写被复述。所以断言的对象必须是整段 transcript，不是某一次的 body。
//
// 凭据原文从核心自己的状态里取，不从托管层拿。托管层正是被测对象，向它要「秘密是什么」等于
// 让它自己划定要扫的范围：它漏存一份，扫描就跟着漏一份。
function credentialsInCore(service) {
  const seats = [...service.surface.orchestrator.rooms.seats.values()];
  return seats.map((seat) => seat.recovery_credential).filter((value) => typeof value === "string");
}

test("F6：模型可见的整段 transcript 不含任何席位凭据", async (t) => {
  const { service, tableOrigin, host } = await coreAt(t);

  // 模型看得见的每一个字节。存整个工具返回而不只是 content[0].text：isError 之外的任何
  // 字段将来也会进上下文，只扫一个字段等于给以后新增字段留了通道。
  const transcript = [];
  async function say(command, params = {}) {
    const out = await mcp.callTool("tokengame_table", { command, params });
    transcript.push(JSON.stringify(out));
    return { isError: out.isError === true, body: JSON.parse(out.content[0].text) };
  }

  // 入座与准备走真人入口。这些调用刻意不进 transcript：transcript 的定义是「模型看得见的
  // 每一个字节」，而真人路径的返回不经模型。把它们记进去会让扫描面虚假地变大——扫一段模型
  // 根本读不到的文本，绿了也说明不了 F6。
  const created = await human("room.create", { player_id: "p-a", table_rules_version: RULES });
  assert.equal(created.isError, false, created.raw);
  const joined = await human("room.join", {
    player_id: "p-b",
    invite_code: created.body.invite_code,
    room_id: created.body.room_id,
  });
  assert.equal(joined.isError, false, joined.raw);

  const seats = [
    { token: created.body.session_token, player: "p-a", conn: created.body.connection_id },
    { token: joined.body.session_token, player: "p-b", conn: joined.body.connection_id },
  ];
  for (const seat of seats) {
    assert.equal((await human("room.confirm_public_scope", { acknowledged: true }, seat.token)).isError, false);
  }
  const modelToken = await bindModel(tableOrigin, seats[0].token);

  // 掉线 -> 恢复。协调器这一侧的恢复是 /api/session/resume，它内部铸一个新连接 id 再连；
  // 核心那条 seat.recover 由协调器的租约扫描按需发，不在 BROWSER_ACTIONS 里。
  //
  // 这段仍然证明同一件事：整条掉线恢复路径上，凭据原文一次都不经过本进程，也不进
  // 模型可见文本。
  assert.equal((await human(
    "seat.disconnect",
    { connection_id: seats[1].conn },
    seats[1].token,
  )).isError, false);
  const resumed = await tableRoute(tableOrigin, "/api/session/resume", { session_token: seats[1].token });
  assert.equal(resumed.body.ok, true, JSON.stringify(resumed.body));

  for (const seat of seats) {
    assert.equal((await human("seat.ready", { ready: true }, seat.token)).isError, false);
  }

  let hand = null;
  for (let poll = 0; poll < 60 && hand === null; poll += 1) {
    const view = await say("view.projection");
    hand = view.body.result?.public_hand ?? null;
    if (hand === null) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(hand !== null, "核心必须自己开局");

  // 真人发言。这是白名单来源事件，会给两席各排一个待办——模型那条回路的入口。
  for (const seat of seats) {
    assert.equal((await human("chat.say", {
      text: `${seat.player} 到了`,
      idempotency_key: `chat-${seat.player}`,
    }, seat.token)).isError, false);
  }
  assert.equal((await say("view.timeline", {})).isError, false);

  // 模型那条回路：领取 -> 启动 -> 回填。三条命令在核心侧都要凭据，凭据由协调器注入，
  // 所以这三次返回是 F6 最可能漏的地方。
  const taken = await say("ai.take_intents", {});
  assert.equal(taken.isError, false, JSON.stringify(taken.body));
  const claimable = taken.body.result.intents.filter((intent) => intent.intent_id !== undefined);
  assert.ok(claimable.length >= 1, `应至少领到一个待办: ${JSON.stringify(taken.body.result)}`);

  const started = await say("ai.start", { intent_id: claimable[0].intent_id });
  assert.equal(started.isError, false, JSON.stringify(started.body));
  const turnId = started.body.result.started.turn_id;

  // 先故意失败一次。这是本条测试真正的锋刃：凭据已经被协调器注入进 params，如果核心的错误
  // 回显把请求参数带回来（或 MCP 把异常栈打进结果），凭据就正好从这条错误路径进入模型上下文。
  // 一条只走成功路径的测试看不见这个洞。
  const badDecision = await say("ai.resolve", { turn_id: turnId, decision: "raise_all_in" });
  assert.equal(badDecision.isError, true, "非法 decision 必须被拒");

  const resolved = await say("ai.resolve", { turn_id: turnId, decision: "silent" });
  assert.equal(resolved.isError, false, JSON.stringify(resolved.body));

  // ---- 断言 ----
  const text = transcript.join("\n");
  const secrets = credentialsInCore(service);
  assert.equal(text.includes(modelToken), false, "逐席模型传输令牌不得进入工具 transcript");

  // 先证明「要扫的东西确实存在」。少了这一步，凭据若是空串或 undefined，下面的 includes
  // 会永真，整条测试变成一个看起来很绿的空壳。
  assert.equal(secrets.length, 2, `核心里应有两席凭据: ${secrets.length}`);
  for (const secret of secrets) {
    assert.ok(secret.length >= 8, `凭据太短，扫描没有意义: ${secret.length}`);
  }

  // 再证明「transcript 确实抓到了内容」。空 transcript 同样能通过负向断言。
  assert.ok(transcript.length >= 6, `transcript 太短，可能没抓到: ${transcript.length}`);
  assert.ok(text.includes(turnId), "回合 id 必须在模型可见文本里：那正是模型要回传的东西");

  // 正题。
  for (const secret of secrets) {
    assert.ok(
      !text.includes(secret),
      "席位凭据出现在模型可见的 transcript 里：F6 的整条边界失效",
    );
  }
  // 字段名同样不该出现：出现就说明有路径在搬运它，哪怕这次值恰好是空的。
  for (const field of ["recovery_credential", '"credential"']) {
    assert.ok(!text.includes(field), `transcript 里出现了 ${field}`);
  }

  // 分权把这一条从「凭据不出现」推进到「句柄也不出现」。
  //
  // 原来这里断言的是反面——句柄必须出现在模型可见文本里，因为那时模型要拿它发命令。分权之后
  // 模型不再需要任何席位标识，于是同一段文本里出现句柄就成了缺陷：句柄一样代表该席的行动
  // 能力，模型手上有它，就只差一条没被挡住的命令。
  //
  // 句柄从**协调器的托管层**取，不从本进程取——本进程收敛后一张句柄也没有，拿它自己手上
  // 的（空）清单去扫等于扫了个空集，那种绿什么都不说明。这是本条断言在 B6 之后变强的地方：
  // 扫的是真正存在的那些句柄。
  const handles = host.custody.handles();
  assert.equal(handles.length, 2, `协调器应当托管两席: ${handles.length}`);
  for (const handle of handles) {
    assert.ok(handle.length >= 8, `句柄太短，扫描没有意义: ${handle}`);
    assert.ok(
      !text.includes(handle),
      "句柄出现在模型可见文本里：模型不该持有任何席位标识",
    );
  }
  // seat_id 是另一回事，别把它也当秘密。
  //
  // 它确实出现在模型可见文本里，而且必须出现：view.projection 是公开投影，两席的 seat_id
  // 都在里面；权威组装的 intent 上下文里也带着来源事件的发言者。把这些摘掉等于让模型看不见
  // 牌桌。
  //
  // 所以边界不是「模型不知道 seat_id」，而是「知道了也用不了」——能力在句柄和命令白名单上，
  // 不在这个公开标识上。下面这条把它验成行为：从公开投影里读一个真的 seat_id，回传给模型
  // 工具，必须被拒。
  const seatIds = [...service.surface.orchestrator.rooms.seats.values()].map((seat) => seat.seat_id);
  assert.equal(seatIds.length, 2, `应有两席: ${seatIds.length}`);
  const publicText = JSON.stringify((await say("view.projection")).body);
  assert.ok(
    seatIds.some((seatId) => publicText.includes(seatId)),
    "公开投影里连 seat_id 都没有，那下面这条「知道了也用不了」就没有前提",
  );
  for (const seatId of seatIds) {
    const reused = await say("ai.take_intents", { seat_id: seatId });
    assert.equal(reused.isError, true, `模型拿公开 seat_id 回传居然被接受: ${seatId}`);
    assert.equal(reused.body.code, "seat_identity_not_model_supplied", JSON.stringify(reused.body));
  }
});

// 桩协调器。用来测「协调器那一侧漏了」这种场合——而那正是 MCP 这一道扫描存在的唯一理由。
//
// 为什么必须用桩而不是真协调器：真协调器不漏（它自己那道门先拦住），所以在真协调器上这道
// 扫描永远无事可做，删掉它两条流程测试都照旧绿。桩把「连接的另一端出了问题」这件事做成
// 可测的输入，测的是这道门本身，不是假装产品此刻会漏。
async function stubTableAt(t, body) {
  const http = require("node:http");
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const saved = {
    table: process.env.TOKENGAME_TABLE_ORIGIN, model: process.env.TOKENGAME_MODEL_TOKEN,
    file: process.env.TOKENGAME_MODEL_CONNECTION_FILE,
  };
  process.env.TOKENGAME_TABLE_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  process.env.TOKENGAME_MODEL_TOKEN = MODEL_TOKEN;
  delete process.env.TOKENGAME_MODEL_CONNECTION_FILE;
  t.after(() => {
    for (const [key, value] of [
      ["TOKENGAME_TABLE_ORIGIN", saved.table], ["TOKENGAME_MODEL_TOKEN", saved.model],
      ["TOKENGAME_MODEL_CONNECTION_FILE", saved.file],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("F6：协调器若在返回里带出句柄原文，MCP 这一侧整份扣下", async (t) => {
  // 句柄不在 SECRET_FIELDS 里——它不是一个秘密字段名，是一个值。协调器那道
  // assertNoLeak 扫的是「已知凭据原文」与「秘密字段名的键位」，两者都扫不到句柄。
  // 所以这道前缀扫描是句柄唯一的出门检查，而持有句柄一样代表该席的行动能力。
  await stubTableAt(t, { ok: true, result: { note: "leaked", owner: "seat_handle-abc123def456" } });
  const out = await mcp.callTool("tokengame_table", { command: "view.projection", params: {} });
  assert.equal(out.isError, true, `句柄原文必须被扣下：${out.content[0].text}`);
  const body = JSON.parse(out.content[0].text);
  assert.equal(body.code, "response_withheld_secret_detected");
  assert.equal(body.field, "seat_handle");
  // 扣下的那份自己也不许把句柄带出去。打码放过与整份扣下的差别就在这里：
  // 一份「已扣下，内容是 seat_handle-abc123」的错误消息等于把它又发了一次。
  assert.equal(out.content[0].text.includes("seat_handle-abc123def456"), false,
    "扣下的响应本身把句柄带出去了");
});

test("F6：正常返回不因为提到公开字段就被扣下", async (t) => {
  // 反面对照。这一条防的是把上面那道扫描写宽：按子串扫 "credential" 会命中合法的公开布尔
  // credential_revoked，于是每一条 view.projection 都变成一条安全错误——安全边界报不出
  // 自己拒了什么，而这个失败形态本轮实际踩过一次。
  await stubTableAt(t, {
    ok: true,
    result: { seats: [{ seat_id: "s-1", credential_revoked: false, seat_handle_present: true }] },
  });
  const out = await mcp.callTool("tokengame_table", { command: "view.projection", params: {} });
  assert.equal(out.isError, false, `合法的公开字段被误扣下了：${out.content[0].text}`);
  assert.equal(JSON.parse(out.content[0].text).result.seats[0].credential_revoked, false);
});

test("F6：工具说明不得要求模型自己回传凭据", () => {
  // 说明文本本身就是一条泄漏路径：只要它教模型「把 recovery_credential 传回来」，模型就会
  // 先把凭据复述进上下文，然后托管层再怎么净化都晚了。
  const tool = mcp.tools.find((entry) => entry.name === "tokengame_table");
  const text = `${tool.description ?? ""}\n${JSON.stringify(tool.inputSchema)}`;
  assert.ok(!text.includes("recovery_credential"), "工具说明仍在要求凭据");
  assert.ok(text.includes("seat_handle"), "工具说明必须告诉模型用句柄");
});

// 架构分水岭写成断言。MCP 进程内 require 命令面或编排层，就等于每个宿主各自持一张牌桌，
// 两个宿主从此是两场牌局。这正是章程点名的失败形态，所以钉在源码层面。
//
// 按实际 require 的目标匹配，不用裸子串。裸子串会把 model-command-surface.cjs 当成
// command-surface.cjs——后者是前者的后缀。那种误报比漏报更糟：它逼着下一个人给新模块改名
// 来绕开测试，而不是去看边界有没有真的破。
function requiredPaths(source) {
  const paths = [];
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match = pattern.exec(source);
  while (match !== null) {
    paths.push(match[1]);
    match = pattern.exec(source);
  }
  return paths;
}

test("MCP：不在本进程构造牌桌（源码层面钉住）", () => {
  const source = fs.readFileSync(MCP_SOURCE, "utf8");
  const paths = requiredPaths(source);
  // 先证明真的解析出了 require。空数组会让下面的负向断言全部空过。
  assert.ok(paths.length >= 4, `没解析到 require，断言会空过: ${JSON.stringify(paths)}`);

  for (const forbidden of [
    "authority/command-surface.cjs",
    "authority/table-orchestrator.cjs",
    "authority/room-store.cjs",
    "authority/seat-ai-store.cjs",
    "authority/command-server.cjs",
    "game/holdem.cjs",
  ]) {
    const hit = paths.filter((entry) => entry.endsWith(forbidden));
    assert.deepEqual(
      hit,
      [],
      `MCP 不得 require ${forbidden}：那会让每个宿主各自持有一张牌桌`,
    );
  }
  // host-surface 是允许的：它只有字符串清单，没有牌桌状态。
  // model-command-surface 同理：它只做分权与身份补齐，牌桌状态一个字节都不碰。
  assert.ok(
    paths.some((entry) => entry.endsWith("authority/host-surface.cjs")),
    "词汇表必须来自 host-surface，不能手抄",
  );
});
