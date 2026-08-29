"use strict";

// 浏览器牌桌的本机协调器。宿主中立：不引用 Codex / Claude / MCP。
//
// 存在的理由，一句话：核心刻意不能被浏览器直接访问，所以必须有人站在中间。
// 具体是三件事，每一件都不能靠「前端记得别那么做」来解决：
//
//   1. 命令服务没有 CORS、要传输令牌、只听回环（command-server.cjs 里都是刻意的）。
//      浏览器既拿不到令牌也过不了同源检查。把令牌发给浏览器就等于把权威开放给任何
//      本机网页。
//   2. 席位凭据是长期有效的秘密。F6 已经为「模型可见」建了托管层；浏览器是同一个问题的
//      另一面——localStorage、URL、扩展、devtools、截图，每一处都是泄漏面。所以浏览器
//      拿到的是会话令牌，凭据只在本进程内存里。
//   3. 「每个客户端只能收到公共状态和自己的底牌」要成立，筛选就必须发生在浏览器拿到
//      数据之前。所以这里只回视图模型，不回原始投影，也不回原始权威事件。
//
// 三条自我约束：
//   1. 不新增产品语义。所有判定都由核心做；本层只有「翻译 + 组装 + 拒绝」。
//   2. 不调模型。模型只在适配器里，适配器由调用方注入。没有适配器就是没有 AI，
//      如实显示，不用脚本冒充。
//   3. 不放宽发布门禁。非回环地址直接拒绝，与 command-server 同一条理由。

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { closeServer, listen, readJson, sendJson } = require("../shared/http.cjs");
const { CoreError } = require("./core-client.cjs");
const { SeatCustody } = require("./seat-custody.cjs");
const { ModelCommandSurface, ModelSurfaceError } = require("./model-command-surface.cjs");
const viewModel = require("./table-view-model.cjs");
const { LIVELY_V1 } = require("../authority/seat-ai-store.cjs");

const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "::1", "localhost"]);
const MAX_BODY_BYTES = 64 * 1024;

// 连接租约。每次读视图续一次；超过这个时长没续就按掉线处理。
//
// 8 秒的取法：轮询间隔 700ms，所以正常情况下每 8 秒有十来次续租的机会，丢几次不会误判；
// 而它又明显短于 120 秒保留窗，掉线判定不会把「120 秒后释放」拖成「租约 + 120 秒」。
//
// 为什么必须有它：在此之前 seat.disconnect 只由「模拟掉线」那个按钮触发，页面上既没有
// pagehide 也没有 sendBeacon。真实的关标签页、刷新、拔网线，权威侧那一席都还是 connected，
// 于是保留窗永远不起算、位子永远不还、桌子凑不齐下一手，而别人只看到一个「在线但永远
// 不行动」的席位。beacon 之类的告别信号在崩溃、断电、拔网线时根本发不出，所以它只能是
// 加速手段，不能是判定依据——要求里那句「不能作为唯一断线依据」说的就是这件事。
const CONNECTION_LEASE_MS = 8_000;

// 入口键的长度下界。
//
// 入口键能换回一个会话令牌，所以它的熵就是这道门的强度：短键等于让人可以枚举「有没有
// 别人刚建过房」，命中就拿到那一席的会话。浏览器用 crypto.randomUUID() 生成（36 字符、
// 122 位），这个下界只是把明显不合格的挡在外面，顺带让「忘了生成、传了个空串」报出来
// 而不是被当成「没带键」放过。
//
// 它跟会话令牌同一性质，因此同样不进 URL、不进日志、不进任何视图模型。
const MIN_ENTRY_KEY_LENGTH = 16;

// 「这是一个能用的入口键吗」只有这一个定义。拒绝路径和记账路径都问它。
function usableEntryKey(value) {
  return typeof value === "string" && value.length >= MIN_ENTRY_KEY_LENGTH;
}

// 「这一席已经不在了」的错误码。三者对本层是同一件事：会话指向的席位没了，该清理。
// 与 driveOnce 里那一组保持同一份定义——分成两份的话，加了新码只改一处会让另一处
// 把「席位没了」当成故障抛出去。
const SEAT_GONE_CODES = Object.freeze([
  "seat_credential_revoked",
  "seat_not_found",
  "recovery_credential_rejected",
]);

// 浏览器可以发的动作。这是白名单而不是黑名单：新增一条核心命令时，默认对浏览器不可见。
//
// 刻意不在其中的两类，理由不同：
//   ai.start / ai.resolve —— 那是「以该席 AI 的名义发言」。让浏览器能发就等于玩家可以
//     手打一句话冒充自己的 AI，于是「AI 说了什么」不再有任何可信度。这两条只由本进程的
//     适配器驱动器调用。
//   view.room_events / view.ai_events —— 原始权威事件。host-surface 已把它们划为诊断口，
//     且它们绕过规则 7 的本地隐藏。
const BROWSER_ACTIONS = Object.freeze([
  "room.confirm_public_scope",
  "seat.ready",
  "seat.sit_out_after_hand",
  "seat.leave",
  "seat.connect",
  "seat.disconnect",
  "hand.act",
  "hand.reveal",
  "chat.say",
  "ai.set_mode",
  "ai.hide_local",
]);

class TableWebHost {
  constructor(options = {}) {
    if (typeof options.core?.dispatch !== "function") {
      throw new CoreError("invalid_field", 400, { field: "core" });
    }
    this.core = options.core;
    this.webRoot = options.webRoot ?? path.resolve(__dirname, "../../web/table");
    this.custody = options.custody ?? new SeatCustody();
    // 会话令牌 -> 席位句柄。两层而不是一层：句柄是 F6 托管层的对象，会话是浏览器这一侧的
    // 对象，它还要记住本地隐藏之类只属于这个查看者的东西。合成一个会让「换发句柄」和
    // 「浏览器重新连接」互相牵连。
    this.sessions = new Map();
    // 入口键 -> 那次入口的完整响应。只为一件事存在：让「请求到了、座位建了、响应丢了」
    // 之后的重试回到同一个座位，而不是撞上 room_already_exists /
    // player_binding_not_released 卡在入口页。
    //
    // 为什么做在这一层而不是核心：room.create / room.join 属于 identity_creation，核心
    // 刻意没给它们幂等账，「同一个人不能同时占两个座」正是那两条 409 在保护的东西。要
    // 改的是协调器对重复请求的应答，不是内核的绑定语义——所以这里存的是「上次那份响应」，
    // 而不是放宽下面任何一条检查。
    this.entryKeys = new Map();
    // 模型命令面。与真人命令共用**同一份** this.custody，这是「唯一协调器」的全部内容。
    //
    // 为什么必须共用：席位凭据只在 room.create / room.join 的返回里出现一次，而那两条是
    // 真人命令，落点在这个进程。别的进程另起一份 SeatCustody 时，往里 bind 的入口一个也
    // 没有，于是 ai.take_intents 扇出到 custody.handles() === [] ——模型收到空意图，一个
    // 席位也驱动不了，而这件事在日志里看起来一切正常。test/coordinator-single-custody
    // 里那条「另起一份托管的模型面看不见任何席位」就是这个后果的可执行形式。
    //
    // 这不是新增一层：模型命令的实现原本就在 ModelCommandSurface 里，只是从来没有人在
    // 产品路径上构造它。driveOnce 手搓的那份扇出与 intent_id 记账是它的重复实现，
    // 收敛做的是把重复的那份删掉。
    this.modelSurface = new ModelCommandSurface({
      custody: this.custody,
      request: (command, params) => this.coreRequest(command, params),
    });
    this.modelAdapter = options.modelAdapter ?? null;
    this.now = options.now ?? (() => Date.now());
    this.limits = options.limits ?? LIVELY_V1;
    // 适配器驱动的节流。默认 250 毫秒：AI 启动间隔下限是 5 秒（LIVELY_V1），驱动只要
    // 明显快于它就不会成为瓶颈；再快只是徒增空轮询。
    this.driveIntervalMs = options.driveIntervalMs ?? 250;
    // 等模型的上限。必须明显短于 120 秒的评估租约：等到租约到期才放手意味着权威已经把
    // 回合收回去了，适配器随后那次 resolve 只会被判成迟到输出丢弃——那一席白等了两分钟，
    // 而这两分钟里它一直显示在思考。取 30 秒：给真模型足够时间，又留足余量让 silent
    // 收尾赶在租约之前落地。
    this.adapterTimeoutMs = options.adapterTimeoutMs ?? 30_000;
    // 诊断环形缓冲的上限。做成可注入是为了让「超过上限会丢最旧的」这条能被测到：真实上限
    // 是 50，而一手牌里真人发言有额度（12 条/人/手），测试凑不出 51 条而不去改动产品规则。
    // 不可注入的上限等于一条只能靠读代码相信的不变量。
    this.maxDriveErrors = options.maxDriveErrors ?? 50;
    // 连接租约。可注入是为了让「到期真的会断」这条能在注入时钟下判定；默认值本身
    // 由 test/connection-lease.test.cjs 钉在「明显长于轮询间隔、明显短于保留窗」之间。
    this.connectionLeaseMs = options.connectionLeaseMs ?? CONNECTION_LEASE_MS;
    // 扫描间隔。取租约的四分之一：判定的迟到上限就是这个间隔，而扫描本身只是
    // 遍历几个会话，密一点没有代价。
    this.sweepIntervalMs = options.sweepIntervalMs ?? Math.max(500, Math.floor(this.connectionLeaseMs / 4));
    this.sweepTimer = null;
    this.driveTimer = null;
    this.driving = false;
    this.driveErrors = [];
    this.server = http.createServer((request, response) => {
      this.handle(request, response).catch((error) => this.fail(response, error));
    });
  }

  // ------------------------------------------------------------------ 会话

  sessionToken() {
    // 会话令牌只在本进程内存里有意义，进程结束即失效——与 F6 的句柄同一性质。
    return `web-session-${require("node:crypto").randomUUID()}`;
  }

  // ------------------------------------------------------------------ 入口幂等

  // 取出这次入口键对应的既有响应，或者判定这是一次新请求。
  //
  // 返回 null 表示「继续按新请求处理」；返回对象表示「原样回放」。任何不一致都抛错而不是
  // 静默选一边：同一个键配上另一个 player_id，最省事的做法是回放上次那份响应，但那等于
  // 把第一个人的会话令牌交给第二个请求者。
  entryReplay(kind, keyValue, identity) {
    if (keyValue === undefined || keyValue === null) return null;
    if (!usableEntryKey(keyValue)) {
      // 不回落到「当成没带键」。带了一个不合格的键说明调用方以为自己有重放保护，
      // 而静默降级会让它在真的丢响应时才发现没有——那时已经卡住了。
      throw new CoreError("invalid_field", 400, { field: "entry_key" });
    }
    const existing = this.entryKeys.get(keyValue);
    if (existing === undefined) return null;
    if (existing.kind !== kind || existing.identity !== identity) {
      throw new CoreError("entry_key_conflict", 409, { field: "entry_key" });
    }
    // 刻意不在这里再查一次「这个会话还在不在」。
    //
    // 写过那么一层：!this.sessions.has(...) 就丢掉记录、当成新请求。它读不到任何东西——
    // sessions.delete 全仓只有一处，紧跟着的下一行就是 forgetEntryKeysFor，两者之间没有
    // await，所以键必然先于任何一次重放消失，那个分支恒假。变异测试正是这么暴露出来的：
    // 删掉整个分支，没有一条测试变红。
    //
    // 恒假的条件和恒真的断言是同一类问题——都不读现实，都不会变红。项 4 那处
    // settlement.payouts 是同一个毛病的另一面，所以这里按同样的办法处理：删掉，让唯一
    // 的机制（清理时即时删键）成为唯一的机制。
    return existing.response;
  }

  // 没带键就不记账：幂等是可选的加固，不带键的老客户端照样能建房，只是没有重放保护。
  // 用同一个 usableEntryKey 而不是就地再写一遍条件——两处各写一遍时，改了下界只改一处会
  // 让「拒绝」和「记账」对什么算合格的键产生分歧，而那种分歧的表现是键存进去了却换不回来。
  rememberEntry(kind, keyValue, identity, response) {
    if (!usableEntryKey(keyValue)) return;
    this.entryKeys.set(keyValue, { kind, identity, response });
  }

  forgetEntryKeysFor(token) {
    for (const [key, entry] of [...this.entryKeys]) {
      if (entry.response.session_token === token) this.entryKeys.delete(key);
    }
  }

  requireSession(tokenValue) {
    const token = typeof tokenValue === "string" ? tokenValue : "";
    const session = this.sessions.get(token);
    if (session === undefined) {
      // 不区分「没有这个会话」与「会话已失效」，也不回会话清单：那会把这里变成枚举口。
      throw new CoreError("web_session_unknown", 403);
    }
    return session;
  }

  // 席位授权命令统一由托管层注入 seat_id + recovery_credential。浏览器给的任何
  // seat_id / recovery_credential 都会让 inject 抛错，这正是要的行为。
  injected(command, session, params) {
    return this.custody.inject(command, { ...params, seat_handle: session.seat_handle });
  }

  // ------------------------------------------------------------------ 模型命令面

  // 打到核心的那一跳，包成 { ok, status, body } 交给模型命令面。
  //
  // 为什么要这层形状转换：核心客户端的约定是「成功回 result、失败抛 CoreError」，而模型
  // 命令面要的是逐跳不抛——一席失败不能带走别席。两种约定各有理由，转换点必须只有一个，
  // 否则「哪一层会抛」这件事会在调用链上变得靠记忆。
  //
  // body 是命令服务响应体的形状（{ ok, result } / { ok, code }），与 MCP 进程那条 HTTP
  // 路径同形。不同形的话，同一个模型命令在两种传输下会读到不同的字段。
  async coreRequest(command, params) {
    try {
      const result = await this.core.dispatch(command, params);
      return { ok: true, status: 200, body: { ok: true, result } };
    } catch (error) {
      return {
        ok: false,
        status: error?.status ?? 400,
        body: {
          ok: false,
          code: error?.code ?? "core_request_failed",
          ...(error?.details === undefined ? {} : { details: error.details }),
        },
      };
    }
  }

  // 模型命令的唯一入口。进程内驱动与远端模型客户端都走它。
  //
  // 回 { ok, status, body } 而不是抛：调用方之一是 driveOnce 的循环，而那里任何一次抛出
  // 都会带走同一轮里后面所有席位。另一个调用方是 HTTP 路由，它要的也是可直接落盘的形状。
  //
  // 拒绝理由不吞。ModelSurfaceError 是本地拒绝（真人命令、模型自带席位身份、伪造的权威
  // id），它必须原样回给调用方——吞掉会让模型以为自己发对了而结果为空。
  async modelCommand(command, params = {}) {
    try {
      return await this.modelSurface.call(command, params ?? {});
    } catch (error) {
      if (!(error instanceof ModelSurfaceError)) throw error;
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          code: error.code,
          command: typeof command === "string" ? command : null,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      };
    }
  }

  // 句柄 -> seat_id。推理运行时要知道自己在替哪一席说话，而模型面刻意把 seat_id 从意图里
  // 摘掉了（摘它的理由是「留着只会诱使模型回传」）。
  //
  // 从 this.sessions 里 join 而不是问托管层：托管层的 resolve 会连凭据一起回来，
  // 而这里只需要一个公开字段。少一处取凭据的调用就少一处泄漏面。
  seatIdForHandle(handle) {
    for (const session of this.sessions.values()) {
      if (session.seat_handle === handle) return session.seat_id;
    }
    return null;
  }

  // ------------------------------------------------------------------ 视图组装

  async buildView(session, options = {}) {
    // 读视图即续租。放在最前面而不是最后：视图组装过程中任何一步抛错都不该让这次
    // 「浏览器还活着」的证据丢掉，否则一个正在报错的页面会被顺带判成掉线。
    await this.touchConnection(session, options.connectionId);
    const seatId = session.seat_id;
    const projection = await this.core.dispatch("view.projection");
    const privateHand = (await this.core.dispatch(
      "view.hand",
      this.injected("view.hand", session, {}),
    )).hand;

    // 逐席 AI 状态。view.seat 不需要凭据（mode/status 是公开事实：对手要能看到你的 AI
    // 是 OFF 还是 THINKING），所以这里可以为所有席位取。
    const aiStates = {};
    for (const seat of projection.room?.seats ?? []) {
      try {
        const seatView = await this.core.dispatch("view.seat", { seat_id: seat.seat_id });
        aiStates[seat.seat_id] = seatView.ai;
      } catch (error) {
        // 单席读取失败不该让整个视图 500。席位可能刚好在这一刻被释放。
        if (error?.code !== "seat_not_found") throw error;
      }
    }

    // 时间线按查看者取：locally_hidden_for_viewer 只有权威能算，因为隐藏名单存在
    // seat-ai-store 里（规则 7 说它不写权威事件，但它确实是该席自己的状态）。
    const timeline = (await this.core.dispatch("view.timeline", {
      viewer_seat_id: seatId,
    })).timeline;

    const localHidden = this.localHiddenFor(session);

    const view = viewModel.build({
      roomState: projection.room ?? null,
      publicHand: projection.public_hand ?? null,
      privateHand,
      timeline,
      aiStates,
      viewerSeatId: seatId,
      localHidden,
      pendingIntentCount: projection.pending_intent_count ?? 0,
      modelAdapter: this.modelAdapter === null ? null : {
        attached: true,
        label: this.modelAdapter.label ?? "unnamed-adapter",
        // 适配器自己声明是不是模拟的。默认按模拟处理：一个没表态的适配器更可能是
        // 测试替身，而把测试替身显示成真实模型正是不能发生的那件事。
        simulated: this.modelAdapter.simulated !== false,
      },
      limits: { max_text_graphemes: this.limits.maxGraphemesPerMessage ?? null },
      // 发言限制的版本串。this.limits 就是 LIVELY_V1（或注入的替代品），也就是权威侧
      // seat-ai-store 记进确认里的那一份——两处必须取自同一个对象，否则「限制变了吗」
      // 永远答错。刻意不用 roomState.limits_version：那是 TABLE_LIFECYCLE_V1，管席位数
      // 和保留窗，与规则 3 要重新确认的东西无关。
      speechLimitsVersion: this.limits.version ?? null,
      // 权威当下的同意 epoch，原样转交。
      //
      // 关键是「原样转交」而不是在这一层重算：this.limits 是宿主自己那份 LIVELY_V1，
      // 权威用的是它自己那份。两份通常相同，但真正给同意门把关的是权威那一份，
      // 所以界面必须拿权威报的那个值去比。在这里重算等于让界面按宿主的看法判断
      // 权威会不会放行——两者一旦不同，界面就会给出一个权威并不同意的结论。
      currentPolicyEpoch: projection?.policy_epoch ?? null,
      // 座位旁气泡的退出时刻按协调器的时钟算。不传的话 recent_speech 恒为空，
      // 座位旁一条都不显示——测试里注入的假时钟也走这条路，所以退出时刻可判定。
      now: this.now(),
    });

    // 双保险：视图模型已做结构自检（禁止的键名），这里再按秘密原文扫一遍。两者方向不同，
    // 缺任何一个都留着一条路：结构检查抓不住「凭据被塞进 text 字段」，原文扫描抓不住
    // 「键在但值恰好为空」。
    this.custody.assertNoLeak(JSON.stringify(view), "web_view");
    return view;
  }

  // 本地隐藏名单。权威确实存了它（时间线的 locally_hidden_for_viewer 就是它算的），
  // 但没有任何命令把这份名单整体读回来——时间线只给逐条布尔。UI 需要名单本身：一个从
  // 未发言的人也可以被隐藏，而它得能显示「已隐藏」并允许取消。
  //
  // 所以本进程跟着记一份。它不会与权威分叉，因为写入顺序是「先发命令、成功后才记」
  // （见 postAction）。反过来先记后发会在命令失败时留下一条只有本进程知道的隐藏。
  localHiddenFor(session) {
    return {
      players: [...session.hidden.players],
      ais: [...session.hidden.ais],
      seats: [...session.hidden.seats],
    };
  }

  // ------------------------------------------------------------------ 模型适配器驱动

  // 取意图 -> 起回合 -> 调推理运行时 -> 回填。
  //
  // 命令那三跳全部经 this.modelSurface 走，与远端模型客户端**同一条实现**。此前这里手搓
  // 了一份：在 this.sessions 上扇出、自己拼 claim_token、自己记 intent_id 到席位的对应。
  // 那份与 ModelCommandSurface 做的是同一件事，而两份同义实现只会朝一个方向漂——某一侧
  // 忘了带 claim_token 或漏了一席，表现是「AI 偶尔不说话」，没有任何东西会红。
  //
  // 收敛顺带修掉一个活性缺陷：起回合原本是裸 await，一次抛出会带走同一轮里后面所有席位，
  // 而那些席位的回合压根没起来，权威侧的租约救不了它们。模型面逐跳回 { ok, body }，
  // 所以一席的失败在结构上到不了别席。
  //
  // 没有推理运行时时整个循环不跑：没有模型就是没有 AI 发言，视图里 attached: false 如实
  // 说明。用脚本假装模型能力正是不能做的那件事。
  async driveOnce() {
    if (this.modelAdapter === null) return { started: 0, resolved: 0 };
    if (this.driving) return { started: 0, resolved: 0, skipped: true };
    this.driving = true;
    let started = 0;
    let resolved = 0;
    try {
      // 一次取全部席位的待办。扇出在模型面里按 custody.handles() 做——那正是「本进程
      // 真正托管着的席位」，与旧代码遍历 sessions 是同一集合（会话与绑定同生同灭）。
      const claim = await this.modelCommand("ai.take_intents", {});
      // 逐席失败已经被模型面收进 failures，不会中断别席。席位没了是正常结果，其余记账。
      for (const failure of claim.body?.result?.failures ?? []) {
        if (SEAT_GONE_CODES.includes(failure?.code)) continue;
        this.driveErrors.push({ at: this.now(), code: failure?.code ?? "take_intents_failed" });
        if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
      }
      // 刻意不检查 `claim.ok`。
      //
      // 写过那么一段：!claim.ok 就记一笔然后 return。它恒假——takeIntents 无条件回
      // ok:true，逐席失败全部收进上面那个 failures 数组，而 modelCommand 只在
      // ModelSurfaceError 时回 ok:false，那需要「命令不在模型面上」或「自带席位身份」，
      // 两者在这个调用点都不可能（命令是字面量，参数是空对象）。
      //
      // 恒假的分支与恒真的断言是同一类问题：都不读现实，都不会变红。变异测试正是这么
      // 暴露出来的——把整个分支换成 if (false)，没有一条测试变红。真的实现缺陷让它抛，
      // 由 startDriver 的 catch 记账。
      for (const intent of claim.body?.result?.intents ?? []) {
        // claim_token 由模型面按 intent_id 补回（F5 世代围栏）。这里刻意不碰它：它是
        // 本宿主的领取凭证，经过这一层只会多一条搬运路径，而搬运途中可能改、可能忘。
        const startResult = await this.modelCommand("ai.start", { intent_id: intent.intent_id });
        if (!startResult.ok) {
          // 起回合失败是这一席的确定性结果，不是驱动故障：记一笔，继续下一席。
          this.driveErrors.push({
            at: this.now(),
            code: startResult.body?.code ?? "start_failed",
          });
          if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
          continue;
        }
        const turn = startResult.body.result.started;
        started += 1;

          // 推理运行时要知道自己在替哪一席说话，而意图里没有 seat_id（模型面摘掉了它）。
          // 从协调器自己的会话表里 join——句柄由模型面按 intent_id 记着。
          const seatId = this.seatIdForHandle(this.modelSurface.handleForId(turn.turn_id));

        // 适配器只看到权威给的上下文。它拿不到对手底牌，因为上下文是权威组装的。
        //
        // 三种失败在这里收敛成同一种结果：抛错、超时、返回畸形结构，全都落成一次 silent。
        // 理由是活性而不是整洁——回合悬着会一直占着 active_turn，该席在整个租约期内
        // 不可能再有第二次发言机会；而 driveOnce 是一个 for 循环，一席抛出会带走同一轮
        // 里后面所有席位，那些席位的回合压根没起来，权威侧的租约救不了它们。
        let decision;
        try {
          decision = await withTimeout(
            this.modelAdapter.evaluate({
              seat_id: seatId,
              turn_id: turn.turn_id,
              context: intent.context,
            }),
            this.adapterTimeoutMs,
          );
        } catch (error) {
          decision = {
            decision: "silent",
            failure: error?.code === "adapter_timeout"
              ? "adapter_timeout"
              : error?.message ?? "adapter_failed",
          };
        }

        // 归一化。模型返回的是自由结构，所以「不是我认识的形状」必须当成 silent 而不是
        // 原样转发：转发过去权威会拒，回合按 F5 的判断留在原地，于是这一席要等满租约
        // 才回到 IDLE——有界，但那两分钟里它一直显示在思考，而它其实早就没救了。
        const normalized = normalizeDecision(decision);
        if (normalized.failure !== undefined) {
          this.driveErrors.push({ at: this.now(), code: normalized.failure });
          if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
        }

        const params = { turn_id: turn.turn_id, decision: normalized.decision };
          if (normalized.decision === "public_speech") params.text = normalized.text;
        const resolveResult = await this.modelCommand("ai.resolve", params);
        if (resolveResult.ok) {
          resolved += 1;
        } else {
          // 回填被权威拒绝（额度耗尽、迟到跨手、文本超长）是正常的确定性结果，
          // 不是驱动故障。记录下来供诊断，不重试——重试会再消耗一次配额判定。
          this.driveErrors.push({
            at: this.now(),
            code: resolveResult.body?.code ?? "resolve_failed",
          });
          if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
        }
      }
    } finally {
      this.driving = false;
    }
    return { started, resolved };
  }

  // 连接租约的扫描表。与适配器驱动分开起，因为它必须在没有模型适配器时也运行：
  // 一桌没有 AI 的真人牌局同样需要掉线判定，而 startDriver 在 modelAdapter 为 null 时
  // 直接返回。合成一个表会让「没接模型的桌子永远判不了掉线」，且那件事在有模型的
  // 测试环境里看不出来。
  startSweeper() {
    if (this.sweepTimer !== null) return;
    this.sweepTimer = setInterval(() => {
      this.sweepConnections().catch((error) => {
        this.driveErrors.push({ at: this.now(), code: error?.code ?? "sweep_failed" });
        if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
      });
    }, this.sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  startDriver() {
    if (this.driveTimer !== null || this.modelAdapter === null) return;
    this.driveTimer = setInterval(() => {
      this.driveOnce().catch((error) => {
        this.driveErrors.push({ at: this.now(), code: error?.code ?? "drive_failed" });
        if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
      });
    }, this.driveIntervalMs);
    this.driveTimer.unref?.();
  }

  stopDriver() {
    if (this.driveTimer === null) return;
    clearInterval(this.driveTimer);
    this.driveTimer = null;
  }

  stopSweeper() {
    if (this.sweepTimer === null) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  // ------------------------------------------------------------------ HTTP

  async handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        service: "tokengame-table-web-host",
        core_transport: this.core.transport ?? "unknown",
        model_adapter_attached: this.modelAdapter !== null,
        sessions: this.sessions.size,
      });
      return;
    }

    if (request.method === "GET") {
      await this.serveStatic(url, response);
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, code: "method_not_allowed" });
      return;
    }

    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      sendJson(response, 413, { ok: false, code: "request_body_too_large" });
      return;
    }
    const body = await readJson(request, MAX_BODY_BYTES);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      sendJson(response, 400, { ok: false, code: "invalid_field", details: { field: "body" } });
      return;
    }

    switch (url.pathname) {
      case "/api/room/create": return this.postCreate(response, body);
      case "/api/room/join": return this.postJoin(response, body);
      case "/api/session/resume": return this.postResume(response, body);
      case "/api/session/disconnect": return this.postDisconnect(response, body);
      case "/api/view": return this.postView(response, body);
      case "/api/action": return this.postAction(response, body);
      default:
        sendJson(response, 404, { ok: false, code: "unknown_route" });
    }
  }

  async postCreate(response, body) {
    const replay = this.entryReplay("create", body.entry_key, body.player_id);
    if (replay !== null) {
      sendJson(response, 200, replay);
      return;
    }
    const created = await this.core.dispatch("room.create", {
      player_id: body.player_id,
      table_rules_version: body.table_rules_version ?? "table-rules-v1",
      ...(body.max_seats === undefined ? {} : { max_seats: body.max_seats }),
    });
    // 凭据在这里出现一次，立刻换成句柄，之后任何面上都不再出现。
    const bound = this.custody.bindFromResult(created);
    const session = await this.openSession(bound);
    // 邀请码要给浏览器：建房的人必须看得见才能转给朋友（同 F6 对邀请码的判断）。
    // 但它不进 knownSecrets 之外的任何地方，也不进视图模型。
    this.custody.remember(created.invite_code);
    const payload = {
      ok: true,
      session_token: session.token,
      seat_id: session.seat_id,
      // 连接 id 明确回给浏览器。openSession 用会话令牌当首个连接 id，而
      // postDisconnect 在缺参数时也回落到会话令牌——两处巧合相等，但依赖巧合会在
      // 任一侧改动时断掉，而断掉的表现是「点了掉线却没掉」，很难查。
      connection_id: session.first_connection_id,
      // 邀请码只在 room.create 的返回里出现这一次。所以整份响应必须存下来重放，而不是
      // 重放时按会话重新拼一份：那样重试成功的人拿不到邀请码，等于建了一张没人能加入的桌。
      invite_code: created.invite_code,
      room_id: created.room?.room_id ?? null,
    };
    this.rememberEntry("create", body.entry_key, body.player_id, payload);
    sendJson(response, 200, payload);
  }

  async postJoin(response, body) {
    const replay = this.entryReplay("join", body.entry_key, body.player_id);
    if (replay !== null) {
      sendJson(response, 200, replay);
      return;
    }
    const joined = await this.core.dispatch("room.join", {
      player_id: body.player_id,
      invite_code: body.invite_code,
    });
    const bound = this.custody.bindFromResult(joined);
    const session = await this.openSession(bound);
    const payload = {
      ok: true,
      session_token: session.token,
      seat_id: session.seat_id,
      connection_id: session.first_connection_id,
      room_id: joined.room?.room_id ?? null,
    };
    this.rememberEntry("join", body.entry_key, body.player_id, payload);
    sendJson(response, 200, payload);
  }

  async openSession(bound) {
    if (bound.seat_handle === null) {
      throw new CoreError("seat_handle_missing", 500);
    }
    const token = this.sessionToken();
    const session = {
      token,
      seat_handle: bound.seat_handle,
      seat_id: bound.seat_id,
      // 一个会话可以有多个连接：同一玩家开两个窗口是合法的，而权威的保留窗要求「最后一个
      // 有效连接消失」才起算。把连接 id 收成集合而不是一个字段，正是为了不把两个窗口
      // 中的一个关掉说成掉线。
      connections: new Set(),
      // 连接 id -> 最后一次续租时刻。按连接而不是按会话记：同一玩家开两个窗口时，
      // 关掉一个只该让那一个连接过期，另一个还在轮询就不算掉线。按会话记会把
      // 「关掉其中一个窗口」说成掉线，而那正是 connections 做成集合要避免的事。
      last_seen: new Map(),
      hidden: { players: [], ais: [], seats: [] },
      opened_at: this.now(),
    };
    this.sessions.set(token, session);
    // 建会话就是建连接。不连的话 seat.ready 会被权威以 seat_not_connected 拒绝——
    // 那条拒绝是对的（掉线席位不能被别处代为 Ready），所以要做的是如实建连接，
    // 而不是绕过它。
    session.first_connection_id = await this.connect(session, token);
    // 适配器驱动只在真的有席位可驱动时才起表。没有会话时空转没有意义。
    this.startDriver();
    // 租约扫描同理，但它与有没有适配器无关。
    this.startSweeper();
    return session;
  }

  async connect(session, connectionIdValue) {
    const connectionId = typeof connectionIdValue === "string" && connectionIdValue !== ""
      ? connectionIdValue
      : `conn-${require("node:crypto").randomUUID()}`;
    await this.core.dispatch(
      "seat.connect",
      this.injected("seat.connect", session, { connection_id: connectionId }),
    );
    session.connections.add(connectionId);
    // 建连接即开始计租。不设的话新连接的 last_seen 是 undefined，第一次扫描就把它
    // 当成过期——刚打开的页面立刻被判掉线。
    session.last_seen.set(connectionId, this.now());
    return connectionId;
  }

  // 续租。任何一次带 connection_id 的认证请求都算。
  //
  // 刻意不新增一条专用心跳路由：浏览器每 700ms 都在读视图，那条请求本身就是最可靠的
  // 存活证据。另发一种心跳意味着页面在后台被浏览器节流时，视图还在轮询而心跳被推迟，
  // 于是一个正在正常使用的页面被判掉线。
  async touchConnection(session, connectionIdValue) {
    const connectionId = typeof connectionIdValue === "string" && connectionIdValue !== ""
      ? connectionIdValue
      : null;
    if (connectionId === null) return null;
    if (session.connections.has(connectionId)) {
      session.last_seen.set(connectionId, this.now());
      return connectionId;
    }

    // 不在集合里，说明这个连接先前被租约扫描摘掉了——典型情形是拔网线：页面一直在轮询，
    // 只是有一段时间到不了这里。网络回来后必须重新建连，不能只是「忽略这个 id」。
    //
    // 忽略的后果不显眼但很坏：页面自己看到的是一份正常更新的牌桌（view.projection 与
    // view.hand 都不需要连接），同桌看到的却是一个永远掉线的人，结算时被判 SIT_OUT，
    // 保留窗走完位子被收走——而这个人全程都在正常使用。
    //
    // 授权面没有放宽。重建连的凭据是会话令牌，与 /api/session/resume 要的是同一份证明；
    // 这里只是把「必须点一下才能回来」变成「轮询通了就回来」。
    //
    // 沿用调用方给的 id 而不是铸新的：它就是同一个标签页。铸新会让忽略返回值的客户端
    // 每次轮询多出一个连接，那个集合没有上界；沿用则是幂等的，上界就是客户端实际用过的
    // 不同 id 数量。
    //
    // 只碰 this.sessions 里的这一个会话。刻意不按 id 去全局找连接属于谁——那样一个会话
    // 就能改另一个会话的连接集合，而 id 是调用方随口给的字符串。
    return this.connect(session, connectionId);
  }

  // 显式断开一个连接。postDisconnect 与 beacon 都走这里。
  async disconnect(session, connectionIdValue) {
    const connectionId = typeof connectionIdValue === "string" && connectionIdValue !== ""
      ? connectionIdValue
      : session.token;
    await this.core.dispatch(
      "seat.disconnect",
      this.injected("seat.disconnect", session, { connection_id: connectionId }),
    );
    session.connections.delete(connectionId);
    session.last_seen.delete(connectionId);
    return session.connections.size;
  }

  // 扫过期连接，并清理已被权威释放的席位。
  //
  // 两件事放在一次扫描里是因为它们的触发条件是同一条时间线：连接过期 -> 保留窗起算 ->
  // 保留窗到期 -> 权威释放席位 -> 本层该把会话与托管绑定一起删掉。分成两个定时器只会
  // 让「席位已经没了但会话还在」多出一个可观察的窗口。
  async sweepConnections() {
    const at = this.now();
    const disconnected = [];
    const cleaned = [];

    for (const session of [...this.sessions.values()]) {
      for (const connectionId of [...session.connections]) {
        const seen = session.last_seen.get(connectionId) ?? session.opened_at;
        if (at - seen <= this.connectionLeaseMs) continue;
        try {
          await this.disconnect(session, connectionId);
          disconnected.push(connectionId);
        } catch (error) {
          // 席位已经被释放或凭据已吊销时，seat.disconnect 会被拒。那不是故障：
          // 要断的东西已经不存在了。把连接从本层摘掉，剩下的交给下面的清理。
          if (!SEAT_GONE_CODES.includes(error?.code)) throw error;
          session.connections.delete(connectionId);
          session.last_seen.delete(connectionId);
        }
      }
    }

    // 席位是否还在。探针用 view.hand 而不是 view.seat：view.seat 只收公开的 seat_id，
    // 它回答的是「这个位子还在桌上吗」，而这里要问的是「本会话手里这份凭据还代表这一席
    // 吗」。位子被释放后又被别人坐上时两者会分道扬镳——view.seat 照样成功，于是一份指向
    // 陌生人席位的旧会话被判定为健在。view.hand 走 requireSeatCredential，凭据吊销和
    // 席位消失都会明确报出来。
    //
    // 顺带的代价是它会取一次底牌，扫描因此比 view.seat 重一点。可以接受：扫描周期是租约的
    // 四分之一，而这个探针的返回值被丢掉，不进任何面向模型或浏览器的通道。
    for (const session of [...this.sessions.values()]) {
      let gone = false;
      try {
        await this.core.dispatch("view.hand", this.injected("view.hand", session, {}));
      } catch (error) {
        gone = SEAT_GONE_CODES.includes(error?.code);
        if (!gone) throw error;
      }
      if (!gone) continue;
      // 释放后删 web session、custody binding 与相关凭据。留着任何一样都等于
      // 一个指向不存在席位的令牌仍然可用，而凭据还躺在内存里。
      this.sessions.delete(session.token);
      this.custody.forget(session.seat_handle);
      // 入口键跟着会话一起走。留着的话它既是一份指向不存在会话的长期凭据，也是一张
      // 永不收缩的表。这是唯一的清理点——entryReplay 那边刻意没有兜底的懒清理，理由
      // 记在那里。
      this.forgetEntryKeysFor(session.token);
      cleaned.push(session.seat_id);
    }

    return { disconnected, cleaned };
  }

  // 刷新页面后重新建连接。
  //
  // 这条路径正是「协调器活着、只有浏览器断了」那种掉线，也就是恢复窗要覆盖的主要场合：
  // 凭据一直在本进程内存里，浏览器只需要证明自己还持有会话令牌。凭据不经浏览器往返，
  // 所以刷新不构成一次泄漏机会（F6 的判断在这里同样成立）。
  //
  // 协调器自己重启则另一回事：句柄和凭据一起没了，该席只能等 120 秒正常释放。这个代价
  // 是 seat-custody.cjs 里明确记下来的，不在这里偷偷补一条「让浏览器保存凭据」的后路。
  async postResume(response, body) {
    const session = this.requireSession(body.session_token);
    // 不带 connection_id 时铸一个新的，不回落到会话令牌本身。
    //
    // 回落看起来更省事——「同一个标签页回来了」在权威侧确实是同一个连接。但会话令牌当连接
    // id 意味着凡是持有该令牌的页面都共用一条连接：Chrome 的「复制标签页」会把
    // sessionStorage 一起复制，于是两个页面都用同一个 id 轮询，其中任一个关掉时发出的
    // beacon 会把另一个也断掉——而那个页面还在正常轮询，touchConnection 却因为 id 已被
    // 移出集合而不再续租，于是它在权威侧永久显示掉线。铸新 id 让每个页面各自一条租约，
    // 关一个只影响一个。
    //
    // 刷新残留的旧连接不需要在这里处理：pagehide 的 beacon 通常已经把它摘掉，没摘掉的
    // 也会在一个租约周期内被扫描判掉。而权威按连接 Set 计数、只在集合空掉时起保留窗，
    // 所以「新连接已建 + 旧 beacon 迟到」这种乱序不会误判掉线。
    const connectionId = await this.connect(session, body.connection_id);
    sendJson(response, 200, {
      ok: true,
      session_token: session.token,
      seat_id: session.seat_id,
      connection_id: connectionId,
      connection_count: session.connections.size,
    });
  }

  // 显式断开。浏览器关闭标签页时发（sendBeacon / pagehide），也用于手动演示掉线恢复。
  //
  // 不在这里删会话：删了就等于把凭据也丢了，而 120 秒恢复窗的意义正是「这个人还能回来」。
  // 会话留着、连接摘掉，与权威侧「保留窗从最后一个连接消失起算」对齐。
  async postDisconnect(response, body) {
    const session = this.requireSession(body.session_token);
    const remaining = await this.disconnect(session, body.connection_id);
    sendJson(response, 200, {
      ok: true,
      connection_count: remaining,
    });
  }

  async postView(response, body) {
    const session = this.requireSession(body.session_token);
    const view = await this.buildView(session, { connectionId: body.connection_id });
    sendJson(response, 200, { ok: true, view });
  }

  async postAction(response, body) {
    const session = this.requireSession(body.session_token);
    const command = typeof body.command === "string" ? body.command : "";
    if (!BROWSER_ACTIONS.includes(command)) {
      // 未知或不允许的命令一律同一个码。区分「不存在」与「不许你调」会把这里变成
      // 命令面的探测口。
      sendJson(response, 403, { ok: false, code: "action_not_permitted", details: { command } });
      return;
    }
    const params = body.params === undefined ? {} : body.params;
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      sendJson(response, 400, { ok: false, code: "invalid_field", details: { field: "params" } });
      return;
    }

    const result = await this.core.dispatch(command, this.injected(command, session, params));

    // 本地隐藏成功后才记账。先记后发会在命令失败时留下一条只有本进程知道的隐藏，
    // 于是 UI 显示「已隐藏」而权威侧的时间线仍然标记为可见。
    if (command === "ai.hide_local") {
      this.recordHidden(session, params);
    }

    // 动作返回里可能带凭据形状的东西（不该有，但这一层不假设上游永远正确）。
    const sanitized = this.custody.sanitizeResult(result);
    this.custody.assertNoLeak(JSON.stringify(sanitized), "web_action_result");
    sendJson(response, 200, { ok: true, result: sanitized });
  }

  recordHidden(session, params) {
    const bucket = { player: "players", ai: "ais", seat: "seats" }[params.target];
    if (bucket === undefined) return;
    const id = params.target_id;
    if (typeof id !== "string") return;
    const list = session.hidden[bucket];
    const hidden = params.hidden !== false;
    const index = list.indexOf(id);
    if (hidden && index === -1) list.push(id);
    if (!hidden && index !== -1) list.splice(index, 1);
  }

  async serveStatic(url, response) {
    const files = {
      "/": ["index.html", "text/html; charset=utf-8"],
      "/index.html": ["index.html", "text/html; charset=utf-8"],
      "/table.js": ["table.js", "text/javascript; charset=utf-8"],
      "/table.css": ["table.css", "text/css; charset=utf-8"],
    };
    const entry = files[url.pathname];
    if (entry === undefined) {
      sendJson(response, 404, { ok: false, code: "not_found" });
      return;
    }
    // 白名单映射而不是拼路径：任何形式的 ../ 都到不了这里，因为 pathname 必须精确命中。
    const contents = await fs.promises.readFile(path.join(this.webRoot, entry[0]));
    response.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" });
    response.end(contents);
  }

  fail(response, error) {
    if (error?.name === "CredentialLeak") {
      // 泄漏必须是 500 且不回细节。它是本进程的缺陷，不是调用方能修的东西。
      sendJson(response, 500, { ok: false, code: "credential_leak" });
      return;
    }
    if (error instanceof CoreError || typeof error?.code === "string") {
      sendJson(response, typeof error.status === "number" ? error.status : 400, {
        ok: false,
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
      return;
    }
    if (typeof error?.status === "number") {
      sendJson(response, error.status, { ok: false, code: error.message });
      return;
    }
    sendJson(response, 500, { ok: false, code: "internal_error" });
  }

  async start({ host = "127.0.0.1", port = 0 } = {}) {
    if (!LOOPBACK_HOSTS.includes(host)) {
      // 与 command-server 同一条门禁的机器化。UI 面同样不许对外监听：它持有所有
      // 已连接玩家的席位凭据，暴露它比暴露核心更糟。
      throw new CoreError("local_bridge_auth_unresolved", 403, {
        requested_host: host,
        blocking_unknown: "U-TG-LOCAL-BRIDGE-AUTH",
        blocking_boundary: "release",
      });
    }
    const address = await listen(this.server, { host, port });
    return `http://${host === "::1" ? "[::1]" : host}:${address.port}`;
  }

  async stop() {
    this.stopDriver();
    this.stopSweeper();
    await closeServer(this.server);
  }
}

// 等一个 promise，但不无限等。
//
// 不用 AbortSignal.timeout：模型适配器是外部实现的，它不一定接受 signal，而这里要保证的是
// 「本进程不会因为它不返回而卡住」，不是「让它停下来」。它之后回来也没关系——那次返回没有
// 接收者，回合已经被 silent 收尾，权威那边按迟到输出处理。
function withTimeout(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(promise);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      // message 与 code 刻意不同。两者相同时「按 code 分类」和「拿 message 顶上」产生一样的
      // 结果，于是分类那一步成了永远看不出差别的死代码——一份自己无法被证伪的实现。
      reject(Object.assign(new Error(`模型适配器在 ${ms}ms 内没有返回`), { code: "adapter_timeout" }));
    }, ms);
  });
  // unref 让这个定时器不阻止进程退出：正常路径上模型早就返回了，定时器还挂着。
  if (typeof timer?.unref === "function") timer.unref();
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), timeout]);
}

// 把模型返回的任意东西收敛成权威认得的形状。
//
// 白名单判断，不做「尽量修好」：把 "SILENT" 大写还原、把 text 转成字符串之类的宽容处理，
// 等于替模型猜它想说什么。猜错的代价是以该席的名义公开发一句它没说过的话——而 silent
// 的代价只是这一次不说话。两者不对称，所以一律 silent。
//
// failure 只在真的畸形时出现，正常路径上不留痕：给每一次成功评估都记一条错误会让
// driveErrors 变成噪音，而它是诊断「模型坏了吗」的唯一入口。
function normalizeDecision(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { decision: "silent", failure: "adapter_malformed_output" };
  }
  if (value.decision === "silent") {
    return value.failure === undefined ? { decision: "silent" } : { decision: "silent", failure: value.failure };
  }
  if (value.decision === "public_speech") {
    if (typeof value.text !== "string" || value.text === "") {
      return { decision: "silent", failure: "adapter_missing_text" };
    }
    return { decision: "public_speech", text: value.text };
  }
  return { decision: "silent", failure: "adapter_unknown_decision" };
}

module.exports = {
  MIN_ENTRY_KEY_LENGTH,
  TableWebHost,
  BROWSER_ACTIONS,
  normalizeDecision,
  CONNECTION_LEASE_MS,
};
