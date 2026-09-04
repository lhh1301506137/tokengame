"use strict";

// 两条宽覆盖 oracle 与精确规则回归分开：完整枚举和生成式动作负责发现未知组合，
// holdem-mature-rules 则保持轻量，供逐条变异快速验证已知边界不会退化。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  HoldemHand,
  evaluateFive,
  stackedDeck,
  standardDeck,
} = require("../src/game/holdem.cjs");

function makeHand(stacks, { smallBlind = 5, bigBlind = 10 } = {}) {
  const ids = ["a", "b", "c", "d"].slice(0, stacks.length);
  return new HoldemHand({
    id: `robust-${ids.join("")}`,
    tableId: "robustness",
    seats: ids.map((id, index) => ({ id, label: id.toUpperCase(), stack: stacks[index] })),
    dealerIndex: 0,
    smallBlind,
    bigBlind,
    actionTimeoutMs: 30_000,
    deck: stackedDeck([]),
    now: () => 1_000,
  });
}

test("五张牌评估器完整枚举 2,598,960 种组合并命中标准分类计数", { timeout: 30_000 }, () => {
  const deck = standardDeck();
  const counts = Object.create(null);
  let total = 0;

  for (let a = 0; a < 48; a += 1) {
    for (let b = a + 1; b < 49; b += 1) {
      for (let c = b + 1; c < 50; c += 1) {
        for (let d = c + 1; d < 51; d += 1) {
          for (let e = d + 1; e < 52; e += 1) {
            const name = evaluateFive([deck[a], deck[b], deck[c], deck[d], deck[e]]).category_name;
            counts[name] = (counts[name] ?? 0) + 1;
            total += 1;
          }
        }
      }
    }
  }

  assert.equal(total, 2_598_960);
  assert.deepEqual({ ...counts }, {
    four_of_a_kind: 624,
    full_house: 3_744,
    three_of_a_kind: 54_912,
    two_pair: 123_552,
    one_pair: 1_098_240,
    straight_flush: 40,
    flush: 5_108,
    straight: 10_200,
    high_card: 1_302_540,
  });
});

test("一千组确定性生成的合法动作序列都能终止且全程筹码守恒", () => {
  let seed = 0x54_4f_4b_45;
  const random = (maximum) => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed % maximum;
  };

  for (let run = 0; run < 1_000; run += 1) {
    const seatCount = 2 + random(3);
    const stacks = Array.from({ length: seatCount }, () => 1 + random(200));
    const total = stacks.reduce((sum, stack) => sum + stack, 0);
    const hand = makeHand(stacks, { smallBlind: 1, bigBlind: 2 });
    let actionCount = 0;

    while (hand.status === "active") {
      assert.notEqual(hand.actorIndex, null, `run ${run} 活跃却没有行动者`);
      const actor = hand.seats[hand.actorIndex];
      const legal = hand.legalActions(actor.id);
      assert.ok(legal.length > 0, `run ${run} 的行动者没有合法动作`);
      const selected = legal[random(legal.length)];
      const input = { playerId: actor.id, type: selected.type };
      if (selected.type === "bet" || selected.type === "raise") {
        input.amount = random(2) === 0 ? selected.min_to : selected.max_to;
      }
      hand.act(input);
      actionCount += 1;
      assert.ok(actionCount <= 200, `run ${run} 超过有限动作预算`);
    }

    assert.equal(hand.actorIndex, null);
    assert.equal(
      hand.seats.reduce((sum, seat) => sum + seat.stack, 0),
      total,
      `run ${run} 结算后筹码不守恒`,
    );
  }
});
