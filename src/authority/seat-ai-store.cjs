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
  } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.limits = Object.freeze({ ...LIVELY_V1, ...limits });
    // 与 limits 分开存放，正是为了不把活性期限混进发言预算。
    this.evaluationLeaseMs = evaluationLeaseMs;
    this.resetState();
  }

  resetState() {
    this.seats = new Map();
    this.events = [];
    this.listeners = new Set();
    this.handIndex = 0;
    this.street = "preflop";
    this.sequence = 0;
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
      seat.status = "OFF";
    } else {
      seat.status = "IDLE";
      // 重新开启后只从下一个合法事件或一次明确的立即评估开始，不补跑旧事件。
      seat.pending_context = null;
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

      intents.push({
        seat_id: seat.seat_id,
        accepted: true,
        context,
      });
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

  startEvaluation(input = {}) {
    const seat = this.requireSeat(input.seatId);
    if (seat.mode === "OFF") {
      throw new ProbeError("seat_ai_off", 409, { seat_id: seat.seat_id });
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

    const context = clone(input.context) ?? seat.pending_context;
    if (context === null || context === undefined) {
      throw new ProbeError("invalid_field", 400, { field: "context" });
    }
    seat.pending_context = null;
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

  // 规则 5 + 规则 6。AI 生成永不暂停或延长真人行动倒计时：本方法不触碰任何
  // 行动窗口，只决定迟到输出能否发布、是否需要标注、还是必须丢弃。
  resolveEvaluation(input = {}) {
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
    if (detached !== null) {
      seat.detached_turn = null;
    } else {
      seat.active_turn = null;
    }
    const decision = requiredEnum(input.decision, AI_DECISIONS, "decision");

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
      limits_version: this.limits.version,
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
  WHITELIST_SOURCE_EVENTS,
  countGraphemes,
};
