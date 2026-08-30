"use strict";

// B7：模型面永不静默卡住。
//
// 缺陷本体：`ai.take_intents` 在两种完全不同的处境下返回同一份东西。
//
//   处境 C  协调器起着、令牌配对了、但**一个席位都没绑**——没有人打开牌桌坐下。
//   处境 D  席位在、AI 开着、只是此刻没有该说话的意图。
//
// 两者都是 `{ ok: true, result: { intents: [], seats_polled: 0 } }`（C 里那个数是 0，
// D 里是席位数，但模型读不出「0 意味着什么」）。差别很实：
//
//   D 里再轮询一次就对了。
//   C 里轮询到世界末日都不会变——要有个**真人**去浏览器里建房或用邀请码加入。
//
// 而模型看到的两份回答一样，于是它只能做同一件事：继续轮询。宿主那一侧看起来是
// 「AI 一直在等」，实际是没有人告诉过它「你还没有席位」。这正是章程点名要避免的
// 「缺失时不能静默卡住」：缺的不是能力，是那句话。
//
// 这个文件钉住那句话必须存在、必须可判定、而且必须说得出下一步。

const assert = require("node:assert/strict");
const test = require("node:test");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { createDueWorkDriver } = require("../src/authority/due-work.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const RULES = "table-rules-v1";
const TOKEN = "liveness-test-model-token-00001";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

async function withHost(t, { dueWork = false, ...options } = {}) {
  const surface = new CommandSurface({ deckFactory: deck });
  const core = new InProcessCoreClient({ surface });
  // 到期驱动按需起。自带内核时它必须由本进程跑（run-table-web.cjs 就是这么做的）：
  // Ready 倒计时到点开局不依赖有没有客户端在轮询。默认关着是因为前两条断言测的是
  // 「一手都还没开」的时刻，起了驱动反而会让牌局在断言之间自己往前走。
  if (dueWork) {
    const driver = createDueWorkDriver({ orchestrator: surface.orchestrator, onError: () => {} });
    driver.start();
    t.after(() => driver.stop());
  }
  const host = new TableWebHost({ core, modelCommandToken: TOKEN, ...options });
  const origin = await host.start({ port: 0 });
  t.after(() => host.stop());
  const post = async (route, body, headers = {}) => {
    const response = await fetch(`${origin}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return {
    host,
    post,
    model: (command, params = {}) => post(
      "/api/model/command",
      requestEnvelope(command, params),
      { [MODEL_COMMAND_TOKEN_HEADER]: TOKEN },
    ),
    act: (token, command, params = {}) => post("/api/action", { session_token: token, command, params }),
  };
}

test("一席都没绑时，模型读得出「等真人入座」而不是「暂时没事」", async (t) => {
  const { model } = await withHost(t);

  const empty = await model("ai.take_intents");
  assert.equal(empty.status, 200, JSON.stringify(empty.body));
  assert.equal(empty.body.result.seats_polled, 0);
  assert.equal(empty.body.result.intents.length, 0);
  // 这一条是缺陷本体：空手而归时必须说出在等什么。
  assert.equal(empty.body.result.waiting_on, "human_entry",
    "一个席位都没绑，模型却读不出这件事——它只能继续轮询，而轮询永远不会让人坐下");
  // 还要说得出下一步。一句「你没有席位」不够：模型要能把这句话转达给它的人。
  assert.equal(typeof empty.body.result.next_step, "string");
  assert.ok(empty.body.result.next_step.length >= 8,
    `下一步得是一句人话，实得 ${JSON.stringify(empty.body.result.next_step)}`);
});

test("席位在但此刻没待办时，模型读得出「继续轮询」", async (t) => {
  const { model, post, act } = await withHost(t);
  const created = (await post("/api/room/create", { player_id: "p1", table_rules_version: RULES })).body;
  const joined = (await post("/api/room/join", { player_id: "p2", invite_code: created.invite_code })).body;
  for (const token of [created.session_token, joined.session_token]) {
    await act(token, "room.confirm_public_scope", { acknowledged: true });
  }

  const idle = await model("ai.take_intents");
  assert.equal(idle.body.result.seats_polled, 2);
  assert.equal(idle.body.result.intents.length, 0);
  // 与上一条的差别就是这一个值。两处都写 "human_entry" 或都写 "table" 都能让单独一条通过，
  // 所以两条必须都在，而且必须不同。
  assert.equal(idle.body.result.waiting_on, "table",
    "席位在、只是没待办——这时候该做的是再轮询一次，不是叫人去入座");
  assert.notEqual(idle.body.result.waiting_on, "human_entry");
});

test("有待办时不报等待，也不报下一步", async (t) => {
  const { model, post, act } = await withHost(t, { dueWork: true });
  const created = (await post("/api/room/create", { player_id: "p1", table_rules_version: RULES })).body;
  const joined = (await post("/api/room/join", { player_id: "p2", invite_code: created.invite_code })).body;
  for (const token of [created.session_token, joined.session_token]) {
    await act(token, "room.confirm_public_scope", { acknowledged: true });
    await act(token, "seat.ready", { ready: true });
  }

  // 等到真有一条待办。开局由核心自己的时钟推进，所以这里轮询而不是假定它已经开了。
  let taken = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await model("ai.take_intents");
    if ((result.body?.result?.intents ?? []).length > 0) { taken = result; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.notEqual(taken, null, "六秒内没有等到任何待办，后面的断言就什么都没验证");
  // 有事做的时候这两个字段必须不在。留着一个「waiting_on: table」会让模型在拿到待办的
  // 同一份回答里同时读到「在等牌桌」——两句话互相矛盾，而模型只能挑一句信。
  assert.equal(taken.body.result.waiting_on, undefined,
    "有待办时还报在等待，模型会读到两句互相矛盾的话");
  assert.equal(taken.body.result.next_step, undefined);
});

test("进程内驱动不因为这两个新字段就把空轮当成故障", async (t) => {
  // 反面对照：driveOnce 读的是同一份回答。加字段时最容易顺手把它当成一次失败记进
  // driveErrors——那会让一张还没有人入座的桌子每隔一个驱动周期就积一条错误，
  // 而 driveErrors 是诊断真故障的唯一入口，被这种噪声填满就等于没有。
  const { host } = await withHost(t, {
    modelAdapter: { label: "probe", simulated: true, evaluate: async () => ({ decision: "silent" }) },
  });
  const outcome = await host.driveOnce();
  assert.deepEqual({ started: outcome.started, resolved: outcome.resolved }, { started: 0, resolved: 0 });
  assert.deepEqual(host.driveErrors, [],
    `空轮不该记成驱动故障：${JSON.stringify(host.driveErrors)}`);
});
