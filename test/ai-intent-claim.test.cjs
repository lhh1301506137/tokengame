"use strict";

// F5：取意图与建立租约必须是一次权威侧的 claim，上下文必须由权威持有。
//
// Codex 复核给出的事实（docs/CODEX-IMPLEMENTATION-REVIEW-20260828.md F5）：
//   - takeIntents 取走即从权威队列删除；30 秒评估租约只在随后 ai.start 时建立。
//     适配器死在这两步之间，权威侧 pending 为 0、active turn 为 0、可回收项为 0，
//     本次事件永久丢失。复现数据：
//     {"created_intent_count":1,"first_take_count":1,"authority_pending_after_take":0,
//      "reclaimable_after_take":0}
//   - ai.start 接收适配器回传的任意 context，没有用权威 intent ID 绑定原始 source event。
//   - 思考中或冷却内到达的新事件只写入 seat.pending_context；回合结束或冷却到期后权威
//     不会重新产生 intent，due-work 也不推进它。旧测试是由测试代码手动再调一次
//     startEvaluation 才继续下去的，真实适配器要么去轮询 view.seat，要么这条上下文永远搁着。
//
// 本文件按 Codex 点名的八种情形逐条覆盖：claim 前崩溃、claim 后崩溃、冷却到期自动跟进、
// 回合结束自动跟进、迟到回填、重复 claim、错误 intent ID、跨席 claim。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SeatAiStore,
  LIVELY_V1,
  EVALUATION_LEASE_MS,
  INTENT_CLAIM_LEASE_MS,
} = require("../src/authority/seat-ai-store.cjs");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { createDueWorkDriver } = require("../src/authority/due-work.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { confirmAllSeats } = require("../test-support/public-scope.cjs");
const { actionBinding } = require("../test-support/action-binding.cjs");

const ROOM = "room-binding-1";
const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

// 直驱 SeatAiStore。房间事实在产品里由编排层注入，这里就地注入。
function table(seatIds = ["seat-1"]) {
  let now = 1_000;
  let id = 0;
  const store = new SeatAiStore({ now: () => now, idFactory: () => `id-${++id}` });
  for (const seatId of seatIds) {
    store.registerSeat({ seatId, playerId: `player-${seatId}` });
    store.confirmDefaultPublicScope({
      seatId,
      roomBindingId: ROOM,
      tableRulesVersion: RULES,
      acknowledged: true,
    });
  }
  return { store, advance: (ms) => (now += ms), at: () => now };
}

function wake(store, eventId, seatId = "seat-1") {
  return store
    .notifyDomainEvent({ type: "BET", eventId, payload: {} })
    .find((intent) => intent.seat_id === seatId);
}

function resolveVia(store, input) {
  return store.resolveEvaluation({ ...input, roomBindingId: ROOM, tableRulesVersion: RULES });
}

// 拿一份领来的意图去起回合。世代围栏要求出示当代令牌（见 test/intent-claim-fencing.test.cjs），
// 而本文件关心的是丢失窗口与活性，不是围栏本身，所以这里把「用这一份的令牌」固定下来。
//
// 刻意不给 claimToken 留默认值：哪一代的令牌该出示，在有两个 claimant 的用例里是要点，
// 让它跟着某一份快照走比让调用方省略它更难写错。
function startWith(target, intent, seatId = intent.seat_id) {
  return target.startEvaluation({
    seatId,
    intentId: intent.intent_id,
    claimToken: intent.claim_token,
  });
}

// 真编排层 + 真到期驱动。要求 4 的后半句是「不要求宿主轮询席位内部状态来恢复活性」，
// 这件事只能在这一层证明：上面那些直驱测试都是由测试代码调 promotePendingContexts，
// 而「测试代码手动再调一次」正是 Codex 点名的旧测试缺陷。这里唯一被允许在崩溃与恢复
// 之间跑的东西是 driver.tick()。
function orchestrated(playerCount = 3) {
  let now = 1_000;
  let id = 0;
  const o = new TableOrchestrator({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: () => stackedDeck([]),
  });
  const created = o.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  const seats = [created.seat];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = o.joinRoom({ playerId: `p${index}`, inviteCode: created.invite.invite_code });
    seats.push(joined.seat);
  }
  confirmAllSeats(
    o,
    seats.map((seat) => seat.seat_id),
  );
  for (const seat of seats) {
    o.rooms.markConnected({ seatId: seat.seat_id, connectionId: `conn-${seat.seat_id}` });
  }
  const driver = createDueWorkDriver({ orchestrator: o });
  return {
    o,
    driver,
    seats,
    seatId: (index) => seats[index].seat_id,
    advance: (ms) => (now += ms),
  };
}

function begin(ctx, seatIndexes = [0, 1, 2]) {
  for (const index of seatIndexes) {
    ctx.o.setReady({ seatId: ctx.seatId(index), ready: true });
  }
  ctx.o.evaluateStart();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.o.startHand();
}

// 玩家发言。F2 之后必须带幂等键，这里按调用序号生成一个。
let speechCounter = 0;
function speak(ctx, seatIndex, text) {
  speechCounter += 1;
  return ctx.o.submitPlayerText({
    seatId: ctx.seatId(seatIndex),
    text,
    idempotencyKey: `speech-${speechCounter}`,
  });
}

// ---------------------------------------------------------------------------
// 情形 1：claim 前崩溃 —— 唤醒已产生但没人来领
// ---------------------------------------------------------------------------

test("claim 前崩溃：唤醒已登记为权威工作项，没有任何宿主参与也不丢", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  assert.equal(intent.accepted, true);

  // Codex 复现里 created_intent_count 是 1，这一条对上。
  assert.equal(typeof intent.intent_id, "string", "工作项必须带权威生成的 intent_id");
  assert.equal(t.store.workItems.size, 1, "唤醒必须在权威侧留下工作项");

  // 适配器压根没来过：工作项照旧可领。
  t.advance(10 * 60_000);
  const [work] = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(work.intent_id, intent.intent_id);
  assert.equal(work.context.source_event_id, "evt-1");
});

// ---------------------------------------------------------------------------
// 情形 2：claim 后崩溃 —— F5 的核心缺陷
// ---------------------------------------------------------------------------

test("claim 后崩溃：领走但没起回合，权威侧仍有可回收工作，本次事件不丢", () => {
  const t = table();
  const created = wake(t.store, "evt-1");
  assert.equal(created.accepted, true);

  const claimed = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(claimed.length, 1, "first_take_count 应为 1");

  // Codex 那四个数字，逐个反过来断言。旧实现在这里是 0/0——工作永久消失。
  assert.equal(t.store.workItems.size, 1, "authority_pending_after_take 必须仍为 1");
  assert.equal(
    t.store.seatState("seat-1").pending_intent_id,
    created.intent_id,
    "权威投影必须仍指得出这份待办",
  );

  // 适配器就此死掉，再也不调 ai.start。租约到期后这份工作重新可领。
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const released = t.store.releaseExpiredIntentClaims();
  assert.equal(released.length, 1, "reclaimable_after_take 必须为 1");
  assert.equal(released[0].type, "SEAT_AI_INTENT_CLAIM_RELEASED");
  assert.equal(released[0].payload.intent_id, created.intent_id);

  const [again] = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(again.intent_id, created.intent_id, "同一份工作必须重新领得到");
  // 领取过的工作项要出示当代令牌（世代围栏，见 test/intent-claim-fencing.test.cjs）。
  const started = t.store.startEvaluation({
    seatId: "seat-1", intentId: again.intent_id, claimToken: again.claim_token,
  });
  assert.equal(started.type, "SEAT_AI_EVALUATION_STARTED");
  assert.equal(started.payload.source_event_id, "evt-1", "起来的必须还是那次唤醒");
});

test("claim 后崩溃：租约未到期时不重复派发，避免两个宿主同时跑同一份工作", () => {
  const t = table();
  wake(t.store, "evt-1");
  assert.equal(t.store.claimIntents({ seatId: "seat-1" }).length, 1);

  t.advance(INTENT_CLAIM_LEASE_MS - 1);
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), [], "租约内不得再派一次");
  assert.equal(t.store.workItems.size, 1, "但工作项还在，只是被领着");

  t.advance(2);
  assert.equal(t.store.claimIntents({ seatId: "seat-1" }).length, 1, "到期后必须重新可领");
});

test("claim 租约与评估租约是两条独立期限，不共用一个常量", () => {
  // 领走到 ai.start 全程在宿主本机、模型还没开始跑，按 120 秒收会让一个崩掉的适配器
  // 把工作项压住两分钟；模型耗时那一段才是评估租约。
  assert.notEqual(INTENT_CLAIM_LEASE_MS, EVALUATION_LEASE_MS);
  assert.ok(INTENT_CLAIM_LEASE_MS < EVALUATION_LEASE_MS);
  // 也不得混进 LIVELY_V1：那是规则 3 的发言预算，version 字符串会作为 limits_version
  // 报给宿主并进过已验收证据。租约是活性期限，不是预算。
  for (const value of Object.values(LIVELY_V1)) {
    assert.notEqual(value, INTENT_CLAIM_LEASE_MS);
  }
});

test("claim 租约可注入，但缺省不依赖注入", () => {
  const t = table();
  assert.equal(t.store.intentClaimLeaseMs, INTENT_CLAIM_LEASE_MS);

  let now = 1_000;
  const store = new SeatAiStore({
    now: () => now,
    idFactory: () => "fixed",
    intentClaimLeaseMs: 5_000,
  });
  store.registerSeat({ seatId: "seat-1", playerId: "p1" });
  wake(store, "evt-1");
  store.claimIntents({ seatId: "seat-1" });
  now += 5_001;
  assert.equal(store.releaseExpiredIntentClaims().length, 1);
});

// ---------------------------------------------------------------------------
// 情形 3：冷却到期自动跟进
// ---------------------------------------------------------------------------

test("冷却到期自动跟进：冷却内到达的最新上下文自己变成可领工作项", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
  resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "先说一句",
  });

  // 冷却内到达：合并成待办，此刻不该有活可领。
  t.advance(1_000);
  const merged = wake(t.store, "evt-2");
  assert.equal(merged.accepted, false);
  assert.equal(merged.reason, "cooldown");
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), [], "冷却内不该有活可领");
  assert.equal(t.store.seatState("seat-1").has_pending_context, true);

  // 冷却过后：权威自己把它变成可领工作项，没有任何宿主动作参与。
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  const promoted = t.store.promotePendingContexts();
  assert.equal(promoted.length, 1, "冷却到期后必须产生可领工作项");
  assert.equal(promoted[0].type, "SEAT_AI_INTENT_QUEUED");
  assert.equal(promoted[0].payload.origin, "pending_context_promoted");
  assert.equal(promoted[0].payload.source_event_id, "evt-2");
  assert.equal(t.store.seatState("seat-1").has_pending_context, false, "促进后不该还挂着");

  const [work] = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(work.context.source_event_id, "evt-2");
  assert.equal(
    t.store.startEvaluation({
      seatId: "seat-1", intentId: work.intent_id, claimToken: work.claim_token,
    }).payload.source_event_id,
    "evt-2",
  );
});

test("冷却到期自动跟进：不促进冷却未满的席位（对照组）", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
  resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "silent",
  });
  t.advance(1_000);
  wake(t.store, "evt-2");

  // 没有这一条，「促进」可能只是「无条件促进」，规则 3 的最小启动间隔就被绕过了。
  assert.deepEqual(t.store.promotePendingContexts(), [], "冷却未满不得促进");
  assert.equal(t.store.seatState("seat-1").has_pending_context, true);
});

test("冷却到期自动跟进：领活这一步自己也促进，不取决于驱动跑没跑", () => {
  const run = (tickFirst) => {
    const t = table();
    const first = wake(t.store, "evt-1");
    const started = t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
    resolveVia(t.store, {
      seatId: "seat-1",
      turnId: started.payload.turn_id,
      decision: "silent",
    });
    t.advance(1_000);
    wake(t.store, "evt-2");
    t.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
    if (tickFirst) t.store.promotePendingContexts();
    const claimed = t.store.claimIntents({ seatId: "seat-1" });
    return claimed.map((item) => item.context.source_event_id);
  };
  // 冷却刚过 1 毫秒时领活，抢在 tick 前到达也必须拿到活——否则宽限期就等于 tick 间隔，
  // 而 tick 间隔是宿主选项。
  assert.deepEqual(run(true), ["evt-2"]);
  assert.deepEqual(run(false), ["evt-2"], "没跑驱动就领不到活：活性被交回给了宿主配置");
});

// ---------------------------------------------------------------------------
// 情形 4：回合结束自动跟进
// ---------------------------------------------------------------------------

test("回合结束自动跟进：思考期内合并的上下文在回合结束时就地变成可领工作项", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });

  const merged = wake(t.store, "evt-2");
  assert.equal(merged.reason, "merged_into_pending");

  // 让模型跑得比冷却久：回合结束时冷却已经过了，所以促进当场发生，不必等任何 tick。
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
  resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "silent",
  });

  const state = t.store.seatState("seat-1");
  assert.equal(state.has_pending_context, false, "回合结束时那份上下文该被促进掉");
  assert.notEqual(state.pending_intent_id, null, "并且成为可领工作项");
  const [work] = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(work.context.source_event_id, "evt-2");
});

test("回合结束自动跟进：回合被回收后同样跟进，崩掉的适配器不会永久静默一席", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
  const merged = wake(t.store, "evt-2");
  assert.equal(merged.reason, "merged_into_pending");

  // 适配器就此死掉。租约到期，权威自己收回回合，然后把那份上下文变成可领工作项。
  t.advance(EVALUATION_LEASE_MS + 1);
  const promoted = t.store.promotePendingContexts();
  assert.equal(promoted.length, 1, "回收之后必须跟进，否则这一席永久静默");
  assert.equal(promoted[0].payload.source_event_id, "evt-2");
  assert.equal(t.store.seatState("seat-1").active_turn_id, null);
});

test("回合结束自动跟进：促进这一步自带回收，不靠先跑一遍回收步骤", () => {
  // 编排层那个测试里，回收发生在自动 fold 的唤醒路径上，所以顺序在那儿看不出来。这里
  // 单独钉住：一个被遗弃的回合不能挡住促进，而它挡不挡不该取决于回收步骤跑没跑。
  const run = (reclaimFirst) => {
    const t = table();
    const first = wake(t.store, "evt-1");
    t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
    wake(t.store, "evt-2");
    t.advance(EVALUATION_LEASE_MS + 1);
    if (reclaimFirst) t.store.reclaimExpiredEvaluations();
    return t.store.promotePendingContexts().map((event) => event.payload.source_event_id);
  };
  assert.deepEqual(run(true), ["evt-2"]);
  assert.deepEqual(run(false), ["evt-2"], "没先回收就促不动：顺序成了活性的前提条件");
});

test("回合结束自动跟进：最后一句用掉额度后，思考期里合并的那份上下文就地丢弃", () => {
  const t = table();
  // 先用掉 8 句里的前 7 句。
  for (let round = 0; round < LIVELY_V1.aiMaxPublicPerHand - 1; round += 1) {
    t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
    const intent = wake(t.store, `evt-${round}`);
    assert.equal(intent.accepted, true, `第 ${round} 轮应可唤醒`);
    const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
    resolveVia(t.store, {
      seatId: "seat-1",
      turnId: started.payload.turn_id,
      decision: "public_speech",
      text: `第 ${round} 句`,
    });
  }
  assert.equal(t.store.seatState("seat-1").ai_hand_quota_remaining, 1);

  // 第 8 句在飞的时候又来一个事件：额度还剩 1，所以它是合并进 pending，不是被额度拒。
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
  const last = wake(t.store, "evt-last");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: last.intent_id });
  const merged = wake(t.store, "evt-after-quota");
  assert.equal(merged.reason, "merged_into_pending");
  assert.equal(t.store.seatState("seat-1").has_pending_context, true);

  // 第 8 句发布，额度用尽。回合结束的跟进这时候必须什么都不产生。
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
  resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "最后一句",
  });

  const state = t.store.seatState("seat-1");
  assert.equal(state.ai_hand_quota_remaining, 0);
  assert.equal(state.pending_intent_id, null, "额度耗尽不得促进");
  assert.equal(
    state.has_pending_context,
    false,
    "额度耗尽后还挂着待办：这一手内它永远等不到能用的时刻，只会一直谎报有活要干",
  );
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), []);
  assert.deepEqual(t.store.promotePendingContexts(), []);
});

test("回合结束自动跟进：换手后额度恢复，新事件照常成为工作项", () => {
  const t = table();
  t.store.startHand();
  const intent = wake(t.store, "evt-next-hand");
  assert.equal(intent.accepted, true);
  assert.equal(intent.context.hand_index, t.store.handIndex);
});

test("换手：上一手没被领走的工作项必须丢掉，不带着旧牌面混进新一手", () => {
  const t = table();
  t.store.startHand();
  const stale = wake(t.store, "evt-old-hand");
  assert.equal(stale.accepted, true);
  const staleHand = t.store.handIndex;

  t.store.startHand();
  assert.equal(t.store.workItems.size, 0, "上一手的待办带进了新一手");
  assert.equal(t.store.seatState("seat-1").pending_intent_id, null);
  // 拿旧 id 来起回合也不行：那份上下文的 hand_index 和 street 都是上一手的，
  // 起来就是对着已经结束的牌面说话。
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: stale.intent_id }),
    probe("intent_not_found"),
  );
  const fresh = wake(t.store, "evt-new-hand");
  assert.equal(fresh.context.hand_index, t.store.handIndex);
  assert.notEqual(fresh.context.hand_index, staleHand);
});

test("促进：回合还在飞时不促进，一席不得同时有在途回合和可领工作", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
  const merged = wake(t.store, "evt-2");
  assert.equal(merged.reason, "merged_into_pending");

  // 冷却早过了，只有「回合还在飞」这一条挡着。促进若无视它，这一席就同时有一个在途回合
  // 和一份可领工作：宿主领走去起第二个回合，规则 4 的合并语义被绕开。
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
  const state = t.store.seatState("seat-1");
  assert.notEqual(state.active_turn_id, null, "前置条件：回合应当还在飞");
  assert.equal(t.store.cooldownRemainingMs(t.store.seats.get("seat-1"), t.at()), 0);

  assert.deepEqual(t.store.promotePendingContexts(), [], "回合还在飞就不该促进");
  assert.equal(t.store.seatState("seat-1").pending_intent_id, null);
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), []);
  assert.equal(t.store.seatState("seat-1").has_pending_context, true, "该留在 pending 里等回合结束");
});

// ---------------------------------------------------------------------------
// 情形 5：迟到回填
// ---------------------------------------------------------------------------

test("迟到回填：跨街的迟到输出照常发布并标注，source 仍是权威那份", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  assert.equal(started.payload.street, "preflop");

  t.store.advanceStreet({ street: "flop" });
  const resolved = resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "刚才那手我想了很久",
  });
  assert.equal(resolved.type, "AI_PUBLIC_SPEECH");
  assert.equal(resolved.payload.based_on_street, "preflop");
  assert.equal(resolved.payload.late_annotation, "延迟 · 基于前一街");
  // 要求 3：来源绑定是权威那份工作项带来的，不是适配器回传的。
  assert.equal(resolved.payload.source_event_id, "evt-1");
});

test("迟到回填：工作项被后续事件就地更新，宿主凭 context_revision 看得出手里那份旧了", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  const [held] = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(held.intent_id, first.intent_id);
  const heldRevision = held.context.context_revision;
  assert.equal(typeof heldRevision, "number");

  // 领着不动，租约到期后新事件到达：同一份工作项换上最新上下文，id 不变。
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const second = wake(t.store, "evt-2");
  assert.equal(second.intent_id, first.intent_id, "每席只该有一份待办，不该并出第二份");
  assert.equal(t.store.workItems.size, 1);

  const [fresh] = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(fresh.context.source_event_id, "evt-2");
  assert.ok(
    fresh.context.context_revision > heldRevision,
    "上下文换了但版本号没动，宿主无从判断手里那份是否最新",
  );

  // 用旧 id 起回合起来的是**最新**上下文：权威保存事实，适配器拿的只是只读快照。
  //
  // 令牌用 fresh 那一份而不是 held 那一份。本条钉的是「intent_id 稳定、上下文换新」，
  // 不是「旧 claimant 还能开工」——后者已由世代围栏禁止，见
  // test/intent-claim-fencing.test.cjs。两件事共用一个 id，所以要分清出示的是哪一代。
  const startedWith = t.store.startEvaluation({
    seatId: "seat-1", intentId: held.intent_id, claimToken: fresh.claim_token,
  });
  assert.equal(startedWith.payload.source_event_id, "evt-2");
});

test("迟到回填：宿主改自己那份快照改不动权威保存的上下文", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  intent.context.source_event_id = "evt-forged";
  intent.context.hand_index = 999;

  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  assert.equal(started.payload.source_event_id, "evt-1", "快照必须是深拷贝，改不动权威那份");
  assert.notEqual(started.payload.hand_index, 999);
});

// ---------------------------------------------------------------------------
// 情形 6：重复 claim
// ---------------------------------------------------------------------------

test("重复 claim：租约到期后可再领，claim_count 累加，工作项不复制", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  const firstHost = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(firstHost.length, 1);

  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const secondHost = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(secondHost.length, 1, "租约过期后必须能被另一个宿主接手");
  assert.equal(secondHost[0].intent_id, firstHost[0].intent_id);
  assert.equal(t.store.workItems.size, 1, "重复 claim 不得复制工作项");
  assert.equal(t.store.workItems.get(intent.intent_id).claim_count, 2);
});

test("重复 claim：同一份工作项只能起一个回合，后到的那个宿主拿到 intent_not_found", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");

  // 两个宿主先后领到同一个 id（第二次是租约过期后接手的）。
  const [first] = t.store.claimIntents({ seatId: "seat-1" });
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const [second] = t.store.claimIntents({ seatId: "seat-1" });

  // 接手的那一方起回合。第一方的令牌已经作废（世代围栏），所以这里必须用 second 的。
  const started = t.store.startEvaluation({
    seatId: "seat-1", intentId: intent.intent_id, claimToken: second.claim_token,
  });
  assert.equal(typeof started.payload.turn_id, "string");
  // 起过就消费掉了。不然两个宿主各起一个回合，同一个来源事件被说两遍，规则 2 失效。
  // 消费之后连令牌对得上的那一方也起不来——工作项已经不在队列里。
  assert.throws(
    () => t.store.startEvaluation({
      seatId: "seat-1", intentId: intent.intent_id, claimToken: second.claim_token,
    }),
    probe("intent_not_found"),
    "同一个 intent 起了两个回合：一个来源事件被说两遍",
  );
  // 被顶掉的第一方拿到的是另一个码。混成同一个码时它只会以为自己调错了，然后无限重试。
  assert.notEqual(first.claim_token, second.claim_token);
});

test("重复 claim：租约未到期时第二次 claim 拿不到，仍在等待中不算可领", () => {
  const t = table();
  wake(t.store, "evt-1");
  assert.equal(t.store.claimIntents({ seatId: "seat-1" }).length, 1);
  t.advance(INTENT_CLAIM_LEASE_MS - 1);
  assert.deepEqual(
    t.store.claimIntents({ seatId: "seat-1" }),
    [],
    "租约还在就又派出去了：两个宿主会同时跑同一份工作",
  );
});

test("重复 claim：领着的工作项被新事件就地更新，租约不因更新而白送", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  t.store.claimIntents({ seatId: "seat-1" });
  const leaseAt = t.store.workItems.get(first.intent_id).claim_deadline_at;
  assert.equal(typeof leaseAt, "number");

  // 领了活但还没起回合，所以此时既没有 active_turn 也没有冷却：新事件走的是「就地更新
  // 同一份工作项」这条路，不是合并进 pending。更新不该顺手把租约清掉——不然任何一个
  // 新事件都能让别的宿主插进来抢走正在被处理的工作。
  t.advance(1_000);
  const second = wake(t.store, "evt-2");
  assert.equal(second.intent_id, first.intent_id, "同一席不得并出第二份工作项");
  assert.equal(t.store.workItems.get(first.intent_id).superseded_count, 1);
  assert.equal(
    t.store.workItems.get(first.intent_id).claim_deadline_at,
    leaseAt,
    "更新顺手改了租约期限：新事件就成了绕过租约的手段",
  );
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), [], "更新不得顺手释放租约");
});

// ---------------------------------------------------------------------------
// 情形 7 与 8：错误 intent ID、跨席 claim
// ---------------------------------------------------------------------------

test("错误 intent ID：不存在、空、缺失都拒，不退化成「随便起一个回合」", () => {
  const t = table();
  wake(t.store, "evt-1");

  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: "intent-nope" }),
    probe("intent_not_found"),
  );
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: "" }),
    probe("invalid_field"),
  );
  assert.throws(() => t.store.startEvaluation({ seatId: "seat-1" }), probe("invalid_field"));
  // 全都拒掉了，那份工作项还在原地等着被正确地领走。
  assert.equal(t.store.workItems.size, 1);
});

test("错误 intent ID：已消费的 id 与从未存在的 id 报同一个错，不泄露调度节奏", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  const consumed = (() => {
    try {
      t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
      return null;
    } catch (error) {
      return error;
    }
  })();
  const neverExisted = (() => {
    try {
      t.store.startEvaluation({ seatId: "seat-1", intentId: "intent-never" });
      return null;
    } catch (error) {
      return error;
    }
  })();
  assert.equal(consumed.code, neverExisted.code);
  assert.equal(consumed.status, neverExisted.status);
  assert.deepEqual(Object.keys(consumed.details).sort(), Object.keys(neverExisted.details).sort());
});

test("跨席 claim：拿 A 席的工作项去起 B 席的回合被拒", () => {
  const t = table(["seat-1", "seat-2"]);
  const intents = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const one = intents.find((item) => item.seat_id === "seat-1");
  const two = intents.find((item) => item.seat_id === "seat-2");
  assert.notEqual(one.intent_id, two.intent_id, "两席必须各有自己的工作项");

  // B 席替 A 席说话，用的却是 B 席自己的额度和冷却。
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-2", intentId: one.intent_id }),
    probe("intent_seat_mismatch"),
  );
  // 被拒之后两席的工作项都还在，谁都没被这次越权吃掉。
  assert.equal(t.store.workItems.size, 2);
  assert.equal(t.store.seatState("seat-1").pending_intent_id, one.intent_id);
  assert.equal(t.store.seatState("seat-2").pending_intent_id, two.intent_id);
});

// ---------------------------------------------------------------------------
// 真驱动：恢复活性不需要宿主做任何事
//
// 上面的直驱测试证明的是「权威有能力跟进」。这一组证明的是「跟进真的会自己发生」：
// 崩溃之后除了 driver.tick() 没有任何东西被调用，尤其没有任何一次
// promotePendingContexts / releaseExpiredIntentClaims / view.seat 轮询。
// ---------------------------------------------------------------------------

test("真驱动：适配器死在 claim 与 ai.start 之间，一次 tick 就把工作放回可领", () => {
  const ctx = orchestrated();
  begin(ctx);

  const claimed = ctx.o.takeIntents();
  assert.ok(claimed.length >= 1);
  const target = claimed[0];
  // 适配器就此死掉：没起回合，也没归还。
  assert.deepEqual(ctx.o.takeIntents({ seatId: target.seat_id }), [], "租约期内不该再派出去");

  ctx.advance(INTENT_CLAIM_LEASE_MS + 1);
  const done = ctx.driver.tick();
  assert.ok(
    done.released_claims.some((event) => event.payload.intent_id === target.intent_id),
    "tick 必须释放到期的 claim，否则工作永远挂在一个不会回来的领取者名下",
  );

  const again = ctx.o.takeIntents({ seatId: target.seat_id });
  assert.equal(again.length, 1, "释放之后必须能被接手");
  assert.equal(again[0].intent_id, target.intent_id);
  // 令牌取接手方那一份：死掉那个适配器的令牌已经作废（世代围栏）。
  assert.equal(
    typeof ctx.o.startEvaluation({
      seatId: target.seat_id, intentId: target.intent_id, claimToken: again[0].claim_token,
    }).payload.turn_id,
    "string",
    "接手之后必须真能起回合",
  );
});

test("真驱动：冷却内到达的最新上下文，靠 tick 自己变成可领工作项", () => {
  const ctx = orchestrated();
  begin(ctx);
  const [first] = ctx.o.takeIntents();
  const started = startWith(ctx.o, first);
  ctx.o.resolveEvaluation({
    seatId: first.seat_id,
    turnId: started.payload.turn_id,
    decision: "silent",
  });

  // 冷却内来一个新的白名单事件：玩家发言。
  ctx.advance(1_000);
  speak(ctx, 1, "跟一手");
  assert.deepEqual(ctx.o.takeIntents({ seatId: first.seat_id }), [], "冷却内不该有活可领");

  // 除了 tick 什么都不做。
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  const done = ctx.driver.tick();
  assert.ok(
    done.promoted.some((event) => event.payload.seat_id === first.seat_id),
    "冷却到期后 tick 必须把待办变成可领工作项，否则这条上下文永远搁着",
  );

  const work = ctx.o.takeIntents({ seatId: first.seat_id });
  assert.equal(work.length, 1);
  assert.equal(work[0].context.source_event_type, "PLAYER_PUBLIC_SPEECH");
});

test("真驱动：适配器死在回合里，一次 tick 之后这一席重新有活可领", () => {
  const ctx = orchestrated();
  begin(ctx);
  const [first] = ctx.o.takeIntents();
  startWith(ctx.o, first);

  // 思考中来一个新事件：合并进 pending。然后适配器死掉，再也不会 resolve。
  ctx.advance(1_000);
  speak(ctx, 1, "你还在想吗");
  assert.equal(ctx.o.ai.seatState(first.seat_id).has_pending_context, true);

  ctx.advance(EVALUATION_LEASE_MS + 1);
  const done = ctx.driver.tick();

  // 这里断言的是结果，不是路径。真实时序里评估租约（120 秒）比行动时限（30 秒）长得多，
  // 所以等到租约到期时行动早就超时了：同一次 tick 的第一步 settleExpiredAction 会自动
  // fold 并开出新的行动窗口，而 SEAT_ACTION_WINDOW_OPENED 是白名单唤醒源——回收因此发生
  // 在结算那一步里（notifyDomainEvent 每席先 reclaimSeatIfExpired），那份 pending 也被
  // 这个更新的上下文就地取代。所以 done.reclaimed / done.promoted 会是空的，可这一席并
  // 没有被静默：它拿到的是比 pending 里那份更新的上下文，这比促进旧的更对。
  // 回收与促进在无干扰情况下的先后顺序由上面的直驱测试单独覆盖。
  assert.equal(done.settled !== null, true, "行动早就超时了，这一步应当结算");
  assert.equal(
    ctx.o.ai.events.filter(
      (event) =>
        event.type === "SEAT_AI_EVALUATION_RECLAIMED" && event.payload.seat_id === first.seat_id,
    ).length,
    1,
    "被遗弃的回合必须被回收，否则这一席永久停在「已有回合在飞」",
  );
  const state = ctx.o.ai.seatState(first.seat_id);
  assert.equal(state.active_turn_id, null, "幽灵回合还挂着");
  assert.equal(state.has_pending_context, false);
  const work = ctx.o.takeIntents({ seatId: first.seat_id });
  assert.equal(work.length, 1, "一次 tick 之后这一席必须重新有活可领");
  assert.equal(
    typeof startWith(ctx.o, work[0], first.seat_id).payload.turn_id,
    "string",
    "领到的活必须真能起回合",
  );
});

test("真驱动：促进排在开新手之前，上一手的活不会被开手顺手丢掉", () => {
  const ctx = orchestrated();
  begin(ctx);

  // 先起一个回合并结掉，把冷却计时点在这一手里。
  const [first] = ctx.o.takeIntents();
  const seatId = first.seat_id;
  const started = startWith(ctx.o, first, seatId);
  ctx.o.resolveEvaluation({
    seatId,
    turnId: started.payload.turn_id,
    decision: "silent",
  });

  // 把这一手打完：一路弃牌到只剩一人。绑定字段按当前状态自动形成，本文件测的不是幂等门。
  for (let guard = 0; guard < 8 && ctx.o.hand.status !== "complete"; guard += 1) {
    const hand = ctx.o.hand;
    ctx.o.act({
      playerId: hand.seats[hand.actorIndex].id,
      type: "fold",
      ...actionBinding(ctx.o, { key: `fold-${guard}` }),
    });
  }
  assert.equal(ctx.o.hand.status, "complete");
  const handIndex = ctx.o.ai.handIndex;

  // 手结束后来一条发言。刚起过回合的那一席在冷却内，所以它只进 pending——编排层的
  // evaluations 只回被接受的那些，被冷却挡住的席位在返回值里根本不出现，所以这里断言的
  // 是席位状态。
  speak(ctx, 1, "这手就这样吧");
  assert.equal(ctx.o.ai.seatState(seatId).has_pending_context, true, "前置条件：应当合并进 pending");
  assert.deepEqual(ctx.o.takeIntents({ seatId }), [], "前置条件：冷却内没活可领");

  // 冷却到期与手间展示到期撞在同一个 tick 上。促进必须排在开新手之前：startHand 会丢弃
  // 上一手的待办，反过来的顺序等于让这条上下文凭空消失。
  ctx.advance(
    Math.max(LIVELY_V1.aiMinEvaluationIntervalMs, TABLE_LIFECYCLE_V1.interHandDisplayMs) + 1,
  );
  const done = ctx.driver.tick();
  assert.equal(done.started, true, "前置条件：这一次 tick 里确实开了新手");

  const promoted = done.promoted.filter((event) => event.payload.seat_id === seatId);
  assert.equal(promoted.length, 1, "上一手的待办必须在开新手之前被促进，否则被 startHand 丢掉");
  // 促进拿到的是上一手的牌面事实，这正是「上一手的活按上一手的牌面结算」。
  assert.equal(promoted[0].payload.hand_index, handIndex);
  assert.ok(promoted[0].payload.hand_index < ctx.o.ai.handIndex, "新手号应当已经推进");
});

test("真驱动：恢复活性期间宿主没有读过任何席位内部状态", () => {
  const ctx = orchestrated();
  begin(ctx);
  const [first] = ctx.o.takeIntents();
  const started = startWith(ctx.o, first);
  ctx.o.resolveEvaluation({
    seatId: first.seat_id,
    turnId: started.payload.turn_id,
    decision: "silent",
  });
  ctx.advance(1_000);
  speak(ctx, 1, "催一下");

  // 从这里开始盯住所有「宿主可能用来自己发现有活要干」的读口。要求 4 的原话是
  // 「不要求宿主轮询席位内部状态来恢复活性」——所以这些读口在恢复过程中必须一次都没被用到。
  const spied = ["seatState", "promotePendingContexts", "promotePendingContext"];
  const calls = new Map(spied.map((name) => [name, 0]));
  const originals = new Map();
  for (const name of spied) {
    const original = ctx.o.ai[name].bind(ctx.o.ai);
    originals.set(name, ctx.o.ai[name]);
    ctx.o.ai[name] = (...args) => {
      calls.set(name, calls.get(name) + 1);
      return original(...args);
    };
  }

  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  // 驱动内部当然要调 promotePendingContexts——它就是权威自己走表的那一步。这里数的是
  // 「宿主侧还得额外做点什么」，所以先跑 tick，再把计数清零，然后只看领活这一步。
  ctx.driver.tick();
  for (const name of spied) calls.set(name, 0);

  const work = ctx.o.takeIntents({ seatId: first.seat_id });
  assert.equal(work.length, 1, "tick 之后直接领活就该拿到，不需要先去看席位状态");
  assert.equal(calls.get("seatState"), 0, "领活路径上读了席位状态：活性又回到轮询上了");

  for (const name of spied) ctx.o.ai[name] = originals.get(name);
});

test("跨席 claim：按席领活只拿到自己那席的", () => {
  const t = table(["seat-1", "seat-2"]);
  t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });

  const mine = t.store.claimIntents({ seatId: "seat-2" });
  assert.deepEqual(
    mine.map((item) => item.seat_id),
    ["seat-2"],
  );
  // seat-1 那份没被这次 claim 带走，仍可领。
  assert.deepEqual(
    t.store.claimIntents().map((item) => item.seat_id),
    ["seat-1"],
  );
});

test("跨席 claim：真编排层上，B 席拿 A 席的工作项照样被拒", () => {
  const ctx = orchestrated();
  begin(ctx);
  const intents = ctx.o.takeIntents();
  assert.ok(intents.length >= 2, "开手的行动窗口应唤醒多席");
  const [one, two] = intents;

  assert.throws(
    () => startWith(ctx.o, one, two.seat_id),
    probe("intent_seat_mismatch"),
  );
  // 各自用自己的那份则正常。
  assert.equal(
    typeof startWith(ctx.o, one).payload.turn_id,
    "string",
  );
});

test("跨席 claim：一席关掉 AI 后它的工作项消失，旧 id 报的是 seat_ai_off", () => {
  const t = table(["seat-1", "seat-2"]);
  const intents = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const one = intents.find((item) => item.seat_id === "seat-1");

  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  assert.equal(t.store.workItems.size, 1, "关掉 AI 的席位不该还留着待办");
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: one.intent_id }),
    probe("seat_ai_off"),
    "报 intent_not_found 的话宿主看不出真正的原因是这一席被关了",
  );
  assert.deepEqual(
    t.store.claimIntents().map((item) => item.seat_id),
    ["seat-2"],
  );
});
