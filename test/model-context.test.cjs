"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { createCommandServer } = require("../src/authority/command-server.cjs");
const { InProcessCoreClient, HttpCoreClient } = require("../src/host/core-client.cjs");
const { LIVELY_V1 } = require("../src/authority/seat-ai-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

async function setup(t, transport = "in_process", extra = {}) {
  let at = 1_000_000;
  const surface = new CommandSurface({
    now: () => at,
    deckFactory: () => stackedDeck(["As", "Kd", "Qh", "Jc", "Ts", "9d", "2c", "3d", "4h", "5s", "6c"]),
    ...extra,
  });
  let core = new InProcessCoreClient({ surface });
  if (transport === "http") {
    const server = createCommandServer({ surface, dueWork: false, internalToken: "model-context-core" });
    const address = await server.start({ port: 0 });
    t.after(() => server.stop());
    core = new HttpCoreClient({ origin: address, token: "model-context-core" });
  }
  const a = await core.dispatch("room.create", { player_id: "context-a", table_rules_version: "context-rules" });
  const b = await core.dispatch("room.join", { player_id: "context-b", invite_code: a.invite_code });
  const act = (entry, command, params = {}) => core.dispatch(command, {
    seat_id: entry.seat.seat_id, recovery_credential: entry.recovery_credential, ...params,
  });
  for (const entry of [a, b]) {
    await act(entry, "room.confirm_public_scope", { acknowledged: true });
    await act(entry, "seat.connect", { connection_id: `${entry.seat.player_id}-conn` });
    await act(entry, "seat.ready");
  }
  await core.dispatch("hand.evaluate_start");
  at += 3_500;
  assert.equal((await core.dispatch("hand.start_if_due")).started, true);
  const say = (entry, text) => act(entry, "chat.say", { text, idempotency_key: require("node:crypto").randomUUID() });
  return { surface, core, a, b, act, say, advance: (ms) => { at += ms; } };
}

for (const transport of ["in_process", "http"]) {
  test(`${transport}: ai.start 同步返回当前权威上下文和本席手牌，不用旧 claim 快照`, async (t) => {
    const f = await setup(t, transport);
    const claim = (await f.act(f.a, "ai.take_intents")).intents;
    assert.equal(claim.length, 1);
    const old = claim[0];
    await f.say(f.b, "newest-authoritative-source");
    const start = await f.act(f.a, "ai.start", { intent_id: old.intent_id, claim_token: old.claim_token,
      context: { payload: { text: "model-forged-context" } } });
    assert.equal(start.started.seat_id, f.a.seat.seat_id);
    const context = start.model_context;
    assert.ok(context, "旧实现只有 started，缺少供模型推理的本席上下文");
    assert.equal(context.schema, "tokengame.seat-ai-context.v1");
    assert.equal(context.seat_id, f.a.seat.seat_id);
    assert.equal(context.player_id, "context-a");
    assert.equal(context.turn_id, start.started.turn_id);
    assert.equal(context.source_event.source_event_id, start.started.source_event_id);
    assert.notEqual(context.source_event.source_event_id, old.context.source_event_id);
    assert.equal(context.source_event.payload.text, "newest-authoritative-source");
    assert.equal(JSON.stringify(context).includes("model-forged-context"), false);
    assert.deepEqual(context.hand, (await f.act(f.a, "view.hand")).hand);
    assert.equal(context.hand.seats.length, 2);
    const own = context.hand.seats.find((seat) => seat.id === "context-a");
    const opponent = context.hand.seats.find((seat) => seat.id === "context-b");
    assert.equal(own.hole_cards.length, 2);
    assert.equal(opponent.hole_cards, null);
    assert.equal(context.timeline_total, 1);
    assert.equal(context.timeline.length, 1);
    assert.equal(context.timeline_truncated, false);
    assert.deepEqual(context.room, (await f.core.dispatch("view.projection")).room);
    const otherClaims = (await f.act(f.b, "ai.take_intents")).intents;
    assert.equal(otherClaims.length, 1);
    const other = await f.act(f.b, "ai.start", { intent_id: otherClaims[0].intent_id, claim_token: otherClaims[0].claim_token });
    assert.equal(other.model_context.hand.seats.find((seat) => seat.id === "context-a").hole_cards, null);
    assert.equal(other.model_context.hand.seats.find((seat) => seat.id === "context-b").hole_cards.length, 2);
    const events = (await f.core.dispatch("view.ai_events")).events;
    const startedEvents = events.filter((event) => event.type === "SEAT_AI_EVALUATION_STARTED");
    assert.equal(startedEvents.length, 2);
    assert.equal(JSON.stringify(events).includes("model_context"), false);
    assert.equal(JSON.stringify(events).includes("hole_cards"), false);
    const publicHand = (await f.core.dispatch("view.projection")).public_hand;
    assert.equal(publicHand.seats.length, 2);
    for (const seat of publicHand.seats) assert.equal(seat.hole_cards, null);
    context.source_event.payload.text = "mutated-copy";
    context.hand.seats[0].hole_cards = ["2s", "2h"];
    assert.equal(f.surface.orchestrator.ai.seats.get(f.a.seat.seat_id).active_turn.context.payload.text, "newest-authoritative-source");
  });
}

test("上下文时间线最近50条，同时声明总数和截断，不伪称完整历史", async (t) => {
  const f = await setup(t, "in_process", { aiLimits: { ...LIVELY_V1, playerMaxPerHand: 100, playerMaxPerRollingWindow: 100 } });
  for (let i = 0; i < 56; i += 1) await f.say(f.a, `timeline-message-${i}`);
  const claim = (await f.act(f.a, "ai.take_intents")).intents;
  assert.equal(claim.length, 1);
  const result = await f.act(f.a, "ai.start", { intent_id: claim[0].intent_id, claim_token: claim[0].claim_token });
  assert.ok(result.model_context, "必须有权威上下文");
  assert.equal(result.model_context.timeline.length, 50);
  assert.equal(result.model_context.timeline_total, 56);
  assert.equal(result.model_context.timeline_truncated, true);
  assert.equal(result.model_context.timeline[0].payload.text, "timeline-message-6");
  assert.equal(result.model_context.timeline.at(-1).payload.text, "timeline-message-55");
});

test("旧手的 intent 在新手不能启动，也不能以错误路径拿到新手私有上下文", async (t) => {
  const f = await setup(t);
  const claim = (await f.act(f.a, "ai.take_intents")).intents;
  assert.equal(claim.length, 1);
  const hand = (await f.core.dispatch("view.projection")).public_hand;
  const actor = hand.actor_player_id === "context-a" ? f.a : f.b;
  await f.act(actor, "hand.act", { action: "fold", hand_id: hand.hand_id, expected_revision: hand.revision, idempotency_key: "fold-previous-hand-context" });
  for (const entry of [f.a, f.b]) await f.act(entry, "seat.ready");
  f.advance(20_000);
  await f.core.dispatch("hand.evaluate_start");
  f.advance(3_500);
  assert.equal((await f.core.dispatch("hand.start_if_due")).started, true);
  await assert.rejects(f.act(f.a, "ai.start", { intent_id: claim[0].intent_id, claim_token: claim[0].claim_token }),
    (error) => error.code === "intent_not_found" && !JSON.stringify(error).includes("model_context"));
});

test("model_context 保留既有自愿亮牌与摊牌公开规则，不另造手牌裁剪", async (t) => {
  const f = await setup(t);
  let hand = (await f.core.dispatch("view.projection")).public_hand;
  const loser = hand.actor_player_id === "context-a" ? f.a : f.b;
  const winner = loser === f.a ? f.b : f.a;
  await f.act(loser, "hand.act", { action: "fold", hand_id: hand.hand_id, expected_revision: hand.revision, idempotency_key: "context-fold-visibility" });
  let claim = (await f.act(loser, "ai.take_intents")).intents;
  assert.equal(claim.length, 1);
  const concealed = await f.act(loser, "ai.start", { intent_id: claim[0].intent_id, claim_token: claim[0].claim_token });
  assert.equal(concealed.model_context.hand.seats.find((seat) => seat.id === winner.seat.player_id).hole_cards, null);
  await f.act(loser, "ai.resolve", { turn_id: concealed.started.turn_id, decision: "silent" });
  hand = (await f.core.dispatch("view.projection")).public_hand;
  await f.act(winner, "hand.reveal", { hand_id: hand.hand_id, expected_revision: hand.revision, idempotency_key: "context-voluntary-reveal" });
  f.advance(5_001);
  await f.say(winner, "voluntary-reveal-visible");
  claim = (await f.act(loser, "ai.take_intents")).intents;
  assert.equal(claim.length, 1);
  const revealed = await f.act(loser, "ai.start", { intent_id: claim[0].intent_id, claim_token: claim[0].claim_token });
  assert.equal(revealed.model_context.hand.seats.find((seat) => seat.id === winner.seat.player_id).hole_cards.length, 2);

  const showdown = await setup(t);
  for (let i = 0; i < 2; i += 1) {
    const current = (await showdown.core.dispatch("view.projection")).public_hand;
    const actor = current.actor_player_id === "context-a" ? showdown.a : showdown.b;
    await showdown.act(actor, "hand.act", { action: i === 0 ? "all_in" : "call", hand_id: current.hand_id,
      expected_revision: current.revision, idempotency_key: `context-showdown-${i}` });
  }
  const publicHand = (await showdown.core.dispatch("view.projection")).public_hand;
  assert.equal(publicHand.status, "complete");
  const claims = (await showdown.act(showdown.a, "ai.take_intents")).intents;
  assert.equal(claims.length, 1);
  const settled = await showdown.act(showdown.a, "ai.start", { intent_id: claims[0].intent_id, claim_token: claims[0].claim_token });
  assert.equal(settled.model_context.hand.seats.length, 2);
  for (const seat of settled.model_context.hand.seats) assert.equal(seat.hole_cards.length, 2);
});
