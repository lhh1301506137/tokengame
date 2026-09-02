// 只维护本人控件的传输/显示状态；不调度模型、不判游戏规则，也没有轮询或持久化。
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON = /^[a-z][a-z0-9_]{0,79}$/;
const STATES = new Set(["idle", "waiting", "dispatching", "awaiting_result", "stopped"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const seconds = (ms) => String(Number((ms / 1000).toFixed(3)));

const REASONS = Object.freeze({
  stopped_by_owner: "本人停止", max_notifications: "已到通知次数上限", max_duration: "已到持续时长上限",
  seat_ai_off: "本席 AI 已关闭", model_binding_changed: "本席 AI 授权已变化", host_stopped: "本地服务停止",
  wake_disabled: "发送器未启用", model_scope_rejected: "本席权限不再有效", wake_io_timeout: "权威请求超时",
  wake_queue_timeout: "通知接收超时，是否已接收不确定", wake_queue_unknown: "通知接收结果不确定",
  wake_queue_failed: "通知未被确认接收", wake_cleanup_failed: "发送资源清理失败或未确认",
  wake_protocol_invalid: "通知协议异常", wake_receipt_unavailable: "权威回执不可用",
  wake_start_failed: "AI 评估启动失败", wake_resolve_failed: "AI 权威提交失败",
  wake_result_unknown: "未能确认权威结果", wake_intent_already_attempted: "该待办已尝试通知，不会重投",
  wake_intent_history_full: "通知去重记录已满", wake_clock_invalid: "通知时钟异常",
});

const FAILURE_CODES = Object.freeze({
  intent_not_found: "待办已失效，通常是牌局上下文已经推进",
  intent_claim_superseded: "待办领取权已过期或被另一宿主接替",
  evaluation_cooldown: "本席 AI 仍在最小启动间隔内",
  seat_turn_already_active: "本席已有一个 AI 回合在运行",
  ai_hand_quota_exhausted: "本手 AI 公开发言额度已用完",
  seat_ai_off: "本席 AI 已关闭",
  model_binding_changed: "本席 AI 授权已变化",
  unknown_authority_id: "宿主没有这条权威待办的本地映射",
});

const ERRORS = Object.freeze({
  invalid_field: "请求参数被拒绝。请检查任务 UUID、次数与时长，再重新确认。",
  wake_disabled: "本地发送器未启用。你仍可手动打牌、聊天或撤销 AI 连接。",
  wake_thread_not_authorized: "任务 UUID 与发送器预先配置的游戏任务不符；页面不能通知任意任务。",
  wake_session_active: "本席已有通知窗口。请等待状态同步，或停止已有窗口。",
  wake_request_conflict: "原请求与服务端记录冲突，不能改参数重放。请先核对已有窗口。",
  wake_result_pending: "上一条通知的权威结果尚未确认，不能开启新窗口。停止不能撤回已接收的通知。",
  wake_cleanup_failed: "上一窗口的发送资源尚未确认清理，不能重新开启。",
  wake_history_full: "本席窗口记录已满；本次服务不再接受新窗口。",
  wake_thread_history_full: "本次服务的任务配对记录已满。",
  wake_thread_in_use: "这个游戏任务已有席位配对或未结清通知，不能转借给另一席。",
  model_binding_required: "请先连接本席 AI，并确认公开范围。",
  model_binding_changed: "本席 AI 授权已变化，旧请求不再可用。",
  model_scope_rejected: "本席授权已失效，请重新检查连接。",
  seat_ai_off: "本席 AI 已关闭，不能开启通知窗口。",
  seat_leaving: "本席正在离桌，不能开启通知窗口。",
  public_scope_not_confirmed: "请先确认本席的公开范围。",
  web_session_unknown: "牌桌会话已失效，请重新加入。",
  seat_credential_revoked: "席位权限已撤销。", seat_not_found: "原席位已不存在。",
  secure_random_unavailable: "安全随机数不可用，不能创建通知请求。请使用本机回环地址。",
});

// 只列出服务端保证未创建窗口的拒绝；超时、坏 JSON、500 和陌生错误都按未知结果处理。
const START_REJECTIONS = new Set(Object.keys(ERRORS).filter((key) => key !== "wake_cleanup_failed"));

function readLimits(value) {
  if (!object(value) || !positive(value.max_notifications) || !positive(value.max_duration_ms)) return null;
  return { max_notifications: value.max_notifications, max_duration_ms: value.max_duration_ms };
}

function readWindow(value, limits) {
  if (!object(value) || !STATES.has(value.state) || !(value.reason === null
    || (typeof value.reason === "string" && REASON.test(value.reason)))
    || !["attempted_count", "queued_count", "resolved_count"].every((key) => count(value[key]))
    || !(value.cleanup_ok === null || typeof value.cleanup_ok === "boolean")
    || typeof value.cleanup_pending !== "boolean"
    || !(value.failure_code === undefined || value.failure_code === null
      || (typeof value.failure_code === "string" && REASON.test(value.failure_code)))
    || value.thread_id !== undefined
    || value.queued_count > value.attempted_count || value.resolved_count > value.queued_count) return null;
  const common = {
    state: value.state, reason: value.reason, request_id: value.request_id,
    attempted_count: value.attempted_count, queued_count: value.queued_count, resolved_count: value.resolved_count,
    cleanup_ok: value.cleanup_ok, cleanup_pending: value.cleanup_pending,
    failure_code: value.failure_code ?? null,
  };
  if (value.state === "idle") {
    return value.request_id === null && value.attempted_count === 0 && value.cleanup_ok === true
      && value.cleanup_pending === false ? common : null;
  }
  if (typeof value.request_id !== "string" || !UUID.test(value.request_id)
    || !positive(value.max_notifications) || value.max_notifications > limits.max_notifications
    || !positive(value.max_duration_ms) || value.max_duration_ms > limits.max_duration_ms
    || value.attempted_count > value.max_notifications
    || !Number.isFinite(value.elapsed_ms) || value.elapsed_ms < 0 || value.elapsed_ms > Number.MAX_SAFE_INTEGER
    || !(value.pending_intent_id === null || (typeof value.pending_intent_id === "string"
      && /^intent-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value.pending_intent_id)))
    || value.native_turn_state !== "unknown" || value.accepted_notifications_retracted !== false) return null;
  return { ...common, request_id: value.request_id.toLowerCase(),
    max_notifications: value.max_notifications, max_duration_ms: value.max_duration_ms, elapsed_ms: value.elapsed_ms,
    pending_intent_id: value.pending_intent_id, native_turn_state: "unknown", accepted_notifications_retracted: false };
}

function readTargetConfigured(value) {
  if (!object(value)) return null;
  if (!Object.hasOwn(value, "target_configured")) return false;
  return typeof value.target_configured === "boolean" ? value.target_configured : null;
}

function readTransport(value) {
  if (!object(value)) return null;
  if (!Object.hasOwn(value, "transport")) return "local";
  return ["local", "remote_connector"].includes(value.transport) ? value.transport : null;
}

function readContext(view) {
  const own = Array.isArray(view?.seats) ? view.seats.filter((seat) => seat?.is_viewer === true) : [];
  const connection = view?.model_connection;
  if (own.length !== 1 || !object(connection) || typeof own[0].seat_id !== "string"
    || view.viewer_seat_id !== own[0].seat_id || connection.seat_id !== own[0].seat_id) return null;
  const bound = ["awaiting_host", "host_seen"].includes(connection.state);
  if (bound ? typeof connection.binding_id !== "string" || connection.binding_id.length === 0
    : !["unbound", "disabled"].includes(connection.state) || connection.binding_id !== null) return null;
  return { seatId: own[0].seat_id, bindingId: connection.binding_id, bound,
    confirmed: own[0].public_scope_confirmed === true, leaving: own[0].leave_requested === true,
    mode: own[0].ai?.mode, connectionState: connection.state };
}

function durationMs(text) {
  // 秒输入最多三位小数，按十进制拆分；不把浮点舍入或科学记数法变成额外授权。
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return NaN;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

export class WakeControls {
  constructor({ request, makeRequestId = () => globalThis.crypto.randomUUID(), onChange = () => {}, onFence = () => {} }) {
    this.#request = request;
    this.#makeRequestId = makeRequestId;
    this.#onChange = onChange;
    this.#onFence = onFence;
  }

  #request; #makeRequestId; #onChange; #onFence;
  #session = null; #context = null; #capability = null; #window = null;
  #epoch = 0; #revision = 0; #pause = null; #operation = null;
  #startRequest = null; #stopRequestId = null; #uncertain = null;
  #consent = false; #error = "";
  #fields = { threadId: "", maxNotifications: "1", durationSeconds: "" };

  #fence() { this.#revision += 1; this.#onFence(); }
  #emit() { this.#onChange(this.snapshot()); }

  #clear() {
    this.#epoch += 1;
    this.#operation?.controller.abort();
    this.#operation = null;
    this.#startRequest = null;
    this.#stopRequestId = null;
    this.#uncertain = null;
    this.#consent = false;
    this.#error = "";
    this.#window = null;
    this.#fields = { threadId: "", maxNotifications: "1", durationSeconds: "" };
    this.#fence();
  }

  setSession(token) {
    if (token === this.#session) return;
    this.#clear();
    this.#session = token;
    this.#context = null;
    this.#capability = null;
    this.#pause = null;
    this.#emit();
  }

  // 换绑、撤销、离桌和 OFF 在本地请求发出前就隔离旧回调；这不是乐观声称服务端已停止。
  pause(reason) {
    this.#clear();
    const ticket = { reason };
    this.#pause = ticket;
    this.#emit();
    return ticket;
  }

  resume(ticket) {
    if (ticket !== this.#pause) return;
    this.#pause = null;
    this.#context = null;
    this.#capability = null;
    this.#fence();
    this.#emit();
  }

  viewTicket() { return { epoch: this.#epoch, revision: this.#revision, session: this.#session }; }

  acceptView(ticket, view) {
    if (this.#pause !== null || this.#session === null || ticket?.session !== this.#session
      || ticket.epoch !== this.#epoch || ticket.revision !== this.#revision) return false;
    const context = readContext(view);
    const changed = context?.bindingId !== this.#context?.bindingId || context?.seatId !== this.#context?.seatId;
    const revoked = this.#context !== null && (context === null || context.leaving || !context.confirmed
      || (context.mode !== "ON" && this.#context.mode === "ON"));
    if (changed || revoked) this.#clear();
    this.#context = context;
    const raw = view?.model_wake;
    const limits = readLimits(raw?.limits);
    const targetConfigured = readTargetConfigured(raw);
    const transport = readTransport(raw);
    const window = limits !== null && raw?.window !== null ? readWindow(raw?.window, limits) : null;
    const targetChanged = this.#capability !== null
      && (targetConfigured === null || targetConfigured !== this.#capability.targetConfigured
        || transport !== this.#capability.transport);
    if (targetChanged) this.#clear();
    const valid = object(raw) && typeof raw.enabled === "boolean" && limits !== null && context !== null
      && targetConfigured !== null && transport !== null && (context.bound ? window !== null : raw.window === null);
    this.#capability = valid ? { enabled: raw.enabled, limits, targetConfigured, transport } : null;
    if (valid) {
      if (targetConfigured || transport === "remote_connector") this.#fields.threadId = "";
      if (this.#fields.durationSeconds === "") this.#fields.durationSeconds = seconds(Math.min(60_000, limits.max_duration_ms));
      // 正在发命令时轮询仍更新其他牌桌区域；同绑定窗口等待命令回执，避免旧 waiting 覆盖新 stop。
      if (this.#operation === null) {
        const older = this.#window?.request_id === window?.request_id && this.#window !== null && window !== null
          && ((this.#window.state === "stopped" && window.state !== "stopped")
            || window.queued_count < this.#window.queued_count || window.resolved_count < this.#window.resolved_count);
        if (!older) this.#window = window;
        if (this.#uncertain === "start" && this.#matchesStart(window)) this.#accept(window);
        if (this.#uncertain === "stop" && window?.request_id === this.#stopRequestId
          && window.state === "stopped" && !window.cleanup_pending) this.#accept(window);
      }
    }
    this.#emit();
    return true;
  }

  setField(name, value) {
    if (!this.snapshot().editable || !Object.hasOwn(this.#fields, name)
      || (name === "threadId" && this.#capability?.targetConfigured === true)) return;
    if (name === "threadId" && this.#capability?.transport === "remote_connector") return;
    this.#fields[name] = String(value);
    this.#consent = false;
    this.#error = "";
    this.#emit();
  }

  setConsent(checked) {
    if (!this.snapshot().editable) return;
    this.#consent = checked === true;
    this.#emit();
  }

  #parameters() {
    const threadId = this.#fields.threadId.trim().toLowerCase();
    const notifications = /^\d+$/.test(this.#fields.maxNotifications) ? Number(this.#fields.maxNotifications) : NaN;
    const duration = durationMs(this.#fields.durationSeconds);
    const limits = this.#capability?.limits;
    if (!positive(notifications) || !limits || notifications > limits.max_notifications) return { error: "通知次数必须在服务端实际上限内。" };
    if (!positive(duration) || duration > limits.max_duration_ms) return { error: "持续时长必须在服务端实际上限内，秒数最多三位小数。" };
    const parameters = { max_notifications: notifications, max_duration_ms: duration };
    if (this.#capability?.targetConfigured === true) return parameters;
    if (this.#capability?.transport === "remote_connector") return { error: "等待本机连接器接入。" };
    if (!UUID.test(threadId)) return { error: "请输入发送器预先配置的专用游戏任务 UUID。" };
    return { thread_id: threadId, ...parameters };
  }

  #matchesStart(window) {
    return this.#startRequest !== null && window?.request_id === this.#startRequest.request_id
      && window.max_notifications === this.#startRequest.max_notifications
      && window.max_duration_ms === this.#startRequest.max_duration_ms;
  }

  #accept(window) {
    this.#window = window;
    this.#startRequest = null;
    this.#stopRequestId = null;
    this.#uncertain = null;
    this.#consent = false;
    this.#error = "";
  }

  async start() {
    if (!this.snapshot().can_start) return false;
    let requestId;
    try { requestId = this.#makeRequestId(); } catch { requestId = null; }
    if (typeof requestId !== "string" || !UUID.test(requestId)) {
      this.#error = ERRORS.secure_random_unavailable;
      this.#consent = false;
      this.#emit();
      return false;
    }
    this.#startRequest = Object.freeze({ acknowledged: true, request_id: requestId.toLowerCase(), ...this.#parameters() });
    return this.#perform("start");
  }

  async retry() {
    if (!this.snapshot().can_retry) return false;
    return this.#perform(this.#uncertain === "stop" ? "retry_stop" : "retry_start");
  }

  async stop() {
    if (!this.snapshot().can_stop) return false;
    this.#stopRequestId = this.#startRequest?.request_id ?? this.#window?.request_id;
    // 停止意图一旦表达，任何未知结果的重试只能核对/停止；绝不再重放 start。
    this.#uncertain = "stop";
    this.#consent = false;
    return this.#perform("stop");
  }

  async #perform(kind) {
    const stopping = kind.endsWith("stop");
    const requestId = stopping ? this.#stopRequestId : this.#startRequest.request_id;
    const operation = { kind, session: this.#session, epoch: this.#epoch, controller: new AbortController() };
    this.#operation = operation;
    this.#error = "";
    this.#fence();
    this.#emit();
    const current = () => this.#operation === operation && this.#epoch === operation.epoch && this.#session === operation.session;
    const send = async (action, fields) => {
      if (!current()) throw new Error("stale_wake_request");
      const result = await this.#request(`/api/model/wake/${action}`, { session_token: operation.session, ...fields },
        { signal: operation.controller.signal });
      if (!current()) throw new Error("stale_wake_request");
      return result;
    };
    // 有界的是 HTTP 等待，不是另一个调度/模型循环。取消请求不能撤回已接受的原生工作。
    const timer = setTimeout(() => operation.controller.abort(), 15_000);
    timer?.unref?.();
    try {
      let response;
      if (kind.startsWith("retry_")) {
        try { response = await send("status", { request_id: requestId }); }
        catch (error) {
          if (stopping || error?.code !== "wake_request_unknown") throw error;
          response = await send("start", this.#startRequest);
        }
        if (stopping && response?.wake?.state !== "stopped") response = await send("stop", { request_id: requestId });
      } else {
        response = await send(stopping ? "stop" : "start", stopping ? { request_id: requestId } : this.#startRequest);
      }
      if (!current()) return false;
      const limits = this.#capability?.limits;
      const targetConfigured = readTargetConfigured(response?.wake);
      const window = limits ? readWindow(response?.wake, limits) : null;
      if (response?.ok !== true || window === null || window.request_id !== requestId
        || (!stopping && !this.#matchesStart(window)) || (stopping && window.state !== "stopped")
        || targetConfigured === null || targetConfigured !== this.#capability?.targetConfigured) {
        throw new Error("wake_response_invalid");
      }
      this.#accept(window);
      return true;
    } catch (error) {
      if (!current()) return false;
      if (!stopping && START_REJECTIONS.has(error?.code)) {
        this.#startRequest = null;
        this.#uncertain = null;
        this.#consent = false;
        this.#error = ERRORS[error.code];
      } else {
        this.#uncertain = stopping ? "stop" : "start";
        this.#error = stopping
          ? "停止结果未确认。请核对/停止原窗口；不会重发开启请求。需要禁止迟到公开时，可关闭 AI 或撤销连接。"
          : "开启结果不确定，可能已被接收。原请求及参数已保留；只能显式核对并重试原请求，不会自动重投。";
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (current()) {
        this.#operation = null;
        this.#fence();
        this.#emit();
      }
    }
  }

  snapshot() {
    const context = this.#context;
    const capability = this.#capability;
    const window = capability === null ? null : this.#window;
    // 新请求尚无同键回执时，旧窗口仍保留给门禁/停止判断，但不能冒充本次请求的显示结果。
    const pendingRequestId = this.#startRequest?.request_id ?? this.#stopRequestId;
    const displayedWindow = pendingRequestId != null && window?.request_id !== pendingRequestId ? null : window;
    const scopeAllowed = this.#session !== null && this.#pause === null && context?.bound === true
      && context.confirmed && !context.leaving && capability !== null;
    const connectorReady = capability?.transport !== "remote_connector" || capability.targetConfigured;
    const enabled = scopeAllowed && capability.enabled && context.mode === "ON" && connectorReady;
    const inactive = window === null || window.state === "idle"
      || (window.state === "stopped" && window.cleanup_pending === false && window.cleanup_ok === true);
    const editable = enabled && inactive && this.#operation === null && this.#uncertain === null;
    const parameters = this.#parameters();
    let uiState; let status;
    if (this.#session === null) { uiState = "unbound"; status = "尚未进入自己的牌桌。"; }
    else if (this.#pause !== null) { uiState = "blocked"; status = `${this.#pause.reason}；等待新的本人状态，旧请求结果已隔离。`; }
    else if (capability === null || context === null) { uiState = "invalid"; status = "通知能力或状态未知，暂不能开启。等待有效的本人投影。"; }
    else if (!capability.enabled) { uiState = "unavailable"; status = "本地发送器未启用（默认关闭）。"; }
    else if (!context.bound) { uiState = "unbound"; status = "先连接本席 AI，再为每个通知窗口单独确认。"; }
    else if (!context.confirmed || context.leaving) { uiState = "blocked"; status = "公开范围尚未确认或正在离桌，不能开启通知。"; }
    else if (context.mode === "OFF") { uiState = "off"; status = "本席 AI 已关闭，不会开启新通知窗口。"; }
    else if (context.mode !== "ON") { uiState = "invalid"; status = "本席 AI 状态未知，不能开启通知。"; }
    else if (!connectorReady) { uiState = "awaiting_connector"; status = "等待本机连接器接入。目标游戏任务只在你自己的设备上绑定，页面不接收任务 UUID。"; }
    else if (this.#operation !== null) {
      uiState = this.#operation.kind.endsWith("stop") ? "stopping" : "starting";
      status = uiState === "stopping" ? "正在请求停止，尚未确认。" : "正在核对/开启窗口，尚未确认。";
    } else if (this.#uncertain !== null) {
      uiState = this.#uncertain === "stop" ? "stop_unknown" : "start_unknown";
      status = this.#uncertain === "stop" ? "停止结果不确定，尚未确认停止。" : "开启结果不确定，不会自动重投。";
    } else {
      uiState = { dispatching: "sending", awaiting_result: "awaiting_resolution" }[window?.state] ?? window?.state ?? "idle";
      if (window?.state === "stopped" && window.cleanup_pending) uiState = "stopping";
      status = { idle: "未开启窗口。每次新窗口都需要你明确确认。", waiting: "窗口已开启，等待合格权威待办。",
        sending: "正在发送通知；是否接收尚未确认。", awaiting_resolution: "通知已接收，等待权威 resolve 回执（可能公开或 silent）。",
        stopping: "已停止后续通知，发送资源仍在清理。", stopped: "窗口已停止后续通知。" }[uiState];
    }
    const reason = displayedWindow?.reason ? REASONS[displayedWindow.reason] ?? "服务返回了未识别的停止原因" : "";
    const failure = displayedWindow?.failure_code
      ? `${FAILURE_CODES[displayedWindow.failure_code] ?? "服务返回了受限失败码"}（${displayedWindow.failure_code}）` : "";
    return { ui_state: uiState,
      status_text: `${status}${reason ? ` 原因：${reason}。` : ""}${failure ? ` 诊断：${failure}。` : ""}`,
      enabled: capability?.enabled ?? null, target_configured: capability?.targetConfigured ?? null,
      transport: capability?.transport ?? null,
      limits: capability === null ? null : { ...capability.limits },
      window: displayedWindow === null ? null : { ...displayedWindow }, fields: { ...this.#fields }, consent: this.#consent,
      editable, can_start: editable && this.#consent && parameters.error === undefined,
      can_stop: scopeAllowed && this.#operation === null && (this.#startRequest !== null
        || (window?.request_id != null && (window.state !== "stopped" || window.cleanup_pending))),
      can_retry: scopeAllowed && this.#operation === null && this.#uncertain !== null
        && (this.#uncertain === "stop" || enabled),
      retry_text: this.#uncertain === "stop" ? "核对并停止原窗口" : "核对并重试原请求",
      error: this.#error, validation: editable ? parameters.error
        ?? (capability.targetConfigured
          ? (capability.transport === "remote_connector"
            ? "请确认本次通知次数与持续时长，再勾选授权。目标任务由本机连接器绑定。"
            : "请确认本次通知次数与持续时长，再勾选授权。目标任务由本地发送器固定。")
          : "请确认本次通知次数、持续时长与目标任务，再勾选授权。") : "",
      counts_text: displayedWindow === null ? "尚无本席窗口回执。"
        : `尝试 ${displayedWindow.attempted_count} · 已接收 ${displayedWindow.queued_count} · 权威已结清 ${displayedWindow.resolved_count}（含公开、silent 或丢弃；不是公开回复数）`,
      timing_text: displayedWindow?.elapsed_ms === undefined ? "时长由服务端报告，不用页面计时判断停止。"
        : `已用 ${seconds(displayedWindow.elapsed_ms)} 秒 / 最长 ${seconds(displayedWindow.max_duration_ms)} 秒 · 最多 ${displayedWindow.max_notifications} 次通知`,
      cleanup_text: displayedWindow === null || displayedWindow.state === "idle" ? ""
        : displayedWindow.cleanup_pending ? "发送资源正在清理；原生任务状态仍未知。"
          : displayedWindow.cleanup_ok === true ? "发送资源清理已确认；不代表原生模型回合已结束。"
            : displayedWindow.cleanup_ok === false ? "发送资源清理失败；不能声称干净停止。" : "发送资源清理未确认；原生任务状态未知。",
    };
  }

  // 机器采样只含页面可见的本人状态，不含表单目标任务、会话令牌或不可见的绑定历史。
  visibleState() {
    const view = this.snapshot();
    return { enabled: view.enabled, target_configured: view.target_configured, transport: view.transport,
      limits: view.limits, window: view.window, ui_state: view.ui_state };
  }
}
