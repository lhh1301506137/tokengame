"use strict";

// 浏览器牌桌协调器的行为门禁。
//
// 这个文件要钉住的不是「HTTP 路由能通」，而是三条会静默失效的边界：
//   1. 浏览器拿不到席位凭据，也不能自带 seat_id 替别人行动。
//   2. 浏览器拿不到对手底牌，也拿不到原始权威事件。
//   3. 没有模型适配器时视图如实说「没有」，不用脚本冒充模型能力。
//
// 两种传输各跑一遍同一批断言：只测进程内实现等于默认「宿主嵌核心」也没问题，而那正是
// L0 要否定的形态；只测 HTTP 则没法冻结时钟。

const assert = require("node:assert/strict");
const test = require("node:test");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { createCommandServer, DEFAULT_AUTHORITY_TOKEN } = require("../src/authority/command-server.cjs");
const { InProcessCoreClient, HttpCoreClient, CoreError } = require("../src/host/core-client.cjs");
const { TableWebHost, BROWSER_ACTIONS } = require("../src/host/table-web-host.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const viewModel = require("../src/host/table-view-model.cjs");

const RULES = "table-rules-v1";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

// 注入时钟。真实时钟下「倒计时到点」只能靠 sleep，而 sleep 会让测试变慢且偶发。
function fixedClock(start = 1_000_000) {
  const state = { at: start };
  return { now: () => state.at, advance: (ms) => { state.at += ms; } };
}

async function withHost(t, options = {}) {
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: deck, now: clock.now });
  const core = new InProcessCoreClient({ surface });
  const host = new TableWebHost({ core, now: clock.now, ...options });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  return { host, core, surface, clock, origin, client: httpClient(origin) };
}

function httpClient(origin) {
  const post = async (route, body) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return {
    post,
    act: (token, command, params = {}) => post("/api/action", { session_token: token, command, params }),
    view: async (token) => (await post("/api/view", { session_token: token })).body.view,
  };
}

// 两席入座并各自确认公开范围。确认必须逐席带凭据（F3），协调器靠句柄注入。
async function seatTwo(client) {
  const created = (await client.post("/api/room/create", { player_id: "p1", table_rules_version: RULES })).body;
  const joined = (await client.post("/api/room/join", {
    player_id: "p2",
    invite_code: created.invite_code,
  })).body;
  for (const token of [created.session_token, joined.session_token]) {
    await client.act(token, "room.confirm_public_scope", { acknowledged: true });
  }
  return { created, joined, a: created.session_token, b: joined.session_token };
}

async function startHand(client, core, clock, tokens) {
  for (const token of tokens) {
    await client.act(token, "seat.ready", { ready: true });
  }
  // 倒计时由权威第一次 evaluateStart 建立，所以先让它观察一次再推进时钟。
  await client.view(tokens[0]);
  clock.advance(3_500);
  return core.dispatch("hand.start_if_due");
}

test("会话令牌不携带席位凭据，浏览器也不能自带 seat_id 替别席行动", async (t) => {
  const { client } = await withHost(t);
  const { created, joined, a } = await seatTwo(client);

  // 创建与加入的返回是浏览器唯一可能见到凭据的地方。
  for (const body of [created, joined]) {
    const text = JSON.stringify(body);
    assert.ok(!text.includes("recovery_credential"), "会话返回不得出现凭据字段名");
    assert.ok(!text.includes("credential"), "会话返回不得出现任何 credential 键");
  }
  assert.match(created.session_token, /^web-session-/);
  assert.equal(typeof created.invite_code, "string", "建房者必须看得见邀请码才能转给朋友");

  // 自带 seat_id 必须被托管层拒绝，而不是被静默覆盖：覆盖会留下越权口。
  const forged = await client.act(a, "seat.ready", { seat_id: joined.seat_id, ready: true });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.code, "seat_id_not_model_supplied");

  // 自带凭据同理。浏览器手里出现凭据本身就说明托管已经破了。
  const withCredential = await client.act(a, "seat.ready", { recovery_credential: "guess", ready: true });
  assert.equal(withCredential.body.code, "credential_not_model_supplied");

  // 未知会话令牌不得泄露任何会话信息。回显已知令牌清单会让这里变成枚举口——
  // 令牌就是会话凭证，逐个试出来等于拿到别人的牌桌身份。
  const unknown = await client.post("/api/view", { session_token: "web-session-nope" });
  assert.equal(unknown.status, 403);
  assert.equal(unknown.body.code, "web_session_unknown");
  const unknownText = JSON.stringify(unknown.body);
  assert.ok(!unknownText.includes(a), "拒绝里不得出现任何真实令牌");
  assert.ok(!unknownText.includes(joined.session_token));
});

test("浏览器只能发白名单动作：不能以自己 AI 的名义发言，也读不到原始权威事件", async (t) => {
  const { client } = await withHost(t);
  const { a } = await seatTwo(client);

  // 这四条是最要紧的拒绝。ai.start/ai.resolve 能发就等于玩家可以手打一句话冒充自己的 AI。
  for (const command of ["ai.start", "ai.resolve", "ai.take_intents", "view.room_events", "view.ai_events"]) {
    const denied = await client.act(a, command, {});
    assert.equal(denied.status, 403, `${command} 必须被拒绝`);
    assert.equal(denied.body.code, "action_not_permitted");
    assert.ok(!BROWSER_ACTIONS.includes(command));
  }

  // 房间与牌局的推进命令也不归浏览器：它们由权威自己走表（due-work）。
  for (const command of ["hand.start_if_due", "hand.settle_expired", "ai.reclaim_expired"]) {
    assert.equal((await client.act(a, command, {})).body.code, "action_not_permitted");
  }

  // 完全不存在的命令与「存在但不许调」返回同一个码，避免成为命令面的探测口。
  assert.equal((await client.act(a, "no.such.command", {})).body.code, "action_not_permitted");
});

test("每个查看者只拿到自己的底牌，对手底牌在视图里根本不存在", async (t) => {
  const { client, core, clock } = await withHost(t);
  const { a, b } = await seatTwo(client);
  const started = await startHand(client, core, clock, [a, b]);
  assert.equal(started.started, true);

  const viewA = await client.view(a);
  const viewB = await client.view(b);

  const ownA = viewA.seats.find((seat) => seat.is_viewer);
  const otherA = viewA.seats.find((seat) => !seat.is_viewer);
  const ownB = viewB.seats.find((seat) => seat.is_viewer);

  assert.equal(ownA.hole_cards.length, 2, "自己的底牌必须可见");
  assert.equal(otherA.hole_cards, null, "对手底牌必须不可见");
  assert.equal(ownB.hole_cards.length, 2);
  assert.notDeepEqual(ownA.hole_cards, ownB.hole_cards, "两席底牌不应相同");

  // 更强的一条：A 的整份视图里不该出现 B 的任何一张底牌。逐字符串搜索，
  // 因为「字段里没有」不等于「整份 JSON 里没有」——将来某个诊断字段可能把它带进来。
  const textA = JSON.stringify(viewA);
  for (const card of ownB.hole_cards) {
    assert.ok(!textA.includes(`"${card}"`), `A 的视图不得包含 B 的底牌 ${card}`);
  }

  // 公共信息两边必须一致：四视图不分叉是验收里的硬要求。
  assert.deepEqual(viewA.hand.board, viewB.hand.board);
  assert.equal(viewA.hand.pot_total, viewB.hand.pot_total);
  assert.equal(viewA.hand.actor_seat_id, viewB.hand.actor_seat_id);
  assert.equal(viewA.hand.revision, viewB.hand.revision);
});

test("底牌只认权威的私密视图，房间投影上带了底牌也不采信", async (t) => {
  // 房间投影是公共信息，人人都拿同一份。它今天没有 hole_cards 字段，但视图模型不能
  // 依赖「上游不会给」——一旦某天投影带上了这个字段，一个 ?? 兜底就会把全桌底牌
  // 发给每个查看者。所以在这里主动伪造一份，钉住「只信 view.hand」。
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: deck, now: clock.now });
  const planted = ["7h", "7s"];
  const core = new InjectingCore(new InProcessCoreClient({ surface }), (command, result) => {
    if (command !== "view.projection") return null;
    if (result.room === null || result.room === undefined) return null;
    return {
      ...result,
      room: {
        ...result.room,
        seats: result.room.seats.map((seat) => ({ ...seat, hole_cards: [...planted] })),
      },
    };
  });
  const host = new TableWebHost({ core, now: clock.now });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const client = httpClient(origin);

  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  const view = await client.view(a);
  const own = view.seats.find((seat) => seat.is_viewer);
  const other = view.seats.find((seat) => !seat.is_viewer);

  assert.equal(other.hole_cards, null, "投影上的底牌不得被采信");
  assert.notDeepEqual(own.hole_cards, planted, "自己的底牌也必须来自 view.hand");
  assert.ok(!JSON.stringify(view).includes("7h") || own.hole_cards.includes("7h"));
});

test("视图不透传原始权威事件，也不含任何凭据形状的键", async (t) => {
  const { client, core, clock } = await withHost(t);
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);
  await client.act(a, "chat.say", { text: "开局了", idempotency_key: "chat-1" });

  const view = await client.view(a);

  // 气泡只保留 UI 要用的字段。event_id / payload 是原始事件的形状，出现即说明
  // 有人把权威事件整份透传了。
  assert.ok(view.messages.length >= 1);
  for (const message of view.messages) {
    assert.equal(message.event_id, undefined, "气泡不得带 event_id");
    assert.equal(message.payload, undefined, "气泡不得带原始 payload");
    assert.equal(typeof message.sequence, "number", "排序仍必须用权威 sequence");
  }

  // 结构自检本身也要有测试，否则它可能早就不再被调用。
  assert.throws(
    () => viewModel.assertNoForbiddenKeys({ seats: [{ recovery_credential: "x" }] }),
    (error) => error.code === "view_model_forbidden_key",
  );
  // 报告不得带值，只带位置：报告本身不该成为第二次泄漏。
  try {
    viewModel.assertNoForbiddenKeys({ a: { credential: "super-secret-value" } });
    assert.fail("应当抛出");
  } catch (error) {
    assert.ok(!JSON.stringify(error.details).includes("super-secret-value"));
  }
});

// 净化只摘已知字段名（recovery_credential / credential）。这两条测的是它摘不到的形态：
// 凭据原文出现在别的键里，或出现在自由文本里。字段名扫描对这两种都无效，只有值扫描抓得到。
// 没有这两条测试，把 assertNoLeak 整行删掉的变异能存活——那正是最初变异检查暴露的缺口。
class InjectingCore {
  constructor(inner, inject) {
    this.inner = inner;
    this.transport = inner.transport;
    this.inject = inject;
  }

  async dispatch(command, params) {
    const result = await this.inner.dispatch(command, params);
    return this.inject(command, result) ?? result;
  }
}

function credentialOf(host) {
  // 测试需要知道秘密原文才能断言它出不去。这是刻意伸手进托管层内部。
  const [bound] = [...host.custody.bindings.values()];
  assert.equal(typeof bound.credential, "string");
  assert.ok(bound.credential.length > 8);
  return bound.credential;
}

test("凭据原文藏在自由文本里时，视图出口拒绝送出而不是照发", async (t) => {
  let secret = null;
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: deck, now: clock.now });
  const core = new InjectingCore(new InProcessCoreClient({ surface }), (command, result) => {
    if (command !== "view.timeline" || secret === null) return null;
    // 凭据原文塞进一条发言的 text。键名是 text，净化认不出；结构自检也认不出——
    // 它扫的是键名。只有值扫描知道这串字符是秘密。
    return { ...result, timeline: [...result.timeline, {
      event_id: "injected", sequence: 999, at: clock.now(), type: "PLAYER_PUBLIC_SPEECH",
      payload: { player_id: "p1", text: `我的恢复码是 ${secret}`, channel: "TABLE_PUBLIC" },
    }] };
  });
  const host = new TableWebHost({ core, now: clock.now });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const client = httpClient(origin);

  const { a } = await seatTwo(client);
  assert.equal((await client.post("/api/view", { session_token: a })).status, 200, "注入前应正常");

  secret = credentialOf(host);
  const leaked = await client.post("/api/view", { session_token: a });
  assert.equal(leaked.status, 500, "泄漏是本进程缺陷，必须 500");
  assert.equal(leaked.body.code, "credential_leak");
  assert.equal(leaked.body.details, undefined, "拒绝本身不得回细节");
  assert.ok(!JSON.stringify(leaked.body).includes(secret), "拒绝里不得再带一次原文");
});

test("凭据原文换个键名回来时，动作返回出口同样拒绝", async (t) => {
  let secret = null;
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: deck, now: clock.now });
  const core = new InjectingCore(new InProcessCoreClient({ surface }), (command, result) => {
    if (command !== "ai.hide_local" || secret === null) return null;
    // seat_token 不在 SECRET_FIELDS 里，所以 stripSecrets 不会摘它。
    return { ...result, seat_token: secret };
  });
  const host = new TableWebHost({ core, now: clock.now });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const client = httpClient(origin);

  const { a } = await seatTwo(client);
  secret = credentialOf(host);
  const leaked = await client.act(a, "ai.hide_local", {
    target: "player", target_id: "p2", hidden: true,
  });
  assert.equal(leaked.status, 500);
  assert.equal(leaked.body.code, "credential_leak");
  assert.ok(!JSON.stringify(leaked.body).includes(secret));
});

test("本地隐藏只改这一个查看者的渲染，其他查看者与权威时间线不受影响", async (t) => {
  const { client, core, clock } = await withHost(t);
  const { created, joined, a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);
  await client.act(b, "chat.say", { text: "我这手很强", idempotency_key: "chat-b1" });

  const hidden = await client.act(a, "ai.hide_local", {
    target: "player",
    target_id: "p2",
    hidden: true,
  });
  assert.equal(hidden.status, 200);

  const viewA = await client.view(a);
  const viewB = await client.view(b);

  // A 侧：条目仍在数组里，只是标记为 hidden。删掉会让 UI 无法显示「此处有被你隐藏的
  // 发言」，那是审查而不是本地隐藏。
  const messageA = viewA.messages.find((message) => message.player_id === "p2");
  assert.equal(messageA.hidden, true);
  assert.equal(messageA.text, "我这手很强", "原文仍保留，隐藏只影响渲染");
  assert.equal(viewA.seats.find((seat) => seat.player_id === "p2").locally_hidden.player, true);

  // B 侧完全不受影响。
  assert.equal(viewB.messages.find((message) => message.player_id === "p2").hidden, false);
  assert.equal(viewB.seats.find((seat) => seat.player_id === "p2").locally_hidden.player, false);

  // 取消隐藏要能回到原状态。
  await client.act(a, "ai.hide_local", { target: "player", target_id: "p2", hidden: false });
  const viewA2 = await client.view(a);
  assert.equal(viewA2.messages.find((message) => message.player_id === "p2").hidden, false);
  assert.equal(viewA2.seats.find((seat) => seat.player_id === "p2").locally_hidden.player, false);

  assert.ok(created.seat_id !== joined.seat_id);
});

test("手内筹码显示引擎余额，手间显示房间账本，两者都不重复计入已投入", async (t) => {
  const { client, core, clock } = await withHost(t);
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  const view = await client.view(a);
  const seats = view.seats;
  // 起始 200，小盲 1 大盲 2。手内 stack 必须已扣减，否则「我下注了但筹码没变」。
  const sb = seats.find((seat) => seat.is_small_blind);
  const bb = seats.find((seat) => seat.is_big_blind);
  assert.equal(sb.stack, 199, "小盲手内余额应已扣 1");
  assert.equal(sb.committed_this_hand, 1);
  assert.equal(bb.stack, 198, "大盲手内余额应已扣 2");
  assert.equal(bb.committed_this_hand, 2);
  // 账本值仍是本手开始时的筹码，供 UI 显示盈亏方向。
  assert.equal(sb.ledger_stack, 200);
  assert.equal(bb.ledger_stack, 200);
  assert.equal(view.hand.pot_total, 3);
});

test("没有模型适配器时视图如实说没有，AI 不会凭空发言", async (t) => {
  const { client, core, clock, host } = await withHost(t);
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  const view = await client.view(a);
  assert.deepEqual(view.model_adapter, { attached: false, label: null, simulated: false });

  // 驱动器在没有适配器时根本不该起表，也不该产生任何 AI 发言。
  assert.equal(host.driveTimer, null);
  assert.deepEqual(await host.driveOnce(), { started: 0, resolved: 0 });
  const aiMessages = view.messages.filter((message) => message.speaker_type === "SEAT_AI");
  assert.equal(aiMessages.length, 0, "没有模型就不该有 AI 气泡");
});

test("模型适配器只能通过驱动器发言，失败落成 silent 而不是把回合悬住", async (t) => {
  const calls = [];
  const adapter = {
    label: "test-scripted-adapter",
    simulated: true,
    async evaluate(input) {
      calls.push(input.seat_id);
      if (calls.length === 1) throw new Error("模型故障");
      return { decision: "public_speech", text: "跟注试试" };
    },
  };
  // 间隔设得比测试寿命长，让自动起的定时器永远不触发。本测试要显式控制每一次驱动，
  // 否则「第一次评估失败」这条断言会和后台定时器抢时序。
  const { client, core, clock, host } = await withHost(t, {
    modelAdapter: adapter,
    driveIntervalMs: 3_600_000,
  });
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  const view = await client.view(a);
  assert.equal(view.model_adapter.attached, true);
  assert.equal(view.model_adapter.label, "test-scripted-adapter");
  assert.equal(view.model_adapter.simulated, true);
  assert.equal(calls.length, 0, "定时器不得在此之前抢跑");
  // 开局本身会产生 SEAT_ACTION_WINDOW_OPENED 等白名单事件，所以此刻应有可领意图。
  const first = await host.driveOnce();
  assert.ok(first.started >= 1, "开局应产生至少一个可领意图");

  // 第一次评估抛错 -> 必须落成 silent。悬住的回合会占着 active_turn，
  // 让该席在整个租约期内不可能再有第二次发言机会。
  const afterFailure = await client.view(a);
  const thinking = afterFailure.seats.filter((seat) => seat.ai.active);
  assert.equal(thinking.length, 0, "失败的回合必须已结束，不得停在 THINKING");
  assert.ok(calls.length >= 1);
});

test("HTTP 传输与进程内传输行为一致，且核心不可达有独立错误码", async (t) => {
  // HTTP 那条路要真起一个命令服务：这是唯一能证明「核心在另一个进程也能用」的形态。
  const service = createCommandServer({ deckFactory: deck, dueWork: false });
  const coreOrigin = await service.start({ port: 0 });
  t.after(() => service.stop());

  const core = new HttpCoreClient({ origin: coreOrigin, token: DEFAULT_AUTHORITY_TOKEN });
  assert.equal(core.transport, "http");
  const host = new TableWebHost({ core });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const client = httpClient(origin);

  const { a, joined } = await seatTwo(client);
  const view = await client.view(a);
  assert.equal(view.contract, "tokengame.table-view.v1");
  assert.equal(view.seats.length, 2);

  // 错误码必须穿过 HTTP 归一后仍然可判定，而不是变成 500。
  const forged = await client.act(a, "seat.ready", { seat_id: joined.seat_id });
  assert.equal(forged.body.code, "seat_id_not_model_supplied");

  const health = await (await fetch(`${origin}/api/health`)).json();
  assert.equal(health.core_transport, "http");

  // 核心断掉之后必须给出 core_unreachable，而不是把 fetch 的原始报错穿到浏览器。
  await service.stop();
  const afterStop = await client.post("/api/view", { session_token: a });
  assert.equal(afterStop.body.code, "core_unreachable");
  assert.equal(afterStop.status, 502);
});

test("同席两个连接只关掉一个不算掉线；最后一个消失才起 120 秒保留窗", async (t) => {
  const { client, core, clock } = await withHost(t);
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  // 第二个窗口：传一个不同的 connection_id。
  const second = await client.post("/api/session/resume", { session_token: b, connection_id: "window-2" });
  assert.equal(second.body.connection_count, 2);

  await client.post("/api/session/disconnect", { session_token: b, connection_id: "window-2" });
  let seatB = (await client.view(a)).seats.find((seat) => !seat.is_viewer);
  assert.equal(seatB.connected, true, "还有一个连接在，不算掉线");
  assert.equal(seatB.retention_remaining_ms, null, "不该起保留窗");

  // 关掉最后一个。
  await client.post("/api/session/disconnect", { session_token: b });
  seatB = (await client.view(a)).seats.find((seat) => !seat.is_viewer);
  assert.equal(seatB.connected, false);
  assert.equal(seatB.retention_remaining_ms, 120_000, "保留窗必须是 DISCONNECT_STRICT_V1 的 120 秒");

  // 窗口内恢复回到同一席同一筹码。
  clock.advance(60_000);
  const resumed = await client.post("/api/session/resume", { session_token: b });
  assert.equal(resumed.status, 200);
  const after = (await client.view(a)).seats.find((seat) => !seat.is_viewer);
  assert.equal(after.connected, true);
  assert.equal(after.seat_id, seatB.seat_id, "必须回到原席");
});

test("字素计数与权威一致：140 个字素可接受，第 141 个被拒绝", async (t) => {
  const { client, core, clock } = await withHost(t);
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  const view = await client.view(a);
  assert.equal(view.action_panel.max_text_graphemes, 140, "UI 必须拿到与权威同一个上限");

  // 家庭 emoji 的 UTF-16 长度是 11，字素是 1。用 String.length 计数会让 140 上限
  // 被轻易绕过，所以 UI 侧的提示计数必须也按字素。
  const family = "👨‍👩‍👧‍👦";
  assert.equal(viewModel.graphemeLength(family), 1);
  assert.ok(family.length > 1);

  const ok = await client.act(a, "chat.say", {
    text: family.repeat(140),
    idempotency_key: "grapheme-140",
  });
  assert.equal(ok.status, 200, "140 个字素必须可接受");

  const tooLong = await client.act(a, "chat.say", {
    text: family.repeat(141),
    idempotency_key: "grapheme-141",
  });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.code, "message_too_long");
});

test("协调器不对外监听：非回环地址被 U-TG-LOCAL-BRIDGE-AUTH 门禁拒绝", async (t) => {
  const surface = new CommandSurface({ deckFactory: deck });
  const host = new TableWebHost({ core: new InProcessCoreClient({ surface }) });
  t.after(() => host.stop());
  await assert.rejects(
    () => host.start({ host: "0.0.0.0", port: 0 }),
    (error) => {
      assert.ok(error instanceof CoreError);
      assert.equal(error.code, "local_bridge_auth_unresolved");
      assert.equal(error.details.blocking_unknown, "U-TG-LOCAL-BRIDGE-AUTH");
      return true;
    },
  );
});
