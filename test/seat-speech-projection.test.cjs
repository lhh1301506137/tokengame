"use strict";

// 座位旁聊天的投影层（阶段 1 项 2 的前半）。
//
// 现状：发言只进 view.messages，由页面底部一条公开时间线渲染。四个人的话混在一条流里，
// 谁说的只能靠气泡里那行名字去读。验收要求的是「玩家和 AI 的实际聊天气泡归属并显示在
// 对应真人座位旁，玩家/AI 成组，有角色标识和顺序」——一条全局时间线做不到归属，它只能
// 作为独立历史区存在。
//
// 这一层要产出的是「这一席现在旁边该显示哪几条」。三件事必须由投影决定而不是由页面：
//
//   1. 归属。按 seat_id 分组，不靠名字匹配——名字会重、会改，seat_id 不会。
//   2. 顺序。用权威的 sequence，页面不重排。四个视图必须以同一顺序看到同一批发言。
//   3. 约 10 秒后退出。这一条是几何要求的另一面：气泡不退出就会一直压在牌面上，而
//      「压住了」这件事在窄屏上不可能靠缩小解决。
//
// 退出时刻由投影从权威时间算，不用客户端 setTimeout。理由是 state-management.md 那条
// 「派生显示状态每次渲染从当前投影计算，不持久化为第二份事实」：setTimeout 会把「这条
// 该不该显示」变成第二份状态，而它和视图的唯一同步点是它自己的定时器——轮询丢一次、
// 标签页被节流一次，两者就再也对不上，且对不上的表现是气泡永远不消失。

const assert = require("node:assert/strict");
const test = require("node:test");

const viewModel = require("../src/host/table-view-model.cjs");

const RULES = "table-rules-v1";
const NOW = 1_000_000;

// 最小可用输入。这里刻意手写而不是跑真编排层：本文件测的是投影规则，
// 用真编排层会让「10 秒后退出」这条断言依赖开局时序，而那与本规则无关。
function roomWith(seatIds) {
  return {
    room: { room_id: "room-1", status: "OPEN", max_seats: 4, table_rules_version: RULES },
    hand_index: 1,
    hand_active: true,
    seats: seatIds.map((seatId, index) => ({
      seat_id: seatId,
      player_id: `player-${index + 1}`,
      seat_index: index,
      stack: 200,
      committed_this_hand: 0,
      ledger_stack: 200,
      connected: true,
      in_hand: true,
      hand_status: "active",
    })),
  };
}

function speech(sequence, seatId, speakerType, text, at, extra = {}) {
  return {
    sequence,
    at,
    payload: {
      seat_id: seatId,
      player_id: extra.playerId ?? "player-1",
      speaker_type: speakerType,
      text,
      channel: "TABLE_PUBLIC",
      ...extra.payload,
    },
    ...extra.event,
  };
}

function build(timeline, options = {}) {
  return viewModel.build({
    roomState: roomWith(options.seatIds ?? ["seat-1", "seat-2"]),
    timeline,
    viewerSeatId: options.viewerSeatId ?? "seat-1",
    now: options.now ?? NOW,
    ...options.extra,
  });
}

function seat(view, seatId) {
  const found = view.seats.find((entry) => entry.seat_id === seatId);
  assert.ok(found !== undefined, `没有这一席: ${seatId}`);
  return found;
}

test("座位旁聊天：发言按 seat_id 归属到对应席位，不落到别席", () => {
  const view = build([
    speech(1, "seat-1", "PLAYER", "我跟", NOW - 1_000),
    speech(2, "seat-2", "PLAYER", "我加", NOW - 900, { playerId: "player-2" }),
  ]);

  const one = seat(view, "seat-1").recent_speech;
  const two = seat(view, "seat-2").recent_speech;
  assert.equal(one.length, 1, `seat-1 旁边应有 1 条: ${JSON.stringify(one)}`);
  assert.equal(one[0].text, "我跟");
  assert.equal(two.length, 1, `seat-2 旁边应有 1 条: ${JSON.stringify(two)}`);
  assert.equal(two[0].text, "我加");
});

test("座位旁聊天：玩家与同席 AI 成组落在同一席，各带角色标识", () => {
  const view = build([
    speech(1, "seat-1", "PLAYER", "你怎么看", NOW - 2_000),
    speech(2, "seat-1", "SEAT_AI", "牌面偏干", NOW - 1_000),
  ]);

  const beside = seat(view, "seat-1").recent_speech;
  assert.equal(beside.length, 2, `玩家与其 AI 应当同席成组: ${JSON.stringify(beside)}`);
  assert.deepEqual(beside.map((entry) => entry.speaker_type), ["PLAYER", "SEAT_AI"]);
});

// 「成组」不能变成「按角色排序」。
//
// 这条钉的是实现方式而不是上游输入：权威的时间线本身就是 sequence 序（publicTimeline
// 按 events 追加顺序过滤，sequence 在追加时分配），所以投影不需要防御性排序——加一个
// 永远不改变结果的 sort 只是死代码。真实风险在另一头：项 2 要求「玩家/AI 成组」，而
// 「成组」最自然的错误写法就是把 PLAYER 提到 SEAT_AI 前面。那样四个视图看到的座位旁
// 顺序就与时间线不一致，而 AI 答在问之前会让对话读不通。
test("座位旁聊天：AI 先说时顺序不被「成组」改写，与时间线一致", () => {
  const view = build([
    speech(1, "seat-1", "SEAT_AI", "我先说一句", NOW - 3_000),
    speech(2, "seat-1", "PLAYER", "然后我回", NOW - 2_000),
    speech(3, "seat-1", "SEAT_AI", "再补一句", NOW - 1_000),
  ]);

  const beside = seat(view, "seat-1").recent_speech;
  assert.deepEqual(
    beside.map((entry) => entry.speaker_type),
    ["SEAT_AI", "PLAYER", "SEAT_AI"],
    "座位旁按角色重排了，AI 的回答跑到了提问前面",
  );
  // 与时间线逐条同序：唯一的顺序来源是权威，两个显示区不能各排一套。
  const timelineOrder = view.messages
    .filter((entry) => entry.seat_id === "seat-1")
    .map((entry) => entry.sequence);
  assert.deepEqual(beside.map((entry) => entry.sequence), timelineOrder,
    "座位旁与公开时间线的顺序不一致");
});

// 本文件的主证据：约 10 秒后退出。
test("座位旁聊天：约 10 秒后从座位旁退出，但仍留在公开时间线", () => {
  const view = build([
    speech(1, "seat-1", "PLAYER", "很久以前说的", NOW - 11_000),
    speech(2, "seat-1", "PLAYER", "刚说的", NOW - 1_000),
  ]);

  const beside = seat(view, "seat-1").recent_speech;
  assert.deepEqual(beside.map((entry) => entry.text), ["刚说的"],
    `超过 10 秒的那条没有从座位旁退出: ${JSON.stringify(beside)}`);

  // 时间线是独立历史区，两条都要还在。座位旁的退出不能变成删历史。
  assert.deepEqual(view.messages.map((entry) => entry.text), ["很久以前说的", "刚说的"],
    "座位旁退出把公开时间线里的历史一起删掉了");
});

test("座位旁聊天：退出阈值在 10 秒量级，且边界内的那条还在", () => {
  const ttl = viewModel.SEAT_SPEECH_TTL_MS;
  assert.equal(typeof ttl, "number");
  assert.ok(ttl >= 8_000 && ttl <= 12_000, `退出阈值不在 10 秒量级: ${ttl}`);

  const inside = build([speech(1, "seat-1", "PLAYER", "边界内", NOW - (ttl - 1))]);
  assert.equal(seat(inside, "seat-1").recent_speech.length, 1, "阈值内的那条被提前退出了");

  const outside = build([speech(1, "seat-1", "PLAYER", "边界外", NOW - (ttl + 1))]);
  assert.equal(seat(outside, "seat-1").recent_speech.length, 0, "阈值外的那条没有退出");
});

test("座位旁聊天：每条带 age_ms，页面据此做淡出而不用自己记时钟", () => {
  const view = build([speech(1, "seat-1", "PLAYER", "两秒前", NOW - 2_000)]);
  const [entry] = seat(view, "seat-1").recent_speech;
  assert.equal(entry.age_ms, 2_000, `age_ms 不对: ${JSON.stringify(entry)}`);
});

// 座位旁只留最近一小组，完整历史归时间线。气泡不设上限时，一席连说八句就会把
// 相邻席位和公共牌一起盖住，而那正是几何要求要挡的事。
test("座位旁聊天：同席多条时只留最近几条，超出的交给时间线", () => {
  const many = [];
  for (let i = 1; i <= 8; i += 1) {
    many.push(speech(i, "seat-1", "PLAYER", `第 ${i} 句`, NOW - 1_000));
  }
  const view = build(many);
  const beside = seat(view, "seat-1").recent_speech;

  assert.ok(beside.length <= viewModel.MAX_SEAT_SPEECH,
    `座位旁没有条数上限: ${beside.length} 条`);
  assert.ok(beside.length >= 2, "上限压到了 1 条，玩家与 AI 就没法成组");
  // 留下的必须是最近的那几条，不是最早的。
  assert.equal(beside[beside.length - 1].text, "第 8 句", "留下的不是最近几条");
  assert.equal(view.messages.length, 8, "完整历史没有留在时间线上");
});

test("座位旁聊天：本地隐藏的发言在座位旁降级显示，不静默消失", () => {
  const view = build([
    {
      ...speech(1, "seat-1", "PLAYER", "被我隐藏的", NOW - 1_000),
      locally_hidden_for_viewer: true,
    },
  ]);
  const [entry] = seat(view, "seat-1").recent_speech;
  assert.equal(entry.hidden, true,
    "被隐藏的发言在座位旁没有标成 hidden，页面就无从降级显示");
  assert.equal(entry.text, "被我隐藏的", "隐藏不该在投影层就把正文抹掉，那是渲染层的事");
});

test("座位旁聊天：迟到标注一路带到座位旁", () => {
  const view = build([
    speech(1, "seat-1", "SEAT_AI", "基于翻牌的判断", NOW - 1_000, {
      payload: { late: true, based_on_street: "flop" },
    }),
  ]);
  const [entry] = seat(view, "seat-1").recent_speech;
  assert.equal(entry.late, true);
  assert.equal(entry.based_on_street, "flop");
});

test("座位旁聊天：没有 seat_id 的发言不挂到任何席位上", () => {
  // 权威理论上不发这种事件，但投影不能靠上游的善意。挂错席比不显示更糟：
  // 那会把一句无主的话变成某个真人说过的话。
  //
  // 三种缺失形状都要试。buildMessages 把缺失的 seat_id 归一成 null，所以只判
  // `=== undefined` 的实现看起来是对的——它放过 null，把无主发言挂到 "null" 这个
  // 不存在的席位键上。那一条不会显示在任何卡片里，于是「逐席都为空」这种断言抓不到它，
  // 直到某天有人让 seat_id 可空，它才突然显示成某个真人说的话。
  for (const missing of [undefined, null, ""]) {
    const payload = { speaker_type: "PLAYER", text: "无主发言" };
    if (missing !== undefined) payload.seat_id = missing;
    const view = build([{ sequence: 1, at: NOW - 1_000, payload }]);

    for (const entry of view.seats) {
      assert.deepEqual(entry.recent_speech, [],
        `seat_id=${JSON.stringify(missing)} 的发言被挂到了 ${entry.seat_id} 旁`);
    }
    // 直接查投影：整份视图里一条座位旁气泡都不该存在，而不只是「已知席位上没有」。
    const total = view.seats.reduce((sum, entry) => sum + entry.recent_speech.length, 0);
    assert.equal(total, 0, `seat_id=${JSON.stringify(missing)} 时仍有 ${total} 条被归属`);
    // 这条无主发言必须还在时间线里：不归属不等于删掉。
    assert.equal(view.messages.length, 1, "无主发言从时间线里消失了");

    // 再查分组表本身。经 view.seats 看不见挂到不存在席位键上的那一条——那里恰好
    // 什么都不显示，于是缺陷查不到。分组表的键集必须是真实席位的子集。
    const grouped = viewModel.buildSeatSpeech(view.messages, NOW, new Set(["seat-1", "seat-2"]));
    assert.deepEqual([...grouped.keys()], [],
      `seat_id=${JSON.stringify(missing)} 在分组表里留下了键: ${JSON.stringify([...grouped.keys()])}`);
  }
});

// 已经不在这一桌的席位。它的话留在历史区，不挂在任何卡片旁。
test("座位旁聊天：时间线里出现未知席位时不挂到任何卡片上", () => {
  const view = build([
    speech(1, "seat-1", "PLAYER", "在座的说话", NOW - 1_000),
    speech(2, "seat-gone", "PLAYER", "已离桌的人说过的话", NOW - 900),
  ]);

  const attached = view.seats.flatMap((entry) => entry.recent_speech.map((s) => s.text));
  assert.deepEqual(attached, ["在座的说话"],
    `未知席位的发言被挂到了卡片上: ${JSON.stringify(attached)}`);
  assert.equal(view.messages.length, 2, "已离桌者的发言从历史里消失了");
});

// 时钟回拨。at 大于 now 时 age 是负数。
test("座位旁聊天：未来时间戳按刚发生处理，age_ms 不为负", () => {
  const view = build([speech(1, "seat-1", "PLAYER", "来自未来", NOW + 5_000)]);
  const [entry] = seat(view, "seat-1").recent_speech;
  assert.ok(entry !== undefined, "时钟回拨时这条被整条丢掉了");
  // 负的 age_ms 会让 CSS 那条淡出算出大于 1 的不透明度——时钟一回拨，旧发言
  // 反而比新发言更显眼。而 0 是唯一说得通的解释：它刚发生。
  assert.equal(entry.age_ms, 0, `age_ms 为负: ${entry.age_ms}`);
  assert.ok(entry.age_ms >= 0);
});

// 不传 now 时的行为。缺省值必须是「一条都不显示」，不能偷偷读时钟。
test("座位旁聊天：不传 now 时座位旁为空，且投影不去读真实时钟", () => {
  const view = viewModel.build({
    roomState: roomWith(["seat-1"]),
    timeline: [speech(1, "seat-1", "PLAYER", "一句话", Date.now())],
    viewerSeatId: "seat-1",
    // 刻意不传 now。
  });
  assert.deepEqual(seat(view, "seat-1").recent_speech, [],
    "不传 now 也显示了气泡，说明缺省值在读时钟——那让投影不再是纯函数，"
    + "注入假时钟的调用方会拿到按真实时间算的退出时刻");
  assert.equal(view.messages.length, 1, "时间线也被一起清空了");
});

test("座位旁聊天：座位旁的投影里不出现凭据形状的键", () => {
  const view = build([speech(1, "seat-1", "PLAYER", "一句话", NOW - 1_000)]);
  // build() 末尾的结构自检已经递归查过整份视图，这里只钉住 recent_speech 真的被它覆盖：
  // 一个新加的数组如果挂在自检走不到的地方，自检就成了摆设。
  const [entry] = seat(view, "seat-1").recent_speech;
  entry.recovery_credential = "leaked";
  assert.throws(
    () => viewModel.assertNoForbiddenKeys(view),
    (error) => error.code === "view_model_forbidden_key",
    "recent_speech 不在结构自检的覆盖范围内",
  );
});
