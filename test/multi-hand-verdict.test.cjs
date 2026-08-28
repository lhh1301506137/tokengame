"use strict";
// 多手对局与畸形降级的判定式。
//
// 这些判定式原本写在 test-support/table-web-acceptance.mjs 里，而 .mjs 单元测试装不
// 进来——装不进来的判定式等于没有测试，上一轮的「中止却判通过」正是这么漏过去的。
// 抽到 .cjs 之后这里钉住三件事：等式式的守恒判定必须误报、送达计数缺失必须被抓、
// 只看动作不看画面的全下判定必须不算通过。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  chipConservation, degradationVerdict, handCoverage,
} = require("../test-support/acceptance-result.cjs");

const MJS = path.join(__dirname, "..", "test-support", "table-web-acceptance.mjs");

// ---- 筹码守恒 ----

test("守恒：手内 stack 已扣下注，加上池等于起始总额，两边界都不触发", () => {
  const verdict = chipConservation({
    seatStacks: [199, 198, 200, 200], pot: 3, startingTotal: 800,
  });
  assert.equal(verdict.total, 797);
  assert.equal(verdict.created, false);
  assert.equal(verdict.destroyed, false);
  assert.equal(verdict.ok, true);
});

test("守恒：结算后 stack 是账本值而 pot 仍是 settlement.total_pot，相加超额也不算凭空产生", () => {
  // 这是等式式判定必然误报的那一组：800 + 3 = 803 > 800，而筹码一枚都没多。
  // 第一版写成 total + inPlay <= startingTotal，就在真实运行的第 7 手上炸了。
  const verdict = chipConservation({
    seatStacks: [200, 200, 200, 200], pot: 3, startingTotal: 800,
  });
  assert.equal(verdict.total, 800);
  assert.equal(verdict.created, false, "席位合计没有超过起始总额，不该判凭空产生");
  assert.equal(verdict.destroyed, false);
  assert.equal(verdict.ok, true);
});

test("守恒：全下手结算后池显示 401 也不误报——这是真实运行第 6 手的读数", () => {
  const verdict = chipConservation({
    seatStacks: [200, 200, 200, 200], pot: 401, startingTotal: 800,
  });
  assert.equal(verdict.ok, true);
});

test("守恒：席位合计超过起始总额判为凭空产生", () => {
  const verdict = chipConservation({
    seatStacks: [250, 200, 200, 200], pot: 0, startingTotal: 800,
  });
  assert.equal(verdict.created, true);
  assert.equal(verdict.ok, false);
});

test("守恒：席位加池仍不足起始总额判为凭空消失", () => {
  const verdict = chipConservation({
    seatStacks: [100, 100, 100, 100], pot: 3, startingTotal: 800,
  });
  assert.equal(verdict.destroyed, true);
  assert.equal(verdict.ok, false);
});

test("守恒：两个方向能同时被区分，不是共用一个布尔", () => {
  const created = chipConservation({ seatStacks: [900], pot: 0, startingTotal: 800 });
  const destroyed = chipConservation({ seatStacks: [10], pot: 0, startingTotal: 800 });
  assert.equal(created.created, true);
  assert.equal(created.destroyed, false);
  assert.equal(destroyed.created, false);
  assert.equal(destroyed.destroyed, true);
});

test("守恒：stack 读成 NaN 的席位按 0 计，不让整个判定变成 NaN 比较", () => {
  // NaN 参与比较一律为假，那会让两个边界同时不触发——一个读不出筹码的页面于是「通过」。
  const verdict = chipConservation({
    seatStacks: [Number.NaN, 200, 200, 200], pot: 0, startingTotal: 800,
  });
  assert.equal(verdict.total, 600);
  assert.equal(verdict.destroyed, true, "读不出的席位按 0 计，于是总额不足被抓出来");
});

test("守恒：seatStacks 不是数组时按空处理并判为凭空消失，不抛错", () => {
  const verdict = chipConservation({ seatStacks: null, pot: 0, startingTotal: 800 });
  assert.equal(verdict.total, 0);
  assert.equal(verdict.destroyed, true);
});

test("守恒：pot 读不出来时按 0 计", () => {
  const verdict = chipConservation({
    seatStacks: [200, 200, 200, 200], pot: Number.NaN, startingTotal: 800,
  });
  assert.equal(verdict.pot, 0);
  assert.equal(verdict.ok, true);
});

// ---- 畸形投影的降级判定 ----

const DELIVERED_MIX = [
  { shape: "seats 不是数组", delivered: 2, banner: "操作失败：view.seats.find is not a function" },
  { shape: "timeline 不是数组", delivered: 2, banner: null },
  { shape: "hand 整个缺失", delivered: 2, banner: null },
];

test("降级：有送达、有一种报错、其余静默，判为通过", () => {
  const verdict = degradationVerdict(DELIVERED_MIX);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.withBanner, ["seats 不是数组"]);
  assert.deepEqual(verdict.silent, ["timeline 不是数组", "hand 整个缺失"]);
});

test("降级：一种畸形没送达就不算通过，且理由点名是哪一种", () => {
  // 这是这一节最容易变成恒真的地方：路由没命中或改错了层，页面收到的是完好投影，
  // 于是「页面没停死」永远成立。送达计数是唯一能把这件事分开的东西。
  const verdict = degradationVerdict([
    { shape: "seats 不是数组", delivered: 0, banner: null },
    { shape: "整份投影是 null", delivered: 3, banner: "操作失败：..." },
  ]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons.some((r) => r.includes("seats 不是数组")), true);
  assert.equal(verdict.reasons.some((r) => r.includes("没有真的送到页面")), true);
});

test("降级：每一种都静默不算通过", () => {
  const verdict = degradationVerdict([
    { shape: "a", delivered: 2, banner: null },
    { shape: "b", delivered: 2, banner: "" },
  ]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons.some((r) => r.includes("都静默降级")), true);
});

test("降级：一种畸形都没跑不算通过", () => {
  const verdict = degradationVerdict([]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons.some((r) => r.includes("一种畸形都没跑")), true);
});

test("降级：shapeReport 不是数组时不抛错，判为不通过", () => {
  assert.equal(degradationVerdict(undefined).ok, false);
  assert.equal(degradationVerdict("nope").ok, false);
});

test("降级：banner 是空串按静默算，不按有提示算", () => {
  const verdict = degradationVerdict([
    { shape: "a", delivered: 1, banner: "" },
    { shape: "b", delivered: 1, banner: "真的报了" },
  ]);
  assert.deepEqual(verdict.silent, ["a"]);
  assert.deepEqual(verdict.withBanner, ["b"]);
});

test("降级：delivered 是 NaN 或负数都算没送达", () => {
  for (const delivered of [Number.NaN, -1, null, undefined, "2"]) {
    const verdict = degradationVerdict([{ shape: "a", delivered, banner: "x" }]);
    assert.equal(verdict.ok, false, `delivered=${String(delivered)} 应算没送达`);
  }
});

// ---- 多手覆盖 ----

const TEN_HANDS = [
  { hand: 3, actions: 0, board: 0 },
  { hand: 4, actions: 10, board: 5 },
  { hand: 5, actions: 16, board: 5 },
  { hand: 6, actions: 4, board: 0 },
  { hand: 7, actions: 2, board: 0 },
  { hand: 8, actions: 12, board: 5 },
  { hand: 9, actions: 3, board: 0 },
  { hand: 10, actions: 2, board: 0 },
];
const FULL = {
  target: 10, headsUp: true, multiway: true, allInAction: true, allInTag: true,
};

test("覆盖：真实运行的那八手记录判为覆盖齐全", () => {
  const verdict = handCoverage(TEN_HANDS, FULL);
  assert.equal(verdict.ok, true, verdict.reasons.join("；"));
  assert.equal(verdict.reached, 10);
  assert.equal(verdict.withFlop, 3);
});

test("覆盖：点了全下但画面上没出现过标记，不算覆盖", () => {
  // 第一版把标记观察挂在 onNewStreet 上，而全下常把一手打在翻牌前收掉——那一手一张
  // 公共牌都不发，钩子一次都不触发，于是「出现过全下」只剩下「点下去了」这一半。
  const verdict = handCoverage(TEN_HANDS, { ...FULL, allInTag: false });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons.some((r) => r.includes("「全下」标记")), true);
});

test("覆盖：画面上有标记但一次都没真的点下全下，也不算覆盖", () => {
  const verdict = handCoverage(TEN_HANDS, { ...FULL, allInAction: false });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons.some((r) => r.includes("点下全下")), true);
});

test("覆盖：只有单挑没有多人局不算覆盖，反之也不算", () => {
  assert.equal(handCoverage(TEN_HANDS, { ...FULL, multiway: false }).ok, false);
  assert.equal(handCoverage(TEN_HANDS, { ...FULL, headsUp: false }).ok, false);
  assert.equal(
    handCoverage(TEN_HANDS, { ...FULL, multiway: false }).reasons.some((r) => r.includes("多人局")),
    true);
  assert.equal(
    handCoverage(TEN_HANDS, { ...FULL, headsUp: false }).reasons.some((r) => r.includes("单挑")),
    true);
});

test("覆盖：没打到目标手数不算覆盖，理由带上实际到了第几手", () => {
  const verdict = handCoverage(TEN_HANDS.slice(0, 4), FULL);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reached, 6);
  assert.equal(verdict.reasons.some((r) => r.includes("只打到第 6 手")), true);
});

test("覆盖：差一手也不算达标，第 9 手不能当第 10 手用", () => {
  // 边界要单独钉。差得远的那一组（只到第 6 手）在 reached < target 和
  // reached < target - 1 两种写法下都判失败，所以它证不了比较符没被放宽。
  const nine = handCoverage(TEN_HANDS.slice(0, 7), FULL);
  assert.equal(nine.reached, 9);
  assert.equal(nine.ok, false, "到第 9 手、目标第 10 手，不算达标");
  const ten = handCoverage(TEN_HANDS, FULL);
  assert.equal(ten.reached, 10);
  assert.equal(ten.ok, true, "刚好到第 10 手算达标");
});

test("覆盖：十手全是翻牌前收掉也不算覆盖——一次都没发出翻牌", () => {
  const preflopOnly = TEN_HANDS.map((h) => ({ ...h, board: 0 }));
  const verdict = handCoverage(preflopOnly, FULL);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.withFlop, 0);
  assert.equal(verdict.reasons.some((r) => r.includes("翻牌")), true);
});

test("覆盖：一手都没记录时不算覆盖，且不抛错", () => {
  assert.equal(handCoverage([], FULL).ok, false);
  assert.equal(handCoverage(null, FULL).ok, false);
  assert.equal(handCoverage([], FULL).reasons.some((r) => r.includes("一手都没记录")), true);
});

test("覆盖：不通过时理由不为空——空理由等于不通过却说不出哪里不通过", () => {
  const broken = [
    handCoverage([], FULL),
    handCoverage(TEN_HANDS, { ...FULL, allInTag: false }),
    handCoverage(TEN_HANDS.slice(0, 2), FULL),
  ];
  for (const verdict of broken) {
    assert.equal(verdict.ok, false);
    assert.ok(verdict.reasons.length > 0, "不通过必须给出理由");
  }
});

// ---- 浏览器脚本真的用了这些判定式 ----

test("浏览器脚本引入并使用了这三个判定式，而不是自己另写一份", () => {
  // 抽出来又不用，等于测了一份没人跑的代码。这条盯住调用点。
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /chipConservation,\s*degradationVerdict,\s*handCoverage,/);
  for (const name of ["chipConservation(", "degradationVerdict(", "handCoverage("]) {
    assert.ok(source.includes(name), `浏览器脚本应调用 ${name}`);
  }
});

test("浏览器脚本对畸形投影计了送达次数，并用它做判定", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /let delivered = 0;/);
  assert.match(source, /delivered \+= 1;/);
  assert.match(source, /delivered > 0/);
});

test("浏览器脚本改写的是 body.view 而不是顶层——改错层这一节就什么都没测到", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /shape\.mutate\(body\.view\)/);
});

test("浏览器脚本用 onAction 观察全下标记，不只用 onNewStreet", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /playHand\(players, current, preferences, \{ onAction: observe \}\)/);
  assert.match(source, /allInTagSeen = true/);
});

test("playHand 在每个动作之后调用 onAction 钩子", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /hooks\.onAction === "function"/);
});

test("浏览器脚本在下一手开出之前会等，而不是立刻读手序号判失败", () => {
  // 第一版立刻读，读到没动就判失败，而那一手其实已经结算完了——全弃牌收尾还要过一次
  // 自愿亮牌窗口。真实运行的第 7 手就是这么被误判的。
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /手之后开出下一手/);
  assert.match(source, /handIndex > current/);
});

// ---- 崩掉的运行不能在证据目录里留下上一次的通过 ----

test("开跑前删掉上一次的 result.json", () => {
  // finally 会覆盖它，但进程在 finally 之前就死掉时不会——路由回调里的未处理拒绝
  // 就能做到。那时目录里留下的是上一次那份，上一次恰好通过的话，一次崩掉的运行
  // 在证据目录里长得和通过一模一样。真实的第 7 轮运行就是这么崩的。
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /const resultPath = path\.join\(artifactDir, "result\.json"\);/);
  // 数出现次数，不只判「存在」。两处都要有：模块顶层开跑前一次，未处理拒绝的处理器里
  // 一次。只判存在的话，删掉顶层那一次仍然能被处理器里那一次满足——这条断言就成了
  // 恒真，而顶层那次删除正是防止陈旧通过的那一次。
  const occurrences = source.split("fs.rmSync(resultPath, { force: true });").length - 1;
  assert.equal(occurrences, 2, "顶层与未处理拒绝处理器里各要一次");
  // 顶层那一次必须在处理器之前，也必须在 main 之前——在 finally 里删等于什么都没做。
  const rmIndex = source.indexOf("fs.rmSync(resultPath");
  const handlerIndex = source.indexOf('process.on("unhandledRejection"');
  const mainIndex = source.indexOf("async function main()");
  assert.ok(rmIndex > 0 && rmIndex < handlerIndex,
    "第一次删除要在未处理拒绝的处理器之前，也就是模块顶层开跑前");
  assert.ok(rmIndex < mainIndex, "删除要在 main 定义之前的模块顶层");
});

test("未处理的拒绝会让退出码非零，并且不留下判定文件", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /process\.on\("unhandledRejection"/);
  const handler = source.slice(source.indexOf('process.on("unhandledRejection"'));
  const body = handler.slice(0, handler.indexOf("\n});"));
  assert.match(body, /fs\.rmSync\(resultPath, \{ force: true \}\)/, "要删掉可能陈旧的判定文件");
  assert.match(body, /process\.exit\(1\)/, "退出码必须非零，否则调用方读到的是通过");
  assert.match(body, /stderr\.write/, "必须留下原因，否则只剩一个没有解释的非零退出");
});

test("投影改写的路由回调不往外抛，吞下的错误另有断言结账", () => {
  // 路由回调里抛出的错误不经过 main 的 catch，它是一条未处理的拒绝。但只吞不判
  // 等于开一个静默失败的口子，所以吞下来要落进 routeErrors 并在第 13 节判。
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /const routeErrors = \[\];/);
  // 两个改写投影的地方都要记：第 1c 节的同意门重新确认，第 8d 节的畸形投影。
  // 只判「存在」的话，拆掉其中一处仍然通过。
  const pushes = source.split("routeErrors.push(String(error?.message ?? error));").length - 1;
  assert.equal(pushes, 2, "两处路由改写各要记一次");
  const guards = source.split('includes("already handled")').length - 1;
  assert.equal(guards, 2, "两处都要放过 unroute 的正常竞态");
  assert.match(source, /路由回调没有吞下任何意外错误/);
  assert.match(source, /routeErrors\.length === 0/);
});

// ---- 有人跟的全下：破产风险落在选定的一席上 ----

test("全下摊牌一节把 carol 排除在破产风险之外", () => {
  // 第 10 节要 carol「排定本手后暂离」，而一个已经在 sit out 里的席位走不出那条断言。
  // 破产的是谁取决于发牌，所以不能碰运气：全下方从 carol 之外的席位里选。
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /\.filter\(\(s\) => s\.name !== "carol"\)/);
  assert.match(source, /全下方与跟注方/);
});

test("全下方取筹码最少的一席、跟注方取最多的一席——只有全下方可能归零", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /\.sort\(\(a, b\) => a\.stack - b\.stack\)/, "全下方按升序取最少");
  assert.match(source, /\.sort\(\(a, b\) => b\.stack - a\.stack\)\[0\]/, "跟注方按降序取最多");
  assert.match(source, /allInName !== callerName/, "两者不能是同一席");
});

test("第 8c 节的全下刻意没人跟，避免打掉下游几节的前置条件", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /\[\["all_in"\], \["fold"\], \["fold"\], \["fold"\]\]/);
});

test("全下摊牌之后验的是筹码总额等式，不是双边界", () => {
  // 这里读的是手间的账本值、池已经分完，所以等式成立。8c 循环里读的是手内值，
  // 只能用双边界。两处用同一种判据必然有一处误报。
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /totalAfterShowdown === totalBeforeShowdown/);
});

test("有人归零时验一条 F1：归零的席位不带着 0 筹码进下一手", () => {
  const source = fs.readFileSync(MJS, "utf8");
  assert.match(source, /筹码归零的席位没有带着 0 筹码进下一手/);
  assert.match(source, /bustedNames\.includes\(s\.name\) && s\.hole\.length > 0/);
});
