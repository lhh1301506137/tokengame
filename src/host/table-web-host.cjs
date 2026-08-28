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
const viewModel = require("./table-view-model.cjs");
const { LIVELY_V1 } = require("../authority/seat-ai-store.cjs");

const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "::1", "localhost"]);
const MAX_BODY_BYTES = 64 * 1024;

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

  // ------------------------------------------------------------------ 视图组装

  async buildView(session) {
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

  // 取意图 -> 起回合 -> 调适配器 -> 回填。这就是「宿主适配器」在本 MVP 里的形态。
  //
  // 没有适配器时整个循环不跑：没有模型就是没有 AI 发言，视图里 attached: false 如实说明。
  // 用脚本假装模型能力正是不能做的那件事。
  async driveOnce() {
    if (this.modelAdapter === null) return { started: 0, resolved: 0 };
    if (this.driving) return { started: 0, resolved: 0, skipped: true };
    this.driving = true;
    let started = 0;
    let resolved = 0;
    try {
      for (const session of this.sessions.values()) {
        // 只驱动本进程真正托管着的席位。别人的席位由别人的宿主驱动——这一条就是
        // ai.take_intents 按席位把关的理由。
        let claimed;
        try {
          claimed = (await this.core.dispatch(
            "ai.take_intents",
            this.injected("ai.take_intents", session, {}),
          )).intents;
        } catch (error) {
          // 席位可能已被释放或凭据已吊销。这不是驱动的错误，跳过即可。
          if (["seat_credential_revoked", "seat_not_found", "recovery_credential_rejected"]
            .includes(error?.code)) continue;
          throw error;
        }

        for (const intent of claimed) {
          const turn = (await this.core.dispatch(
            "ai.start",
            this.injected("ai.start", session, { intent_id: intent.intent_id }),
          )).started;
          started += 1;

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
                seat_id: intent.seat_id,
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
          try {
            await this.core.dispatch("ai.resolve", this.injected("ai.resolve", session, params));
            resolved += 1;
          } catch (error) {
            // 回填被权威拒绝（额度耗尽、迟到跨手、文本超长）是正常的确定性结果，
            // 不是驱动故障。记录下来供诊断，不重试——重试会再消耗一次配额判定。
            this.driveErrors.push({ at: this.now(), code: error?.code ?? "resolve_failed" });
            if (this.driveErrors.length > this.maxDriveErrors) this.driveErrors.shift();
          }
        }
      }
    } finally {
      this.driving = false;
    }
    return { started, resolved };
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
    sendJson(response, 200, {
      ok: true,
      session_token: session.token,
      seat_id: session.seat_id,
      // 连接 id 明确回给浏览器。openSession 用会话令牌当首个连接 id，而
      // postDisconnect 在缺参数时也回落到会话令牌——两处巧合相等，但依赖巧合会在
      // 任一侧改动时断掉，而断掉的表现是「点了掉线却没掉」，很难查。
      connection_id: session.first_connection_id,
      invite_code: created.invite_code,
      room_id: created.room?.room_id ?? null,
    });
  }

  async postJoin(response, body) {
    const joined = await this.core.dispatch("room.join", {
      player_id: body.player_id,
      invite_code: body.invite_code,
    });
    const bound = this.custody.bindFromResult(joined);
    const session = await this.openSession(bound);
    sendJson(response, 200, {
      ok: true,
      session_token: session.token,
      seat_id: session.seat_id,
      connection_id: session.first_connection_id,
      room_id: joined.room?.room_id ?? null,
    });
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
    return connectionId;
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
    // 复用同一个连接 id 时，权威侧看到的是「这个连接又回来了」；传新的则是「多了一个窗口」。
    // 浏览器刷新属于前者，所以默认复用会话令牌本身作为连接 id。
    const connectionId = await this.connect(session, body.connection_id ?? session.token);
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
    const connectionId = typeof body.connection_id === "string" && body.connection_id !== ""
      ? body.connection_id
      : session.token;
    await this.core.dispatch(
      "seat.disconnect",
      this.injected("seat.disconnect", session, { connection_id: connectionId }),
    );
    session.connections.delete(connectionId);
    sendJson(response, 200, {
      ok: true,
      connection_count: session.connections.size,
    });
  }

  async postView(response, body) {
    const session = this.requireSession(body.session_token);
    const view = await this.buildView(session);
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

module.exports = { TableWebHost, BROWSER_ACTIONS, normalizeDecision };
