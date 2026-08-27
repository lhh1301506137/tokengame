"use strict";

// 到期驱动回归。核心是「玩家不在场时规则照样发生」——这正是进程内注入时钟的测试看不出的
// 那个缺口。另外钉住三件事：驱动不自己做判定、不吞真错误、不持有进程。

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createDueWorkDriver, DEFAULT_INTERVAL_MS } = require("../src/authority/due-work.cjs");
const { createCommandServer } = require("../src/authority/command-server.cjs");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { actionBinding } = require("../test-support/action-binding.cjs");

const RULES = "table-rules-v1";
const UNREF_SCRIPT = path.join(__dirname, "..", "test-support", "due-work-unref.cjs");

// markConnected / markDisconnected 都用 requiredString 校验 connectionId，且保留窗只在
// 「最后一个连接消失」时才起算——断开时必须交回同一个 id，否则连接根本没被摘掉。
function conn(seat) {
  return `c-${seat.seat_id}`;
}

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

function harness({ playerCount = 2 } = {}) {
  let now = 1_000;
  let id = 0;
  const orchestrator = new TableOrchestrator({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
  });

  const created = orchestrator.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  orchestrator.confirmPublicScope();
  const seats = [{ seat_id: created.seat.seat_id, credential: created.credential }];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = orchestrator.joinRoom({
      playerId: `p${index}`,
      inviteCode: created.invite.invite_code,
    });
    seats.push({ seat_id: joined.seat.seat_id, credential: joined.credential });
  }
  for (const seat of seats) {
    orchestrator.rooms.markConnected({ seatId: seat.seat_id, connectionId: conn(seat) });
    // AI 全静音：本文件测的是到期驱动，不该被自动决策的意图搅进来。
    orchestrator.setSeatAiMode({ seatId: seat.seat_id, mode: "OFF" });
  }

  return {
    orchestrator,
    seats,
    driver: createDueWorkDriver({ orchestrator }),
    at: () => now,
    set(value) {
      now = value;
      return now;
    },
    advance(ms) {
      now += ms;
      return now;
    },
    ready() {
      for (const seat of seats) {
        orchestrator.setReady({ seatId: seat.seat_id, ready: true });
      }
      orchestrator.evaluateStart();
    },
  };
}

test("空转：没有房间、没有牌局时 tick 无害且不抛", () => {
  const orchestrator = new TableOrchestrator({ deckFactory: deck });
  const driver = createDueWorkDriver({ orchestrator });

  const done = driver.tick();
  assert.equal(done.settled, null);
  assert.deepEqual(done.released, []);
  assert.equal(done.started, false);
  assert.equal(driver.ticks, 1);
});

test("规则1：倒计时未走完 tick 不开局，走完后由 tick 自己开局", () => {
  const ctx = harness();
  ctx.ready();

  const early = ctx.driver.tick();
  assert.equal(early.started, false, "倒计时未走完不得开局");
  assert.equal(early.decision.can_start, false);

  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  const due = ctx.driver.tick();
  assert.equal(due.started, true, "倒计时走完应由 tick 开局，不需要客户端来催");
  assert.equal(ctx.orchestrator.hand.status, "active");
});

test("规则2：所有人都不在场时，行动截止仍然由权威自己结算", () => {
  const ctx = harness();
  ctx.ready();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  ctx.driver.tick();

  const hand = ctx.orchestrator.hand;
  const deadline = hand.actionDeadlineAt;
  assert.ok(deadline > ctx.at(), "应当有一个未来的行动截止时间");

  // 两席都断线：此后没有任何客户端会来轮询。规则 2 讲的正是这种情形。
  for (const seat of ctx.seats) {
    ctx.orchestrator.rooms.markDisconnected({ seatId: seat.seat_id, connectionId: conn(seat) });
  }
  for (const seat of ctx.seats) {
    assert.equal(ctx.orchestrator.rooms.seatState(seat.seat_id).connected, false, "两席都应确实处于断线状态");
  }

  const before = ctx.driver.tick();
  assert.equal(before.settled, null, "未到期不得提前结算");

  ctx.set(deadline + 1);
  const after = ctx.driver.tick();
  assert.ok(after.settled !== null, "到期后应由驱动完成自动处置");
  assert.equal(after.settled.accepted, true);
});

test("规则2：截止时可 check 则自动 check，判定仍在内核", () => {
  const ctx = harness();
  ctx.ready();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  ctx.driver.tick();

  // 先让当前行动者跟注，把行动权交到可以 check 的一侧。
  const hand = ctx.orchestrator.hand;
  const actorId = hand.seats[hand.actorIndex].id;
  assert.ok(
    hand.legalActions(actorId).some((action) => action.type === "call"),
    "前置条件不成立：当前行动者应当可以跟注",
  );
  ctx.orchestrator.act({ playerId: actorId, type: "call", ...actionBinding(ctx.orchestrator) });

  const beforeStreet = ctx.orchestrator.hand.street;
  const legal = ctx.orchestrator.hand
    .legalActions(ctx.orchestrator.hand.seats[ctx.orchestrator.hand.actorIndex].id)
    .map((action) => action.type);
  assert.ok(legal.includes("check"), `这一步应当可以 check，实得 ${JSON.stringify(legal)}`);

  ctx.set(ctx.orchestrator.hand.actionDeadlineAt + 1);
  const done = ctx.driver.tick();
  assert.ok(done.settled !== null, "到期应当有处置");
  // 自动 check 会推进街，而自动 fold 会直接结束这一手。用街的推进证明选的是 check。
  assert.notEqual(ctx.orchestrator.hand.street, beforeStreet, "自动 check 应当推进街而不是结束牌局");
  assert.equal(ctx.orchestrator.hand.status, "active");
});

test("规则2：最后一个连接消失 120 秒后，保留窗由驱动关闭并释放席位", () => {
  const ctx = harness();
  for (const seat of ctx.seats) {
    ctx.orchestrator.rooms.markDisconnected({ seatId: seat.seat_id, connectionId: conn(seat) });
  }

  const early = ctx.driver.tick();
  assert.deepEqual(early.released, [], "保留窗未到期不得释放");

  ctx.advance(TABLE_LIFECYCLE_V1.recoveryRetentionMs + 1);
  const done = ctx.driver.tick();
  assert.equal(done.released.length, ctx.seats.length, `应当释放全部席位，实得 ${JSON.stringify(done.released)}`);
  for (const seat of ctx.seats) {
    const state = ctx.orchestrator.rooms.seatState(seat.seat_id);
    assert.equal(state.state, "RELEASED");
    assert.equal(state.credential_revoked, true, "释放后凭据必须吊销");
  }
});

test("驱动不做判定：tick 只搬运内核的决定，顺序是结算 -> 释放 -> 开局", () => {
  const ctx = harness();
  const calls = [];
  const o = ctx.orchestrator;
  const realSettle = o.settleExpiredAction.bind(o);
  const realRelease = o.rooms.releaseExpiredSeats.bind(o.rooms);
  const realStart = o.startHandIfDue.bind(o);

  o.settleExpiredAction = () => { calls.push("settle"); return realSettle(); };
  o.rooms.releaseExpiredSeats = () => { calls.push("release"); return realRelease(); };
  o.startHandIfDue = () => { calls.push("start"); return realStart(); };

  ctx.driver.tick();
  // 尾部还会多一次 release：startHandIfDue -> evaluateStart 自己也会清一遍过期席位。
  // 这里只钉 tick 自身的三步顺序，不去钉内核的内部调用。
  assert.deepEqual(calls.slice(0, 3), ["settle", "release", "start"]);
});

test("不吞真错误：非 no_active_hand 的失败照原样抛出", () => {
  const ctx = harness();
  const failure = Object.assign(new Error("boom"), { code: "some_real_failure" });
  ctx.orchestrator.settleExpiredAction = () => { throw failure; };

  assert.throws(() => ctx.driver.tick(), (error) => error === failure);
});

test("不吞真错误：no_active_hand 被当作没什么可做，tick 继续走完后两步", () => {
  const ctx = harness();
  let released = false;
  ctx.orchestrator.settleExpiredAction = () => {
    throw Object.assign(new Error("no hand"), { code: "no_active_hand" });
  };
  const realRelease = ctx.orchestrator.rooms.releaseExpiredSeats.bind(ctx.orchestrator.rooms);
  ctx.orchestrator.rooms.releaseExpiredSeats = () => { released = true; return realRelease(); };

  const done = ctx.driver.tick();
  assert.equal(done.settled, null);
  assert.equal(released, true, "no_active_hand 之后不得跳过释放与开局");
});

test("定时器：start/stop 可重复调用，且 unref 后不持有进程", async () => {
  const ctx = harness();
  const driver = createDueWorkDriver({ orchestrator: ctx.orchestrator, intervalMs: 5 });

  assert.equal(driver.running, false);
  driver.start();
  driver.start();
  assert.equal(driver.running, true);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(driver.ticks > 1, `定时器应当反复走表，实得 ${driver.ticks}`);

  driver.stop();
  driver.stop();
  assert.equal(driver.running, false);
  const settled = driver.ticks;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(driver.ticks, settled, "stop 之后不得再走表");
});

test("定时器：tick 抛错不掀进程、不停表，错误交给 onError", async () => {
  const ctx = harness();
  const seen = [];
  const driver = createDueWorkDriver({
    orchestrator: ctx.orchestrator,
    intervalMs: 5,
    onError: (error) => seen.push(error.code),
  });
  ctx.orchestrator.settleExpiredAction = () => {
    throw Object.assign(new Error("boom"), { code: "some_real_failure" });
  };

  driver.start();
  await new Promise((resolve) => setTimeout(resolve, 40));
  driver.stop();

  assert.ok(seen.length > 1, `应当反复上报而不是停表，实得 ${seen.length} 次`);
  assert.equal(seen[0], "some_real_failure");
  assert.equal(driver.lastError.code, "some_real_failure");
});

// 这条必须用独立进程。同进程测试都会调 stop()，而 stop() 之后 unref 在不在都一样——
// 「去掉 unref」的变异在进程内是活的，只有让驱动开着看进程能否自己退出才抓得住。
test("定时器：驱动开着不停表时，进程仍然能自己退出（unref 实证）", async () => {
  const child = spawn(process.execPath, [UNREF_SCRIPT], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.stderr.on("data", (chunk) => { err += chunk; });

  const outcome = await new Promise((resolve) => {
    // 定时器每 20 毫秒一次，走三次也就百毫秒级；4 秒还没退出就是真的被持住了。
    const killer = setTimeout(() => resolve({ timedOut: true }), 4_000);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ timedOut: false, code });
    });
  });

  if (outcome.timedOut) {
    child.kill("SIGKILL");
    assert.fail(`驱动开着时进程没能自己退出，定时器持住了进程\nstdout=${out}\nstderr=${err}`);
  }
  assert.equal(outcome.code, 0, `子进程退出码应为 0\nstdout=${out}\nstderr=${err}`);
  assert.match(out, /STARTED ticks=\d+/, `驱动应当确实走过表\nstdout=${out}\nstderr=${err}`);
});

// 整条链路的实证：真实 HTTP 服务 + 真实时钟，倒计时走完后**没有任何人发请求**，
// 牌局照样开出来。前面的测试都在手动调 tick()，证不了「服务真的把表接上了」。
test("集成：真实服务里倒计时走完后，无人发请求也会开局", async (t) => {
  const service = createCommandServer({ deckFactory: deck });
  const origin = await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());
  assert.equal(service.dueWork.running, true, "start() 之后驱动就该在走表（默认开启）");

  const s = service.surface;
  const created = s.dispatch("room.create", { player_id: "p1", table_rules_version: RULES });
  s.dispatch("room.confirm_public_scope");
  const joined = s.dispatch("room.join", {
    player_id: "p2",
    invite_code: created.invite_code,
  });

  // 命令面把凭据叫 recovery_credential，且只在创建/加入的返回里出现这一次。
  const both = [
    { seat_id: created.seat.seat_id, credential: created.recovery_credential },
    { seat_id: joined.seat.seat_id, credential: joined.recovery_credential },
  ];
  for (const seat of both) {
    s.dispatch("seat.connect", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      connection_id: conn(seat),
    });
    s.dispatch("ai.set_mode", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      mode: "OFF",
    });
    s.dispatch("seat.ready", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      ready: true,
    });
  }

  assert.equal(s.dispatch("view.projection").hand, null, "此刻还不该有牌局");

  // 只等时间过去。这中间一个请求都不发——这正是本测试的全部意义。
  const deadline = Date.now() + TABLE_LIFECYCLE_V1.readyCountdownMs + 2_000;
  let started = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (service.surface.orchestrator.hand !== null) {
      started = true;
      break;
    }
  }

  assert.ok(started, "倒计时走完后驱动应当自己开局，实际一直没有牌局");
  const hand = s.dispatch("view.projection").public_hand;
  assert.equal(hand.status, "active");
  assert.equal(hand.seats.length, 2);
});

// service.stop() 必须真的停表。unref 会掩盖这个漏洞——进程照样退得掉，所以「进程能退出」
// 证不了这一条。真实代价在长驻宿主进程里：每个停掉的服务都留下一个还在改牌桌状态的定时器。
test("集成：service.stop() 之后驱动不再走表", async () => {
  const service = createCommandServer({
    deckFactory: deck,
    dueWorkIntervalMs: 10,
  });
  await service.start({ host: "127.0.0.1", port: 0 });

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(service.dueWork.ticks > 0, "停之前应当确实在走表，否则这条断言是空的");

  await service.stop();
  assert.equal(service.dueWork.running, false, "stop() 之后驱动不该还在走表");

  const frozen = service.dueWork.ticks;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(service.dueWork.ticks, frozen, "stop() 之后不得再有 tick");
});

test("集成：显式传 dueWork: false 时服务不走表", async (t) => {
  const service = createCommandServer({ deckFactory: deck, dueWork: false });
  await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());
  assert.equal(service.dueWork.running, false);
  assert.equal(service.dueWork.ticks, 0);
});

test("默认间隔对规则 1 的 3 秒倒计时与规则 2 的 120 秒保留窗都足够细", () => {
  assert.ok(DEFAULT_INTERVAL_MS > 0);
  assert.ok(
    DEFAULT_INTERVAL_MS * 4 <= TABLE_LIFECYCLE_V1.readyCountdownMs,
    "至少要能在倒计时内走表数次",
  );
  assert.ok(DEFAULT_INTERVAL_MS < TABLE_LIFECYCLE_V1.recoveryRetentionMs);
});
