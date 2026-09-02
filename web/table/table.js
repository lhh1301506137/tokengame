"use strict";
/*
  牌桌客户端。

  这个文件刻意保持"哑"：它不知道德州扑克的规则，不判断谁该行动，不算合法动作，也不算
  底池。所有这些都从 /api/view 的 tokengame.table-view.v1 契约里读，权威怎么说就怎么画。
  理由不是省事——一旦页面自己算一份，它就会和权威分叉，而分叉的那一刻玩家看到的牌桌
  就不再是真的那一桌。

  它拿不到核心席位凭据。浏览器持续保存的权限只有真人会话令牌；逐席 AI 受限令牌
  只经用户确认后的临时下载交付，不进入页面状态。核心凭据留在协调器进程里（F6）。

  会话令牌存在 sessionStorage，不存 localStorage，也不进 URL。三者的差别正是这里要的：
  - localStorage 跨标签页、跨会话长期留存，等于把一份能代表席位行动的东西留在磁盘上，
    关掉浏览器再打开还在——而席位早就被释放了，留着只剩泄漏面。
  - URL 会进浏览历史、进 Referer、进用户随手贴出去的截图，是最差的一种。
  - sessionStorage 的生命周期恰好是「这一个标签页」：刷新保留，关标签页即清。而这正是
    要区分的两件事——刷新是普通中断，要回到原座位；关标签页是离开，该走连接租约到期。

  为什么必须留：会话令牌只存在内存时，刷新页面浏览器就再也说不出自己是谁，只能回到入口
  等 120 秒保留窗走完，而协调器那边席位、凭据、托管绑定一样没丢。那违反已确认用户结果
  「在宿主任务、页面或网络发生普通中断后，让玩家恢复原游戏会话、原房间和原座位」
  （PROJECT-DECISION-LOG.md 的 TG-L2 SESSION-LAUNCH included 第五条）。存储形式本身
  不是产品语义——同一条记录的 excluded 明确不冻结席位凭据的存储目录与 URL 形式。
*/

// ---- 状态 ----

const state = {
  sessionToken: null,
  connectionId: null,
  seatId: null,
  view: null,
  polling: null,
  // 当前那次轮询的中止句柄。stopPolling 要掐的不只是「下一次」，还有「这一次」——
  // 理由写在 stopPolling 里。
  pollAbort: null,
  // 通知/授权控制前后的屏障：旧轮询不能覆盖较新的控制回执或恢复旧绑定。
  viewGeneration: 0,
  disconnected: false,
  // 上一次渲染时时间线的长度，用来决定要不要把滚动条推到底。
  lastMessageCount: 0,
  // 待落座的入口。填了表但还没确认公开范围时停在这里：房间和座位都还没建。
  // 规则 1 要求确认在绑定之前，所以这份意图必须能在「什么都还没创建」的状态下存在。
  //
  // 刻意只放在内存里，不进 sessionStorage：没确认就什么都没建，刷新之后没有任何东西
  // 需要恢复，重新填一次表才是对的。存下来反而会让「刷新后弹出一个说不清来源的对话框」。
  pendingEntry: null,
  // 纯本地工作面；切换不改变席位、绑定、授权或轮询。
  workspace: "game",
};

const el = (id) => document.getElementById(id);
let wakeControls = null;
// 可选模块未到达时授权请求也能进行。票据只记录本标签页的在途传输，
// 不代表服务器模式或绑定事实；交叠请求必须全部完成后才能解除通知表单屏障。
const wakeAuthorizationOperations = new Set();
let wakePauseTicket = null;

// ---- 会话令牌的标签页级留存 ----

const SESSION_STORAGE_KEY = "tokengame.table.session_token";

// sessionStorage 在少数环境里会抛（隐私模式、被策略禁用）。抛了就退回纯内存：刷新恢复
// 不成立，但牌桌照常能玩。用 try 包住而不是先查 typeof，因为存在与可写是两件事。
function rememberSession(token) {
  try {
    if (typeof token === "string" && token !== "") {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // 无处可存。下一次刷新会回到入口，这是降级而不是错误。
  }
}

function recallSession() {
  try {
    const token = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}

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

async function post(route, body, { signal } = {}) {
  const response = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
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
    error.status = response.status;
    error.details = payload.details ?? null;
    throw error;
  }
  return payload;
}

// 动作一律经 /api/action。协调器按白名单把关，并注入席位句柄——页面既不知道
// 自己的凭据，也无法替别席行动。
function act(command, params = {}) {
  const guarded = command === "ai.set_mode" || command === "seat.leave";
  const ticket = guarded ? pauseWakeControls(command === "seat.leave" ? "正在离桌" : "正在更改本席 AI 状态") : null;
  const result = post("/api/action", { session_token: state.sessionToken, command, params });
  return guarded ? result.finally(() => resumeWakeControls(ticket)) : result;
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
  model_command_route_disabled: "这个入口未开启 AI 绑定，请使用 npm run beta 启动。",
  model_binding_changed: "本席 AI 权限已变化，这次旧请求已失效。请刷新后重试。",
  model_binding_request_conflict: "这次下载请求已过期。请刷新页面，重新确认并下载。",
  model_binding_history_full: "本会话的连接换发次数已用完；可继续手动打牌，结束本次参与后重新入座再连接 AI。",
  model_connection_invalid: "连接文件响应无效，未下载。请重试或报告问题。",
  secure_random_unavailable: "浏览器不支持安全随机数，无法建立 AI 连接。请使用本机回环地址打开。",
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

// 入口键。一次入口意图一个键，重试沿用同一个。
//
// 它换得回一个会话令牌，所以按凭据对待：不进 URL、不进 sessionStorage、不显示在页面上。
// randomUUID 在非安全上下文里可能没有，退回一个够长的随机串——协调器只要求长度下界。
function newEntryKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `entry-${globalThis.crypto.randomUUID()}`;
  }
  // 退路刻意也够长（32 字符 + 前缀）。Math.random 不是密码学随机源，但这条分支只在
  // 非安全上下文里成立，而那种环境下 loopback 页面本身就已经不是可信通道了。
  let out = "entry-";
  for (let i = 0; i < 32; i += 1) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

// 填完表先弹确认，什么都不建。
//
// 改这个顺序之前：提交表单 -> POST create/join -> 座位建好、凭据发出、公开时间线里
// 落下 SEAT_BOUND -> 然后才弹对话框；点「先不加入」走一次 seat.leave 把刚占的座还掉。
// 玩家在读到那段说明之前，绑定已经完成了。合同要的是反过来：确认在绑定之前。
function stageEntry(kind, body) {
  clearError(el("entry-error"));
  clearError(el("scope-error"));
  state.pendingEntry = { kind, body, key: newEntryKey() };
  el("scope-gate").hidden = false;
  el("scope-accept").focus();
}

el("create-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const playerId = el("create-player").value.trim();
  if (playerId === "") return;
  stageEntry("create", { player_id: playerId, table_rules_version: "table-rules-v1" });
});

el("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const playerId = el("join-player").value.trim();
  const inviteCode = el("join-code").value.trim();
  if (playerId === "" || inviteCode === "") return;
  stageEntry("join", { player_id: playerId, invite_code: inviteCode });
});

function enterTable(result) {
  state.sessionToken = result.session_token;
  wakeControls?.setSession(state.sessionToken);
  state.connectionId = result.connection_id ?? null;
  state.seatId = result.seat_id ?? null;
  rememberSession(state.sessionToken);
  el("entry-view").hidden = true;
  el("table-main").hidden = false;
  state.workspace = "game";
  renderWorkspace();
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
  // 已经在飞的那一次也要掐掉。只 clearInterval 拦得住「下一次」，拦不住「这一次」，
  // 而出问题的恰恰是这一次：
  //
  // 离桌是 await act("seat.leave") 然后 returnToEntry()。那个 await 期间 700 毫秒的
  // interval 会照常触发一次 refresh，它带的凭据正是这次离桌要作废的那一份。等它到达
  // 服务端时凭据已经没了，于是 403，而浏览器为每个 4xx 自己打一条控制台错误。
  //
  // 这就是那个「偶发 403」：撞不撞上取决于点击落在 700 毫秒周期的哪个位置，
  // 所以它时有时无。用 2.5 秒的慢响应把窗口撑开之后每次必现。
  //
  // 修的是根因而不是证据：页面自己请求作废凭据之后就不该再拿它去问。
  if (state.pollAbort !== null) {
    state.pollAbort.abort();
    state.pollAbort = null;
  }
}

async function refresh() {
  if (state.sessionToken === null) return;
  const session = state.sessionToken;
  const generation = state.viewGeneration;
  const wakeTicket = wakeControls?.viewTicket();
  // 每次轮询自带一个可中止句柄，但**这里不掐上一次**。
  //
  // 重叠确实要处理：服务端慢下来时两次拉取会同时在飞，而哪一条先回来是不定的，
  // 后到的旧响应会把新画面覆盖回去。处理办法是下面 await 之后那道围栏，不是中止。
  //
  // 为什么不中止：一条已经发出去的轮询同时是心跳，让它自然完成对服务端有用；
  // 而中止它只换来一条 net::ERR_ABORTED——那是噪声，而噪声会淹掉真的网络失败。
  // 围栏丢掉它的响应就够了，代价是零。
  //
  // 需要中止的只有终结转换（离桌、掉线），那时请求本身对服务端有副作用，
  // 不能让它到达。见 stopPolling。
  const controller = new AbortController();
  state.pollAbort = controller;
  try {
    // 每次轮询都带 connection_id：这一条请求同时是心跳。不另发一种心跳，理由写在
    // table-web-host.cjs 的 touchConnection 上——两条不同节流特性的请求会让一个正常
    // 使用中的后台标签页被判掉线。
    const result = await post("/api/view", {
      session_token: state.sessionToken,
      connection_id: state.connectionId,
    }, { signal: controller.signal });
    // 回来之后再确认一次会话还在。中止只保证 fetch 会拒，不保证「已经解析出结果的那次」
    // 不往下走；而这一跳之后要动的是全局画面。
    if (state.sessionToken === null || state.pollAbort !== controller) return;
    if (session !== state.sessionToken || generation !== state.viewGeneration) return;
    wakeControls?.acceptView(wakeTicket, result.view);
    state.view = result.view;
    clearError(el("global-error"));
    render(result.view);
  } catch (error) {
    // 自己掐的不算错误。AbortError 是「这条结果已经没人要了」，不是故障——
    // 把它当故障显示会在离桌与掉线时闪一条无意义的红字。
    if (error?.name === "AbortError") return;
    if (session !== state.sessionToken || generation !== state.viewGeneration || state.pollAbort !== controller) return;
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

function renderWorkspace() {
  const surface = state.sessionToken === null ? "setup" : state.workspace;
  el("entry-view").hidden = surface !== "setup";
  el("table-main").hidden = surface !== "game";
  el("config-main").hidden = surface !== "settings";
  el("workspace-shell").dataset.workspace = surface;
  el("workspace-title").textContent = surface === "game" ? "私人牌桌" : "配置中心";
  el("nav-game").disabled = state.sessionToken === null;
  el("nav-game").setAttribute("aria-current", surface === "game" ? "page" : "false");
  el("nav-settings").setAttribute("aria-current", surface === "game" ? "false" : "page");
}

function selectWorkspace(surface) {
  if (!["game", "settings"].includes(surface) || (surface === "game" && state.sessionToken === null)) return;
  state.workspace = surface;
  if (surface === "settings" && state.sessionToken !== null) el("model-connection-panel").open = true;
  renderWorkspace();
  window.scrollTo?.(0, 0);
}

el("nav-game").addEventListener("click", () => selectWorkspace("game"));
el("nav-settings").addEventListener("click", () => selectWorkspace("settings"));

function render(view) {
  renderWorkspace();
  renderScopeGate(view);
  renderRoom(view);
  renderBoard(view);
  renderSeats(view);
  renderActions(view);
  renderSeatControls(view);
  renderModelConnection(view);
  renderModelWake();
  renderTimeline(view);
}

function renderScopeGate(view) {
  const me = view.seats.find((seat) => seat.is_viewer) ?? null;
  // public_scope_confirmed 只在自己那一席上有值。null 表示"还不知道"，不当作未确认——
  // 那会在视图刚建立的一瞬间闪一下对话框。
  // 两个条件，因为权威强制的和不强制的要分开看：
  //   public_scope_confirmed === false —— 权威会拒绝这一席发言。必须弹。
  //   reconfirm_reason !== null        —— 规则 3 那一维。权威放行，但玩家该重看一遍。
  // 只看前者的话，发言限制版本变化时门不会出现（因为权威放行），而规则 3 要求它出现。
  const reason = me?.public_scope_reconfirm_reason ?? null;
  const needsConfirm = me !== null && (me.public_scope_confirmed === false || reason !== null);
  // 有待落座的入口时对话框必须一直在。轮询本来只在 enterTable 之后才起，两者不该同时
  // 成立；写出来是因为「渲染悄悄收起一个正在等玩家回答的对话框」这种缺陷在页面上看不出
  // 原因——玩家只会看到自己点了创建、闪过一个框、然后什么都没发生。
  el("scope-gate").hidden = state.pendingEntry === null && !needsConfirm;
  renderScopeReason(reason);
}

// 重新确认的理由。首次入桌不显示：正文本身就是那段说明，再加一句「首次入桌」是废话。
// 换绑 / 桌规变化 / 限制变化都要显示，否则玩家看到的是一个第二次出现、措辞完全一样的
// 对话框，无从判断自己是不是点漏了。
const SCOPE_REASONS = {
  new_room_binding: "你换到了一张新的牌桌，之前那次确认只对上一张桌子有效。请重新过一遍。",
  table_rules_changed: "这张桌子的桌规版本变了。之前那次确认对应旧桌规，请重新过一遍。",
  public_limits_changed: "发言限制（长度、每手条数、AI 启动间隔）的版本变了。请重新过一遍。",
};

function renderScopeReason(reason) {
  const node = el("scope-reason");
  const text = reason === null ? null : SCOPE_REASONS[reason] ?? null;
  node.textContent = text ?? "";
  node.hidden = text === null;
}

// 确认之后才建房 / 才落座，然后立刻把确认记到权威侧。
//
// 两条路径共用这一个按钮，因为玩家看到的是同一句话、同一个决定：
//   pendingEntry 非空 —— 还什么都没建。先 create/join，再 confirm。
//   pendingEntry 为空 —— 座位已经在了，只差那一次确认。这条路径在刷新之后成立：会话恢复
//     回来了，而权威侧那一席的 public_scope_confirmed 还是 false（确认本身没落地，或者
//     落地前页面就没了）。
//
// 这个按钮可能被连点，也可能第一次的响应丢在路上。两种情况都靠入口键回到同一个座位；
// 键在 pendingEntry 里，重试沿用它。所以失败时不清 pendingEntry——清了就等于把重试的
// 唯一凭据丢掉，玩家再点一次会撞上 room_already_exists 而卡住。
let entryInFlight = false;

el("scope-accept").addEventListener("click", async () => {
  clearError(el("scope-error"));
  // 连点的第一道防线在客户端：入口键保证重放安全，但没必要真发两次。
  if (entryInFlight) return;
  entryInFlight = true;
  try {
    const pending = state.pendingEntry;
    if (pending !== null) {
      const route = pending.kind === "create" ? "/api/room/create" : "/api/room/join";
      const result = await post(route, { ...pending.body, entry_key: pending.key });
      // POST 成功了，座位在了。这时才清 pendingEntry：之后再点这个按钮走的是
      // 「只补确认」那条路，而「先不加入」也该真的去 seat.leave 了。
      state.pendingEntry = null;
      enterTable(result);
    }
    await act("room.confirm_public_scope", { acknowledged: true });
    await refresh();
  } catch (error) {
    showError(el("scope-error"), error);
  } finally {
    entryInFlight = false;
  }
});

// 回到入口。离桌、拒绝确认、以及座位被权威释放都走这一条：这三种情况的共同点是
// 本机会话已经没有对应的座位了，继续留在牌桌画面上只会显示一份不再更新的旧快照。
function returnToEntry(message) {
  stopPolling();
  // 回入口的每条路径都意味着这个令牌再也用不上了（离桌、被释放、会话失效）。留着它只会
  // 让下一次刷新拿一个必然被拒的令牌去试恢复，然后在控制台留一条 403。
  rememberSession(null);
  state.sessionToken = null;
  wakeControls?.setSession(null);
  state.connectionId = null;
  state.seatId = null;
  state.view = null;
  state.disconnected = false;
  // 待落座的意图跟着一起清。留着的话下次回到入口时 renderScopeGate 会把对话框顶起来，
  // 而它对应的那次意图早就作废了。
  state.pendingEntry = null;
  modelBindingRequest = null;
  el("model-consent").checked = false;
  el("model-connection-feedback").textContent = "";
  clearError(el("model-connection-error"));
  el("scope-gate").hidden = true;
  el("table-main").hidden = true;
  el("entry-view").hidden = false;
  state.workspace = "game";
  renderWorkspace();
  el("invite-wrap").hidden = false;
  setConnState("idle", "未连接");
  if (typeof message === "string" && message !== "") {
    const node = el("entry-error");
    node.textContent = message;
    node.hidden = false;
  }
}

el("scope-decline").addEventListener("click", async () => {
  // 还没建东西的那条路径：没有座位可离，收起对话框就完了。这正是重排顺序想要的结果——
  // 拒绝确认的人不会在公开时间线上留下任何痕迹，因为他从来没绑定过。
  if (state.pendingEntry !== null) {
    state.pendingEntry = null;
    el("scope-gate").hidden = true;
    clearError(el("scope-error"));
    return;
  }
  // 已经落座但没确认（刷新恢复回来的那条路径）。这时才需要离桌：留在桌上不确认会占着
  // 一个座位，而规则 1 要求确认在进桌之前。
  try {
    await act("seat.leave", {});
  } catch {
    // 离桌失败也要回到入口：本机会话已经没有意义了。
  }
  returnToEntry("");
});

function renderRoom(view) {
  const room = view.room;
  el("room-id").textContent = typeof room?.room_id === "string"
    ? `#${room.room_id.replace(/^room-/, "").slice(0, 8)}` : "—";
  el("hand-index").textContent = String(room?.hand_index ?? 0);

  // 开局判定的 reason 整个照抄权威，页面只负责把那个词翻成人话。自己拼一句
  // "还差一个人"会在开局规则变化时说错话，而玩家看到的解释必须和权威的判定一致。
  el("start-reason").textContent = describeStart(room?.start_decision ?? null, room);

  const adapter = view.model_adapter ?? {};
  if (adapter.attached !== true) {
    // 未接入就说未接入。把"本机没有模型"画成"AI 选择了沉默"是不能做的那种冒充。
    el("adapter-state").textContent = modelConnectionLabel(view.model_connection);
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
function seatNode(seat, view, position) {
  const li = document.createElement("li");
  li.className = "seat";
  li.dataset.seatId = seat.seat_id;
  li.dataset.position = position;
  li.dataset.viewer = String(seat.is_viewer);
  li.dataset.actor = String(seat.is_actor);
  li.dataset.folded = String(seat.hand_status === "folded");
  li.dataset.hiddenSeat = String(seat.locally_hidden.seat);

  const head = document.createElement("div");
  head.className = "seat-head";
  const avatar = document.createElement("span");
  avatar.className = "seat-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = seat.locally_hidden.seat ? "·" : String(seat.player_id ?? "?").slice(0, 1).toUpperCase();
  head.append(avatar);
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
  // 气泡紧跟在 AI 那一行之后、隐藏开关之前：玩家、他的 AI、他们刚说的话，
  // 三者在同一张卡片里自上而下相邻。
  li.append(seatSpeech(seat));
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
  const avatar = document.createElement("span");
  avatar.className = "ai-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = "✦";
  row.append(avatar);
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

// 座位旁的聊天气泡。
//
// 这一块与底部的公开时间线是两个不同的东西，不能互相冒充：
//   - 座位旁：归属。这句话是这张卡片上这个真人（或他的 AI）说的，看一眼就知道是谁。
//     只留最近几条、约 10 秒后退出，因为它占的是牌面旁边的位置。
//   - 时间线：历史。全部发言、永不退出、可以往上翻。
//
// 归属靠 DOM 结构而不是靠气泡里那行名字：气泡挂在 li.seat 内部，所以「谁说的」这件事
// 在 DOM 上是父子关系，不依赖读文本。名字仍然写在气泡里——结构、文字、样式三条通道
// 冗余，缺一条时另两条还在（component-guidelines 那条「至少三条互相冗余的通道」）。
function seatSpeech(seat) {
  const wrap = document.createElement("ol");
  wrap.className = "seat-speech";
  wrap.setAttribute("aria-label", `${seat.player_id} 座位旁的最近发言`);
  // 整席被本地隐藏时连气泡一起收起：那一席在这个查看者眼里是收起状态，
  // 留着气泡就等于隐藏只藏了名字。
  const list = seat.locally_hidden.seat ? [] : (seat.recent_speech ?? []);
  wrap.dataset.count = String(list.length);
  wrap.replaceChildren(...list.map((entry) => seatBubbleNode(entry, seat)));
  // 空列表也保留节点。有无气泡都是同一个容器，几何断言不必区分两种 DOM 形状。
  return wrap;
}

function seatBubbleNode(entry, seat) {
  const li = document.createElement("li");
  li.className = "seat-bubble";
  li.dataset.speaker = entry.speaker_type;
  li.dataset.seatId = seat.seat_id;
  li.dataset.hidden = String(entry.hidden === true);
  li.dataset.late = String(entry.late === true);
  // 淡出交给 CSS，年龄由投影给。页面不开 setTimeout：定时器会变成第二份「该不该显示」
  // 的状态，而它和视图的唯一同步点是它自己。
  li.style.setProperty("--age", String(entry.age_ms));

  const who = document.createElement("span");
  who.className = "seat-bubble-who";
  // AI 说话时写「<玩家> 的 AI」而不只是玩家名：否则同一张卡片上两条气泡的署名一模一样。
  who.textContent = entry.speaker_type === "SEAT_AI"
    ? `${entry.player_id ?? seat.player_id} 的 AI`
    : (entry.player_id ?? "—");
  li.append(who);

  if (entry.speaker_type === "SEAT_AI") {
    const badge = document.createElement("span");
    badge.className = "ai-badge";
    badge.textContent = "AI";
    li.append(badge);
  }

  if (entry.late === true) {
    const street = { preflop: "翻牌前", flop: "翻牌", turn: "转牌", river: "河牌" };
    const basis = street[entry.based_on_street] ?? entry.based_on_street;
    li.append(tag(basis ? `延迟 · 基于${basis}` : "延迟", "late"));
  }

  const note = document.createElement("span");
  note.className = "hidden-note";
  note.textContent = entry.speaker_type === "SEAT_AI"
    ? "（这条 AI 发言已被你隐藏）"
    : "（这条发言已被你隐藏）";
  li.append(note);

  const text = document.createElement("p");
  text.className = "seat-bubble-text";
  // textContent 而不是 innerHTML。这是别人输入的文本。
  text.textContent = entry.text;
  li.append(text);
  return li;
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

function visualSeatLayout(seats) {
  const sorted = [...seats].sort((left, right) => left.seat_index - right.seat_index);
  const viewerIndex = sorted.findIndex((seat) => seat.is_viewer);
  const pivot = viewerIndex < 0 ? 0 : viewerIndex;
  const aroundViewer = sorted.map((_, index) => sorted[(pivot + index) % sorted.length]);
  const positionSets = {
    1: ["bottom"],
    2: ["bottom", "top"],
    3: ["bottom", "left", "right"],
    4: ["bottom", "left", "top", "right"],
  };
  const positions = positionSets[aroundViewer.length] ?? positionSets[4];
  const documentOrder = { top: 0, left: 1, right: 2, bottom: 3 };
  return aroundViewer
    .map((seat, index) => ({ seat, position: positions[index] ?? "right" }))
    .sort((left, right) => documentOrder[left.position] - documentOrder[right.position]);
}

function renderSeats(view) {
  el("table-main").dataset.seatCount = String(view.seats.length);
  const list = el("seats");
  const layout = visualSeatLayout(view.seats);
  list.dataset.seatCount = String(layout.length);
  list.replaceChildren(...layout.map(({ seat, position }) => seatNode(seat, view, position)));
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

// 本人授权后下载的 token 只存活在下载函数局部，不进入状态对象、DOM、URL 或 storage。
let modelBindingBusy = false;
let modelBindingRequest = null;

function pauseWakeControls(reason) {
  const ticket = { sessionToken: state.sessionToken, reason };
  wakeAuthorizationOperations.add(ticket);
  if (wakeControls !== null) wakePauseTicket = wakeControls.pause(reason);
  else state.viewGeneration += 1;
  return ticket;
}

function resumeWakeControls(ticket) {
  if (!wakeAuthorizationOperations.delete(ticket) || ticket.sessionToken !== state.sessionToken) return;
  const pending = [...wakeAuthorizationOperations].find((item) => item.sessionToken === state.sessionToken);
  if (wakeControls === null) { state.viewGeneration += 1; return; }
  if (pending !== undefined) {
    wakePauseTicket = wakeControls.pause(pending.reason);
    return;
  }
  if (wakePauseTicket !== null) wakeControls.resume(wakePauseTicket);
  wakePauseTicket = null;
}

function renderModelWake() {
  if (wakeControls === null) return;
  const view = wakeControls.snapshot();
  el("modelWakeControls").disabled = false;
  el("modelWakeControls").dataset.state = view.ui_state;
  el("modelWakeForm").setAttribute("aria-busy", String(["starting", "stopping"].includes(view.ui_state)));
  const remoteConnector = view.transport === "remote_connector";
  const fixedTarget = view.target_configured === true || remoteConnector;
  const taskInput = el("modelWakeTaskId");
  if (taskInput.value !== view.fields.threadId) taskInput.value = view.fields.threadId;
  taskInput.disabled = fixedTarget || !view.editable;
  el("modelWakeTaskField").hidden = fixedTarget;
  el("modelWakeFixedTarget").hidden = !fixedTarget;
  el("modelWakeFixedTarget").textContent = remoteConnector && view.target_configured !== true
    ? "等待本机连接器接入。目标游戏任务只在你自己的设备上绑定，UUID不向页面公开。连接器接入后才能确认并开启通知窗口。"
    : remoteConnector
      ? "本机连接器已绑定当前游戏任务，UUID不向页面公开。开启前请让目标任务结束当前回复并保持空闲；任务正在运行时，通知可能已接收却不能并发结清。"
      : "发送器已固定当前游戏任务，UUID不向页面公开。开启前请让目标任务结束当前回复并保持空闲；任务正在运行时，通知可能已接收却不能并发结清。";
  for (const [id, name] of [["modelWakeMaxNotifications", "maxNotifications"],
    ["modelWakeDurationSeconds", "durationSeconds"]]) {
    const input = el(id);
    if (input.value !== view.fields[name]) input.value = view.fields[name];
    input.disabled = !view.editable;
  }
  if (view.limits !== null) {
    el("modelWakeMaxNotifications").max = String(view.limits.max_notifications);
    el("modelWakeDurationSeconds").max = String(view.limits.max_duration_ms / 1000);
  } else {
    el("modelWakeMaxNotifications").removeAttribute("max");
    el("modelWakeDurationSeconds").removeAttribute("max");
  }
  el("modelWakeConsent").checked = view.consent;
  el("modelWakeConsent").disabled = !view.editable;
  el("modelWakeStart").disabled = !view.can_start;
  el("modelWakeStop").disabled = !view.can_stop;
  el("modelWakeRetry").disabled = !view.can_retry;
  el("modelWakeRetry").hidden = !["start_unknown", "stop_unknown"].includes(view.ui_state);
  el("modelWakeRetry").textContent = view.retry_text;
  el("modelWakeLimits").textContent = view.limits === null ? "通知能力或限制未知，已禁用开启。"
    : `本服务实际上限：${view.limits.max_notifications} 次、${view.limits.max_duration_ms / 1000} 秒。次数是上限，不保证 AI 回复。`;
  for (const [id, value] of [["modelWakeStatus", view.status_text], ["modelWakeCounts", view.counts_text],
    ["modelWakeTiming", view.timing_text], ["modelWakeCleanup", view.cleanup_text], ["modelWakeValidation", view.validation],
    ["modelWakeError", view.error]]) el(id).textContent = value;
  el("modelWakeError").hidden = view.error === "";
}

for (const [id, name] of [["modelWakeTaskId", "threadId"], ["modelWakeMaxNotifications", "maxNotifications"],
  ["modelWakeDurationSeconds", "durationSeconds"]]) {
  el(id).addEventListener("input", () => wakeControls?.setField(name, el(id).value));
}
el("modelWakeConsent").addEventListener("change", () => wakeControls?.setConsent(el("modelWakeConsent").checked));
el("modelWakeForm").addEventListener("submit", (event) => { event.preventDefault(); void wakeControls?.start(); });
el("modelWakeRetry").addEventListener("click", () => { void wakeControls?.retry(); });
el("modelWakeStop").addEventListener("click", () => { void wakeControls?.stop(); });

function modelConnectionLabel(connection) {
  return {
    disabled: "本入口未开启 AI 连接",
    unbound: "尚未绑定本席 AI",
    awaiting_host: "已授权，等待宿主连接",
    host_seen: "已收到本席宿主请求",
  }[connection?.state] ?? "未接入";
}

function renderModelConnection(view) {
  const connection = view.model_connection;
  const me = view.seats.find((seat) => seat.is_viewer) ?? null;
  el("model-connection-state").textContent = modelConnectionLabel(connection);
  const available = connection !== undefined && connection.state !== "disabled"
    && me !== null && me.leave_requested !== true && me.public_scope_confirmed === true;
  const bound = ["awaiting_host", "host_seen"].includes(connection?.state);
  el("model-consent").disabled = !available || modelBindingBusy;
  el("model-bind-download").disabled = !available || modelBindingBusy || !el("model-consent").checked;
  el("model-unbind").disabled = !available || !bound || modelBindingBusy;
  el("model-connection-help").textContent = connection?.state === "host_seen"
    ? "协调器收到过本席宿主请求，不代表持续在线或无点击主动唤醒。宿主停止后可能需要你发消息或点击继续。"
    : "使用你当前宿主会话的模型，不需要另填模型 API。此处只建立本席通道，不证明宿主能无点击主动唤醒。";
}

el("model-consent").addEventListener("change", () => {
  if (state.view !== null) renderModelConnection(state.view);
});

el("model-bind-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (modelBindingBusy || state.sessionToken === null || !el("model-consent").checked) return;
  const session = state.sessionToken;
  const seat = state.seatId;
  const wakeTicket = pauseWakeControls("正在换发本席 AI 连接");
  modelBindingBusy = true;
  clearError(el("model-connection-error"));
  renderModelConnection(state.view);
  try {
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      throw new Error("secure_random_unavailable");
    }
    modelBindingRequest ??= `model-bind-${crypto.randomUUID()}`;
    const result = await post("/api/model/bind", {
      session_token: session,
      acknowledged: true,
      binding_request_id: modelBindingRequest,
    });
    if (session !== state.sessionToken) return;
    const connection = result.connection;
    if (connection?.schema !== "tokengame.model-connection.v1"
      || typeof connection.model_token !== "string" || typeof connection.table_origin !== "string") {
      throw new Error("model_connection_invalid");
    }
    const blob = new Blob([JSON.stringify(connection, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tokengame-ai-${seat}.json`;
    try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    modelBindingRequest = null;
    el("model-consent").checked = false;
    el("model-connection-feedback").textContent = "下载请求已发出。请由真人运行 npm run connection:activate -- \"<下载文件绝对路径>\"；成功后无需重启 MCP。原下载文件不会自动删除，也不要粘贴其内容。";
    resumeWakeControls(wakeTicket);
    await refresh();
  } catch (error) {
    if (session === state.sessionToken) showError(el("model-connection-error"), error);
  } finally {
    resumeWakeControls(wakeTicket);
    modelBindingBusy = false;
    if (state.view !== null) renderModelConnection(state.view);
  }
});

el("model-unbind").addEventListener("click", async () => {
  if (modelBindingBusy || state.sessionToken === null) return;
  const session = state.sessionToken;
  const wakeTicket = pauseWakeControls("正在撤销本席 AI 连接");
  modelBindingBusy = true;
  renderModelConnection(state.view);
  clearError(el("model-connection-error"));
  try {
    await post("/api/model/unbind", { session_token: session });
    if (session !== state.sessionToken) return;
    modelBindingRequest = null;
    el("model-consent").checked = false;
    el("model-connection-feedback").textContent = "本席 AI 连接已撤销，旧文件不能发起后续请求。再由真人运行 npm run connection:clear 清本地活动槽位；已提交处理的请求可能仍完成。";
    resumeWakeControls(wakeTicket);
    await refresh();
  } catch (error) {
    if (session === state.sessionToken) showError(el("model-connection-error"), error);
  } finally {
    resumeWakeControls(wakeTicket);
    modelBindingBusy = false;
    if (state.view !== null) renderModelConnection(state.view);
  }
});

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

// 自愿亮牌与下注走同一套绑定：hand_id + expected_revision + idempotency_key。
//
// 在此之前这里只发 hand_id，于是核心以 invalid_field 拒绝每一次点击——这个按钮从来没有
// 成功过一次。它不显眼是因为亮牌只在「其余人全弃牌、你是赢家」时才出现，而自动化里没有
// 任何一步点过它。
//
// 幂等键取 hand_id + expected_revision，不掺时间戳或随机数：那两样会让每一次重发都变成
// 一个新请求，于是丢响应后的重试撞上引擎那道「你已经亮过了」，玩家看到一条自己无法理解
// 的失败，而牌其实已经亮了。同一个逻辑请求必须始终产生同一个键。
//
// 不带 action/amount 那类字段，因为亮牌没有参数。指纹里仍有 expected_revision，所以
// 「同键换版本号」照样会被确定性拒绝。
wireControl("reveal-btn", () => {
  const panel = state.view?.action_panel ?? null;
  return act("hand.reveal", {
    hand_id: panel?.hand_id,
    expected_revision: panel?.expected_revision,
    idempotency_key: `reveal:${panel?.hand_id}:${panel?.expected_revision}`,
  });
});

el("leave-btn").addEventListener("click", async () => {
  // 离桌是不可逆的（座位会被释放，凭据作废），所以要一次确认。
  if (!window.confirm("离桌后这个座位会被释放，筹码结算按当前状态处理。确定离桌？")) return;
  // 先停轮询，再发离桌。顺序要紧。
  //
  // 反过来写的话，await 期间 interval 还会触发一次 refresh，它带的凭据正是这次离桌要
  // 作废的那一份，到达服务端时已经无效——403，外加浏览器自己打的一条控制台错误。
  // 撞不撞上取决于点击落在 700 毫秒周期的哪个位置，所以它表现为偶发。
  //
  // 停在这里是安全的：离桌成功就 returnToEntry（本来也要停），失败则在下面恢复。
  stopPolling();
  try {
    await act("seat.leave", {});
    // 离桌之后本机会话手里的席位凭据立刻作废，再拉视图只会拿到 403。所以这里必须
    // 收摊回入口，而不是 refresh()——后者会让页面停在一份不再更新的旧快照上。
    returnToEntry("你已离桌。");
  } catch (error) {
    // 没离成就得把轮询接回去，否则页面从此静止，而玩家看到的是一张不再更新的牌桌
    // ——比报错更糟：它看起来是正常的。
    showError(el("global-error"), error);
    startPolling();
  }
});

// 掉线与恢复。真实掉线是关掉标签页，但那样就没法在同一个页面里演示 120 秒保留窗，
// 所以给一个显式按钮：它调的是协调器真正的 disconnect/resume，不是画一个假状态。
el("simulate-disconnect").addEventListener("click", async () => {
  // 同样先停轮询再发请求，而这里的后果比离桌那条更坏。
  //
  // 轮询带着 connection_id，而那条请求同时是心跳：table-web-host.cjs 的 touchConnection
  // 对一个已被摘掉的连接 id 会**重新建连**（那是拔网线场景要的行为，见那里的注释）。
  // 所以 await 期间飞出去的一次 refresh 不是打一条 403 就完了——它会把刚刚的掉线撤销，
  // 同桌看到的掉线标记闪一下就没了，而保留窗根本没开始走。
  //
  // 这条竞态用 refresh 里的中止围栏挡不住：请求已经到了服务端，连接已经重建，
  // 丢掉响应改变不了这个事实。只有顺序能修。
  stopPolling();
  try {
    await post("/api/session/disconnect", {
      session_token: state.sessionToken,
      connection_id: state.connectionId,
    });
    state.disconnected = true;
    setConnState("offline", "已掉线（保留窗内可恢复）");
    el("simulate-disconnect").hidden = true;
    el("simulate-reconnect").hidden = false;
  } catch (error) {
    // 没断成就把轮询接回去，理由同离桌那条：一张不再更新的牌桌看起来是正常的。
    showError(el("global-error"), error);
    startPolling();
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

// 关标签页 / 切走时尽力发一次断线通知。
//
// 这是 best effort，不是断线判定的依据。三件事都可能让它到不了：进程被杀、断网、
// 浏览器直接丢弃 keepalive 请求。真正的判定是服务端的连接租约——不发 beacon 也会在
// 租约到期后掉线（test/connection-lease.test.cjs 里那条「不发 beacon 也会到期断线」
// 钉的就是这一点）。beacon 的唯一作用是把「关页面到判定掉线」从一个租约周期缩短到即时。
//
// 用 pagehide 而不是 unload/beforeunload：后两者在移动端和 back/forward cache 场景下
// 经常不触发，而 pagehide 是这类清理的现行事件。visibilitychange 也不行——切个标签页就
// 触发，那会把「看了一眼别的窗口」当成掉线。
window.addEventListener("pagehide", () => {
  if (state.sessionToken === null || state.disconnected) return;
  const payload = JSON.stringify({
    session_token: state.sessionToken,
    connection_id: state.connectionId,
  });
  // sendBeacon 不保证送达也不回报结果，所以这里没有错误处理可写——没有能对失败做的事。
  // 它不可用时退回 keepalive fetch，同样不等结果。
  if (typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/session/disconnect", new Blob([payload], {
      type: "application/json",
    }));
    return;
  }
  fetch("/api/session/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
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

// 只读机器视图与测试采样钩子，不暴露会话/连接文件，也不能快进权威牌局时钟。
window.render_game_to_text = () => JSON.stringify({
  coordinate_system: "DOM 布局，左上为原点；所有扑克动作由权威决定",
  screen: state.view === null ? "entry" : "table",
  ui: {
    surface: state.sessionToken === null ? "setup" : state.workspace,
    seat_count: state.view?.seats?.length ?? 0,
    settings_open: state.sessionToken !== null && state.workspace === "settings"
      && el("model-connection-panel").open === true,
    scope_confirmation_open: el("scope-gate").hidden === false,
  },
  room: state.view?.room ?? null,
  hand: state.view?.hand ?? null,
  seats: state.view?.seats ?? [],
  messages: state.view?.messages ?? [],
  action_panel: state.view?.action_panel ?? null,
  model_connection: state.view?.model_connection ?? null,
  model_wake: wakeControls?.visibleState() ?? null,
});
window.advanceTime = async () => {
  if (state.sessionToken !== null && !state.disconnected) await refresh();
};

// ---- 启动：刷新之后先试着回到原座位 ----
//
// 顶层 await 在经典脚本里不可用（这个文件是 <script> 不是 module），所以用一个立即
// 调用的 async 函数，而不是把整份逻辑塞进 DOMContentLoaded：脚本在 body 末尾，DOM
// 已经在了。
//
// 恢复失败时静默回入口，不弹错误：一个刚打开的新标签页里 sessionStorage 是空的，
// 那不是异常；一个过了保留窗的旧令牌被拒也不是玩家做错了什么。只有恢复成功才改画面。
(async function initializeWakeControls() {
  // 独立启动可选控件，不让其网络请求悬挂拖住下面的原会话恢复。
  try {
    const { WakeControls } = await import("/wake-controls.mjs");
    wakeControls = new WakeControls({ request: post, onChange: renderModelWake,
      onFence: () => { state.viewGeneration += 1; } });
    wakeControls.setSession(state.sessionToken);
    const pending = [...wakeAuthorizationOperations].find((item) => item.sessionToken === state.sessionToken);
    if (pending !== undefined) wakePauseTicket = wakeControls.pause(pending.reason);
    renderModelWake();
  } catch {
    el("modelWakeControls").dataset.state = "unavailable";
    el("modelWakeStatus").textContent = "通知控件加载失败，未启用自动通知；手动打牌、聊天和撤销连接仍可使用。";
  }
})();

(async function resumeIfPossible() {
  if (state.sessionToken !== null) return;
  const token = recallSession();
  if (token === null) return;
  state.sessionToken = token;
  wakeControls?.setSession(token);
  try {
    const result = await post("/api/session/resume", { session_token: token });
    // 不传 connection_id，让协调器铸一个新的。理由在 table-web-host.cjs 的 postResume
    // 上：复用会让复制出来的标签页共用一条租约，关一个断两个。
    state.connectionId = result.connection_id ?? null;
    state.seatId = result.seat_id ?? null;
    el("entry-view").hidden = true;
    el("table-main").hidden = false;
    // 恢复路径上拿不到邀请码：它只在 room.create 的返回里出现一次。隐藏比显示一个「—」
    // 好——后者看起来像「这桌没有邀请码」。
    el("invite-wrap").hidden = true;
    setConnState("connected", "已连接");
    startPolling();
  } catch {
    rememberSession(null);
    state.sessionToken = null;
    wakeControls?.setSession(null);
  }
})();
