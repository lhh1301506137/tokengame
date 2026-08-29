"use strict";

// 一致性报告的结构不变量。
//
// 为什么单独一个文件、为什么对着记账器而不是对着适配器跑：漏记一条、同一条记两遍、
// 记一个不属于本角色的 id——这三种都是**套件自己**的缺陷形状，没有任何适配器实现
// 能触发它们。所以「套件抓得住 BROKEN 变体」那一批测不到这里，而这三种恰恰是
// 「跳过被读成通过」的原始载体：旧报告里 checks 数组短几条，没人数。

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createLedger, requiredCheckIds,
} = require("../test-support/adapter-conformance.cjs");

const ROLE = "seat_model";

// 把这个角色的全部必需检查都记成 pass，除了点名要留手的那些。
function fillAll(ledger, { skip = [] } = {}) {
  for (const id of requiredCheckIds(ROLE)) {
    if (skip.includes(id)) continue;
    ledger.record(id, true, "填充");
  }
}

test("全部记过一次：结构完整，判合规", () => {
  const ledger = createLedger(ROLE);
  fillAll(ledger);
  const report = ledger.finish();
  assert.deepEqual(report.report_integrity.missing, []);
  assert.deepEqual(report.report_integrity.duplicated, []);
  assert.deepEqual(report.report_integrity.unknown, []);
  assert.equal(report.report_integrity.ok, true);
  assert.equal(report.report_integrity.expected, requiredCheckIds(ROLE).length);
  assert.equal(report.report_integrity.recorded, requiredCheckIds(ROLE).length);
  assert.equal(report.conformance_passed, true);
});

test("漏记一条：结构不完整，且不判合规", () => {
  // 这一条是核心。漏记的那条在 checks 里仍然在，status 是 not_run——
  // 「恰好出现一次」说的是出现，不是状态。但一次都没记过属于漏记，必须是硬失败。
  const ledger = createLedger(ROLE);
  fillAll(ledger, { skip: ["release_zeroes_counts"] });
  const report = ledger.finish();
  assert.deepEqual(report.report_integrity.missing, ["release_zeroes_counts"]);
  assert.equal(report.report_integrity.ok, false);
  assert.equal(report.conformance_passed, false,
    "漏记了检查却判合规——这正是「跳过读成通过」");
  // 结构问题必须也进 failures：只看 failures 的调用方不该把它读成通过。
  assert.ok(report.failures.some((line) => line.includes("release_zeroes_counts")),
    `failures 里没有点名漏记的那条：${report.failures.join(" | ")}`);
  assert.ok(report.failures.some((line) => line.includes("report_integrity")));
  // 那一条在 checks 里仍然占一个位置。
  const entry = report.checks.find((c) => c.check_id === "release_zeroes_counts");
  assert.equal(entry.status, "not_run");
});

test("同一条记两遍：算结构问题，不是后者覆盖前者", () => {
  const ledger = createLedger(ROLE);
  fillAll(ledger);
  ledger.record("state_released", true, "又记一遍");
  const report = ledger.finish();
  assert.deepEqual(report.report_integrity.duplicated, ["state_released"]);
  assert.equal(report.report_integrity.ok, false);
  assert.equal(report.conformance_passed, false);
  assert.ok(report.failures.some((line) => line.includes("state_released")),
    `failures 里没有点名重记的那条：${report.failures.join(" | ")}`);
  // checks 里仍然只有一条：报告不该因为记两遍而多出一行。
  const hits = report.checks.filter((c) => c.check_id === "state_released");
  assert.equal(hits.length, 1);
});

test("未登记的 check_id 立刻抛，不悄悄接受", () => {
  // 悄悄接受的话，拼错的 id 会让本该被登记的那条永远停在 not_run，
  // 而报告里多出一条谁也不认识的记录——两头都被削弱。
  const ledger = createLedger(ROLE);
  assert.throws(() => ledger.record("release_zeros_counts", true), { code: "unknown_check_id" });
  assert.throws(() => ledger.notRun("完全不存在的项", "理由"), { code: "unknown_check_id" });
  assert.throws(() => ledger.unverifiable("also_missing", "理由"), { code: "unknown_check_id" });
});

test("记一个不属于本角色的检查：算越界记账", () => {
  // human_claims_handle 是真人面的必需项，在模型面的报告里出现就是错的——
  // 它会让读报告的人以为模型侧也声明持有句柄这件事被验过了。
  const ledger = createLedger(ROLE);
  fillAll(ledger);
  ledger.record("human_claims_handle", true, "越界");
  const report = ledger.finish();
  assert.equal(report.report_integrity.unknown.length, 1);
  assert.match(report.report_integrity.unknown[0].reason, /不属于角色 seat_model/);
  assert.equal(report.report_integrity.ok, false);
  assert.equal(report.conformance_passed, false);
  // 越界的那条不该混进 checks。
  assert.equal(report.checks.some((c) => c.check_id === "human_claims_handle"), false);
});

test("失败行里带 check_id，不只有名字", () => {
  // 名字里带插值，跨报告对不上；变体测试要按 id 断言「红的是该红的那一条」。
  const ledger = createLedger(ROLE);
  fillAll(ledger, { skip: ["state_released"] });
  ledger.record("state_released", false, "state=negotiated");
  const report = ledger.finish();
  assert.equal(report.failures.length, 1);
  assert.ok(report.failures[0].startsWith("state_released"),
    `失败行没有以 check_id 开头：${report.failures[0]}`);
});

test("四态齐全，且 fully_verified 对 unverifiable 与 not_run 都敏感", () => {
  const ledger = createLedger(ROLE);
  fillAll(ledger, { skip: ["proactive_wake_actually_works", "failure_envelope_has_code"] });
  ledger.unverifiable("proactive_wake_actually_works", "只有实机答得出");
  ledger.notRun("failure_envelope_has_code", "这一跑没有失败信封");
  const report = ledger.finish();
  assert.equal(report.conformance_passed, true, "没有 fail，合规应当成立");
  assert.equal(report.fully_verified, false,
    "有 unverifiable 也有 not_run，不得判为完整验证");
  assert.deepEqual(report.unverifiable.map((e) => e.check_id), ["proactive_wake_actually_works"]);
  assert.deepEqual(report.not_run.map((e) => e.check_id), ["failure_envelope_has_code"]);
  const statuses = new Set(report.checks.map((c) => c.status));
  assert.equal(statuses.has("pass"), true);
  assert.equal(statuses.has("unverifiable"), true);
  assert.equal(statuses.has("not_run"), true);
});

test("全部 pass 且无未验证项时，fully_verified 才为真", () => {
  // 反方向。少了这一条，一个恒返回 false 的 fully_verified 也能过上面那条。
  const ledger = createLedger(ROLE);
  fillAll(ledger);
  const report = ledger.finish();
  assert.equal(report.fully_verified, true);
});
