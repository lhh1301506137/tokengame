"use strict";

// 阶段 1 项 5：同意门在任何 room/seat 创建之前，且创建与加入幂等。
//
// 两件事分别缺了什么：
//
// 同意门。合同原文是「每次新房绑定或桌规版本变化都必须先明确确认『本游戏任务内的普通
// 自由文本默认公开』。确认且绑定成功后……」——确认在绑定之前。而现状是先建房、先占座，
// 然后才弹出对话框；不确认就点「先不加入」会走一次 seat.leave 把刚占的座位还掉。玩家在
// 看到那段说明之前，座位、凭据、公开时间线里的 SEAT_BOUND 都已经存在了。
//
// 幂等。room.create 与 room.join 属于 identity_creation，核心刻意没有给它们幂等账：
// 重复创建是 room_already_exists，重复加入是 player_binding_not_released。作为内核语义
// 这是对的——同一个人不该同时占两个座。但浏览器那一侧的后果是卡死：
//   - 双击「创建」，第二次拿到 409；
//   - 更糟的是丢响应：请求到了、座位建了、响应没回来。重试拿到 409，玩家停在入口页，
//     而服务端那边他的座位好好地占着，直到 120 秒保留窗走完。
// 所以幂等要做在协调器这一层：同一个入口键重放回同一份结果，而不是去动内核的
// identity_creation 语义。

const assert = require("node:assert/strict");
const test = require("node:test");

const fs = require("node:fs");
const path = require("node:path");

const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { InProcessCoreClient } = require("../src/host/core-client.cjs");
const { TableWebHost, MIN_ENTRY_KEY_LENGTH } = require("../src/host/table-web-host.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const RULES = "table-rules-v1";

function host() {
  let now = 1_000;
  const surface = new CommandSurface({ deckFactory: () => stackedDeck([]), now: () => now });
  const core = new InProcessCoreClient({ surface });
  const web = new TableWebHost({ core, now: () => now, driveIntervalMs: 3_600_000 });
  return { web, core, surface, advance: (ms) => { now += ms; }, now: () => now };
}

// postCreate / postJoin 通过 sendJson 回写，这里用一个最小的 response 替身把它接下来。
// 直接调方法而不起 HTTP：入口幂等是协调器的职责，与传输无关。
function fakeResponse() {
  const out = { status: null, body: null, headers: null };
  return {
    out,
    response: {
      writeHead(status, headers) { out.status = status; out.headers = headers; },
      end(payload) { out.body = payload === undefined ? null : JSON.parse(payload); },
    },
  };
}

async function create(ctx, body) {
  const { out, response } = fakeResponse();
  await ctx.web.postCreate(response, { table_rules_version: RULES, ...body });
  return out;
}

async function join(ctx, body) {
  const { out, response } = fakeResponse();
  await ctx.web.postJoin(response, body);
  return out;
}

const KEY_A = "entry-key-aaaaaaaaaaaaaaaaaaaa";
const KEY_B = "entry-key-bbbbbbbbbbbbbbbbbbbb";

// 同意门必须在入口页那一屏就能显示出来，而这取决于它挂在 DOM 的什么位置。
//
// 这条测试的由来：#scope-gate 原先嵌在 #table-main 里面，而入口页阶段 #table-main 带着
// hidden，[hidden] 的 display:none 会连同后代一起关掉。表现是屏幕上什么都没有、按钮点不
// 到，而元素自己的 hidden 是 false——所有读 el.hidden 的检查都说「可见」。浏览器验收里它
// 表现为一次 30 秒的点击超时，那是脚本崩溃而不是一条会指名道姓的断言。
//
// 用文本位置判定而不是起浏览器：这一条问的是「标签的嵌套关系」，那是源文件里就定下来的
// 事实。放进单元测试意味着它跟着每次 npm test 一起跑，不必等一轮五分钟的验收。
test("同意门在 DOM 里是两个 main 的兄弟节点，不在任何一个里面", () => {
  const file = path.resolve(__dirname, "../web/table/index.html");
  const html = fs.readFileSync(file, "utf8");

  const gate = html.indexOf('id="scope-gate"');
  assert.notEqual(gate, -1, "找不到 #scope-gate");
  assert.equal(html.indexOf('id="scope-gate"', gate + 1), -1, "#scope-gate 出现了多次");

  const entryMain = html.indexOf('id="entry-view"');
  const tableMain = html.indexOf('id="table-main"');
  assert.ok(entryMain !== -1 && tableMain !== -1, "找不到两个 main");

  // 入口 main 先关掉，然后才是同意门，然后才是牌桌 main。这就是「兄弟节点」在
  // 源文件里的形状。
  const entryClose = html.indexOf("</main>", entryMain);
  assert.ok(entryClose !== -1 && entryClose < gate,
    "同意门在 #entry-view 里面：那样它在牌桌那一屏就显示不出来了");
  assert.ok(gate < tableMain,
    "同意门在 #table-main 里面：那样入口页阶段它被 [hidden] 的 display:none 连带关掉，"
    + "而它自己的 hidden 仍然是 false，读 el.hidden 的检查会误报可见");

  // 初始必须是收起的。默认展开会让任何人一打开页面就看到一个无从回答的对话框。
  const section = html.slice(gate, html.indexOf(">", gate));
  assert.ok(/\bhidden\b/.test(section), "同意门默认没有 hidden");
});

// 那条 display:none 规则本身也要在。它是上面那个缺陷之所以致命的原因，同时也是页面上
// 六个靠 hidden 切换的元素能真的消失的唯一依据（.scope-gate 是 fixed 全屏层，
// .entry 是 grid，.raise-row 是 flex——它们带着 hidden 仍然参与布局）。
test("[hidden] 的 display:none 规则仍在，且带 !important", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../web/table/table.css"), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    "缺了这条规则时，display 不是 none 的元素带着 hidden 仍然显示");
});

test("入口幂等：同一个入口键重复创建回到同一个会话，不建第二个房", async () => {
  const ctx = host();

  const first = await create(ctx, { player_id: "p1", entry_key: KEY_A });
  assert.equal(first.status, 200, `第一次创建失败: ${JSON.stringify(first.body)}`);

  const second = await create(ctx, { player_id: "p1", entry_key: KEY_A });
  assert.equal(second.status, 200,
    `重放被当成新请求拒绝了: ${JSON.stringify(second.body)}——丢响应后重试的人会卡在入口`);
  assert.equal(second.body.session_token, first.body.session_token,
    "重放拿到了另一个会话令牌");
  assert.equal(second.body.seat_id, first.body.seat_id, "重放拿到了另一个座位");
  // 邀请码只在 room.create 的返回里出现一次。重放必须把它一起带回来，否则重试成功的人
  // 拿不到邀请码，等于建了一张没人能加入的桌子。
  assert.equal(second.body.invite_code, first.body.invite_code, "重放没有带回邀请码");
  assert.equal(ctx.web.sessions.size, 1, "重放多开了一个 web session");

  const projection = ctx.surface.dispatch("view.projection", {});
  assert.equal(projection.room.seats.filter((seat) => seat.player_id === "p1").length, 1,
    "同一个玩家占了两个座位");
});

test("入口幂等：换一个入口键不再是重放，第二次创建照样被内核拒绝", async () => {
  const ctx = host();
  await create(ctx, { player_id: "p1", entry_key: KEY_A });

  // 不同的键就是不同的请求。这里必须仍然报 room_already_exists——幂等不能变成
  // 「任何重复创建都放过」，否则一个真的按了两次不同表单的人会静默拿到别人的会话。
  await assert.rejects(
    () => create(ctx, { player_id: "p2", entry_key: KEY_B }),
    (error) => error.code === "room_already_exists",
    "换键之后重复创建被当成重放了",
  );
});

test("入口幂等：同一个入口键重复加入回到同一个座位", async () => {
  const ctx = host();
  const created = await create(ctx, { player_id: "p1", entry_key: KEY_A });
  const invite = created.body.invite_code;

  const first = await join(ctx, { player_id: "p2", invite_code: invite, entry_key: KEY_B });
  assert.equal(first.status, 200, `第一次加入失败: ${JSON.stringify(first.body)}`);

  const second = await join(ctx, { player_id: "p2", invite_code: invite, entry_key: KEY_B });
  assert.equal(second.status, 200,
    `重放被拒: ${JSON.stringify(second.body)}——现状是 player_binding_not_released`);
  assert.equal(second.body.session_token, first.body.session_token);
  assert.equal(second.body.seat_id, first.body.seat_id);
  assert.equal(ctx.web.sessions.size, 2, "重放多开了一个 web session");

  const projection = ctx.surface.dispatch("view.projection", {});
  assert.equal(projection.room.seats.filter((seat) => seat.player_id === "p2").length, 1);
});

test("入口幂等：加入用过的键不能拿去当创建的键", async () => {
  const ctx = host();
  const created = await create(ctx, { player_id: "p1", entry_key: KEY_A });
  await join(ctx, {
    player_id: "p2", invite_code: created.body.invite_code, entry_key: KEY_B,
  });

  // player_id 刻意保持一致（都是 p2）。换个名字的话拒绝会来自身份不符那一半，于是
  // 「命令种类也要对得上」这条从没被单独检验过——把两个条件写在一个 if 里时，只测得到
  // 其中一个就等于另一个可以随便删。
  //
  // 放过的话，一次加入的重放会回到一份「创建」的响应形状：调用方等的是带 invite_code
  // 的建房结果，拿到的是别人房间里的一个座位。
  await assert.rejects(
    () => create(ctx, { player_id: "p2", entry_key: KEY_B }),
    (error) => error.code === "entry_key_conflict",
    "同一个入口键跨命令复用没有被拒",
  );
});

test("入口幂等：同一个键换掉玩家名要被拒，不能静默回到别人的会话", async () => {
  const ctx = host();
  await create(ctx, { player_id: "p1", entry_key: KEY_A });

  await assert.rejects(
    () => create(ctx, { player_id: "someone-else", entry_key: KEY_A }),
    (error) => error.code === "entry_key_conflict",
    "同键换玩家名被当成了重放：那等于把 p1 的会话交给了另一个人",
  );
});

// 入口键是「能换回一个会话令牌」的东西，所以它的熵就是这道门的强度。太短的键等于让
// 别人可以枚举。要求一个下界，而不是「有就行」。
test("入口幂等：过短的入口键被拒，不当成没带", async () => {
  const ctx = host();
  assert.equal(typeof MIN_ENTRY_KEY_LENGTH, "number");
  assert.ok(MIN_ENTRY_KEY_LENGTH >= 16, `入口键下界太低: ${MIN_ENTRY_KEY_LENGTH}`);

  await assert.rejects(
    () => create(ctx, { player_id: "p1", entry_key: "short" }),
    (error) => error.code === "invalid_field",
    "过短的入口键被放过了",
  );
  assert.equal(ctx.web.sessions.size, 0, "被拒的请求仍然建了会话");
});

test("入口幂等：不带入口键照样能用，只是没有重放保护", async () => {
  const ctx = host();
  const first = await create(ctx, { player_id: "p1" });
  assert.equal(first.status, 200, "不带键就建不了房了");

  // 不带键时第二次创建仍然是内核那条 409。这一条钉住「幂等是可选的加固，不是必需参数」，
  // 否则任何老客户端都会在升级后突然连不上。
  await assert.rejects(
    () => create(ctx, { player_id: "p2" }),
    (error) => error.code === "room_already_exists",
  );
});

// 键的寿命跟着会话。留一张永不清理的表既是内存泄漏，也是一份长期有效的凭据。
test("入口幂等：会话被清理后入口键不再换得到东西", async () => {
  const ctx = host();
  const created = await create(ctx, { player_id: "p1", entry_key: KEY_A });
  const token = created.body.session_token;

  // 先让连接租约过期（判掉线），再走满 120 秒保留窗，然后释放。释放没有独立命令：
  // releaseExpiredSeats 挂在 roomState 与 evaluateStart 里。
  ctx.advance(9_000);
  await ctx.web.sweepConnections();
  ctx.advance(120_001);
  await ctx.core.dispatch("hand.evaluate_start", {});
  await ctx.web.sweepConnections();
  assert.equal(ctx.web.sessions.has(token), false, "前置条件不成立：会话还在");

  // 在任何一次重放尝试之前查表。放到重放之后查会分不清是扫描删掉的还是 entryReplay
  // 命中时懒删的——后者只在有人再来一次时才发生，键会一直躺在表里。
  assert.equal(ctx.web.entryKeys.has(KEY_A), false,
    "会话清理时没有一起删掉入口键：那是一份指向不存在会话的长期凭据");

  // 这时拿旧键，不能回放。它落回真正的 room.create，于是撞上内核那条 409——房间还在，
  // 只是座位被还了。拿到 409 恰好证明键不再换得到东西：还能换的话这里会是 200 加一个
  // 指向已删会话的令牌。
  await assert.rejects(
    () => create(ctx, { player_id: "p1", entry_key: KEY_A }),
    (error) => error.code === "room_already_exists",
    "旧键仍然换回了一个已经被清理的会话",
  );
});
