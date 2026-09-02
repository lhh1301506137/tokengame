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
const { policyEpoch } = require("./policy-epoch.cjs");
const { RoomStore, TABLE_LIFECYCLE_V1 } = require("./room-store.cjs");
const { SeatAiStore, LIVELY_V1 } = require("./seat-ai-store.cjs");
const {
  ActionLedger,
  requiredRevision,
  requiredKey,
  handScope,
  roomScope,
} = require("./action-ledger.cjs");
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
    this.actionTimeoutMs = actionTimeoutMs;

    this.rooms = new RoomStore({
      now,
      idFactory,
      ...(tokenFactory ? { tokenFactory } : {}),
      limits: roomLimits,
      // 起始筹码交给房间账本持有。本层不再保留副本：留一份就会有人从它读，
      // 而每手从构造参数取一次起始筹码正是 F1 的缺陷本体。
      startingStack,
    });
    this.ai = new SeatAiStore({ now, idFactory, limits: aiLimits });

    this.hand = null;
    // 座位 -> 玩家。牌局引擎按 playerId 索引，两个内核按 seatId 索引，翻译要有依据。
    this.seatToPlayer = new Map();
    this.playerToSeat = new Map();
    // 待宿主执行的 AI 评估意图不在本层保存（F5）。
    //
    // 原来这里有个 this.pendingIntents 数组，takeIntents 取走即清空。宿主在「取走」与
    // 「ai.start」之间崩溃，权威侧就 pending 0、active turn 0、可回收 0——这次唤醒连
    // 存在过的痕迹都没有。队列搬进 SeatAiStore 后，取走变成打租约标记，崩了会到期重领。
    //
    // 搬进内核而不是留在本层，还有个更硬的理由：一个待办能不能起，取决于 active_turn、
    // pending_context、cooldown 与每手额度，这四样全在内核里。留在本层就得把这四样的
    // 判定复制一份，或者让本层反过来窥探席位内部——要求 4 的「回合结束或冷却到期后自动
    // 跟进」正是这两条路都走不通的地方。
    // 官方动作的幂等账。放在本层而不是引擎里，因为要记的是**调用方拿到的整个信封**
    // （含 intents），而 intents 是本层翻译出来的，引擎不知道它们存在。只记 result
    // 的话，重放会返回原结果但重新跑一遍事件翻译，于是该席 AI 被唤醒两次——公开发言
    // 配额按手计，重复唤醒会真的多发一次言。
    this.actions = new ActionLedger();
    this.rooms.onEvent((event) => this.onRoomEvent(event));
  }

  // ---------------------------------------------------------------- 房间生命周期

  createRoom(input = {}) {
    const created = this.rooms.createRoom(input);
    // 规则 1（AI 合同）：绑房或桌规版本变化都必须重新明确确认默认公开。
    // 由宿主在 UI 上取得确认后调用 confirmPublicScope，本层不代为承诺。
    return created;
  }

  // F3：确认按席位记账，acknowledged 由调用方表态。
  //
  // 本层不再代填 acknowledged: true。原来硬编码在这里，等于任何调用方都不可能「没确认」——
  // 一个永远自我满足的门不是门。绑房与桌规版本仍由本层从房间取：那是权威事实，
  // 让调用方传就等于让它自己决定确认的是哪一套规则。
  confirmPublicScope(input = {}) {
    const room = this.rooms.requireRoom();
    return this.ai.confirmDefaultPublicScope({
      seatId: input.seatId,
      roomBindingId: room.room_binding_id,
      tableRulesVersion: room.table_rules_version,
      acknowledged: input.acknowledged,
    });
  }

  requireConfirmedScope(input = {}) {
    const room = this.rooms.requireRoom();
    return this.ai.requireConfirmedScope(
      input.seatId,
      room.room_binding_id,
      room.table_rules_version,
    );
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

  // 回收租约到期的 AI 评估回合。判定全在 seat-ai-store 里，本层只转发：
  // 「这个回合是不是已经不可能回来了」不是编排层该知道的事。
  reclaimExpiredEvaluations() {
    return this.ai.reclaimExpiredEvaluations();
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
      // 起始筹码逐席取自 HAND_STARTED 的账本快照，不用任何本层常量。名单顺序与
      // stacks 顺序都由 room-store 给出，按 seat_id 对齐而不是按下标——两个数组
      // 靠位置对齐是那种能正常跑很久、然后在某次过滤后错位的写法。
      seats: roster.map((seatId) => ({
        id: this.requirePlayerId(seatId),
        stack: this.rosterStack(started.payload.stacks, seatId),
      })),
      dealerIndex: (started.payload.hand_index - 1) % roster.length,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      actionTimeoutMs: this.actionTimeoutMs,
      deck: this.deckFactory(),
      now: this.now,
    });

    // 新的一手开始，丢掉上一手的幂等账。旧手的键本来就会被 hand_id 门禁拒绝，
    // 所以这只是防止长会话里无界增长，不改变任何判定。
    this.actions.forgetHandScopesExcept(this.hand.id);

    const intents = this.drainEngine();
    return { hand_id: this.hand.id, hand_index: started.payload.hand_index, roster, intents };
  }

  rosterStack(stacks, seatId) {
    const entry = (stacks ?? []).find((candidate) => candidate.seat_id === seatId);
    if (entry === undefined) {
      // 账本没给这一席筹码却把它放进了名单，那是 room-store 自相矛盾。宁可在这里
      // 停下，也不要偷偷补一个默认值——补上就等于又造了第二个筹码来源。
      throw new ProbeError("seat_stack_missing", 500, { seat_id: seatId });
    }
    return entry.stack;
  }

  requireHand() {
    if (this.hand === null) {
      throw new ProbeError("no_active_hand", 409);
    }
    return this.hand;
  }

  // 玩家发起的官方行动。三个绑定字段必填，理由见 action-ledger.cjs 头部。
  //
  // 本层是官方动作的唯一入口：命令面的 hand.act 落到这里，而权威自己产生的动作
  // （settleExpiredAction 的超时处置、applyPendingFold 的离桌弃牌）直接调 this.hand.act，
  // 不经此门。那不是漏洞而是分工——权威自己的动作没有客户端可重试，硬要它们编一个
  // 幂等键只会让权威给自己发明假身份。test/action-idempotency.test.cjs 用一份独立清单
  // 钉住这条分工，防止将来新增的玩家入口绕过账本。
  act(input = {}) {
    const hand = this.requireHand();
    const gate = this.openActionGate({
      hand,
      handId: input.handId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      fields: {
        command: "hand.act",
        player_id: input.playerId ?? null,
        type: input.type ?? null,
        amount: input.amount ?? null,
        expected_revision: input.expectedRevision ?? null,
      },
    });
    if (gate.replay) {
      return gate.envelope;
    }

    const result = hand.act({
      playerId: input.playerId,
      type: input.type,
      ...(input.amount === undefined ? {} : { amount: input.amount }),
    });
    // all-in 状态回填给 room-store：规则 3 用它决定离桌时是强制弃牌还是等待结算。
    this.syncAllIn();
    return gate.commit({ result, intents: this.drainEngine() });
  }

  // 幂等门本体。任何可重放写命令都能用：给一个作用域、一个键、一份不含秘密的字段集。
  // 不认识牌局，也不认识 revision——那些是官方动作的额外约束，加在外面。
  openIdempotencyGate({ scope, idempotencyKey, fields }) {
    const looked = this.actions.lookup({ scope, idempotencyKey, fields });
    if (looked.replay) {
      return { replay: true, envelope: { ...looked.envelope, replay: true } };
    }
    return {
      replay: false,
      commit: (envelope) => this.actions.commit({
        scope,
        idempotencyKey,
        fingerprint: looked.fingerprint,
        envelope,
      }),
    };
  }

  // 官方动作的三道门。顺序不能改，每一道都在解释里说清它挡的是什么。
  openActionGate({ hand, handId, expectedRevision, idempotencyKey, fields }) {
    // 第一道：hand_id。挡上一手的请求打到这一手。必须最先查——若先查账本，一个尚未
    // 被清理的旧手条目会让指向死牌局的请求拿到一个「成功」信封。
    if (typeof handId !== "string" || handId.length === 0) {
      throw new ProbeError("invalid_field", 400, { field: "hand_id" });
    }
    if (handId !== hand.id) {
      throw new ProbeError("hand_mismatch", 409, {
        hand_id: handId,
        current_hand_id: hand.id,
      });
    }
    const revision = requiredRevision(expectedRevision, "expected_revision");

    // 第二道：幂等账。必须**先于** revision 检查。重放天然带着过期 revision——第一次
    // 执行本身就把版本推进了——所以顺序反过来会让每一次正常重试都撞上 revision_conflict，
    // 状态是对的，但客户端反而无法判断自己那一手到底成没成。
    const gate = this.openIdempotencyGate({
      scope: handScope(handId),
      idempotencyKey,
      fields,
    });
    if (gate.replay) {
      return gate;
    }

    // 第三道：expected_revision。挡「用过期状态形成的新请求在新状态上执行」，也就是
    // 跨街重放本体：演员恰好又是同一人时，动作合法、席位对得上，只有版本号对不上。
    if (revision !== hand.revision) {
      throw new ProbeError("revision_conflict", 409, {
        expected_revision: revision,
        current_revision: hand.revision,
      });
    }

    return gate;
  }

  // 规则 4：只有 all_others_folded 的赢家可自愿亮牌。走同一套幂等门。
  //
  // 引擎自己已经有一道按 playerId 的重放保护（第二次亮同一手牌返回 replay: true）。
  // 那是一条规则——「你已经亮过了」——与本层的幂等键不是一回事：规则那道拦的是同一个人
  // 亮两次，幂等键那道拦的是同一个请求被送达两次。两者都要，因为同键换 seat_id 必须
  // 确定性拒绝，而引擎那道对不同 playerId 无话可说。
  revealCards(input = {}) {
    const hand = this.requireHand();
    const gate = this.openActionGate({
      hand,
      handId: input.handId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      fields: {
        command: "hand.reveal",
        player_id: input.playerId ?? null,
        expected_revision: input.expectedRevision ?? null,
      },
    });
    if (gate.replay) {
      return gate.envelope;
    }
    const result = hand.revealCards(input.playerId);
    // CARDS_VOLUNTARILY_REVEALED 不在白名单里，drain 出来只是不让它滞留在缓冲区，
    // 不会唤醒任何席位 AI。
    this.drainEngine();
    return gate.commit(result);
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
    // 不再往本层队列里塞：accepted 的意图在 notifyDomainEvent 里就已经作为工作项
    // 登记进权威队列了。这里的返回值只是「这次排空唤醒了谁」的回执。
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
      // 先回写筹码，再让房间结算。顺序不能反：handSettled 会释放 leave_requested 的
      // 席位，而释放会把 stack 清零并记进 SEAT_RELEASED。先释放就等于把离桌者这一手
      // 的输赢丢掉，事件里记下的「带走多少」也会是错的。
      this.settleStacks();
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

  // 把引擎算出的最终 stack 交回账本。本层只做 playerId -> seatId 的翻译，
  // 幂等与校验都在 room-store.settleStacks 里——那是账本自己的事。
  //
  // 已经释放的席位不在 seatToPlayer 里，它们的筹码在释放时就记进 SEAT_RELEASED 了，
  // 这里跳过是正确的：往一个 RELEASED 席位回写会抛错，把正常的「有人中途离桌」
  // 变成一次结算失败。
  settleStacks() {
    const stacks = [];
    for (const seat of this.hand.seats) {
      const seatId = this.playerToSeat.get(seat.id);
      if (seatId !== undefined) {
        stacks.push({ seatId, stack: seat.stack });
      }
    }
    return this.rooms.settleStacks({ handIndex: this.rooms.handIndex, stacks });
  }

  // 只把 accepted 的意图交给宿主。被合并 / 冷却 / 额度耗尽的那些已由内核记账，
  // 交出去只会让适配器重复判定规则。
  acceptable(evaluations) {
    return evaluations.filter((intent) => intent.accepted === true);
  }

  // ------------------------------------------------------------------ 公开交流通道

  // 玩家公开发言。也是可重放写命令，所以也要幂等键（F2 要求 4）。
  //
  // 为什么它按房间记账而不按手：牌局之间也能发言，那时 hand_id 根本不存在。把发言绑到
  // 手上等于让「等待开局时说的话」无法遵守绑定契约。
  //
  // 为什么它不要 expected_revision：revision 是牌局的版本，而发言不改变牌局。要求它
  // 就等于说「牌桌状态一变你这句话就得重打」，而且开局前无从取值。缺了这一道不留洞——
  // 跨街重放本体是「同一个动作在新状态上再执行一次」，发言没有对应的危害；真正要挡的
  // 「重试被当成第二句话」由幂等键本身挡住。
  //
  // 重放必须连 evaluations 一起返回原值：AI 意图已经被第一次调用推进队列了，重放时
  // 再产生一份就是同一句话唤醒该席 AI 两次，而公开发言配额按手计，多唤醒一次会真的多发
  // 一次言。
  submitPlayerText(input = {}) {
    const room = this.rooms.requireRoom();
    const gate = this.openIdempotencyGate({
      scope: roomScope(room.room_binding_id),
      idempotencyKey: requiredKey(input.idempotencyKey, "idempotency_key"),
      fields: {
        command: "chat.say",
        seat_id: input.seatId ?? null,
        text: input.text ?? null,
        channel: input.channel ?? null,
      },
    });
    if (gate.replay) {
      return gate.envelope;
    }

    // 绑房标识与桌规版本由本层注入：宿主不该有机会传错一个房间去过公开确认。
    const result = this.ai.submitPlayerText({
      ...input,
      roomBindingId: room.room_binding_id,
      tableRulesVersion: room.table_rules_version,
    });
    if (Array.isArray(result.evaluations)) {
      const accepted = this.acceptable(result.evaluations);
      return gate.commit({ ...result, evaluations: accepted });
    }
    return gate.commit(result);
  }

  // 宿主领取待办意图后自行调用模型，再用 resolveEvaluation 回填。
  //
  // 传 seatId 就只领该席的，别席的留在队列里。双宿主部署下这是必需的：一方全领会让
  // 另一方负责的席位在租约期内等不到意图。不传仍然全领——单宿主与既有编排层测试就是
  // 这么用的，而「哪个适配器负责哪些席」不是内核该知道的事。
  //
  // F5：这是 claim，不是取走。返回的快照带 intent_id，工作项留在权威侧并打上租约期限；
  // 领走方按期用 ai.start 消费掉，或者不回来、期限一过重新可领。
  takeIntents(input = {}) {
    return this.ai.claimIntents(input);
  }

  startEvaluation(input = {}) {
    return this.ai.startEvaluation(input);
  }

  // ai.start 的私有响应与启动在同次同步命令内完成。source_event 来自实际启动的 turn，
  // 不用领取时的快照：工作项在 claim 后仍可能被更新为更新的合法事件。
  modelContext({ seatId, turnId }) {
    const sourceEvent = this.ai.evaluationContext(seatId, turnId);
    const timeline = this.ai.publicTimeline();
    return {
      schema: "tokengame.seat-ai-context.v1",
      seat_id: seatId,
      player_id: this.requirePlayerId(seatId),
      turn_id: turnId,
      source_event: sourceEvent,
      room: this.rooms.roomState(),
      hand: this.seatHandView(seatId),
      timeline: timeline.slice(-50),
      timeline_total: timeline.length,
      timeline_truncated: timeline.length > 50,
    };
  }

  // 把到期的 claim 放回可领状态。由到期驱动调用。
  releaseExpiredIntentClaims() {
    return this.ai.releaseExpiredIntentClaims();
  }

  // 把回合结束 / 冷却到期后的唯一 dirty context 变成可领工作项（要求 4）。
  promotePendingContexts() {
    return this.ai.promotePendingContexts();
  }

  // 绑房标识与桌规版本由本层注入，理由与 submitPlayerText 相同：宿主不该有机会传错一个
  // 房间去过公开确认。规则 1 的两个 TABLE_PUBLIC 出口因此走同一份权威事实。
  resolveEvaluation(input = {}) {
    const room = this.rooms.requireRoom();
    return this.ai.resolveEvaluation({
      ...input,
      roomBindingId: room.room_binding_id,
      tableRulesVersion: room.table_rules_version,
    });
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
    const room = this.rooms.roomState();
    return {
      room,
      hand: this.hand === null ? null : { id: this.hand.id, status: this.hand.status },
      // 公共牌、底池、当前行动者、行动截止时间都属公开信息，房间级只读面就该有。
      public_hand: this.publicHandView(),
      public_timeline: this.ai.publicTimeline(),
      pending_intent_count: this.ai.workItems.size,
      // 当前的同意 epoch。报出来是为了让界面拿它跟自己那份确认比，而不是自己再算一遍
      // 「什么算实质变化」——算两遍就有两份判据，而两份判据迟早不一致。
      // 不含秘密：三个都是权威公开事实（绑房 id、桌规版本、公开范围额度）。
      policy_epoch: this.currentPolicyEpoch(room),
    };
  }

  // 权威当下承诺的那一套。gate 用它、投影也报它，同一处推导。
  currentPolicyEpoch(room = null) {
    // roomState() 把房间字段收在 .room 里，不是平铺在顶层。直接读顶层会得到
    // undefined，于是投影永远报 binding:-|rules:-，而 gate 拿的是真值——两个 epoch
    // 永远对不上，表现是每次渲染都要求重新确认，理由永远是 new_room_binding。
    const source = room ?? this.rooms.roomState();
    const fields = source?.room ?? source ?? null;
    return policyEpoch({
      roomBindingId: fields?.room_binding_id ?? null,
      tableRulesVersion: fields?.table_rules_version ?? null,
      limits: this.ai.limits,
    });
  }
}

module.exports = { TableOrchestrator, ENGINE_TO_WHITELIST, ACTION_TO_WHITELIST };
