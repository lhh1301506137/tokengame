"use strict";
/*
  牌桌客户端。

  这个文件刻意保持"哑"：它不知道德州扑克的规则，不判断谁该行动，不算合法动作，也不算
  底池。所有这些都从 /api/view 的 tokengame.table-view.v1 契约里读，权威怎么说就怎么画。
  理由不是省事——一旦页面自己算一份，它就会和权威分叉，而分叉的那一刻玩家看到的牌桌
  就不再是真的那一桌。

  它也拿不到席位凭据。浏览器手上只有一个会话令牌，凭据留在本机协调器进程里（F6）。
  所以这里没有任何 localStorage 写入：会话令牌只存在内存中，刷新页面等于新连接，
  要恢复席位得走协调器的 /api/session/resume。
*/

// ---- 状态 ----

const state = {
  sessionToken: null,
  connectionId: null,
  seatId: null,
  view: null,
  polling: null,
  disconnected: false,
  // 上一次渲染时时间线的长度，用来决定要不要把滚动条推到底。
  lastMessageCount: 0,
};

const el = (id) => document.getElementById(id);

// 字素计数。String.length 会把家庭 emoji 算成 11，于是 140 上限在输入框这一侧
// 可以被轻易绕过——权威会拒，但玩家看到的是一个没解释的失败。
const segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("und", { granularity: "grapheme" })
  : null;

function graphemeLength(text) {
  if (segmenter === null) return [...text].length;
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}

// ---- 与协调器通信 ----

async function post(route, body) {
  const response = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`协调器返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.code ?? `http_${response.status}`);
    error.code = payload.code ?? `http_${response.status}`;
    error.details = payload.details ?? null;
    throw error;
  }
  return payload;
}

// 动作一律经 /api/action。协调器按白名单把关，并注入席位句柄——页面既不知道
// 自己的凭据，也无法替别席行动。
function act(command, params = {}) {
  return post("/api/action", { session_token: state.sessionToken, command, params });
}

// 错误码到人话。看不懂的码原样显示：编一句更顺的话会把真实原因藏起来。
const MESSAGES = {
  invite_code_unknown: "邀请码不对，或这一桌已经关了。",
  room_full: "座位满了。",
  public_scope_not_confirmed: "要先确认公开范围才能继续。",
  seat_not_connected: "这一席当前不在线。",
  not_your_turn: "还没轮到你。",
  stale_revision: "牌桌刚刚变了，已经刷新，请再看一眼。",
  hand_not_found: "这一手已经结束了。",
  message_too_long: "超过 140 个字了。",
  rate_limited: "说得太快了，等一下再说。",
  player_hand_quota_exhausted: "这一手你的发言次数用完了。",
  seat_ai_off: "你的座位 AI 现在是关闭状态。",
  web_session_unknown: "会话已失效，请重新加入。",
  seat_credential_revoked: "这个座位已经不在你名下了（已离桌，或掉线超过保留时间被释放）。",
  seat_not_found: "这个座位已经不存在了。",
  core_unreachable: "连不上权威内核。它可能没在跑。",
  credential_leak: "协调器检测到凭据可能外泄，已经拦下这次响应。这是本机缺陷，请报告。",
  local_bridge_auth_unresolved: "本机桥接认证尚未设计完成，拒绝对外监听。",
  action_not_permitted: "这个操作不允许从浏览器发起。",
};

function explain(error) {
  const code = error?.code ?? error?.message ?? "unknown_error";
  return MESSAGES[code] ?? `操作失败：${code}`;
}

function showError(node, error) {
  node.textContent = explain(error);
  node.hidden = false;
}

function clearError(node) {
  node.textContent = "";
  node.hidden = true;
}

// ---- 入口 ----

el("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError(el("entry-error"));
  const playerId = el("create-player").value.trim();
  if (playerId === "") return;
  try {
    const result = await post("/api/room/create", {
      player_id: playerId,
      table_rules_version: "table-rules-v1",
    });
    enterTable(result);
  } catch (error) {
    showError(el("entry-error"), error);
  }
});

el("join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError(el("entry-error"));
  const playerId = el("join-player").value.trim();
  const inviteCode = el("join-code").value.trim();
  if (playerId === "" || inviteCode === "") return;
  try {
    const result = await post("/api/room/join", {
      player_id: playerId,
      invite_code: inviteCode,
    });
    enterTable(result);
  } catch (error) {
    showError(el("entry-error"), error);
  }
});

function enterTable(result) {
  state.sessionToken = result.session_token;
  state.connectionId = result.connection_id ?? null;
  state.seatId = result.seat_id ?? null;
  el("entry-view").hidden = true;
  el("table-main").hidden = false;
  if (typeof result.invite_code === "string") {
    el("invite-code").textContent = result.invite_code;
  } else {
    el("invite-wrap").hidden = true;
  }
  setConnState("connected", "已连接");
  startPolling();
}

function setConnState(kind, text) {
  const node = el("conn-state");
  node.dataset.state = kind;
  node.textContent = text;
}

// ---- 轮询 ----
//
// 轮询而不是推送。这一层是 MVP：一个 700ms 的 GET 循环足够让一桌四个人看到彼此的
// 动作，而 SSE 或 WebSocket 会在协调器上多出一套连接生命周期，那套东西的失败模式
// （半开连接、重连风暴）现在没有测试能覆盖。等有了推送的验收标准再换。

function startPolling() {
  if (state.polling !== null) return;
  refresh();
  state.polling = setInterval(refresh, 700);
}

function stopPolling() {
  if (state.polling === null) return;
  clearInterval(state.polling);
  state.polling = null;
}

async function refresh() {
  if (state.sessionToken === null) return;
  try {
    const result = await post("/api/view", { session_token: state.sessionToken });
    state.view = result.view;
    clearError(el("global-error"));
    render(result.view);
  } catch (error) {
    // 会话终结要停下来，否则会一秒一次地刷同一个错误——每一次还是一条控制台 403。
    // seat_credential_revoked 不只在自愿离桌时出现：掉线满 120 秒后座位被释放，
    // 那个还开着的标签页会一直撞在这个码上。两种情况的正确收尾都是回到入口。
    if (TERMINAL_SESSION_CODES.includes(error.code)) {
      returnToEntry(explain(error));
      return;
    }
    showError(el("global-error"), error);
  }
}

const TERMINAL_SESSION_CODES = [
  "web_session_unknown",
  "seat_credential_revoked",
  "seat_not_found",
];

// ---- 渲染 ----

function render(view) {
  renderScopeGate(view);
  renderRoom(view);
  renderBoard(view);
  renderSeats(view);
  renderActions(view);
  renderSeatControls(view);
  renderTimeline(view);
}

function renderScopeGate(view) {
  const me = view.seats.find((seat) => seat.is_viewer) ?? null;
  // public_scope_confirmed 只在自己那一席上有值。null 表示"还不知道"，不当作未确认——
  // 那会在视图刚建立的一瞬间闪一下对话框。
  const needsConfirm = me !== null && me.public_scope_confirmed === false;
  el("scope-gate").hidden = !needsConfirm;
}

el("scope-accept").addEventListener("click", async () => {
  clearError(el("scope-error"));
  try {
    await act("room.confirm_public_scope", { acknowledged: true });
    await refresh();
  } catch (error) {
    showError(el("scope-error"), error);
  }
});

// 回到入口。离桌、拒绝确认、以及座位被权威释放都走这一条：这三种情况的共同点是
// 本机会话已经没有对应的座位了，继续留在牌桌画面上只会显示一份不再更新的旧快照。
function returnToEntry(message) {
  stopPolling();
  state.sessionToken = null;
  state.connectionId = null;
  state.seatId = null;
  state.view = null;
  state.disconnected = false;
  el("table-main").hidden = true;
  el("entry-view").hidden = false;
  el("invite-wrap").hidden = false;
  setConnState("idle", "未连接");
  if (typeof message === "string" && message !== "") {
    const node = el("entry-error");
    node.textContent = message;
    node.hidden = false;
  }
}

el("scope-decline").addEventListener("click", async () => {
  // 不确认就直接离桌。留在桌上但不确认会占着一个座位，而规则 1 要求确认在进桌之前。
  try {
    await act("seat.leave", {});
  } catch {
    // 离桌失败也要回到入口：本机会话已经没有意义了。
  }
  returnToEntry("");
});

function renderRoom(view) {
  const room = view.room;
  el("room-id").textContent = room?.room_id ?? "—";
  el("hand-index").textContent = String(room?.hand_index ?? 0);

  // 开局判定的 reason 整个照抄权威，页面只负责把那个词翻成人话。自己拼一句
  // "还差一个人"会在开局规则变化时说错话，而玩家看到的解释必须和权威的判定一致。
  el("start-reason").textContent = describeStart(room?.start_decision ?? null, room);

  const adapter = view.model_adapter;
  if (adapter.attached !== true) {
    // 未接入就说未接入。把"本机没有模型"画成"AI 选择了沉默"是不能做的那种冒充。
    el("adapter-state").textContent = "未接入";
  } else {
    el("adapter-state").textContent = adapter.simulated === true
      ? `${adapter.label ?? "适配器"}（模拟）`
      : (adapter.label ?? "已接入");
  }
}

// 权威给的 reason 是一组固定词（room-store.cjs 的 evaluateStart）。这里只做措辞映射，
// 不合成第三种状态。倒计时用 remaining_ms，权威没给就不显示秒数——自己按 starts_at
// 减本地时钟会因为时钟偏差显示错。
const START_REASONS = {
  hand_in_progress: "进行中",
  awaiting_ready: "等待其他人准备",
  ready_withdrawn: "有人撤回了准备",
  insufficient_participants: "在座人数不足",
  inter_hand_display: "结算展示中",
  ready_countdown: "准备完成，即将开始",
  ready_countdown_elapsed: "即将开始",
  auto_next_hand: "下一手即将开始",
};

function describeStart(decision, room) {
  if (decision === null) return room?.hand_active === true ? "进行中" : "等待";
  const words = START_REASONS[decision.reason] ?? decision.reason ?? "等待";
  const remaining = decision.remaining_ms;
  if (typeof remaining === "number" && remaining > 0) {
    return `${words}（${Math.ceil(remaining / 1000)} 秒）`;
  }
  return words;
}

function cardNode(code) {
  const li = document.createElement("li");
  li.className = "card-face";
  if (typeof code !== "string" || code.length < 2) {
    li.classList.add("back");
    li.textContent = "?";
    li.setAttribute("aria-label", "暗牌");
    return li;
  }
  const rank = code.slice(0, -1);
  const suit = code.slice(-1).toLowerCase();
  li.dataset.suit = suit;
  const glyph = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] ?? suit;
  li.textContent = `${rank}${glyph}`;
  li.setAttribute("aria-label", `${rank} ${{ s: "黑桃", h: "红桃", d: "方块", c: "梅花" }[suit] ?? suit}`);
  return li;
}

function renderBoard(view) {
  const board = el("board");
  board.replaceChildren(...(view.hand?.board ?? []).map(cardNode));
  el("pot-total").textContent = String(view.hand?.pot_total ?? 0);
  const streetNames = {
    preflop: "翻牌前", flop: "翻牌", turn: "转牌", river: "河牌", complete: "已结算",
  };
  const street = view.hand?.street ?? null;
  el("street").textContent = street === null ? "—" : (streetNames[street] ?? street);
}

function tag(text, kind) {
  const span = document.createElement("span");
  span.className = `tag ${kind}`;
  span.textContent = text;
  return span;
}

// 一个座位 = 玩家 + 他的 AI，上下相邻同一张卡片里。这不是排版偏好：验收要求
// "玩家和他的 AI 在同一座位相邻"，因为公开发言必须能立刻看出是谁说的——把 AI 的
// 发言归到一个独立的"AI 列表"里，玩家就得靠记名字来对应。
function seatNode(seat, view) {
  const li = document.createElement("li");
  li.className = "seat";
  li.dataset.seatId = seat.seat_id;
  li.dataset.viewer = String(seat.is_viewer);
  li.dataset.actor = String(seat.is_actor);
  li.dataset.folded = String(seat.hand_status === "folded");
  li.dataset.hiddenSeat = String(seat.locally_hidden.seat);

  const head = document.createElement("div");
  head.className = "seat-head";
  const name = document.createElement("span");
  name.className = "seat-name";
  // 整席被本地隐藏时连名字一起隐去，但保留"第 N 席"，否则座位会变成一个无法指认的空块。
  name.textContent = seat.locally_hidden.seat ? "（此席已隐藏）" : seat.player_id;
  head.append(name);

  const index = document.createElement("span");
  index.className = "seat-index";
  index.textContent = `第 ${seat.seat_index + 1} 席`;
  head.append(index);

  if (seat.is_viewer) head.append(tag("你", "you"));
  if (seat.is_dealer) head.append(tag("D", "dealer"));
  if (seat.is_small_blind) head.append(tag("小盲", "sb"));
  if (seat.is_big_blind) head.append(tag("大盲", "bb"));
  if (seat.is_actor) head.append(tag("行动中", "actor"));
  if (seat.all_in) head.append(tag("全下", "allin"));
  if (seat.hand_status === "folded") head.append(tag("已弃牌", "sitout"));
  // 掉线、暂离、离桌三种状态各自成标，不合并成一个"不可用"：它们的后果不同，
  // 掉线会在 120 秒后被释放，暂离是本手后自愿离席。
  if (!seat.connected) head.append(tag("掉线", "offline"));
  if (seat.sit_out_after_hand) head.append(tag("本手后暂离", "sitout"));
  if (seat.leave_requested) head.append(tag("离桌中", "leaving"));
  li.append(head);

  if (typeof seat.retention_remaining_ms === "number") {
    const retention = document.createElement("p");
    retention.className = "retention";
    retention.textContent = `保留 ${Math.ceil(seat.retention_remaining_ms / 1000)} 秒，之后释放座位`;
    li.append(retention);
  }

  const chips = document.createElement("div");
  chips.className = "seat-chips";
  chips.append(labeled("筹码", seat.stack), labeled("本手投入", seat.committed_this_hand));
  // 账本值只在与手内余额不同时才显示，否则手间会出现两个一样的数。
  if (seat.ledger_stack !== seat.stack) {
    chips.append(labeled("本手开始时", seat.ledger_stack));
  }
  li.append(chips);

  const hole = document.createElement("ul");
  hole.className = "seat-hole";
  hole.setAttribute("aria-label", seat.is_viewer ? "你的底牌" : `${seat.player_id} 的底牌`);
  if (Array.isArray(seat.hole_cards)) {
    hole.replaceChildren(...seat.hole_cards.map(cardNode));
  } else if (seat.in_hand) {
    // 别人的底牌画成两张暗牌。不画会让"他还在这手牌里"这件事从画面上消失。
    hole.replaceChildren(cardNode(null), cardNode(null));
  }
  li.append(hole);

  li.append(aiRow(seat));
  li.append(hideRow(seat));
  return li;
}

function labeled(label, value) {
  const wrap = document.createElement("span");
  const l = document.createElement("span");
  l.className = "label";
  l.textContent = label;
  const n = document.createElement("span");
  n.className = "n";
  n.textContent = String(value);
  wrap.append(l, document.createTextNode(" "), n);
  return wrap;
}

// AI 那一行。状态词直接来自权威（IDLE / THINKING / DEGRADED / OFFLINE / OFF），
// 页面不合成第三个词——"AI 好像卡住了"这种猜测会让玩家以为是自己的网络问题。
const AI_STATUS = {
  IDLE: "空闲",
  THINKING: "思考中",
  DEGRADED: "降级",
  OFFLINE: "离线",
  OFF: "已关闭",
};

function aiRow(seat) {
  const row = document.createElement("div");
  row.className = "seat-ai-row";
  // 文字徽标而不是色块。只靠颜色区分玩家与 AI，对色盲用户等于没有区分。
  const badge = document.createElement("span");
  badge.className = "ai-badge";
  badge.textContent = "AI";
  row.append(badge);

  const label = document.createElement("span");
  if (seat.locally_hidden.ai || seat.locally_hidden.seat) {
    label.className = "hidden-note";
    label.textContent = "这个 AI 已在你这一侧隐藏";
  } else if (seat.ai.mode === "OFF") {
    label.textContent = "玩家已关闭座位 AI";
  } else {
    const status = AI_STATUS[seat.ai.status] ?? seat.ai.status ?? "—";
    label.textContent = seat.ai.active ? "思考中…" : status;
    if (typeof seat.ai.hand_quota_remaining === "number") {
      label.textContent += `　本手余 ${seat.ai.hand_quota_remaining} 次发言`;
    }
  }
  row.append(label);

  if (seat.ai.active) row.append(tag("THINKING", "thinking"));
  else if (seat.ai.status === "DEGRADED") row.append(tag("DEGRADED", "degraded"));
  else if (seat.ai.status === "OFFLINE") row.append(tag("OFFLINE", "offline"));
  else if (seat.ai.mode === "OFF") row.append(tag("OFF", "off"));
  return row;
}

// 本地隐藏的三个开关。规则 7：只影响这一个查看者的渲染，不改配额、不改权威时间线。
function hideRow(seat) {
  const row = document.createElement("div");
  row.className = "seat-hide-row";
  if (seat.is_viewer) {
    // 不给自己提供隐藏按钮。隐藏自己没有意义，而"隐藏整席"会把自己的底牌和行动
    // 按钮一起藏掉，那是一个只会误触的功能。
    return row;
  }
  row.append(
    hideButton("隐藏玩家", "取消隐藏玩家", "player", seat.player_id, seat.locally_hidden.player),
    hideButton("隐藏 AI", "取消隐藏 AI", "ai", seat.seat_id, seat.locally_hidden.ai),
    hideButton("隐藏整席", "取消隐藏整席", "seat", seat.seat_id, seat.locally_hidden.seat),
  );
  return row;
}

function hideButton(onText, offText, target, targetId, isHidden) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost tiny";
  button.textContent = isHidden ? offText : onText;
  button.setAttribute("aria-pressed", String(isHidden));
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await act("ai.hide_local", { target, target_id: targetId, hidden: !isHidden });
      await refresh();
    } catch (error) {
      showError(el("global-error"), error);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function renderSeats(view) {
  el("seats").replaceChildren(...view.seats.map((seat) => seatNode(seat, view)));
}

// ---- 行动 ----
//
// 按钮完全由 legal_actions 生成。页面不判断"我能不能过牌"——那要复制一遍下注轮的
// 状态机，而复制出来的那一份会和权威分叉。权威没给的动作就没有按钮。

const ACTION_LABELS = {
  fold: "弃牌",
  check: "过牌",
  call: "跟注",
  bet: "下注",
  raise: "加注",
  all_in: "全下",
};

function renderActions(view) {
  const panel = view.action_panel;
  const row = el("action-buttons");
  const raiseRow = el("raise-row");

  if (!panel.is_actor || panel.legal_actions.length === 0) {
    row.replaceChildren();
    raiseRow.hidden = true;
    el("action-deadline").textContent = panel.is_actor ? "" : "";
    return;
  }

  const nodes = [];
  let sizing = null;
  for (const action of panel.legal_actions) {
    if (action.type === "bet" || action.type === "raise") {
      // 需要金额的动作不做成一键按钮：一键会替玩家选一个数，而选错数在无限注里
      // 就是选错了整手牌。点开尺寸输入框，由玩家自己填。
      sizing = action;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "ghost";
      open.textContent = ACTION_LABELS[action.type] ?? action.type;
      // 和其余动作按钮一样标出动作名。少了这个，"下注"和"加注"在 DOM 里就只能靠
      // 中文标签指认，而标签是给人看的、会改。
      open.dataset.action = action.type;
      open.addEventListener("click", () => openSizing(action, panel));
      nodes.push(open);
      continue;
    }
    nodes.push(simpleActionButton(action, panel));
  }
  row.replaceChildren(...nodes);
  if (sizing === null) raiseRow.hidden = true;

  const deadline = panel.action_deadline_at;
  el("action-deadline").textContent = typeof deadline === "number"
    ? `该你行动。权威给的截止时刻：${new Date(deadline).toLocaleTimeString("zh-CN")}`
    : "该你行动。";
}

function simpleActionButton(action, panel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action.type === "fold" ? "ghost" : "primary";
  const label = ACTION_LABELS[action.type] ?? action.type;
  // 跟注与全下把金额写在按钮上。玩家点之前必须知道这一下要付多少。
  const amount = typeof action.amount === "number" ? action.amount : null;
  const to = typeof action.to === "number" ? action.to : null;
  button.textContent = amount !== null ? `${label} ${amount}`
    : to !== null ? `${label} 到 ${to}` : label;
  button.dataset.action = action.type;
  button.addEventListener("click", () => submitAction(action.type, to, panel, button));
  return button;
}

function openSizing(action, panel) {
  const raiseRow = el("raise-row");
  const input = el("raise-amount");
  const minTo = typeof action.min_to === "number" ? action.min_to : null;
  const maxTo = typeof action.max_to === "number" ? action.max_to : null;
  raiseRow.hidden = false;
  raiseRow.dataset.action = action.type;
  if (minTo !== null) input.min = String(minTo);
  if (maxTo !== null) input.max = String(maxTo);
  input.value = minTo === null ? "" : String(minTo);
  el("raise-bounds").textContent = minTo !== null && maxTo !== null
    ? `${minTo} — ${maxTo}`
    : "";
  input.focus();
}

el("raise-submit").addEventListener("click", () => {
  const panel = state.view?.action_panel ?? null;
  if (panel === null) return;
  const type = el("raise-row").dataset.action ?? "raise";
  const to = Number.parseInt(el("raise-amount").value, 10);
  if (!Number.isFinite(to)) return;
  submitAction(type, to, panel, el("raise-submit"));
});

// F2：提交必须带 hand_id 与 expected_revision，并且带一个幂等键。三者都来自权威投影。
// 幂等键把"网络重发"和"玩家真的又点了一次"区分开——没有它，一次重发就是一次重复下注。
async function submitAction(type, to, panel, button) {
  button.disabled = true;
  try {
    const params = {
      hand_id: panel.hand_id,
      expected_revision: panel.expected_revision,
      action: type,
      idempotency_key: `${panel.hand_id}:${panel.expected_revision}:${type}:${to ?? ""}`,
    };
    // 命令面收的是 amount，而它的语义是"下注/加注后的目标总额"，不是增量——
    // holdem.cjs 的 requireLegalAction 拿它直接对 min_to / max_to 比。所以
    // legal_actions 里的 min_to/max_to 与这里的 amount 是同一个尺度。
    if (typeof to === "number") params.amount = to;
    await act("hand.act", params);
    el("raise-row").hidden = true;
    clearError(el("global-error"));
    await refresh();
  } catch (error) {
    showError(el("global-error"), error);
    // 版本过期说明别人先动了。刷新一次就能拿到新的 expected_revision。
    if (error.code === "stale_revision") await refresh();
  } finally {
    button.disabled = false;
  }
}

// ---- 座位控制 ----

function renderSeatControls(view) {
  const me = view.seats.find((seat) => seat.is_viewer) ?? null;
  const readyBtn = el("ready-toggle");
  const sitoutBtn = el("sitout-toggle");
  const aiBtn = el("ai-toggle");

  if (me === null) {
    for (const button of [readyBtn, sitoutBtn, aiBtn]) button.disabled = true;
    return;
  }

  const isReady = me.state === "READY";
  const isSatOut = me.state === "SIT_OUT";
  // 暂离之后回到牌桌走的就是这个按钮（setReady 会把 sit_out_after_hand 清掉），
  // 所以手内也不能禁用它——禁用等于把暂离变成不可逆。
  readyBtn.textContent = isSatOut ? "回到牌桌" : isReady ? "撤回准备" : "我准备好了";
  readyBtn.setAttribute("aria-pressed", String(isReady));
  readyBtn.disabled = me.leave_requested === true;

  // 暂离是单向命令：权威没有"取消暂离"这条路，回来只能靠 Ready。所以这里不做成
  // 开关——一个点了没反应的"取消"按钮比没有按钮更糟。
  sitoutBtn.textContent = me.sit_out_after_hand ? "已排定：本手后暂离"
    : isSatOut ? "已暂离" : "本手后暂离";
  sitoutBtn.disabled = me.sit_out_after_hand === true || isSatOut || me.leave_requested === true;

  aiBtn.textContent = me.ai.mode === "OFF" ? "打开我的座位 AI" : "关闭我的座位 AI";
  aiBtn.setAttribute("aria-pressed", String(me.ai.mode === "OFF"));

  el("reveal-btn").hidden = view.action_panel.can_reveal !== true;
  el("simulate-disconnect").hidden = state.disconnected;
  el("simulate-reconnect").hidden = !state.disconnected;
}

function wireControl(id, handler) {
  el(id).addEventListener("click", async () => {
    const button = el(id);
    button.disabled = true;
    try {
      await handler();
      clearError(el("global-error"));
      await refresh();
    } catch (error) {
      showError(el("global-error"), error);
    } finally {
      button.disabled = false;
    }
  });
}

wireControl("ready-toggle", () => {
  const me = state.view?.seats.find((seat) => seat.is_viewer) ?? null;
  return act("seat.ready", { ready: me?.state !== "READY" });
});

wireControl("sitout-toggle", () => act("seat.sit_out_after_hand", {}));

wireControl("ai-toggle", () => {
  const me = state.view?.seats.find((seat) => seat.is_viewer) ?? null;
  return act("ai.set_mode", { mode: me?.ai.mode === "OFF" ? "ON" : "OFF" });
});

wireControl("reveal-btn", () => {
  const panel = state.view?.action_panel ?? null;
  return act("hand.reveal", { hand_id: panel?.hand_id });
});

el("leave-btn").addEventListener("click", async () => {
  // 离桌是不可逆的（座位会被释放，凭据作废），所以要一次确认。
  if (!window.confirm("离桌后这个座位会被释放，筹码结算按当前状态处理。确定离桌？")) return;
  try {
    await act("seat.leave", {});
    // 离桌之后本机会话手里的席位凭据立刻作废，再拉视图只会拿到 403。所以这里必须
    // 收摊回入口，而不是 refresh()——后者会让页面停在一份不再更新的旧快照上，
    // 并且每 700 毫秒往控制台打一条 403。
    returnToEntry("你已离桌。");
  } catch (error) {
    showError(el("global-error"), error);
  }
});

// 掉线与恢复。真实掉线是关掉标签页，但那样就没法在同一个页面里演示 120 秒保留窗，
// 所以给一个显式按钮：它调的是协调器真正的 disconnect/resume，不是画一个假状态。
el("simulate-disconnect").addEventListener("click", async () => {
  try {
    await post("/api/session/disconnect", {
      session_token: state.sessionToken,
      connection_id: state.connectionId,
    });
    state.disconnected = true;
    stopPolling();
    setConnState("offline", "已掉线（保留窗内可恢复）");
    el("simulate-disconnect").hidden = true;
    el("simulate-reconnect").hidden = false;
  } catch (error) {
    showError(el("global-error"), error);
  }
});

el("simulate-reconnect").addEventListener("click", async () => {
  try {
    const result = await post("/api/session/resume", { session_token: state.sessionToken });
    state.connectionId = result.connection_id ?? state.connectionId;
    state.disconnected = false;
    setConnState("connected", "已连接");
    el("simulate-reconnect").hidden = true;
    el("simulate-disconnect").hidden = false;
    startPolling();
  } catch (error) {
    showError(el("global-error"), error);
  }
});

// ---- 时间线 ----

function bubbleNode(message, view) {
  const li = document.createElement("li");
  li.className = "bubble";
  li.dataset.speaker = message.speaker_type;
  li.dataset.hidden = String(message.hidden === true);
  li.dataset.late = String(message.late === true);

  const head = document.createElement("div");
  head.className = "bubble-head";

  const who = document.createElement("span");
  who.className = "bubble-who";
  who.textContent = message.player_id ?? "—";
  head.append(who);

  const seatLabel = document.createElement("span");
  seatLabel.textContent = message.seat_index === null || message.seat_index === undefined
    ? "" : `第 ${message.seat_index + 1} 席`;
  head.append(seatLabel);

  // AI 发言必须带一个文字标记。规则 4 要求 AI 的公开发言可与玩家区分，而"可区分"
  // 不能只靠气泡颜色——截图、高对比度模式、色盲用户那里颜色都可能丢。
  if (message.speaker_type === "SEAT_AI") {
    const badge = document.createElement("span");
    badge.className = "ai-badge";
    badge.textContent = "AI";
    head.append(badge);
  }

  // 迟到标注也照抄权威给的 based_on_street，不自己拿当前街去比。
  if (message.late === true) {
    const street = { preflop: "翻牌前", flop: "翻牌", turn: "转牌", river: "河牌" };
    const basis = street[message.based_on_street] ?? message.based_on_street;
    head.append(tag(basis ? `延迟 · 基于${basis}` : "延迟", "late"));
  }

  li.append(head);

  const note = document.createElement("span");
  note.className = "hidden-note";
  note.textContent = message.speaker_type === "SEAT_AI"
    ? "（这条 AI 发言已被你隐藏）"
    : "（这条发言已被你隐藏）";
  li.append(note);

  const text = document.createElement("p");
  text.className = "bubble-text";
  // textContent 而不是 innerHTML。发言是别人输入的文本，拼进 HTML 就是一个注入口。
  text.textContent = message.text;
  li.append(text);
  return li;
}

function renderTimeline(view) {
  const list = el("timeline");
  // 只在原本已经贴底时才自动滚到底。玩家往上翻看历史时被拽回来会很烦。
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.replaceChildren(...view.messages.map((message) => bubbleNode(message, view)));
  if (atBottom || view.messages.length !== state.lastMessageCount) {
    list.scrollTop = list.scrollHeight;
  }
  state.lastMessageCount = view.messages.length;

  const max = view.action_panel.max_text_graphemes;
  const input = el("say-text");
  input.dataset.max = max === null ? "" : String(max);
  updateCounter();
}

function updateCounter() {
  const input = el("say-text");
  const max = Number.parseInt(input.dataset.max ?? "140", 10);
  const limit = Number.isFinite(max) ? max : 140;
  const used = graphemeLength(input.value);
  const counter = el("say-counter");
  counter.textContent = `${used}/${limit}`;
  counter.dataset.over = String(used > limit);
  el("say-submit").disabled = used === 0 || used > limit;
}

el("say-text").addEventListener("input", updateCounter);

el("say-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError(el("say-error"));
  const input = el("say-text");
  const text = input.value;
  if (graphemeLength(text) === 0) return;
  el("say-submit").disabled = true;
  try {
    await act("chat.say", {
      text,
      idempotency_key: `say-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    input.value = "";
    updateCounter();
    await refresh();
  } catch (error) {
    showError(el("say-error"), error);
  } finally {
    el("say-submit").disabled = false;
  }
});

el("copy-invite").addEventListener("click", async () => {
  const code = el("invite-code").textContent ?? "";
  try {
    await navigator.clipboard.writeText(code);
    el("copy-invite").textContent = "已复制";
    setTimeout(() => { el("copy-invite").textContent = "复制"; }, 1500);
  } catch {
    // 剪贴板权限被拒是常见情况，不当错误报。邀请码本来就 user-select: all，可以手选。
    el("copy-invite").textContent = "请手动复制";
  }
});

updateCounter();
