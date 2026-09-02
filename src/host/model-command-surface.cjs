"use strict";

// 模型可见的命令面。宿主中立：不引用 Codex / Claude / MCP / Hook。
//
// 与 seat-custody.cjs 的分工：托管层管「凭据不进模型上下文」，这一层管「模型连需要凭据
// 的真人命令都发不出来」。两层解决的是不同问题，缺后者时前者只是把秘密换成了句柄——
// 模型照样能拿句柄去发 hand.act，而句柄同样代表该席的行动能力。
//
// 边界定在哪里：模型只参与「该席 AI 的公开发言」这一条回路，加上公开读取。凡是会改变
// 已确认用户结果的决定都不在这一面上——
//   room.confirm_public_scope  隐私同意。按席位记账不等于「本人确认」，模型代确认时
//                              被承诺的人从未见过那句话。
//   seat.ready                 决定牌局什么时候开始。
//   hand.act                   官方筹码动作。章程写的是真人通过结构化控件提交。
//   hand.reveal                主动公开自己的底牌，不可撤回。
// chat.say / ai.set_mode / ai.hide_local 一并归真人：前者是玩家自己打的字（AI 发言走
// ai.resolve），后两者是玩家对这一席 AI 的开关与本地隐藏偏好。
//
// 模型手里一张句柄也没有，这是本模块与「只做一层白名单」的区别。句柄由 room.create /
// room.join 产生，而那两条是真人命令，模型看不到它们的返回。于是模型能出示的身份凭证只有
// 权威自己发的 intent_id 与 turn_id：一次性、由权威铸造、只能用在这三条 AI 回路命令上。
// 就算白名单被绕过，hand.act 到了核心仍然缺 seat_id 与 recovery_credential——模型造不出来。
//
// 未来的 Advisor / Autopilot 留在这个结构里：那需要真人先逐席开启一条显式授权，届时把
// 对应命令加进白名单，并让授权状态参与解析。本轮不实现，但不必为此重排真人面。

const { MODEL_COMMANDS } = require("../authority/host-surface.cjs");

// 模型不得自带的身份字段。seat_id 与 recovery_credential 由托管层注入；
// viewer_seat_id 同属席位身份——静默忽略会让模型以为过滤生效了，所以报错而不是丢弃。
const MODEL_FORBIDDEN_PARAMS = Object.freeze([
  "seat_id",
  "seat_handle",
  "recovery_credential",
  "viewer_seat_id",
  "binding_id",
  "trustedScope",
  "trusted_scope",
  "scope",
  "model_token",
  "session_token",
  "player_id",
  "credential",
  "claim_token",
]);

// intent_id / turn_id 到句柄的映射上限。不设上限的话，领了却从不启动的意图会一直累积：
// 权威那边的 claim 租约会到期回收，本地这份不会，于是它成了一个只增不减的表。
// 满了丢最旧的：最旧的那些要么已经过了 30 秒 claim 租约，要么已经被权威收回。
const MAX_TRACKED_IDS = 512;
const WAKE_ID = /^(?:intent|turn)-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
// 自动通知只保留稳定错误码，不保留 details、异常正文或上游响应。
// 这让真人能区分“待办已失效”和“领取世代冲突”，又不会把模型/玩家文字变成诊断出口。
const WAKE_ERROR_CODE = /^[a-z][a-z0-9_]{0,79}$/;
const MAX_WAKE_RECEIPTS = 512;

class ModelSurfaceError extends Error {
  constructor(code, details = undefined, status = 400) {
    super(code);
    this.name = "ModelSurfaceError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

class ModelCommandSurface {
  // custody：SeatCustody 实例，句柄与凭据都在它手里。
  // request(command, params) -> { ok, status, body }：打到核心的那一跳，由宿主提供。
  //   注入成 constructor 参数而不是在这里 require：本模块要能在没有核心进程的情况下
  //   被合同测试驱动，而「打到哪」是宿主的事。
  constructor(options = {}) {
    if (options.custody === null || typeof options.custody !== "object") {
      throw new ModelSurfaceError("invalid_field", { field: "custody" });
    }
    if (typeof options.request !== "function") {
      throw new ModelSurfaceError("invalid_field", { field: "request" });
    }
    if (options.scopeIsCurrent !== undefined && typeof options.scopeIsCurrent !== "function") {
      throw new ModelSurfaceError("invalid_field", { field: "scopeIsCurrent" });
    }
    if (options.maxWakeReceipts !== undefined && (!Number.isSafeInteger(options.maxWakeReceipts)
      || options.maxWakeReceipts < 1 || options.maxWakeReceipts > MAX_WAKE_RECEIPTS)) {
      throw new ModelSurfaceError("invalid_field", { field: "maxWakeReceipts" });
    }
    if (options.maxWakeAttempts !== undefined && (!Number.isSafeInteger(options.maxWakeAttempts)
      || options.maxWakeAttempts < 1 || options.maxWakeAttempts > MAX_WAKE_RECEIPTS)) {
      throw new ModelSurfaceError("invalid_field", { field: "maxWakeAttempts" });
    }
    if (options.onWakeReceipt !== undefined && typeof options.onWakeReceipt !== "function") {
      throw new ModelSurfaceError("invalid_field", { field: "onWakeReceipt" });
    }
    // 三样都是私有字段，不是命名约定。类外无论如何取不到：点号取不到、
    // Reflect.ownKeys 列不出、Object.keys 看不见、JSON.stringify 序列化不出。
    //
    // 上一版把 custody 挂成公开属性，于是拿到 surface 的人一步就能
    // custody.resolve(handle) 取出凭据原文——文本出口净化得再干净都没用，因为
    // 根本不用走文本出口。凭据边界不能只是「我们不打算这么用」。
    //
    // issued 同理但方向不同：它可写。外部往里塞一条 intent_id -> handle 就等于
    // 给自己发了一张替那一席行动的通行证，而 ai.start 只查这张表。
    this.#custody = options.custody;
    this.#request = options.request;
    this.#scopeIsCurrent = options.scopeIsCurrent ?? (() => true);
    this.#maxWakeReceipts = options.maxWakeReceipts ?? MAX_WAKE_RECEIPTS;
    this.#maxWakeAttempts = options.maxWakeAttempts ?? MAX_WAKE_RECEIPTS;
    this.#onWakeReceipt = options.onWakeReceipt ?? (() => {});
  }

  #custody;

  #request;

  #scopeIsCurrent;

  #generations = new Map();

  #nextGeneration = 0;

  // 仅协调器读取的观察账。没有正文、上下文、凭据或第二份游戏结果；失败不是终态。
  // 去重跟绑定而不是跟一次监听窗口走，stop/start 和 claim 续期不能重新投递旧意图。
  #wake = new Map();

  #maxWakeReceipts;

  #maxWakeAttempts;

  #onWakeReceipt;

  // 权威发的 id -> { handle, claimToken, bindingId, generation }。两种 id 共用一张表，键空间由
  // 权威保证不撞（intent- / turn- 前缀）。
  //
  // claimToken 记在这里而不是给模型：世代围栏是「这个宿主进程还持有领取权吗」的凭证，
  // 与模型无关。给了模型只是多一个它必须原样搬回来的字段，而搬运途中它可能改、可能忘、
  // 可能连同上下文一起被截断。
  #issued = new Map();

  get commands() {
    return MODEL_COMMANDS;
  }

  // 数目可以公开，映射不行。可检视状态要报「有没有偷偷存一份」，而报数目就够了；
  // 报内容等于把句柄写进日志。
  get trackedCount() {
    return this.#issued.size;
  }

  // 释放路径要清空这张表。给一个方法而不是暴露 Map：clear 之外的操作
  // （set / delete 任意键）都是替某一席发通行证。
  clearIssued() {
    this.#issued.clear();
    this.#wake.clear();
    for (const handle of this.#generations.keys()) this.#generations.set(handle, ++this.#nextGeneration);
  }

  // 绑定换代/撤销在请求 await 之前调用。只删 issued 不够：在途响应会把它再登记回来。
  invalidateHandle(handle) {
    this.#generations.set(handle, ++this.#nextGeneration);
    this.#wake.delete(handle);
    for (const [id, entry] of this.#issued) {
      if (entry.handle === handle) this.#issued.delete(id);
    }
  }

  forgetHandle(handle) {
    this.invalidateHandle(handle);
    this.#generations.delete(handle);
  }

  captureScope(trustedScope, handle) {
    if (trustedScope !== undefined && (trustedScope === null || typeof trustedScope !== "object"
      || typeof trustedScope.seat_handle !== "string" || trustedScope.seat_handle === ""
      || typeof trustedScope.binding_id !== "string" || trustedScope.binding_id === "")) {
      throw new ModelSurfaceError("model_scope_rejected", undefined, 403);
    }
    const seatHandle = trustedScope?.seat_handle ?? handle;
    if (!this.#custody.handles().includes(seatHandle)) {
      throw new ModelSurfaceError("model_scope_rejected", undefined, 403);
    }
    if (!this.#generations.has(seatHandle)) this.#generations.set(seatHandle, ++this.#nextGeneration);
    const scope = {
      handle: seatHandle,
      bindingId: trustedScope?.binding_id ?? null,
      generation: this.#generations.get(seatHandle),
    };
    this.assertScopeCurrent(scope);
    return scope;
  }

  assertScopeCurrent(scope) {
    if (this.#generations.get(scope.handle) !== scope.generation
      || !this.#custody.handles().includes(scope.handle)
      || !this.#scopeIsCurrent({ seat_handle: scope.handle, binding_id: scope.bindingId })) {
      throw new ModelSurfaceError("model_binding_changed", undefined, 403);
    }
  }

  #wakeState(scope) {
    this.assertScopeCurrent(scope);
    if (scope.bindingId === null) return null;
    let state = this.#wake.get(scope.handle);
    if (state === undefined) {
      state = { generation: scope.generation, bindingId: scope.bindingId, records: new Map(), attempted: new Set(), unavailable: false };
      this.#wake.set(scope.handle, state);
    }
    if (state.generation !== scope.generation || state.bindingId !== scope.bindingId) {
      throw new ModelSurfaceError("model_binding_changed", undefined, 403);
    }
    return state;
  }

  // 不属于 MODEL_COMMANDS。只返回本绑定的一个最小记录副本，调用者不能改写观察账。
  wakeReceipt(scope, intentId) {
    const state = this.#wakeState(scope);
    const receipt = state?.records.get(intentId);
    return { available: state !== null && !state.unavailable, receipt: receipt === undefined ? null : { ...receipt } };
  }

  reserveWakeIntent(scope, intentId) {
    const state = this.#wakeState(scope);
    if (state === null || state.unavailable) return { accepted: false, reason: "wake_receipt_unavailable" };
    if (state.attempted.has(intentId)) return { accepted: false, reason: "wake_intent_already_attempted" };
    if (state.attempted.size >= this.#maxWakeAttempts) return { accepted: false, reason: "wake_intent_history_full" };
    if (state.records.get(intentId)?.phase !== "claimed") return { accepted: false, reason: "wake_receipt_unavailable" };
    state.attempted.add(intentId);
    return { accepted: true };
  }

  #observeWake(scope, id, phase, { turnId = null, errorCode = null } = {}) {
    if (scope?.bindingId === null || scope === undefined) return;
    let state;
    try {
      state = this.#wakeState(scope);
      if (state.unavailable) return;
      const intentId = phase === "resolved" || phase === "resolve_failed"
        ? [...state.records.values()].find((entry) => entry.turn_id === id)?.intent_id
        : id;
      if (typeof intentId !== "string" || !WAKE_ID.test(intentId) || !intentId.startsWith("intent-")) {
        state.unavailable = true;
        return;
      }
      let entry = state.records.get(intentId);
      if (phase === "claimed") {
        if (entry !== undefined) return; // 重新领取不能抹掉旧阶段/已尝试事实。
        if (state.records.size >= this.#maxWakeReceipts) { state.unavailable = true; return; }
        entry = { intent_id: intentId, turn_id: null, phase: "claimed" };
        state.records.set(intentId, entry);
      } else if (entry === undefined) {
        state.unavailable = true;
        return;
      } else if (!["start_failed", "resolve_failed", "unknown", "resolved"].includes(entry.phase)) {
        if (phase === "started") {
          if (typeof turnId !== "string" || !WAKE_ID.test(turnId) || !turnId.startsWith("turn-")
            || [...state.records.values()].some((other) => other !== entry && other.turn_id === turnId)) {
            entry.phase = "unknown";
          } else {
            entry.turn_id = turnId;
            entry.phase = "started";
          }
        } else {
          entry.phase = phase;
          if (["start_failed", "resolve_failed"].includes(phase)) {
            entry.error_code = typeof errorCode === "string" && WAKE_ERROR_CODE.test(errorCode)
              ? errorCode : null;
          }
        }
      }
      const observed = this.#onWakeReceipt(Object.freeze({ ...entry }));
      if (observed?.then !== undefined) Promise.resolve(observed).catch(() => { state.unavailable = true; });
    } catch {
      // 观察失败只能让自动通知失败关闭，不能改变已经发生的模型命令/权威结果。
      if (state !== undefined) state.unavailable = true;
    }
  }

  #observeWakeFailure(command, params, trustedScope, error) {
    if (trustedScope === undefined || !["ai.start", "ai.resolve"].includes(command)) return;
    try {
      const scope = this.captureScope(trustedScope);
      const state = this.#wakeState(scope);
      const id = command === "ai.start" ? params.intent_id : params.turn_id;
      const known = command === "ai.start" ? state.records.has(id)
        : [...state.records.values()].some((entry) => entry.turn_id === id);
      if (known) this.#observeWake(scope, id, command === "ai.start" ? "start_failed" : "resolve_failed", {
        errorCode: error?.code,
      });
    } catch { /* 未知/跨世代的输入不能污染另一绑定的观察账。 */ }
  }

  // 权威发的 id 记到句柄与领取令牌上。模型下一步只出示这个 id，其余由本层补。
  track(id, handle, claimToken = null, scope = undefined) {
    if (typeof id !== "string" || id === "") return;
    // 合同一致性 fixture 会用一个不存在的句柄 seed 计数；它不能变成真实授权。
    // 真实领取总会传入已验证 scope，无效 seed 即使被出示也会在 captureScope 被拒。
    const issuedScope = scope ?? { bindingId: null, generation: null };
    if (scope !== undefined) this.assertScopeCurrent(issuedScope);
    if (this.#issued.size >= MAX_TRACKED_IDS) {
      const oldest = this.#issued.keys().next();
      if (!oldest.done) this.#issued.delete(oldest.value);
    }
    this.#issued.set(id, { handle, claimToken, bindingId: issuedScope.bindingId, generation: issuedScope.generation });
  }

  // 权威 id 对应的句柄，不带领取令牌。
  //
  // 给宿主用，不给模型用：宿主的推理运行时要知道「这个回合是哪一席的」，而意图里没有
  // seat_id（上面摘掉它的理由是「留着只会诱使模型回传」）。宿主自己持有句柄到席位的对应，
  // 所以它只缺这一跳。
  //
  // 为什么不直接把 issuedFor 拿去用：那个方法连 claimToken 一起回。领取令牌是世代围栏的
  // 凭证，多一个持有它的调用点就多一处可能被顺手写进日志的地方，而调用方在这里根本不需要它。
  //
  // 不认识的 id 回 null 而不是抛：调用方是驱动循环，一个已经被权威回收的回合不该让整轮停下。
  handleForId(id) {
    if (typeof id !== "string" || id === "") return null;
    return this.#issued.get(id)?.handle ?? null;
  }

  issuedFor(id, field, trustedScope) {
    if (typeof id !== "string" || id === "") {
      throw new ModelSurfaceError("invalid_field", { field });
    }
    const entry = this.#issued.get(id);
    if (entry === undefined) {
      // 不回落到「只绑了一席就用那一席」。猜对了是运气，多席时是替错的人行动，
      // 与 seat-custody.cjs 拒绝猜席位是同一条理由。
      throw new ModelSurfaceError("unknown_authority_id", { field });
    }
    const scope = this.captureScope(trustedScope, entry.handle);
    if (entry.handle !== scope.handle || entry.bindingId !== scope.bindingId) {
      throw new ModelSurfaceError("authority_id_scope_mismatch", { field }, 403);
    }
    this.assertScopeCurrent(entry);
    return entry;
  }

  assertNoIdentityParams(command, params) {
    for (const field of MODEL_FORBIDDEN_PARAMS) {
      if (params[field] !== undefined) {
        throw new ModelSurfaceError("seat_identity_not_model_supplied", { command, field });
      }
    }
  }

  // 单条命令。返回 { ok, status, body }，与 request 同形，不抛业务错误以外的东西。
  async call(command, rawParams = {}, trustedScope = undefined, operation = {}) {
    if (!MODEL_COMMANDS.includes(command)) {
      throw new ModelSurfaceError("command_not_model_facing", { command: command ?? null });
    }
    const params = rawParams === null || typeof rawParams !== "object" || Array.isArray(rawParams)
      ? {}
      : { ...rawParams };
    try {
      this.assertNoIdentityParams(command, params);
      if (command === "ai.take_intents") return await this.takeIntents(params, trustedScope, operation);
      if (command === "ai.start") return await this.start(params, trustedScope, operation);
      if (command === "ai.resolve") return await this.resolve(params, trustedScope, operation);
    } catch (error) {
      this.#observeWakeFailure(command, params, trustedScope, error);
      throw error;
    }
    // 公开读取：不带凭据，也不带席位身份。
    const scope = trustedScope === undefined ? null : this.captureScope(trustedScope);
    const result = await this.#request(command, params, operation);
    if (scope !== null) this.assertScopeCurrent(scope);
    return result;
  }

  // 逐句柄领取，把结果并成一份。
  //
  // 远端调用只取可信绑定指定的一席；无 scope 的调用是受控进程内驱动，排除外部绑定席。
  async takeIntents(params, trustedScope, operation = {}) {
    const externalScope = trustedScope === undefined ? null : this.captureScope(trustedScope);
    const handles = externalScope === null
      ? this.#custody.handles().filter((handle) => this.#scopeIsCurrent({ seat_handle: handle, binding_id: null }))
      : [externalScope.handle];
    const intents = [];
    const failures = [];
    for (const handle of handles) {
      let scope;
      let result;
      try {
        scope = externalScope ?? this.captureScope(undefined, handle);
        const injected = this.#custody.inject("ai.take_intents", { ...params, seat_handle: handle });
        if (operation.signal?.aborted) throw new ModelSurfaceError("wake_cancelled", undefined, 409);
        result = await this.#request("ai.take_intents", injected, operation);
        this.assertScopeCurrent(scope);
        if (operation.signal?.aborted) throw new ModelSurfaceError("wake_cancelled", undefined, 409);
      } catch (error) {
        // 内部驱动一席换绑，不带走别席；外部请求只有一席，整份拒绝即可。
        if (externalScope !== null || !(error instanceof ModelSurfaceError)) throw error;
        failures.push({ code: error.code, status: error.status });
        continue;
      }
      if (!result.ok) {
        // 外部只有本席，失败就是这次调用的结果，不能伪装为「没有待办」。
        if (externalScope !== null) return result;
        // 一席失败不该让其他席的待办一起丢。收集起来随成功结果一起回报。
        failures.push({ code: result.body?.code ?? "take_intents_failed", status: result.status });
        continue;
      }
      for (const intent of result.body?.result?.intents ?? []) {
        this.track(intent.intent_id, handle, intent.claim_token ?? null, scope);
        this.#observeWake(scope, intent.intent_id, "claimed");
        // seat_id 是公开字段（公开投影里就有），但模型不需要它，留着只会诱使模型回传。
        // claim_token 更进一步：它是本宿主的领取凭证，交给模型只会多一条搬运路径。
        // 摘掉两者之后，模型手上除了 intent_id 没有别的可出示。
        const { seat_id: _seatId, claim_token: _claimToken, ...visible } = intent;
        intents.push(visible);
      }
    }
    return {
      ok: true,
      status: 200,
      body: {
        result: {
          intents,
          seats_polled: handles.length,
          ...(failures.length === 0 ? {} : { failures }),
          // 空手而归时说出在等什么。见 emptyHandedReason 的理由。
          ...(intents.length === 0 ? emptyHandedReason(handles.length) : {}),
        },
      },
    };
  }

  async start(params, trustedScope, operation = {}) {
    const scope = this.issuedFor(params.intent_id, "intent_id", trustedScope);
    const { handle, claimToken } = scope;
    // 领取令牌由本层补，与席位身份同理。模型没见过它，所以也不可能改坏它。
    const injected = this.#custody.inject("ai.start", {
      ...params,
      seat_handle: handle,
      ...(claimToken === null ? {} : { claim_token: claimToken }),
    });
    const result = await this.#request("ai.start", injected, operation);
    this.assertScopeCurrent(scope);
    if (result.ok) {
      const turnId = result.body?.result?.started?.turn_id;
      this.track(turnId, handle, null, scope);
      // 意图已经变成回合，这个 intent_id 不会再用。
      this.#issued.delete(params.intent_id);
      this.#observeWake(scope, params.intent_id,
        result.ok === true && result.body?.ok !== false ? "started" : "unknown", { turnId });
    } else {
      this.#observeWake(scope, params.intent_id, "start_failed", { errorCode: result.body?.code });
    }
    return result;
  }

  async resolve(params, trustedScope, operation = {}) {
    const scope = this.issuedFor(params.turn_id, "turn_id", trustedScope);
    const { handle } = scope;
    const injected = this.#custody.inject("ai.resolve", { ...params, seat_handle: handle });
    const result = await this.#request("ai.resolve", injected, operation);
    this.assertScopeCurrent(scope);
    // 成功与否都摘掉：回合已经交出去了，重放同一个 turn_id 该由权威判定，
    // 不该由本层用一份陈旧映射帮它成立。
    if (result.ok) this.#issued.delete(params.turn_id);
    const receipt = result.body?.result?.resolved;
    const resolved = result.ok === true && result.body?.ok !== false && receipt?.turn_id === params.turn_id;
    this.#observeWake(scope, params.turn_id, resolved ? "resolved" : "resolve_failed", {
      errorCode: resolved ? null : result.body?.code,
    });
    return result;
  }
}

// 空手而归时，模型在等的是两件完全不同的事。
//
// 缺陷本体：这两种处境此前返回同一份东西——`{ intents: [], seats_polled: N }`。
//
//   一席都没绑     没有人打开牌桌坐下。轮询到世界末日都不会变，要**真人**去建房或加入。
//   绑了但没待办   此刻确实没有该说话的意图。再轮询一次就对了。
//
// 而模型读到的是同一句话，于是它只能做同一件事：继续轮询。宿主那边看起来是「AI 在等」，
// 实际是没有人告诉过它「你还没有席位」。那正是「缺失时不能静默卡住」要挡的形态：
// 缺的不是能力，是那句话。
//
// 为什么不报错：模型问了一个合法的问题，得到的是一个合法的答案（此刻没有待办）。
// 报错会让每一次开局前的轮询都进错误计数，而 driveErrors 是诊断真故障的唯一入口，
// 被这种噪声填满就等于没有。
//
// next_step 是给人看的，经模型转达。模型自己解决不了「去浏览器里坐下」这件事，
// 但它能把这句话说出来——这就是可见兜底与静默卡住的全部差别。
function emptyHandedReason(seatsPolled) {
  if (seatsPolled === 0) {
    return {
      waiting_on: "human_entry",
      next_step: "本机协调器上还没有任何席位。请真人在浏览器里打开牌桌，建房或用邀请码加入；"
        + "入座之后本席才会有待办。在那之前继续轮询不会有变化。",
    };
  }
  return {
    waiting_on: "table",
    next_step: "本席在座，此刻没有该说话的意图。稍后再取一次即可，不需要真人做任何事。",
  };
}

module.exports = {
  MODEL_FORBIDDEN_PARAMS,
  ModelCommandSurface,
  ModelSurfaceError,
  MAX_WAKE_RECEIPTS,
};
