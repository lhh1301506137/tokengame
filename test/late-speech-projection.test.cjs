"use strict";

// 确定性脚本集成：真实 CommandSurface -> TableOrchestrator/SeatAiStore ->
// view.timeline -> table-view.v1。只注入时钟、ID、测试凭据和牌堆，不调用宿主或真实模型。
// 街道/手数由合法扑克动作推进，迟到字段必须来自真实 ai.resolve，不能手造 payload。
const assert = require("node:assert/strict");
const test = require("node:test");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { SeatAiStore } = require("../src/authority/seat-ai-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const viewModel = require("../src/host/table-view-model.cjs");
const { actionBindingFromProjection } = require("../test-support/action-binding.cjs");
const { confirmAllSeatsViaSurface } = require("../test-support/public-scope.cjs");

function table() {
  let now = 1_000_000;
  let id = 0;
  const surface = new CommandSurface({
    now: () => now,
    idFactory: () => `late-test-${++id}`,
    tokenFactory: () => `late-test-token-${++id}`,
    deckFactory: () => stackedDeck(["As", "Kd", "Qh", "Jc", "2c", "3d", "4h", "5s", "6c"]),
  });
  assert.ok(surface.orchestrator.ai instanceof SeatAiStore, "必须经过真实公开发言 producer");
  const created = surface.dispatch("room.create", {
    player_id: "player-a", table_rules_version: "table-rules-v1",
  });
  const joined = surface.dispatch("room.join", {
    player_id: "player-b", invite_code: created.invite_code,
  });
  const bindings = [created, joined].map((result) => ({
    seat_id: result.seat.seat_id,
    player_id: result.seat.player_id,
    recovery_credential: result.recovery_credential,
  }));
  const forSeat = (index, command, params = {}) => surface.dispatch(command, {
    ...params,
    seat_id: bindings[index].seat_id,
    recovery_credential: bindings[index].recovery_credential,
  });
  confirmAllSeatsViaSurface(surface, bindings);
  for (let index = 0; index < bindings.length; index += 1) {
    forSeat(index, "seat.connect", { connection_id: `connection-${index}` });
    forSeat(index, "seat.ready", { ready: true });
  }
  surface.dispatch("hand.evaluate_start");
  now += TABLE_LIFECYCLE_V1.readyCountdownMs;
  assert.equal(surface.dispatch("hand.start_if_due").started, true);

  const projection = () => surface.dispatch("view.projection");
  const timeline = (viewerIndex = 0) => surface.dispatch("view.timeline", {
    viewer_seat_id: bindings[viewerIndex].seat_id,
  }).timeline;
  return {
    surface,
    bindings,
    forSeat,
    projection,
    timeline,
    advance: (ms) => { now += ms; },
    view(viewerIndex) {
      const current = projection();
      const aiStates = Object.fromEntries(bindings.map((binding) => [
        binding.seat_id,
        surface.dispatch("view.seat", { seat_id: binding.seat_id }).ai,
      ]));
      return viewModel.build({
        roomState: current.room,
        publicHand: current.public_hand,
        privateHand: forSeat(viewerIndex, "view.hand").hand,
        timeline: timeline(viewerIndex),
        aiStates,
        viewerSeatId: bindings[viewerIndex].seat_id,
        currentPolicyEpoch: current.policy_epoch,
        now,
      });
    },
    actNext(action = null) {
      const hand = projection().public_hand;
      const index = bindings.findIndex((binding) => binding.player_id === hand.actor_player_id);
      assert.notEqual(index, -1, "必须有一个真实当前行动席位");
      const legal = forSeat(index, "view.hand").hand.legal_actions;
      const chosen = action ?? (legal.some((entry) => entry.type === "check") ? "check" : "call");
      const result = forSeat(index, "hand.act", {
        action: chosen,
        ...actionBindingFromProjection(hand),
      });
      assert.equal(result.result.accepted, true);
      return result;
    },
  };
}

function reachStreet(ctx, street) {
  for (let step = 0; step < 8 && ctx.projection().public_hand.street !== street; step += 1) {
    ctx.actNext();
  }
  assert.equal(ctx.projection().public_hand.street, street, "合法扑克动作没有推进到预期街道");
}

function startAi(ctx) {
  ctx.forSeat(1, "chat.say", { text: "这手你怎么看？", idempotency_key: "late-test-source" });
  const source = ctx.timeline();
  assert.equal(source.length, 1);
  assert.equal(source[0].type, "PLAYER_PUBLIC_SPEECH");
  const { intents } = ctx.forSeat(0, "ai.take_intents");
  assert.equal(intents.length, 1, "只领取本席唯一真实待办");
  const { started } = ctx.forSeat(0, "ai.start", {
    intent_id: intents[0].intent_id,
    claim_token: intents[0].claim_token,
  });
  assert.equal(started.source_event_id, source[0].event_id);
  return started;
}

function publishAi(ctx, started) {
  const before = ctx.projection().public_hand;
  const { resolved } = ctx.forSeat(0, "ai.resolve", {
    turn_id: started.turn_id,
    decision: "public_speech",
    text: "all-in 200，只是公开话术",
  });
  assert.deepEqual(ctx.projection().public_hand, before, "公开话术不得改牌局或行动截止时间");
  const published = ctx.timeline().filter((event) => event.type === "AI_PUBLIC_SPEECH");
  assert.equal(published.length, 1, "真实 producer 必须恰好发布一次");
  assert.deepEqual(published[0].payload, resolved, "投影入口不能用自造 payload 替换 resolve 输出");
  assert.equal(Object.hasOwn(resolved, "late"), false, "真实权威不输出展示层 late 布尔");
  assert.equal(resolved.poker_action_effect, null);
  return published[0];
}

function assertProjected(ctx, viewerIndex, event, { late, hidden = false, bubble = true }) {
  const view = ctx.view(viewerIndex);
  assert.equal(view.contract, "tokengame.table-view.v1");
  assert.equal(view.seats.length, 2);
  assert.equal(view.messages.length, 2, "来源玩家发言与 AI 发言都应保留");
  const messages = view.messages.filter((message) => message.sequence === event.sequence);
  assert.equal(messages.length, 1, "公开时间线必须包含这一条真实 AI 发言");
  const owner = view.seats.find((seat) => seat.seat_id === event.payload.seat_id);
  assert.ok(owner, "AI 发言必须属于真实席位");
  const beside = owner.recent_speech.filter((entry) => entry.sequence === event.sequence);
  assert.equal(beside.length, bubble ? 1 : 0, "座位气泡只受发布时刻 TTL 控制");
  for (const entry of [...messages, ...beside]) {
    assert.equal(entry.late, late, "权威迟到标注在 table-view.v1 映射中丢失或被重判");
    assert.equal(entry.based_on_street, event.payload.based_on_street);
    assert.equal(entry.text, event.payload.text);
    assert.equal(entry.speaker_type, "SEAT_AI");
    assert.equal(entry.hidden, hidden);
  }
  const other = view.seats.find((seat) => seat.seat_id !== owner.seat_id);
  assert.ok(other);
  assert.equal(other.recent_speech.filter((entry) => entry.sequence === event.sequence).length, 0);
  return view;
}

for (const [origin, destination] of [["preflop", "flop"], ["flop", "turn"]]) {
  test(`真实 producer→projection：同手 ${origin}→${destination} 的迟到标注保留到两席时间线与气泡`, () => {
    const ctx = table();
    reachStreet(ctx, origin);
    const started = startAi(ctx);
    const originalHand = ctx.projection().public_hand.hand_id;
    assert.equal(started.street, origin);
    ctx.advance(7_000);
    reachStreet(ctx, destination);
    assert.equal(ctx.projection().public_hand.hand_id, originalHand);
    const event = publishAi(ctx, started);
    assert.equal(event.payload.late_annotation, "延迟 · 基于前一街");
    assert.equal(event.payload.based_on_street, origin);
    assert.equal(event.payload.street, destination);
    for (let viewer = 0; viewer < 2; viewer += 1) {
      assertProjected(ctx, viewer, event, { late: true });
    }
  });
}

test("真实 producer→projection：同街正常回复不标迟到，之后街道推进也不重判历史", () => {
  const ctx = table();
  const started = startAi(ctx);
  ctx.advance(7_000);
  const event = publishAi(ctx, started);
  assert.equal(event.payload.late_annotation, null);
  assert.equal(event.payload.based_on_street, "preflop");
  assert.equal(event.payload.street, "preflop");
  for (let viewer = 0; viewer < 2; viewer += 1) {
    assertProjected(ctx, viewer, event, { late: false });
    const playerMessage = ctx.view(viewer).messages.filter((message) => message.speaker_type === "PLAYER");
    assert.equal(playerMessage.length, 1);
    assert.equal(playerMessage[0].late, false);
  }
  reachStreet(ctx, "flop");
  for (let viewer = 0; viewer < 2; viewer += 1) {
    assertProjected(ctx, viewer, event, { late: false });
  }
});

test("真实 producer→projection：迟到发言本地隐藏可逆，发布后 TTL 到期只退出气泡", () => {
  const ctx = table();
  const started = startAi(ctx);
  ctx.advance(7_000);
  reachStreet(ctx, "flop");
  const event = publishAi(ctx, started);
  assert.equal(event.payload.late_annotation, "延迟 · 基于前一街");
  const authoritativeBefore = ctx.projection().public_timeline;
  const quotaBefore = ctx.surface.dispatch("view.seat", { seat_id: ctx.bindings[0].seat_id }).ai.ai_hand_quota_remaining;
  ctx.forSeat(1, "ai.hide_local", { target: "ai", target_id: ctx.bindings[0].seat_id });
  assertProjected(ctx, 1, event, { late: true, hidden: true });
  assertProjected(ctx, 0, event, { late: true });
  ctx.forSeat(1, "ai.hide_local", { target: "ai", target_id: ctx.bindings[0].seat_id, hidden: false });
  assertProjected(ctx, 1, event, { late: true });
  assert.deepEqual(ctx.projection().public_timeline, authoritativeBefore, "隐藏不可改变权威公开历史");
  assert.equal(ctx.surface.dispatch("view.seat", { seat_id: ctx.bindings[0].seat_id }).ai.ai_hand_quota_remaining, quotaBefore);
  ctx.advance(viewModel.SEAT_SPEECH_TTL_MS);
  for (let viewer = 0; viewer < 2; viewer += 1) {
    assertProjected(ctx, viewer, event, { late: true });
  }
  ctx.advance(1);
  for (let viewer = 0; viewer < 2; viewer += 1) {
    assertProjected(ctx, viewer, event, { late: true, bubble: false });
  }
  assert.deepEqual(ctx.projection().public_timeline, authoritativeBefore, "气泡到期不可删除权威公开历史");
});

test("真实 producer→projection：跨手旧回复仍由权威丢弃，不产生气泡或占用新手额度", () => {
  const ctx = table();
  const started = startAi(ctx);
  const oldHand = ctx.projection().public_hand.hand_id;
  ctx.actNext("fold");
  assert.equal(ctx.projection().public_hand.status, "complete");
  ctx.surface.dispatch("hand.evaluate_start");
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  assert.equal(ctx.surface.dispatch("hand.start_if_due").started, true);
  const newHand = ctx.projection().public_hand;
  assert.notEqual(newHand.hand_id, oldHand);
  const quotaBefore = ctx.surface.dispatch("view.seat", { seat_id: ctx.bindings[0].seat_id }).ai.ai_hand_quota_remaining;
  const { resolved } = ctx.forSeat(0, "ai.resolve", {
    turn_id: started.turn_id,
    decision: "public_speech",
    text: "上一手的回复，不应公开",
  });
  assert.equal(resolved.reason, "hand_advanced");
  assert.deepEqual(ctx.projection().public_hand, newHand, "丢弃不得恢复旧动作窗口或改变新手");
  assert.equal(ctx.surface.dispatch("view.seat", { seat_id: ctx.bindings[0].seat_id }).ai.ai_hand_quota_remaining, quotaBefore);
  assert.equal(ctx.timeline().length, 1, "只应留下已发布的玩家来源消息");
  for (let viewer = 0; viewer < 2; viewer += 1) {
    const view = ctx.view(viewer);
    assert.equal(view.messages.length, 1);
    assert.equal(view.messages.filter((message) => message.speaker_type === "SEAT_AI").length, 0);
    assert.equal(view.seats.flatMap((seat) => seat.recent_speech)
      .filter((entry) => entry.speaker_type === "SEAT_AI").length, 0);
  }
});
