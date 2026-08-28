"use strict";

// 逐查看者的牌桌视图模型。纯函数，无 IO，无状态；时钟只以 now 入参的形式出现。
//
// 存在的理由：MVP 验收里有一条是「每个客户端只能收到公共状态和自己的底牌投影」，另一条是
// 「任一查看者可本地隐藏指定玩家、AI 或整席聊天；其他查看者与权威事件历史不受影响」。
// 如果浏览器直接拿 view.projection 再自己筛，这两条就都只是「前端记得筛」——而前端是
// 最容易被改、被绕、被复制的一层。所以筛选发生在这里，浏览器收到的东西里根本没有别人的
// 底牌可筛。
//
// 三条自我约束：
//   1. 不新增产品语义。合法动作、配额、隐藏标记全部照抄权威给的值，一个都不自己算。
//   2. 不透传原始权威事件。UI 只拿到已经翻译好的气泡与状态；room_events / ai_events
//      这两条诊断命令永远不进入本模块的输入（host-surface 已把它们划为 diagnostic）。
//   3. 不发明第二套显示规则。座位顺序、庄位、盲注都用权威给的字段，不按数组下标猜。
//
// 为什么不直接把 public_timeline 交给 UI：它的元素是完整的权威事件（含 event_id、
// sequence、payload 里的内部字段）。UI 只需要「谁、什么时候、说了什么、要不要显示」。
// 多给的那些字段没有用途，却每一个都是将来有人拿去做业务判断的入口——一旦 UI 开始按
// event_id 推断顺序或按 payload 内部字段推断状态，权威就不再是唯一解释者了。

// 视图里允许出现的发言方类型。权威事件的 speaker_type 只有这两个值，写成常量是为了让
// 「出现第三种」变成一个显式失败而不是一个静默渲染。
const SPEAKER_TYPES = Object.freeze(["PLAYER", "SEAT_AI"]);

// 座位旁气泡的存活时长。约 10 秒之后这条发言从座位旁退出，但仍留在公开时间线里。
//
// 为什么由投影算而不是页面开 setTimeout：定时器会把「这条该不该显示」变成第二份状态，
// 它与视图的唯一同步点是它自己。轮询丢一次、标签页被浏览器节流一次，两者就再也对不上，
// 而对不上的表现是气泡永远不消失——正好压在公共牌上。now 作为入参传进来，本模块
// 仍然不读时钟。
const SEAT_SPEECH_TTL_MS = 10_000;

// 一席旁边同时最多几条。不设上限时一席连说八句就会盖住相邻席位与公共牌，而「盖住了」
// 在窄屏上不可能靠缩小解决。4 条留得下「玩家问 + AI 答」两轮。
const MAX_SEAT_SPEECH = 4;

// 绝不允许出现在视图里的字段名。build() 结束前自检一遍。
//
// 这不是替代 SeatCustody 的泄漏扫描（那一层比对秘密原文），而是补另一个方向：凭据字段
// 就算此刻是 undefined，只要形状里留着这个键，下一个改这个文件的人就会觉得该把它填上。
const FORBIDDEN_KEYS = Object.freeze([
  "recovery_credential",
  "credential",
  "invite_code",
  "recovery_credential_hash",
]);

function graphemeLength(text) {
  // 字素计数。String.length 会把家庭 emoji 算成 8，于是 140 上限可以被轻易绕过。
  // 这里只用于 UI 的实时计数提示，真正的门禁在权威侧（LIVELY_V1）；两边都必须按字素，
  // 否则「输入框说还能打 3 个字，服务端说超了」会变成一个无法解释的产品缺陷。
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}

// 座位 -> 玩家 的映射来自房间投影（seat.player_id），不是猜的。牌局投影按 player_id
// 索引，房间投影按 seat_id 索引，两者要对上只能靠这个字段。
function seatToPlayer(roomSeats) {
  const map = new Map();
  for (const seat of roomSeats) {
    if (typeof seat.seat_id === "string" && typeof seat.player_id === "string") {
      map.set(seat.seat_id, seat.player_id);
    }
  }
  return map;
}

function handSeatByPlayer(publicHand) {
  const map = new Map();
  for (const seat of publicHand?.seats ?? []) {
    if (typeof seat.id === "string") map.set(seat.id, seat);
  }
  return map;
}

// 本席的私密牌局视图（view.hand）与公共视图（projection.public_hand）的区别只有两处：
// 自己的 hole_cards 与 legal_actions。其余字段两边相同，所以私密视图存在时整份用它，
// 不做逐字段合并——合并要维护一张「哪个字段该取哪边」的表，而那张表出错就是发牌错误。
function pickHandSource(publicHand, privateHand) {
  return privateHand ?? publicHand ?? null;
}

function buildSeats({ roomState, publicHand, privateHand, viewerSeatId, aiStates, localHidden }) {
  const hand = pickHandSource(publicHand, privateHand);
  const byPlayer = handSeatByPlayer(hand);
  const seats = roomState?.seats ?? [];

  return seats.map((seat, index) => {
    const isViewer = seat.seat_id === viewerSeatId;
    const handSeat = byPlayer.get(seat.player_id) ?? null;
    const ai = aiStates?.[seat.seat_id] ?? null;

    // 底牌只在两种情况下出现：这是查看者自己的席位（此时 hand 来自 view.hand，权威已按
    // viewerId 解锁），或者权威已经公开摊牌（此时公共视图里本来就有）。本模块不自己判断
    // 「该不该给」——它只是不发明第三种情况。
    const holeCards = handSeat?.hole_cards ?? null;

    return {
      seat_id: seat.seat_id,
      // player_id 是公开事实（公开发言的归属就靠它），但仍然不给昵称之类的本机资料：
      // 那些不在权威投影里，本模块也就没有它们。
      player_id: seat.player_id,
      seat_index: index,
      is_viewer: isViewer,
      state: seat.state,
      connected: seat.connected === true,
      // 筹码的权威来源按阶段切换，这不是取巧，两个来源各自只在一个阶段成立：
      //
      //   手内 —— 引擎的 seat.stack。它在每次 commitChips 时立刻扣减，所以「我下注后
      //     筹码变少」这件事只有它能如实显示。房间账本此刻还没结算（settleStacks 在
      //     HAND_COMPLETED 之后才跑），拿它显示会让下出去的筹码看起来没被扣。
      //   手间 —— 房间账本的 seat.stack。它是跨手持有者（F1 的本体），引擎对象此时
      //     已经不存在或属于上一手。
      //
      // 手内两者相加不等于任何有意义的数：账本是「这一手开始时的钱」，引擎是「现在还剩
      // 的钱」，投入部分单独由 committed_this_hand 显示。
      stack: handSeat === null ? seat.stack : handSeat.stack,
      // 账本值也一并给出。手内它等于「本手开始时的筹码」，UI 可以用它显示盈亏方向；
      // 手间它与 stack 相同。分开给而不是让 UI 自己推，是因为「本手开始时有多少」
      // 无法从当前状态倒算——弃牌席位的投入不会退回。
      ledger_stack: seat.stack,
      // 本手已投入。手间没有牌局，显示 0 而不是 null：null 会让 UI 需要一个空态分支，
      // 而「这一手投了 0」和「现在没有这一手」在筹码条上是同一个画面。
      committed_this_hand: handSeat?.total_commitment ?? 0,
      committed_this_round: handSeat?.round_commitment ?? 0,
      in_hand: handSeat !== null,
      hand_status: handSeat?.status ?? null,
      all_in: seat.all_in === true || handSeat?.status === "all_in",
      sit_out_after_hand: seat.sit_out_after_hand === true,
      leave_requested: seat.leave_requested === true,
      // 掉线保留窗剩余毫秒。null = 没在保留窗里。UI 靠它显示 120 秒倒计时。
      retention_remaining_ms: seat.retention_remaining_ms ?? null,
      is_dealer: hand !== null && hand.dealer_player_id === seat.player_id,
      is_small_blind: hand !== null && hand.small_blind_player_id === seat.player_id,
      is_big_blind: hand !== null && hand.big_blind_player_id === seat.player_id,
      is_actor: hand !== null && hand.actor_player_id === seat.player_id,
      hole_cards: holeCards,
      ai: {
        // 三个状态词直接来自权威：mode 是玩家自己设的（LIVELY / OFF），status 是权威
        // 观察到的（IDLE / THINKING / DEGRADED / OFFLINE）。UI 不合成第三个词。
        mode: ai?.mode ?? null,
        status: ai?.status ?? null,
        hand_quota_remaining: ai?.ai_hand_quota_remaining ?? null,
        // 本席 AI 是否正有一个回合在跑。UI 用它显示「思考中」的气泡占位。
        active: ai?.active_turn_id !== null && ai?.active_turn_id !== undefined,
        cooldown_remaining_ms: ai?.cooldown_remaining_ms ?? null,
      },
      // 规则 7：本地隐藏只影响该查看者的渲染。这三个布尔是查看者自己的选择，
      // 权威事件历史里没有它们。
      locally_hidden: {
        player: localHidden.players.includes(seat.player_id),
        ai: localHidden.ais.includes(seat.seat_id),
        seat: localHidden.seats.includes(seat.seat_id),
      },
      // 只有自己那一席带公开范围确认状态。别人确认了没有不是查看者的事，
      // 而把它铺给所有席会让 UI 有机会替别人显示一个「去确认」按钮。
      public_scope_confirmed: isViewer
        ? aiStates?.[seat.seat_id]?.public_scope_confirmation !== null
          && aiStates?.[seat.seat_id]?.public_scope_confirmation !== undefined
        : null,
    };
  });
}

// 权威时间线 -> 气泡。只保留 UI 真正要用的字段，并把「本地隐藏」落成一个布尔。
//
// 隐藏的条目仍然出现在数组里，只是带 hidden: true。验收要求「隐藏/静音只影响本地渲染，
// 不改变配额」，也要求「聊天时间线、事件日志和回放仍保留原消息」——直接从数组里删掉会让
// UI 无法显示「此处有 1 条被你隐藏的发言」，而那正是「只影响渲染」与「审查」的区别。
function buildMessages(timeline, seatIndexById) {
  return (timeline ?? []).map((event) => {
    const p = event.payload ?? {};
    const speakerType = SPEAKER_TYPES.includes(p.speaker_type) ? p.speaker_type : null;
    return {
      // 用权威的 sequence 做 UI 的 key 与排序依据。UI 自己不重新排序：四个视图必须
      // 「以同一顺序看到合法公开聊天事件」，而唯一的顺序来源是权威的 sequence。
      sequence: event.sequence,
      at: event.at,
      seat_id: p.seat_id ?? null,
      seat_index: seatIndexById.get(p.seat_id ?? "") ?? null,
      player_id: p.player_id ?? null,
      speaker_type: speakerType,
      text: typeof p.text === "string" ? p.text : "",
      channel: p.channel ?? "TABLE_PUBLIC",
      // 迟到标注。权威在结算跨街迟到的 AI 回合时给出这两个字段；UI 据此显示
      // 「延迟 · 基于 flop」，而不是自己拿当前街去比较。
      late: p.late === true,
      based_on_street: p.based_on_street ?? null,
      hidden: event.locally_hidden_for_viewer === true,
    };
  });
}

// 气泡 -> 逐席位的座位旁投影。
//
// 归属按 seat_id，不按 player_id：名字会重、会改，seat_id 在这一桌里唯一。没有 seat_id
// 的发言一条都不挂——挂错席比不显示更糟，那会把一句无主的话变成某个真人说过的话。
//
// 顺序沿用 messages 的顺序，而 messages 已经是权威 sequence 序（buildMessages 不重排）。
// 四个视图必须以同一顺序看到同一批发言，唯一的顺序来源是权威。
function buildSeatSpeech(messages, now, knownSeatIds) {
  const bySeat = new Map();
  if (typeof now !== "number" || !Number.isFinite(now)) return bySeat;
  const known = knownSeatIds instanceof Set ? knownSeatIds : new Set();

  for (const message of messages) {
    // 只挂到这一桌真有的席位上。这一条同时管住四种情形，所以前面不再单独判类型——
    // 加一个「先查是不是非空字符串」的闸门跑出来是等价变异，因为 Set.has 对 null、
    // 空串、数字一律为 false，那个闸门永远改变不了结果。
    //
    //   - 缺失的 seat_id：buildMessages 归一成 null。只判 undefined 的写法会把无主
    //     发言挂到一个不存在的键上——不显示、不报错，直到某天有人让 seat_id 可空。
    //   - 空串或非字符串：同上，进不了 known。
    //   - 已离桌的席位：它的话留在历史区，不挂在一张已经不存在的卡片旁边。
    if (!known.has(message.seat_id)) continue;
    const age = now - message.at;
    // 未来时间戳（at > now）当作刚发生：时钟回拨不该让气泡提前退出，
    // 而负的 age_ms 会让页面的淡出算出一个越来越不透明的值。
    const ageMs = age < 0 ? 0 : age;
    if (ageMs > SEAT_SPEECH_TTL_MS) continue;

    const list = bySeat.get(message.seat_id) ?? [];
    list.push({
      sequence: message.sequence,
      speaker_type: message.speaker_type,
      player_id: message.player_id,
      text: message.text,
      late: message.late,
      based_on_street: message.based_on_street,
      // 隐藏在这里只标不抹。抹掉正文就等于本地隐藏改变了投影事实，而验收要求的是
      // 「只影响渲染」——页面据此显示「此处有 1 条被你隐藏的发言」。
      hidden: message.hidden,
      age_ms: ageMs,
    });
    bySeat.set(message.seat_id, list);
  }

  // 超出上限时留最近的几条。slice 从尾部取，顺序仍是 sequence 序。
  for (const [seatId, list] of bySeat) {
    if (list.length > MAX_SEAT_SPEECH) bySeat.set(seatId, list.slice(-MAX_SEAT_SPEECH));
  }
  return bySeat;
}

// 合法动作。权威只对「已证明拥有该席」的调用者给出 legal_actions（view.hand），
// 所以这里的空数组有两种含义：不是你的回合，或者现在没有牌局。两者在 UI 上都是
// 「按钮不可用」，不需要区分。
function buildActionPanel({ privateHand, viewerSeat, limits }) {
  const hand = privateHand ?? null;
  const legal = hand?.legal_actions ?? [];
  const isActor = hand !== null
    && viewerSeat !== null
    && hand.actor_player_id === viewerSeat.player_id;

  return {
    // 绑定字段。客户端提交动作必须带这三个（F2），而它们只能来自权威投影——
    // 这也是 action-binding.cjs 那条注释钉住的约束：投影自己就得够拼出合法请求。
    hand_id: hand?.hand_id ?? null,
    expected_revision: hand?.revision ?? null,
    is_actor: isActor,
    legal_actions: legal.map((action) => (typeof action === "string" ? { type: action } : action)),
    current_bet: hand?.current_bet ?? 0,
    min_raise_increment: hand?.min_raise_increment ?? null,
    action_deadline_at: hand?.action_deadline_at ?? null,
    // 自愿亮牌只在权威裁定 all_others_folded 且查看者是赢家时可用。UI 不自己判断
    // 「是不是只剩我一个」——那要复制一遍弃牌统计，而复制的判断会和权威分叉。
    //
    // 判的是 settlement.winner_ids，与引擎 revealCards 里那道把关读的是同一个字段。
    // 在此之前这里判的是 settlement.payouts，而权威从来不产出这个字段——整个代码库里
    // payouts 只出现在这一行。于是 can_reveal 恒为假，按钮从未出现过一次，这个功能有
    // 代码、有权威支持、有按钮，却从来没有成功过。
    //
    // 恒假的判断和恒真的断言是同一类东西：都读不出真实状态，都不会红。它还顺带掩护了
    // 客户端那一处缺三个字段的缺陷——按钮永不出现，那条路径就永远不会被走到。所以
    // test/voluntary-reveal.test.cjs 里有一条逐席比对「UI 说行不行」与「权威说行不行」，
    // 而不是只断言赢家那一侧为真：只测真的那一侧时，把判断写成恒真也能过。
    //
    // status 这一道就当前引擎而言是冗余的：finishReason 只在两处赋值，两处都与
    // status = "complete" 同时发生，所以不存在 active + all_others_folded 的状态。变异
    // can-reveal-during-active-hand（把它换成 hand !== null）因此杀不掉，理由记在
    // test-support/mutations/voluntary-reveal.json 的 excluded 里。
    //
    // 保留它是因为这条冗余挡的是最坏的一种失败：谁要是将来为了做一个「正在收摊」的过场
    // 而提前设上 finishReason，can_reveal 就会在牌局进行中变真，而那等于把自己的底牌交给
    // 还在跟注的对手。这道闸门让那件事需要同时改两个字段才会发生。
    can_reveal: hand?.status === "complete"
      && hand?.finish_reason === "all_others_folded"
      && Array.isArray(hand?.settlement?.winner_ids)
      && viewerSeat !== null
      && hand.settlement.winner_ids.includes(viewerSeat.player_id),
    max_text_graphemes: limits?.max_text_graphemes ?? null,
  };
}

function build(input = {}) {
  const {
    roomState = null,
    publicHand = null,
    privateHand = null,
    timeline = [],
    aiStates = {},
    viewerSeatId = null,
    localHidden = { players: [], ais: [], seats: [] },
    pendingIntentCount = 0,
    modelAdapter = null,
    limits = null,
    // 座位旁气泡的退出时刻要靠它算。缺省 null 而不是 Date.now()：本模块不读时钟，
    // 而一个偷偷读时钟的缺省值会让「投影是纯函数」这句话在某些调用路径上不成立。
    // 不传时座位旁一条都不显示，时间线不受影响——宁可少显示，不要显示一份算错时刻的。
    now = null,
  } = input;

  const hidden = {
    players: localHidden.players ?? [],
    ais: localHidden.ais ?? [],
    seats: localHidden.seats ?? [],
  };

  const seats = buildSeats({
    roomState,
    publicHand,
    privateHand,
    viewerSeatId,
    aiStates,
    localHidden: hidden,
  });

  const seatIndexById = new Map(seats.map((seat) => [seat.seat_id, seat.seat_index]));
  const viewerSeat = seats.find((seat) => seat.is_viewer) ?? null;
  const hand = pickHandSource(publicHand, privateHand);

  // 座位旁气泡挂到各席上。先建 messages 再分组：两者必须来自同一份翻译结果，
  // 否则时间线与座位旁会出现两套 late / hidden 判定。
  const messages = buildMessages(timeline, seatIndexById);
  const speechBySeat = buildSeatSpeech(messages, now, new Set(seatIndexById.keys()));
  for (const entry of seats) {
    entry.recent_speech = speechBySeat.get(entry.seat_id) ?? [];
  }

  const view = {
    contract: "tokengame.table-view.v1",
    viewer_seat_id: viewerSeatId,
    room: roomState === null ? null : {
      room_id: roomState.room?.room_id ?? null,
      status: roomState.room?.status ?? null,
      max_seats: roomState.room?.max_seats ?? null,
      table_rules_version: roomState.room?.table_rules_version ?? null,
      hand_index: roomState.hand_index ?? 0,
      hand_active: roomState.hand_active === true,
      first_hand_started: roomState.first_hand_started === true,
      participable_count: roomState.participable_count ?? 0,
      limits_version: roomState.limits_version ?? null,
      // 开局判定整份照抄。UI 要显示「还差一个人 Ready」这类原因，而原因的措辞
      // 必须和权威的判定一致，否则玩家会看到一个不解释当前状态的提示。
      start_decision: roomState.start_decision ?? null,
    },
    hand: hand === null ? null : {
      hand_id: hand.hand_id,
      revision: hand.revision,
      status: hand.status,
      street: hand.street,
      finish_reason: hand.finish_reason ?? null,
      board: hand.board ?? [],
      pot_total: hand.pot_total ?? 0,
      current_bet: hand.current_bet ?? 0,
      blinds: hand.blinds ?? null,
      actor_seat_id: null,
      action_deadline_at: hand.action_deadline_at ?? null,
      settlement: hand.settlement ?? null,
    },
    seats,
    messages,
    action_panel: buildActionPanel({ privateHand, viewerSeat, limits }),
    // 模型适配器的真实状态。没有适配器时必须显示 attached: false——把「本地没有模型」
    // 画成 AI 沉默会让「宿主具备主动唤醒能力」变成一句没有证据的话。
    model_adapter: {
      attached: modelAdapter?.attached === true,
      label: modelAdapter?.label ?? null,
      simulated: modelAdapter?.simulated === true,
    },
    pending_intent_count: pendingIntentCount,
  };

  // actor 的席位。牌局投影只给 actor_player_id，UI 需要的是席位——它按席位渲染。
  if (view.hand !== null && hand.actor_player_id !== null && hand.actor_player_id !== undefined) {
    const actorSeat = seats.find((seat) => seat.player_id === hand.actor_player_id) ?? null;
    view.hand.actor_seat_id = actorSeat?.seat_id ?? null;
  }

  assertNoForbiddenKeys(view);
  return view;
}

// 结构自检。递归找禁止出现的键名，命中就抛——不是打码后放过：一个能出现凭据键的形状
// 说明这条路径会搬运它，下次换个值就真漏出去了。
function assertNoForbiddenKeys(value, path = "view") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      const error = new Error("view_model_forbidden_key");
      error.code = "view_model_forbidden_key";
      // 不带值，只带位置。报告本身不该成为第二次泄漏。
      error.details = { path: `${path}.${key}`, key };
      throw error;
    }
    assertNoForbiddenKeys(item, `${path}.${key}`);
  }
}

module.exports = {
  build,
  graphemeLength,
  seatToPlayer,
  assertNoForbiddenKeys,
  FORBIDDEN_KEYS,
  SPEAKER_TYPES,
  SEAT_SPEECH_TTL_MS,
  MAX_SEAT_SPEECH,
  // 导出是为了让「归属只挂到真实席位」这条能被直接观察。经 build() 只看得到
  // view.seats，而挂到一个不存在的席位键上时那里恰好什么都不显示——一个查不到的缺陷。
  buildSeatSpeech,
};
