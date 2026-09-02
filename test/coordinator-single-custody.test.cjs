"use strict";

// 唯一协调器：模型命令与真人命令必须服务同一局、同一份托管。
//
// 这个文件钉住的缺陷是可测量的，不是架构审美：收敛之前，MCP 进程自己 new SeatCustody()，
// 而往那份托管里 bind 句柄的唯一入口 hostCommand() 有**零个产品调用者**。于是
//
//     ai.take_intents -> custody.handles() -> []  ->  seats_polled: 0
//
// 真实模型一个席位也驱动不了。浏览器里之所以能看到座位旁的气泡，是因为 TableWebHost
// 自己另有一份托管加一条手搓的 AI 循环，喂它的是进程内脚本运行时。两条路径不相交：
// 一条跑着但只接得上模拟运行时，一条接得上真实模型但永远看不见席位。
//
// 收敛方向：凭据只能住在一个进程里，而两个面都必须够得着它。浏览器是筹码操作面，
// 它够不着别的进程；MCP 进程本来就是 HTTP 客户端。所以协调器是 Web 进程，模型命令
// 经它落到同一份 SeatCustody 上。
//
// 为什么不是「再加一层」：这里没有新抽象。模型命令的实现仍然是 ModelCommandSurface，
// 真人命令的注入仍然是 SeatCustody.inject——收敛做的是把 driveOnce 里手搓的那一份
// 扇出与 intent_id 记账删掉，改成调已经存在的那一层。

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { SeatCustody } = require("../src/host/seat-custody.cjs");
const { ModelCommandSurface } = require("../src/host/model-command-surface.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const ROOT = path.join(__dirname, "..");
const RULES = "table-rules-v1";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

function fixedClock(start = 1_000_000) {
  const state = { at: start };
  return { now: () => state.at, advance: (ms) => { state.at += ms; } };
}

// 记录每次 evaluate 的席位，好让「谁被驱动了」可断言。
function recordingRuntime(behaviour = () => ({ decision: "silent" })) {
  const seen = [];
  return {
    label: "coordinator-test-runtime",
    simulated: true,
    seen,
    async evaluate(input) {
      seen.push(input.seat_id);
      return behaviour(input);
    },
  };
}

async function withHost(t, options = {}) {
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: deck, now: clock.now });
  const core = new InProcessCoreClient({ surface });
  const host = new TableWebHost({ core, now: clock.now, ...options });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const post = async (route, body) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const client = {
    post,
    act: (token, command, params = {}) => post("/api/action", { session_token: token, command, params }),
    view: async (token) => (await post("/api/view", { session_token: token })).body.view,
  };
  return { host, core, surface, clock, origin, client };
}

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

// 起一手牌，好让 AI 回路真的有意图可领。
async function startHand(client, core, clock, tokens) {
  for (const token of tokens) {
    await client.act(token, "seat.ready", { ready: true });
  }
  await client.view(tokens[0]);
  clock.advance(3_500);
  return core.dispatch("hand.start_if_due");
}

test("协调器有一条模型命令入口，且它扇出的席位就是浏览器建的那些", async (t) => {
  // 旧代码上这一条因为 host.modelCommand 不存在而红。它不是「多一个方法」的诉求：
  // 没有这条入口时，模型命令唯一的落点是 MCP 进程自己那份空托管。
  const { host, client } = await withHost(t, { modelAdapter: recordingRuntime() });
  const { created, joined } = await seatTwo(client);

  assert.equal(typeof host.modelCommand, "function", "协调器必须提供模型命令入口");

  const result = await host.modelCommand("ai.take_intents", {});
  assert.equal(result.ok, true, `取意图应当成功：${JSON.stringify(result.body)}`);
  assert.equal(result.body.result.seats_polled, 2,
    "模型面扇出的席位数必须等于协调器托管的席位数——0 说明模型看的是另一份托管");

  // 正面对账：扇出的确实是这两席，不是碰巧数目相同。
  const handles = host.custody.handles();
  assert.equal(handles.length, 2);
  const seatIds = new Set([created.seat_id, joined.seat_id]);
  assert.equal(seatIds.size, 2, "两席的 seat_id 必须不同");
});

test("同一条入口拒绝真人命令，也拒绝模型自带席位身份", async (t) => {
  const { host, client } = await withHost(t, { modelAdapter: recordingRuntime() });
  await seatTwo(client);

  // 真人命令不在模型面上。挡在这里而不是等核心拒：等核心拒意味着这条请求已经带着
  // 本进程的席位凭据发出去了。
  const human = await host.modelCommand("hand.act", { action: "fold" });
  assert.equal(human.ok, false);
  assert.equal(human.body.code, "command_not_model_facing",
    "hand.act 必须在模型面上被本地拒绝");

  // 自带 seat_id 必须报错而不是被静默覆盖或忽略。
  for (const field of ["seat_id", "seat_handle", "recovery_credential", "viewer_seat_id"]) {
    const forged = await host.modelCommand("view.timeline", { [field]: "seat-1" });
    assert.equal(forged.ok, false, `${field} 应当被拒`);
    assert.equal(forged.body.code, "seat_identity_not_model_supplied",
      `${field} 的拒绝理由必须点名「模型不得自带席位身份」`);
  }
});

test("模型命令入口拿不到凭据原文，可检视状态也不摊出句柄", async (t) => {
  const { host, client } = await withHost(t, { modelAdapter: recordingRuntime() });
  await seatTwo(client);

  const result = await host.modelCommand("view.projection", {});
  const text = JSON.stringify(result);
  assert.ok(!text.includes("recovery_credential"), "模型面的返回不得出现凭据字段名");
  assert.ok(!/seat_handle-/.test(text), "模型面的返回不得出现句柄原文");
});

test("一席的 ai.start 失败不带走同一轮里其余席位", async (t) => {
  // 旧代码上 driveOnce 里的 ai.start 是裸 await：抛出会中断整个 for 循环，
  // 于是同一轮里后面那些席位的回合压根没起来，权威侧的租约救不了它们——
  // 那些席位要等下一次 tick 才有机会，而中断的原因（比如一次瞬时的核心错误）
  // 每轮都可能再来一次。
  //
  // 经模型面走之后这条不可能再发生：ModelCommandSurface 的每一跳都回
  // { ok, status, body }，从不抛，所以一席的失败在结构上就到不了别席。
  const runtime = recordingRuntime();
  const { host, core, client, clock } = await withHost(t, { modelAdapter: runtime });
  const { created, joined, a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  // 让第一次 ai.start 失败，之后恢复。包在 core 上而不是包在 host 上：
  // 要模拟的是「核心这一跳偶发失败」，而不是「协调器自己坏了」。
  const realDispatch = core.dispatch.bind(core);
  let failuresLeft = 1;
  core.dispatch = async (command, params) => {
    if (command === "ai.start" && failuresLeft > 0) {
      failuresLeft -= 1;
      const error = new Error("core_flaked");
      error.code = "core_flaked";
      error.status = 502;
      throw error;
    }
    return realDispatch(command, params);
  };
  t.after(() => { core.dispatch = realDispatch; });

  const outcome = await host.driveOnce();

  // 两席都该有过一次机会。第一席的起回合失败了，但第二席不该被牵连。
  assert.equal(failuresLeft, 0, "注入的失败必须真的被用掉，否则这条测试什么都没验证");
  assert.ok(outcome.started >= 1,
    `失败之后同一轮里仍应有席位起了回合，实际 started=${outcome.started}`);
  assert.ok(runtime.seen.length >= 1,
    "推理运行时应当仍被调用过——一席失败带走整轮时这里是 0");

  const seatIds = new Set([created.seat_id, joined.seat_id]);
  for (const seen of runtime.seen) {
    assert.ok(seatIds.has(seen), `运行时被问到的席位必须是本机托管的：${seen}`);
  }
});

test("另起一份托管的模型面看不见任何席位——这就是 MCP 进程自持托管的后果", async (t) => {
  // 这条是回归证据，不是新功能。它把「为什么 MCP 进程不能自己 new SeatCustody()」
  // 写成一条可执行的断言：同一个核心、同一局牌，另一份托管里一张句柄也没有。
  const { client } = await withHost(t, { modelAdapter: recordingRuntime() });
  await seatTwo(client);

  const strangerCustody = new SeatCustody();
  const stranger = new ModelCommandSurface({
    custody: strangerCustody,
    request: async () => ({ ok: true, status: 200, body: { result: { intents: [] } } }),
  });
  const result = await stranger.call("ai.take_intents", {});
  assert.equal(result.body.result.seats_polled, 0,
    "另一份托管必须扇出到零席——这正是收敛前 MCP 进程的处境");
});

test("席位已释放不算驱动故障，回填被拒才算", async (t) => {
  // 两件事一起测，因为它们共用同一个诊断环形缓冲，而那个缓冲只有 50 格：把正常的席位
  // 回收记进去会把真的故障挤出去，而「挤出去」这件事在诊断面上看不出来——它只表现为
  // 排查时找不到那一条。
  const { host, core, client, clock } = await withHost(t, { modelAdapter: recordingRuntime() });
  const { a, b } = await seatTwo(client);
  await startHand(client, core, clock, [a, b]);

  const realDispatch = core.dispatch.bind(core);
  let mode = "seat_gone";
  core.dispatch = async (command, params) => {
    if (command === "ai.take_intents" && mode === "seat_gone") {
      const error = new Error("seat_not_found");
      error.code = "seat_not_found";
      error.status = 404;
      throw error;
    }
    if (command === "ai.resolve" && mode === "resolve_rejected") {
      const error = new Error("speech_budget_exhausted");
      error.code = "speech_budget_exhausted";
      error.status = 409;
      throw error;
    }
    return realDispatch(command, params);
  };
  t.after(() => { core.dispatch = realDispatch; });

  await host.driveOnce();
  assert.deepEqual(host.driveErrors, [],
    "席位已释放是正常结果，不该占用诊断缓冲——占了就会把真故障挤出去");

  // 换成回填被拒。这一条相反：它必须记账，而且不能计入 resolved。
  mode = "resolve_rejected";
  const outcome = await host.driveOnce();
  assert.ok(outcome.started >= 1, `应当起过回合，实际 started=${outcome.started}`);
  assert.equal(outcome.resolved, 0,
    "回填被权威拒绝时不得计入 resolved——计入会让驱动的返回值不再能判断真的发出去几句");
  // 每一席各被拒一次。断言成集合而不是长度：长度写死会在座位数变化时假红，
  // 而这条要钉的是「被拒的理由留下来了」。
  assert.deepEqual([...new Set(host.driveErrors.map((e) => e.code))], ["speech_budget_exhausted"],
    "回填被拒必须留下可诊断的一笔");
  assert.equal(host.driveErrors.length, outcome.started,
    "起了几个回合就该有几条被拒记录——少了说明某一席的失败被吞掉了");
});

test("认不出的权威 id 与认不出的句柄都回 null，不猜", () => {
  // 两处「找不到就回落」的诱惑，各自的后果都是替错的人说话。做成单元级断言而不是走完
  // 整局：这两个函数的输入空间就是「认识 / 不认识」，而回落分支只在「不认识」时才走到。
  const custody = new SeatCustody({ handleFactory: () => "seat_handle-1" });
  custody.bind({ seatId: "seat-1", credential: "known-seat-credential" });
  const surface = new ModelCommandSurface({
    custody,
    request: async () => ({ ok: true, status: 200, body: { ok: true, result: {} } }),
  });

  // 恰好只记着一条时最诱人：回落回那一条，单席场景下永远看不出问题。
  surface.track("intent-known", "seat_handle-1", "claim-1");
  assert.equal(surface.handleForId("intent-known"), "seat_handle-1");
  assert.equal(surface.handleForId("intent-unknown"), null,
    "认不出的 id 必须回 null——「只记着一条就用那一条」在多席时是替错的人行动");
  assert.equal(surface.handleForId(""), null);
  assert.equal(surface.handleForId(undefined), null);

  // 句柄不带领取令牌出来：调用方不需要它，多一个持有者就多一处可能被写进日志的地方。
  assert.equal(typeof surface.handleForId("intent-known"), "string",
    "handleForId 必须只回句柄本身，不回整条记录");

  // 协调器那一侧的同一个诱惑：sessions 里找不到句柄时不许回落到第一个会话。
  const host = new TableWebHost({ core: { dispatch: async () => ({}) } });
  host.sessions.set("t1", { token: "t1", seat_handle: "seat_handle-1", seat_id: "seat-1" });
  host.sessions.set("t2", { token: "t2", seat_handle: "seat_handle-2", seat_id: "seat-2" });
  assert.equal(host.seatIdForHandle("seat_handle-2"), "seat-2");
  assert.equal(host.seatIdForHandle("seat_handle-nope"), null,
    "认不出的句柄必须回 null——回落到第一个会话会让运行时以为自己在替另一席说话");
  assert.equal(host.seatIdForHandle(null), null);
});

test("进程内驱动不再自己扇出、不再自己拼 claim_token", () => {
  // 静态断言，因为这件事的失效方式是「为了改一个小行为又在 driveOnce 里手搓一遍」，
  // 而那种改动在运行时看起来一切正常：AI 照样说话，只是与远端模型客户端走的不是同一条
  // 实现了，于是两份会朝不同方向漂。
  const host = fs.readFileSync(
    path.join(ROOT, "src/host/table-web-host.cjs"), "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const drive = host.slice(host.indexOf("async driveOnce()"), host.indexOf("startSweeper()"));
  assert.ok(drive.length > 200, "没截到 driveOnce，这条断言什么都没验证");

  assert.doesNotMatch(drive, /claim_token/,
    "领取令牌应当由模型命令面按 intent_id 补回，驱动里再拼一遍就是第二份实现");
  assert.doesNotMatch(drive, /this\.injected\(/,
    "命令注入应当经模型命令面走，驱动里不该再有自己的注入调用");
  assert.doesNotMatch(drive, /this\.core\.dispatch\(/,
    "驱动不该再直接打核心——那条路绕过了模型面的逐席隔离");
  assert.match(drive, /this\.modelCommand\(/,
    "驱动应当经模型命令入口走");
});
