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

  const host = (await table("room.create", { player_id: "p-a", table_rules_version: RULES })).body.result;
  const guest = (await table("room.join", {
    player_id: "p-b",
    invite_code: host.invite_code,
    room_id: host.room.room_id,
  })).body.result;

  const seats = [
    { seat_id: host.seat.seat_id, credential: host.recovery_credential, player: "p-a" },
    { seat_id: guest.seat.seat_id, credential: guest.recovery_credential, player: "p-b" },
  ];
  for (const seat of seats) {
    const auth = { seat_id: seat.seat_id, recovery_credential: seat.credential };
    // F3：确认按席位记账，过 MCP 也要逐席带凭据与显式表态。
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
    const mine = (await table("view.hand", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
    })).body.result.hand;

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

  // 拿别人的 seat_id 配自己的凭据，过了 MCP 这一层也必须被核心拒。
  const stolen = await table("view.hand", {
    seat_id: seats[1].seat_id,
    recovery_credential: seats[0].credential,
  });
  assert.equal(stolen.isError, true, `跨席读牌居然成功了: ${stolen.raw}`);
  assert.equal(stolen.body.code, "recovery_credential_rejected", stolen.raw);
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
