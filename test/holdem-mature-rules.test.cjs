"use strict";

// 对成熟无限注德州扑克边界的独立回归。
//
// 这些场景不是 TokenGame 的新玩法：它们来自通行的完整大盲、短额 all-in、累计短额
// 加注与「无人还能回应时不再下注」规则。单独放在这里，是为了让以后替换或校准规则引擎时
// 能直接拿同一组行为作 oracle，而不是从 UI 症状倒推底层规则。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  HoldemHand,
  stackedDeck,
} = require("../src/game/holdem.cjs");

function makeHand(stacks, { smallBlind = 5, bigBlind = 10 } = {}) {
  const ids = ["a", "b", "c", "d"].slice(0, stacks.length);
  return new HoldemHand({
    id: `mature-${ids.join("")}`,
    tableId: "mature-rules",
    seats: ids.map((id, index) => ({ id, label: id.toUpperCase(), stack: stacks[index] })),
    dealerIndex: 0,
    smallBlind,
    bigBlind,
    actionTimeoutMs: 30_000,
    deck: stackedDeck([]),
    now: () => 1_000,
  });
}

function action(hand, playerId, type) {
  return hand.legalActions(playerId).find((entry) => entry.type === type);
}

test("短额大盲仍建立完整大盲下注额，后位按完整大盲跟注与最小加注", () => {
  const hand = makeHand([200, 200, 3]);

  assert.equal(hand.publicProjection().actor_player_id, "a");
  assert.equal(hand.currentBet, 10);
  assert.deepEqual(action(hand, "a", "call"), {
    type: "call", amount: 10, to: 10, all_in: false,
  });
  assert.equal(action(hand, "a", "raise").min_to, 20);
});

test("盲注已令所有参与者 all-in 时自动发完公共牌并结算", () => {
  const hand = makeHand([1, 2], { smallBlind: 1, bigBlind: 2 });
  const view = hand.publicProjection();

  assert.equal(view.status, "complete");
  assert.equal(view.finish_reason, "showdown");
  assert.equal(view.actor_player_id, null);
  assert.equal(view.board.length, 5);
  assert.equal(view.seats.reduce((sum, seat) => sum + seat.stack, 0), 3);
});

test("只剩一名可行动者且无需补齐实际投入时，不要求一次无意义的 check", () => {
  const hand = makeHand([200, 200, 3]);

  hand.act({ playerId: "a", type: "fold" });
  const view = hand.publicProjection();
  assert.equal(view.status, "complete");
  assert.equal(view.finish_reason, "showdown");
  assert.equal(view.actor_player_id, null);
  assert.equal(view.board.length, 5);
});

test("唯一对手已 all-in 时只可弃牌或跟注，不可向无人回应的池继续加注", () => {
  const hand = makeHand([50, 200], { smallBlind: 1, bigBlind: 2 });
  hand.act({ playerId: "a", type: "all_in" });

  const actions = hand.legalActions("b");
  assert.deepEqual(actions.map((entry) => entry.type), ["fold", "call"]);
  assert.equal(action(hand, "b", "call").amount, 48);

  hand.act({ playerId: "b", type: "call" });
  assert.equal(hand.status, "complete");
  assert.equal(hand.board.length, 5);
});

test("不完整的翻牌后开局 all-in 不适用 completion，完整加注仍加一个大盲", () => {
  const hand = makeHand([200, 15, 200]);
  hand.act({ playerId: "a", type: "call" });
  hand.act({ playerId: "b", type: "call" });
  hand.act({ playerId: "c", type: "check" });
  assert.equal(hand.street, "flop");
  assert.equal(hand.publicProjection().actor_player_id, "b");

  hand.act({ playerId: "b", type: "all_in" });
  assert.equal(hand.currentBet, 5);
  assert.equal(action(hand, "c", "raise").min_to, 15);
});

test("两个累计半额 all-in 合成完整加注后，为原下注者重新开放加注", () => {
  const hand = makeHand([200, 200, 25, 30]);
  // 翻牌前全部跟到 10。
  hand.act({ playerId: "d", type: "call" });
  hand.act({ playerId: "a", type: "call" });
  hand.act({ playerId: "b", type: "call" });
  hand.act({ playerId: "c", type: "check" });
  assert.equal(hand.street, "flop");

  hand.act({ playerId: "b", type: "bet", amount: 10 });
  hand.act({ playerId: "c", type: "all_in" });
  hand.act({ playerId: "d", type: "all_in" });
  hand.act({ playerId: "a", type: "call" });

  assert.equal(hand.currentBet, 20);
  assert.equal(action(hand, "b", "raise").min_to, 30);
});
