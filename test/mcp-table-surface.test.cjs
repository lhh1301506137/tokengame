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
const { HOST_COMMANDS } = require("../src/authority/host-surface.cjs");
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

// 经 MCP 工具发一条牌桌命令，把 content[0].text 解回 JSON。
async function table(command, params = {}) {
  const out = await mcp.callTool("tokengame_table", { command, params });
  const body = JSON.parse(out.content[0].text);
  return { isError: out.isError === true, body, raw: out.content[0].text };
}

test("MCP：牌桌命令真的落到外部核心，不是本进程自己编的", async (t) => {
  const { service } = await coreAt(t);

  const created = await table("room.create", { player_id: "p-host", table_rules_version: RULES });
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
      "command_not_host_facing",
      `${command} 的拒绝理由必须是本地白名单，而不是网络失败: ${out.raw}`,
    );
  }
});

test("MCP：工具枚举就是宿主面清单本身", () => {
  const tool = mcp.tools.find((entry) => entry.name === "tokengame_table");
  assert.ok(tool !== undefined, "必须有 tokengame_table 工具");
  assert.deepEqual(
    tool.inputSchema.properties.command.enum,
    [...HOST_COMMANDS],
    "枚举与宿主面清单必须逐条相等，手抄一份就是延迟发作的分叉",
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
// 注意宿主面里没有任何一条能开局的命令——hand.start_if_due 已归权威自驱。所以这一手牌
// 只可能是核心自己按时钟开出来的。换句话说：适配器只负责表达玩家意愿，规则前进不靠它在场。
// 同时验隐藏信息过了 MCP 这一层还成不成立：各席只看见自己的两张，公开投影里没有底牌。
test("MCP：只用宿主面命令就能进入牌局，且开局由核心自己走表", async (t) => {
  await coreAt(t);

  // F6：create / join 的返回给的是句柄，不是凭据。邀请码仍然可见——建房的人必须看得见
  // 才能转给朋友，理由见 seat-custody.cjs 的 SECRET_FIELDS 注释。
  const created = await table("room.create", { player_id: "p-a", table_rules_version: RULES });
  const host = created.body.result;
  const joined = await table("room.join", {
    player_id: "p-b",
    invite_code: host.invite_code,
    room_id: host.room.room_id,
  });
  const guest = joined.body.result;

  const seats = [
    { handle: created.body.seat_handle, seat_id: host.seat.seat_id, player: "p-a" },
    { handle: joined.body.seat_handle, seat_id: guest.seat.seat_id, player: "p-b" },
  ];
  for (const seat of seats) {
    assert.equal(typeof seat.handle, "string", "create / join 必须回一个句柄");
    const auth = { seat_handle: seat.handle };
    // F3：确认按席位记账；F6：这一层给的是句柄，凭据由本机协调器注入。
    const confirmed = await table("room.confirm_public_scope", { ...auth, acknowledged: true });
    assert.equal(confirmed.isError, false, confirmed.raw);
    const connected = await table("seat.connect", { ...auth, connection_id: `mcp-${seat.player}` });
    assert.equal(connected.isError, false, connected.raw);
    const ready = await table("seat.ready", { ...auth, ready: true });
    assert.equal(ready.isError, false, ready.raw);
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

  // 各席只看见自己的两张。
  // view.hand 返回的是同一个 publicProjection 形状，席位按 id（即 playerId）索引，
  // 不是 seat_id——只有查看者自己那一席的 hole_cards 被填上。上一轮就是在这里认错了字段。
  const seen = [];
  for (const seat of seats) {
    const mine = (await table("view.hand", { seat_handle: seat.handle })).body.result.hand;

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

  // F6 之后，「拿别人的 seat_id 配自己的凭据」在这一层已经表达不出来了：模型手里没有
  // 凭据，也不允许自己指定 seat_id。所以断言从「核心会拒」升级成「这一层根本不接受」。
  // 核心那一侧的跨席拒绝仍然由 test/seat-authorization.test.cjs 直接钉住。
  const stolen = await table("view.hand", {
    seat_handle: seats[0].handle,
    seat_id: seats[1].seat_id,
  });
  assert.equal(stolen.isError, true, `模型指定 seat_id 居然被接受了: ${stolen.raw}`);
  assert.equal(stolen.body.code, "seat_id_not_model_supplied", stolen.raw);

  // 句柄只解回自己那一席：换句柄读到的是另一副底牌，而不是同一副。
  const byHandle = await table("view.hand", { seat_handle: seats[1].handle });
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

  const created = await say("room.create", { player_id: "p-a", table_rules_version: RULES });
  assert.equal(created.isError, false);
  const joined = await say("room.join", {
    player_id: "p-b",
    invite_code: created.body.result.invite_code,
    room_id: created.body.result.room.room_id,
  });
  assert.equal(joined.isError, false);

  const seats = [
    { handle: created.body.seat_handle, player: "p-a", conn: "mcp-a" },
    { handle: joined.body.seat_handle, player: "p-b", conn: "mcp-b" },
  ];
  for (const seat of seats) {
    const auth = { seat_handle: seat.handle };
    assert.equal((await say("room.confirm_public_scope", { ...auth, acknowledged: true })).isError, false);
    assert.equal((await say("seat.connect", { ...auth, connection_id: seat.conn })).isError, false);
  }

  // 掉线 -> 恢复 -> 重连。seat.recover 也走句柄，所以这段同时证明「凭据的唯一入参命令」
  // 在模型侧也不需要凭据原文。
  const b = { seat_handle: seats[1].handle };
  assert.equal((await say("seat.disconnect", { ...b, connection_id: seats[1].conn })).isError, false);
  const recovered = await say("seat.recover", { ...b, connection_id: seats[1].conn });
  assert.equal(recovered.isError, false, JSON.stringify(recovered.body));
  assert.equal((await say("seat.connect", { ...b, connection_id: seats[1].conn })).isError, false);

  for (const seat of seats) {
    assert.equal((await say("seat.ready", { seat_handle: seat.handle, ready: true })).isError, false);
  }

  let hand = null;
  for (let poll = 0; poll < 60 && hand === null; poll += 1) {
    const view = await say("view.projection");
    hand = view.body.result.public_hand ?? null;
    if (hand === null) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(hand !== null, "核心必须自己开局");

  // 带凭据的读、写、发言各走一遍。
  for (const seat of seats) {
    assert.equal((await say("view.hand", { seat_handle: seat.handle })).isError, false);
    assert.equal((await say("chat.say", {
      seat_handle: seat.handle,
      text: `${seat.player} 到了`,
      idempotency_key: `chat-${seat.player}`,
    })).isError, false);
  }
  for (const seat of hand.seats) {
    assert.equal((await say("view.seat", { seat_id: seat.id })).isError, true, "view.seat 收 seat_id 而不是 player id");
  }
  assert.equal((await say("view.timeline", {})).isError, false);

  const actor = seats.find((seat) => seat.player === hand.actor_player_id);
  assert.ok(actor !== undefined, `行动者必须是这两席之一: ${hand.actor_player_id}`);
  const act = {
    seat_handle: actor.handle,
    hand_id: hand.hand_id,
    action: "fold",
  };

  // 先故意失败一次。这是本条测试真正的锋刃：凭据已经被协调器注入进 params，如果核心的错误
  // 回显把请求参数带回来（或 MCP 把异常栈打进结果），凭据就正好从这条错误路径进入模型上下文。
  // 一条只走成功路径的测试看不见这个洞。
  const stale = await say("hand.act", {
    ...act,
    expected_revision: hand.revision + 999,
    idempotency_key: "stale-key",
  });
  assert.equal(stale.isError, true, "过期 revision 必须被拒");

  const acted = await say("hand.act", {
    ...act,
    expected_revision: hand.revision,
    idempotency_key: "act-1",
  });
  assert.equal(acted.isError, false, JSON.stringify(acted.body));

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
  assert.ok(transcript.length >= 20, `transcript 太短，可能没抓到: ${transcript.length}`);
  for (const seat of seats) {
    assert.ok(text.includes(seat.handle), "句柄必须出现在模型可见文本里：那正是模型要用的东西");
  }

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
test("MCP：不在本进程构造牌桌（源码层面钉住）", () => {
  const source = fs.readFileSync(MCP_SOURCE, "utf8");
  for (const forbidden of [
    "command-surface.cjs",
    "table-orchestrator.cjs",
    "room-store.cjs",
    "seat-ai-store.cjs",
    "command-server.cjs",
    "holdem.cjs",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `MCP 不得 require ${forbidden}：那会让每个宿主各自持有一张牌桌`,
    );
  }
  // host-surface 是允许的：它只有字符串清单，没有牌桌状态。
  assert.ok(source.includes("host-surface.cjs"), "词汇表必须来自 host-surface，不能手抄");
});
