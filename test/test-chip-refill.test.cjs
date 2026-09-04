"use strict";

// 好友现金桌的破产恢复规则：测试筹码不可兑现，只能在手间由玩家本人手动补回起始值。

const assert = require("node:assert/strict");
const test = require("node:test");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { RoomStore, TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

function fixture() {
  let now = 1_000;
  let id = 0;
  const store = new RoomStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `token-${++id}`,
    startingStack: 200,
  });
  const created = store.createRoom({ hostPlayerId: "a", tableRulesVersion: "table-rules-v1" });
  const joined = store.joinRoom({ playerId: "b", inviteCode: created.invite.invite_code });
  const seats = [created.seat, joined.seat];
  for (const seat of seats) {
    store.markConnected({ seatId: seat.seat_id, connectionId: `conn-${seat.seat_id}` });
    store.setReady({ seatId: seat.seat_id, ready: true });
  }
  store.evaluateStart();
  now += TABLE_LIFECYCLE_V1.readyCountdownMs;
  store.startHand();
  return { store, seats, credentials: [created.credential, joined.credential] };
}

test("破产不会自动补筹码；手内拒绝补充，手间仅本人可手动补回起始值", () => {
  const { store, seats } = fixture();
  const bustedId = seats[0].seat_id;
  const otherId = seats[1].seat_id;

  store.settleStacks({
    handIndex: 1,
    stacks: [
      { seatId: bustedId, stack: 0 },
      { seatId: otherId, stack: 400 },
    ],
  });
  store.markAllIn({ seatId: bustedId, allIn: true });
  assert.equal(store.seatState(bustedId).test_chip_refill_available, false,
    "手内即使账本已写成 0，也不能向浏览器投影补筹资格");
  assert.throws(() => store.refillTestChips({ seatId: bustedId }), probe("test_chip_refill_during_hand"));

  store.handSettled();
  const busted = store.seatState(bustedId);
  assert.equal(busted.state, "SIT_OUT");
  assert.equal(busted.stack, 0, "结算不得自动补筹码");
  assert.equal(busted.all_in, false, "all-in 只属于已经结束的那一手");
  assert.equal(busted.test_chip_refill_available, true);
  assert.equal(busted.test_chip_refill_amount, 200);
  assert.throws(() => store.setReady({ seatId: bustedId, ready: true }), probe("test_chip_refill_required"));

  const refilled = store.refillTestChips({ seatId: bustedId });
  assert.equal(refilled.stack, 200);
  assert.equal(refilled.state, "SIT_OUT", "补筹码不等于替玩家按下准备");
  assert.equal(refilled.test_chip_refill_available, false);
  assert.equal(store.events.filter((event) => event.type === "SEAT_TEST_CHIPS_REFILLED").length, 1);

  const ready = store.setReady({ seatId: bustedId, ready: true });
  assert.equal(ready.state, "READY");
});

test("有筹码、非暂离或已离桌席位不能借补充命令改写筹码", () => {
  const { store, seats } = fixture();
  assert.throws(
    () => store.refillTestChips({ seatId: seats[0].seat_id }),
    probe("test_chip_refill_during_hand"),
  );

  store.handSettled();
  assert.throws(
    () => store.refillTestChips({ seatId: seats[0].seat_id }),
    probe("test_chip_refill_not_available"),
  );

  store.leaveTable({ seatId: seats[0].seat_id });
  assert.throws(
    () => store.refillTestChips({ seatId: seats[0].seat_id }),
    probe("seat_released"),
  );
});

test("破产席掉线恢复后仍保持 SIT_OUT，并能继续走手间补筹闭环", () => {
  const { store, seats, credentials } = fixture();
  const bustedId = seats[0].seat_id;
  store.settleStacks({
    handIndex: 1,
    stacks: [
      { seatId: bustedId, stack: 0 },
      { seatId: seats[1].seat_id, stack: 400 },
    ],
  });
  store.handSettled();
  store.markDisconnected({ seatId: bustedId, connectionId: `conn-${bustedId}` });

  const recovered = store.recoverSeat({
    seatId: bustedId,
    recoveryCredential: credentials[0],
  });
  assert.equal(recovered.state, "SIT_OUT");
  assert.equal(recovered.stack, 0);
  assert.equal(recovered.test_chip_refill_available, true);

  const refilled = store.refillTestChips({ seatId: bustedId });
  assert.equal(refilled.state, "SIT_OUT");
  assert.equal(refilled.stack, 200);
});
