"use strict";

// 起因是一份读起来通过、实际中止的证据文件。artifacts/negctl6/result.json 里写着
// passed: true、24 步全过、控制台错误 0；而那次运行是在第 25 步超时抛错死掉的。
// 判定式当时是 failures.length === 0，异常终止一条 failure 都不会留下，所以
// 「中止」和「通过」在文件里长得一模一样。
//
// 这跟本轮反复撞到的是同一个缺陷类：恒为真的条件读不出任何真东西。负控证据的
// 全部价值在于它失败，一份自称通过的负控比没有证据更糟。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildResult,
  summarize,
  redactDetail,
  CREDENTIAL_KEYS,
} = require("../test-support/acceptance-result.cjs");

const ROOT = path.join(__dirname, "..");

function base(overrides = {}) {
  return {
    banner: { origin: "http://127.0.0.1:1", model_adapter: { simulated: true } },
    contexts: 4,
    finalHandIndex: 3,
    artifacts: [],
    steps: [{ name: "一", ok: true, detail: "" }, { name: "二", ok: true, detail: "" }],
    failures: [],
    consoleReport: [],
    totalConsole: 0,
    aborted: null,
    ...overrides,
  };
}

test("全过且没有中止时判定为通过", () => {
  const result = buildResult(base());
  assert.equal(result.passed, true);
  assert.equal(result.aborted, null);
});

test("有断言失败时判定为不通过", () => {
  const result = buildResult(base({ failures: ["二：炸了"] }));
  assert.equal(result.passed, false);
});

test("异常终止时判定为不通过，即使跑过的每一步都过了", () => {
  // 这条是这个文件存在的理由。旧判定式在这里给出 true。
  const result = buildResult(base({
    aborted: new Error("等待超时（30000ms）：public_limits_changed 让同意门重新出现"),
  }));
  assert.equal(result.passed, false, "中止过的运行不得判为通过");
});

test("中止原因原样落盘，包含堆栈", () => {
  const error = new Error("等待超时（30000ms）：某个标签");
  const result = buildResult(base({ aborted: error }));
  assert.equal(typeof result.aborted, "object");
  assert.equal(result.aborted.message, "等待超时（30000ms）：某个标签");
  assert.match(result.aborted.stack, /acceptance-result\.test\.cjs/);
});

test("中止时步数如实反映跑到哪一步，不补齐", () => {
  const result = buildResult(base({ aborted: new Error("中止") }));
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps_ran, 2);
  assert.equal(result.failures.length, 0, "中止不该被伪装成某一条断言失败");
});

test("中止连同断言失败一起出现时两者都保留", () => {
  const result = buildResult(base({
    failures: ["二：炸了"],
    aborted: new Error("随后又中止"),
  }));
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.aborted.message, "随后又中止");
});

test("控制台错误数原样带出", () => {
  const result = buildResult(base({ totalConsole: 2 }));
  assert.equal(result.console_errors, 2);
  // 控制台错误不由这个函数判定通过与否——第 12 节的 check 负责，这里只搬运。
  // 写死成 passed=false 会让「故意失败」那一节没法自证。
  assert.equal(result.passed, true);
});

test("note 里点明模拟适配器，不冒充真实宿主证据", () => {
  const result = buildResult(base());
  assert.match(result.note, /simulated/);
  assert.match(result.note, /不构成真实宿主主动唤醒已验证的证据/);
});

test("summarize 在中止时把中止写进那一行", () => {
  const line = summarize(base({ aborted: new Error("超时于某处") }));
  assert.match(line, /中止/);
  assert.match(line, /超时于某处/);
});

test("summarize 正常收尾时不提中止", () => {
  const line = summarize(base());
  assert.doesNotMatch(line, /中止/);
  assert.match(line, /步骤 2/);
  assert.match(line, /通过 2/);
});

// ---- 产物里的凭据脱敏 ----
// 起因是核对引用路径时在 artifacts/negctl5/result.json 里读到一条真邀请码原文。
// artifacts/ 整个被 .gitignore 忽略，所以它没进库；但复核的人分不出那串字符是死是活，
// 而「忽略」和「不存在」只差一次 force-add。

test("邀请码原文被换成长度", () => {
  const out = redactDetail("invite_code=Kep2jgEIwMzDVUI9SOqNFS_OgTyAROcic6lUKA1FRGg");
  assert.doesNotMatch(out, /Kep2jgEI/);
  assert.match(out, /invite_code=\[已脱敏 43 字\]/);
});

test("JSON 形式的凭据也被换掉", () => {
  const out = redactDetail('{"session_token":"abc123def456ghi","sameSeat":true}');
  assert.doesNotMatch(out, /abc123def456ghi/);
  assert.match(out, /"session_token":\[已脱敏 15 字\]/);
  assert.match(out, /"sameSeat":true/, "非凭据字段不受影响");
});

test("留下长度而不是固定串", () => {
  // 「拿到了一个 43 字长的邀请码」本身就是断言要说的话，值不是。全换成 [已脱敏]
  // 会让长度类断言的产物读不出所以然。
  const short = redactDetail("invite_code=abcdef");
  const long = redactDetail("invite_code=abcdefghijklmnopqrst");
  assert.notEqual(short, long);
  assert.match(short, /6 字/);
  assert.match(long, /20 字/);
});

test("布尔与键名不算凭据，原样保留", () => {
  // 这两条是脱敏最容易做过头的地方：把它们也盖掉，「同一入口键回到同一会话」
  // 和「sessionStorage 里只有这一个键」这两条断言的产物就什么都不剩了。
  assert.equal(redactDetail('{"sameToken":true,"sameSeat":true}'),
    '{"sameToken":true,"sameSeat":true}');
  assert.equal(redactDetail('sessionStorage=["tokengame.table.session_token"]'),
    'sessionStorage=["tokengame.table.session_token"]');
});

test("多个凭据在一条 detail 里全部脱敏", () => {
  const out = redactDetail("invite_code=AAAAAAAAAA session_token=BBBBBBBBBB");
  assert.doesNotMatch(out, /AAAAAAAAAA/);
  assert.doesNotMatch(out, /BBBBBBBBBB/);
});

test("凭据键下的短值是诊断信息，不脱敏", () => {
  // 下界 {6,} 挡的就是这个。一条断言失败时印出的往往正是 `session_token=null`
  // ——「这里本该有个凭据而它没有」是失败的根因，盖掉它等于把根因盖掉。
  // 真凭据都远长于 6：邀请码 43 字，会话令牌同量级。
  assert.equal(redactDetail("session_token=null"), "session_token=null");
  assert.equal(redactDetail("invite_code=none"), "invite_code=none");
  assert.equal(redactDetail("invite_code=—"), "invite_code=—");
});

test("空串与非字符串原样返回", () => {
  assert.equal(redactDetail(""), "");
  assert.equal(redactDetail(undefined), undefined);
  assert.equal(redactDetail(42), 42);
});

test("脱敏覆盖已知的每一个凭据字段名", () => {
  for (const key of CREDENTIAL_KEYS) {
    const out = redactDetail(`${key}=SECRETVALUE123`);
    assert.doesNotMatch(out, /SECRETVALUE123/, `${key} 没被脱敏`);
  }
});

test("验收脚本在记录路径上脱敏，而不是在某一个调用点", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "test-support", "table-web-acceptance.mjs"), "utf8");
  // ok 与 bad 都要过一遍。只改那一处 invite_code=${...} 的话，下一条写出凭据的
  // 断言照样会漏。
  assert.match(source, /function ok\(name, rawDetail = ""\) \{\s*\n\s*const detail = redactDetail\(rawDetail\);/);
  assert.match(source, /function bad\(name, rawDetail\) \{\s*\n\s*const detail = redactDetail\(rawDetail\);/);
});

test("验收脚本把判定委托给这个模块，而不是自己再写一遍", () => {
  // 静态检查。这个不变量的价值在于它不能只在浏览器里成立：判定式一旦回到 .mjs
  // 里，单元层就再也看不见它了，而这正是当初漏掉的原因。
  const source = fs.readFileSync(
    path.join(ROOT, "test-support", "table-web-acceptance.mjs"), "utf8");
  assert.match(source, /acceptance-result\.cjs/, "应当引入共享判定模块");
  assert.match(source, /buildResult\(/, "应当调用 buildResult");
  const inlined = /passed:\s*failures\.length === 0/.test(source);
  assert.equal(inlined, false, "不得在 .mjs 里内联旧判定式");
});

test("验收脚本捕获中止并把它交给判定模块", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "test-support", "table-web-acceptance.mjs"), "utf8");
  // catch 里必须重新抛出：吞掉异常会让退出码变成 0，那是另一种假绿。
  assert.match(source, /catch \(error\) \{[\s\S]{0,200}aborted = error/);
  assert.match(source, /aborted = error;[\s\S]{0,120}throw error;/);
});
