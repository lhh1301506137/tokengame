"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { TableStore } = require("../src/authority/table-store.cjs");
const {
  HoldemHand,
  compareEvaluations,
  evaluateBest,
  evaluateFive,
  stackedDeck,
} = require("../src/game/holdem.cjs");

// Rule source matrix: the corresponding PokerStars/TDA references and the
// TokenGame-specific reveal/timeout decisions are recorded in
// .trellis/tasks/08-26-multiplayer-vertical-slice/research/mature-online-poker-rules-baseline.md.

function seats(stacks = {}) {
  return ["a", "b", "c", "d"].map((id) => ({
    id,
    label: id.toUpperCase(),
    stack: stacks[id] || 200,
  }));
}

function handFixture({ stacks = {}, topCards = [], actionTimeoutMs = 100 } = {}) {
  let now = 1_000;
  const hand = new HoldemHand({
    id: "hand-test",
    seats: seats(stacks),
    dealerIndex: 0,
    smallBlind: 1,
    bigBlind: 2,
    actionTimeoutMs,
    deck: stackedDeck(topCards),
    now: () => now,
  });
  return { hand, setNow(value) { now = value; } };
}

test("牌型比较覆盖同花顺、A2345 顺子与七选五", () => {
  const royal = evaluateFive(["As", "Ks", "Qs", "Js", "Ts"]);
  const wheel = evaluateFive(["As", "2d", "3h", "4c", "5s"]);
  const fullHouse = evaluateBest(["Kh", "Kd", "Ks", "2c", "2d", "9s", "Th"]);

  assert.equal(royal.category_name, "straight_flush");
  assert.deepEqual(royal.tiebreak, [14]);
  assert.equal(wheel.category_name, "straight");
  assert.deepEqual(wheel.tiebreak, [5]);
  assert.equal(fullHouse.category_name, "full_house");
  assert.ok(compareEvaluations(royal, fullHouse) > 0);
});

test("四人牌局按标准位置完成四轮行动并在摊牌公开仍在局底牌", () => {
  const { hand } = handFixture({
    topCards: [
      "As", "Ks", "Qs", "Js", "Ah", "Kh", "Qh", "Jh",
      "2c", "3c", "4d", "5h", "6c", "7s", "8c", "9d",
    ],
  });
  hand.drainEvents();

  assert.equal(hand.publicProjection("d").actor_player_id, "d");
  assert.equal(hand.publicProjection("d").seats.find((seat) => seat.id === "d").hole_cards.length, 2);
  assert.equal(hand.publicProjection("d").seats.find((seat) => seat.id === "a").hole_cards, null);

  hand.act({ playerId: "d", type: "call" });
  hand.act({ playerId: "a", type: "call" });
  hand.act({ playerId: "b", type: "call" });
  hand.act({ playerId: "c", type: "check" });
  assert.equal(hand.street, "flop");
  assert.equal(hand.publicProjection("b").actor_player_id, "b");
  assert.equal(hand.board.length, 3);
  assert.equal(hand.legalActions("b").find((action) => action.type === "bet").min_to, 2);

  while (hand.status === "active") {
    const actor = hand.seats[hand.actorIndex];
    const legal = hand.legalActions(actor.id);
    assert.ok(legal.some((action) => action.type === "check"));
    hand.act({ playerId: actor.id, type: "check" });
  }

  const observer = hand.publicProjection();
  assert.equal(observer.status, "complete");
  assert.equal(observer.finish_reason, "showdown");
  assert.equal(observer.board.length, 5);
  assert.ok(observer.seats.every((seat) => Array.isArray(seat.hole_cards)));
  assert.equal(observer.seats.reduce((sum, seat) => sum + seat.stack, 0), 800);
});

test("短额 all-in 只要求补齐差额，不为已经行动的玩家重新开放加注", () => {
  const { hand } = handFixture({ stacks: { b: 8 } });
  hand.drainEvents();

  assert.equal(hand.legalActions("d").find((action) => action.type === "raise").min_to, 4);
  hand.act({ playerId: "d", type: "raise", amount: 6 });
  hand.act({ playerId: "a", type: "call" });
  hand.act({ playerId: "b", type: "all_in" });
  assert.equal(hand.currentBet, 8);
  assert.equal(hand.lastFullRaise, 4);

  const cActions = hand.legalActions("c");
  assert.ok(cActions.some((action) => action.type === "raise" && action.min_to === 12));
  hand.act({ playerId: "c", type: "call" });

  const dActions = hand.legalActions("d");
  assert.ok(dActions.some((action) => action.type === "call"));
  assert.equal(dActions.some((action) => action.type === "raise"), false);
  assert.equal(dActions.some((action) => action.type === "all_in"), false);
  hand.act({ playerId: "d", type: "call" });

  const aActions = hand.legalActions("a");
  assert.equal(aActions.some((action) => action.type === "raise"), false);
  hand.act({ playerId: "a", type: "call" });
  assert.equal(hand.street, "flop");
});

test("三个不同深度的 all-in 形成主池和两层边池并分别支付合资格赢家", () => {
  const { hand } = handFixture({
    stacks: { a: 200, b: 40, c: 100, d: 200 },
    topCards: [
      "As", "Ks", "Js", "Qs", "Ah", "Kh", "Jh", "Qh",
      "Tc", "2c", "3d", "4h", "Td", "8s", "9d", "9c",
    ],
  });
  hand.drainEvents();

  hand.act({ playerId: "d", type: "all_in" });
  hand.act({ playerId: "a", type: "all_in" });
  hand.act({ playerId: "b", type: "all_in" });
  hand.act({ playerId: "c", type: "all_in" });

  const state = hand.publicProjection();
  assert.equal(state.status, "complete");
  assert.equal(state.finish_reason, "showdown");
  assert.equal(state.current_bet, 0);
  assert.ok(state.seats.every((seat) => seat.round_commitment === 0));
  assert.deepEqual(state.settlement.pots.map((pot) => pot.amount), [160, 180, 200]);
  assert.deepEqual(state.settlement.pots.map((pot) => pot.winner_ids), [["b"], ["c"], ["a"]]);
  assert.deepEqual(
    Object.fromEntries(state.seats.map((seat) => [seat.id, seat.stack])),
    { a: 200, b: 160, c: 180, d: 0 },
  );
  assert.equal(state.seats.reduce((sum, seat) => sum + seat.stack, 0), 540);
});

test("平分奇数底池时，余下筹码按庄家左侧起的顺时针顺序发放", () => {
  const hand = new HoldemHand({
    id: "odd-chip-hand",
    seats: ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase(), stack: 1 })),
    dealerIndex: 0,
    smallBlind: 1,
    bigBlind: 2,
    actionTimeoutMs: 100,
    deck: stackedDeck([
      "Ks", "Js", "Kh", "Qd", "Td", "Qc",
      "3c", "2c", "2d", "5h", "4c", "8s", "6c", "9c",
    ]),
    now: () => 1_000,
  });

  assert.equal(hand.publicProjection().actor_player_id, "a");
  hand.act({ playerId: "a", type: "all_in" });

  const state = hand.publicProjection();
  assert.equal(state.status, "complete");
  assert.equal(state.settlement.pots[0].amount, 3);
  assert.deepEqual(state.settlement.pots[0].winner_ids, ["b", "a"]);
  assert.deepEqual(state.settlement.pots[0].awards, [
    { player_id: "b", amount: 2, odd_chip: true },
    { player_id: "a", amount: 1, odd_chip: false },
  ]);
  assert.deepEqual(
    Object.fromEntries(state.seats.map((seat) => [seat.id, seat.stack])),
    { a: 1, b: 2, c: 0 },
  );
});

test("超时面对下注自动弃牌，无需跟注时自动过牌且从不投入筹码", () => {
  const clock = handFixture({ actionTimeoutMs: 100 });
  const { hand } = clock;
  hand.drainEvents();

  clock.setNow(1_100);
  hand.settleExpiredAction();
  assert.equal(hand.seatById("d").folded, true);
  assert.equal(hand.seatById("d").total_commitment, 0);
  let timeoutAction = hand.drainEvents().find((event) => event.type === "PLAYER_ACTION");
  assert.equal(timeoutAction.payload.action, "fold");
  assert.equal(timeoutAction.payload.automatic, true);

  hand.act({ playerId: "a", type: "call" });
  hand.act({ playerId: "b", type: "call" });
  hand.act({ playerId: "c", type: "check" });
  assert.equal(hand.street, "flop");
  hand.drainEvents();
  const actor = hand.seats[hand.actorIndex];
  const stackBefore = actor.stack;
  clock.setNow(hand.actionDeadlineAt);
  hand.settleExpiredAction();
  timeoutAction = hand.drainEvents().find((event) => event.type === "PLAYER_ACTION");
  assert.equal(timeoutAction.payload.action, "check");
  assert.equal(actor.stack, stackBefore);
});

test("表级身份令牌隔离底牌，并对动作提供版本与幂等保护", () => {
  let now = 1_000;
  let id = 0;
  const table = new TableStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    deckFactory: () => stackedDeck([]),
    playerTokens: { a: "token-a", b: "token-b", c: "token-c", d: "token-d" },
    actionTimeoutMs: 1_000,
  });

  const aState = table.publicState({ playerId: "a", playerToken: "token-a" });
  assert.equal(aState.hand.seats.find((seat) => seat.id === "a").hole_cards.length, 2);
  assert.ok(aState.hand.seats.filter((seat) => seat.id !== "a").every((seat) => seat.hole_cards === null));
  const observer = table.publicState();
  assert.ok(observer.hand.seats.every((seat) => seat.hole_cards === null));
  assert.throws(
    () => table.publicState({ playerId: "b", playerToken: "token-a" }),
    (error) => error instanceof ProbeError && error.code === "player_token_rejected",
  );
  const reconnect = table.publicState({ playerId: "a", playerToken: "token-a" });
  assert.equal(reconnect.hand.hand_id, aState.hand.hand_id);
  assert.equal(reconnect.hand.revision, aState.hand.revision);
  assert.deepEqual(
    reconnect.hand.seats.find((seat) => seat.id === "a").hole_cards,
    aState.hand.seats.find((seat) => seat.id === "a").hole_cards,
  );

  const input = {
    player_id: "d",
    player_token: "token-d",
    action: "call",
    expected_revision: 1,
    idempotency_key: "action-d-1",
  };
  const first = table.submitAction(input);
  const eventCount = table.publicState().events.length;
  const replay = table.submitAction(input);
  assert.equal(first.replay, false);
  assert.equal(replay.replay, true);
  assert.equal(table.publicState().events.length, eventCount);
  assert.throws(
    () => table.submitAction({
      player_id: "a",
      player_token: "token-a",
      action: "call",
      expected_revision: 1,
      idempotency_key: "action-a-stale",
    }),
    (error) => error instanceof ProbeError && error.code === "stale_hand_revision",
  );
  now = 1_100;
});

test("非当前玩家、非法加注额和截止后动作均由权威层拒绝", () => {
  let now = 1_000;
  const table = new TableStore({
    now: () => now,
    idFactory: () => "boundary-id",
    deckFactory: () => stackedDeck([]),
    playerTokens: { a: "token-a", b: "token-b", c: "token-c", d: "token-d" },
    actionTimeoutMs: 100,
  });

  assert.throws(
    () => table.submitAction({
      player_id: "a",
      player_token: "token-a",
      action: "call",
      expected_revision: 1,
      idempotency_key: "not-turn",
    }),
    (error) => error.code === "not_players_turn",
  );
  assert.throws(
    () => table.submitAction({
      player_id: "d",
      player_token: "token-d",
      action: "raise",
      amount: 3,
      expected_revision: 1,
      idempotency_key: "bad-raise",
    }),
    (error) => error.code === "invalid_action_amount",
  );
  assert.equal(table.hand.revision, 1);

  now = 1_100;
  assert.throws(
    () => table.submitAction({
      player_id: "d",
      player_token: "token-d",
      action: "call",
      expected_revision: 1,
      idempotency_key: "late-call",
    }),
    (error) => error instanceof ProbeError && error.code === "stale_hand_revision",
  );
  const state = table.publicState({ playerId: "d", playerToken: "token-d" });
  assert.equal(state.hand.revision, 2);
  assert.equal(state.hand.seats.find((seat) => seat.id === "d").status, "folded");
  assert.equal(state.hand.seats.find((seat) => seat.id === "d").total_commitment, 0);
  assert.ok(state.events.some((event) => event.type === "PLAYER_ACTION"
    && event.payload.player_id === "d"
    && event.payload.automatic === true
    && event.payload.action === "fold"));
});

test("牌桌重置的同一幂等请求在新牌局建立后仍能重放原结果", () => {
  let id = 0;
  const table = new TableStore({
    now: () => 1_000,
    idFactory: () => `id-${++id}`,
    deckFactory: () => stackedDeck([]),
    playerTokens: { a: "token-a", b: "token-b", c: "token-c", d: "token-d" },
  });
  const input = {
    player_id: "a",
    player_token: "token-a",
    idempotency_key: "reset-once",
  };

  assert.throws(
    () => table.resetTable({ ...input, idempotency_key: "reset-too-early" }),
    (error) => error instanceof ProbeError && error.code === "hand_not_complete",
  );

  for (const [playerId, revision] of [["d", 1], ["a", 2], ["b", 3]]) {
    table.submitAction({
      player_id: playerId,
      player_token: `token-${playerId}`,
      action: "fold",
      expected_revision: revision,
      idempotency_key: `finish-before-reset-${playerId}`,
    });
  }

  const first = table.resetTable(input);
  const eventCount = table.publicState().events.length;
  const replay = table.resetTable(input);

  assert.equal(first.replay, false);
  assert.equal(replay.replay, true);
  assert.equal(replay.hand_id, first.hand_id);
  assert.equal(replay.previous_hand_id, first.previous_hand_id);
  assert.equal(table.publicState().hand.hand_id, first.hand_id);
  assert.equal(table.publicState().events.length, eventCount);
});

test("弃牌获胜默认不亮牌，获胜者可在结算后自愿公开", () => {
  const table = new TableStore({
    now: () => 1_000,
    idFactory: () => "fixed-id",
    deckFactory: () => stackedDeck([]),
    playerTokens: { a: "token-a", b: "token-b", c: "token-c", d: "token-d" },
  });

  for (const [playerId, revision] of [["d", 1], ["a", 2], ["b", 3]]) {
    table.submitAction({
      player_id: playerId,
      player_token: `token-${playerId}`,
      action: "fold",
      expected_revision: revision,
      idempotency_key: `fold-${playerId}`,
    });
  }

  let observer = table.publicState();
  assert.equal(observer.hand.finish_reason, "all_others_folded");
  assert.ok(observer.hand.seats.every((seat) => seat.hole_cards === null));
  table.revealCards({
    player_id: "c",
    player_token: "token-c",
    idempotency_key: "reveal-c",
  });
  observer = table.publicState();
  assert.equal(observer.hand.seats.find((seat) => seat.id === "c").hole_cards.length, 2);
  assert.ok(observer.hand.seats.filter((seat) => seat.id !== "c").every((seat) => seat.hole_cards === null));
});
