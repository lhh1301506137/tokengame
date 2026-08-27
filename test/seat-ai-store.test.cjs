"use strict";

// SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D 七条受保护规则的确定性回归。
// 全部用受控假时钟与假 ID，不依赖真实时间、随机数或任何宿主。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SeatAiStore,
  LIVELY_V1,
  WHITELIST_SOURCE_EVENTS,
  countGraphemes,
} = require("../src/authority/seat-ai-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");

const ROOM = "room-binding-1";
const RULES = "table-rules-v1";

// F3：AI_PUBLIC_SPEECH 也是 TABLE_PUBLIC 的出口，所以 resolveEvaluation 也要过该席的
// 公开确认。产品里房间事实由编排层注入；本文件直接驱动 SeatAiStore，就在这里注入。
function resolveVia(store, input) {
  return store.resolveEvaluation({
    ...input,
    roomBindingId: ROOM,
    tableRulesVersion: RULES,
  });
}
// UTF-16 长度 8，字素数 1。用 String#length 计数会让 140 上限被放大 8 倍。
const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

function harness() {
  let now = 1_000;
  let id = 0;
  const store = new SeatAiStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
  });
  return {
    store,
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

// 已确认默认公开、已注册席位的牌桌。
function table(seatIds = ["seat-1"]) {
  const h = harness();
  // F3：确认按席位记账，所以先注册再逐席确认。整桌按一次已经不存在了。
  for (const seatId of seatIds) {
    h.store.registerSeat({ seatId, playerId: `player-${seatId}` });
    h.store.confirmDefaultPublicScope({
      seatId,
      roomBindingId: ROOM,
      tableRulesVersion: RULES,
      acknowledged: true,
    });
  }
  return h;
}
function speak(store, seatId, text) {
  return store.submitPlayerText({
    seatId,
    text,
    roomBindingId: ROOM,
    tableRulesVersion: RULES,
  });
}

function types(store) {
  return store.events.map((event) => event.type);
}

// 确定性假 AI：不调用任何模型，按预设脚本回答，用于驱动完整评估回合。
function fakeAi(script = []) {
  const calls = [];
  let cursor = 0;
  return {
    calls,
    decide(context) {
      calls.push(context);
      const step = script[cursor] ?? { decision: "silent" };
      cursor += 1;
      return step;
    },
  };
}

// 把一个被接受的评估意向跑完整一轮：startEvaluation -> 假 AI -> resolveEvaluation。
function runIntent(store, intent, ai) {
  const started = store.startEvaluation({
    seatId: intent.seat_id,
    intentId: intent.intent_id,
  });
  const step = ai.decide(intent.context);
  return resolveVia(store, {
    seatId: intent.seat_id,
    turnId: started.payload.turn_id,
    decision: step.decision,
    text: step.text,
  });
}

// ---------------------------------------------------------------------------
// 规则 1：桌面自由文本默认公开；必须先确认，先发布再进入 AI 上下文。
// ---------------------------------------------------------------------------

test("规则1：未确认默认公开时拒绝发布，确认后才放行", () => {
  const h = harness();
  h.store.registerSeat({ seatId: "seat-1", playerId: "player-1" });

  assert.throws(
    () => speak(h.store, "seat-1", "开局问好"),
    probe("default_public_scope_not_confirmed"),
  );

  h.store.confirmDefaultPublicScope({
    seatId: "seat-1",
    roomBindingId: ROOM,
    tableRulesVersion: RULES,
    acknowledged: true,
  });
  const result = speak(h.store, "seat-1", "开局问好");
  assert.equal(result.published.payload.scope, "TABLE_PUBLIC");
});

test("规则1：确认必须显式；桌规版本或绑房变化都要重新确认", () => {
  const h = harness();
  // F3：席位是确认的主体，所以先注册才谈得上表态。不存在的席位没有人能替它确认。
  h.store.registerSeat({ seatId: "seat-1", playerId: "player-1" });
  assert.throws(
    () => h.store.confirmDefaultPublicScope({
      seatId: "seat-1",
      roomBindingId: ROOM,
      tableRulesVersion: RULES,
      acknowledged: false,
    }),
    probe("default_public_scope_not_acknowledged"),
  );

  const t = table();
  assert.throws(
    () => t.store.submitPlayerText({
      seatId: "seat-1",
      text: "换了桌规",
      roomBindingId: ROOM,
      tableRulesVersion: "table-rules-v2",
    }),
    probe("default_public_scope_not_confirmed"),
  );
  assert.throws(
    () => t.store.submitPlayerText({
      seatId: "seat-1",
      text: "换了房间",
      roomBindingId: "room-binding-2",
      tableRulesVersion: RULES,
    }),
    probe("default_public_scope_not_confirmed"),
  );
});

test("规则1：先发布再进入AI上下文，且不做意图分类、无牌局动作效力", () => {
  const t = table(["seat-1"]);
  const order = [];
  t.store.onEvent((event) => order.push(event.type));

  const result = speak(t.store, "seat-1", "我觉得你在诈唬");

  // 发布事件必须先落盘，AI 意向才被算出来。
  assert.deepEqual(order, ["PLAYER_PUBLIC_SPEECH"]);
  assert.equal(result.published.payload.speaker_type, "PLAYER");
  assert.equal(result.published.payload.poker_action_effect, null);
  assert.equal(result.evaluations.length, 1);
  assert.equal(result.evaluations[0].accepted, true);
  assert.equal(
    result.evaluations[0].context.source_event_id,
    result.published.event_id,
  );
});

test("规则1：LOCAL_CONTROL 不公开、不进入AI上下文、不消耗预算", () => {
  const t = table(["seat-1"]);
  const result = t.store.submitPlayerText({
    seatId: "seat-1",
    text: "本地：把气泡关掉",
    channel: "LOCAL_CONTROL",
  });

  assert.equal(result.local_control, true);
  assert.equal(result.published, null);
  assert.deepEqual(result.evaluations, []);
  assert.equal(types(t.store).includes("PLAYER_PUBLIC_SPEECH"), false);
  assert.equal(t.store.seatState("seat-1").player_published_this_hand, 0);
});

// ---------------------------------------------------------------------------
// 规则 2：席位 AI 由白名单事件驱动，每事件每席最多一次，AI 发言不唤醒 AI。
// ---------------------------------------------------------------------------

test("规则2：白名单事件唤醒评估，非白名单事件不唤醒", () => {
  const t = table(["seat-1"]);
  for (const type of WHITELIST_SOURCE_EVENTS) {
    const intents = t.store.notifyDomainEvent({
      type,
      eventId: `evt-${type}`,
      payload: {},
    });
    assert.equal(intents.length, 1, `${type} 应产生意向`);
  }

  assert.deepEqual(
    t.store.notifyDomainEvent({ type: "CARD_DEALT", eventId: "evt-x" }),
    [],
  );
});

test("规则2：AI 公开发言不在白名单内，不得单独唤醒任何席位AI", () => {
  assert.equal(WHITELIST_SOURCE_EVENTS.includes("AI_PUBLIC_SPEECH"), false);

  const t = table(["seat-1", "seat-2"]);
  const spoken = speak(t.store, "seat-1", "我全下");
  const intent = spoken.evaluations.find((item) => item.seat_id === "seat-2");
  const ai = fakeAi([{ decision: "public_speech", text: "他在诈唬" }]);
  const published = runIntent(t.store, intent, ai);
  assert.equal(published.type, "AI_PUBLIC_SPEECH");

  // AI 的发言事件回灌权威层时，不产生任何新的评估意向——否则两席 AI 会无限对话。
  assert.deepEqual(
    t.store.notifyDomainEvent({
      type: "AI_PUBLIC_SPEECH",
      eventId: published.event_id,
      payload: published.payload,
    }),
    [],
  );
});

test("规则2：同一来源事件对同一席位只触发一次评估", () => {
  const t = table(["seat-1"]);
  const first = t.store.notifyDomainEvent({
    type: "SEAT_ACTION_WINDOW_OPENED",
    eventId: "evt-dup",
    payload: {},
  });
  const second = t.store.notifyDomainEvent({
    type: "SEAT_ACTION_WINDOW_OPENED",
    eventId: "evt-dup",
    payload: {},
  });

  assert.equal(first.length, 1);
  assert.equal(first[0].accepted, true);
  assert.deepEqual(second, []);
});

test("规则2：一个来源事件对多席位各触发一次，互不复用额度", () => {
  const t = table(["seat-1", "seat-2", "seat-3"]);
  const intents = t.store.notifyDomainEvent({
    type: "BET",
    eventId: "evt-bet",
    payload: { amount: 200 },
  });

  assert.deepEqual(
    intents.map((item) => item.seat_id),
    ["seat-1", "seat-2", "seat-3"],
  );
  assert.equal(intents.every((item) => item.accepted === true), true);
});

// ---------------------------------------------------------------------------
// 规则 3：LIVELY_V1 四层预算，按 Unicode 字素计数。
// ---------------------------------------------------------------------------

test("规则3：LIVELY_V1 常量锁定，防止预算被静默放宽", () => {
  assert.deepEqual({ ...LIVELY_V1 }, {
    version: "LIVELY_V1",
    maxGraphemesPerMessage: 140,
    playerMaxPerHand: 12,
    playerMaxPerRollingWindow: 3,
    playerRollingWindowMs: 5_000,
    aiMaxPublicPerHand: 8,
    aiMinEvaluationIntervalMs: 5_000,
    bubbleDisplayMs: 10_000,
  });
});

test("规则3：按字素计数而非 UTF-16 长度，140 上限不能被 emoji 绕过", () => {
  assert.equal(countGraphemes(FAMILY), 1);
  assert.equal(FAMILY.length, 8);

  const t = table(["seat-1"]);
  const exactly140 = FAMILY.repeat(140);
  assert.equal(exactly140.length, 1_120);

  const published = speak(t.store, "seat-1", exactly140).published;
  assert.equal(published.payload.graphemes, 140);

  t.advance(5_000);
  assert.throws(
    () => speak(t.store, "seat-1", FAMILY.repeat(141)),
    (error) => error instanceof ProbeError
      && error.code === "message_too_long"
      && error.details.graphemes === 141,
  );
});

test("规则3：玩家短窗限速 3 条/5 秒，边界精确", () => {
  const t = table(["seat-1"]);
  for (let index = 0; index < 3; index += 1) {
    assert.ok(speak(t.store, "seat-1", `第 ${index} 条`).published);
  }
  assert.throws(() => speak(t.store, "seat-1", "第四条"), probe("player_rate_limited"));

  t.advance(4_999);
  assert.throws(() => speak(t.store, "seat-1", "还差 1ms"), probe("player_rate_limited"));

  t.advance(1);
  assert.ok(speak(t.store, "seat-1", "窗口刚好滑过").published);
});

test("规则3：玩家每手 12 条上限，换手后重置", () => {
  const t = table(["seat-1"]);
  // 每 3 条推进一个滚动窗口，把短窗限速与每手额度解耦。
  for (let batch = 0; batch < 4; batch += 1) {
    for (let index = 0; index < 3; index += 1) {
      speak(t.store, "seat-1", `批 ${batch} 条 ${index}`);
    }
    t.advance(5_000);
  }
  assert.equal(t.store.seatState("seat-1").player_published_this_hand, 12);
  assert.throws(
    () => speak(t.store, "seat-1", "第 13 条"),
    probe("player_hand_quota_exhausted"),
  );

  t.store.startHand();
  assert.equal(t.store.seatState("seat-1").player_published_this_hand, 0);
  assert.ok(speak(t.store, "seat-1", "新一手第一条").published);
});

test("规则3：回合内外玩家适用同一预算，非当前行动者不获更宽额度", () => {
  const t = table(["seat-1", "seat-2"]);
  // seat-1 是当前行动者，seat-2 不是；预算按席独立记账但阈值必须完全相同。
  t.store.notifyDomainEvent({
    type: "SEAT_ACTION_WINDOW_OPENED",
    eventId: "evt-window",
    payload: { seat_id: "seat-1" },
  });

  for (let index = 0; index < LIVELY_V1.playerMaxPerRollingWindow; index += 1) {
    assert.ok(speak(t.store, "seat-1", `行动者 ${index}`).published);
    assert.ok(speak(t.store, "seat-2", `旁观者 ${index}`).published);
  }

  // 两边在同一条限制上同时耗尽，非当前行动者没有拿到更宽的窗口。
  assert.throws(() => speak(t.store, "seat-1", "行动者超额"), probe("player_rate_limited"));
  assert.throws(() => speak(t.store, "seat-2", "旁观者超额"), probe("player_rate_limited"));
  assert.equal(
    t.store.seatState("seat-1").player_published_this_hand,
    t.store.seatState("seat-2").player_published_this_hand,
  );
});

test("规则3：AI 每手 8 条公开上限，silent 不消耗额度", () => {
  const t = table(["seat-1"]);
  const ai = fakeAi(new Array(8).fill({ decision: "public_speech", text: "跟" }));

  for (let index = 0; index < 8; index += 1) {
    const [intent] = t.store.notifyDomainEvent({
      type: "BET",
      eventId: `evt-${index}`,
      payload: { round: index },
    });
    assert.equal(intent.accepted, true, `第 ${index} 次应被接受`);
    assert.equal(runIntent(t.store, intent, ai).type, "AI_PUBLIC_SPEECH");
    t.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  }

  const state = t.store.seatState("seat-1");
  assert.equal(state.ai_published_this_hand, 8);
  assert.equal(state.ai_hand_quota_remaining, 0);

  // 第 9 次连唤醒都不再被接受，且直接拒绝显式启动。
  const [ninth] = t.store.notifyDomainEvent({
    type: "BET",
    eventId: "evt-9",
    payload: {},
  });
  assert.equal(ninth.accepted, false);
  assert.equal(ninth.reason, "ai_hand_quota_exhausted");
  // 额度耗尽同样表现为「没有活可领」：notifyDomainEvent 在登记工作项之前就先看额度，
  // promotePendingContext 也一样。startEvaluation 里那道额度闸门保留着，但走公开接口
  // 到不了它——不为一道到不了的闸门编造覆盖。
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), [], "额度耗尽时不该有活可领");

  // 换手重置额度。
  t.store.startHand();
  assert.equal(t.store.seatState("seat-1").ai_hand_quota_remaining, 8);
});

test("规则3：silent 决策不占用 AI 每手额度", () => {
  const t = table(["seat-1"]);
  const ai = fakeAi([{ decision: "silent" }, { decision: "silent" }]);

  for (let index = 0; index < 2; index += 1) {
    const [intent] = t.store.notifyDomainEvent({
      type: "RAISE",
      eventId: `evt-silent-${index}`,
      payload: {},
    });
    assert.equal(runIntent(t.store, intent, ai).type, "SEAT_AI_SILENT");
    t.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  }

  const state = t.store.seatState("seat-1");
  assert.equal(state.ai_published_this_hand, 0);
  assert.equal(state.ai_hand_quota_remaining, 8);
  assert.equal(state.status, "IDLE");
});

test("规则3：AI 评估启动间隔不少于 5 秒", () => {
  const t = table(["seat-1"]);
  const [first] = t.store.notifyDomainEvent({
    type: "BET",
    eventId: "evt-a",
    payload: {},
  });
  runIntent(t.store, first, fakeAi([{ decision: "silent" }]));

  t.advance(4_999);
  const [tooSoon] = t.store.notifyDomainEvent({
    type: "BET",
    eventId: "evt-b",
    payload: {},
  });
  assert.equal(tooSoon.accepted, false);
  assert.equal(tooSoon.reason, "cooldown");
  assert.equal(tooSoon.cooldown_remaining_ms, 1);
  // 冷却期内没有活可领。以前这里是拿一个自制 context 直接调 startEvaluation 撞
  // evaluation_cooldown；现在宿主拿不到 intent_id，所以先撞的是「无活可领」。
  // 那道冷却闸门保留在回合创建点，只是走公开接口到不了——工作项只在冷却为 0 时登记。
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), [], "冷却期内不该有活可领");
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: "intent-does-not-exist" }),
    probe("intent_not_found"),
  );

  t.advance(1);
  assert.equal(t.store.seatState("seat-1").cooldown_remaining_ms, 0);
  const [ok] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-c", payload: {} });
  assert.equal(ok.accepted, true);
});

// ---------------------------------------------------------------------------
// 规则 4：每席同时最多一个模型回合；思考/冷却期的新事件合并为最新上下文。
// ---------------------------------------------------------------------------

test("规则4：同席不得并发两个模型回合", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  // 同一个 intent_id 再起一次：工作项已被消费，撞的是 intent_not_found。
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id }),
    probe("intent_not_found"),
  );
  // 思考期内的新事件合并成 pending，不排第二个工作项——所以「能领到的活」本身就不含
  // 这一席。并发不再靠 startEvaluation 里那道闸门挡住，而是队列压根不发第二份工作。
  //
  // 那道闸门保留着（回合创建点该有的检查就得在回合创建点），但走公开接口已经撞不到它：
  // 工作项只在 active_turn 为空时才登记，而回合只由消费工作项产生。这里不假装覆盖它。
  const [next] = t.store.notifyDomainEvent({ type: "RAISE", eventId: "evt-2", payload: {} });
  assert.equal(next.accepted, false, "思考期内的新事件应当合并，不该再排一个工作项");
  assert.equal(next.reason, "merged_into_pending");
  assert.deepEqual(t.store.claimIntents({ seatId: "seat-1" }), [], "思考中的席位不该有活可领");
  assert.equal(t.store.seatState("seat-1").status, "THINKING");
});

test("规则4：思考期内多事件合并为一个最新上下文，不排队逐条调用", () => {
  const t = table(["seat-1"]);
  const [first] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: { n: 1 } });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });

  const [second] = t.store.notifyDomainEvent({ type: "RAISE", eventId: "evt-2", payload: { n: 2 } });
  const [third] = t.store.notifyDomainEvent({
    type: "STREET_ADVANCED",
    eventId: "evt-3",
    payload: { n: 3 },
  });
  assert.equal(second.accepted, false);
  assert.equal(second.reason, "merged_into_pending");
  assert.equal(third.accepted, false);
  assert.equal(third.reason, "merged_into_pending");

  // 只保留最新上下文；两条事件没有各自排出一个回合。
  assert.equal(t.store.seatState("seat-1").has_pending_context, true);
  resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "silent",
  });
  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs);

  // F5 要求 4：冷却过后这份 dirty context 自己变成可领工作项。
  // 以前这里是测试代码手动再调一次 startEvaluation，真实适配器要么去 view.seat 里翻
  // has_pending_context，要么这条上下文永远搁着。现在宿主只做它本来就要做的事：领活。
  const [resumedIntent] = t.store.claimIntents({ seatId: "seat-1" });
  assert.ok(resumedIntent !== undefined, "冷却到期后这份上下文没有变成可领工作项");
  assert.equal(resumedIntent.context.source_event_id, "evt-3");
  const resumed = t.store.startEvaluation({
    seatId: "seat-1",
    intentId: resumedIntent.intent_id,
  });
  assert.equal(resumed.payload.source_event_id, "evt-3");
  assert.equal(t.store.seatState("seat-1").has_pending_context, false);
  assert.equal(
    types(t.store).filter((type) => type === "SEAT_AI_EVALUATION_STARTED").length,
    2,
  );
});

// ---------------------------------------------------------------------------
// 规则 5：AI 生成不暂停真人倒计时；迟到输出按同手/跨街/跨手分别处置。
// ---------------------------------------------------------------------------

test("规则5：同手同街的迟到输出照常公开，无需标注", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  // 模型慢了 30 秒才回来：权威层不因此触碰任何行动窗口。
  t.advance(30_000);
  const published = resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "这注下得有点急",
  });

  assert.equal(published.type, "AI_PUBLIC_SPEECH");
  assert.equal(published.payload.late_annotation, null);
  assert.equal(published.payload.poker_action_effect, null);
  assert.equal(published.payload.speaker_type, "SEAT_AI");
  // 内核完全不记录任何行动窗口事件，无法延长或暂停倒计时。
  assert.equal(
    types(t.store).some((type) => type.includes("ACTION_WINDOW")),
    false,
  );
});

test("规则5：同手已跨街的迟到输出必须带醒目标注", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  t.store.advanceStreet({ street: "flop" });
  const published = resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "翻牌前那手我本来想说的",
  });

  assert.equal(published.payload.late_annotation, "延迟 · 基于前一街");
  assert.equal(published.payload.based_on_street, "preflop");
  assert.equal(published.payload.street, "flop");
  assert.equal(t.store.seatState("seat-1").ai_published_this_hand, 1);
});

test("规则5：跨手的迟到输出必须丢弃，且不占用新一手额度", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  t.store.startHand();
  const resolved = resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "上一手的话现在才说出来",
  });

  assert.equal(resolved.type, "SEAT_AI_OUTPUT_DISCARDED");
  assert.equal(resolved.payload.reason, "hand_advanced");
  assert.equal(resolved.payload.started_hand_index, 0);
  assert.equal(resolved.payload.current_hand_index, 1);
  assert.equal(types(t.store).includes("AI_PUBLIC_SPEECH"), false);

  const state = t.store.seatState("seat-1");
  assert.equal(state.ai_published_this_hand, 0);
  assert.equal(state.ai_hand_quota_remaining, LIVELY_V1.aiMaxPublicPerHand);
});

test("规则5：AI 输出同样受 140 字素上限约束，超限进入可理解的降级状态", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  assert.throws(
    () => resolveVia(t.store, {
      seatId: "seat-1",
      turnId: started.payload.turn_id,
      decision: "public_speech",
      text: FAMILY.repeat(141),
    }),
    probe("message_too_long"),
  );
  assert.equal(t.store.seatState("seat-1").status, "DEGRADED");
  assert.equal(types(t.store).includes("AI_PUBLIC_SPEECH"), false);
});

test("规则5：重复结算同一回合被拒绝", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  const args = {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "silent",
  };

  t.store.resolveEvaluation(args);
  assert.throws(() => t.store.resolveEvaluation(args), probe("turn_not_active"));
});

// ---------------------------------------------------------------------------
// 规则 6：玩家随时可关席位 AI；关闭后不得再发言，故障只显示可理解状态。
// ---------------------------------------------------------------------------

test("规则6：切到 OFF 后停止新评估，并取消在途回合", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });

  const changed = t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  assert.equal(changed.payload.mode, "OFF");
  assert.equal(changed.payload.status, "OFF");
  assert.equal(changed.payload.cancelled_turn_id, started.payload.turn_id);

  // 关闭后新的白名单事件不再产生任何意向。
  assert.deepEqual(
    t.store.notifyDomainEvent({ type: "RAISE", eventId: "evt-2", payload: {} }),
    [],
  );
  assert.throws(
    () => t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id }),
    probe("seat_ai_off"),
  );
});

test("规则6：OFF 后回来的迟到结果一律丢弃，不得公开", () => {
  const t = table(["seat-1"]);
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });

  t.advance(2_000);
  const resolved = resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "关掉之后才生成出来的话",
  });

  assert.equal(resolved.type, "SEAT_AI_OUTPUT_DISCARDED");
  assert.equal(resolved.payload.reason, "seat_ai_off");
  assert.equal(types(t.store).includes("AI_PUBLIC_SPEECH"), false);
  assert.equal(t.store.publicTimeline().length, 0);
});

test("规则6：重新开启不补跑关闭期间的事件", () => {
  const t = table(["seat-1"]);
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  t.store.notifyDomainEvent({ type: "BET", eventId: "evt-off-1", payload: {} });
  t.store.notifyDomainEvent({ type: "RAISE", eventId: "evt-off-2", payload: {} });

  t.store.setSeatAiMode({ seatId: "seat-1", mode: "ON" });
  const state = t.store.seatState("seat-1");
  assert.equal(state.status, "IDLE");
  assert.equal(state.has_pending_context, false);
  assert.throws(() => t.store.startEvaluation({ seatId: "seat-1" }), probe("invalid_field"));

  // 只有关闭之后的新事件才唤醒。
  const [intent] = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-on-1", payload: {} });
  assert.equal(intent.accepted, true);
  assert.equal(intent.context.source_event_id, "evt-on-1");
});

test("规则6：故障只暴露可理解状态，不接受影子AI之类的隐式替换", () => {
  const t = table(["seat-1"]);
  const degraded = t.store.setSeatStatus({ seatId: "seat-1", status: "DEGRADED" });
  assert.equal(degraded.payload.status, "DEGRADED");
  t.store.setSeatStatus({ seatId: "seat-1", status: "OFFLINE" });
  assert.equal(t.store.seatState("seat-1").status, "OFFLINE");

  assert.throws(
    () => t.store.setSeatStatus({ seatId: "seat-1", status: "SHADOW_AI" }),
    probe("invalid_field"),
  );

  // OFF 的席位不能被偷偷改回工作中的状态。
  t.store.setSeatAiMode({ seatId: "seat-1", mode: "OFF" });
  assert.throws(
    () => t.store.setSeatStatus({ seatId: "seat-1", status: "IDLE" }),
    probe("seat_ai_off"),
  );
});

// ---------------------------------------------------------------------------
// 规则 7：本地隐藏只改变该查看者渲染，不删除权威事件、不改变他人所见。
// ---------------------------------------------------------------------------

test("规则7：本地隐藏不写权威事件，只影响该查看者的渲染", () => {
  const t = table(["seat-1", "seat-2"]);
  const spoken = speak(t.store, "seat-1", "我这手很强");
  const intent = spoken.evaluations.find((item) => item.seat_id === "seat-2");
  runIntent(t.store, intent, fakeAi([{ decision: "public_speech", text: "他在诈唬" }]));

  const eventCountBefore = t.store.events.length;
  const result = t.store.setLocalHidden({
    viewerSeatId: "seat-1",
    target: "ai",
    targetId: "seat-2",
  });
  assert.equal(result.hidden, true);
  // 关键：隐藏不落任何权威事件。
  assert.equal(t.store.events.length, eventCountBefore);

  const viewerOne = t.store.publicTimeline({ viewerSeatId: "seat-1" });
  const viewerTwo = t.store.publicTimeline({ viewerSeatId: "seat-2" });
  const authoritative = t.store.publicTimeline();

  // 三份时间线长度与顺序完全一致，只有渲染标记不同。
  assert.equal(viewerOne.length, 2);
  assert.equal(viewerTwo.length, 2);
  assert.equal(authoritative.length, 2);
  assert.deepEqual(
    viewerOne.map((event) => event.sequence),
    authoritative.map((event) => event.sequence),
  );
  assert.deepEqual(
    viewerOne.map((event) => event.locally_hidden_for_viewer),
    [false, true],
  );
  assert.deepEqual(
    viewerTwo.map((event) => event.locally_hidden_for_viewer),
    [false, false],
  );
});

test("规则7：隐藏玩家与隐藏其席位AI相互独立，且可撤销", () => {
  const t = table(["seat-1", "seat-2"]);
  const spoken = speak(t.store, "seat-2", "我跟");
  const intent = spoken.evaluations.find((item) => item.seat_id === "seat-2");
  runIntent(t.store, intent, fakeAi([{ decision: "public_speech", text: "这把稳了" }]));

  // 只屏蔽真人，不屏蔽同席 AI。
  t.store.setLocalHidden({
    viewerSeatId: "seat-1",
    target: "player",
    targetId: "player-seat-2",
  });
  assert.deepEqual(
    t.store.publicTimeline({ viewerSeatId: "seat-1" })
      .map((event) => event.locally_hidden_for_viewer),
    [true, false],
  );

  // 撤销后恢复可见。
  t.store.setLocalHidden({
    viewerSeatId: "seat-1",
    target: "player",
    targetId: "player-seat-2",
    hidden: false,
  });
  assert.deepEqual(
    t.store.publicTimeline({ viewerSeatId: "seat-1" })
      .map((event) => event.locally_hidden_for_viewer),
    [false, false],
  );

  // 整席屏蔽会同时盖住真人与该席 AI。
  t.store.setLocalHidden({ viewerSeatId: "seat-1", target: "seat", targetId: "seat-2" });
  assert.deepEqual(
    t.store.publicTimeline({ viewerSeatId: "seat-1" })
      .map((event) => event.locally_hidden_for_viewer),
    [true, true],
  );
});

// ---------------------------------------------------------------------------
// 集成：一手牌走完整链路，确认权威顺序与预算联合生效。
// ---------------------------------------------------------------------------

test("集成：玩家发言 -> 席位AI评估 -> 公开输出的权威顺序稳定", () => {
  const t = table(["seat-1", "seat-2"]);
  const observed = [];
  t.store.onEvent((event) => observed.push(event.type));

  const spoken = speak(t.store, "seat-1", "你这注像在偷池");
  const intent = spoken.evaluations.find((item) => item.seat_id === "seat-2");
  const ai = fakeAi([{ decision: "public_speech", text: "偷池的是你吧" }]);
  runIntent(t.store, intent, ai);

  assert.deepEqual(observed, [
    "PLAYER_PUBLIC_SPEECH",
    "SEAT_AI_EVALUATION_STARTED",
    "AI_PUBLIC_SPEECH",
  ]);
  // 假 AI 只被调用一次，且拿到的是刚发布那条的事件 ID。
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].source_event_id, spoken.published.event_id);
  assert.equal(ai.calls[0].payload.text, "你这注像在偷池");
});

test("集成：一手牌内多街推进，各席位额度与标注独立记账", () => {
  const t = table(["seat-1", "seat-2"]);
  const ai = fakeAi([
    { decision: "public_speech", text: "翻牌前就该弃" },
    { decision: "public_speech", text: "转牌这张危险" },
  ]);

  const [preflop] = t.store.notifyDomainEvent({
    type: "SEAT_ACTION_WINDOW_OPENED",
    eventId: "evt-preflop",
    payload: { seat_id: "seat-1" },
  }).filter((item) => item.seat_id === "seat-1");
  runIntent(t.store, preflop, ai);

  t.advance(LIVELY_V1.aiMinEvaluationIntervalMs);
  const advanced = t.store.advanceStreet({ street: "turn" });
  const turnIntent = advanced.evaluations.find((item) => item.seat_id === "seat-1");
  assert.equal(turnIntent.accepted, true);
  const secondPublish = runIntent(t.store, turnIntent, ai);

  // 同街内生成，不该标注延迟。
  assert.equal(secondPublish.payload.late_annotation, null);
  assert.equal(secondPublish.payload.street, "turn");
  assert.equal(t.store.seatState("seat-1").ai_published_this_hand, 2);
  // seat-2 从未启动评估，额度不受影响。
  assert.equal(t.store.seatState("seat-2").ai_published_this_hand, 0);
});

test("边界：未注册席位、非法枚举与空文本都被确定性拒绝", () => {
  const t = table(["seat-1"]);
  assert.throws(() => t.store.seatState("seat-404"), probe("seat_not_found"));
  assert.throws(
    () => t.store.registerSeat({ seatId: "seat-1", playerId: "player-dup" }),
    probe("seat_already_registered"),
  );
  assert.throws(
    () => t.store.setSeatAiMode({ seatId: "seat-1", mode: "MAYBE" }),
    probe("invalid_field"),
  );
  assert.throws(() => speak(t.store, "seat-1", "   "), probe("invalid_field"));
  assert.throws(
    () => t.store.submitPlayerText({
      seatId: "seat-1",
      text: "走私有频道",
      channel: "WHISPER",
      roomBindingId: ROOM,
      tableRulesVersion: RULES,
    }),
    probe("invalid_field"),
  );
});














