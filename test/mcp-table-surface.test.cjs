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
const mcp = require("../plugins/tokengame/mcp/server.cjs");

const RULES = "table-rules-v1";
const MCP_SOURCE = path.join(__dirname, "..", "plugins", "tokengame", "mcp", "server.cjs");

// 真核心 + 真端口 + 真时钟。这里不注入 now()，因为本文件要证明的恰是「宿主不推进规则，
// 核心自己走表也会开局」——到期驱动必须开着。
async function coreAt(t, { token = DEFAULT_AUTHORITY_TOKEN } = {}) {
  const service = createCommandServer({ internalToken: token });
  const origin = await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());

  const prevOrigin = process.env.TOKENGAME_COMMAND_ORIGIN;
  const prevToken = process.env.TOKENGAME_AUTHORITY_TOKEN;
  process.env.TOKENGAME_COMMAND_ORIGIN = origin;
  process.env.TOKENGAME_AUTHORITY_TOKEN = token;
  t.after(() => {
    if (prevOrigin === undefined) delete process.env.TOKENGAME_COMMAND_ORIGIN;
    else process.env.TOKENGAME_COMMAND_ORIGIN = prevOrigin;
    if (prevToken === undefined) delete process.env.TOKENGAME_AUTHORITY_TOKEN;
    else process.env.TOKENGAME_AUTHORITY_TOKEN = prevToken;
  });
  return { origin, service };
}

// 经模型可见的 MCP 工具发一条命令。这是模型能走的唯一一条路。
async function table(command, params = {}) {
  const out = await mcp.callTool("tokengame_table", { command, params });
  const body = JSON.parse(out.content[0].text);
  return { isError: out.isError === true, body, raw: out.content[0].text };
}

// 真人操作面。刻意不经 callTool：真人命令不是工具，模型在 tools/list 里看不到它们。
// 形状对齐 table() 以便同一段流程读起来一致，但走的是完全不同的入口。
async function human(command, params = {}) {
  const out = await mcp.hostCommand(command, params);
  return {
    isError: out.ok !== true,
    body: out.body,
    seat_handle: out.seat_handle ?? null,
    raw: JSON.stringify(out.body),
  };
}

test("MCP：牌桌命令真的落到外部核心，不是本进程自己编的", async (t) => {
  const { service } = await coreAt(t);

  // room.create 是真人命令（分权后模型发不出它），所以走真人入口。
  // 本条测试要证的是「这一跳打到了外部核心」，与哪一面发出无关。
  const created = await human("room.create", { player_id: "p-host", table_rules_version: RULES });
  assert.equal(created.isError, false, created.raw);
  const roomId = created.body.result.room.room_id;
  assert.equal(typeof roomId, "string");

  // 同一个房间必须在核心那一侧存在。MCP 若在本进程构造牌桌，核心这边会是空的。
  // 投影把房间包在契约信封里（projection.room.room），room.create 的返回是平的，别搞混。
  const inCore = service.surface.dispatch("view.projection").room.room;
  assert.equal(inCore.room_id, roomId, "MCP 建的房间必须就是核心里的那个房间");
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
  await coreAt(t);

  // F6：create / join 的返回给的是句柄，不是凭据。邀请码仍然可见——建房的人必须看得见
  // 才能转给朋友，理由见 seat-custody.cjs 的 SECRET_FIELDS 注释。
  const created = await human("room.create", { player_id: "p-a", table_rules_version: RULES });
  const host = created.body.result;
  const joined = await human("room.join", {
    player_id: "p-b",
    invite_code: host.invite_code,
    room_id: host.room.room_id,
  });
  const guest = joined.body.result;

  const seats = [
    { handle: created.seat_handle, seat_id: host.seat.seat_id, player: "p-a" },
    { handle: joined.seat_handle, seat_id: guest.seat.seat_id, player: "p-b" },
  ];
  for (const seat of seats) {
    assert.equal(typeof seat.handle, "string", "create / join 必须回一个句柄");
    const auth = { seat_handle: seat.handle };
    // F3：确认按席位记账；F6：这一层给的是句柄，凭据由本机协调器注入。
    const confirmed = await human("room.confirm_public_scope", { ...auth, acknowledged: true });
    assert.equal(confirmed.isError, false, confirmed.raw);
    const connected = await human("seat.connect", { ...auth, connection_id: `mcp-${seat.player}` });
    assert.equal(connected.isError, false, connected.raw);
    const ready = await human("seat.ready", { ...auth, ready: true });
    assert.equal(ready.isError, false, ready.raw);

    // 同一条命令经模型工具必须发不出去。就地验一次而不是只在别的文件里验：
    // 这里手上正好有一个真句柄，是最像「模型试一下」的时刻。
    const asModel = await table("seat.ready", { ...auth, ready: true });
    assert.equal(asModel.isError, true, "模型工具居然按下了 Ready");
    assert.equal(asModel.body.code, "command_not_model_facing", asModel.raw);
  }

  // 从这里往下，不再发任何能推进规则的命令。只读投影，等核心自己开局。
  // 只读命令不写状态，所以这个轮询不构成「宿主在推进规则」。
  let started = false;
  for (let poll = 0; poll < 60 && !started; poll += 1) {
    const view = (await table("view.projection")).body.result;
    started = view.public_hand !== null && view.public_hand !== undefined;
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

  // 底牌只走真人面。view.hand 是全系统唯一吐底牌的出口，分权后它归真人：座位 AI 的上下文
  // 由权威裁剪后随 intent 一起给出（F5 要求 2），给模型第二条自取底牌的路等于绕过那次裁剪。
  const holeByModel = await table("view.hand", { seat_handle: seats[0].handle });
  assert.equal(holeByModel.isError, true, "模型工具居然能读底牌");
  assert.equal(holeByModel.body.code, "command_not_model_facing", holeByModel.raw);

  // 各席只看见自己的两张。
  // view.hand 返回的是同一个 publicProjection 形状，席位按 id（即 playerId）索引，
  // 不是 seat_id——只有查看者自己那一席的 hole_cards 被填上。上一轮就是在这里认错了字段。
  const seen = [];
  for (const seat of seats) {
    const mine = (await human("view.hand", { seat_handle: seat.handle })).body.result.hand;

    const own = mine.seats.find((entry) => entry.id === seat.player);
    assert.ok(own !== undefined, `${seat.player} 没在自己的手牌视图里找到本席`);
    assert.equal(own.hole_cards.length, 2, `${seat.player} 应看到自己的两张底牌`);
    seen.push(own.hole_cards.join("|"));

    for (const other of mine.seats) {
      if (other.id === seat.player) continue;
      assert.equal(
        other.hole_cards,
        null,
        `${seat.player} 看到了别人的底牌: ${JSON.stringify(other)}`,
      );
    }
  }
  assert.notEqual(seen[0], seen[1], "两席不该拿到同一副底牌");

  // 「拿别人的 seat_id 配自己的句柄」在这一层表达不出来：托管层不接受调用方自带 seat_id。
  // 真人路径同样过这道门——UI 也没有理由自己拼 seat_id，它手里就有句柄。
  // 核心那一侧的跨席拒绝仍然由 test/seat-authorization.test.cjs 直接钉住。
  const stolen = await human("view.hand", {
    seat_handle: seats[0].handle,
    seat_id: seats[1].seat_id,
  });
  assert.equal(stolen.isError, true, `自带 seat_id 居然被接受了: ${stolen.raw}`);
  assert.equal(stolen.body.code, "seat_id_not_model_supplied", stolen.raw);

  // 句柄只解回自己那一席：换句柄读到的是另一副底牌，而不是同一副。
  const byHandle = await human("view.hand", { seat_handle: seats[1].handle });
  assert.equal(byHandle.isError, false, byHandle.raw);
  const other = byHandle.body.result.hand.seats.find((entry) => entry.id === seats[1].player);
  assert.equal(other.hole_cards.length, 2);
  assert.notEqual(other.hole_cards.join("|"), seen[0], "换句柄必须换到另一席的视角");
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
  const { service } = await coreAt(t);

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
    invite_code: created.body.result.invite_code,
    room_id: created.body.result.room.room_id,
  });
  assert.equal(joined.isError, false, joined.raw);

  const seats = [
    { handle: created.seat_handle, player: "p-a", conn: "mcp-a" },
    { handle: joined.seat_handle, player: "p-b", conn: "mcp-b" },
  ];
  for (const seat of seats) {
    const auth = { seat_handle: seat.handle };
    assert.equal((await human("room.confirm_public_scope", { ...auth, acknowledged: true })).isError, false);
    assert.equal((await human("seat.connect", { ...auth, connection_id: seat.conn })).isError, false);
  }

  // 掉线 -> 恢复 -> 重连。seat.recover 也走句柄，所以这段同时证明「凭据的唯一入参命令」
  // 在 UI 侧也不需要凭据原文。
  const b = { seat_handle: seats[1].handle };
  assert.equal((await human("seat.disconnect", { ...b, connection_id: seats[1].conn })).isError, false);
  const recovered = await human("seat.recover", { ...b, connection_id: seats[1].conn });
  assert.equal(recovered.isError, false, recovered.raw);
  assert.equal((await human("seat.connect", { ...b, connection_id: seats[1].conn })).isError, false);

  for (const seat of seats) {
    assert.equal((await human("seat.ready", { seat_handle: seat.handle, ready: true })).isError, false);
  }

  let hand = null;
  for (let poll = 0; poll < 60 && hand === null; poll += 1) {
    const view = await say("view.projection");
    hand = view.body.result.public_hand ?? null;
    if (hand === null) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(hand !== null, "核心必须自己开局");

  // 真人发言。这是白名单来源事件，会给两席各排一个待办——模型那条回路的入口。
  for (const seat of seats) {
    assert.equal((await human("chat.say", {
      seat_handle: seat.handle,
      text: `${seat.player} 到了`,
      idempotency_key: `chat-${seat.player}`,
    })).isError, false);
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
  for (const seat of seats) {
    assert.ok(
      !text.includes(seat.handle),
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
