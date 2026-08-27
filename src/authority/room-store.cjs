"use strict";

// 临时私人房与座位归属的权威内核。
// 实现 SC-TG-L2-PLAYABLE-TABLE-20260827-D 的规则 1～3，并为
// SC-TG-L2-SESSION-LAUNCH-20260827-B 提供房间创建、加入与座位恢复。
//
// 宿主中立：不引用 Codex / Claude / Hook / MCP，任何宿主适配器都只调用本模块。
//
// 与 table-store.cjs 的关系：后者是被反转的「固定公开测试桌」语义（四席预入座、
// 无 Ready 门、创建者即权威），见该文件顶部 SUPERSEDED_BY 注释。本模块不复用它。
//
// 边界：本模块只裁决房间与座位的生命周期，不发牌、不推进街道、不结算。
// 牌局裁决仍归 src/game/holdem.cjs；本模块只回答「现在能不能开下一手」。

const crypto = require("node:crypto");
const { ProbeError } = require("./event-store.cjs");

// 规则 1～2 的时间参数。合同锁定了 3 秒倒计时、3 秒手间展示与 120 秒恢复窗，
// 也锁定了「至少两名可参与玩家即可开始」与「最多四席」。
const TABLE_LIFECYCLE_V1 = Object.freeze({
  version: "TABLE_LIFECYCLE_V1",
  maxSeats: 4,
  minParticipants: 2,
  readyCountdownMs: 3_000,
  interHandDisplayMs: 3_000,
  recoveryRetentionMs: 120_000,
});

// 等待、准备、参与、暂离、掉线、已释放。合同要求这些状态对玩家可理解。
const SEAT_STATES = Object.freeze([
  "SEATED",
  "READY",
  "ACTIVE",
  "SIT_OUT",
  "DISCONNECTED",
  "RELEASED",
]);

// 规则 3：旧绑定必须走到 UNBOUND 才允许加入新房或新席。
const BINDING_STATES = Object.freeze(["BOUND", "LEAVING", "UNBOUND"]);

// 规则 1：只有 ACTIVE 与 READY 计入「可参与席」。SEATED 是旁观，不阻塞开局也不
// 促成开局；SIT_OUT 与 DISCONNECTED 同样不计入。
const PARTICIPABLE_STATES = Object.freeze(["ACTIVE", "READY"]);

function requiredString(value, field, maxLength = 256) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProbeError("invalid_field", 400, { field });
  }
  if (value.length > maxLength) {
    throw new ProbeError("field_too_long", 400, { field, maxLength });
  }
  return value;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// 凭据比较必须定长，避免按前缀早退泄露信息。
function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBytes, rightBytes);
}

class RoomStore {
  constructor({
    now = () => Date.now(),
    idFactory = () => crypto.randomUUID(),
    tokenFactory = () => crypto.randomBytes(32).toString("base64url"),
    limits = TABLE_LIFECYCLE_V1,
  } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.tokenFactory = tokenFactory;
    this.limits = Object.freeze({ ...TABLE_LIFECYCLE_V1, ...limits });
    this.room = null;
    this.seats = new Map();
    this.invites = new Map();
    // 玩家 -> 绑定状态。规则 3 用它拦截「未 UNBOUND 就换房换席」。
    this.bindings = new Map();
    this.events = [];
    this.listeners = new Set();
    this.sequence = 0;
    this.handIndex = 0;
    this.handActive = false;
    // 规则 1：首手与后续手的开局条件不同，需要区分是否已开过第一手。
    this.firstHandStarted = false;
    this.countdown = null;
    this.interHandEndsAt = null;
  }

  // SESSION-LAUNCH：创建一个临时私人房，并把创建者绑定到第一个座位。
  // 创建者不因创建而获得任何牌局权威——规则 plausible_but_wrong 明确禁止。
  createRoom(input = {}) {
    if (this.room !== null) {
      throw new ProbeError("room_already_exists", 409, { room_id: this.room.room_id });
    }
    const hostPlayerId = requiredString(input.hostPlayerId, "hostPlayerId", 64);
    const tableRulesVersion = requiredString(input.tableRulesVersion, "tableRulesVersion", 64);
    const maxSeats = input.maxSeats === undefined
      ? this.limits.maxSeats
      : Number(input.maxSeats);
    if (
      !Number.isSafeInteger(maxSeats)
      || maxSeats < this.limits.minParticipants
      || maxSeats > this.limits.maxSeats
    ) {
      throw new ProbeError("invalid_field", 400, {
        field: "maxSeats",
        min: this.limits.minParticipants,
        max: this.limits.maxSeats,
      });
    }

    this.room = {
      room_id: `room-${this.idFactory()}`,
      // 绑房标识给 seat-ai-store 的默认公开确认使用；桌规版本变化必须重新确认。
      room_binding_id: `bind-${this.idFactory()}`,
      table_rules_version: tableRulesVersion,
      visibility: "TEMPORARY_PRIVATE",
      max_seats: maxSeats,
      created_at: this.now(),
      created_by: hostPlayerId,
    };
    this.record("ROOM_CREATED", {
      room_id: this.room.room_id,
      room_binding_id: this.room.room_binding_id,
      table_rules_version: tableRulesVersion,
      visibility: "TEMPORARY_PRIVATE",
      max_seats: maxSeats,
      created_by: hostPlayerId,
    });

    const invite = this.issueInvite();
    const seat = this.seatPlayer(hostPlayerId);
    return { room: clone(this.room), invite, seat: seat.projection, credential: seat.credential };
  }

  issueInvite() {
    const invite = {
      invite_code: this.tokenFactory(),
      room_id: this.room.room_id,
      issued_at: this.now(),
    };
    this.invites.set(invite.invite_code, invite);
    return { invite_code: invite.invite_code, room_id: invite.room_id };
  }

  requireRoom() {
    if (this.room === null) {
      throw new ProbeError("room_not_found", 404);
    }
    return this.room;
  }

  // 规则 3：旧绑定未 UNBOUND 前不得加入新房或新席。
  requireUnbound(playerId) {
    const binding = this.bindings.get(playerId);
    if (binding !== undefined && binding.state !== "UNBOUND") {
      throw new ProbeError("player_binding_not_released", 409, {
        player_id: playerId,
        binding_state: binding.state,
        seat_id: binding.seat_id,
      });
    }
  }

  occupiedSeats() {
    return [...this.seats.values()].filter((seat) => seat.state !== "RELEASED");
  }

  seatPlayer(playerId) {
    this.requireUnbound(playerId);
    if (this.occupiedSeats().length >= this.room.max_seats) {
      throw new ProbeError("room_full", 409, { max_seats: this.room.max_seats });
    }
    const seatId = `seat-${this.idFactory()}`;
    const credential = this.tokenFactory();
    const seat = {
      seat_id: seatId,
      player_id: playerId,
      room_id: this.room.room_id,
      // 规则 1：新入座者是旁观，必须自己明确 Ready 才计入可参与席。
      state: "SEATED",
      recovery_credential: credential,
      credential_revoked: false,
      connections: new Set(),
      // 规则 2：保留窗从最后一个有效连接消失起算。
      last_connection_lost_at: null,
      retention_expires_at: null,
      // 规则 1：中途加入者最早从下一手参与。
      eligible_from_hand_index: this.handIndex + 1,
      // 规则 3：两种离桌请求。
      sit_out_after_hand: false,
      leave_requested: false,
      privacy_fence: false,
      pending_fold: false,
      all_in: false,
    };
    this.seats.set(seatId, seat);
    this.bindings.set(playerId, { state: "BOUND", seat_id: seatId });
    this.record("SEAT_BOUND", {
      seat_id: seatId,
      player_id: playerId,
      room_id: this.room.room_id,
      state: "SEATED",
      eligible_from_hand_index: seat.eligible_from_hand_index,
    });
    return { projection: this.seatProjection(seat), credential };
  }

  // SESSION-LAUNCH：凭邀请加入同一个房间，而不是新建命名空间或第二身份。
  joinRoom(input = {}) {
    const room = this.requireRoom();
    const playerId = requiredString(input.playerId, "playerId", 64);
    const inviteCode = requiredString(input.inviteCode, "inviteCode", 512);
    const invite = [...this.invites.values()].find(
      (candidate) => sameSecret(candidate.invite_code, inviteCode),
    );
    if (invite === undefined || invite.room_id !== room.room_id) {
      throw new ProbeError("invite_rejected", 403);
    }
    const seat = this.seatPlayer(playerId);
    return { room: clone(room), seat: seat.projection, credential: seat.credential };
  }

  requireSeat(seatIdValue) {
    const seatId = requiredString(seatIdValue, "seatId", 64);
    const seat = this.seats.get(seatId);
    if (seat === undefined) {
      throw new ProbeError("seat_not_found", 404, { seat_id: seatId });
    }
    return seat;
  }

  // SESSION-LAUNCH + 规则 2：普通中断后回到原房间与原座位，而不是静默建立第二身份。
  recoverSeat(input = {}) {
    const room = this.requireRoom();
    const seat = this.requireSeat(input.seatId);
    const credential = requiredString(input.recoveryCredential, "recoveryCredential", 512);

    if (seat.state === "RELEASED" || seat.credential_revoked) {
      throw new ProbeError("seat_released", 409, { seat_id: seat.seat_id });
    }
    if (!sameSecret(credential, seat.recovery_credential)) {
      throw new ProbeError("recovery_credential_rejected", 403, { seat_id: seat.seat_id });
    }

    // 恢复不改变归属，只把状态从掉线带回旁观等待，并要求重新 Ready。
    const previousState = seat.state;
    seat.state = "SEATED";
    seat.last_connection_lost_at = null;
    seat.retention_expires_at = null;
    // 规则 1：恢复的玩家最早从下一手参与。
    seat.eligible_from_hand_index = this.handIndex + 1;
    this.record("SEAT_RECOVERED", {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      room_id: room.room_id,
      previous_state: previousState,
      state: seat.state,
      eligible_from_hand_index: seat.eligible_from_hand_index,
    });
    return this.seatProjection(seat);
  }

  markConnected(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const connectionId = requiredString(input.connectionId, "connectionId", 128);
    if (seat.state === "RELEASED") {
      throw new ProbeError("seat_released", 409, { seat_id: seat.seat_id });
    }
    seat.connections.add(connectionId);
    seat.last_connection_lost_at = null;
    seat.retention_expires_at = null;
    return this.record("SEAT_CONNECTION_OPENED", {
      seat_id: seat.seat_id,
      connection_id: connectionId,
      connection_count: seat.connections.size,
      state: seat.state,
    });
  }

  // 规则 2：保留窗从「最后一个有效玩家连接消失」起算，而不是从任一连接断开起算。
  markDisconnected(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const connectionId = requiredString(input.connectionId, "connectionId", 128);
    seat.connections.delete(connectionId);
    if (seat.connections.size > 0) {
      // 还有别的有效连接，不算掉线，也不启动保留窗。
      return this.record("SEAT_CONNECTION_CLOSED", {
        seat_id: seat.seat_id,
        connection_id: connectionId,
        connection_count: seat.connections.size,
        state: seat.state,
        retention_started: false,
      });
    }

    const at = this.now();
    seat.last_connection_lost_at = at;
    seat.retention_expires_at = at + this.limits.recoveryRetentionMs;
    const previousState = seat.state;
    // 规则 2：单席断线不暂停也不延长原行动截止时间；当前手内只标记掉线，
    // 真正转 sit out 要等本手结算。
    if (previousState !== "SIT_OUT") {
      seat.state = "DISCONNECTED";
    }
    return this.record("SEAT_CONNECTION_CLOSED", {
      seat_id: seat.seat_id,
      connection_id: connectionId,
      connection_count: 0,
      previous_state: previousState,
      state: seat.state,
      retention_started: true,
      retention_expires_at: seat.retention_expires_at,
    });
  }

  // 规则 1：Ready 必须由玩家明确表示；未 Ready 的已入座玩家保持旁观。
  setReady(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const ready = input.ready !== false;
    if (seat.state === "RELEASED") {
      throw new ProbeError("seat_released", 409, { seat_id: seat.seat_id });
    }
    if (seat.leave_requested) {
      throw new ProbeError("seat_leaving", 409, { seat_id: seat.seat_id });
    }
    if (seat.connections.size === 0) {
      // 掉线席位不能被别处代为 Ready。
      throw new ProbeError("seat_not_connected", 409, { seat_id: seat.seat_id });
    }

    const previousState = seat.state;
    if (ready) {
      // 已在牌局中的 ACTIVE 席位无需重复 Ready。
      seat.state = previousState === "ACTIVE" ? "ACTIVE" : "READY";
      // 规则 1：重新 Ready 的玩家最早从下一手参与，不插进正在进行的这一手。
      if (previousState !== "ACTIVE") {
        seat.eligible_from_hand_index = Math.max(
          seat.eligible_from_hand_index,
          this.handIndex + (this.handActive ? 1 : 0),
        );
      }
      seat.sit_out_after_hand = false;
    } else {
      seat.state = "SEATED";
    }
    this.record("SEAT_READY_CHANGED", {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      ready,
      previous_state: previousState,
      state: seat.state,
      eligible_from_hand_index: seat.eligible_from_hand_index,
    });
    return this.seatProjection(seat);
  }

  // 规则 1：可参与席只算 ACTIVE 与 READY；旁观、暂离、掉线都不计入。
  participableSeats() {
    return this.occupiedSeats().filter(
      (seat) => PARTICIPABLE_STATES.includes(seat.state) && !seat.leave_requested,
    );
  }

  // 规则 1：真正能进入下一手的席位还要满足 eligible_from_hand_index。
  seatsEligibleForNextHand() {
    const nextHandIndex = this.handIndex + 1;
    return this.participableSeats().filter(
      (seat) => seat.eligible_from_hand_index <= nextHandIndex,
    );
  }

  // 规则 1：开局门禁。首手要求至少两席明确 Ready 后进入 3 秒权威倒计时；
  // 此后只要至少两席仍为 ACTIVE 或 READY，就在 3 秒手间展示后自动开始下一手。
  // 规则 2：可参与席不足两名时只暂停下一手开始，不影响正在进行的这一手。
  evaluateStart() {
    this.releaseExpiredSeats();
    const at = this.now();
    const participable = this.participableSeats();
    const roster = this.seatsEligibleForNextHand();

    if (this.handActive) {
      this.countdown = null;
      return {
        can_start: false,
        reason: "hand_in_progress",
        participable_count: participable.length,
      };
    }

    // 规则 1 的两句话是两条不同的门禁：首手数「明确 Ready」，此后数「ACTIVE 或
    // READY」。首手前 ACTIVE 不存在，两者恰好重合，但理由要各自精确。
    const readyCount = participable.filter((seat) => seat.state === "READY").length;
    const gateCount = this.firstHandStarted ? participable.length : readyCount;
    if (gateCount < this.limits.minParticipants) {
      if (this.countdown !== null) {
        this.countdown = null;
        this.record("HAND_START_COUNTDOWN_CANCELLED", {
          reason: this.firstHandStarted ? "insufficient_participants" : "ready_withdrawn",
          gate_count: gateCount,
        });
      }
      return {
        // 规则 2：只暂停下一手开始，当前手（若有）不受影响。
        can_start: false,
        reason: this.firstHandStarted ? "insufficient_participants" : "awaiting_ready",
        ready_count: readyCount,
        participable_count: participable.length,
        min_participants: this.limits.minParticipants,
      };
    }

    // 首手用 Ready 倒计时，后续手用手间展示；两者都是 3 秒且都由权威计时。
    if (this.interHandEndsAt !== null) {
      if (at < this.interHandEndsAt) {
        return {
          can_start: false,
          reason: "inter_hand_display",
          starts_at: this.interHandEndsAt,
          remaining_ms: this.interHandEndsAt - at,
          participable_count: participable.length,
        };
      }
      this.interHandEndsAt = null;
    }

    if (!this.firstHandStarted) {
      // 规则 1：首手在至少两席明确 Ready 后进入 3 秒权威倒计时。
      if (this.countdown === null) {
        this.countdown = { ends_at: at + this.limits.readyCountdownMs, ready_count: readyCount };
        this.record("HAND_START_COUNTDOWN_STARTED", {
          ends_at: this.countdown.ends_at,
          countdown_ms: this.limits.readyCountdownMs,
          ready_count: readyCount,
        });
      }
      if (at < this.countdown.ends_at) {
        return {
          can_start: false,
          reason: "ready_countdown",
          starts_at: this.countdown.ends_at,
          remaining_ms: this.countdown.ends_at - at,
          ready_count: readyCount,
        };
      }
    }

    return {
      can_start: true,
      reason: this.firstHandStarted ? "auto_next_hand" : "ready_countdown_elapsed",
      next_hand_index: this.handIndex + 1,
      participable_count: participable.length,
      roster: roster.map((seat) => seat.seat_id),
    };
  }

  // 规则 1：只有门禁放行才能开手。名单只含 eligible 的席位，
  // 中途加入、恢复或重新 Ready 的玩家不会被塞进正在进行的这一手。
  startHand() {
    const decision = this.evaluateStart();
    if (!decision.can_start) {
      throw new ProbeError("hand_start_blocked", 409, decision);
    }
    this.handIndex += 1;
    this.handActive = true;
    this.firstHandStarted = true;
    this.countdown = null;

    const roster = [];
    for (const seat of this.seats.values()) {
      if (decision.roster.includes(seat.seat_id)) {
        seat.state = "ACTIVE";
        roster.push(seat.seat_id);
      }
    }
    return this.record("HAND_STARTED", {
      hand_index: this.handIndex,
      roster,
      room_id: this.requireRoom().room_id,
    });
  }

  // 规则 2 + 规则 3：结算是所有「本手后生效」的处置统一落地的时点。
  handSettled() {
    if (!this.handActive) {
      throw new ProbeError("no_active_hand", 409);
    }
    this.handActive = false;
    const at = this.now();
    const settled = this.record("HAND_SETTLED", { hand_index: this.handIndex });

    for (const seat of [...this.seats.values()]) {
      if (seat.state === "RELEASED") {
        continue;
      }
      // 规则 3：「离开牌桌」在本手结束后释放席位并吊销凭据。
      if (seat.leave_requested) {
        this.releaseSeat(seat, "left_table");
        continue;
      }
      // 规则 2：结算后仍断线的席位进入 sit out，但保留原席与恢复凭据。
      if (seat.connections.size === 0 && seat.state !== "SIT_OUT") {
        seat.state = "SIT_OUT";
        this.record("SEAT_SAT_OUT", {
          seat_id: seat.seat_id,
          player_id: seat.player_id,
          reason: "disconnected_at_settlement",
          retention_expires_at: seat.retention_expires_at,
        });
        continue;
      }
      // 规则 3：「本手后暂离」保留房间、座位与任务公开绑定。
      if (seat.sit_out_after_hand) {
        seat.sit_out_after_hand = false;
        seat.state = "SIT_OUT";
        this.record("SEAT_SAT_OUT", {
          seat_id: seat.seat_id,
          player_id: seat.player_id,
          reason: "requested_after_hand",
          binding_state: this.bindings.get(seat.player_id).state,
        });
      }
    }

    // 规则 1：3 秒手间展示后才自动开始下一手。
    this.interHandEndsAt = at + this.limits.interHandDisplayMs;
    return settled;
  }

  // 规则 3：「本手后暂离」——完成当前手后进入 sit out，保留房间、座位与公开绑定。
  requestSitOutAfterHand(input = {}) {
    const seat = this.requireSeat(input.seatId);
    if (seat.state === "RELEASED") {
      throw new ProbeError("seat_released", 409, { seat_id: seat.seat_id });
    }
    if (seat.leave_requested) {
      throw new ProbeError("seat_leaving", 409, { seat_id: seat.seat_id });
    }
    if (!this.handActive || seat.state !== "ACTIVE") {
      // 不在手里就立即生效，没有「本手」可等。
      seat.state = "SIT_OUT";
      seat.sit_out_after_hand = false;
      this.record("SEAT_SAT_OUT", {
        seat_id: seat.seat_id,
        player_id: seat.player_id,
        reason: "requested_immediate",
        binding_state: this.bindings.get(seat.player_id).state,
      });
      return this.seatProjection(seat);
    }
    seat.sit_out_after_hand = true;
    this.record("SEAT_SIT_OUT_SCHEDULED", {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      hand_index: this.handIndex,
    });
    return this.seatProjection(seat);
  }

  // 规则 3：「离开牌桌」——立即建立隐私栅栏，停止该任务新的公开路由、AI 唤醒和
  // 主动操作；在当前手的下一个合法行动点弃牌，已经 all-in 则正常结算；随后释放
  // 席位并吊销凭据。
  leaveTable(input = {}) {
    const seat = this.requireSeat(input.seatId);
    if (seat.state === "RELEASED") {
      throw new ProbeError("seat_released", 409, { seat_id: seat.seat_id });
    }
    if (seat.leave_requested) {
      return this.seatProjection(seat);
    }

    seat.leave_requested = true;
    // 隐私栅栏立即生效，不等本手结束。
    seat.privacy_fence = true;
    seat.sit_out_after_hand = false;
    const binding = this.bindings.get(seat.player_id);
    binding.state = "LEAVING";
    const inHand = this.handActive && seat.state === "ACTIVE";
    // 已经 all-in 的席位不能弃牌，必须正常参与结算。
    seat.pending_fold = inHand && !seat.all_in;

    this.record("SEAT_PRIVACY_FENCED", {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      stops_public_routing: true,
      stops_ai_wakeup: true,
      stops_proactive_ops: true,
      pending_fold: seat.pending_fold,
      settles_all_in: inHand && seat.all_in,
      binding_state: binding.state,
    });

    if (!inHand) {
      // 不在手里，立即释放。
      this.releaseSeat(seat, "left_table");
    }
    return this.seatProjection(seat);
  }

  // 规则 3：宿主在当前手的下一个合法行动点调用本方法，取得应执行的强制动作。
  // 已 all-in 的席位返回 null——它必须正常结算，不能被弃牌。
  consumePendingFold(input = {}) {
    const seat = this.requireSeat(input.seatId);
    if (!seat.pending_fold) {
      return null;
    }
    seat.pending_fold = false;
    this.record("SEAT_FORCED_FOLD", {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      hand_index: this.handIndex,
      reason: "left_table",
    });
    return { seat_id: seat.seat_id, action: "fold", reason: "left_table" };
  }

  // all-in 由牌局引擎告知；影响「离开牌桌」时是弃牌还是正常结算。
  markAllIn(input = {}) {
    const seat = this.requireSeat(input.seatId);
    seat.all_in = input.allIn !== false;
    if (seat.all_in && seat.pending_fold) {
      // all-in 之后不能再弃牌，改为正常结算。
      seat.pending_fold = false;
    }
    return this.seatProjection(seat);
  }

  // 规则 2 + 规则 3：释放席位必须同时吊销恢复凭据，并把绑定推进到 UNBOUND，
  // 玩家才能加入新房或新席。
  releaseSeat(seat, reason) {
    seat.state = "RELEASED";
    seat.credential_revoked = true;
    seat.recovery_credential = null;
    seat.connections = new Set();
    seat.pending_fold = false;
    seat.retention_expires_at = null;
    const binding = this.bindings.get(seat.player_id);
    binding.state = "UNBOUND";
    binding.seat_id = null;
    return this.record("SEAT_RELEASED", {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      reason,
      credential_revoked: true,
      binding_state: "UNBOUND",
    });
  }

  // 规则 2：自最后一个有效玩家连接消失起保留原席与恢复凭据 120 秒，随后释放。
  releaseExpiredSeats() {
    const at = this.now();
    const released = [];
    for (const seat of [...this.seats.values()]) {
      if (seat.state === "RELEASED" || seat.retention_expires_at === null) {
        continue;
      }
      if (at >= seat.retention_expires_at) {
        this.releaseSeat(seat, "recovery_window_expired");
        released.push(seat.seat_id);
      }
    }
    return released;
  }

  retentionRemainingMs(seat) {
    if (seat.retention_expires_at === null) {
      return null;
    }
    const remaining = seat.retention_expires_at - this.now();
    return remaining > 0 ? remaining : 0;
  }

  seatProjection(seat) {
    return {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      room_id: seat.room_id,
      state: seat.state,
      connected: seat.connections.size > 0,
      binding_state: this.bindings.get(seat.player_id).state,
      eligible_from_hand_index: seat.eligible_from_hand_index,
      sit_out_after_hand: seat.sit_out_after_hand,
      leave_requested: seat.leave_requested,
      privacy_fence: seat.privacy_fence,
      pending_fold: seat.pending_fold,
      all_in: seat.all_in,
      credential_revoked: seat.credential_revoked,
      retention_remaining_ms: this.retentionRemainingMs(seat),
      limits_version: this.limits.version,
    };
  }

  // 恢复凭据永不出现在任何投影里；只在创建与加入时返回给该玩家一次。
  roomState() {
    this.releaseExpiredSeats();
    const room = this.requireRoom();
    return {
      contract: "tokengame.temporary-private-room.v1",
      room: clone(room),
      limits_version: this.limits.version,
      hand_index: this.handIndex,
      hand_active: this.handActive,
      first_hand_started: this.firstHandStarted,
      seats: this.occupiedSeats().map((seat) => this.seatProjection(seat)),
      participable_count: this.participableSeats().length,
      start_decision: this.evaluateStart(),
    };
  }

  seatState(seatIdValue) {
    return this.seatProjection(this.requireSeat(seatIdValue));
  }

  bindingState(playerIdValue) {
    const playerId = requiredString(playerIdValue, "playerId", 64);
    const binding = this.bindings.get(playerId);
    return binding === undefined ? { state: "UNBOUND", seat_id: null } : clone(binding);
  }

  record(type, payload) {
    this.sequence += 1;
    const event = {
      event_id: `room-${this.idFactory()}`,
      sequence: this.sequence,
      type,
      at: this.now(),
      payload: clone(payload) ?? {},
    };
    this.events.push(event);
    for (const listener of this.listeners) {
      try {
        listener(clone(event));
      } catch {
        // 监听器故障不得影响权威记账。
      }
    }
    return event;
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

module.exports = {
  RoomStore,
  TABLE_LIFECYCLE_V1,
  SEAT_STATES,
  BINDING_STATES,
  PARTICIPABLE_STATES,
};












