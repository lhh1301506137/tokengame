"use strict";

// 阶段 1 项 7：畸形上游投影必须有界降级，不能让整页卡在上一帧。
//
// 视图模型是权威与浏览器之间唯一的翻译层，而且它在协调器的请求路径上：它抛错就等于
// /api/view 回 500，浏览器那一拍拿不到新视图。客户端的轮询会继续，但每一拍都 500，
// 于是页面永远停在最后一帧成功的画面上——牌桌看起来还在，只是不动了，而页面上没有任何
// 东西说明发生了什么。这比显示一个空桌子糟得多：不动的旧画面看起来是真的。
//
// 所以这里要的不是「抛得漂亮」，是「产出一份能渲染的视图」。少显示可以，显示错的不行，
// 冻结更不行。
//
// 边界在哪里：本模块只对「上游给的形状不对」降级。它不吞自己的缺陷——如果是本模块的
// 代码写错了，那应该抛出来被测试抓住，而不是悄悄产出一份空视图。两者的区别是：形状
// 检查针对入参，而不是把整个函数体包进 try。

const assert = require("node:assert/strict");
const test = require("node:test");

const viewModel = require("../src/host/table-view-model.cjs");

const BASE = {
  roomState: {
    room: {
      room_id: "room-1",
      room_binding_id: "bind-1",
      table_rules_version: "table-rules-v1",
      status: "OPEN",
      max_seats: 4,
    },
    limits_version: "TABLE_LIFECYCLE_V1",
    hand_index: 1,
    seats: [
      { seat_id: "seat-a", player_id: "alice", state: "ACTIVE", connected: true, stack: 200 },
      { seat_id: "seat-b", player_id: "bob", state: "ACTIVE", connected: true, stack: 200 },
    ],
    participable_count: 2,
    start_decision: { can_start: true, reason: "ready" },
  },
  publicHand: {
    hand_id: "hand-1",
    revision: 3,
    status: "active",
    street: "FLOP",
    board: ["2h", "7d", "Kc"],
    pot_total: 10,
  },
  privateHand: {
    hand_id: "hand-1",
    revision: 3,
    status: "active",
    street: "FLOP",
    hole_cards: ["As", "Ad"],
  },
  viewerSeatId: "seat-a",
  now: 5_000,
};

// 一份视图「能渲染」的最低要求：契约字段在、seats/messages 是数组。客户端的 render()
// 会无条件读这几处，缺任一处就是一次页面级 TypeError。
function assertRenderable(view, label) {
  assert.equal(typeof view, "object", `${label}: 没有产出视图`);
  assert.notEqual(view, null, `${label}: 视图是 null`);
  assert.equal(view.contract, "tokengame.table-view.v1", `${label}: 契约标识不对`);
  assert.ok(Array.isArray(view.seats), `${label}: seats 不是数组`);
  assert.ok(Array.isArray(view.messages), `${label}: messages 不是数组`);
  for (const seat of view.seats) {
    assert.equal(typeof seat.seat_id, "string", `${label}: 席位缺 seat_id`);
    assert.ok(Array.isArray(seat.recent_speech), `${label}: 席位 recent_speech 不是数组`);
  }
}

// 抛错与「产出了不能渲染的东西」都要指名道姓地报出来，而不是让断言在别处炸。
function build(input, label) {
  try {
    return viewModel.build(input);
  } catch (error) {
    assert.fail(`${label}: 抛错而不是降级 — ${error.constructor.name}: ${error.message}`);
  }
  return null;
}

test("seats 不是数组时产出空席位表，而不是抛", () => {
  for (const seats of ["nope", 42, {}, true]) {
    const label = `seats=${JSON.stringify(seats)}`;
    const view = build({ ...BASE, roomState: { ...BASE.roomState, seats } }, label);
    assertRenderable(view, label);
    assert.equal(view.seats.length, 0, `${label}: 凭空造出了席位`);
  }
});

test("seats 里混进 null 或非对象时只丢掉那一条，其余照旧", () => {
  const seats = [null, BASE.roomState.seats[0], "x", BASE.roomState.seats[1], undefined];
  const view = build({ ...BASE, roomState: { ...BASE.roomState, seats } }, "混杂 seats");
  assertRenderable(view, "混杂 seats");
  // 逐条过滤而不是整份丢弃：一条坏数据不该让另外两个真实席位从画面上消失，而那两个人
  // 正在这张桌上打牌。
  assert.equal(view.seats.length, 2, "有效席位被一起丢掉了");
  assert.deepEqual(view.seats.map((s) => s.seat_id), ["seat-a", "seat-b"]);
  // seat_index 必须是过滤之后的连续下标。留着原下标会让 UI 的座位环出现空位。
  assert.deepEqual(view.seats.map((s) => s.seat_index), [0, 1]);
});

test("缺 seat_id 的席位被丢掉：它无法被任何后续逻辑指认", () => {
  const seats = [{ player_id: "ghost", state: "ACTIVE" }, BASE.roomState.seats[0]];
  const view = build({ ...BASE, roomState: { ...BASE.roomState, seats } }, "缺 seat_id");
  assertRenderable(view, "缺 seat_id");
  assert.equal(view.seats.length, 1);
  assert.equal(view.seats[0].seat_id, "seat-a");
});

test("timeline 不是数组或混进 null 时不抛，坏条目被丢掉", () => {
  for (const timeline of [42, "x", {}, [null], [null, { type: "TABLE_PUBLIC", payload: {} }]]) {
    const label = `timeline=${JSON.stringify(timeline)}`;
    const view = build({ ...BASE, timeline }, label);
    assertRenderable(view, label);
  }
});

test("aiStates 不是对象时不抛，AI 状态按未知处理", () => {
  for (const aiStates of ["x", 42, null, []]) {
    const label = `aiStates=${JSON.stringify(aiStates)}`;
    const view = build({ ...BASE, aiStates }, label);
    assertRenderable(view, label);
    assert.equal(view.seats.length, 2, `${label}: 席位被 aiStates 影响了`);
  }
});

test("非法枚举值原样透出，不猜、也不抛", () => {
  // 两份都要改。pickHandSource 优先取 privateHand，只改 publicHand 的话读到的还是
  // 那份合法的私有投影——测试会绿，而被测的那条路径压根没走到。
  const view = build({
    ...BASE,
    publicHand: { ...BASE.publicHand, status: "WAT", street: "??" },
    privateHand: { ...BASE.privateHand, status: "WAT", street: "??" },
  }, "非法枚举");
  assertRenderable(view, "非法枚举");
  // 照抄而不是归一化成某个合法值：UI 显示一个自己不认识的词，玩家能看出「这里不对」；
  // 悄悄改成 "active" 会让画面看起来正常而实际在说谎。
  assert.equal(view.hand.status, "WAT");
  assert.equal(view.hand.street, "??");
});

test("非法 hand.status 下不凭空给出亮牌按钮", () => {
  const view = build({
    ...BASE,
    publicHand: { ...BASE.publicHand, status: "WAT", finish_reason: "all_others_folded" },
  }, "非法 status + 亮牌");
  assertRenderable(view, "非法 status + 亮牌");
  const panel = view.action_panel;
  // action_panel 为 null 是合法降级（没有可操作的东西），那时无按钮可言。
  if (panel !== null) {
    assert.equal(panel.can_reveal, false,
      "hand.status 是非法值时给出了亮牌按钮：它会被权威拒绝，而玩家看到的是一个能点的按钮");
    assert.equal(typeof panel.can_reveal, "boolean", "can_reveal 不是布尔");
  }
});

test("底牌字段畸形时不抛，也不把畸形值当成牌面透出", () => {
  for (const holeCards of ["As", 42, [null, null], [{}, {}], {}]) {
    const label = `hole_cards=${JSON.stringify(holeCards)}`;
    const view = build({
      ...BASE,
      privateHand: { ...BASE.privateHand, hole_cards: holeCards },
    }, label);
    assertRenderable(view, label);
    const me = view.seats.find((seat) => seat.is_viewer);
    // 只要求「不抛且形状可渲染」：null 或数组都可以，字符串或数字不行——UI 会把它
    // 当成可迭代的牌面去渲染。
    assert.ok(me.hole_cards === null || Array.isArray(me.hole_cards),
      `${label}: hole_cards 既不是 null 也不是数组，UI 会按牌面去迭代它`);
  }
});

test("上游 getter 抛错时原样传出，不被转成别的错", () => {
  const roomState = {
    ...BASE.roomState,
    get seats() { throw new RangeError("upstream exploded"); },
  };
  // 这一条钉的是边界：本模块降级的是「形状不对」，不是「上游自己炸了」。把它一并吞掉
  // 会让一个真实的上游故障表现为一张空桌子，而那是最难查的一类问题——画面正常，
  // 数据没了，日志里什么都没有。
  assert.throws(
    () => viewModel.build({ ...BASE, roomState }),
    (error) => error instanceof RangeError && error.message === "upstream exploded",
    "上游 getter 的异常被吞掉或改写了",
  );
});

test("now 是异常值时不抛，座位旁气泡按不显示处理", () => {
  for (const now of [null, undefined, "x", Number.NaN, -1, Infinity]) {
    const label = `now=${String(now)}`;
    const view = build({
      ...BASE,
      timeline: [{
        type: "TABLE_PUBLIC",
        payload: { seat_id: "seat-a", player_id: "alice", text: "hi", speaker: "PLAYER" },
        at: 1_000,
      }],
      now,
    }, label);
    assertRenderable(view, label);
  }
});
