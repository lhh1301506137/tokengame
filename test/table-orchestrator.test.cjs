"use strict";

// 编排层回归：验证两个内核咬合后的行为，不重复验证内核自身的规则。
// 关注点只有三个：事件词表翻译是否唯一且正确、handIndex 是否同步推进、
// 桌面合同的围栏是否真的落到 AI 合同的 OFF 上。
// 全部用受控假时钟、假 ID 与堆叠牌堆，不依赖真实时间、随机数或任何宿主。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  TableOrchestrator,
  ENGINE_TO_WHITELIST,
  ACTION_TO_WHITELIST,
} = require("../src/authority/table-orchestrator.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { LIVELY_V1, WHITELIST_SOURCE_EVENTS } = require("../src/authority/seat-ai-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { actionBinding, chatBinding } = require("../test-support/action-binding.cjs");
const { confirmAllSeats } = require("../test-support/public-scope.cjs");

const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

// 固定牌堆：让所有牌局走同一条确定路径，断言才能锁到具体事件序列上。
function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

function harness({ playerCount = 3, ...options } = {}) {
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
  const seats = [created.seat];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = orchestrator.joinRoom({
      playerId: `p${index}`,
      inviteCode: created.invite.invite_code,
    });
    seats.push(joined.seat);
  }
  // F3：确认按席位记账，所以必须逐席确认，且只能在席位存在之后。
  confirmAllSeats(orchestrator, seats.map((seat) => seat.seat_id));
  for (const seat of seats) {
    orchestrator.rooms.markConnected({
      seatId: seat.seat_id,
      connectionId: `conn-${seat.seat_id}`,
    });
  }

  return {
    o: orchestrator,
    room: created.room,
    invite: created.invite,
    seats,
    seatId: (index) => seats[index].seat_id,
    // F2：官方动作要带 hand_id + expected_revision + idempotency_key。按当前状态自动形成，
    // 本文件测的是事件翻译不是幂等门。要测无牌局路径的地方仍直调 o.act，
    // 因为这个助手自己要先 requireHand()。
    act(input) {
      return orchestrator.act({ ...input, ...actionBinding(orchestrator) });
    },
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

// 把牌桌推到首手已开始，返回 startHand 的结果。
function begin(ctx, seatIndexes = [0, 1, 2]) {
  for (const index of seatIndexes) {
    ctx.o.setReady({ seatId: ctx.seatId(index), ready: true });
  }
  ctx.o.evaluateStart();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.o.startHand();
}

// 席位 AI 全部切 OFF：只想验证牌局与房间联动时，用它把 AI 噪声清掉。
function silenceAll(ctx) {
  for (const seat of ctx.seats) {
    ctx.o.setSeatAiMode({ seatId: seat.seat_id, mode: "OFF" });
  }
}

function aiEventTypes(ctx) {
  return ctx.o.ai.events.map((event) => event.type);
}

function roomEventTypes(ctx) {
  return ctx.o.rooms.events.map((event) => event.type);
}

// 当前该谁行动。引擎按 playerId 索引，测试里统一换成 seatId 说话。
function actor(ctx) {
  const hand = ctx.o.hand;
  const seat = hand.seats[hand.actorIndex];
  return { playerId: seat.id, seatId: ctx.o.playerToSeat.get(seat.id) };
}

test("编排：两个内核共享同一时间源与 ID 源，房间创建后才允许确认默认公开", () => {
  const ctx = harness();
  assert.equal(ctx.o.rooms.now, ctx.o.ai.now);
  assert.equal(ctx.o.rooms.idFactory, ctx.o.ai.idFactory);

  // F3：确认按席位查，所以要指名是哪一席。
  const confirmation = ctx.o.requireConfirmedScope({ seatId: ctx.seatId(0) });
  assert.equal(confirmation.seat_id, ctx.seatId(0));
  assert.equal(confirmation.room_binding_id, ctx.room.room_binding_id);
  assert.equal(confirmation.table_rules_version, RULES);
  assert.equal(confirmation.limits_version, LIVELY_V1.version);
});

test("编排：未创建房间时确认默认公开被拒绝，不产生任何 AI 事件", () => {
  const o = new TableOrchestrator({ now: () => 1_000, idFactory: () => "id-1" });
  assert.throws(() => o.confirmPublicScope(), probe("room_not_found"));
  assert.deepEqual(o.ai.events, []);
});

test("编排：入座即镜像注册席位 AI，默认 ON，且不重复注册", () => {
  const ctx = harness({ playerCount: 3 });
  assert.deepEqual([...ctx.o.ai.seats.keys()], ctx.seats.map((seat) => seat.seat_id));
  for (const seat of ctx.seats) {
    assert.equal(ctx.o.ai.seats.get(seat.seat_id).mode, "ON");
    assert.equal(ctx.o.ai.seats.get(seat.seat_id).player_id, seat.player_id);
  }
  const registered = aiEventTypes(ctx).filter((type) => type === "SEAT_AI_REGISTERED");
  assert.equal(registered.length, 3);

  // 重复触发绑定不得再注册一次（恢复连接会重放 SEAT_RECOVERED）。
  ctx.o.bindSeat(ctx.seatId(0), "p1");
  assert.equal(
    aiEventTypes(ctx).filter((type) => type === "SEAT_AI_REGISTERED").length,
    3,
  );
});

test("编排：席位与玩家的双向映射一致，未知一侧确定性拒绝", () => {
  const ctx = harness({ playerCount: 2 });
  assert.equal(ctx.o.requireSeatId("p1"), ctx.seatId(0));
  assert.equal(ctx.o.requirePlayerId(ctx.seatId(1)), "p2");
  assert.throws(() => ctx.o.requireSeatId("nobody"), probe("seat_not_found"));
  assert.throws(() => ctx.o.requirePlayerId("seat-nope"), probe("seat_not_found"));
});

test("编排：开局门禁不被绕过，evaluateStart 说不开就建不出牌局", () => {
  const ctx = harness();
  const decision = ctx.o.startHandIfDue();
  assert.equal(decision.started, false);
  assert.equal(decision.decision.can_start, false);
  assert.equal(decision.decision.reason, "awaiting_ready");
  assert.equal(ctx.o.hand, null);
  assert.ok(!roomEventTypes(ctx).includes("HAND_STARTED"));
});

test("编排：两席 Ready 并走完倒计时后 startHandIfDue 真的开局", () => {
  const ctx = harness();
  ctx.o.setReady({ seatId: ctx.seatId(0), ready: true });
  ctx.o.setReady({ seatId: ctx.seatId(1), ready: true });
  ctx.o.evaluateStart();
  assert.equal(ctx.o.startHandIfDue().started, false, "倒计时未满不得开局");

  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  const started = ctx.o.startHandIfDue();
  assert.equal(started.started, true);
  assert.equal(started.roster.length, 2);
  assert.equal(ctx.o.hand.status, "active");
});

test("编排：开局时两个内核的 handIndex 同步推进", () => {
  const ctx = harness();
  assert.equal(ctx.o.rooms.handIndex, 0);
  assert.equal(ctx.o.ai.handIndex, 0);

  begin(ctx);
  assert.equal(ctx.o.rooms.handIndex, 1);
  assert.equal(ctx.o.ai.handIndex, 1);
  assert.equal(ctx.o.ai.street, "preflop");
});

test("编排：牌局进行中不得重复开局", () => {
  const ctx = harness();
  begin(ctx);
  assert.throws(() => ctx.o.startHand(), probe("hand_already_active"));
});

test("翻译表：只有三条引擎事件与三种动作进白名单，且目标全在内核白名单内", () => {
  assert.deepEqual(ENGINE_TO_WHITELIST, {
    ACTION_REQUIRED: "SEAT_ACTION_WINDOW_OPENED",
    STREET_DEALT: "STREET_ADVANCED",
    HAND_COMPLETED: "HAND_SETTLED",
  });
  assert.deepEqual(ACTION_TO_WHITELIST, { bet: "BET", raise: "RAISE", all_in: "ALL_IN" });

  for (const target of Object.values(ENGINE_TO_WHITELIST)) {
    assert.ok(WHITELIST_SOURCE_EVENTS.includes(target), `${target} 必须在内核白名单内`);
  }
  for (const target of Object.values(ACTION_TO_WHITELIST)) {
    assert.ok(WHITELIST_SOURCE_EVENTS.includes(target), `${target} 必须在内核白名单内`);
  }
});

test("隐私：底牌从不经翻译进入 AI 上下文，无争议结束时也不泄露", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx, [0, 1]);

  // 打完一整手（一方弃牌，走 all_others_folded 路径）。
  ctx.act({ playerId: actor(ctx).playerId, type: "fold" });
  assert.equal(ctx.o.hand.finishReason, "all_others_folded");

  // 所有进过 AI 上下文的 payload：既包括交出去的意图，也包括内核记下的。
  const contexts = ctx.o.pendingIntents.map((intent) => intent.context);
  assert.ok(contexts.length > 0, "本手必然产生过上下文");
  const serialized = JSON.stringify(contexts);
  assert.ok(!serialized.includes("hole_cards"), "上下文不得出现 hole_cards 字段");
  assert.ok(!serialized.includes("revealed_hands"), "无争议结束不得出现 revealed_hands");

  // 规则 4：未自愿亮牌时，结算 payload 明确标注未亮牌。
  const settled = contexts.filter((c) => c.source_event_type === "HAND_SETTLED");
  for (const context of settled) {
    assert.equal(context.payload.cards_revealed, false);
  }
});

test("隐私：发牌事件不在白名单内，永不唤醒任何席位 AI", () => {
  // 白名单是唯一入口。这条断言存在的意义是：谁把发牌事件加进白名单，这里立刻红。
  assert.equal(ENGINE_TO_WHITELIST.HOLE_CARDS_DEALT, undefined);
  assert.equal(ENGINE_TO_WHITELIST.BLIND_POSTED, undefined);
  for (const target of Object.values(ENGINE_TO_WHITELIST)) {
    assert.notEqual(target, "HOLE_CARDS_DEALT");
  }
});

test("翻译：check / call / fold 不唤醒任何席位 AI", () => {
  const ctx = harness();
  begin(ctx);
  ctx.o.takeIntents();

  const who = actor(ctx);
  const { intents } = ctx.act({ playerId: who.playerId, type: "call" });
  const fromCall = intents.filter(
    (intent) => intent.context.source_event_type === "BET"
      || intent.context.source_event_type === "RAISE"
      || intent.context.source_event_type === "ALL_IN",
  );
  assert.deepEqual(fromCall, [], "call 本身不得翻译成任何白名单事件");
});

test("翻译：加注翻译成 RAISE 并唤醒其余在座 AI", () => {
  const ctx = harness();
  begin(ctx);
  ctx.o.takeIntents();

  const who = actor(ctx);
  const { intents } = ctx.act({ playerId: who.playerId, type: "raise", amount: 6 });
  const raiseIntents = intents.filter(
    (intent) => intent.context.source_event_type === "RAISE",
  );
  assert.ok(raiseIntents.length > 0, "加注必须产生 RAISE 唤醒");
  for (const intent of raiseIntents) {
    assert.equal(intent.accepted, true);
    assert.equal(intent.context.hand_index, 1);
    assert.equal(intent.context.street, "preflop");
  }
});

test("翻译：行动窗口事件带上主体 seat_id，AI 能分辨轮到谁", () => {
  const ctx = harness();
  begin(ctx);

  const windows = ctx.o.ai.events
    .filter((event) => event.type === "SEAT_AI_EVALUATION_STARTED")
    .length;
  const intents = ctx.o.takeIntents();
  const windowIntents = intents.filter(
    (intent) => intent.context.source_event_type === "SEAT_ACTION_WINDOW_OPENED",
  );
  assert.ok(windowIntents.length > 0, "开局必然打开一个行动窗口");
  for (const intent of windowIntents) {
    assert.equal(typeof intent.context.payload.seat_id, "string");
    assert.ok(
      ctx.seats.some((seat) => seat.seat_id === intent.context.payload.seat_id),
      "窗口主体必须是真实席位",
    );
  }
  assert.equal(windows, 0, "编排层不得自行启动模型回合");
});

test("翻译：街推进走 advanceStreet，seat-ai-store 的 street 随之前进", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx, [0, 1]);
  assert.equal(ctx.o.ai.street, "preflop");

  // 两人局：小盲补齐、大盲过牌，翻牌圈到来。
  ctx.act({ playerId: actor(ctx).playerId, type: "call" });
  ctx.act({ playerId: actor(ctx).playerId, type: "check" });

  assert.equal(ctx.o.ai.street, "flop");
  assert.ok(aiEventTypes(ctx).includes("STREET_ADVANCED"));
});

test("翻译：牌局结束触发房间结算与 HAND_SETTLED 唤醒，两侧只记一次", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx, [0, 1]);
  ctx.act({ playerId: actor(ctx).playerId, type: "fold" });

  assert.equal(ctx.o.hand.status, "complete");
  assert.equal(
    roomEventTypes(ctx).filter((type) => type === "HAND_SETTLED").length,
    1,
    "房间结算只能记一次",
  );
  assert.equal(ctx.o.rooms.handActive, false);
});

test("翻译：同一引擎事件不会被翻译两次（drainEvents 已清空）", () => {
  const ctx = harness();
  begin(ctx);
  const first = ctx.o.drainEngine();
  assert.deepEqual(first, [], "开局时已排空，再次排空必须为空");
});

test("编排：只把 accepted 的意图交给宿主，被合并与冷却的留在内核记账", () => {
  const ctx = harness();
  begin(ctx);
  const intents = ctx.o.takeIntents();
  for (const intent of intents) {
    assert.equal(intent.accepted, true);
    assert.ok(intent.context !== undefined);
  }

  // 立刻再来一个白名单事件：冷却未满，内核应记为 cooldown 而不交给宿主。
  const who = actor(ctx);
  const { intents: second } = ctx.act({ playerId: who.playerId, type: "raise", amount: 6 });
  const stillActive = second.filter((intent) => intent.accepted !== true);
  assert.deepEqual(stillActive, [], "非 accepted 的意图不得外泄给宿主");
});

test("编排：takeIntents 取走后清空，不会让宿主重复执行同一意图", () => {
  const ctx = harness();
  begin(ctx);
  const first = ctx.o.takeIntents();
  assert.ok(first.length > 0);
  assert.deepEqual(ctx.o.takeIntents(), []);
});

test("规则3（桌面）：离桌围栏立即把该席 AI 切 OFF，停止唤醒", () => {
  const ctx = harness();
  begin(ctx);
  const seatId = ctx.seatId(2);
  assert.equal(ctx.o.ai.seats.get(seatId).mode, "ON");

  ctx.o.rooms.leaveTable({ seatId });
  assert.equal(ctx.o.ai.seats.get(seatId).mode, "OFF", "围栏必须落到 AI 的 OFF 上");
  assert.ok(roomEventTypes(ctx).includes("SEAT_PRIVACY_FENCED"));

  // 后续白名单事件不得再为该席产生意图。
  ctx.o.takeIntents();
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  const { intents } = ctx.act({ playerId: actor(ctx).playerId, type: "raise", amount: 6 });
  assert.deepEqual(
    intents.filter((intent) => intent.seat_id === seatId),
    [],
    "已围栏席位不得再被唤醒",
  );
});

test("规则3（桌面）：席位释放后 AI 切 OFF 且映射解绑", () => {
  const ctx = harness();
  silenceAll(ctx);
  const seatId = ctx.seatId(2);
  const playerId = ctx.o.requirePlayerId(seatId);

  ctx.o.rooms.leaveTable({ seatId });
  assert.equal(ctx.o.rooms.seatState(seatId).state, "RELEASED", "未开局时立即释放");
  assert.equal(ctx.o.seatToPlayer.has(seatId), false);
  assert.equal(ctx.o.playerToSeat.has(playerId), false);
  assert.equal(ctx.o.ai.seats.get(seatId).mode, "OFF");
});

test("规则3（桌面）：牌内离桌的强制弃牌延迟到该席行动时落地，恰好一次", () => {
  const ctx = harness();
  silenceAll(ctx);
  begin(ctx);
  const seatId = ctx.seatId(2);
  const playerId = ctx.o.requirePlayerId(seatId);

  ctx.o.rooms.leaveTable({ seatId });
  // 合同要求的「记一次」在围栏时就落地，与引擎轮次无关。
  assert.equal(ctx.o.rooms.seatState(seatId).pending_fold, true);
  assert.equal(ctx.o.isCurrentActor(playerId), false, "离桌时还没轮到该席");

  const deferred = ctx.o.applyPendingFold(seatId);
  assert.equal(deferred.deferred, true, "未轮到时只能延迟，不得硬打给引擎");
  assert.equal(ctx.o.hand.seatById(playerId).folded, false);

  // 让前面的席位依次行动，轮到离桌席位时弃牌必须自动落地。
  let guard = 0;
  while (ctx.o.hand.status === "active" && !ctx.o.hand.seatById(playerId).folded && guard < 6) {
    const who = actor(ctx);
    if (who.playerId === playerId) {
      break;
    }
    const legal = ctx.o.hand.legalActions(who.playerId).map((entry) => entry.type);
    ctx.act({ playerId: who.playerId, type: legal.includes("call") ? "call" : "check" });
    guard += 1;
  }

  assert.equal(ctx.o.hand.seatById(playerId).folded, true, "轮到时必须自动弃牌");
  assert.equal(ctx.o.rooms.seatState(seatId).pending_fold, false, "待办已消费");
  assert.equal(
    ctx.o.rooms.events.filter((event) => event.type === "SEAT_FORCED_FOLD").length,
    1,
    "强制弃牌只记一次",
  );
  assert.equal(ctx.o.applyPendingFold(seatId), null, "重复调用不得再记");
});

test("规则3（桌面）：轮到离桌席位时无需宿主介入，drainEngine 自动补弃牌", () => {
  const ctx = harness({ playerCount: 2 });
  silenceAll(ctx);
  begin(ctx, [0, 1]);

  // 两人局：让非当前行动者离桌，然后当前行动者行动，轮次立刻转到离桌席位。
  const current = actor(ctx);
  const otherSeat = ctx.seats.find((seat) => seat.seat_id !== current.seatId).seat_id;
  const otherPlayer = ctx.o.requirePlayerId(otherSeat);
  ctx.o.rooms.leaveTable({ seatId: otherSeat });

  ctx.act({ playerId: current.playerId, type: "call" });
  assert.equal(ctx.o.hand.seatById(otherPlayer).folded, true, "无需宿主调用即自动落地");
  assert.equal(ctx.o.hand.status, "complete", "只剩一人，本手结束");
});

test("规则3（桌面）：全下席位离桌不弃牌，改为等待结算", () => {
  const ctx = harness({ playerCount: 2 });
  silenceAll(ctx);
  begin(ctx, [0, 1]);

  const who = actor(ctx);
  ctx.act({ playerId: who.playerId, type: "all_in" });
  const seatId = who.seatId;
  assert.equal(ctx.o.rooms.seatState(seatId).all_in, true, "all-in 必须回填给房间");

  ctx.o.rooms.leaveTable({ seatId });
  const fenced = ctx.o.rooms.events.filter((e) => e.type === "SEAT_PRIVACY_FENCED").pop();
  assert.equal(fenced.payload.pending_fold, false);
  assert.equal(fenced.payload.settles_all_in, true);
});

test("编排：本手已结束时未落地的强制弃牌只消费记账，不再动引擎", () => {
  const ctx = harness({ playerCount: 2 });
  silenceAll(ctx);
  begin(ctx, [0, 1]);

  // 让「非当前行动者」离桌，再由当前行动者弃牌结束本手：离桌席位的轮次永远没到。
  const current = actor(ctx);
  const leaverSeat = ctx.seats.find((seat) => seat.seat_id !== current.seatId).seat_id;
  ctx.o.rooms.leaveTable({ seatId: leaverSeat });
  assert.equal(ctx.o.rooms.seatState(leaverSeat).pending_fold, true);

  ctx.act({ playerId: current.playerId, type: "fold" });
  assert.equal(ctx.o.hand.status, "complete");
  // 规则 3：结算时离桌席位被释放，凭据吊销。
  assert.equal(ctx.o.rooms.seatState(leaverSeat).state, "RELEASED");

  const applied = ctx.o.applyPendingFold(leaverSeat);
  assert.equal(applied, null, "释放已清掉待弃牌，无需再动引擎");
  assert.equal(
    ctx.o.rooms.events.filter((event) => event.type === "SEAT_FORCED_FOLD").length,
    0,
    "轮次未到就结束，不该记强制弃牌动作",
  );
});

test("编排：无牌局时行动与超时结算都确定性拒绝", () => {
  const ctx = harness();
  assert.throws(() => ctx.o.act({ playerId: "p1", type: "check" }), probe("no_active_hand"));
  assert.throws(() => ctx.o.settleExpiredAction(), probe("no_active_hand"));
});

test("规则2（桌面）：行动截止时能过牌则过牌，否则弃牌", () => {
  const ctx = harness({ playerCount: 2, actionTimeoutMs: 5_000 });
  silenceAll(ctx);
  begin(ctx, [0, 1]);

  const who = actor(ctx);
  const canCheck = ctx.o.hand.legalActions(who.playerId).some((entry) => entry.type === "check");
  assert.equal(ctx.o.settleExpiredAction().result, null, "未到期不得自动处置");

  ctx.advance(5_000);
  const { result } = ctx.o.settleExpiredAction();
  assert.ok(result !== null, "到期必须自动处置");
  assert.equal(result.accepted, true);

  // resultSummary 不带动作名，动作要从引擎事件里核。
  const folded = ctx.o.hand.seatById(who.playerId).folded;
  assert.equal(folded, !canCheck, canCheck ? "能过牌就不该弃牌" : "不能过牌就必须弃牌");
});

test("编排：公开发言必须先有默认公开确认，未确认时拒绝且不进时间线", () => {
  let now = 1_000;
  let id = 0;
  const o = new TableOrchestrator({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
  });
  const created = o.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  // 故意跳过 confirmPublicScope。幂等键是合法的：这样拒绝的理由只能是公开确认那一条，
  // 而不是顺带被字段校验挡下来。
  assert.throws(
    () => o.submitPlayerText({
      seatId: created.seat.seat_id,
      text: "开牌了吗",
      ...chatBinding(),
    }),
    probe("default_public_scope_not_confirmed"),
  );
  assert.deepEqual(o.ai.publicTimeline(), []);
});

test("编排：公开发言先入公开时间线再产生 AI 意图，顺序稳定", () => {
  const ctx = harness();
  begin(ctx);
  ctx.o.takeIntents();
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs);

  const result = ctx.o.submitPlayerText({
    seatId: ctx.seatId(0),
    text: "这把我跟",
    ...chatBinding(),
  });
  const timeline = ctx.o.ai.publicTimeline();
  assert.equal(timeline.at(-1).type, "PLAYER_PUBLIC_SPEECH");
  // 内核对包括发言者本席在内的所有非 OFF 席位一律唤醒，不排除发言者自己。
  // 这是已闭合语义：受保护规则里没有「不唤醒自己」这一条，编排层也不得私自加过滤，
  // 否则等于在编排层新增产品语义。要改只能走合同修订，由 Codex 裁定。
  const wokenSeats = result.evaluations.map((intent) => intent.seat_id);
  assert.ok(wokenSeats.includes(ctx.seatId(0)), "发言者本席同样被唤醒");
  for (const intent of result.evaluations) {
    assert.equal(intent.accepted, true);
    assert.equal(intent.context.source_event_type, "PLAYER_PUBLIC_SPEECH");
    assert.equal(intent.context.hand_index, ctx.o.ai.handIndex);
  }
});

test("编排：投影同时暴露房间、牌局与公开时间线，且不含任何凭据", () => {
  const ctx = harness();
  begin(ctx);
  const projection = ctx.o.projection();
  assert.equal(projection.room.contract, "tokengame.temporary-private-room.v1");
  assert.equal(projection.hand.status, "active");
  assert.ok(Array.isArray(projection.public_timeline));
  assert.equal(typeof projection.pending_intent_count, "number");

  const serialized = JSON.stringify(projection);
  assert.ok(!serialized.includes("tok-"), "投影中不得出现任何令牌或凭据");
});

test("编排：整手牌走完后房间自动续局，两个内核的 handIndex 继续同步", () => {
  const ctx = harness({ playerCount: 2 });
  silenceAll(ctx);
  begin(ctx, [0, 1]);
  ctx.act({ playerId: actor(ctx).playerId, type: "fold" });

  assert.equal(ctx.o.rooms.handIndex, 1);
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const next = ctx.o.startHandIfDue();
  assert.equal(next.started, true, "手间展示后无需重新 Ready");
  assert.equal(ctx.o.rooms.handIndex, 2);
  assert.equal(ctx.o.ai.handIndex, 2);
  assert.equal(ctx.o.ai.street, "preflop");
});
