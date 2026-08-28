"use strict";

// 阶段 1 项 3：可验证的连接租约。
//
// 现状是没有任何自动掉线判定。seat.disconnect 只由「模拟掉线」那个按钮触发，而页面上
// 既没有 pagehide 也没有 sendBeacon——postDisconnect 的注释写着「浏览器关闭标签页时发
// （sendBeacon / pagehide）」，但那件事从来没有实现过。
//
// 后果不是少一条状态显示。真实的关标签页、刷新、拔网线，权威侧那一席都还是 connected：
//   - 120 秒保留窗永远不起算，位子永远不还，桌子凑不齐下一手。
//   - 别人看到的是一个「在线但永远不行动」的席位，只能等行动超时一轮又一轮。
//
// 租约的做法：每个连接记 last_seen_at，浏览器每次轮询带上自己的 connection_id 续租；
// 协调器定期扫过期连接并如实调 seat.disconnect。租约必须明显长于轮询间隔（700ms），
// 否则一次网络抖动就会把人判掉线。
//
// pagehide/sendBeacon 只作为加速：它到了就立刻断，它没到租约照样会到期。要求里那句
// 「不能作为唯一断线依据」正是这个意思——beacon 在崩溃、断电、拔网线时根本不会发出。

const assert = require("node:assert/strict");
const test = require("node:test");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const {
  TableWebHost,
  CONNECTION_LEASE_MS,
} = require("../src/host/table-web-host.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const RULES = "table-rules-v1";

function fixedClock(start = 1_000_000) {
  const state = { at: start };
  return { now: () => state.at, advance: (ms) => { state.at += ms; } };
}

// 直接用协调器的方法，不起 HTTP。租约要靠注入时钟判定，而 HTTP 那一层不改变租约语义
// （test/table-web-host.test.cjs 已经在两种传输上跑过同一批出口断言）。
function host(options = {}) {
  const clock = fixedClock();
  const surface = new CommandSurface({ deckFactory: () => stackedDeck([]), now: clock.now });
  const core = new InProcessCoreClient({ surface });
  // driveIntervalMs 给一个比测试寿命长的值：本文件要显式控制每一次扫描。
  const web = new TableWebHost({
    core, now: clock.now, driveIntervalMs: 3_600_000, ...options,
  });
  return { web, core, clock, surface };
}

// 建房并返回会话。走协调器的 openSession 而不是 HTTP 路由，参数形状与 postCreate 一致。
async function createSession(ctx, playerId = "p1") {
  const created = await ctx.core.dispatch("room.create", {
    player_id: playerId, table_rules_version: RULES,
  });
  const bound = ctx.web.custody.bindFromResult(created);
  const session = await ctx.web.openSession(bound);
  return { session, created };
}

async function joinSession(ctx, inviteCode, playerId) {
  const joined = await ctx.core.dispatch("room.join", {
    player_id: playerId, invite_code: inviteCode,
  });
  const bound = ctx.web.custody.bindFromResult(joined);
  const session = await ctx.web.openSession(bound);
  return { session, joined };
}

function connectedIn(ctx, seatId) {
  const projection = ctx.surface.dispatch("view.projection", {});
  const seat = (projection.room?.seats ?? []).find((entry) => entry.seat_id === seatId);
  assert.ok(seat !== undefined, `投影里没有这一席: ${seatId}`);
  return seat.connected;
}

test("租约：常数存在且明显长于轮询间隔，又明显短于 120 秒保留窗", () => {
  assert.equal(typeof CONNECTION_LEASE_MS, "number");
  // 轮询是 700ms。租约取 700ms 量级会让一次抖动就判掉线。
  assert.ok(CONNECTION_LEASE_MS >= 3_000,
    `租约太短，一次网络抖动就会把人判掉线: ${CONNECTION_LEASE_MS}`);
  // 保留窗是 120 秒。租约必须明显短于它，否则「掉线后 120 秒释放」实际变成
  // 「租约 + 120 秒」，位子还得更晚。
  assert.ok(CONNECTION_LEASE_MS <= 30_000,
    `租约太长，掉线判定迟到太多: ${CONNECTION_LEASE_MS}`);
});

// 扫描表本身也要能被检验。上面那些测试都直接调 sweepConnections，所以「定时器根本没起」
// 或者「起了但周期比租约还长」在它们眼里都是绿的——而那两种情况下真实部署里没人会被判掉线。
test("租约：扫描周期明显短于租约，否则判定平均迟到半个周期以上", async () => {
  const ctx = host();
  await createSession(ctx);

  assert.equal(typeof ctx.web.sweepIntervalMs, "number");
  assert.ok(ctx.web.sweepIntervalMs > 0, `扫描周期非正数: ${ctx.web.sweepIntervalMs}`);
  // 周期 >= 租约时，一个刚过期的连接平均要多等半个周期才被发现，最坏要等一整个周期。
  // 要求至多租约的一半：迟到上界压在租约的 50% 以内。
  assert.ok(ctx.web.sweepIntervalMs <= ctx.web.connectionLeaseMs / 2,
    `扫描周期 ${ctx.web.sweepIntervalMs} 相对租约 ${ctx.web.connectionLeaseMs} 太长`);
});

test("租约：开会话就起扫描表，停服务就真的停下来", async () => {
  const ctx = host({ sweepIntervalMs: 15 });
  assert.equal(ctx.web.sweepTimer, null, "还没有会话就起了扫描表");

  // 数真实的扫描次数，不看字段。只断言 sweepTimer 变成 null 的话，一个「把字段清空但
  // 不 clearInterval」的实现照样是绿的——而那个 interval 还在跑，unref 让它连进程退出
  // 都不挡，于是这件事在测试里完全静悄悄。
  let sweeps = 0;
  const realSweep = ctx.web.sweepConnections.bind(ctx.web);
  ctx.web.sweepConnections = async (...args) => {
    sweeps += 1;
    return realSweep(...args);
  };

  await createSession(ctx);
  assert.notEqual(ctx.web.sweepTimer, null,
    "开了会话却没起扫描表：所有掉线判定都只会在有人显式调用时发生");
  await new Promise((resolve) => setTimeout(resolve, 90));
  const whileRunning = sweeps;
  assert.ok(whileRunning >= 2,
    `扫描表起了却没在跑：90ms 内只扫了 ${whileRunning} 次`);

  await ctx.web.stop();
  assert.equal(ctx.web.sweepTimer, null, "停服务没有把字段清掉");
  const atStop = sweeps;
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(sweeps, atStop,
    `停服务之后扫描还在跑：又扫了 ${sweeps - atStop} 次`);
});

// 本文件的主证据：停止轮询之后该席真的被判掉线。
test("租约：浏览器停止轮询超过租约后，该席被判掉线", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);
  assert.equal(connectedIn(ctx, session.seat_id), true, "刚建会话就该是已连接");

  // 一直不轮询，时间推过租约。
  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.sweepConnections();

  assert.equal(connectedIn(ctx, session.seat_id), false,
    "停止轮询超过租约后仍是已连接：保留窗永远不起算，位子永远不还");
});

test("租约：持续轮询的连接不会被判掉线", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  // 每次推进不到租约就续一次，重复到远超租约的总时长。
  const step = Math.floor(CONNECTION_LEASE_MS / 2);
  for (let i = 0; i < 6; i += 1) {
    ctx.clock.advance(step);
    await ctx.web.touchConnection(session, session.first_connection_id);
    await ctx.web.sweepConnections();
    assert.equal(connectedIn(ctx, session.seat_id), true,
      `第 ${i + 1} 次续租后被误判掉线（累计 ${(i + 1) * step}ms）`);
  }
});

test("租约：读视图本身就是一次续租，不需要额外的心跳请求", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  ctx.clock.advance(CONNECTION_LEASE_MS - 1);
  // buildView 走的是浏览器每 700ms 都在调的那条路。它必须续租，否则页面得再发一种
  // 请求专门保活，而那条请求一旦被浏览器节流就会造成假掉线。
  await ctx.web.buildView(session, { connectionId: session.first_connection_id });
  ctx.clock.advance(CONNECTION_LEASE_MS - 1);
  await ctx.web.sweepConnections();

  assert.equal(connectedIn(ctx, session.seat_id), true,
    "读视图没有续租：页面必须另发心跳，而那条请求被节流就会造成假掉线");
});

// 两个窗口：关掉一个不算掉线。这条既有测试已经覆盖（test/table-web-host.test.cjs），
// 这里要证明租约没有把它破坏——按连接分别计时，而不是按会话。
test("租约：同席两个连接只有一个停止轮询时，该席仍在线", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);
  const second = await ctx.web.connect(session, "conn-second-window");
  assert.equal(session.connections.size, 2);

  // 只给第二个窗口续租，第一个不管。
  for (let i = 0; i < 4; i += 1) {
    ctx.clock.advance(Math.floor(CONNECTION_LEASE_MS / 2));
    await ctx.web.touchConnection(session, second);
    await ctx.web.sweepConnections();
  }

  assert.equal(connectedIn(ctx, session.seat_id), true,
    "一个窗口不轮询就把整席判掉线了");
  assert.equal(session.connections.has(second), true, "还在轮询的那个连接被摘掉了");
  assert.equal(session.connections.size, 1, "过期的那个连接没有被摘掉");
});

// 新开的窗口从「现在」起算，不从会话开始起算。
//
// 这条不是上一条的重复。上一条讲的是「已有连接被单独计时」，这条讲的是「建连接这一步本身
// 要记时间」：不记的话回落到 opened_at，于是一个在牌局打了半小时后才打开的第二个窗口，
// 第一次扫描就被判掉线——它一次都没来得及轮询。
test("租约：会话开了很久之后新开的窗口，不会在第一次扫描就被判掉线", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  // 先正常打一段时间，期间持续续租第一个窗口，让 opened_at 远远落在过去。
  const first = session.first_connection_id;
  for (let i = 0; i < 10; i += 1) {
    ctx.clock.advance(Math.floor(CONNECTION_LEASE_MS / 2));
    await ctx.web.touchConnection(session, first);
    await ctx.web.sweepConnections();
  }
  assert.ok(ctx.clock.now() - session.opened_at > CONNECTION_LEASE_MS,
    "前置条件不成立：会话还没有开够久");

  // 这时才开第二个窗口，然后立刻扫描——它一次都还没轮询过。
  const second = await ctx.web.connect(session, "conn-late-window");
  await ctx.web.sweepConnections();

  assert.equal(session.connections.has(second), true,
    "新开的窗口在第一次扫描就被摘掉了：建连接那一步没有起算租约");
  assert.equal(connectedIn(ctx, session.seat_id), true, "该席被判掉线了");
});

test("租约：过期连接被摘掉之后，重新连接能恢复在线", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.sweepConnections();
  assert.equal(connectedIn(ctx, session.seat_id), false);

  // 保留窗内回来。凭据一直在协调器内存里，浏览器只需证明自己还持有会话令牌。
  await ctx.web.connect(session, session.token);
  assert.equal(connectedIn(ctx, session.seat_id), true, "保留窗内重连没有恢复在线");
});

// 断网恢复。这条与上面那条的差别是「谁来重连」：上面是显式调 connect（页面走 resume），
// 这条是页面什么都没做，只是轮询又通了。
//
// 现状会失败，而且失败的方式很难在使用中察觉：touchConnection 只给集合里已有的连接续租，
// 于是租约到期被摘掉之后，同一个页面继续成功轮询也永远续不上。玩家自己看到的是一份正常
// 更新的牌桌（view.projection 和 view.hand 都不需要连接），同桌看到的却是一个永远掉线的
// 席位——然后结算时被判 SIT_OUT，120 秒后位子被收走。
//
// 「拒绝不在集合里的 id」这条规则本身是对的，它挡的是「持会话令牌的人替别的窗口续命」。
// 但同一个会话重建自己的连接不在被挡的范围里：浏览器出示的正是 resume 要的那同一份证明。
test("租约：断网被判掉线后，网络恢复、轮询自己通了就该重新在线", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);
  const connectionId = session.first_connection_id;

  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.sweepConnections();
  assert.equal(connectedIn(ctx, session.seat_id), false, "租约到期没有判掉线");

  // 网络回来。页面没有点任何按钮，也没有走 resume，只是下一次轮询成功到达。
  await ctx.web.buildView(session, { connectionId });

  assert.equal(connectedIn(ctx, session.seat_id), true,
    "轮询恢复后席位仍显示掉线：页面在正常更新，同桌却看到一个永远掉线的人");
  assert.equal(session.connections.has(connectionId), true,
    "连接没有回到会话的连接集合，下一次扫描会再判它一次掉线");
});

// 反面：重建连只作用在自己这一个会话上。
//
// 钉的不是「id 字符串不许重合」——两席各自的连接集合互不相干，同一个字符串出现在两边
// 没有任何耦合，那条断言是空的。真正会出错的实现是「按 id 去全局找这个连接属于谁」：
// id 是调用方随口给的字符串，全局查找等于让任何持有一份会话令牌的人去动别人的连接。
test("租约：重建连只动自己的会话，不会因为 id 撞上就改到别人头上", async () => {
  const ctx = host();
  const { session: a, created } = await createSession(ctx, "p1");
  const { session: b } = await joinSession(ctx, created.invite_code, "p2");
  const bConnection = b.first_connection_id;

  // 让 a 过期被摘掉，b 的连接留在集合里不动。b 仍在集合里是这条测试的关键：
  // 「按 id 全局找这个连接属于谁」那种实现只有在真能找到时才会露出来，先把 b 也扫掉
  // 就等于把要测的分支绕过去了。
  ctx.clock.advance(Math.floor(CONNECTION_LEASE_MS / 2) + 1);
  await ctx.web.touchConnection(b, bConnection);
  ctx.clock.advance(Math.floor(CONNECTION_LEASE_MS / 2) + 1);
  await ctx.web.sweepConnections();
  assert.equal(connectedIn(ctx, a.seat_id), false, "前置条件不成立：a 没有被判掉线");
  assert.equal(b.connections.has(bConnection), true, "前置条件不成立：b 的连接不在集合里");

  // a 拿着 b 的连接 id 轮询。正确的做法是把它当成 a 自己的连接重建；按 id 全局查找的
  // 实现会转去给 b 续租，而 a 自己一直是掉线的——一个正常轮询的页面永远回不来。
  await ctx.web.buildView(a, { connectionId: bConnection });

  assert.equal(connectedIn(ctx, a.seat_id), true,
    "a 正常轮询却没有恢复在线：这次续租被记到了别人头上");
  assert.equal(a.connections.has(bConnection), true, "a 自己的连接集合没有更新");
  assert.equal(b.connections.size, 1, "b 的连接集合被外人改动了");
});

test("租约：扫描是幂等的，同一个过期连接不会被断开两次", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);
  ctx.clock.advance(CONNECTION_LEASE_MS + 1);

  const first = await ctx.web.sweepConnections();
  const second = await ctx.web.sweepConnections();

  assert.equal(first.disconnected.length, 1, `第一次扫描应断开 1 个: ${JSON.stringify(first)}`);
  assert.deepEqual(second.disconnected, [],
    `第二次扫描又断了一遍: ${JSON.stringify(second)}`);
});

// pagehide/sendBeacon 只是加速，不是唯一依据。
test("租约：不发 beacon 也会到期断线（beacon 不是唯一依据）", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  // 刻意不调 postDisconnect —— 模拟崩溃、断电、拔网线：这些情况下 beacon 根本发不出。
  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.sweepConnections();

  assert.equal(connectedIn(ctx, session.seat_id), false,
    "没有 beacon 就永远判不了掉线，那 beacon 就成了唯一依据");
});

test("租约：beacon 到达时立即断线，不必等租约到期", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  // 显式断开走的就是 beacon 那条路。
  await ctx.web.disconnect(session, session.first_connection_id);
  assert.equal(connectedIn(ctx, session.seat_id), false,
    "显式断开没有立即生效，那 beacon 就没有加速作用");
  // 且不必等到租约到期。
  assert.equal(session.connections.size, 0);
});

// 释放之后的清理。要求：「释放后删除 web session、custody binding 和相关凭据」。
test("释放：座位被权威释放后，web session 与 custody binding 都被删掉", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);
  const handle = session.seat_handle;
  assert.equal(ctx.web.sessions.has(session.token), true);
  assert.equal(ctx.web.custody.handles().includes(handle), true);

  // 掉线 + 熬过 120 秒保留窗，再让权威释放。
  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.sweepConnections();
  ctx.clock.advance(120_000 + 1);
  // 释放没有独立命令：releaseExpiredSeats 挂在 roomState 与 evaluateStart 里。
  await ctx.core.dispatch("hand.evaluate_start", {});
  await ctx.web.sweepConnections();

  assert.equal(ctx.web.sessions.has(session.token), false,
    "座位已释放但 web session 还在：一个指向不存在席位的会话令牌仍然可用");
  assert.equal(ctx.web.custody.handles().includes(handle), false,
    "座位已释放但 custody binding 还在，凭据留在内存里");
});

test("释放：清理之后拿旧会话令牌读视图会被拒，不是拿到一份陈旧快照", async () => {
  const ctx = host();
  const { session } = await createSession(ctx);

  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.sweepConnections();
  ctx.clock.advance(120_000 + 1);
  // 释放没有独立命令：releaseExpiredSeats 挂在 roomState 与 evaluateStart 里。
  await ctx.core.dispatch("hand.evaluate_start", {});
  await ctx.web.sweepConnections();

  // 浏览器走的那条路：它手里只有会话令牌，令牌已经查不到会话。
  assert.throws(
    () => ctx.web.requireSession(session.token),
    (error) => {
      assert.equal(error.code, "web_session_unknown", `错误码不对: ${error.code}`);
      return true;
    },
    "释放后旧令牌还能换到会话对象",
  );

  // 纵深那一层：就算有人手里还攥着会话对象本体（进程内的引用不会因为删 Map 而消失），
  // 也读不出视图，因为托管绑定同时被删了。两条都断言是因为它们能各自失效：只删 sessions
  // 会留下一个仍可用的句柄，只 forget 句柄会留下一个仍能查到的令牌。
  await assert.rejects(
    () => ctx.web.buildView(session, { connectionId: session.first_connection_id }),
    (error) => {
      assert.ok(["seat_handle_unknown", "seat_credential_revoked", "seat_not_found"]
        .includes(error.code), `错误码不对: ${error.code}`);
      return true;
    },
    "释放后拿着会话对象仍能读到视图",
  );
});

test("释放：只有真被释放的那一席被清理，同桌其他人的会话不受影响", async () => {
  const ctx = host();
  const { session: a, created } = await createSession(ctx, "p1");
  const { session: b } = await joinSession(ctx, created.invite_code, "p2");

  // 只让 a 掉线到释放。b 一直续租。
  ctx.clock.advance(CONNECTION_LEASE_MS + 1);
  await ctx.web.touchConnection(ctx.web.sessions.get(b.token), b.first_connection_id);
  await ctx.web.sweepConnections();
  for (let i = 0; i < 3; i += 1) {
    ctx.clock.advance(40_000);
    await ctx.web.touchConnection(ctx.web.sessions.get(b.token), b.first_connection_id);
    await ctx.web.sweepConnections();
  }
  // 释放没有独立命令：releaseExpiredSeats 挂在 roomState 与 evaluateStart 里。
  await ctx.core.dispatch("hand.evaluate_start", {});
  await ctx.web.sweepConnections();

  assert.equal(ctx.web.sessions.has(a.token), false, "a 的会话没被清理");
  assert.equal(ctx.web.sessions.has(b.token), true, "b 的会话被顺带清掉了");
  assert.equal(ctx.web.custody.handles().includes(b.seat_handle), true,
    "b 的 custody binding 被顺带清掉了");
});

test("凭据不进 URL：任何路由与参数形状里都不出现长期凭据", async () => {
  const ctx = host();
  const { session, created } = await createSession(ctx);
  // 会话令牌是短期的、只在本进程有意义；恢复凭据是长期的，绝不能出现在 URL 里。
  const credential = created.recovery_credential;
  assert.equal(typeof credential, "string");
  assert.ok(credential.length > 0);

  // 协调器给浏览器的所有标识都不得包含凭据原文。
  const exposed = [session.token, session.first_connection_id, session.seat_id];
  for (const value of exposed) {
    assert.ok(!String(value).includes(credential),
      `给浏览器的标识里含凭据原文: ${String(value).slice(0, 40)}`);
  }
});
