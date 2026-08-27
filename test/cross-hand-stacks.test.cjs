"use strict";

// F1：筹码必须跨手存活，并且掉线恢复后回到同一席同一 stack。
//
// 缺陷形状：table-orchestrator 的 startHand() 每手都用 this.startingStack 构造所有
// 参赛席位，room-store 里根本没有 stack 字段。于是「连续多手」只是连续发牌，赢来的
// 筹码在下一手开始时消失，输掉的也一样回满——牌桌看起来在跑，实际每手都是新桌。
//
// 为什么这不是「引擎的事」：HoldemHand 只对一手牌负责，它的 assertChipConservation
// 也只守一手之内的守恒。跨手账本必须由席位持有者维护，也就是 room-store。它已经是
// 席位归属、恢复凭据与保留窗的权威，stack 属于同一类事实：跟着席位走，不跟着某一手走。
//
// 这里的断言只钉「筹码去哪了」，不重新验证德扑裁决——牌型、边池、行动顺序由
// holdem-engine.test.cjs 负责。

const assert = require("node:assert/strict");
const test = require("node:test");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");
const { RoomStore, TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

// 固定牌堆，让每一手走同一条确定路径。牌足够多手用：每手最多消耗
// 2*席数 + 5 张，这里给到 60 张，四席可连打四手不换堆。
function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d", "8c", "7d",
    "2c", "3d", "4h", "5s", "6c",
    "Ac", "Kh", "Qs", "Jd", "Th", "9c", "8d", "7h",
    "2d", "3h", "4s", "5c", "6d",
    "Ah", "Ks", "Qc", "Jh", "Td", "9h", "8s", "7c",
    "2h", "3s", "4c", "5d", "6h",
    "Ad", "Kc", "Qd", "Js", "Tc", "9s", "8h", "7s",
    "2s", "3c", "4d", "5h", "6s",
  ]);
}

function harness({ playerCount = 2, ...options } = {}) {
  let now = 1_000;
  let id = 0;
  const orchestrator = new TableOrchestrator({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
    ...options,
  });

  const created = orchestrator.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  orchestrator.confirmPublicScope();
  const seats = [created.seat];
  const credentials = [created.credential];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = orchestrator.joinRoom({
      playerId: `p${index}`,
      inviteCode: created.invite.invite_code,
    });
    seats.push(joined.seat);
    credentials.push(joined.credential);
  }
  for (const seat of seats) {
    orchestrator.rooms.markConnected({
      seatId: seat.seat_id,
      connectionId: `conn-${seat.seat_id}`,
    });
  }
  for (const seat of seats) {
    orchestrator.setSeatAiMode({ seatId: seat.seat_id, mode: "OFF" });
  }

  return {
    o: orchestrator,
    invite: created.invite,
    seats,
    seatId: (index) => seats[index].seat_id,
    credential: (index) => credentials[index],
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

function begin(ctx) {
  for (const seat of ctx.seats) {
    ctx.o.setReady({ seatId: seat.seat_id, ready: true });
  }
  ctx.o.evaluateStart();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.o.startHand();
}

// 手间展示走完再开下一手。返回 startHandIfDue 的结果，调用方自己断言 started。
function nextHand(ctx) {
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  return ctx.o.startHandIfDue();
}

function actorPlayerId(ctx) {
  const hand = ctx.o.hand;
  return hand.seats[hand.actorIndex].id;
}

// 引擎侧当前 stack，按 seatId 问。牌局进行中它已经扣掉了下注。
function engineStack(ctx, seatIndex) {
  const playerId = ctx.o.requirePlayerId(ctx.seatId(seatIndex));
  return ctx.o.hand.seatById(playerId).stack;
}

// 账本侧 stack，按 seatId 问。这是跨手权威值。
function ledgerStack(ctx, seatIndex) {
  return ctx.o.rooms.seatState(ctx.seatId(seatIndex)).stack;
}

test("F1：赢来的筹码进入下一手，不被重新发放为起始筹码", () => {
  const ctx = harness({ playerCount: 2, startingStack: 200 });
  begin(ctx);

  // 单挑：小盲=庄家先行动。让先行动者加注到 20，另一席弃牌。
  const raiser = actorPlayerId(ctx);
  ctx.o.act({ playerId: raiser, type: "raise", amount: 20 });
  const folder = actorPlayerId(ctx);
  ctx.o.act({ playerId: folder, type: "fold" });

  assert.equal(ctx.o.hand.status, "complete");
  const settled = new Map(ctx.o.hand.seats.map((seat) => [seat.id, seat.stack]));
  assert.equal(settled.get(raiser), 202, "赢家收下对手的大盲");
  assert.equal(settled.get(folder), 198);

  const started = nextHand(ctx);
  assert.equal(started.started, true);

  // 下一手开始后盲注已经贴出，所以断言「stack + 本手已投入」等于结算值。
  for (const seat of ctx.o.hand.seats) {
    assert.equal(
      seat.stack + seat.total_commitment,
      settled.get(seat.id),
      `${seat.id} 的筹码必须从上一手结算值延续，而不是回到 startingStack`,
    );
  }
});

test("F1：席位账本是跨手 stack 的权威，结算后幂等回写", () => {
  const ctx = harness({ playerCount: 2, startingStack: 200 });

  // 开局前账本就该有起始筹码：UI 在等待阶段也要显示筹码。
  assert.equal(ledgerStack(ctx, 0), 200);
  assert.equal(ledgerStack(ctx, 1), 200);

  begin(ctx);
  const raiser = actorPlayerId(ctx);
  ctx.o.act({ playerId: raiser, type: "raise", amount: 20 });
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "fold" });

  const total = ledgerStack(ctx, 0) + ledgerStack(ctx, 1);
  assert.equal(total, 400, "跨手账本同样要守恒");

  // 幂等：重复回写同一手的结算不得再改账本。
  //
  // 故意回写一组**不同**的值。用同一组值重放什么都测不出来——写两遍相同的数当然
  // 不变，那样测试会在幂等守卫被删掉后照样通过。
  const before = [ledgerStack(ctx, 0), ledgerStack(ctx, 1)];
  const replay = ctx.o.rooms.settleStacks({
    handIndex: ctx.o.rooms.handIndex,
    stacks: [
      { seatId: ctx.seatId(0), stack: 1 },
      { seatId: ctx.seatId(1), stack: 399 },
    ],
  });
  assert.equal(replay.applied, false);
  assert.equal(replay.reason, "already_settled");
  assert.deepEqual([ledgerStack(ctx, 0), ledgerStack(ctx, 1)], before, "同一手重复回写必须无效果");

  // 旧 hand_index 同样拒绝，而且必须在账本已经走到更后面的手之后测。
  //
  // 上一段的重放用的是「当前已结算手号」，那种情况 `=== handIndex` 也挡得住；只有
  // 在第二手已结算后重放第一手，才能区分「>= 挡住所有不新于已结算的手」与
  // 「=== 只挡住恰好那一手」。后者会让一次迟到的旧结算把账本拉回上一手的数字。
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const second = ctx.o.startHandIfDue();
  assert.equal(second.started, true, "第二手应当自动开始");
  assert.equal(ctx.o.rooms.handIndex, 2);
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "raise", amount: 20 });
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "fold" });
  assert.equal(ctx.o.rooms.stacksSettledForHandIndex, 2, "第二手结算后账本停在手号 2");

  const afterSecond = [ledgerStack(ctx, 0), ledgerStack(ctx, 1)];
  const stale = ctx.o.rooms.settleStacks({
    handIndex: 1,
    stacks: [
      { seatId: ctx.seatId(0), stack: 111 },
      { seatId: ctx.seatId(1), stack: 289 },
    ],
  });
  assert.equal(stale.applied, false, "第一手的迟到结算不得再写账本");
  assert.equal(stale.reason, "already_settled");
  assert.equal(stale.settled_hand_index, 2);
  assert.deepEqual(
    [ledgerStack(ctx, 0), ledgerStack(ctx, 1)],
    afterSecond,
    "旧手号的重放不得把账本拉回去",
  );
});

test("F1：all-in 与边池结算后的 stack 跨手延续", () => {
  const ctx = harness({ playerCount: 3, startingStack: 200 });
  begin(ctx);

  // 三席全部 all-in，走到摊牌。谁赢由固定牌堆决定，这里不预言赢家，
  // 只要求「结算后的三个 stack 原样进入下一手」。
  for (let guard = 0; guard < 6 && ctx.o.hand.status !== "complete"; guard += 1) {
    ctx.o.act({ playerId: actorPlayerId(ctx), type: "all_in" });
  }
  assert.equal(ctx.o.hand.status, "complete");

  const settled = new Map(ctx.o.hand.seats.map((seat) => [seat.id, seat.stack]));
  assert.equal([...settled.values()].reduce((sum, value) => sum + value, 0), 600);
  // 至少有一席被淘汰，否则这条测试没覆盖到 all-in 的极端情形。
  assert.ok([...settled.values()].some((value) => value === 0), "全员 all-in 必然有人归零");

  for (const [index, seat] of ctx.seats.entries()) {
    assert.equal(
      ledgerStack(ctx, index),
      settled.get(ctx.o.requirePlayerId(seat.seat_id)),
      "账本必须逐席记下结算值，包括归零的那一席",
    );
  }
});

test("F1：筹码归零的席位进入 sit out，不带着 0 筹码被塞进下一手", () => {
  const ctx = harness({ playerCount: 3, startingStack: 200 });
  begin(ctx);
  for (let guard = 0; guard < 6 && ctx.o.hand.status !== "complete"; guard += 1) {
    ctx.o.act({ playerId: actorPlayerId(ctx), type: "all_in" });
  }
  assert.equal(ctx.o.hand.status, "complete");

  const busted = ctx.seats.filter((seat, index) => ledgerStack(ctx, index) === 0);
  assert.ok(busted.length > 0);
  for (const seat of busted) {
    const state = ctx.o.rooms.seatState(seat.seat_id);
    assert.equal(state.state, "SIT_OUT", "0 筹码不能留在可参与集合里");
    assert.equal(state.stack, 0, "sit out 不清空账本，玩家仍看得到自己归零了");
  }

  const survivors = ctx.seats.filter((seat, index) => ledgerStack(ctx, index) > 0);
  if (survivors.length >= TABLE_LIFECYCLE_V1.minParticipants) {
    const started = nextHand(ctx);
    assert.equal(started.started, true);
    assert.equal(
      started.roster.length,
      survivors.length,
      "下一手名单只含有筹码的席位",
    );
    for (const seat of ctx.o.hand.seats) {
      assert.ok(seat.starting_stack > 0);
    }
  } else {
    assert.equal(nextHand(ctx).started, false, "剩不下两席就不开下一手");
  }
});

test("F1：破产席位重新 Ready 也进不了下一手名单", () => {
  // 这条走的是 handSettled 之外的另一条路。破产处置在 handSettled 里把席位切成
  // SIT_OUT，但 SIT_OUT 不是终态——玩家随后完全可以再点一次 Ready，UI 上那个按钮就在
  // 那儿，而 READY 是可参与状态。若名单只看状态不看筹码，这一席会带着 0 筹码进 roster，
  // 引擎构造席位时抛 invalid_starting_stack，一个「你没筹码了」变成一次开手失败。
  //
  // 四人局，只淘汰一家：留下三席有筹码，所以门禁应当放行，破产席必须被剔除。
  // 这是「名单过滤生效」与「牌桌照常继续」同时成立的那个场景。
  const ctx = harness({ playerCount: 4, startingStack: 200 });
  begin(ctx);
  // 前两位行动者全下，其余弃牌。
  for (let guard = 0; guard < 8 && ctx.o.hand.status !== "complete"; guard += 1) {
    ctx.o.act({ playerId: actorPlayerId(ctx), type: guard < 2 ? "all_in" : "fold" });
  }
  assert.equal(ctx.o.hand.status, "complete");

  const busted = ctx.seats.filter((seat, index) => ledgerStack(ctx, index) === 0);
  assert.equal(busted.length, 1, "这一手应当只淘汰一家");
  const bustedSeatId = busted[0].seat_id;
  assert.equal(
    ctx.o.rooms.seatState(bustedSeatId).state,
    "SIT_OUT",
    "handSettled 应当先把破产席切成 SIT_OUT",
  );

  ctx.o.setReady({ seatId: bustedSeatId, ready: true });
  assert.equal(ctx.o.rooms.seatState(bustedSeatId).state, "READY", "Ready 按钮确实点得动");

  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const decision = ctx.o.rooms.evaluateStart();
  assert.equal(decision.can_start, true, "还有三席有筹码，牌桌不该停");
  assert.equal(decision.participable_count, 4, "破产席仍是 READY，仍算可参与");
  assert.equal(decision.roster_count, 3, "但发牌名单只有三席");
  assert.ok(
    !decision.roster.includes(bustedSeatId),
    "0 筹码的席位不得进入名单，哪怕它已经 READY",
  );

  const started = ctx.o.startHandIfDue();
  assert.equal(started.started, true);
  assert.equal(ctx.o.hand.seats.length, 3);
  for (const seat of ctx.o.hand.seats) {
    assert.ok(seat.starting_stack > 0, "进入牌局的每一席都必须有筹码");
  }
});

test("F1：有筹码的席位不足两名时门禁按名单拒绝，不承诺开不出的手", () => {
  // 与上一条同源但结局相反：三人全下，赢家独取全部筹码，另两家归零。
  // 两名破产玩家都重新 Ready 后，participable 是 3，名单只有 1。
  // 门禁若数 participable 就会放行，而引擎拿到 1 席 roster 抛 invalid_seat_count（500）,
  // 整桌卡死在一个本该显示「等待有筹码的玩家」的状态上。
  const ctx = harness({ playerCount: 3, startingStack: 200 });
  begin(ctx);
  for (let guard = 0; guard < 6 && ctx.o.hand.status !== "complete"; guard += 1) {
    ctx.o.act({ playerId: actorPlayerId(ctx), type: "all_in" });
  }
  assert.equal(ctx.o.hand.status, "complete");

  const funded = ctx.seats.filter((seat, index) => ledgerStack(ctx, index) > 0);
  assert.equal(funded.length, 1, "三人全下应当只剩一家有筹码");
  for (const [index, seat] of ctx.seats.entries()) {
    if (ledgerStack(ctx, index) === 0) {
      ctx.o.setReady({ seatId: seat.seat_id, ready: true });
    }
  }

  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const decision = ctx.o.rooms.evaluateStart();
  assert.equal(decision.can_start, false);
  assert.equal(decision.reason, "insufficient_participants");
  assert.equal(decision.participable_count, 3, "三席都是 READY 或 ACTIVE");
  assert.equal(decision.roster_count, 1, "但只有一席发得出牌");
  assert.equal(decision.min_participants, TABLE_LIFECYCLE_V1.minParticipants);
  // ready_count 也必须按名单数，哪怕这里数出 0 看着反直觉：两名破产玩家确实是 READY，
  // 但他们发不出牌。ready_count 是首手门禁的计数器，若它把发不了牌的席位算进去，
  // 首手就会重新出现「门禁放行、名单不足」的同一个分叉。
  assert.equal(decision.ready_count, 0, "READY 但无筹码的席位不计入门禁计数");

  // 门禁拒绝就必须真的拒绝：由于没有筹码来源，这一桌到此为止而不是抛 500。
  assert.throws(() => ctx.o.rooms.startHand(), probe("hand_start_blocked"));
  const due = ctx.o.startHandIfDue();
  assert.equal(due.started, false);
  assert.equal(due.decision.reason, "insufficient_participants");
});

test("F1：掉线恢复回到同一席同一 stack，恢复本身不改筹码", () => {
  const ctx = harness({ playerCount: 2, startingStack: 200 });
  begin(ctx);
  const raiser = actorPlayerId(ctx);
  ctx.o.act({ playerId: raiser, type: "raise", amount: 20 });
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "fold" });

  const seatId = ctx.seatId(1);
  const before = ctx.o.rooms.seatState(seatId).stack;
  assert.equal(before, 198);

  ctx.o.rooms.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  ctx.advance(1_000);
  const recovered = ctx.o.rooms.recoverSeat({
    seatId,
    recoveryCredential: ctx.credential(1),
  });
  assert.equal(recovered.seat_id, seatId, "必须回到原席");
  assert.equal(recovered.stack, before, "恢复不得重置筹码");
  assert.equal(ctx.o.rooms.seatState(seatId).stack, before);
});

test("F1：席位释放时筹码离桌并记在事件里，不静默消失", () => {
  const ctx = harness({ playerCount: 2, startingStack: 200 });
  begin(ctx);
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "raise", amount: 20 });
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "fold" });

  const seatId = ctx.seatId(1);
  const stack = ctx.o.rooms.seatState(seatId).stack;
  ctx.o.rooms.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  ctx.advance(TABLE_LIFECYCLE_V1.recoveryRetentionMs + 1);
  ctx.o.rooms.releaseExpiredSeats();

  const released = ctx.o.rooms.events.filter((event) => event.type === "SEAT_RELEASED");
  assert.equal(released.length, 1);
  assert.equal(
    released[0].payload.forfeited_stack,
    stack,
    "释放席位必须显式记下带走多少筹码，否则跨手守恒无法复核",
  );
  assert.equal(ctx.o.rooms.seatState(seatId).stack, 0, "离桌后席位不再持有筹码");
});

test("F1：本手内离桌，带走的是结算后的筹码而不是开手前的", () => {
  // 这条钉的是 HAND_COMPLETED 分支里两句话的顺序：settleStacks() 必须在
  // rooms.handSettled() 之前。handSettled 会释放 leave_requested 的席位，而 releaseSeat
  // 捕获 seat.stack 后立刻清零。顺序反过来会同时坏两件事：
  //   1. SEAT_RELEASED.forfeited_stack 记的是开手前的旧值，这一手的输赢被丢掉；
  //   2. 随后的回写把结算值写到一个已 RELEASED 的席位上，离桌者又持有了筹码。
  // 上面那条释放测试走的是保留窗过期，不经过 handSettled，所以覆盖不到这个顺序。
  const ctx = harness({ playerCount: 2, startingStack: 200 });
  begin(ctx);

  const leaverIndex = 1;
  const leaverSeatId = ctx.seatId(leaverIndex);
  const stackBeforeHand = ledgerStack(ctx, leaverIndex);
  assert.equal(stackBeforeHand, 200, "开手前账本还是起始筹码");

  // 让离桌者在这一手确实亏掉一些：先由对手加注，离桌的强制弃牌会丢掉已投入的盲注。
  const raiser = actorPlayerId(ctx);
  assert.notEqual(raiser, ctx.o.requirePlayerId(leaverSeatId), "加注的应当是另一席");
  ctx.o.act({ playerId: raiser, type: "raise", amount: 20 });

  // 走真实入口：room-store 只记下 pending_fold，引擎侧由 applyPendingFold 在轮到该席时补上。
  ctx.o.rooms.leaveTable({ seatId: leaverSeatId });
  assert.equal(ctx.o.hand.status, "active", "离桌本身不结束牌局");
  ctx.o.applyPendingFold(leaverSeatId);
  assert.equal(ctx.o.hand.status, "complete", "两人局里强制弃牌应当结束这一手");

  const released = ctx.o.rooms.events.filter((event) => event.type === "SEAT_RELEASED");
  assert.equal(released.length, 1);
  const forfeited = released[0].payload.forfeited_stack;
  assert.ok(
    forfeited < stackBeforeHand,
    `带走的筹码必须是结算后的值，实得 ${forfeited}，开手前是 ${stackBeforeHand}`,
  );
  assert.equal(ctx.o.rooms.seatState(leaverSeatId).stack, 0, "释放后席位不得再持有筹码");

  // 全桌守恒：离桌者带走的 + 留下者手上的 = 两份起始筹码。
  assert.equal(forfeited + ledgerStack(ctx, 0), 400, "跨手守恒必须仍然成立");
});

test("F1：账本没给出某席筹码时开手失败，不回退到起始值", () => {
  // rosterStack 是引擎席位 stack 的唯一取值点。正常路径上它取不到 undefined——
  // startHand 用同一个循环同时产出 roster 和 stacks，两者必然同席。所以这条守卫走不到，
  // 只能直接测它本身。
  //
  // 为什么不能删掉它、也不能让它回退到 this.startingStack：回退就是第二个筹码来源，
  // 而「每手从固定值取起始筹码」正是 F1 的缺陷本体。一处静默回退会让筹码在某个尚未
  // 想到的路径上凭空复原，而那时账本与引擎已经分叉，症状离原因很远。
  const ctx = harness({ playerCount: 2, startingStack: 200 });
  const seatId = ctx.seatId(0);
  const stacks = [{ seat_id: ctx.seatId(1), player_id: "p2", stack: 200 }];

  assert.equal(ctx.o.rosterStack(stacks, ctx.seatId(1)), 200, "在册的席位照常取到筹码");
  for (const missing of [stacks, [], undefined, null]) {
    assert.throws(
      () => ctx.o.rosterStack(missing, seatId),
      probe("seat_stack_missing"),
      `账本未列出该席时必须失败，实参 ${JSON.stringify(missing)}`,
    );
  }
});

test("F1：起始筹码在建桌时就校验，不把坏值留到第一手才炸", () => {
  // startingStack 是构造参数，坏值不校验就会一路带到引擎的 positiveInteger，
  // 变成第一手开局时的 500，而真正的错误位置是建桌那一刻。
  const base = { now: () => 1_000, idFactory: () => "id", tokenFactory: () => "tok" };
  for (const bad of [0, -1, -200, 1.5, Number.NaN, "200", null, true]) {
    assert.throws(
      () => new RoomStore({ ...base, startingStack: bad }),
      probe("invalid_field"),
      `startingStack=${String(bad)} 必须在建桌时就被拒绝`,
    );
  }
  // undefined 走默认值，不算坏值。
  const ok = new RoomStore({ ...base, startingStack: undefined });
  assert.equal(ok.startingStack, 200, "省略时用默认起始筹码");
  assert.equal(new RoomStore({ ...base, startingStack: 1 }).startingStack, 1, "1 是合法下界");
});

test("F1：账本 stack 校验输入，不接受负数、非整数或未知席位", () => {
  let now = 1_000;
  let id = 0;
  const rooms = new RoomStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    startingStack: 200,
  });
  const created = rooms.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });

  for (const bad of [-1, 1.5, Number.NaN, "200", null, undefined]) {
    assert.throws(
      () => rooms.settleStacks({
        handIndex: 1,
        stacks: [{ seatId: created.seat.seat_id, stack: bad }],
      }),
      probe("invalid_field"),
      `stack=${String(bad)} 必须被拒绝`,
    );
  }
  assert.throws(
    () => rooms.settleStacks({ handIndex: 1, stacks: [{ seatId: "seat-nope", stack: 10 }] }),
    probe("seat_not_found"),
  );
  for (const bad of [0, -1, 1.5, "1", null]) {
    assert.throws(
      () => rooms.settleStacks({ handIndex: bad, stacks: [] }),
      probe("invalid_field"),
      `handIndex=${String(bad)} 必须被拒绝`,
    );
  }
  assert.throws(
    () => rooms.settleStacks({ handIndex: 1, stacks: "nope" }),
    probe("invalid_field"),
  );
  // 校验失败必须一个字节都没落下：半套写入的账本比拒绝更难查。
  assert.equal(rooms.seatState(created.seat.seat_id).stack, 200);
  assert.equal(rooms.stacksSettledForHandIndex, 0);
});

test("F1：起始筹码由房间账本一次发放，orchestrator 不再每手重发", () => {
  const ctx = harness({ playerCount: 2, startingStack: 150 });
  assert.equal(ledgerStack(ctx, 0), 150);
  begin(ctx);
  // 引擎侧的 starting_stack 必须来自账本，而不是 orchestrator 的构造参数直传。
  for (const seat of ctx.o.hand.seats) {
    assert.equal(seat.starting_stack, 150);
  }
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "raise", amount: 20 });
  ctx.o.act({ playerId: actorPlayerId(ctx), type: "fold" });

  const started = nextHand(ctx);
  assert.equal(started.started, true);
  const stacks = ctx.o.hand.seats.map((seat) => seat.starting_stack).sort((a, b) => a - b);
  assert.deepEqual(stacks, [148, 152], "第二手的起始筹码就是上一手的结算值");
});

test("F1：engineStack 与账本在手内一致——手内不回写，结算才回写", () => {
  const ctx = harness({ playerCount: 2, startingStack: 200 });
  begin(ctx);
  assert.equal(ledgerStack(ctx, 0), 200, "开手贴盲注不改账本");
  assert.equal(ledgerStack(ctx, 1), 200);
  assert.ok(engineStack(ctx, 0) < 200 || engineStack(ctx, 1) < 200, "引擎侧已扣盲注");

  ctx.o.act({ playerId: actorPlayerId(ctx), type: "raise", amount: 20 });
  assert.equal(ledgerStack(ctx, 0) + ledgerStack(ctx, 1), 400, "手内账本不动");

  ctx.o.act({ playerId: actorPlayerId(ctx), type: "fold" });
  assert.equal(ledgerStack(ctx, 0) + ledgerStack(ctx, 1), 400);
  assert.ok(
    ledgerStack(ctx, 0) !== 200 || ledgerStack(ctx, 1) !== 200,
    "结算后账本必须已经变化",
  );
});
