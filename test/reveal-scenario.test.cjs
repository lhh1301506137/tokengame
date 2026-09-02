"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { revealTurn, revealPrecondition, revealFoldVerdict } = require("../test-support/reveal-scenario.cjs");

function freshTables() {
  return [0, 1, 2, 3].map((viewer) => ({
    handId: "new-hand", handIndex: 4, handStatus: "active", handRevision: 1,
    actionDeadlineAt: 31_000, board: [],
    seats: [0, 1, 2, 3].map((index) => ({
      seatId: `seat-${index}`, isViewer: index === viewer, isActor: index === 0,
      folded: false, hole: ["?", "?"], tags: [],
    })),
    myActions: viewer === 0 ? [{ action: "fold" }] : [],
  }));
}
const precondition = (tables) => revealPrecondition(tables, { afterHandIndex: 3, now: 1000 });

test("四页均在新手且未消费行动时才开始亮牌验收", () => {
  assert.equal(precondition(freshTables()).ok, true);
  assert.deepEqual(revealTurn(freshTables(), 4), { kind: "actor", index: 0 });
});

for (const [name, change] of [
  ["一页仍在旧手", (tables) => { tables[1].handIndex = 3; }],
  ["一页已提前到下一手", (tables) => { tables[1].handIndex = 5; }],
  ["不同手身份", (tables) => { tables[1].handId = "other-hand"; }],
  ["有过自动行动", (tables) => tables.forEach((table) => { table.handRevision = 2; })],
  ["已有弃牌", (tables) => { tables[2].seats[0].folded = true; }],
  ["有人未入手", (tables) => { tables[2].seats[0].hole = []; }],
  ["有人全下", (tables) => { tables[1].seats[0].tags = ["全下"]; }],
  ["空页面", (tables) => tables.splice(0)],
  ["重复查看者", (tables) => { tables[1] = structuredClone(tables[0]); }],
  ["只剩一秒", (tables) => { tables[0].actionDeadlineAt = 2000; }],
  ["读不到截止时间", (tables) => { tables[0].actionDeadlineAt = null; }],
]) {
  test(`前置拒绝：${name}，不靠继续等下一手假装通过`, () => {
    const tables = freshTables();
    change(tables);
    assert.equal(precondition(tables).ok, false);
  });
}

test("四页即使身份一致、未行动且行动窗充足，也不能把调用方指定的旧手当成新手", () => {
  const tables = freshTables();
  tables.forEach((table) => { table.handIndex = 3; });
  // 证明这组页面本身同步且已有唯一行动者；拒绝原因只能来自它没有越过调用方的第 3 手。
  assert.deepEqual(revealTurn(tables, 3), { kind: "actor", index: 0 });
  const verdict = revealPrecondition(tables, { afterHandIndex: 3, now: 1000 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes("同一新手")));
});

test("一页见到本手结算就停止找行动者，不等 25 秒或下一手", () => {
  const tables = freshTables();
  tables[2].handStatus = "complete";
  assert.deepEqual(revealTurn(tables, 4), { kind: "settled" });
});

test("手序已变是窗口已过，而不是另一个可弃牌的行动者", () => {
  const tables = freshTables();
  tables[1].handIndex = 5;
  assert.deepEqual(revealTurn(tables, 4), { kind: "advanced" });
});

test("新旧投影不同步或没有唯一行动者时仅等待，不选择猜测的玩家", () => {
  const tables = freshTables();
  tables[1].myActions = [{ action: "fold" }];
  assert.deepEqual(revealTurn(tables, 4), { kind: "waiting" });
  tables[1].handIndex = 3;
  assert.deepEqual(revealTurn(tables, 4), { kind: "waiting" });
  assert.deepEqual(revealTurn([], 4), { kind: "waiting" });
});

function acceptedFold() {
  const before = freshTables()[0];
  const after = structuredClone(before);
  after.handRevision = 2;
  after.seats[0].folded = true;
  return {
    before, after, status: 200, body: { ok: true, result: { replay: false } },
    request: { command: "hand.act", params: { action: "fold", hand_id: "new-hand", expected_revision: 1 } },
  };
}

test("新弃牌同时要求请求正确、权威接受和 DOM 一次连续落地", () => {
  assert.equal(revealFoldVerdict(acceptedFold()).ok, true);
});

for (const [name, change] of [
  ["仅按钮点击", (fold) => { fold.body = {}; }],
  ["HTTP 拒绝", (fold) => { fold.status = 409; }],
  ["重复请求", (fold) => { fold.body.result.replay = true; }],
  ["非弃牌", (fold) => { fold.request.params.action = "check"; }],
  ["旧版本", (fold) => { fold.request.params.expected_revision = 0; }],
  ["串手", (fold) => { fold.after.handId = "next-hand"; }],
  ["夹进自动行动", (fold) => { fold.after.handRevision = 3; }],
  ["DOM 未落地", (fold) => { fold.after.seats[0].folded = false; }],
  ["已经弃过", (fold) => { fold.before.seats[0].folded = true; }],
  ["额外一人已弃", (fold) => { fold.after.seats[1].folded = true; }],
]) {
  test(`不能累计为一次真实手工弃牌：${name}`, () => {
    const fold = acceptedFold();
    change(fold);
    assert.equal(revealFoldVerdict(fold).ok, false);
  });
}

test("长浏览器委托可执行前置并仍要求三次弃牌，不沿用 findActor 长等待", () => {
  const source = fs.readFileSync(path.join(__dirname, "../test-support/table-web-acceptance.mjs"), "utf8");
  const phase = source.slice(source.indexOf('// ---- 8b.'), source.indexOf('// ---- 8c.'));
  assert.match(source, /require\("\.\/reveal-scenario\.cjs"\)/);
  assert.match(phase, /revealPrecondition\(/);
  assert.match(phase, /folded === 3/);
  assert.doesNotMatch(phase, /findActor\(/);
  assert.match(source, /revealFoldVerdict\(/);
});
