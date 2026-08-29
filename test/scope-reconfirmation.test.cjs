"use strict";

// 阶段 1 项 6：绑房、桌规版本、发言限制版本任一变化，UI 必须重新要求确认。
//
// 缺陷本体是一个「一个字段兼两职责」的老毛病的变体：视图里的 public_scope_confirmed
// 算的是「这一席存在过一份确认」，而不是「存在一份对得上当前这张桌子的确认」。权威侧
// requireConfirmedScope 按 (room_binding_id, table_rules_version, seat_id) 三元组比对，
// 所以换绑或改桌规之后，那份旧确认对不上，chat.say 一律被拒为
// default_public_scope_not_confirmed——而 UI 显示「已确认」，同意门再也不出现。
// 玩家看到的是：说什么都失败，而页面上没有任何东西解释为什么，也没有可以点的东西。
//
// 三个维度的性质不同，必须分开说清楚：
//   room_binding_id      —— 权威强制。UI 重新要求确认是照着一道真门在走。
//   table_rules_version  —— 权威强制。同上。
//   发言限制版本          —— 权威不强制。它被记进确认里（seat-ai-store 那行
//     limits_version: this.limits.version），但 requireConfirmedScope 从不比对它。
//     规则 3 的原文是「实质改变热闹度或公平性的调整仍须重新确认」，而「实质」是人的
//     判断，机器只有版本串可比。所以本轮只做 UI 侧重新询问，权威侧要不要按版本串强制
//     留作待用户裁决项——按版本串强制会让一次非实质的版本号变动也让既有确认失效，
//     那是改变已确认的用户结果。
//
// 还有一个把上面这件事藏起来的陷阱：roomState.limits_version 与确认里记的
// limits_version 根本不是同一个东西。前者来自 RoomStore 的 TABLE_LIFECYCLE_V1（席位数、
// 保留窗），后者来自 SeatAiStore 的 LIVELY_V1（字素上限、每手条数、启动间隔）。规则 3
// 说的是后者。拿前者去比会让「限制变了吗」这个问题永远答错。

const assert = require("node:assert/strict");
const test = require("node:test");

const fs = require("node:fs");
const path = require("node:path");

const viewModel = require("../src/host/table-view-model.cjs");

const BIND = "bind-current";
const RULES = "table-rules-v1";
const SPEECH = "LIVELY_V1";

// 一张最小的桌子：两席，viewer 是 seat-a。
function input(overrides = {}) {
  const confirmation = overrides.confirmation === undefined
    ? {
      seat_id: "seat-a",
      room_binding_id: BIND,
      table_rules_version: RULES,
      limits_version: SPEECH,
      confirmed_at: 1_000,
    }
    : overrides.confirmation;

  return {
    roomState: {
      room: {
        room_id: "room-1",
        // 同样用 in：显式传 null 表示「房间投影里就没有这个字段」，那是要测的情形之一。
        room_binding_id: "roomBindingId" in overrides ? overrides.roomBindingId : BIND,
        table_rules_version: "tableRulesVersion" in overrides
          ? overrides.tableRulesVersion
          : RULES,
        status: "OPEN",
        max_seats: 4,
      },
      limits_version: "TABLE_LIFECYCLE_V1",
      hand_index: 0,
      seats: [
        { seat_id: "seat-a", player_id: "alice", state: "ACTIVE", connected: true, stack: 200 },
        { seat_id: "seat-b", player_id: "bob", state: "ACTIVE", connected: true, stack: 200 },
      ],
      participable_count: 2,
      start_decision: { can_start: false, reason: "not_enough_ready" },
    },
    aiStates: {
      "seat-a": { public_scope_confirmation: confirmation },
      "seat-b": {
        public_scope_confirmation: {
          seat_id: "seat-b",
          room_binding_id: BIND,
          table_rules_version: RULES,
          limits_version: SPEECH,
          confirmed_at: 1_000,
        },
      },
    },
    viewerSeatId: "seat-a",
    // 用 in 判定而不是 ??：?? 会把显式传进来的 null 当成「没传」而回落到默认值，
    // 于是「宿主没报版本」那一路根本没被测到。这一处正是变异测试指出来的——
    // limits-absent-counts-as-changed 存活，因为那条测试其实一直在测有版本的情形。
    speechLimitsVersion: "speechLimitsVersion" in overrides
      ? overrides.speechLimitsVersion
      : SPEECH,
    now: 2_000,
  };
}

function me(view) {
  return view.seats.find((seat) => seat.is_viewer) ?? null;
}

// 宿主必须报发言限制的版本，不是房间生命周期的版本。
//
// 这一条单独存在，因为两个字段同名不同义：roomState.limits_version 是
// TABLE_LIFECYCLE_V1（席位数、保留窗），而规则 3 要重新确认的是 LIVELY_V1（字素上限、
// 每手条数、启动间隔）。上面那些测试直接调 build，传什么就是什么，所以它们钉不住
// 「宿主取错了对象」——而取错的表现是这道门永远弹或永远不弹，两个方向都不会报错。
test("宿主把发言限制的版本报进视图，而不是生命周期版本", async () => {
  const { CommandSurface } = require("../src/authority/command-surface.cjs");
  const { InProcessCoreClient } = require("../src/host/core-client.cjs");
  const { TableWebHost } = require("../src/host/table-web-host.cjs");
  const { LIVELY_V1 } = require("../src/authority/seat-ai-store.cjs");
  const { stackedDeck } = require("../src/game/holdem.cjs");

  let at = 1_000;
  const surface = new CommandSurface({ deckFactory: () => stackedDeck([]), now: () => at });
  const core = new InProcessCoreClient({ surface });
  const web = new TableWebHost({ core, now: () => at, driveIntervalMs: 3_600_000 });

  const response = {
    out: {},
    writeHead() {},
    end(payload) { this.out = JSON.parse(payload); },
  };
  await web.postCreate(response, { player_id: "p1", table_rules_version: "table-rules-v1" });
  const session = web.sessions.get(response.out.session_token);
  await core.dispatch(
    "room.confirm_public_scope",
    web.injected("room.confirm_public_scope", session, { acknowledged: true }),
  );

  const before = await web.buildView(session);
  const meBefore = before.seats.find((seat) => seat.is_viewer);
  assert.equal(meBefore.public_scope_reconfirm_reason, null,
    "刚确认完就说要重新确认：宿主报的版本和权威记的对不上");

  // 只换版本串、数值一个不动，模拟 Primary 版本化调整之后的那一刻。
  //
  // 本文件开头把「权威侧要不要按版本串强制」记成待裁决项，并写明按版本串强制会让一次
  // 非实质的版本号变动也让既有确认失效。这一轮的裁决是：不算。实质性由 policy epoch
  // 表达，而 epoch 刻意不含 version 字段（理由记在 policy-epoch.cjs 的排除清单里）。
  // 所以这里断言的方向与上一轮相反，且这是有意的改动，不是回归。
  web.limits = { ...LIVELY_V1, version: "LIVELY_V2" };
  const after = await web.buildView(session);
  const meAfter = after.seats.find((seat) => seat.is_viewer);
  assert.equal(meAfter.public_scope_reconfirm_reason, null,
    "只改版本串就要求重新确认——同意门会被无意义的版本号变动刷成噪音");
  assert.equal(meAfter.public_scope_confirmed, true);

  // 真正放宽额度就必须重新问，而且这一次界面和权威要给出同一个答案。
  // 改的是权威那一份 limits（协调器持有的），不是宿主那份——界面必须照权威报的 epoch
  // 判断，而不是照自己手上的数值。
  surface.orchestrator.ai.limits = { ...LIVELY_V1, maxGraphemesPerMessage: 480 };
  const relaxed = await web.buildView(session);
  const meRelaxed = relaxed.seats.find((seat) => seat.is_viewer);
  assert.equal(meRelaxed.public_scope_reconfirm_reason, "public_limits_changed",
    "权威侧放宽了额度，界面却没要求重新确认");
  assert.equal(meRelaxed.public_scope_confirmed, false);

  await web.stop();
});

// 投影报的 epoch 必须和 gate 用的 epoch 是同一个值。
//
// 这一条独立存在，因为两者算错的方向不同却都不报错：投影读错字段（把 roomState 顶层
// 当成房间字段）时 epoch 恒为 binding:-|rules:-，于是每次渲染都要求重新确认、理由永远
// 是 new_room_binding；而 gate 读的是真值，照样放行。玩家看到的是一个点了也不消失的
// 同意门，而权威侧一切正常，日志里没有任何错误。
test("投影报的 epoch 与权威 gate 用的 epoch 同值", async () => {
  const { CommandSurface } = require("../src/authority/command-surface.cjs");
  const { policyEpoch } = require("../src/authority/policy-epoch.cjs");
  const { stackedDeck } = require("../src/game/holdem.cjs");

  const surface = new CommandSurface({ deckFactory: () => stackedDeck([]), now: () => 1_000 });
  surface.dispatch("room.create", { player_id: "p1", table_rules_version: "table-rules-v1" });

  const projection = surface.orchestrator.projection();
  assert.equal(typeof projection.policy_epoch, "string");
  // 不能是空壳：三段都缺的 epoch 也是字符串，但它对不上任何真实确认。
  assert.ok(!projection.policy_epoch.includes("binding:-"),
    `投影里的绑房段是空的：${projection.policy_epoch}`);
  assert.ok(!projection.policy_epoch.includes("rules:-"),
    `投影里的桌规段是空的：${projection.policy_epoch}`);

  // 照权威自己的房间字段独立算一遍，必须一致。
  const room = surface.orchestrator.rooms.roomState().room;
  assert.equal(projection.policy_epoch, policyEpoch({
    roomBindingId: room.room_binding_id,
    tableRulesVersion: room.table_rules_version,
    limits: surface.orchestrator.ai.limits,
  }));
});

// 权威没报 epoch 时，宿主必须退回按发言限制版本判定——而且报的得是 LIVELY_V1 那一份。
//
// 这一条在 epoch 接上之后仍然必要，理由是它测的是另一条路：epoch 分支优先，于是生产路径
// 不再走三字段判定，而 speechLimitsVersion 报错对象就不再有可观察后果。变异
// host-reports-lifecycle-version 正是这样从「代码不可达」里活下来的——不是因为它无害，
// 而是因为没有测试站在它会造成伤害的那个条件上。
//
// 那个条件是「权威没报 epoch」。它不是假想情形：退路本来就是为它写的。
test("权威没报 epoch 时，宿主报的是发言限制版本而不是生命周期版本", async () => {
  const { CommandSurface } = require("../src/authority/command-surface.cjs");
  const { InProcessCoreClient } = require("../src/host/core-client.cjs");
  const { TableWebHost } = require("../src/host/table-web-host.cjs");
  const { LIVELY_V1 } = require("../src/authority/seat-ai-store.cjs");
  const { stackedDeck } = require("../src/game/holdem.cjs");

  const at = 1_000;
  const surface = new CommandSurface({ deckFactory: () => stackedDeck([]), now: () => at });
  const core = new InProcessCoreClient({ surface });
  const web = new TableWebHost({ core, now: () => at, driveIntervalMs: 3_600_000 });

  const response = { out: {}, writeHead() {}, end(payload) { this.out = JSON.parse(payload); } };
  await web.postCreate(response, { player_id: "p1", table_rules_version: "table-rules-v1" });
  const session = web.sessions.get(response.out.session_token);
  await core.dispatch(
    "room.confirm_public_scope",
    web.injected("room.confirm_public_scope", session, { acknowledged: true }),
  );

  // 摘掉投影里的 epoch，模拟一个不报这个字段的内核。改的是投影出口，不是宿主——
  // 要检验的正是宿主在拿不到 epoch 时的行为。
  const realProjection = surface.orchestrator.projection.bind(surface.orchestrator);
  surface.orchestrator.projection = () => {
    const projection = realProjection();
    delete projection.policy_epoch;
    return projection;
  };

  const before = await web.buildView(session);
  assert.equal(before.seats.find((seat) => seat.is_viewer).public_scope_reconfirm_reason, null,
    "退路一上来就要求重新确认：宿主报的版本和权威记进确认的不是同一份");

  // 这一路按版本串判定（旧语义，仅退路）。宿主若报的是 roomState.limits_version
  // （TABLE_LIFECYCLE_V1），这里就永远看不到变化。
  web.limits = { ...LIVELY_V1, version: "LIVELY_V2" };
  const after = await web.buildView(session);
  assert.equal(
    after.seats.find((seat) => seat.is_viewer).public_scope_reconfirm_reason,
    "public_limits_changed",
    "退路里发言限制版本变了却没要求重新确认——检查宿主取的是不是 roomState.limits_version",
  );

  await web.stop();
});

// 每个会传给 UI 的理由都要有对应文案，而且页面上得有地方放它。
//
// 缺文案的表现是对话框第二次出现、措辞和第一次一模一样——玩家无从判断自己是不是刚才
// 点漏了，而这恰好是「重新确认」最需要说清楚的一刻。这类缺口不会抛错、不会红，所以要
// 一条按文本对照的静态测试。
test("三个重新确认理由在页面上都有文案，且有承载它的元素", () => {
  const js = fs.readFileSync(path.resolve(__dirname, "../web/table/table.js"), "utf8");
  const html = fs.readFileSync(path.resolve(__dirname, "../web/table/index.html"), "utf8");

  assert.ok(html.includes('id="scope-reason"'), "对话框里没有放理由的元素");
  // 元素必须在对话框内部。放到外面的话它会出现在页面某处而对话框里空着。
  const gate = html.indexOf('id="scope-gate"');
  const box = html.indexOf("</section>", gate);
  const node = html.indexOf('id="scope-reason"');
  assert.ok(gate !== -1 && node > gate && node < box, "理由元素不在同意门内部");

  for (const reason of ["new_room_binding", "table_rules_changed", "public_limits_changed"]) {
    const match = new RegExp(`${reason}:\\s*"[^"]{8,}"`).test(js);
    assert.ok(match, `理由 ${reason} 没有文案`);
  }
  // never_confirmed 刻意没有文案：首次入桌时正文本身就是说明。
  assert.ok(!/never_confirmed:\s*"/.test(js),
    "never_confirmed 不该有额外文案，正文已经是那段说明");
});

test("三项都对得上时是已确认，且没有重新确认的理由", () => {
  const view = viewModel.build(input());
  assert.equal(me(view).public_scope_confirmed, true);
  assert.equal(me(view).public_scope_reconfirm_reason, null);
});

test("换绑之后视为未确认，理由是新绑房", () => {
  const view = viewModel.build(input({ roomBindingId: "bind-new" }));
  // 这一条是权威强制的那一维：旧确认对不上新绑房，chat.say 会被拒。UI 必须跟着说未确认，
  // 否则玩家看到「已确认」而每句话都失败。
  assert.equal(me(view).public_scope_confirmed, false,
    "换绑后仍报已确认：权威会拒绝这一席发言，而页面不会再弹同意门");
  assert.equal(me(view).public_scope_reconfirm_reason, "new_room_binding");
});

test("桌规版本变化之后视为未确认，理由是桌规变了", () => {
  const view = viewModel.build(input({ tableRulesVersion: "table-rules-v2" }));
  assert.equal(me(view).public_scope_confirmed, false);
  assert.equal(me(view).public_scope_reconfirm_reason, "table_rules_changed");
});

// 发言限制那一维刻意与上面两条不同：权威不比对它，所以 confirmed 保持 true
// （如实反映「权威会放行」），但重新确认的理由要报出来，UI 据此重新弹门。
test("发言限制版本变化时仍报已确认，但要给出重新确认的理由", () => {
  const view = viewModel.build(input({ speechLimitsVersion: "LIVELY_V2" }));
  assert.equal(me(view).public_scope_confirmed, true,
    "权威侧 requireConfirmedScope 不比对 limits_version，所以这里说未确认就是说错了");
  assert.equal(me(view).public_scope_reconfirm_reason, "public_limits_changed");
});

test("从未确认过时理由与「变了」区分开", () => {
  const view = viewModel.build(input({ confirmation: null }));
  assert.equal(me(view).public_scope_confirmed, false);
  // 首次入桌和「规则变了请重看」是两句不同的话。合成一个理由会让对话框在换绑之后
  // 说「欢迎入桌」，或者在首次入桌时说「桌规刚刚变了」。
  assert.equal(me(view).public_scope_reconfirm_reason, "never_confirmed");
});

test("多项同时变化时优先报绑房：那是最强的一层", () => {
  const view = viewModel.build(input({
    roomBindingId: "bind-new",
    tableRulesVersion: "table-rules-v2",
    speechLimitsVersion: "LIVELY_V2",
  }));
  // 顺序必须确定。不定的话同一份状态在两次渲染里可能给出不同理由，而那种抖动
  // 在页面上表现为对话框标题自己变来变去。
  assert.equal(me(view).public_scope_reconfirm_reason, "new_room_binding");
});

test("别席不带确认状态，也不带重新确认理由", () => {
  const view = viewModel.build(input());
  const other = view.seats.find((seat) => !seat.is_viewer);
  assert.equal(other.public_scope_confirmed, null);
  assert.equal(other.public_scope_reconfirm_reason, null,
    "把别人的重新确认理由铺出去，UI 就有机会替别人显示一个「去确认」按钮");
});

// 不传发言限制版本时不能当成「变了」。宿主可能还没接上这个字段，而那不该让
// 每一席都永远看到同意门。
test("没有拿到发言限制版本时不判定为变化", () => {
  const view = viewModel.build(input({ speechLimitsVersion: null }));
  assert.equal(me(view).public_scope_reconfirm_reason, null);
  assert.equal(me(view).public_scope_confirmed, true);
});

// 两边都没有这个字段时不能算「对上了」。
//
// 这一条是变异测试逼出来的：只测「确认缺字段、房间有字段」时，undefined !== "bind-x"
// 天然不成立，于是那两个 typeof 守卫从没被读到。真正需要它们的是两边都缺的情形——
// undefined === undefined 为真，于是一份什么都没记的确认被判定为对上了当前这张桌子。
test("房间投影缺字段时不能因为两边都是 undefined 而算对上", () => {
  const view = viewModel.build(input({
    roomBindingId: null,
    confirmation: { seat_id: "seat-a", table_rules_version: RULES, limits_version: SPEECH },
  }));
  assert.equal(me(view).public_scope_confirmed, false,
    "两边都缺 room_binding_id 时算对上了：一份什么都没记的确认被当成有效");
  assert.equal(me(view).public_scope_reconfirm_reason, "new_room_binding");

  // 显式的 null 是真正会撞上守卫的那一种。缺字段读出来是 undefined，而视图模型对房间侧
  // 用的是 ?? null，两者不相等，所以「缺字段」这一路自己就不成立；只有上游把字段写成
  // null 时两边才真的相等。视图模型是唯一的降级层，畸形上游正是它该挡住的东西。
  const bothNull = viewModel.build(input({
    roomBindingId: null,
    confirmation: {
      seat_id: "seat-a", room_binding_id: null, table_rules_version: RULES,
      limits_version: SPEECH,
    },
  }));
  assert.equal(bothNull.seats.find((s) => s.is_viewer).public_scope_confirmed, false,
    "两边都是 null 时算对上了：null === null 为真，而它什么也没证明");
  assert.equal(bothNull.seats.find((s) => s.is_viewer).public_scope_reconfirm_reason,
    "new_room_binding");

  const rules = viewModel.build(input({
    tableRulesVersion: null,
    confirmation: {
      seat_id: "seat-a", room_binding_id: BIND, table_rules_version: null,
      limits_version: SPEECH,
    },
  }));
  assert.equal(rules.seats.find((s) => s.is_viewer).public_scope_confirmed, false);
  assert.equal(rules.seats.find((s) => s.is_viewer).public_scope_reconfirm_reason,
    "table_rules_changed");
});

// 确认对象缺字段时不能抛，也不能凭空判定为「对得上」。
test("确认对象缺字段时按未对上处理，且不抛", () => {
  for (const confirmation of [
    {},
    { room_binding_id: BIND },
    { table_rules_version: RULES },
    { room_binding_id: BIND, table_rules_version: null, limits_version: SPEECH },
  ]) {
    const view = viewModel.build(input({ confirmation }));
    assert.equal(me(view).public_scope_confirmed, false,
      `缺字段的确认被当成有效: ${JSON.stringify(confirmation)}`);
    assert.equal(typeof me(view).public_scope_reconfirm_reason, "string",
      `缺字段时没有给出理由: ${JSON.stringify(confirmation)}`);
  }
});
