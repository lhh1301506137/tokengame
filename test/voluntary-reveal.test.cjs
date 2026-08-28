"use strict";

// 阶段 1 项 4：自愿亮牌（规则 4）在 UI 侧真的可用。
//
// 核心侧的三道门早就齐了（test/action-idempotency.test.cjs 覆盖 hand_id、
// expected_revision、idempotency_key 与同键冲突）。缺的是从投影到按钮这一段，而它缺得
// 很彻底：
//
//   1. 投影里的 can_reveal 判的是 settlement.payouts，而权威从来不产出这个字段。整个
//      代码库里 payouts 只出现在那一行判断里。所以它恒为假——按钮从未出现过一次。
//   2. 客户端点击时只发 hand_id，而核心要三个字段，于是即使按钮出现了也会被
//      invalid_field 拒掉。
//
// 两处叠在一起的效果是「这个功能有代码、有权威支持、有按钮，但从来没有成功过」，而且
// 因为第一处让按钮永不出现，第二处永远不会被触发——两个缺陷互相掩护。
//
// 恒假的判断和恒真的断言是同一类问题：都读不出真实状态，都不会红。所以这里的测试要
// 同时钉住两侧：投影必须在正确的人身上给出 can_reveal，且必须与权威的许可一致。

const assert = require("node:assert/strict");
const test = require("node:test");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const viewModel = require("../src/host/table-view-model.cjs");
const { confirmAllSeatsViaSurface } = require("../test-support/public-scope.cjs");

const RULES = "table-rules-v1";

// 四人桌，弃到只剩一个。返回每个人的席位、凭据与这一手的收尾状态。
function foldedOutTable(playerCount = 4) {
  let now = 1_000;
  const surface = new CommandSurface({ now: () => now });
  const advance = (ms) => { now += ms; };

  const created = surface.dispatch("room.create", {
    player_id: "p1", table_rules_version: RULES,
  });
  const seats = [{
    seat_id: created.seat.seat_id,
    credential: created.recovery_credential,
    player_id: "p1",
  }];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = surface.dispatch("room.join", {
      player_id: `p${index}`, invite_code: created.invite_code,
    });
    seats.push({
      seat_id: joined.seat.seat_id,
      credential: joined.recovery_credential,
      player_id: `p${index}`,
    });
  }
  confirmAllSeatsViaSurface(surface, seats);
  for (const seat of seats) {
    surface.dispatch("seat.connect", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      connection_id: `conn-${seat.seat_id}`,
    });
    surface.dispatch("seat.ready", {
      seat_id: seat.seat_id, recovery_credential: seat.credential, ready: true,
    });
  }
  surface.dispatch("hand.evaluate_start", {});
  advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  surface.dispatch("hand.start_if_due", {});

  const handOf = (seat) => surface.dispatch("view.hand", {
    seat_id: seat.seat_id, recovery_credential: seat.credential,
  }).hand;

  // 一路弃牌直到这一手收尾。不写死弃几次：按位顺序不同，需要弃的次数也不同。
  for (let guard = 0; guard < 12; guard += 1) {
    const hand = handOf(seats[0]);
    if (hand === null || hand.status !== "active") break;
    const actor = seats.find((seat) => seat.player_id === hand.actor_player_id);
    assert.ok(actor !== undefined, `行动者不在席位表里: ${hand.actor_player_id}`);
    const mine = handOf(actor);
    surface.dispatch("hand.act", {
      seat_id: actor.seat_id,
      recovery_credential: actor.credential,
      hand_id: mine.hand_id,
      expected_revision: mine.revision,
      action: "fold",
      idempotency_key: `fold-${guard}`,
    });
  }

  const finished = handOf(seats[0]);
  assert.equal(finished.status, "complete", "前置条件不成立：这一手没有收尾");
  assert.equal(finished.finish_reason, "all_others_folded",
    `前置条件不成立：收尾原因是 ${finished.finish_reason}`);

  return {
    surface,
    seats,
    handOf,
    now: () => now,
    winnerPlayerId: finished.settlement.winner_ids[0],
    panelOf(seat) {
      return viewModel.build({
        roomState: surface.dispatch("view.projection", {}).room,
        privateHand: handOf(seat),
        viewerSeatId: seat.seat_id,
        now,
      }).action_panel;
    },
  };
}

// 另外两种局面：牌局进行中，以及摊牌收尾。规则 4 在这两种情形下都不给亮牌，理由不同——
// 进行中亮牌是把底牌交给还在跟注的对手；摊牌时牌本来就已经亮了，再给一个按钮只会让人点
// 一次拿到 voluntary_reveal_not_available。
function tableAt(stage) {
  let now = 1_000;
  const surface = new CommandSurface({ now: () => now });
  const created = surface.dispatch("room.create", {
    player_id: "p1", table_rules_version: RULES,
  });
  const seats = [{
    seat_id: created.seat.seat_id,
    credential: created.recovery_credential,
    player_id: "p1",
  }];
  for (let index = 2; index <= 4; index += 1) {
    const joined = surface.dispatch("room.join", {
      player_id: `p${index}`, invite_code: created.invite_code,
    });
    seats.push({
      seat_id: joined.seat.seat_id,
      credential: joined.recovery_credential,
      player_id: `p${index}`,
    });
  }
  confirmAllSeatsViaSurface(surface, seats);
  for (const seat of seats) {
    surface.dispatch("seat.connect", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      connection_id: `conn-${seat.seat_id}`,
    });
    surface.dispatch("seat.ready", {
      seat_id: seat.seat_id, recovery_credential: seat.credential, ready: true,
    });
  }
  surface.dispatch("hand.evaluate_start", {});
  now += TABLE_LIFECYCLE_V1.readyCountdownMs;
  surface.dispatch("hand.start_if_due", {});

  const handOf = (seat) => surface.dispatch("view.hand", {
    seat_id: seat.seat_id, recovery_credential: seat.credential,
  }).hand;

  if (stage === "showdown") {
    // 一路 check/call 走到摊牌。不弃牌，所以收尾原因是 showdown。
    for (let guard = 0; guard < 40; guard += 1) {
      const hand = handOf(seats[0]);
      if (hand === null || hand.status !== "active") break;
      const actor = seats.find((seat) => seat.player_id === hand.actor_player_id);
      const mine = handOf(actor);
      const legal = mine.legal_actions.map((a) => (typeof a === "string" ? a : a.type));
      const pick = legal.includes("check") ? "check" : "call";
      surface.dispatch("hand.act", {
        seat_id: actor.seat_id,
        recovery_credential: actor.credential,
        hand_id: mine.hand_id,
        expected_revision: mine.revision,
        action: pick,
        idempotency_key: `to-showdown-${guard}`,
      });
    }
  }

  return {
    seats,
    handOf,
    panelOf(seat) {
      return viewModel.build({
        roomState: surface.dispatch("view.projection", {}).room,
        privateHand: handOf(seat),
        viewerSeatId: seat.seat_id,
        now,
      }).action_panel;
    },
  };
}

test("亮牌：牌局进行中谁都不能亮牌", () => {
  const table = tableAt("active");
  const hand = table.handOf(table.seats[0]);
  assert.equal(hand.status, "active", "前置条件不成立：这一手不在进行中");

  for (const seat of table.seats) {
    assert.equal(table.panelOf(seat).can_reveal, false,
      `${seat.player_id} 在牌局进行中拿到了亮牌按钮：那是把底牌交给还在跟注的对手`);
  }
});

test("亮牌：摊牌收尾时不给自愿亮牌（牌已经亮了）", () => {
  const table = tableAt("showdown");
  const hand = table.handOf(table.seats[0]);
  assert.equal(hand.status, "complete", "前置条件不成立：这一手没有收尾");
  assert.equal(hand.finish_reason, "showdown",
    `前置条件不成立：收尾原因是 ${hand.finish_reason}，这条要的是摊牌`);

  for (const seat of table.seats) {
    assert.equal(table.panelOf(seat).can_reveal, false,
      `${seat.player_id} 在摊牌收尾时拿到了亮牌按钮：点下去只会拿到一条看不懂的拒绝`);
  }
});

// 畸形 settlement 的有界降级。投影层是纯函数，直接喂形状最能说清它的下界。
//
// 权威今天不产出这些形状，所以这条测的不是「权威会不会这样」，而是「万一上游变了，牌桌是
// 白屏还是少一个按钮」。一条空引用在这一层意味着整份 /api/view 500，而它只在某一种收尾下
// 才发生——最难查的那类缺陷。
test("亮牌：settlement 畸形时不抛错，只是不给按钮", () => {
  const shapes = [
    { label: "winner_ids 缺失", settlement: { reason: "all_others_folded" } },
    { label: "winner_ids 是 null", settlement: { winner_ids: null } },
    { label: "winner_ids 是字符串", settlement: { winner_ids: "p1" } },
    { label: "winner_ids 是数字", settlement: { winner_ids: 3 } },
    { label: "settlement 是 null", settlement: null },
  ];

  for (const shape of shapes) {
    const privateHand = {
      hand_id: "hand-1",
      revision: 4,
      status: "complete",
      finish_reason: "all_others_folded",
      settlement: shape.settlement,
      seats: [{ seat_id: "seat-1", player_id: "p1", hole_cards: ["As", "Kd"] }],
      legal_actions: [],
    };
    let panel;
    assert.doesNotThrow(() => {
      panel = viewModel.build({
        roomState: {
          room_id: "room-1",
          seats: [{ seat_id: "seat-1", player_id: "p1", state: "ACTIVE" }],
        },
        privateHand,
        viewerSeatId: "seat-1",
        now: 1_000,
      }).action_panel;
    }, `${shape.label}: 投影抛错了，整份视图会 500`);
    assert.equal(panel.can_reveal, false, `${shape.label}: 畸形 settlement 却给了按钮`);
  }
});

test("亮牌：全弃牌收尾后赢家的投影里 can_reveal 为真", () => {
  const table = foldedOutTable();
  const winner = table.seats.find((seat) => seat.player_id === table.winnerPlayerId);
  assert.ok(winner !== undefined, "赢家不在席位表里");

  assert.equal(table.panelOf(winner).can_reveal, true,
    "赢家的 can_reveal 为假：按钮永不出现，这个功能有代码但从未成功过一次");
});

test("亮牌：非赢家的 can_reveal 为假", () => {
  const table = foldedOutTable();
  const losers = table.seats.filter((seat) => seat.player_id !== table.winnerPlayerId);
  assert.ok(losers.length >= 1, "四人桌上应该有输家");

  for (const seat of losers) {
    assert.equal(table.panelOf(seat).can_reveal, false,
      `${seat.player_id} 不是赢家却拿到了亮牌按钮`);
  }
});

// 恒假的反面：如果把判断写成恒真，这条会红。
// UI 的可见性必须与权威的许可一致——两者分叉时，玩家要么看到一个点了就报错的按钮，
// 要么有权亮牌却没有入口。
test("亮牌：投影的可见性与权威的许可逐席一致", () => {
  const table = foldedOutTable();

  for (const seat of table.seats) {
    const uiSaysYes = table.panelOf(seat).can_reveal;
    let authoritySaysYes;
    try {
      const mine = table.handOf(seat);
      table.surface.dispatch("hand.reveal", {
        seat_id: seat.seat_id,
        recovery_credential: seat.credential,
        hand_id: mine.hand_id,
        expected_revision: mine.revision,
        idempotency_key: `reveal-${seat.seat_id}`,
      });
      authoritySaysYes = true;
    } catch (error) {
      // only_winner_may_reveal / voluntary_reveal_not_available 都是「权威说不行」。
      // 其他码说明请求本身有问题，那不该被静默当成「不行」。
      assert.ok(
        ["only_winner_may_reveal", "voluntary_reveal_not_available"].includes(error.code),
        `亮牌被拒的理由不是许可问题: ${error.code}`,
      );
      authoritySaysYes = false;
    }
    assert.equal(uiSaysYes, authoritySaysYes,
      `${seat.player_id}: UI 说 ${uiSaysYes}，权威说 ${authoritySaysYes}`);
  }
});

test("亮牌：赢家亮牌后对手能看到那两张底牌，亮牌前看不到", () => {
  const table = foldedOutTable();
  const winner = table.seats.find((seat) => seat.player_id === table.winnerPlayerId);
  const other = table.seats.find((seat) => seat.player_id !== table.winnerPlayerId);

  const winnerSeatIn = (viewerSeat) => {
    const view = viewModel.build({
      roomState: table.surface.dispatch("view.projection", {}).room,
      publicHand: table.surface.dispatch("view.projection", {}).hand ?? null,
      privateHand: table.handOf(viewerSeat),
      viewerSeatId: viewerSeat.seat_id,
      now: table.now(),
    });
    return view.seats.find((entry) => entry.seat_id === winner.seat_id);
  };

  // 看不到时 hole_cards 是 null，不是一个装着 "?" 的数组：投影只报「权威给了什么」，
  // 暗牌的画法留给客户端。
  const before = winnerSeatIn(other);
  assert.ok(
    before.hole_cards === null
    || before.hole_cards.every((card) => card === null || card === "?"),
    `亮牌前对手就看到了赢家的牌: ${JSON.stringify(before.hole_cards)}`,
  );

  const mine = table.handOf(winner);
  const revealed = table.surface.dispatch("hand.reveal", {
    seat_id: winner.seat_id,
    recovery_credential: winner.credential,
    hand_id: mine.hand_id,
    expected_revision: mine.revision,
    idempotency_key: "reveal-once",
  });
  assert.equal(revealed.revealed, true);

  const after = winnerSeatIn(other);
  assert.equal(after.hole_cards.filter((card) => typeof card === "string"
    && card !== "?").length, 2,
  `亮牌后对手仍看不到那两张牌: ${JSON.stringify(after.hole_cards)}`);
});

// 幂等：同一个逻辑请求重发必须回原结果。客户端的键取 hand_id + expected_revision，
// 不掺时间戳或随机数——掺了的话每次重发都是新键，于是丢响应后的重试撞上引擎那道
// 「你已经亮过了」，玩家看到一条自己无法理解的失败，而牌其实已经亮了。
test("亮牌：同键重发回到原结果，换掉版本号则是键冲突", () => {
  const table = foldedOutTable();
  const winner = table.seats.find((seat) => seat.player_id === table.winnerPlayerId);
  const mine = table.handOf(winner);
  const params = {
    seat_id: winner.seat_id,
    recovery_credential: winner.credential,
    hand_id: mine.hand_id,
    expected_revision: mine.revision,
    idempotency_key: `reveal:${mine.hand_id}:${mine.revision}`,
  };

  const first = table.surface.dispatch("hand.reveal", params);
  assert.equal(first.revealed, true);
  assert.notEqual(first.replay, true, "第一次就被当成重放了");

  const again = table.surface.dispatch("hand.reveal", params);
  assert.equal(again.replay, true, "同键重发没有被识别成重放");

  assert.throws(
    () => table.surface.dispatch("hand.reveal", {
      ...params, expected_revision: params.expected_revision + 1,
    }),
    (error) => error.code === "idempotency_key_conflict",
    "同一个键换掉版本号必须是键冲突，不能当成同一个请求",
  );
});
