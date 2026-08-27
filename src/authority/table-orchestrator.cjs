"use strict";

// 宿主中立编排层：把三个已闭合的内核咬合起来，自己不新增任何产品语义。
//
//   src/authority/room-store.cjs   房间与席位生命周期  SC-TG-L2-PLAYABLE-TABLE-...-D
//   src/authority/seat-ai-store.cjs 公开 AI 交流       SC-TG-L2-PUBLIC-AI-EXCHANGE-...-D
//   src/game/holdem.cjs            无限注德州裁决
//
// 三条自我约束，越界就是在造第二个 TokenGame：
//   1. 不调用任何模型。需要模型的地方一律返回「意图」，由宿主适配器执行后回填。
//   2. 不重新判定任何一条受保护规则。规则由内核裁决，本层只负责把事件送对地方。
//   3. 不新增时间源。now / idFactory / tokenFactory 全部透传，保持确定性可测。
//
// 存在的理由：牌局引擎的事件词表（ACTION_REQUIRED / PLAYER_ACTION / STREET_DEALT /
// HAND_COMPLETED）与 seat-ai-store 的白名单词表（SEAT_ACTION_WINDOW_OPENED / BET /
// RAISE / ALL_IN / STREET_ADVANCED / HAND_SETTLED）不是同一套。这个翻译必须只有
// 一处，否则 Codex 适配器和 Claude 适配器会各翻一遍并逐渐分叉。

const { ProbeError } = require("./event-store.cjs");
const { RoomStore, TABLE_LIFECYCLE_V1 } = require("./room-store.cjs");
const { SeatAiStore, LIVELY_V1 } = require("./seat-ai-store.cjs");
const { HoldemHand, shuffledDeck } = require("../game/holdem.cjs");

// 牌局引擎事件 -> seat-ai-store 白名单事件。不在此表中的引擎事件（HOLE_CARDS_DEALT、
// BLIND_POSTED、ACTION_REQUIRED 之外的一切）都只进权威时间线，不唤醒任何席位 AI。
const ENGINE_TO_WHITELIST = Object.freeze({
  ACTION_REQUIRED: "SEAT_ACTION_WINDOW_OPENED",
  STREET_DEALT: "STREET_ADVANCED",
  HAND_COMPLETED: "HAND_SETTLED",
});

// PLAYER_ACTION 按动作细分。check / call / fold 不唤醒 AI：白名单里没有它们，
// 这是合同的选择而不是遗漏——只有加注压力和行动窗口才值得让 AI 说话。
const ACTION_TO_WHITELIST = Object.freeze({
  bet: "BET",
  raise: "RAISE",
  all_in: "ALL_IN",
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class TableOrchestrator {
  constructor({
    now = () => Date.now(),
    idFactory = () => require("node:crypto").randomUUID(),
    tokenFactory,
    deckFactory = () => shuffledDeck(),
    roomLimits = TABLE_LIFECYCLE_V1,
    aiLimits = LIVELY_V1,
    smallBlind = 1,
    bigBlind = 2,
    startingStack = 200,
    actionTimeoutMs = 30_000,
  } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.deckFactory = deckFactory;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.startingStack = startingStack;
    this.actionTimeoutMs = actionTimeoutMs;

    this.rooms = new RoomStore({
      now,
      idFactory,
      ...(tokenFactory ? { tokenFactory } : {}),
      limits: roomLimits,
    });
    this.ai = new SeatAiStore({ now, idFactory, limits: aiLimits });

    this.hand = null;
    // 座位 -> 玩家。牌局引擎按 playerId 索引，两个内核按 seatId 索引，翻译要有依据。
    this.seatToPlayer = new Map();
    this.playerToSeat = new Map();
    // 待宿主执行的 AI 评估意图。本层只攒，不执行。
    this.pendingIntents = [];
    this.rooms.onEvent((event) => this.onRoomEvent(event));
  }

  // ---------------------------------------------------------------- 房间生命周期

  createRoom(input = {}) {
    const created = this.rooms.createRoom(input);
    // 规则 1（AI 合同）：绑房或桌规版本变化都必须重新明确确认默认公开。
    // 由宿主在 UI 上取得确认后调用 confirmPublicScope，本层不代为承诺。
    return created;
  }

  confirmPublicScope() {
    const room = this.rooms.requireRoom();
    return this.ai.confirmDefaultPublicScope({
      roomBindingId: room.room_binding_id,
      tableRulesVersion: room.table_rules_version,
      acknowledged: true,
    });
  }

  requireConfirmedScope() {
    const room = this.rooms.requireRoom();
    return this.ai.requireConfirmedScope(room.room_binding_id, room.table_rules_version);
  }

  joinRoom(input = {}) {
    return this.rooms.joinRoom(input);
  }

  // room-store 的权威事件是编排的唯一触发源；不从返回值里推断状态。
  onRoomEvent(event) {
    if (event.type === "SEAT_BOUND" || event.type === "SEAT_RECOVERED") {
      this.bindSeat(event.payload.seat_id, event.payload.player_id);
      return;
    }
    if (event.type === "SEAT_PRIVACY_FENCED") {
      // 规则 3（桌面合同）：离桌立即停止 AI 唤醒。围栏落地方式就是把该席 AI 切 OFF，
      // 在途回合随之取消，迟到结果由 resolveEvaluation 按 seat_ai_off 丢弃。
      this.silenceSeat(event.payload.seat_id);
      return;
    }
    if (event.type === "SEAT_RELEASED") {
      this.silenceSeat(event.payload.seat_id);
      this.unbindSeat(event.payload.seat_id);
    }
  }

  bindSeat(seatId, playerId) {
    this.seatToPlayer.set(seatId, playerId);
    this.playerToSeat.set(playerId, seatId);
    if (!this.ai.seats.has(seatId)) {
      this.ai.registerSeat({ seatId, playerId });
    }
  }

  unbindSeat(seatId) {
    const playerId = this.seatToPlayer.get(seatId);
    this.seatToPlayer.delete(seatId);
    if (playerId !== undefined && this.playerToSeat.get(playerId) === seatId) {
      this.playerToSeat.delete(playerId);
    }
  }

  silenceSeat(seatId) {
    if (!this.ai.seats.has(seatId)) {
      return null;
    }
    // 已 OFF 时 setSeatAiMode 返回 MODE_UNCHANGED，幂等，无需先查。
    return this.ai.setSeatAiMode({ seatId, mode: "OFF" });
  }

  requireSeatId(playerId) {
    const seatId = this.playerToSeat.get(playerId);
    if (seatId === undefined) {
      throw new ProbeError("seat_not_found", 404, { player_id: playerId });
    }
    return seatId;
  }

  requirePlayerId(seatId) {
    const playerId = this.seatToPlayer.get(seatId);
    if (playerId === undefined) {
      throw new ProbeError("seat_not_found", 404, { seat_id: seatId });
    }
    return playerId;
  }

  // -------------------------------------------------------------------- 牌局生命周期

  setReady(input = {}) {
    return this.rooms.setReady(input);
  }

  // 开局门禁完全交给 room-store 判定；本层只在它说「可以」时才建牌局。
  evaluateStart() {
    return this.rooms.evaluateStart();
  }

  startHandIfDue() {
    const decision = this.rooms.evaluateStart();
    // 字段名是 can_start。用别名会静默恒假，把「开不了局」伪装成正常状态。
    if (decision.can_start !== true) {
      return { started: false, decision };
    }
    return { started: true, decision, ...this.startHand() };
  }

  startHand() {
    if (this.hand !== null && this.hand.status !== "complete") {
      throw new ProbeError("hand_already_active", 409, { hand_id: this.hand.id });
    }
    const started = this.rooms.startHand();
    const roster = started.payload.roster;
    // 两个内核各自维护 handIndex，必须同步推进，否则规则 5 的跨手丢弃会错判。
    this.ai.startHand();

    this.hand = new HoldemHand({
      id: `hand-${started.payload.hand_index}-${this.idFactory()}`,
      tableId: this.rooms.requireRoom().room_id,
      seats: roster.map((seatId) => ({
        id: this.requirePlayerId(seatId),
        stack: this.startingStack,
      })),
      dealerIndex: (started.payload.hand_index - 1) % roster.length,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      actionTimeoutMs: this.actionTimeoutMs,
      deck: this.deckFactory(),
      now: this.now,
    });

    const intents = this.drainEngine();
    return { hand_id: this.hand.id, hand_index: started.payload.hand_index, roster, intents };
  }

  requireHand() {
    if (this.hand === null) {
      throw new ProbeError("no_active_hand", 409);
    }
    return this.hand;
  }

  act(input = {}) {
    const hand = this.requireHand();
    const result = hand.act(input);
    // all-in 状态回填给 room-store：规则 3 用它决定离桌时是强制弃牌还是等待结算。
    this.syncAllIn();
    return { result, intents: this.drainEngine() };
  }

  settleExpiredAction() {
    const hand = this.requireHand();
    const result = hand.settleExpiredAction();
    if (result === null || result === undefined) {
      return { result: null, intents: [] };
    }
    this.syncAllIn();
    return { result, intents: this.drainEngine() };
  }

  syncAllIn() {
    for (const seat of this.hand.seats) {
      if (seat.all_in !== true) {
        continue;
      }
      const seatId = this.playerToSeat.get(seat.id);
      if (seatId !== undefined) {
        this.rooms.markAllIn({ seatId });
      }
    }
  }

  // 规则 3（桌面合同）：离桌者在本手内记一次强制弃牌。
  //
  // 牌局引擎只接受当前行动者的动作，而离桌可以发生在任何时刻。所以强制弃牌分两步：
  // room-store 在围栏时就记下 pending_fold（合同要求的「记一次」已经落地），引擎侧
  // 等轮到该席时由 drainEngine 自动补上。不能在围栏时硬打给引擎——那会抛
  // not_players_turn，把一次合法离桌变成错误。
  applyPendingFold(seatId) {
    const seatState = this.rooms.seatState(seatId);
    if (seatState === null || seatState.pending_fold !== true) {
      return null;
    }
    const playerId = this.seatToPlayer.get(seatId);
    if (playerId === undefined || this.hand === null || this.hand.status === "complete") {
      // 席位已释放或牌局已结束：直接消费掉记账，不再动引擎。
      const pending = this.rooms.consumePendingFold({ seatId });
      return pending === null ? null : { ...pending, applied_to_hand: false };
    }
    if (!this.isCurrentActor(playerId)) {
      // 还没轮到：保留待办，等 ACTION_REQUIRED 到该席时自动落地。
      return { seat_id: seatId, action: "fold", reason: "left_table", deferred: true };
    }
    const pending = this.rooms.consumePendingFold({ seatId });
    const result = this.hand.act({
      playerId,
      type: "fold",
      automatic: true,
      reason: "left_table",
    });
    return { ...pending, applied_to_hand: true, result, intents: this.drainEngine() };
  }

  isCurrentActor(playerId) {
    if (this.hand === null || this.hand.actorIndex === null) {
      return false;
    }
    return this.hand.seats[this.hand.actorIndex].id === playerId;
  }

  // ------------------------------------------------------------------ 事件词表翻译

  // 唯一的翻译点。引擎事件在这里一次性分流到两个去处：
  //   a. 白名单事件 -> seat-ai-store，可能产生评估意图；
  //   b. 其余事件   -> 只留在引擎与房间时间线里，不唤醒 AI。
  drainEngine() {
    const intents = [];
    for (const event of this.hand.drainEvents()) {
      for (const intent of this.routeEngineEvent(event)) {
        intents.push(intent);
      }
    }
    // 轮到已离桌席位时补上待办强制弃牌。它会再产生引擎事件，所以递归排空；
    // 每次递归都消费掉一个 pending_fold 并推进轮次，因此必然收敛。
    for (const intent of this.flushPendingFoldForActor()) {
      intents.push(intent);
    }
    this.pendingIntents.push(...intents);
    return intents;
  }

  flushPendingFoldForActor() {
    if (this.hand === null || this.hand.status === "complete" || this.hand.actorIndex === null) {
      return [];
    }
    const actorPlayerId = this.hand.seats[this.hand.actorIndex].id;
    const seatId = this.playerToSeat.get(actorPlayerId);
    if (seatId === undefined) {
      return [];
    }
    const seatState = this.rooms.seatState(seatId);
    if (seatState === null || seatState.pending_fold !== true) {
      return [];
    }
    this.rooms.consumePendingFold({ seatId });
    this.hand.act({
      playerId: actorPlayerId,
      type: "fold",
      automatic: true,
      reason: "left_table",
    });
    return this.drainEngine();
  }

  routeEngineEvent(event) {
    if (event.type === "STREET_DEALT") {
      // advanceStreet 自己会记 STREET_ADVANCED 并派发，走它而不是 notifyDomainEvent，
      // 否则 seat-ai-store 的 street 不推进，规则 5 的跨街标注会漏。
      const { evaluations } = this.ai.advanceStreet({ street: event.payload.street });
      return this.acceptable(evaluations);
    }
    if (event.type === "HAND_COMPLETED") {
      const settled = this.rooms.handSettled();
      const evaluations = this.ai.notifyDomainEvent({
        type: "HAND_SETTLED",
        eventId: `room-hand-settled-${settled.payload.hand_index}`,
        payload: { ...event.payload, hand_index: settled.payload.hand_index },
      });
      return this.acceptable(evaluations);
    }

    const whitelisted = event.type === "PLAYER_ACTION"
      ? ACTION_TO_WHITELIST[event.payload.action]
      : ENGINE_TO_WHITELIST[event.type];
    if (whitelisted === undefined) {
      return [];
    }

    const payload = { ...clone(event.payload) };
    if (event.type === "ACTION_REQUIRED") {
      // 行动窗口的主体席位要显式带上，AI 才能分辨「轮到我」和「轮到别人」。
      payload.seat_id = this.playerToSeat.get(event.payload.player_id) ?? null;
    }
    const evaluations = this.ai.notifyDomainEvent({
      type: whitelisted,
      eventId: `engine-${this.hand.id}-${this.hand.revision}-${whitelisted}`,
      payload,
    });
    return this.acceptable(evaluations);
  }

  // 只把 accepted 的意图交给宿主。被合并 / 冷却 / 额度耗尽的那些已由内核记账，
  // 交出去只会让适配器重复判定规则。
  acceptable(evaluations) {
    return evaluations.filter((intent) => intent.accepted === true);
  }

  // ------------------------------------------------------------------ 公开交流通道

  submitPlayerText(input = {}) {
    const room = this.rooms.requireRoom();
    // 绑房标识与桌规版本由本层注入：宿主不该有机会传错一个房间去过公开确认。
    const result = this.ai.submitPlayerText({
      ...input,
      roomBindingId: room.room_binding_id,
      tableRulesVersion: room.table_rules_version,
    });
    if (Array.isArray(result.evaluations)) {
      const accepted = this.acceptable(result.evaluations);
      this.pendingIntents.push(...accepted);
      return { ...result, evaluations: accepted };
    }
    return result;
  }

  // 宿主取走待办意图后自行调用模型，再用 resolveEvaluation 回填。
  //
  // 传 seatId 就只取走该席的，别席的留在队列里。双宿主部署下这是必需的：取走即消费，
  // 一方全取会让另一方负责的席位永远等不到意图。不传仍然全取——单宿主与既有编排层
  // 测试就是这么用的，而「哪个适配器负责哪些席」不是内核该知道的事。
  takeIntents(input = {}) {
    if (input.seatId === undefined) {
      const intents = this.pendingIntents;
      this.pendingIntents = [];
      return intents;
    }
    const seatId = input.seatId;
    const taken = this.pendingIntents.filter((intent) => intent.seat_id === seatId);
    this.pendingIntents = this.pendingIntents.filter((intent) => intent.seat_id !== seatId);
    return taken;
  }

  startEvaluation(input = {}) {
    return this.ai.startEvaluation(input);
  }

  resolveEvaluation(input = {}) {
    return this.ai.resolveEvaluation(input);
  }

  setSeatAiMode(input = {}) {
    return this.ai.setSeatAiMode(input);
  }

  // ------------------------------------------------------------------------ 投影

  // 旁观视图。viewerId 传 null，引擎的 visibleHoleCards 因此对所有未摊牌的席位返回 null。
  // 摊牌后未弃牌席位的底牌确实会出现在这里，那是公开摊牌本身，不是泄露。
  publicHandView() {
    if (this.hand === null) return null;
    return this.hand.publicProjection(null);
  }

  // 私密视图。这是整个系统里唯一会吐出「自己的底牌」的地方，viewerId 就是解锁参数，
  // 所以调用方必须已经证明自己拥有该席（命令面用 requireSeatCredential 做这件事）。
  // 本层只做 seatId -> playerId 的翻译，不判断谁有权看：越权判断留在信任边界上。
  seatHandView(seatId) {
    if (this.hand === null) return null;
    // 不校验 seatId 的形状：查不到就是查不到，落到旁观视图。这条路径宁可少给不可多给，
    // 一个非法 seatId 永远解不开任何底牌。
    const playerId = this.seatToPlayer.get(seatId);
    // 已绑房但不在本手牌 roster 里的席位（开局后才入座、或本手轮空）只能拿旁观视图。
    // 不能无条件把 playerId 交给引擎：seatById 对陌生 playerId 抛 unknown_player，
    // 那会把「这手牌轮不到你」变成一个错误，而它其实是正常状态。
    const inHand = playerId !== undefined
      && this.hand.seats.some((seat) => seat.id === playerId);
    return this.hand.publicProjection(inHand ? playerId : null);
  }

  projection() {
    return {
      room: this.rooms.roomState(),
      hand: this.hand === null ? null : { id: this.hand.id, status: this.hand.status },
      // 公共牌、底池、当前行动者、行动截止时间都属公开信息，房间级只读面就该有。
      public_hand: this.publicHandView(),
      public_timeline: this.ai.publicTimeline(),
      pending_intent_count: this.pendingIntents.length,
    };
  }
}

module.exports = { TableOrchestrator, ENGINE_TO_WHITELIST, ACTION_TO_WHITELIST };
