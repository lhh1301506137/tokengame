"use strict";

// SC-TG-L2-PLAYABLE-TABLE-20260827-D 规则 1～3 的确定性回归，
// 外加规则 4（亮牌）对现有牌局引擎的验证。
// 全部用受控假时钟与假 ID，不依赖真实时间、随机数或任何宿主。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  RoomStore,
  TABLE_LIFECYCLE_V1,
  PARTICIPABLE_STATES,
} = require("../src/authority/room-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");

const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

function harness() {
  let now = 1_000;
  let id = 0;
  const store = new RoomStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
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

// 已创建房间、已入座若干玩家、每席都有一条连接的牌桌。
function room(playerCount = 2) {
  const h = harness();
  const created = h.store.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  const seats = [created.seat];
  const credentials = [created.credential];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = h.store.joinRoom({
      playerId: `p${index}`,
      inviteCode: created.invite.invite_code,
    });
    seats.push(joined.seat);
    credentials.push(joined.credential);
  }
  for (const seat of seats) {
    h.store.markConnected({ seatId: seat.seat_id, connectionId: `conn-${seat.seat_id}` });
  }
  return { ...h, room: created.room, invite: created.invite, seats, credentials };
}
// 把牌桌推到「首手已开始」：两席 Ready + 走完 3 秒倒计时。
function startFirstHand(ctx, seatIndexes = [0, 1]) {
  for (const index of seatIndexes) {
    ctx.store.setReady({ seatId: ctx.seats[index].seat_id, ready: true });
  }
  ctx.store.evaluateStart();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.store.startHand();
}

// 结算当前手并走完 3 秒手间展示。
function settleAndWaitInterHand(ctx) {
  const settled = ctx.store.handSettled();
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  return settled;
}

function types(store) {
  return store.events.map((event) => event.type);
}

// ---------------------------------------------------------------------------
// SESSION-LAUNCH：临时私人房、座位归属、恢复凭据。
// ---------------------------------------------------------------------------

test("入房：创建的是临时私人房，不是固定公开桌", () => {
  const ctx = room(1);
  assert.equal(ctx.room.visibility, "TEMPORARY_PRIVATE");
  assert.equal(ctx.room.max_seats, TABLE_LIFECYCLE_V1.maxSeats);
  assert.ok(ctx.room.room_binding_id);
  assert.equal(ctx.room.table_rules_version, RULES);
  // 创建者只是第一个座位，没有任何牌局权威。
  assert.equal(ctx.seats[0].state, "SEATED");
  assert.equal(types(ctx.store)[0], "ROOM_CREATED");
});

test("入房：必须凭有效邀请加入，错误邀请被拒", () => {
  const ctx = room(1);
  assert.throws(
    () => ctx.store.joinRoom({ playerId: "p9", inviteCode: "tok-forged" }),
    probe("invite_rejected"),
  );
  const joined = ctx.store.joinRoom({ playerId: "p2", inviteCode: ctx.invite.invite_code });
  assert.equal(joined.room.room_id, ctx.room.room_id);
  assert.equal(joined.seat.state, "SEATED");
});

test("入房：最多四席，满席后拒绝加入", () => {
  const ctx = room(4);
  assert.equal(ctx.seats.length, 4);
  assert.throws(
    () => ctx.store.joinRoom({ playerId: "p5", inviteCode: ctx.invite.invite_code }),
    probe("room_full"),
  );
});

test("入房：恢复凭据不出现在任何投影里，只在入座时返回一次", () => {
  const ctx = room(2);
  const serialized = JSON.stringify(ctx.store.roomState());
  for (const credential of ctx.credentials) {
    assert.ok(credential);
    assert.equal(serialized.includes(credential), false, "凭据泄漏进 roomState");
  }
  assert.equal(
    JSON.stringify(ctx.store.seatState(ctx.seats[0].seat_id)).includes(ctx.credentials[0]),
    false,
  );
});

// ---------------------------------------------------------------------------
// 规则 1：Ready 门禁、3 秒倒计时、手间展示、中途加入从下一手起。
// ---------------------------------------------------------------------------

test("规则1：未 Ready 的已入座玩家保持旁观，不促成也不阻塞开局", () => {
  const ctx = room(3);
  // 三人在座但都未 Ready。
  let decision = ctx.store.evaluateStart();
  assert.equal(decision.can_start, false);
  assert.equal(decision.reason, "awaiting_ready");
  assert.equal(decision.ready_count, 0);

  // 只有两人 Ready，第三人保持旁观：开局不被阻塞。
  ctx.store.setReady({ seatId: ctx.seats[0].seat_id, ready: true });
  ctx.store.setReady({ seatId: ctx.seats[1].seat_id, ready: true });
  decision = ctx.store.evaluateStart();
  assert.equal(decision.reason, "ready_countdown");
  assert.equal(decision.ready_count, 2);

  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  const started = ctx.store.startHand();
  // 旁观者不进入名单。
  assert.deepEqual(started.payload.roster, [
    ctx.seats[0].seat_id,
    ctx.seats[1].seat_id,
  ]);
  assert.equal(ctx.store.seatState(ctx.seats[2].seat_id).state, "SEATED");
});

test("规则1：首手需要至少两席 Ready，一席不足以开局", () => {
  const ctx = room(2);
  ctx.store.setReady({ seatId: ctx.seats[0].seat_id, ready: true });
  const decision = ctx.store.evaluateStart();
  assert.equal(decision.can_start, false);
  assert.equal(decision.reason, "awaiting_ready");
  assert.equal(decision.ready_count, 1);
  assert.throws(() => ctx.store.startHand(), probe("hand_start_blocked"));
});

test("规则1：3 秒权威倒计时精确到毫秒，未走完不得开手", () => {
  const ctx = room(2);
  ctx.store.setReady({ seatId: ctx.seats[0].seat_id, ready: true });
  ctx.store.setReady({ seatId: ctx.seats[1].seat_id, ready: true });

  const started = ctx.store.evaluateStart();
  assert.equal(started.reason, "ready_countdown");
  assert.equal(started.remaining_ms, TABLE_LIFECYCLE_V1.readyCountdownMs);

  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs - 1);
  const almost = ctx.store.evaluateStart();
  assert.equal(almost.can_start, false);
  assert.equal(almost.remaining_ms, 1);
  assert.throws(() => ctx.store.startHand(), probe("hand_start_blocked"));

  ctx.advance(1);
  const ready = ctx.store.evaluateStart();
  assert.equal(ready.can_start, true);
  assert.equal(ready.reason, "ready_countdown_elapsed");
  assert.equal(ready.next_hand_index, 1);
});

test("规则1：倒计时期间撤回 Ready 会取消倒计时", () => {
  const ctx = room(2);
  ctx.store.setReady({ seatId: ctx.seats[0].seat_id, ready: true });
  ctx.store.setReady({ seatId: ctx.seats[1].seat_id, ready: true });
  ctx.store.evaluateStart();
  assert.equal(types(ctx.store).includes("HAND_START_COUNTDOWN_STARTED"), true);

  ctx.advance(1_000);
  ctx.store.setReady({ seatId: ctx.seats[1].seat_id, ready: false });
  const cancelled = ctx.store.evaluateStart();
  assert.equal(cancelled.can_start, false);
  assert.equal(cancelled.reason, "awaiting_ready");
  assert.equal(types(ctx.store).includes("HAND_START_COUNTDOWN_CANCELLED"), true);

  // 重新 Ready 后倒计时从头开始，不继承已经走过的 1 秒。
  ctx.store.setReady({ seatId: ctx.seats[1].seat_id, ready: true });
  const restarted = ctx.store.evaluateStart();
  assert.equal(restarted.remaining_ms, TABLE_LIFECYCLE_V1.readyCountdownMs);
});

test("规则1：后续手在 3 秒手间展示后自动开始，无需重新 Ready", () => {
  const ctx = room(2);
  startFirstHand(ctx);
  assert.equal(ctx.store.seatState(ctx.seats[0].seat_id).state, "ACTIVE");

  ctx.store.handSettled();
  const displaying = ctx.store.evaluateStart();
  assert.equal(displaying.can_start, false);
  assert.equal(displaying.reason, "inter_hand_display");
  assert.equal(displaying.remaining_ms, TABLE_LIFECYCLE_V1.interHandDisplayMs);

  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const auto = ctx.store.evaluateStart();
  assert.equal(auto.can_start, true);
  assert.equal(auto.reason, "auto_next_hand");
  assert.equal(ctx.store.startHand().payload.hand_index, 2);
});

test("规则1：中途加入的玩家最早从下一手参与，不插进正在进行的这一手", () => {
  const ctx = room(2);
  const firstHand = startFirstHand(ctx);
  assert.equal(firstHand.payload.roster.length, 2);

  // 第三名玩家在第一手进行中加入并 Ready。
  const joined = ctx.store.joinRoom({ playerId: "p3", inviteCode: ctx.invite.invite_code });
  ctx.store.markConnected({ seatId: joined.seat.seat_id, connectionId: "conn-3" });
  const readied = ctx.store.setReady({ seatId: joined.seat.seat_id, ready: true });
  assert.equal(readied.eligible_from_hand_index, 2);
  // 第一手名单已经固定，不含新席。
  assert.equal(firstHand.payload.roster.includes(joined.seat.seat_id), false);

  settleAndWaitInterHand(ctx);
  const secondHand = ctx.store.startHand();
  assert.equal(secondHand.payload.hand_index, 2);
  assert.equal(secondHand.payload.roster.includes(joined.seat.seat_id), true);
  assert.equal(secondHand.payload.roster.length, 3);
});

test("规则1：可参与席只算 ACTIVE 与 READY", () => {
  assert.deepEqual([...PARTICIPABLE_STATES], ["ACTIVE", "READY"]);
  const ctx = room(3);
  ctx.store.setReady({ seatId: ctx.seats[0].seat_id, ready: true });
  // 一席 READY、一席 SEATED、一席掉线 -> 可参与席只有 1。
  ctx.store.markDisconnected({
    seatId: ctx.seats[2].seat_id,
    connectionId: `conn-${ctx.seats[2].seat_id}`,
  });
  const state = ctx.store.roomState();
  assert.equal(state.participable_count, 1);
  assert.equal(
    state.seats.find((seat) => seat.seat_id === ctx.seats[2].seat_id).state,
    "DISCONNECTED",
  );
});

test("规则1：TABLE_LIFECYCLE_V1 常量锁定", () => {
  assert.deepEqual({ ...TABLE_LIFECYCLE_V1 }, {
    version: "TABLE_LIFECYCLE_V1",
    maxSeats: 4,
    minParticipants: 2,
    readyCountdownMs: 3_000,
    interHandDisplayMs: 3_000,
    recoveryRetentionMs: 120_000,
  });
});

// ---------------------------------------------------------------------------
// 规则 2：断线不暂停当前手；结算后转 sit out；120 秒保留窗后释放席位与凭据。
// ---------------------------------------------------------------------------

test("规则2：单席断线不中止正在进行的这一手", () => {
  const ctx = room(2);
  startFirstHand(ctx);
  ctx.store.markDisconnected({
    seatId: ctx.seats[1].seat_id,
    connectionId: `conn-${ctx.seats[1].seat_id}`,
  });

  // 当前手仍在进行；门禁只报「手正在进行」，没有中止或暂停当前手的动作。
  assert.equal(ctx.store.roomState().hand_active, true);
  assert.equal(ctx.store.evaluateStart().reason, "hand_in_progress");
  assert.equal(ctx.store.seatState(ctx.seats[1].seat_id).state, "DISCONNECTED");
  assert.equal(types(ctx.store).some((type) => type.includes("HAND_ABORTED")), false);
});

test("规则2：结算后仍断线的席位进入 sit out，保留原席与凭据", () => {
  const ctx = room(3);
  startFirstHand(ctx, [0, 1, 2]);
  ctx.store.markDisconnected({
    seatId: ctx.seats[2].seat_id,
    connectionId: `conn-${ctx.seats[2].seat_id}`,
  });

  ctx.store.handSettled();
  const seat = ctx.store.seatState(ctx.seats[2].seat_id);
  assert.equal(seat.state, "SIT_OUT");
  // 原席与凭据都还在，只是不再计入可参与席。
  assert.equal(seat.credential_revoked, false);
  assert.equal(seat.binding_state, "BOUND");
  assert.equal(seat.retention_remaining_ms, TABLE_LIFECYCLE_V1.recoveryRetentionMs);
  assert.equal(ctx.store.roomState().participable_count, 2);
});

test("规则2：保留窗从最后一个有效连接消失起算，多连接时不启动", () => {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markConnected({ seatId, connectionId: "conn-second" });

  // 关掉其中一条连接：还有有效连接，不算掉线，不启动保留窗。
  const partial = ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  assert.equal(partial.payload.retention_started, false);
  assert.equal(ctx.store.seatState(seatId).state, "SEATED");
  assert.equal(ctx.store.seatState(seatId).retention_remaining_ms, null);

  // 关掉最后一条：保留窗才开始。
  const full = ctx.store.markDisconnected({ seatId, connectionId: "conn-second" });
  assert.equal(full.payload.retention_started, true);
  assert.equal(
    full.payload.retention_expires_at,
    ctx.at() + TABLE_LIFECYCLE_V1.recoveryRetentionMs,
  );
});

test("规则2：120 秒保留窗内可恢复原座位，边界精确", () => {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });

  ctx.advance(TABLE_LIFECYCLE_V1.recoveryRetentionMs - 1);
  assert.equal(ctx.store.seatState(seatId).retention_remaining_ms, 1);
  const recovered = ctx.store.recoverSeat({
    seatId,
    recoveryCredential: ctx.credentials[0],
  });
  // 回到原座位，不是新身份、新座位。
  assert.equal(recovered.seat_id, seatId);
  assert.equal(recovered.player_id, "p1");
  assert.equal(recovered.state, "SEATED");
  assert.equal(recovered.retention_remaining_ms, null);
});

test("规则2：保留窗到期后释放席位并吊销凭据", () => {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });

  ctx.advance(TABLE_LIFECYCLE_V1.recoveryRetentionMs);
  // 任一次状态查询都会推进释放，不依赖外部定时器。
  assert.deepEqual(ctx.store.releaseExpiredSeats(), [seatId]);
  const seat = ctx.store.seatState(seatId);
  assert.equal(seat.state, "RELEASED");
  assert.equal(seat.credential_revoked, true);
  assert.equal(seat.binding_state, "UNBOUND");
  assert.equal(
    ctx.store.events.some(
      (event) => event.type === "SEAT_RELEASED"
        && event.payload.reason === "recovery_window_expired",
    ),
    true,
  );

  // 凭据已吊销，迟到的恢复请求必须失败。
  assert.throws(
    () => ctx.store.recoverSeat({ seatId, recoveryCredential: ctx.credentials[0] }),
    probe("seat_released"),
  );
});

test("规则2：错误的恢复凭据被拒绝，且不改变席位状态", () => {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  assert.throws(
    () => ctx.store.recoverSeat({ seatId, recoveryCredential: "tok-forged-credential" }),
    probe("recovery_credential_rejected"),
  );
  assert.equal(ctx.store.seatState(seatId).state, "DISCONNECTED");
  // 用另一席的凭据也不行。
  assert.throws(
    () => ctx.store.recoverSeat({ seatId, recoveryCredential: ctx.credentials[1] }),
    probe("recovery_credential_rejected"),
  );
});

test("规则2：可参与席不足两名时只暂停下一手开始，不影响当前手", () => {
  const ctx = room(2);
  startFirstHand(ctx);
  // 当前手进行中掉线，只剩一席可参与。
  ctx.store.markDisconnected({
    seatId: ctx.seats[1].seat_id,
    connectionId: `conn-${ctx.seats[1].seat_id}`,
  });
  assert.equal(ctx.store.roomState().hand_active, true);

  settleAndWaitInterHand(ctx);
  const blocked = ctx.store.evaluateStart();
  assert.equal(blocked.can_start, false);
  assert.equal(blocked.reason, "insufficient_participants");
  assert.equal(blocked.participable_count, 1);
  assert.throws(() => ctx.store.startHand(), probe("hand_start_blocked"));

  // 断线玩家恢复并重新 Ready 后，下一手才恢复开始。
  ctx.store.recoverSeat({
    seatId: ctx.seats[1].seat_id,
    recoveryCredential: ctx.credentials[1],
  });
  ctx.store.markConnected({ seatId: ctx.seats[1].seat_id, connectionId: "conn-back" });
  ctx.store.setReady({ seatId: ctx.seats[1].seat_id, ready: true });
  const resumed = ctx.store.evaluateStart();
  assert.equal(resumed.can_start, true);
  assert.equal(resumed.reason, "auto_next_hand");
});

test("规则2：掉线席位不能被代为 Ready", () => {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  assert.throws(() => ctx.store.setReady({ seatId, ready: true }), probe("seat_not_connected"));
});

// ---------------------------------------------------------------------------
// 规则 3：两种离桌语义与 UNBOUND 门禁。
// ---------------------------------------------------------------------------

test("规则3：本手后暂离——完成当前手才 sit out，保留房间、座位与公开绑定", () => {
  const ctx = room(3);
  startFirstHand(ctx, [0, 1, 2]);
  const seatId = ctx.seats[2].seat_id;

  const scheduled = ctx.store.requestSitOutAfterHand({ seatId });
  // 当前手仍在参与，没有被立刻挪走。
  assert.equal(scheduled.state, "ACTIVE");
  assert.equal(scheduled.sit_out_after_hand, true);
  assert.equal(types(ctx.store).includes("SEAT_SIT_OUT_SCHEDULED"), true);

  ctx.store.handSettled();
  const seat = ctx.store.seatState(seatId);
  assert.equal(seat.state, "SIT_OUT");
  // 保留原房间、座位与绑定，凭据未吊销。
  assert.equal(seat.room_id, ctx.room.room_id);
  assert.equal(seat.binding_state, "BOUND");
  assert.equal(seat.credential_revoked, false);
  assert.equal(seat.privacy_fence, false);
});

test("规则3：离开牌桌——隐私栅栏立即生效，不等本手结束", () => {
  const ctx = room(3);
  startFirstHand(ctx, [0, 1, 2]);
  const seatId = ctx.seats[2].seat_id;

  const left = ctx.store.leaveTable({ seatId });
  // 栅栏立即建立：停止新的公开路由、AI 唤醒与主动操作。
  assert.equal(left.privacy_fence, true);
  assert.equal(left.leave_requested, true);
  assert.equal(left.binding_state, "LEAVING");
  const fenced = ctx.store.events.find((event) => event.type === "SEAT_PRIVACY_FENCED");
  assert.equal(fenced.payload.stops_public_routing, true);
  assert.equal(fenced.payload.stops_ai_wakeup, true);
  assert.equal(fenced.payload.stops_proactive_ops, true);
  // 席位尚未释放：还要先在当前手弃牌。
  assert.equal(left.state, "ACTIVE");
  assert.equal(left.pending_fold, true);
});

test("规则3：离开牌桌——在下一个合法行动点弃牌，随后释放席位并吊销凭据", () => {
  const ctx = room(3);
  startFirstHand(ctx, [0, 1, 2]);
  const seatId = ctx.seats[2].seat_id;
  ctx.store.leaveTable({ seatId });

  const forced = ctx.store.consumePendingFold({ seatId });
  assert.deepEqual(forced, { seat_id: seatId, action: "fold", reason: "left_table" });
  // 只弃一次，重复取用返回 null。
  assert.equal(ctx.store.consumePendingFold({ seatId }), null);

  ctx.store.handSettled();
  const seat = ctx.store.seatState(seatId);
  assert.equal(seat.state, "RELEASED");
  assert.equal(seat.credential_revoked, true);
  assert.equal(seat.binding_state, "UNBOUND");
});

test("规则3：离开牌桌——已经 all-in 的席位不弃牌，正常结算", () => {
  const ctx = room(3);
  startFirstHand(ctx, [0, 1, 2]);
  const seatId = ctx.seats[2].seat_id;
  ctx.store.markAllIn({ seatId, allIn: true });

  const left = ctx.store.leaveTable({ seatId });
  assert.equal(left.privacy_fence, true);
  // all-in 不能被弃牌，必须走完结算。
  assert.equal(left.pending_fold, false);
  assert.equal(ctx.store.consumePendingFold({ seatId }), null);
  const fenced = ctx.store.events.find((event) => event.type === "SEAT_PRIVACY_FENCED");
  assert.equal(fenced.payload.settles_all_in, true);
  assert.equal(fenced.payload.pending_fold, false);

  ctx.store.handSettled();
  assert.equal(ctx.store.seatState(seatId).state, "RELEASED");
});

test("规则3：旧绑定未 UNBOUND 前不得加入新房或新席", () => {
  const ctx = room(2);
  startFirstHand(ctx);
  const seatId = ctx.seats[1].seat_id;
  ctx.store.leaveTable({ seatId });
  assert.equal(ctx.store.bindingState("p2").state, "LEAVING");

  // LEAVING 期间不得换席。
  assert.throws(
    () => ctx.store.joinRoom({ playerId: "p2", inviteCode: ctx.invite.invite_code }),
    probe("player_binding_not_released"),
  );

  ctx.store.consumePendingFold({ seatId });
  ctx.store.handSettled();
  assert.equal(ctx.store.bindingState("p2").state, "UNBOUND");

  // UNBOUND 之后才允许重新入座，且拿到的是新座位与新凭据。
  const rejoined = ctx.store.joinRoom({ playerId: "p2", inviteCode: ctx.invite.invite_code });
  assert.notEqual(rejoined.seat.seat_id, seatId);
  assert.notEqual(rejoined.credential, ctx.credentials[1]);
  assert.equal(rejoined.seat.state, "SEATED");
});

test("规则3：不在手中时离开牌桌立即释放席位", () => {
  const ctx = room(2);
  const seatId = ctx.seats[1].seat_id;
  const left = ctx.store.leaveTable({ seatId });
  assert.equal(left.state, "RELEASED");
  assert.equal(left.credential_revoked, true);
  assert.equal(left.binding_state, "UNBOUND");
  assert.equal(ctx.store.roomState().seats.length, 1);
});

test("规则3：离开中的席位不能再 Ready 或改暂离", () => {
  const ctx = room(3);
  startFirstHand(ctx, [0, 1, 2]);
  const seatId = ctx.seats[2].seat_id;
  ctx.store.leaveTable({ seatId });
  assert.throws(() => ctx.store.setReady({ seatId, ready: true }), probe("seat_leaving"));
  assert.throws(() => ctx.store.requestSitOutAfterHand({ seatId }), probe("seat_leaving"));
  // 重复离开是幂等的，不重复建栅栏。
  ctx.store.leaveTable({ seatId });
  assert.equal(
    ctx.store.events.filter((event) => event.type === "SEAT_PRIVACY_FENCED").length,
    1,
  );
});

// ---------------------------------------------------------------------------
// 规则 4：亮牌。语义已由现有牌局引擎实现，这里做验证而不是重新实现。
// ---------------------------------------------------------------------------

const { HoldemHand, HoldemRuleError, standardDeck } = require("../src/game/holdem.cjs");

function threeSeatHand() {
  let now = 1_000;
  return new HoldemHand({
    id: "hand-rule4",
    tableId: "room-rule4",
    seats: [
      { id: "s1", label: "S1", stack: 200 },
      { id: "s2", label: "S2", stack: 200 },
      { id: "s3", label: "S3", stack: 200 },
    ],
    dealerIndex: 0,
    smallBlind: 1,
    bigBlind: 2,
    actionTimeoutMs: 30_000,
    deck: standardDeck(),
    now: () => now,
  });
}

// 让除一人以外全部弃牌，返回获胜者 id。行动顺序由引擎决定，这里跟着它走。
function foldAllButOne(hand) {
  let guard = 0;
  while (hand.status === "active" && guard < 20) {
    const projection = hand.publicProjection();
    const actor = projection.actor_player_id;
    if (actor === null) break;
    const remaining = projection.seats.filter((seat) => seat.status !== "folded");
    if (remaining.length <= 2) {
      // 再弃一个就只剩一人。
      hand.act({ playerId: actor, type: "fold" });
      break;
    }
    hand.act({ playerId: actor, type: "fold" });
    guard += 1;
  }
  return hand;
}

test("规则4：全部弃牌结束时获胜者底牌默认不强制公开", () => {
  const hand = foldAllButOne(threeSeatHand());
  assert.equal(hand.status, "complete");
  assert.equal(hand.finishReason, "all_others_folded");

  const winnerId = hand.settlement.winner_ids[0];
  // 对其他查看者，获胜者底牌默认不可见。
  const otherId = ["s1", "s2", "s3"].find((id) => id !== winnerId);
  const seen = hand.publicProjection(otherId).seats
    .find((seat) => seat.id === winnerId);
  assert.equal(seen.hole_cards, null);
});

test("规则4：获胜者可以自愿亮牌，非获胜者不能", () => {
  const hand = foldAllButOne(threeSeatHand());
  const winnerId = hand.settlement.winner_ids[0];
  const otherId = ["s1", "s2", "s3"].find((id) => id !== winnerId);

  assert.throws(
    () => hand.revealCards(otherId),
    (error) => error instanceof HoldemRuleError && error.code === "only_winner_may_reveal",
  );

  const revealed = hand.revealCards(winnerId);
  assert.equal(revealed.revealed, true);
  assert.equal(revealed.hole_cards.length, 2);
  // 亮牌后对其他查看者可见。
  const seen = hand.publicProjection(otherId).seats.find((seat) => seat.id === winnerId);
  assert.deepEqual(seen.hole_cards, revealed.hole_cards);
  // 重复亮牌是幂等的。
  assert.equal(hand.revealCards(winnerId).replay, true);
});

test("规则4：牌局未以全部弃牌结束时不提供自愿亮牌", () => {
  const hand = threeSeatHand();
  assert.throws(
    () => hand.revealCards("s1"),
    (error) => error instanceof HoldemRuleError
      && error.code === "voluntary_reveal_not_available",
  );
});

// ---------------------------------------------------------------------------
// 集成：一个房间从创建走到第二手，事件顺序稳定。
// ---------------------------------------------------------------------------

test("集成：创建 -> 加入 -> Ready -> 首手 -> 结算 -> 次手的权威事件顺序", () => {
  const ctx = room(2);
  const observed = [];
  ctx.store.onEvent((event) => observed.push(event.type));

  startFirstHand(ctx);
  settleAndWaitInterHand(ctx);
  ctx.store.startHand();

  assert.deepEqual(observed, [
    "SEAT_READY_CHANGED",
    "SEAT_READY_CHANGED",
    "HAND_START_COUNTDOWN_STARTED",
    "HAND_STARTED",
    "HAND_SETTLED",
    "HAND_STARTED",
  ]);
  const state = ctx.store.roomState();
  assert.equal(state.hand_index, 2);
  assert.equal(state.contract, "tokengame.temporary-private-room.v1");
});

test("边界：未创建房间、未知席位与非法席数都被确定性拒绝", () => {
  const bare = harness();
  assert.throws(() => bare.store.roomState(), probe("room_not_found"));
  assert.throws(
    () => bare.store.joinRoom({ playerId: "p1", inviteCode: "tok-x" }),
    probe("room_not_found"),
  );
  assert.throws(
    () => bare.store.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES, maxSeats: 5 }),
    probe("invalid_field"),
  );
  assert.throws(
    () => bare.store.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES, maxSeats: 1 }),
    probe("invalid_field"),
  );

  const ctx = room(2);
  assert.throws(() => ctx.store.seatState("seat-404"), probe("seat_not_found"));
  assert.throws(
    () => ctx.store.createRoom({ hostPlayerId: "p9", tableRulesVersion: RULES }),
    probe("room_already_exists"),
  );
  assert.throws(() => ctx.store.handSettled(), probe("no_active_hand"));
});











