"use strict";

// 被遗弃的评估回合。
//
// 行为已证实（带对照组的探针，受害席 / 别席 = 0/3）：适配器在 ai.start 之后、
// ai.resolve 之前死掉，那一席从此不再产生意图。两个各自独立的缺陷叠在一起：
//
//   缺陷 A：setSeatAiMode("OFF") 只把回合标成 cancelled，没有摘下来。回合仍挂在
//           active_turn 上，于是「同时最多一个回合」这道闸门永久关闭——连 OFF→ON
//           都救不回来，而 OFF→ON 是宿主唯一能自己做的补救动作。
//   缺陷 B：即便 A 修好，没人去动模式时那个回合仍然永远在飞。权威性时序不能指望
//           宿主在场，这正是到期驱动存在的理由。
//
// 修法把一个字段拆成两件事：active_turn 只回答规则 4「能不能再开一个回合」，
// cancelled_turn 只回答规则 6「迟到的输出该不该发布」。原来两件事共用一个字段，
// 所以修好任一件都会弄坏另一件。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SeatAiStore,
  LIVELY_V1,
  EVALUATION_LEASE_MS,
} = require("../src/authority/seat-ai-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");
const { createDueWorkDriver } = require("../src/authority/due-work.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { AUTHORITY_DRIVEN_COMMANDS, HOST_COMMANDS } = require("../src/authority/host-surface.cjs");
const { chatBinding } = require("../test-support/action-binding.cjs");

const ROOM = "room-binding-1";
const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

function table(seatIds = ["seat-1"], options = {}) {
  let now = 1_000;
  let id = 0;
  const store = new SeatAiStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    ...options,
  });
  store.confirmDefaultPublicScope({
    roomBindingId: ROOM,
    tableRulesVersion: RULES,
    acknowledged: true,
  });
  for (const seatId of seatIds) {
    store.registerSeat({ seatId, playerId: `player-${seatId}` });
  }
  return {
    store,
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

// 唤醒一次，返回该席那条意图。
function wake(store, eventId, seatId = "seat-1") {
  const intents = store.notifyDomainEvent({ type: "BET", eventId, payload: {} });
  return intents.find((intent) => intent.seat_id === seatId);
}

// 整机装配：真编排层 + 真到期驱动，假时钟。用来验证驱动确实走了这一步——
// 上面那些 store 级测试证明回收能用，但证明不了有人去调它。
function wired() {
  let now = 1_000;
  let id = 0;
  const orchestrator = new TableOrchestrator({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: () => stackedDeck([
      "As", "Kd", "Qh", "Jc", "Ts", "9d",
      "2c", "3d", "4h", "5s", "6c",
      "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
    ]),
  });
  const created = orchestrator.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  orchestrator.confirmPublicScope();
  const joined = orchestrator.joinRoom({
    playerId: "p2",
    inviteCode: created.invite.invite_code,
  });
  const seats = [
    { seat_id: created.seat.seat_id, credential: created.credential },
    { seat_id: joined.seat.seat_id, credential: joined.credential },
  ];
  for (const seat of seats) {
    orchestrator.rooms.markConnected({
      seatId: seat.seat_id,
      connectionId: `c-${seat.seat_id}`,
    });
  }
  return {
    orchestrator,
    seats,
    driver: createDueWorkDriver({ orchestrator }),
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

test("缺陷A：OFF 再 ON 之后该席必须能重新被唤醒", () => {
  const t = table();
  const first = wake(t.store, "evt-1");
  assert.equal(first.accepted, true);
  t.store.startEvaluation({ seatId: "seat-1", context: first.context });

  // 适配器此时死掉：不调用 resolveEvaluation。宿主唯一能做的补救是关掉再打开。
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "ON" });
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);

  // 关键断言。修复前这里是 merged_into_pending：回合还挂着，闸门永久关闭。
  const second = wake(t.store, "evt-2");
  assert.equal(
    second.accepted,
    true,
    `OFF→ON 之后该席仍不可唤醒，reason=${second.reason}`,
  );
  assert.equal(t.store.seatState("seat-1").active_turn_id, null);
});

test("缺陷A：摘下回合不能破坏规则6——OFF 期间的迟到输出仍须被丢弃而非发布", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", context: intent.context });
  const turnId = started.payload.turn_id;

  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });

  // 适配器其实没死，只是慢。它带着 OFF 之前拿到的 turn_id 回来了。
  // 规则 6：OFF 后任何迟到结果都不得发布。摘下 active_turn 不能把这条变成一个
  // turn_not_active 异常就算了事——必须仍然留下「已丢弃」的证据。
  const late = t.store.resolveEvaluation({
    seatId: "seat-1",
    turnId,
    decision: "public_speech",
    text: "我本来想说话",
  });
  // 席位此刻仍是 OFF，所以理由是 seat_ai_off（既有行为，已被 seat-ai-store 测试钉住）。
  assert.equal(late.type, "SEAT_AI_OUTPUT_DISCARDED");
  assert.equal(late.payload.reason, "seat_ai_off");
  assert.equal(t.store.seatState("seat-1").ai_published_this_hand, 0);
});

test("缺陷A：OFF 再 ON 之后，被取消回合的迟到输出理由是 turn_cancelled", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", context: intent.context });
  const turnId = started.payload.turn_id;

  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "ON" });

  // 这是 resolveEvaluation 里那个三元表达式的另一支：回合被取消过，但席位现在是 ON。
  // 摘下回合之后这一支仍须可达——否则「取消」的证据就随着修复一起消失了。
  const late = t.store.resolveEvaluation({
    seatId: "seat-1",
    turnId,
    decision: "public_speech",
    text: "取消前想说的话",
  });
  assert.equal(late.type, "SEAT_AI_OUTPUT_DISCARDED");
  assert.equal(late.payload.reason, "turn_cancelled");
  const afterCancelled = t.store.seatState("seat-1");
  assert.equal(afterCancelled.ai_published_this_hand, 0);
  assert.equal(afterCancelled.mode, "ON");
  assert.equal(afterCancelled.status, "IDLE");
});

test("缺陷B：租约到期后权威自己回收回合，无需任何宿主动作", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", context: intent.context });
  assert.notEqual(t.store.seatState("seat-1").active_turn_id, null);

  // 租约未到期时不回收：回收得基于时钟，不是「一被问到就清」。
  t.advance(EVALUATION_LEASE_MS - 1);
  assert.deepEqual(t.store.reclaimExpiredEvaluations(), []);
  assert.notEqual(t.store.seatState("seat-1").active_turn_id, null);

  t.advance(2);
  const reclaimed = t.store.reclaimExpiredEvaluations();
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].type, "SEAT_AI_EVALUATION_RECLAIMED");
  assert.equal(reclaimed[0].payload.seat_id, "seat-1");

  const state = t.store.seatState("seat-1");
  assert.equal(state.active_turn_id, null);
  assert.equal(state.status, "IDLE");

  // 回收之后该席重新可被唤醒——这才是整件事要的结果。
  const next = wake(t.store, "evt-2");
  assert.equal(next.accepted, true, `回收后仍不可唤醒，reason=${next.reason}`);
});

test("缺陷B：回收不得退还每手额度，否则崩溃重启就是绕过规则3的刷额度手法", () => {
  const t = table();
  // 先真正发一条，消耗一格额度。
  const first = wake(t.store, "evt-1");
  const startedFirst = t.store.startEvaluation({ seatId: "seat-1", context: first.context });
  t.store.resolveEvaluation({
    seatId: "seat-1",
    turnId: startedFirst.payload.turn_id,
    decision: "public_speech",
    text: "跟",
  });
  assert.equal(t.store.seatState("seat-1").ai_published_this_hand, 1);

  // 然后开一个回合并让它烂掉，反复若干次。
  for (let round = 0; round < 3; round += 1) {
    t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
    const intent = wake(t.store, `evt-rot-${round}`);
    assert.equal(intent.accepted, true, `第 ${round} 轮应可唤醒`);
    t.store.startEvaluation({ seatId: "seat-1", context: intent.context });
    t.advance(EVALUATION_LEASE_MS + 1);
    assert.equal(t.store.reclaimExpiredEvaluations().length, 1);
  }

  // 额度只能被真正发布消耗，也只能被真正发布消耗掉——回收既不消耗也不退还。
  const state = t.store.seatState("seat-1");
  assert.equal(state.ai_published_this_hand, 1);
  assert.equal(state.ai_hand_quota_remaining, LIVELY_V1.aiMaxPublicPerHand - 1);
});

test("缺陷B：被回收回合的迟到输出不得发布", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", context: intent.context });
  const turnId = started.payload.turn_id;

  t.advance(EVALUATION_LEASE_MS + 1);
  t.store.reclaimExpiredEvaluations();

  // 适配器"复活"了，带着一个早已过期的上下文回来。席位仍是 ON，所以这里不能
  // 走 OFF 那条路——但也绝不能发布：那条话是针对一手牌之前的局面想出来的。
  const late = t.store.resolveEvaluation({
    seatId: "seat-1",
    turnId,
    decision: "public_speech",
    text: "过期的话",
  });
  assert.equal(late.type, "SEAT_AI_OUTPUT_DISCARDED");
  assert.equal(late.payload.reason, "turn_reclaimed");
  assert.equal(t.store.seatState("seat-1").ai_published_this_hand, 0);
  // 丢弃迟到输出不该顺手把一个 ON 的席位改成 OFF。status 必须一起断言：
  // 只断言 mode 的话，「状态写成 OFF 而模式还是 ON」这种自相矛盾的状态查不出来，
  // 而 setSeatStatus 恰好禁止这种组合。
  const afterLate = t.store.seatState("seat-1");
  assert.equal(afterLate.mode, "ON");
  assert.equal(afterLate.status, "IDLE");
});

test("回收只动到期的席位，不碰正在正常思考的另一席", () => {
  const t = table(["seat-1", "seat-2"]);
  const first = wake(t.store, "evt-1", "seat-1");
  t.store.startEvaluation({ seatId: "seat-1", context: first.context });

  // seat-2 晚一点才开始想，所以它的租约也晚一点才到期。
  t.advance(EVALUATION_LEASE_MS - 1_000);
  const second = wake(t.store, "evt-2", "seat-2");
  assert.equal(second.accepted, true);
  t.store.startEvaluation({ seatId: "seat-2", context: second.context });

  t.advance(1_001);
  const reclaimed = t.store.reclaimExpiredEvaluations();
  assert.deepEqual(
    reclaimed.map((event) => event.payload.seat_id),
    ["seat-1"],
  );
  assert.equal(t.store.seatState("seat-1").active_turn_id, null);
  assert.notEqual(t.store.seatState("seat-2").active_turn_id, null);
  assert.equal(t.store.seatState("seat-2").status, "THINKING");
});

test("驱动：到期驱动自己走这一步，没有任何宿主参与", () => {
  const ctx = wired();
  const seatId = ctx.seats[0].seat_id;

  // 真人发言唤醒该席 AI，取到意图后启动评估——然后适配器就此死掉。
  // 字段名是 evaluations。内核对发言者本席也唤醒，所以这里找得到自己那条。
  const intents = ctx.orchestrator.submitPlayerText({
    seatId,
    text: "我先看看",
    recoveryCredential: ctx.seats[0].credential,
    ...chatBinding(),
  }).evaluations;
  const mine = intents.find((intent) => intent.seat_id === seatId && intent.accepted === true);
  assert.notEqual(mine, undefined, "该席应被唤醒");
  ctx.orchestrator.startEvaluation({ seatId, context: mine.context });
  assert.notEqual(ctx.orchestrator.ai.seatState(seatId).active_turn_id, null);

  // 租约未到期：驱动看得见这个回合，但不该动它。
  ctx.advance(EVALUATION_LEASE_MS - 1);
  assert.deepEqual(ctx.driver.tick().reclaimed, []);
  assert.notEqual(ctx.orchestrator.ai.seatState(seatId).active_turn_id, null);

  // 到期：没有任何人发命令，驱动自己收回。
  ctx.advance(2);
  const done = ctx.driver.tick();
  assert.equal(done.reclaimed.length, 1);
  assert.equal(done.reclaimed[0].payload.seat_id, seatId);
  assert.equal(ctx.orchestrator.ai.seatState(seatId).active_turn_id, null);
});

test("驱动：回收排在开新手之前，新手不会带着幽灵回合开始", () => {
  const ctx = wired();
  const seatId = ctx.seats[0].seat_id;
  const intents = ctx.orchestrator.submitPlayerText({
    seatId,
    text: "开始吧",
    recoveryCredential: ctx.seats[0].credential,
    ...chatBinding(),
  }).evaluations;
  const mine = intents.find((intent) => intent.seat_id === seatId && intent.accepted === true);
  ctx.orchestrator.startEvaluation({ seatId, context: mine.context });

  // 让两件事在同一个 tick 里同时到期：租约，以及开局倒计时。
  for (const seat of ctx.seats) {
    ctx.orchestrator.setReady({ seatId: seat.seat_id, ready: true });
  }
  ctx.orchestrator.evaluateStart();
  ctx.advance(EVALUATION_LEASE_MS + 1);

  // 只看新手带来的意图，把之前累积的清掉。
  ctx.orchestrator.takeIntents();

  const done = ctx.driver.tick();
  assert.equal(done.reclaimed.length, 1);
  assert.equal(done.started, true, "并且照常开局");
  assert.equal(ctx.orchestrator.ai.seatState(seatId).active_turn_id, null);

  // 顺序的真实后果在这里。开新手会开第一个行动窗口，而 SEAT_ACTION_WINDOW_OPENED
  // 是白名单唤醒源。先开局再回收的话，这次唤醒会撞在那个幽灵回合上被吞掉，之后再
  // 回收也追不回来——那一席要一直等到下一个来源事件才说得上话。所以断言不是「顺序
  // 是这样写的」，而是「新手的第一次唤醒真的到了那一席手里」。
  const fresh = ctx.orchestrator.takeIntents().filter((intent) => intent.seat_id === seatId);
  assert.deepEqual(
    fresh.map((intent) => intent.accepted),
    [true],
    `新手第一次唤醒没到该席手里: ${JSON.stringify(fresh)}`,
  );
});

test("宿主面：回收命令归权威驱动，不给适配器——死掉的适配器不会自己来催", () => {
  assert.ok(AUTHORITY_DRIVEN_COMMANDS.includes("ai.reclaim_expired"));
  assert.ok(!HOST_COMMANDS.includes("ai.reclaim_expired"));
});

test("租约时长沿用掉线保留窗，且未混入 LIVELY_V1 预算", () => {
  // 120 秒不是新发明的数字：项目对「缺席的外部行动者要等多久才算回不来」已经有过
  // 一个答案——recoveryRetentionMs 默认 120_000。真人掉线等 120 秒释放席位，适配器
  // 失联等 120 秒收回回合，同一个形状的问题给同一个答案。
  //
  // 特意不照 actionTimeoutMs 的 30_000：那条规定的是真人可以想多久，与模型调用耗时
  // 无关，而按 30 秒收会误伤慢但活着的适配器——规则 5 有一条已验收证据正是「模型慢了
  // 30 秒才回来，照常公开」。租约只该杀死掉的，不该杀慢的。
  assert.equal(EVALUATION_LEASE_MS, 120_000);
  const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
  assert.equal(
    EVALUATION_LEASE_MS,
    TABLE_LIFECYCLE_V1.recoveryRetentionMs,
    "租约与掉线保留窗必须同值，否则「同一个问题同一个答案」这条理由就不成立",
  );

  // 租约是活性期限，不是发言预算，所以不能塞进 LIVELY_V1。version 字符串
  // 会作为 limits_version 报给宿主，也进过 Codex 已验收的证据；往里加键会让
  // 两份不同的限制对象都自称 LIVELY_V1，而改版本号不是我该做的决定。
  assert.equal(Object.hasOwn(LIVELY_V1, "aiEvaluationLeaseMs"), false);
  assert.deepEqual(
    Object.keys(LIVELY_V1).filter((key) => /lease|timeout|expire|stale/i.test(key)),
    [],
  );
});

test("租约可注入，但缺省不依赖注入", () => {
  const t = table(["seat-1"], { evaluationLeaseMs: 5_000 });
  const intent = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", context: intent.context });

  t.advance(4_999);
  assert.deepEqual(t.store.reclaimExpiredEvaluations(), []);
  t.advance(2);
  assert.equal(t.store.reclaimExpiredEvaluations().length, 1);
});

// 这条不变量是 reclaimExpiredEvaluations 里那句无条件 seat.status = "IDLE" 的依据。
// 回收不判 mode，靠的就是「OFF 的席位不可能有在途回合」。假设必须被测出来，否则
// 那句无条件赋值哪天就会静默打开一个已关掉的席位。
test("不变量：OFF 的席位永远没有在途回合，所以回收无需判 mode", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", context: intent.context });
  assert.notEqual(t.store.seatState("seat-1").active_turn_id, null);

  // 切 OFF 当场就把回合摘下来。mode 全局只有 setSeatAiMode 一个写入点，
  // 所以这一条覆盖了所有能进入 OFF 的路径，包括围栏用的 silenceSeat。
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  assert.equal(t.store.seatState("seat-1").active_turn_id, null);

  // 于是租约到期时没有任何可回收的东西，OFF 席位不会被回收顺手打开。
  t.advance(EVALUATION_LEASE_MS + 1);
  assert.deepEqual(t.store.reclaimExpiredEvaluations(), []);
  const state = t.store.seatState("seat-1");
  assert.equal(state.mode, "OFF");
  assert.equal(state.status, "OFF");
  assert.equal(state.active_turn_id, null);
});

test("卡住的回合会跨手存活，所以 hand_advanced 那条丢弃救不了死掉的适配器", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", context: intent.context });

  // startHand 故意不取消在途回合（它指望 resolve 时按 hand_advanced 丢弃）。
  // 对活着的适配器这没问题，对死掉的适配器意味着这个回合永远挂着。
  for (let hand = 0; hand < 3; hand += 1) {
    t.store.startHand();
    t.advance(60_000);
    assert.notEqual(
      t.store.seatState("seat-1").active_turn_id,
      null,
      `第 ${hand} 次换手后回合仍应挂着——这是既有设计，不是回归`,
    );
  }

  // 只有回收能收掉它。这也是回收必须排在开新手之前的理由：
  // 新手开始时不该有席位卡在一个幽灵回合里。
  assert.equal(t.store.reclaimExpiredEvaluations().length, 1);
  assert.equal(t.store.seatState("seat-1").active_turn_id, null);
});

test("回收后 startEvaluation 不再报 seat_turn_already_active", () => {
  const t = table();
  const intent = wake(t.store, "evt-1");
  t.store.startEvaluation({ seatId: "seat-1", context: intent.context });

  // 回收前：显式启动被规则 4 挡住，这是对的。
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", context: { source_event_id: "evt-x" } }),
    probe("seat_turn_already_active"),
  );

  t.advance(EVALUATION_LEASE_MS);
  t.store.reclaimExpiredEvaluations();
  const started = t.store.startEvaluation({
    seatId: "seat-1",
    context: { source_event_id: "evt-x" },
  });
  assert.equal(started.type, "SEAT_AI_EVALUATION_STARTED");
});
