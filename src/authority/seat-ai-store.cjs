"use strict";

// SEAT_AI 权威内核。实现 SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D 的七条受保护规则。
// 宿主中立：不引用 Codex / Claude / Hook / MCP，任何宿主适配器都只调用本模块。
//
// 与 event-store.cjs 的关系：后者的「每行动窗口一次 AI 请求」与「窗口关闭即拒绝
// 迟到回答」两条语义已被本合同反转，见该文件顶部 SUPERSEDED_BY 注释。本模块不复用
// 它的窗口模型，只复用 ProbeError 以保持错误形状一致。

const { ProbeError } = require("./event-store.cjs");

// 规则 3：LIVELY_V1。四层限制（单条 / 短窗 / 每手 / AI 启动间隔）不得取消。
const LIVELY_V1 = Object.freeze({
  version: "LIVELY_V1",
  maxGraphemesPerMessage: 140,
  playerMaxPerHand: 12,
  playerMaxPerRollingWindow: 3,
  playerRollingWindowMs: 5_000,
  aiMaxPublicPerHand: 8,
  aiMinEvaluationIntervalMs: 5_000,
  bubbleDisplayMs: 10_000,
});

// 评估回合租约。适配器是独立进程，可以死在 ai.start 与 ai.resolve 之间；不给回合
// 设期限，那一席就永久停在「已有回合在飞」，从此不再被唤醒。
//
// 120 秒沿用 recoveryRetentionMs。这两处问的是同一个形状的问题：一个缺席的外部行动者
// 要等多久才能判定它回不来了、从而释放它占住的东西。真人掉线等 120 秒释放席位，适配器
// 失联等 120 秒收回回合。
//
// 先写的是 30_000（照 actionTimeoutMs），那是个类比错误：行动时限规定的是**真人可以
// 想多久**，跟模型调用要花多久没有关系，而 30 秒对一次真实推理是紧的。按 30 秒收，会
// 把慢但活着的输出当成死适配器丢掉——规则 5 恰好有一条已验收证据是「模型慢了 30 秒才
// 回来，照常公开」，两者会直接撞车。租约要长到不误伤活着的适配器，同时仍然有界。
//
// 故意不放进 LIVELY_V1：那里是规则 3 的四层发言预算，而 version 字符串会作为
// limits_version 报给宿主、也进过已验收的证据。往里加键会让两份不同的限制对象都
// 自称 LIVELY_V1，而改版本号是语义决定，不由这一层做。租约是活性期限，不是预算，
// 它一格额度也没放宽。
const EVALUATION_LEASE_MS = 120_000;

// 意图 claim 租约（F5 要求 1）。
//
// 原来的 takeIntents 是「取走即从队列删除」，而评估租约只在随后的 ai.start 建立。
// 两步之间没有任何权威记录：适配器死在这里，权威侧 pending 为 0、active turn 为 0、
// 可回收项为 0，这次唤醒就永久消失了——玩家的问题既没有回答也没有失败状态。
//
// 修法是让 take 变成 claim：工作项留在权威侧，只被标上「已被领走，期限到 X」。
// 领走方按期把它变成回合（ai.start 消费掉），或者不回来、期限一过重新可领。
//
// 30 秒的理由与评估租约的 120 秒不同，所以是两个常量而不是一个。这段租约覆盖的是
// 「宿主拿到工作项 → 调 ai.start」，全程在宿主本机、模型还没开始跑；模型耗时落在
// 评估租约那一段。按 120 秒收会让一个崩掉的适配器把工作项压住两分钟，而这段窗口
// 本来只该是毫秒级。
//
// 也不放进 LIVELY_V1，理由同 EVALUATION_LEASE_MS：那是规则 3 的发言预算，version
// 字符串会作为 limits_version 报给宿主并进过已验收证据；租约是活性期限，不是预算。
const INTENT_CLAIM_LEASE_MS = 30_000;

// 规则 2：白名单来源事件。AI_PUBLIC_SPEECH 故意不在其中——AI 发言可以进入以后
// 合法评估的上下文，但不能单独唤醒任何席位 AI。
const WHITELIST_SOURCE_EVENTS = Object.freeze([
  "PLAYER_PUBLIC_SPEECH",
  "SEAT_ACTION_WINDOW_OPENED",
  "BET",
  "RAISE",
  "ALL_IN",
  "STREET_ADVANCED",
  "HAND_SETTLED",
]);

const SEAT_AI_MODES = Object.freeze(["ON", "OFF"]);
const SEAT_AI_STATUSES = Object.freeze([
  "IDLE",
  "THINKING",
  "DEGRADED",
  "OFFLINE",
  "OFF",
]);
const AI_DECISIONS = Object.freeze(["silent", "public_speech"]);

// 规则 3：按 Unicode 字素计数，不用 String#length。家庭 emoji 的 UTF-16 长度是 8
// 但只算 1 个字素，用 length 会让 140 上限被轻易绕过。
const graphemeSegmenter = new Intl.Segmenter("und", {
  granularity: "grapheme",
});

function countGraphemes(value) {
  let total = 0;
  for (const _segment of graphemeSegmenter.segment(value)) {
    total += 1;
  }
  return total;
}

function requiredString(value, field, maxLength = 4_096) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProbeError("invalid_field", 400, { field });
  }
  if (value.length > maxLength) {
    throw new ProbeError("field_too_long", 400, { field, maxLength });
  }
  return value;
}

function requiredEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ProbeError("invalid_field", 400, { field, allowed });
  }
  return value;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class SeatAiStore {
  constructor({
    now = () => Date.now(),
    idFactory = () => require("node:crypto").randomUUID(),
    limits = LIVELY_V1,
    evaluationLeaseMs = EVALUATION_LEASE_MS,
    intentClaimLeaseMs = INTENT_CLAIM_LEASE_MS,
  } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.limits = Object.freeze({ ...LIVELY_V1, ...limits });
    // 与 limits 分开存放，正是为了不把活性期限混进发言预算。
    this.evaluationLeaseMs = evaluationLeaseMs;
    this.intentClaimLeaseMs = intentClaimLeaseMs;
    this.resetState();
  }

  resetState() {
    this.seats = new Map();
    this.events = [];
    this.listeners = new Set();
    this.handIndex = 0;
    this.street = "preflop";
    this.sequence = 0;
    // F5：待办工作项。intent_id -> item。权威持有，claim 只是打标不删除。
    //
    // 为什么队列搬进内核而不留在编排层：一个工作项的生死取决于 active_turn、
    // pending_context、cooldown 与每手额度，这四样全在本模块。放在编排层就得把这四样
    // 的判定复制一份过去，或者让编排层反过来窥探席位内部——F5 要求 4 的「回合结束或
    // 冷却到期自动跟进」正是这两者都做不到的那一步。
    this.workItems = new Map();
  }

  // 规则 1：每次新房绑定或桌规版本变化都必须先明确确认默认公开。
  //
  // F3：确认按 (room_binding_id, table_rules_version, seat_id) 记账，存在该席记录上。
  // 原来是整桌一个值，于是先到的一个调用者一按确认，全桌从未见过这句话的玩家都被
  // 代为承诺了。确认的内容是「我在游戏任务频道打的自由文本默认公开」——这是隐私同意，
  // 只有该席的人能替自己接受。
  //
  // 为什么存在席位记录上而不是另开一张按三元组索引的表：席位记录本身就以 seat_id 为键，
  // 把另两个维度作为比对字段存进去，语义等价，而且增长天然有界——一席一条，不需要淘汰
  // 策略。代价是必须先注册席位才能确认，而这正是想要的：不存在的席位没有人可以代它表态。
  confirmDefaultPublicScope(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const roomBindingId = requiredString(input.roomBindingId, "roomBindingId", 256);
    const tableRulesVersion = requiredString(
      input.tableRulesVersion,
      "tableRulesVersion",
      64,
    );
    if (input.acknowledged !== true) {
      throw new ProbeError("default_public_scope_not_acknowledged", 400, {
        seat_id: seat.seat_id,
      });
    }
    seat.public_scope_confirmation = {
      seat_id: seat.seat_id,
      room_binding_id: roomBindingId,
      table_rules_version: tableRulesVersion,
      limits_version: this.limits.version,
      confirmed_at: this.now(),
    };
    return this.record("DEFAULT_PUBLIC_SCOPE_CONFIRMED", {
      ...seat.public_scope_confirmation,
    });
  }

  // 只看这一席自己的确认。别席确认过不算，整桌确认过也不存在了。
  requireConfirmedScope(seatIdValue, roomBindingId, tableRulesVersion) {
    const seat = this.requireSeat(seatIdValue);
    const confirmation = seat.public_scope_confirmation;
    if (
      confirmation === null
      || confirmation.room_binding_id !== roomBindingId
      || confirmation.table_rules_version !== tableRulesVersion
    ) {
      throw new ProbeError("default_public_scope_not_confirmed", 409, {
        seat_id: seat.seat_id,
        room_binding_id: roomBindingId,
        table_rules_version: tableRulesVersion,
      });
    }
    return confirmation;
  }

  registerSeat(input = {}) {
    const seatId = requiredString(input.seatId, "seatId", 64);
    const playerId = requiredString(input.playerId, "playerId", 64);
    if (this.seats.has(seatId)) {
      throw new ProbeError("seat_already_registered", 409, { seat_id: seatId });
    }
    this.seats.set(seatId, {
      seat_id: seatId,
      player_id: playerId,
      ai_persona: typeof input.aiPersona === "string" ? input.aiPersona : null,
      // 规则 1（F3）：该席自己的默认公开确认。新席位一律未确认——加入不等于表态。
      public_scope_confirmation: null,
      mode: "ON",
      status: "IDLE",
      hand_index: this.handIndex,
      player_published_this_hand: 0,
      player_recent_timestamps: [],
      ai_published_this_hand: 0,
      last_evaluation_started_at: null,
      // 规则 4：每席同时最多一个模型回合。只回答「能不能再开一个」。
      active_turn: null,
      // 规则 6：已摘下但仍可能有迟到输出的回合。只回答「迟到的输出该不该发布」。
      // 这两件事以前共用 active_turn 一个字段，于是「取消回合」和「让该席能重新
      // 开始」互相绑死：标了 cancelled 却不摘下来，闸门就永久关着。
      detached_turn: null,
      // 规则 4：思考/冷却期间的新事件合并为一个待评估最新上下文，不排队。
      pending_context: null,
      // F5 要求 3：该席上下文的版本号，每产生一份新上下文就 +1。宿主拿到的是只读快照，
      // 快照自带这个号，于是「我手上这份还是最新的吗」是宿主能自己回答的问题，不必去
      // 猜，也不必反过来读席位内部状态。
      context_revision: 0,
      // 规则 2：每个来源事件对每席最多触发一次评估。
      consumed_source_events: new Set(),
      // 规则 7：本地隐藏只改变该查看者渲染。
      local_hidden: { players: new Set(), ais: new Set(), seats: new Set() },
    });
    return this.record("SEAT_AI_REGISTERED", {
      seat_id: seatId,
      player_id: playerId,
      mode: "ON",
      status: "IDLE",
    });
  }

  requireSeat(seatIdValue) {
    const seatId = requiredString(seatIdValue, "seatId", 64);
    const seat = this.seats.get(seatId);
    if (seat === undefined) {
      throw new ProbeError("seat_not_found", 404, { seat_id: seatId });
    }
    return seat;
  }

  // 规则 6：玩家可以随时切换 OFF；OFF 后停止新评估并尽力取消在途回合。
  setSeatAiMode(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const mode = requiredEnum(input.mode, SEAT_AI_MODES, "mode");
    if (seat.mode === mode) {
      return this.record("SEAT_AI_MODE_UNCHANGED", {
        seat_id: seat.seat_id,
        mode,
      });
    }
    seat.mode = mode;
    let cancelledTurnId = null;
    if (mode === "OFF") {
      if (seat.active_turn !== null) {
        cancelledTurnId = seat.active_turn.turn_id;
        // 摘下来，不只是打标记。留在 active_turn 上会让这一席从此开不了新回合，
        // 连再打开都救不回来——而下面 else 分支承诺的「从下一个合法事件开始」
        // 就永远到不了。
        this.detachTurn(seat, "cancelled");
      }
      seat.pending_context = null;
      this.discardWorkItem(seat.seat_id);
      seat.status = "OFF";
    } else {
      seat.status = "IDLE";
      // 重新开启后只从下一个合法事件或一次明确的立即评估开始，不补跑旧事件。
      seat.pending_context = null;
      // 关期间攒下的工作项同样不补跑。留着它就是「关了又开，旧事件照样冒出来」。
      this.discardWorkItem(seat.seat_id);
    }
    return this.record("SEAT_AI_MODE_CHANGED", {
      seat_id: seat.seat_id,
      mode,
      status: seat.status,
      cancelled_turn_id: cancelledTurnId,
    });
  }

  pruneRollingWindow(seat, at) {
    const cutoff = at - this.limits.playerRollingWindowMs;
    seat.player_recent_timestamps = seat.player_recent_timestamps.filter(
      (stamp) => stamp > cutoff,
    );
  }

  // 规则 1 + 规则 3：通过确定性字符与配额校验且非 LOCAL_CONTROL 的自由文本，
  // 必须先作为 TABLE_PUBLIC 发布再进入 AI 上下文；不等待模型，不做意图分类。
  submitPlayerText(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const text = requiredString(input.text, "text");
    const channel = requiredEnum(
      input.channel === undefined ? "GAME_TASK" : input.channel,
      ["GAME_TASK", "LOCAL_CONTROL"],
      "channel",
    );

    if (channel === "LOCAL_CONTROL") {
      // 显式本地控制不公开、不进入 AI 上下文，也不消耗反刷屏预算。
      return { published: null, local_control: true, evaluations: [] };
    }

    // F3 要求 3：只检查发言席自己的确认。
    this.requireConfirmedScope(
      seat.seat_id,
      requiredString(input.roomBindingId, "roomBindingId", 256),
      requiredString(input.tableRulesVersion, "tableRulesVersion", 64),
    );

    const graphemes = countGraphemes(text);
    if (graphemes > this.limits.maxGraphemesPerMessage) {
      throw new ProbeError("message_too_long", 400, {
        graphemes,
        max_graphemes: this.limits.maxGraphemesPerMessage,
        limits_version: this.limits.version,
      });
    }

    const at = this.now();
    this.pruneRollingWindow(seat, at);
    if (seat.player_published_this_hand >= this.limits.playerMaxPerHand) {
      throw new ProbeError("player_hand_quota_exhausted", 429, {
        seat_id: seat.seat_id,
        max_per_hand: this.limits.playerMaxPerHand,
      });
    }
    // 规则 3：回合内外玩家适用同一反刷屏预算，非当前行动者不获得更宽预算。
    if (
      seat.player_recent_timestamps.length >= this.limits.playerMaxPerRollingWindow
    ) {
      throw new ProbeError("player_rate_limited", 429, {
        seat_id: seat.seat_id,
        max_per_window: this.limits.playerMaxPerRollingWindow,
        window_ms: this.limits.playerRollingWindowMs,
      });
    }

    seat.player_published_this_hand += 1;
    seat.player_recent_timestamps.push(at);

    const published = this.record("PLAYER_PUBLIC_SPEECH", {
      scope: "TABLE_PUBLIC",
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      speaker_type: "PLAYER",
      text,
      graphemes,
      hand_index: this.handIndex,
      street: this.street,
      // 规则：公开话术永无牌局动作效力。
      poker_action_effect: null,
    });

    // 先发布，再进入 AI 上下文。
    const evaluations = this.notifyDomainEvent({
      type: "PLAYER_PUBLIC_SPEECH",
      eventId: published.event_id,
      payload: published.payload,
    });
    return { published, local_control: false, evaluations };
  }

  cooldownRemainingMs(seat, at) {
    if (seat.last_evaluation_started_at === null) {
      return 0;
    }
    const elapsed = at - seat.last_evaluation_started_at;
    const remaining = this.limits.aiMinEvaluationIntervalMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  // ---------------------------------------------------------------- F5：工作项

  // 把一份上下文登记成权威侧的待办工作项，返回给宿主看的只读快照。
  //
  // intent_id 由权威生成（要求 2）。宿主之后只能拿这个 id 回来启动评估，不能自带
  // 上下文——source_event_id 是「这句公开话术因何而起」的审计依据，让适配器自己填
  // 等于让被审计方写审计记录。
  //
  // 上下文原本存在权威侧，快照是深拷贝（要求 3）。宿主改自己那份改不动权威这份。
  registerWorkItem(seat, context) {
    seat.context_revision += 1;
    const stored = { ...clone(context), context_revision: seat.context_revision };
    // 新上下文严格地更新，pending 里那份旧的就不再是待办了。
    seat.pending_context = null;

    // 每席最多一个工作项——要求 4 说的是「唯一 dirty context」。
    //
    // 不这么做的话：两条事件在同一个冷却窗口外接连到达，各排一个工作项，宿主领走两个，
    // 起了第一个，第二个被冷却拒掉、留在队列里、租约到期又可领……最后在几秒后拿一份
    // 过期上下文说一句已经不合时宜的话。规则 4 合并 pending 就是为了避免这个，工作项
    // 队列不能把它漏回来。
    const existing = this.findWorkItemBySeat(seat.seat_id);
    if (existing !== null) {
      // 就地换上下文，保留 intent_id 与 claim 状态。宿主手上那个 id 依然有效，只是它
      // ai.start 起来的会是最新上下文，而不是它当初看到的那份——这正是要求 3 的意思：
      // 权威保存事实，适配器拿的是只读快照。快照自带 context_revision，宿主能自己发现
      // 手里那份旧了，不必去猜也不必反过来读席位内部。
      existing.context = stored;
      existing.superseded_count += 1;
      return existing;
    }

    const item = {
      intent_id: `intent-${this.idFactory()}`,
      seat_id: seat.seat_id,
      // 权威保存的那一份。source_event_id / hand_index / street 都在 context 里，
      // 由 notifyDomainEvent 组装，宿主碰不到。
      context: stored,
      created_at: this.now(),
      claimed_at: null,
      claim_deadline_at: null,
      claim_count: 0,
      // 世代围栏。null 表示这个工作项从未被领取过——此时 startEvaluation 不要求令牌，
      // 因为 notifyDomainEvent 的返回本身就是一份可用快照，直接开工是一条正当路径
      // （少一次往返）。一旦被领取过，令牌就非 null，世代从此开始有意义。
      claim_token: null,
      superseded_count: 0,
    };
    this.workItems.set(item.intent_id, item);
    return item;
  }

  findWorkItemBySeat(seatId) {
    for (const item of this.workItems.values()) {
      if (item.seat_id === seatId) return item;
    }
    return null;
  }

  // 丢弃某席的待办。换手、关闭 AI、退席都走这里。
  discardWorkItem(seatId) {
    const item = this.findWorkItemBySeat(seatId);
    if (item === null) return null;
    this.workItems.delete(item.intent_id);
    return item;
  }

  // 宿主可见的工作项快照。凭据不进这里，claim 状态也不进——那是权威的调度内务，
  // 宿主要知道的只有「这是哪一席的什么活、我该用哪个 id 回来」。
  intentSnapshot(item) {
    return {
      intent_id: item.intent_id,
      seat_id: item.seat_id,
      accepted: true,
      context: clone(item.context),
      // 只在被领取过之后带令牌。未领取的快照带 null 会诱使调用方把 null 传回来，
      // 而那正是「不出示令牌」——干脆不出现这个键。
      ...(item.claim_token === null ? {} : { claim_token: item.claim_token }),
    };
  }

  // 释放 claim 已过期的工作项，使其重新可领（要求 1 的另一半）。
  //
  // 与 reclaimSeatIfExpired 同一个道理：必须在每个会读到 claim 的地方问一次，不能只在
  // 驱动那一步问。只在驱动里问，判定就取决于 tick 落在请求的哪一边——同一次 claim，
  // 抢在 tick 前到达拿不到活、晚到就拿得到。
  releaseExpiredIntentClaims() {
    const at = this.now();
    const released = [];
    for (const item of this.workItems.values()) {
      if (item.claim_deadline_at === null || at < item.claim_deadline_at) continue;
      item.claimed_at = null;
      item.claim_deadline_at = null;
      // 释放即换代。不等到有人重新领取才换：租约过期本身就说明这个 claimant 不再被授权，
      // 放过它意味着租约只是建议。换了之后它手里那个令牌对不上，而它重新领一次就能拿到
      // 新的——挡的是世代，不是这个意图。
      item.claim_token = `claim-${this.idFactory()}`;
      released.push(this.record("SEAT_AI_INTENT_CLAIM_RELEASED", {
        intent_id: item.intent_id,
        seat_id: item.seat_id,
        released_at: at,
        claim_count: item.claim_count,
      }));
    }
    return released;
  }

  // 领取待办。取走即打标，不删除——这正是 F5 的修复点。
  claimIntents(input = {}) {
    // 先按当前时钟促进与释放，再领。同 reclaimSeatIfExpired 的道理：判定不能取决于
    // 驱动的 tick 落在这次请求的哪一边。冷却刚好过期 10 毫秒时，抢在 tick 前领取的
    // 宿主拿不到活、晚到的拿得到——同样的输入两种活性结果，而 tick 间隔是宿主选项。
    this.promotePendingContexts();
    this.releaseExpiredIntentClaims();
    const seatId = input.seatId === undefined ? null : requiredString(input.seatId, "seatId", 64);
    const at = this.now();
    const claimed = [];
    for (const item of this.workItems.values()) {
      if (seatId !== null && item.seat_id !== seatId) continue;
      // 已被别人领着且未到期的跳过。这一条保住了双宿主语义：先轮询的一方不会把另一方
      // 负责的席位吞掉，而它此前是靠「取走即删除」实现的，代价就是丢失窗口。
      if (item.claim_deadline_at !== null) continue;
      item.claimed_at = at;
      item.claim_deadline_at = at + this.intentClaimLeaseMs;
      item.claim_count += 1;
      // 每次领取铸一个新令牌。用令牌而不是拿 claim_count 当世代号：计数猜得到（claim_count
      // 就在事件里，加一即可冒充下一世代），令牌猜不到。本机信任边界不高，但两者成本一样。
      //
      // 无条件铸，而不是「只在 claim_token 为 null 时铸」。就当前调用图而言两者等价：
      // 工作项只有在 releaseExpiredIntentClaims 里才会重新变得可领，而那里已经换过代了。
      // 变异 token-not-rotated-on-reclaim 因此杀不掉——它删掉的是这层重叠，不是行为。
      // 保留无条件铸是为了不让围栏依赖「只有释放那条路会清租约」：将来若有人加一条
      // 显式放弃领取的命令并直接清掉 claim_deadline_at，漏掉换代不会有任何测试变红。
      item.claim_token = `claim-${this.idFactory()}`;
      claimed.push(this.intentSnapshot(item));
    }
    return claimed;
  }

  // 回合结束或冷却到期后，把唯一的 dirty context 变成可领工作项（要求 4）。
  //
  // 关键在于「不要求宿主轮询席位内部状态来恢复活性」。原来 pending_context 只是个字段，
  // 权威不为它产生任何意图，宿主除了自己去 view.seat 里翻 has_pending_context 之外没有
  // 别的办法知道有活要干——而那等于把受保护的跟进时序重新交给宿主。
  promotePendingContext(seat) {
    if (seat.pending_context === null) return null;
    if (seat.mode === "OFF") return null;
    // 回合还在飞、冷却还没过，都不是「可以开新回合」的时刻。到那时再促。
    if (seat.active_turn !== null) return null;
    if (this.cooldownRemainingMs(seat, this.now()) > 0) return null;
    // 额度耗尽就地丢弃。这一手内 ai_published_this_hand 只增不减（只在 startHand
    // 归零，而那里同样会清 pending_context），所以留着它永远等不到能用的时刻，只会让
    // has_pending_context 在这一手余下的时间里一直谎报「有活要干」。丢掉之后本席状态
    // 与「额度耗尽时又来了一个事件」一致——notifyDomainEvent 在那条路上也不写
    // pending_context。
    if (seat.ai_published_this_hand >= this.limits.aiMaxPublicPerHand) {
      seat.pending_context = null;
      return null;
    }
    // registerWorkItem 会把 pending_context 清掉，这里只需把它交出去。
    const item = this.registerWorkItem(seat, seat.pending_context);
    return this.record("SEAT_AI_INTENT_QUEUED", {
      intent_id: item.intent_id,
      seat_id: seat.seat_id,
      source_event_id: item.context.source_event_id ?? null,
      hand_index: item.context.hand_index ?? null,
      street: item.context.street ?? null,
      context_revision: item.context.context_revision,
      origin: "pending_context_promoted",
    });
  }

  // 全席促进。由到期驱动调用：冷却到期这件事没有任何命令会顺带触发，只能走表。
  promotePendingContexts() {
    const events = [];
    for (const seat of this.seats.values()) {
      // 先按当前时钟回收过期回合。不然一个被遗弃的回合会一直挡着促进，而它该不该
      // 挡取决于驱动跑没跑。
      this.reclaimSeatIfExpired(seat);
      const event = this.promotePendingContext(seat);
      if (event !== null) events.push(event);
    }
    return events;
  }

  // 规则 2 + 规则 4。返回「评估意向」而不直接调模型：权威层保持宿主中立且可确定性
  // 测试，宿主适配器再据此驱动自己的模型形态。
  notifyDomainEvent(input = {}) {
    const type = requiredString(input.type, "type", 64);
    if (!WHITELIST_SOURCE_EVENTS.includes(type)) {
      // AI_PUBLIC_SPEECH 落在这里：可进入以后上下文，但不单独唤醒任何席位 AI。
      return [];
    }
    const eventId = requiredString(input.eventId, "eventId", 128);
    const payload = clone(input.payload) ?? {};
    const at = this.now();
    const intents = [];

    for (const seat of this.seats.values()) {
      if (seat.mode === "OFF") {
        continue;
      }
      // 规则 2：每个来源事件对每席最多触发一次评估，防止 AI 互相无限对话。
      if (seat.consumed_source_events.has(eventId)) {
        continue;
      }
      seat.consumed_source_events.add(eventId);

      const context = {
        source_event_id: eventId,
        source_event_type: type,
        hand_index: this.handIndex,
        street: this.street,
        payload,
        observed_at: at,
      };

      if (seat.ai_published_this_hand >= this.limits.aiMaxPublicPerHand) {
        // 额度耗尽仍记账为已消费，避免同一事件反复排队。
        intents.push({
          seat_id: seat.seat_id,
          accepted: false,
          reason: "ai_hand_quota_exhausted",
        });
        continue;
      }

      // 先按当前时钟回收过期回合，再看闸门。不然一个被遗弃的回合会把这次唤醒吃掉
      // （merged_into_pending），而它能不能被吃掉取决于驱动跑没跑——同一个事件在
      // tick 两边有两种结果。
      this.reclaimSeatIfExpired(seat);

      const cooldown = this.cooldownRemainingMs(seat, at);
      if (seat.active_turn !== null || cooldown > 0) {
        // 规则 4：合并为一个待评估的最新上下文，不为每条事件排队调用。
        seat.pending_context = context;
        intents.push({
          seat_id: seat.seat_id,
          accepted: false,
          reason: seat.active_turn !== null ? "merged_into_pending" : "cooldown",
          cooldown_remaining_ms: cooldown,
        });
        continue;
      }

      // F5：登记成权威侧工作项再返回快照。返回值里带 intent_id，宿主拿它回来
      // 启动评估；即使这份返回值在传输途中丢了，工作项仍在权威队列里等人来领。
      const item = this.registerWorkItem(seat, context);
      intents.push(this.intentSnapshot(item));
    }
    return intents;
  }

  // 把在途回合从 active_turn 移到 detached_turn。只保留最近一个：迟到输出带的是
  // 具体 turn_id，对不上就按 turn_not_active 拒绝，所以留一个就够，也不会无界增长。
  detachTurn(seat, kind) {
    const turn = seat.active_turn;
    if (turn === null) return null;
    seat.active_turn = null;
    seat.detached_turn = { turn, kind };
    return turn;
  }

  // 回收租约到期的评估回合。
  //
  // 这是权威自己走表的一步，由到期驱动按真实时钟调用，不需要任何宿主在场——一个被
  // 遗弃的回合就是权威性时序，把回收交给宿主等于又把「规则要靠有人在场才前进」写
  // 回来一次。本方法不做任何"该不该说话"的判定，只回答"这个回合是不是已经不可能
  // 再回来了"。
  //
  // 三件明确不做的事：
  //   1. 不退还每手额度。否则崩溃重启就是绕过规则 3 的刷额度手法。反正没发布出去，
  //      本来也没消耗，无须退还。
  //   2. 不重置冷却。cooldown 由 last_evaluation_started_at 算，回收不碰它，所以
  //      规则 3 的最小启动间隔照旧生效。
  //   3. 不清 pending_context。卡住期间合并进去的最新上下文仍然有效，下一个来源
  //      事件会带着它开新回合——这正是规则 4「合并为最新上下文」要的效果。
  //
  // 单席版本单独抽出来，是因为「租约过期了吗」必须在每个会读到 active_turn 的地方
  // 问一次，不能只在驱动那一步问。只在驱动里问的话，判定就取决于 tick 落在请求的
  // 哪一边：租约过期 10 毫秒的迟到输出，抢在 tick 前到达就发布，晚到就丢弃——同样的
  // 输入两种公开时间线。而 tick 间隔是宿主选项（dueWorkIntervalMs），等于让宿主配置
  // 决定规则结果。所以内核在被问到时自己判定，驱动只负责没人问时也照样发生。
  reclaimSeatIfExpired(seat) {
    const turn = seat.active_turn;
    if (turn === null) return null;
    const at = this.now();
    if (turn.lease_deadline_at === null || at < turn.lease_deadline_at) return null;
    this.detachTurn(seat, "reclaimed");
    // 无条件 IDLE，不用判 mode：OFF 的席位不可能有在途回合。mode 全局只有
    // setSeatAiMode 一个写入点，而它切 OFF 时就把回合摘下来了。这条不变量由
    // 「OFF 的席位永远没有在途回合」那条测试钉住——依赖一个假设就得把它测出来，
    // 否则这里写成判 mode 只是看着稳妥，实际是一段没人能验证的死分支。
    seat.status = "IDLE";
    return this.record("SEAT_AI_EVALUATION_RECLAIMED", {
      seat_id: seat.seat_id,
      turn_id: turn.turn_id,
      started_at: turn.started_at,
      lease_deadline_at: turn.lease_deadline_at,
      reclaimed_at: at,
      status: seat.status,
    });
  }

  reclaimExpiredEvaluations() {
    const events = [];
    for (const seat of this.seats.values()) {
      const event = this.reclaimSeatIfExpired(seat);
      if (event !== null) events.push(event);
    }
    return events;
  }

  // 启动评估。只认权威生成的 intent_id（要求 2），不接受适配器自带上下文。
  //
  // 之前的签名收 { seatId, context }，context 是宿主回传的任意对象。source_event_id
  // 是「这句公开话术因何而起」的唯一审计依据，让被审计方填等于没有审计——宿主可以
  // 把任何一句话挂到任何一个事件上，也可以挂到一个不存在的事件上。
  startEvaluation(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const intentId = requiredString(input.intentId, "intentId", 128);
    // 先看席位模式，再看工作项。顺序有意如此：关掉 AI 时该席的待办会被一起丢弃，所以
    // 反过来的话「拿着旧 id 去起一个已关席位」永远只报 intent_not_found，宿主看不出
    // 「这一席被关了」这个真正的原因。
    if (seat.mode === "OFF") {
      throw new ProbeError("seat_ai_off", 409, { seat_id: seat.seat_id });
    }
    const item = this.workItems.get(intentId);
    if (item === undefined) {
      // 已被消费的 id 也走这里。宿主看到的是同一个错误码：从它的角度，「这个 id
      // 现在不是可用工作项」是同一件事，区分二者只会泄露别席的调度节奏。
      throw new ProbeError("intent_not_found", 404, { intent_id: intentId });
    }
    if (item.seat_id !== seat.seat_id) {
      // 跨席 claim。要求 5 点名的用例：宿主拿着 A 席的工作项去开 B 席的回合，
      // 就能让 B 席替 A 席说话，而 B 席的额度和冷却都还是满的。
      throw new ProbeError("intent_seat_mismatch", 403, {
        intent_id: intentId,
        seat_id: seat.seat_id,
      });
    }
    // 世代围栏（F5 补强）。
    //
    // 挡的时序：A 领走意图 X，卡住；30 秒租约到期，权威释放；B 领走同一个 X——这正是租约
    // 存在的目的；然后 A 醒过来，拿它记得的 intent_id 启动，成功，工作项被消费；B 再来
    // 只拿到 intent_not_found。租约把活交给了 B，A 把它抢回去了，而 B 看到的错误码与
    // 「我调错了」是同一个，它无从知道自己被顶掉。
    //
    // 令牌只在被领取过之后要求。从未领取的工作项（claim_token 为 null）允许直接启动：
    // notifyDomainEvent 的返回本身就是可用快照，那是一条少一次往返的正当路径。
    //
    // 位置在跨席检查之后：intent_seat_mismatch 是要求 5 点名的用例，它的错误码不该被
    // 围栏改写成一个更含糊的「世代不对」。
    if (item.claim_token !== null && input.claimToken !== item.claim_token) {
      // details 里不回显正确令牌，否则这里就成了一个取令牌的接口。
      throw new ProbeError("intent_claim_superseded", 409, {
        intent_id: intentId,
        seat_id: seat.seat_id,
        claim_count: item.claim_count,
      });
    }
    // 同上：租约过期的回合不该再挡住新回合，而这不能等驱动来清。
    this.reclaimSeatIfExpired(seat);
    if (seat.active_turn !== null) {
      // 规则 4：每席同时最多运行一个公开话术模型回合。
      throw new ProbeError("seat_turn_already_active", 409, {
        seat_id: seat.seat_id,
        turn_id: seat.active_turn.turn_id,
      });
    }
    const at = this.now();
    const cooldown = this.cooldownRemainingMs(seat, at);
    if (cooldown > 0) {
      throw new ProbeError("evaluation_cooldown", 429, {
        seat_id: seat.seat_id,
        cooldown_remaining_ms: cooldown,
        min_interval_ms: this.limits.aiMinEvaluationIntervalMs,
      });
    }
    if (seat.ai_published_this_hand >= this.limits.aiMaxPublicPerHand) {
      throw new ProbeError("ai_hand_quota_exhausted", 429, {
        seat_id: seat.seat_id,
        max_per_hand: this.limits.aiMaxPublicPerHand,
      });
    }

    // 消费工作项。到这里为止的每个闸门都可能抛出，抛出时工作项仍在队列里且仍被
    // claim 着——租约到期后重新可领，不会因为一次冷却拒绝就丢掉这次唤醒。
    this.workItems.delete(intentId);
    const context = item.context;
    seat.active_turn = {
      turn_id: `turn-${this.idFactory()}`,
      seat_id: seat.seat_id,
      context,
      // 规则 5 判定所需：记录回合启动时的手序与街道。
      started_hand_index: this.handIndex,
      started_street: this.street,
      started_at: at,
      // 租约期限。适配器死在这之后就再也不会回来，权威到期自己收回。
      lease_deadline_at: at + this.evaluationLeaseMs,
    };
    seat.last_evaluation_started_at = at;
    seat.status = "THINKING";

    return this.record("SEAT_AI_EVALUATION_STARTED", {
      seat_id: seat.seat_id,
      turn_id: seat.active_turn.turn_id,
      source_event_id: context.source_event_id ?? null,
      hand_index: this.handIndex,
      street: this.street,
      status: "THINKING",
    });
  }

  // 回合结束即促进（F5 要求 4 的前半句「回合结束后」）。
  //
  // 包一层而不是在 resolveTurn 的每个 return 前各写一遍：那个方法有五个正常出口和两个
  // 抛出出口，逐个加等于漏一个就少一条活性路径。finally 顺带把抛出路径也覆盖了——
  // message_too_long 和额度耗尽这两支已经把回合摘下来了，回合确实结束了，只是结论是拒绝。
  //
  // 冷却常常会让这一步当场变成空操作（启动间隔从回合开始算）。那不是缺陷：模型跑得比
  // 冷却久时这里直接促进，跑得快时留给冷却到期那一支。两支都必须存在，缺前者就得等
  // 一个 tick，缺后者就永远等不到。
  resolveEvaluation(input = {}) {
    try {
      return this.resolveTurn(input);
    } finally {
      const seat = this.seats.get(input.seatId);
      if (seat !== undefined) this.promotePendingContext(seat);
    }
  }

  // 规则 5 + 规则 6。AI 生成永不暂停或延长真人行动倒计时：本方法不触碰任何
  // 行动窗口，只决定迟到输出能否发布、是否需要标注、还是必须丢弃。
  resolveTurn(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const turnId = requiredString(input.turnId, "turnId", 128);
    // 先按当前时钟回收，再查回合。这一步决定了迟到输出走发布还是走 turn_reclaimed，
    // 而它必须只取决于「租约过期了没有」，不取决于驱动的 tick 落在这个请求的哪一边。
    this.reclaimSeatIfExpired(seat);
    // 先看在途回合，再看已摘下的回合。摘下的回合仍须能被 resolve——不然规则 6
    // 那条「迟到结果必须被丢弃」的证据就变成一个 turn_not_active 异常，适配器
    // 分不清「我说的话被拒了」和「我调错了」。
    const detached =
      seat.detached_turn !== null && seat.detached_turn.turn.turn_id === turnId
        ? seat.detached_turn
        : null;
    const turn = seat.active_turn !== null && seat.active_turn.turn_id === turnId
      ? seat.active_turn
      : detached === null
        ? null
        : detached.turn;
    if (turn === null) {
      throw new ProbeError("turn_not_active", 409, {
        seat_id: seat.seat_id,
        turn_id: turnId,
      });
    }
    // 先校验，再改状态。
    //
    // 这个顺序是一条纪律，不是风格。原来是先把回合摘下来再 requiredEnum，于是模型拼错一个
    // 枚举就会：回合被吃掉（active_turn = null），status 停在 THINKING 再也不会变，而
    // reclaimSeatIfExpired 看的是 active_turn 的租约期限——null 意味着没有租约可到期。
    // 三条加起来是一个既不推进也不复原、也没人能收拾的状态。
    //
    // 输出来自语言模型，所以畸形是常态路径而不是异常路径。畸形请求不该吃掉这次唤醒：
    // 唤醒有额度（规则 2：每个来源事件对每席最多一次），吃掉就是真的少了一次发言机会。
    // 有界性由 120 秒评估租约提供，不需要靠吃掉回合来保证——适配器重试一次就好，
    // 一直重试也只能重试到租约到期，然后权威自己收回。
    //
    // 只把纯输入校验提前。requireConfirmedScope 与额度检查留在原处：前者刻意放在 silent
    // 分支之后（见下方注释），后者在抛出之前已经自己写好了状态。
    const decision = requiredEnum(input.decision, AI_DECISIONS, "decision");
    if (decision === "public_speech") {
      // text 的形状在这里就要求。长度上限不在这里——message_too_long 刻意写 DEGRADED
      // 并消耗回合，那是「说了话但太长」，与「没说出结构完整的话」不是一回事。
      requiredString(input.text, "text");
    }

    if (detached !== null) {
      seat.detached_turn = null;
    } else {
      seat.active_turn = null;
    }

    // 规则 6：OFF 后任何迟到结果都不得发布；被取消或被回收的回合同样不得发布。
    // 理由在此刻计算而非摘下时固定：同一个被取消的回合，席位仍 OFF 时理由是
    // seat_ai_off，已经重新打开时是 turn_cancelled。这两支都得留着。
    if (seat.mode === "OFF" || detached !== null) {
      // 状态跟 mode 走。以前这里无条件写 OFF，在「取消后又打开」的情况下会把一个
      // ON 的席位改成 OFF——等于丢弃一条迟到输出顺手又静音一次。
      seat.status = seat.mode === "OFF" ? "OFF" : "IDLE";
      return this.record("SEAT_AI_OUTPUT_DISCARDED", {
        seat_id: seat.seat_id,
        turn_id: turnId,
        reason:
          seat.mode === "OFF"
            ? "seat_ai_off"
            : detached.kind === "reclaimed"
              ? "turn_reclaimed"
              : "turn_cancelled",
        decision,
      });
    }

    // 规则 5：一旦进入下一手，旧手输出必须丢弃，不占新手额度。
    if (turn.started_hand_index !== this.handIndex) {
      seat.status = "IDLE";
      return this.record("SEAT_AI_OUTPUT_DISCARDED", {
        seat_id: seat.seat_id,
        turn_id: turnId,
        reason: "hand_advanced",
        started_hand_index: turn.started_hand_index,
        current_hand_index: this.handIndex,
        decision,
      });
    }

    // 规则 3：silent 不消耗 AI 发布额度。
    if (decision === "silent") {
      seat.status = "IDLE";
      return this.record("SEAT_AI_SILENT", {
        seat_id: seat.seat_id,
        turn_id: turnId,
        source_event_id: turn.context.source_event_id ?? null,
        hand_index: this.handIndex,
      });
    }

    // 规则 1（F3）：AI_PUBLIC_SPEECH 是 TABLE_PUBLIC 的第二个出口，同样要该席自己的确认。
    //
    // 席位 AI 默认 mode 是 ON，而唤醒来源不止玩家发言——行动窗口、BET、RAISE 都能唤醒。
    // 少了这道门，一个从未见过「你的自由文本默认公开」的席位，只要牌桌开始行动，
    // 它的 AI 就会替它往公开时间线上说话。
    //
    // 门放在 silent 分支之后：silent 什么都不发布，不需要任何同意。放在前面会让未确认
    // 席位的在途回合再也结算不掉，该席闸门永久关闭——那是用一个活性洞换一个同意洞。
    this.requireConfirmedScope(
      seat.seat_id,
      requiredString(input.roomBindingId, "roomBindingId", 256),
      requiredString(input.tableRulesVersion, "tableRulesVersion", 64),
    );

    const text = requiredString(input.text, "text");
    const graphemes = countGraphemes(text);
    if (graphemes > this.limits.maxGraphemesPerMessage) {
      seat.status = "DEGRADED";
      throw new ProbeError("message_too_long", 400, {
        graphemes,
        max_graphemes: this.limits.maxGraphemesPerMessage,
        limits_version: this.limits.version,
      });
    }
    if (seat.ai_published_this_hand >= this.limits.aiMaxPublicPerHand) {
      seat.status = "IDLE";
      throw new ProbeError("ai_hand_quota_exhausted", 429, {
        seat_id: seat.seat_id,
        max_per_hand: this.limits.aiMaxPublicPerHand,
      });
    }

    // 规则 5：同手内迟到仍可公开；已跨街必须醒目标注。
    const crossedStreet = turn.started_street !== this.street;
    seat.ai_published_this_hand += 1;
    seat.status = "IDLE";

    return this.record("AI_PUBLIC_SPEECH", {
      scope: "TABLE_PUBLIC",
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      speaker_type: "SEAT_AI",
      text,
      graphemes,
      turn_id: turnId,
      source_event_id: turn.context.source_event_id ?? null,
      hand_index: this.handIndex,
      street: this.street,
      based_on_street: turn.started_street,
      late_annotation: crossedStreet ? "延迟 · 基于前一街" : null,
      poker_action_effect: null,
    });
  }

  advanceStreet(input = {}) {
    const street = requiredString(input.street, "street", 32);
    this.street = street;
    const event = this.record("STREET_ADVANCED", {
      hand_index: this.handIndex,
      street,
    });
    const evaluations = this.notifyDomainEvent({
      type: "STREET_ADVANCED",
      eventId: event.event_id,
      payload: event.payload,
    });
    return { event, evaluations };
  }

  startHand() {
    this.handIndex += 1;
    this.street = "preflop";
    for (const seat of this.seats.values()) {
      seat.hand_index = this.handIndex;
      seat.player_published_this_hand = 0;
      seat.player_recent_timestamps = [];
      seat.ai_published_this_hand = 0;
      seat.consumed_source_events = new Set();
      seat.pending_context = null;
      // 上一手的待办不带进新一手：它的 hand_index/street 都是旧的，起来就是对着
      // 已经结束的牌面说话。规则 5 本来会在 resolve 时按 hand_advanced 丢弃它，
      // 但那要先白跑一次模型；在这里丢掉更省，语义也一样。
      this.discardWorkItem(seat.seat_id);
      // 在途回合不取消：它会在 resolveEvaluation 里按 hand_advanced 丢弃。
      // 冷却计时不因换手重置——启动间隔是时间维度的反刷屏，不是每手配额。
    }
    return this.record("HAND_STARTED", { hand_index: this.handIndex });
  }

  // 规则 6：故障只显示可理解状态，不静默切换外部模型或影子 AI。
  setSeatStatus(input = {}) {
    const seat = this.requireSeat(input.seatId);
    const status = requiredEnum(input.status, SEAT_AI_STATUSES, "status");
    if (seat.mode === "OFF" && status !== "OFF") {
      throw new ProbeError("seat_ai_off", 409, { seat_id: seat.seat_id });
    }
    seat.status = status;
    return this.record("SEAT_AI_STATUS_CHANGED", {
      seat_id: seat.seat_id,
      status,
    });
  }

  // 规则 7：本地隐藏只改变该查看者渲染，不删除权威事件、不改变他人所见。
  setLocalHidden(input = {}) {
    const viewer = this.requireSeat(input.viewerSeatId);
    const target = requiredEnum(
      input.target,
      ["player", "ai", "seat"],
      "target",
    );
    const targetId = requiredString(input.targetId, "targetId", 64);
    const hidden = input.hidden !== false;
    const bucket = target === "player"
      ? viewer.local_hidden.players
      : target === "ai"
        ? viewer.local_hidden.ais
        : viewer.local_hidden.seats;
    if (hidden) {
      bucket.add(targetId);
    } else {
      bucket.delete(targetId);
    }
    // 只是查看者本地渲染偏好，不进入权威时间线。
    return {
      viewer_seat_id: viewer.seat_id,
      target,
      target_id: targetId,
      hidden,
    };
  }

  // 规则 7：隐藏只在渲染层标记；权威事件与顺序保持不变，回放与审计不受影响。
  publicTimeline({ viewerSeatId = null } = {}) {
    const viewer = viewerSeatId === null ? null : this.requireSeat(viewerSeatId);
    const chatTypes = ["PLAYER_PUBLIC_SPEECH", "AI_PUBLIC_SPEECH"];
    return this.events
      .filter((event) => chatTypes.includes(event.type))
      .map((event) => {
        let hiddenForViewer = false;
        if (viewer !== null) {
          const { seat_id: seatId, speaker_type: speakerType, player_id: playerId } =
            event.payload;
          hiddenForViewer = viewer.local_hidden.seats.has(seatId)
            || (speakerType === "PLAYER" && viewer.local_hidden.players.has(playerId))
            || (speakerType === "SEAT_AI" && viewer.local_hidden.ais.has(seatId));
        }
        return {
          ...clone(event),
          locally_hidden_for_viewer: hiddenForViewer,
        };
      });
  }

  seatState(seatIdValue) {
    const seat = this.requireSeat(seatIdValue);
    const at = this.now();
    return {
      seat_id: seat.seat_id,
      player_id: seat.player_id,
      mode: seat.mode,
      status: seat.status,
      hand_index: seat.hand_index,
      player_published_this_hand: seat.player_published_this_hand,
      ai_published_this_hand: seat.ai_published_this_hand,
      ai_hand_quota_remaining:
        this.limits.aiMaxPublicPerHand - seat.ai_published_this_hand,
      cooldown_remaining_ms: this.cooldownRemainingMs(seat, at),
      active_turn_id: seat.active_turn === null ? null : seat.active_turn.turn_id,
      has_pending_context: seat.pending_context !== null,
      // F5 要求 3/4：待办的可见性。宿主不再需要靠 has_pending_context 猜「是不是该
      // 去催一下」——有活时这里直接给 intent_id，没有就是 null，而促进由权威走表完成。
      // 保留 has_pending_context 是因为它答的是另一个问题：有一份上下文正在被合并等待，
      // 但当前回合/冷却还没让它变成可领的活。
      pending_intent_id: (() => {
        const item = this.findWorkItemBySeat(seat.seat_id);
        return item === null ? null : item.intent_id;
      })(),
      context_revision: seat.context_revision,
      limits_version: this.limits.version,
      // 该席自己的公开确认记录，没有就是 null。给出整个三元组而不只是一个布尔：
      // 「确认过」和「确认的是当前这个房间与这版桌规」不是同一件事（规则 3 会让旧确认失效），
      // 查看方要能自己判定，否则只能拿一个语义含混的 true 去猜。
      //
      // 三元组里没有秘密：绑房标识、桌规版本、限额版本都是公开事实，凭据从不进入这里。
      public_scope_confirmation: seat.public_scope_confirmation === null
        ? null
        : { ...seat.public_scope_confirmation },
    };
  }

  record(type, payload) {
    this.sequence += 1;
    const event = {
      event_id: `sae-${this.idFactory()}`,
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
  SeatAiStore,
  LIVELY_V1,
  EVALUATION_LEASE_MS,
  INTENT_CLAIM_LEASE_MS,
  WHITELIST_SOURCE_EVENTS,
  countGraphemes,
};
