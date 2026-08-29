"use strict";

// 终结性会话转换与后台轮询的竞态（B.2）。
//
// 缺陷的形状：页面点了「离桌」或「模拟掉线」，请求在飞，而 700 毫秒一跳的
// setInterval(refresh) 照常触发。那一跳带着即将作废的凭据与即将被摘掉的 connection_id。
//
// 两种后果，严重程度不同：
//
//   离桌   -> 凭据已作废，服务端回 403，浏览器为每个 4xx 自己打一条控制台错误。
//             表现为「偶发 403」：撞不撞上取决于点击落在 700 毫秒周期的哪个位置。
//
//   掉线   -> 更坏。轮询同时是心跳，而 touchConnection 对一个已被摘掉的 id 会重新建连
//             （拔网线场景要的行为）。于是那一跳把刚刚的掉线**撤销**了：同桌看到的掉线
//             标记闪一下就没，保留窗根本没开始走。丢掉响应挡不住它——请求已经到了。
//
// 本文件钉两件事：
//   1. 权威/协调器侧的事实，也就是「为什么这条竞态有害」。这部分能真跑。
//   2. web/table/table.js 里的顺序。它是 classic script，任何单元测试都 require 不进来，
//      所以只能做源码断言。弱，但比没有强，而且浏览器验收那一侧有行为断言配套。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const CLIENT = path.join(__dirname, "..", "web", "table", "table.js");
const RULES = "table-rules-v1";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

// 与 test/table-web-host.test.cjs 同一套搭法：注入时钟 + 进程内核心 + 真的 HTTP。
// 走 HTTP 而不是直接调方法，因为要测的正是「一条请求到达服务端之后发生了什么」。
async function withHost(t) {
  const at = { now: 1_000_000 };
  const surface = new CommandSurface({ deckFactory: deck, now: () => at.now });
  const core = new InProcessCoreClient({ surface });
  const host = new TableWebHost({ core, now: () => at.now });
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
  return { host, core, post };
}

// 一席入座并确认公开范围，返回会话令牌。
async function seatOne(post) {
  const created = (await post("/api/room/create", {
    player_id: "p1", table_rules_version: RULES,
  })).body;
  await post("/api/action", {
    session_token: created.session_token,
    command: "room.confirm_public_scope",
    params: { acknowledged: true },
  });
  return created.session_token;
}

// 会话当前的连接数。从协调器自己的会话表读，不从视图猜。
function connectionCount(host, token) {
  const session = host.sessions.get(token);
  if (session === undefined) throw new Error("找不到会话");
  return session.connections.size;
}

function clientSource() {
  return fs.readFileSync(CLIENT, "utf8");
}

// 去掉注释再断言。注释里出现 stopPolling 不算实现。
function clientCode() {
  return clientSource()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

// 取某个 addEventListener 回调的函数体。按括号配对切，不用正则数括号。
function handlerBody(code, anchor) {
  const start = code.indexOf(anchor);
  assert.notEqual(start, -1, `找不到 ${anchor}`);
  const open = code.indexOf("{", start);
  assert.notEqual(open, -1, `${anchor} 后面没有函数体`);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  throw new Error(`${anchor} 的函数体没有闭合`);
}

test("客户端：post 把中止句柄真的交给了 fetch", () => {
  // 这一条补的是最危险的一种缺陷：post 收下 signal 却不往 fetch 传。
  //
  // 危险在于所有中止代码看上去都还在——stopPolling 里的 abort() 调得到、不报错、
  // 也确实把 AbortController 置成了已中止，只是那个句柄跟在飞的请求毫无关系，请求
  // 照样到达服务端。上面几条断言（stopPolling 里有 abort、顺序对）全都照样通过。
  // handlerBody 在这里用不了：它取锚点之后的第一个 {，而 post 的第一个 { 是参数上的
  // { signal } 解构，不是函数体。顶层函数直接切到行首那个 } 为止。
  const code = clientCode();
  const start = code.indexOf("async function post(");
  assert.notEqual(start, -1, "找不到 post");
  const end = code.indexOf("\n}", start);
  assert.notEqual(end, -1, "post 没有闭合");
  const body = code.slice(start, end);
  // 1. 参数上解构出 signal。
  assert.ok(/async function post\([^)]*\{\s*signal\s*\}/.test(code),
    "post 应当在参数上解构出 signal");
  // 2. fetch 的选项对象里出现 signal。
  const fetchCall = body.slice(body.indexOf("fetch("), body.indexOf("});"));
  assert.ok(/\bsignal\b/.test(fetchCall),
    "fetch 的选项里必须带上 signal，否则中止句柄只是装饰——"
    + "abort() 调得到也不报错，但请求照样到达服务端");
  // 3. 函数体里不能再声明一个同名变量把参数遮掉。少了这一条，
  //    「签名还接着、值被丢掉」那种写法仍然满足前两条。
  assert.ok(/(const|let|var)\s+signal\b/.test(body) === false,
    "post 里不该重新声明 signal——那会把参数上解构出来的那个遮掉");
});

test("协调器：掉线之后一次带 connection_id 的轮询会把连接重新建起来", async (t) => {
  // 这一条不是缺陷，是 touchConnection 的既定行为（拔网线场景要它，理由写在
  // table-web-host.cjs 那个方法上）。写在这里是因为它正是「掉线时那条已在飞的轮询」
  // 有害的原因——没有这条事实，客户端的顺序就只是风格问题。
  const { host, post } = await withHost(t);
  const token = await seatOne(post);
  // room.create 自己就开了一个连接（openSession），所以这里数增量而不是绝对值。
  const baseline = connectionCount(host, token);
  const connectionId = "conn-race-1";

  await post("/api/view", { session_token: token, connection_id: connectionId });
  const afterPoll = connectionCount(host, token);
  assert.equal(afterPoll, baseline + 1,
    `前提：一次带新 id 的轮询多建一个连接（基线 ${baseline}，实际 ${afterPoll}）`);

  const off = await post("/api/session/disconnect", {
    session_token: token, connection_id: connectionId,
  });
  assert.equal(off.body.connection_count, afterPoll - 1,
    `掉线应当只摘掉这一个连接：${JSON.stringify(off.body)}`);
  const afterDisconnect = connectionCount(host, token);
  assert.equal(afterDisconnect, afterPoll - 1);

  // 那条已经在飞的轮询：同一个 connection_id，掉线之后才到。
  await post("/api/view", { session_token: token, connection_id: connectionId });
  assert.equal(connectionCount(host, token), afterDisconnect + 1,
    "轮询把连接重新建起来了。这就是客户端必须先停轮询再发掉线的原因——"
    + "丢掉响应挡不住它，请求已经到了");
});

test("协调器：离桌之后再拉视图会被拒，而不是给出一份陈旧视图", async (t) => {
  // 403 的来源。给出陈旧视图更坏（玩家以为自己还在桌上），所以这一条同时是反面断言。
  const { post } = await withHost(t);
  const token = await seatOne(post);
  await post("/api/view", { session_token: token, connection_id: "conn-race-2" });

  const left = await post("/api/action", {
    session_token: token, command: "seat.leave", params: {},
  });
  assert.equal(left.body.ok, true, `离桌本身应当成功：${JSON.stringify(left.body)}`);

  const after = await post("/api/view", {
    session_token: token, connection_id: "conn-race-2",
  });
  assert.equal(after.status >= 400, true,
    `离桌后拉视图应当被拒，实际 HTTP ${after.status} ${JSON.stringify(after.body)}`);
  assert.equal(after.body.ok, false);
  assert.equal(typeof after.body.code, "string", "被拒要给出错误码，客户端靠它决定收摊");
});

test("客户端：离桌处理器先停轮询再发 seat.leave", () => {
  const body = handlerBody(clientCode(), 'el("leave-btn").addEventListener');
  const stop = body.indexOf("stopPolling()");
  const leave = body.indexOf('act("seat.leave"');
  assert.notEqual(stop, -1, "离桌处理器里没有 stopPolling()");
  assert.notEqual(leave, -1, "离桌处理器里没有 seat.leave");
  assert.ok(stop < leave,
    "stopPolling() 必须在 seat.leave 之前。反过来的话 await 期间那一跳轮询会带着"
    + "即将作废的凭据出去，撞出 403");
});

test("客户端：掉线处理器先停轮询再发 disconnect", () => {
  const body = handlerBody(clientCode(), 'el("simulate-disconnect").addEventListener');
  const stop = body.indexOf("stopPolling()");
  const post = body.indexOf('"/api/session/disconnect"');
  assert.notEqual(stop, -1, "掉线处理器里没有 stopPolling()");
  assert.notEqual(post, -1, "掉线处理器里没有 disconnect 请求");
  assert.ok(stop < post,
    "stopPolling() 必须在 disconnect 之前。反过来的话那一跳轮询会把刚掉的线重新接上");
});

test("客户端：两个处理器在失败路径上都把轮询接回去", () => {
  // 停了不接回去的后果不显眼但很坏：页面从此静止，而玩家看到的是一张不再更新的牌桌
  // ——比报错更糟，它看起来是正常的。
  for (const anchor of ['el("leave-btn").addEventListener',
    'el("simulate-disconnect").addEventListener']) {
    const body = handlerBody(clientCode(), anchor);
    const catchAt = body.indexOf("catch");
    assert.notEqual(catchAt, -1, `${anchor} 没有 catch`);
    const tail = body.slice(catchAt);
    assert.ok(tail.includes("startPolling()"),
      `${anchor} 的失败路径没有把轮询接回去`);
  }
});

test("客户端：stopPolling 会掐掉已经在飞的那一次", () => {
  const code = clientCode();
  const body = handlerBody(code, "function stopPolling");
  assert.ok(body.includes("clearInterval"), "stopPolling 应当清掉 interval");
  assert.ok(body.includes("abort()"),
    "stopPolling 还要中止已经在飞的那一次：clearInterval 拦得住「下一次」，"
    + "拦不住「这一次」，而出问题的恰恰是这一次");
});

test("客户端：refresh 拿到结果之后会确认这条结果还有人要", () => {
  const body = handlerBody(clientCode(), "async function refresh");
  assert.ok(body.includes("AbortController"), "refresh 应当为本次拉取建一个中止句柄");
  assert.ok(body.includes("state.pollAbort !== controller"),
    "refresh 应当在 await 之后确认自己还是当前那一次——否则两条重叠响应里后到的"
    + "那条会把新画面覆盖回旧的");
  assert.ok(body.includes("AbortError"),
    "自己掐掉的那一次不该被当成故障显示");
});

test("客户端：refresh 不去掐上一次轮询，重叠靠围栏处理", () => {
  // 重叠时中止上一次也能保证不覆盖，但那会为每次重叠制造一条 net::ERR_ABORTED，
  // 而噪声会淹掉真的网络失败——浏览器验收的网络证据检查就是这么先红的。
  //
  // 围栏丢掉旧响应的效果一样，代价是零，而且让那条已经发出的轮询自然完成对服务端有用
  //（它同时是心跳）。需要中止的只有终结转换，那时请求本身对服务端有副作用。
  const body = handlerBody(clientCode(), "async function refresh");
  assert.equal(body.includes("state.pollAbort.abort()"), false,
    "refresh 里不该中止上一次轮询；重叠由 await 之后那道围栏处理");
  // 反面：中止能力必须仍然存在于 stopPolling，否则「不在 refresh 里中止」就变成
  //「根本不中止」，而 B.2 的根因修复正依赖那一次中止。
  const stop = handlerBody(clientCode(), "function stopPolling");
  assert.ok(stop.includes("abort()"),
    "stopPolling 仍必须中止飞行中的那一次——那是离桌 403 与静默撤销掉线的根因修复");
});

test("客户端：轮询周期没有被顺手改掉", () => {
  // 反面。上面几条都在动轮询这一块，而把 700 改大也能让竞态「看起来消失」——
  // 那是把窗口调窄，不是把窗口关掉。
  const code = clientCode();
  assert.ok(code.includes("setInterval(refresh, 700)"),
    "轮询周期应当仍是 700 毫秒；调大它只是让竞态更难撞上，不是修好");
});
