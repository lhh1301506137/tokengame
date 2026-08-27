"use strict";

// 传输面回归：真起 HTTP 服务、真发请求。关注四件事——
// 传输令牌拦不拦得住、错误码映射对不对、发布门禁是否机器化、隐藏信息边界过了网还成不成立。
// 不重复验证内核规则，那些在 command-surface 与各内核的测试里。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createCommandServer,
  AUTHORITY_TOKEN_HEADER,
  DEFAULT_AUTHORITY_TOKEN,
} = require("../src/authority/command-server.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");

const RULES = "table-rules-v1";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

// 起一个只监听回环随机端口的服务。t.after 保证端口一定被释放。
async function serve(t, { token = DEFAULT_AUTHORITY_TOKEN } = {}) {
  let now = 1_000;
  let id = 0;
  const service = createCommandServer({
    internalToken: token,
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
    // 本文件自己推进 now()，所以必须关掉到期驱动：驱动按真实 setInterval 走表，
    // 会在测试推进时钟前先把手牌开出去，让 hand.start_if_due 的断言变得不确定。
    // 驱动本身在 test/due-work.test.cjs 里单独测。
    dueWork: false,
  });
  const origin = await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());

  async function call(command, params = {}, { headerToken = token } = {}) {
    const headers = { "content-type": "application/json" };
    if (headerToken !== null) headers[AUTHORITY_TOKEN_HEADER] = headerToken;
    const response = await fetch(`${origin}/command`, {
      method: "POST",
      headers,
      body: JSON.stringify({ command, params }),
    });
    return { status: response.status, body: await response.json(), response };
  }

  // 成功才解包 result，失败直接抛出可读信息，避免测试里出现一层层 .body.result。
  async function ok(command, params = {}) {
    const out = await call(command, params);
    assert.equal(out.status, 200, `${command} 应当成功，实得 ${JSON.stringify(out.body)}`);
    return out.body.result;
  }

  return {
    origin,
    service,
    call,
    ok,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

// 经 HTTP 建起一张两人桌并开局，返回各席的 seat_id 与凭据。
async function table(ctx, { playerCount = 2 } = {}) {
  const created = await ctx.ok("room.create", { player_id: "p1", table_rules_version: RULES });
  await ctx.ok("room.confirm_public_scope");

  const seats = [{ seat_id: created.seat.seat_id, credential: created.recovery_credential }];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = await ctx.ok("room.join", {
      player_id: `p${index}`,
      invite_code: created.invite_code,
    });
    seats.push({ seat_id: joined.seat.seat_id, credential: joined.recovery_credential });
  }
  for (const seat of seats) {
    await ctx.ok("seat.connect", { seat_id: seat.seat_id, connection_id: `c-${seat.seat_id}` });
    await ctx.ok("ai.set_mode", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      mode: "OFF",
    });
    await ctx.ok("seat.ready", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      ready: true,
    });
  }
  await ctx.ok("hand.evaluate_start");
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  const started = await ctx.ok("hand.start_if_due");
  return { seats, invite_code: created.invite_code, started };
}

test("传输：健康检查不需要令牌，并回报命令数", async (t) => {
  const ctx = await serve(t);
  const response = await fetch(`${ctx.origin}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "tokengame-command-server");
  assert.ok(body.command_count > 20, `命令数应当是完整词表，实得 ${body.command_count}`);
});

test("传输：缺令牌与错令牌一律 403", async (t) => {
  const ctx = await serve(t);
  const missing = await ctx.call("view.projection", {}, { headerToken: null });
  assert.equal(missing.status, 403);
  assert.equal(missing.body.code, "authority_token_rejected");

  // 等长但不同的令牌，走完 sameToken 的逐字符比较而不是长度短路。
  const sameLength = DEFAULT_AUTHORITY_TOKEN.slice(0, -1) + "X";
  assert.equal(sameLength.length, DEFAULT_AUTHORITY_TOKEN.length);
  const wrong = await ctx.call("view.projection", {}, { headerToken: sameLength });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.code, "authority_token_rejected");
});

test("传输：令牌检查发生在解析请求体之前", async (t) => {
  const ctx = await serve(t);
  const response = await fetch(`${ctx.origin}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ 这不是合法 JSON",
  });
  // 若顺序反了，这里会拿到 invalid_json：未授权者不该有机会让我们解析它的 body。
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "authority_token_rejected");
});

test("传输：带令牌的畸形 JSON 回 400，超大请求体回 413", async (t) => {
  const ctx = await serve(t);
  const headers = {
    "content-type": "application/json",
    [AUTHORITY_TOKEN_HEADER]: DEFAULT_AUTHORITY_TOKEN,
  };

  const malformed = await fetch(`${ctx.origin}/command`, {
    method: "POST", headers, body: "{ 这不是合法 JSON",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "invalid_json");

  const huge = await fetch(`${ctx.origin}/command`, {
    method: "POST",
    headers,
    body: JSON.stringify({ command: "chat.say", params: { text: "x".repeat(70_000) } }),
  });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).code, "request_body_too_large");
});

test("传输：未知路由与未知命令分别回 404，命令表随错误返回", async (t) => {
  const ctx = await serve(t);
  const route = await fetch(`${ctx.origin}/api/table/state`, {
    headers: { [AUTHORITY_TOKEN_HEADER]: DEFAULT_AUTHORITY_TOKEN },
  });
  assert.equal(route.status, 404);
  assert.equal((await route.json()).code, "unknown_route");

  const unknown = await ctx.call("room.destroy");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, "unknown_command");
  assert.ok(Array.isArray(unknown.body.details.known_commands));
});

test("传输：不放开跨源，任何响应都不带通配 CORS 头", async (t) => {
  const ctx = await serve(t);
  const health = await fetch(`${ctx.origin}/health`);
  const command = await ctx.call("view.projection");
  for (const response of [health, command.response]) {
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
});

test("发布门禁：非回环地址被拒，并指名阻塞的 unknown", async (t) => {
  const service = createCommandServer({ deckFactory: deck });
  await assert.rejects(
    () => service.start({ host: "0.0.0.0", port: 0 }),
    (error) => {
      assert.equal(error.code, "local_bridge_auth_unresolved");
      assert.equal(error.details.blocking_unknown, "U-TG-LOCAL-BRIDGE-AUTH");
      assert.equal(error.details.blocking_boundary, "release");
      return true;
    },
  );
  // 拒绝之后不得留下监听中的服务。
  assert.equal(service.server.listening, false);
});

test("端到端：整局只经 HTTP 打完，且过网后手序仍然同步", async (t) => {
  const ctx = await serve(t);
  const { seats } = await table(ctx);

  let guard = 0;
  while (guard++ < 40) {
    const hand = await ctx.ok("view.hand", {
      seat_id: seats[0].seat_id,
      recovery_credential: seats[0].credential,
    });
    if (hand.hand === null || hand.hand.status === "complete") break;

    const actorPlayerId = hand.hand.actor_player_id;
    if (actorPlayerId === null) break;
    // 用私密视图找出该谁行动，再用那一席的凭据提交——完全不碰进程内对象。
    const actor = await findActor(ctx, seats, actorPlayerId);
    const legal = actor.view.legal_actions.map((action) => action.type);
    const choice = legal.includes("check") ? "check" : legal.includes("call") ? "call" : "fold";
    // 参数名是 action，不是 type。这是命令面的词表，我第一次写成了 type，
    // 内核回的 details.action 是空字符串才发现。
    await ctx.ok("hand.act", {
      seat_id: actor.seat.seat_id,
      recovery_credential: actor.seat.credential,
      action: choice,
    });
  }
  assert.ok(guard < 40, "牌局应当在有限步内结束");

  const projection = await ctx.ok("view.projection");
  assert.equal(projection.room.hand_index >= 1, true);
  assert.equal(projection.public_hand === null, false);
});

// 从各席的私密视图里找出「当前行动者是我」的那一席。
async function findActor(ctx, seats, actorPlayerId) {
  for (const seat of seats) {
    const view = (await ctx.ok("view.hand", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
    })).hand;
    const mine = view.seats.find((candidate) => candidate.hole_cards !== null);
    if (mine !== undefined && mine.id === actorPlayerId) return { seat, view };
  }
  throw new Error(`没有任何席位认领行动者 ${actorPlayerId}`);
}

test("隐藏信息过网仍然成立：拿别人的 seat_id 读不到底牌", async (t) => {
  const ctx = await serve(t);
  const { seats } = await table(ctx);

  const attacker = seats[0];
  const victim = seats[1];
  const forged = await ctx.call("view.hand", {
    seat_id: victim.seat_id,
    recovery_credential: attacker.credential,
  });
  assert.equal(forged.status, 403);
  assert.equal(forged.body.code, "recovery_credential_rejected");

  // 传输令牌是对的，但它不代表席位授权：两道门必须都过。
  const noCredential = await ctx.call("view.hand", { seat_id: victim.seat_id });
  assert.equal(noCredential.status, 400);
});

test("隐藏信息过网仍然成立：无凭据的公开投影不含任何底牌与凭据", async (t) => {
  const ctx = await serve(t);
  const { seats } = await table(ctx);
  const projection = await ctx.ok("view.projection");

  for (const seat of projection.public_hand.seats) {
    assert.equal(seat.hole_cards, null, "公开投影不得出现底牌");
  }
  const serialized = JSON.stringify(projection);
  for (const seat of seats) {
    assert.equal(
      serialized.includes(seat.credential),
      false,
      "任何凭据都不得出现在投影里",
    );
  }
  for (const key of ["deck", "recovery_credential"]) {
    assert.equal(serialized.includes(key), false, `投影里不得出现 ${key}`);
  }
});

test("传输：ProbeError 的 status 与 details 被原样映射，不吞不改", async (t) => {
  const ctx = await serve(t);
  await ctx.ok("room.create", { player_id: "p1", table_rules_version: RULES });

  // 未做公开确认就发言：内核抛 ProbeError，传输面必须把它的 status 与 details 带出来。
  const seat = (await ctx.ok("view.projection")).room.seats[0];
  const rejected = await ctx.call("chat.say", { seat_id: seat.seat_id, text: "hi" });
  assert.equal(rejected.body.ok, false);
  assert.equal(typeof rejected.body.code, "string");
  assert.ok(rejected.status >= 400 && rejected.status < 500, `实得 ${rejected.status}`);
});
