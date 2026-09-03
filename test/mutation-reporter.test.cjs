"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = '"use strict";\nmodule.exports = function value() { return 1; };\n';

function fixture(t, { body = "assert.equal(value(), 1);", extraTests = "", emptySuite = false,
  testTimeoutMs = null } = {}) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "tokengame-mutation-reporter-"));
  t.after(() => {
    assert.equal(path.dirname(root), parent);
    assert.match(path.basename(root), /^tokengame-mutation-reporter-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, "test-support"));
  fs.mkdirSync(path.join(root, "test"));
  fs.mkdirSync(path.join(root, "empty-path"));
  for (const file of ["mutate-suite.cjs", "mutate-check.cjs"]) {
    fs.copyFileSync(path.join(ROOT, "test-support", file), path.join(root, "test-support", file));
  }
  const target = path.join(root, "subject.cjs");
  fs.writeFileSync(target, SOURCE);
  fs.writeFileSync(path.join(root, "test", "subject.test.cjs"), [
    '"use strict";',
    'const assert = require("node:assert/strict");',
    'const test = require("node:test");',
    'const value = require("../subject.cjs");',
    emptySuite ? 'test.describe("fixture empty", () => {});'
      : `test("fixture behavior"${testTimeoutMs === null ? "" : `, { timeout: ${testTimeoutMs} }`}, async () => { ${body} });`,
    extraTests,
  ].join("\n"));

  // 只观测临时仓库：记录真实子进程的 runtime 和目标写入，证明红基线没有先改后还原。
  const eventsFile = path.join(root, "events.jsonl");
  const preload = path.join(root, "observe.cjs");
  fs.writeFileSync(eventsFile, "");
  fs.writeFileSync(preload, [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    `const target = ${JSON.stringify(target)};`,
    `const events = ${JSON.stringify(eventsFile)};`,
    'const record = (entry) => fs.appendFileSync(events, JSON.stringify(entry) + "\\n");',
    'record({ type: "process", executable: process.execPath, args: process.argv.slice(1) });',
    'const write = fs.writeFileSync;',
    'fs.writeFileSync = function (file, data, ...options) {',
    '  if (typeof file === "string" && path.resolve(file) === target) record({ type: "write", data: String(data) });',
    '  return write.call(this, file, data, ...options);',
    '};',
  ].join("\n"));
  return { root, target, eventsFile, preload };
}

function run(f, { driver = "suite", find = "return 1;", replace = "return 2;",
  testFile = "test/subject.test.cjs", emptyPath = false, checkOptions = [] } = {}) {
  fs.writeFileSync(path.join(f.root, "mutations.json"), JSON.stringify({
    test: testFile, mutations: [{ id: "fixture", file: "subject.cjs", find, replace }],
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !["PATH", "NODE_OPTIONS", "NODE_TEST_CONTEXT", "FORCE_COLOR"].includes(key.toUpperCase())));
  env.PATH = emptyPath ? path.join(f.root, "empty-path") : path.dirname(process.execPath);
  env.NODE_OPTIONS = `--require=${JSON.stringify(f.preload.replaceAll("\\", "/"))}`;
  env.NO_COLOR = "1";
  const args = driver === "suite" ? ["mutations.json"] : ["subject.cjs", find, replace, testFile, ...checkOptions];
  const child = spawnSync(process.execPath, [path.join("test-support", `mutate-${driver}.cjs`), ...args], {
    cwd: f.root, env, encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(child.error, undefined, `${child.stdout}\n${child.stderr}`);
  assert.equal(child.signal, null);
  assert.equal(fs.readFileSync(f.target, "utf8"), SOURCE, "临时目标必须逐字还原");
  const events = fs.readFileSync(f.eventsFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { ...child, events };
}

function assertWrites(result, replace) {
  assert.deepEqual(result.events.filter((entry) => entry.type === "write").map((entry) => entry.data),
    [SOURCE.replace("return 1;", replace), SOURCE]);
}

test("变异集在管道输出中识别真实断言杀死，并逐字还原临时源码", (t) => {
  const result = run(fixture(t));
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^基线绿 test\/subject\.test\.cjs$/m);
  assert.match(result.stdout, /^\s*KILLED .*fixture behavior/m);
  assert.match(result.stdout, /合计 1：杀掉 1，存活 0，未评估 0/);
  const checkerIndex = result.events.findIndex((entry) => entry.type === "process"
    && entry.args.some((arg) => arg.endsWith("mutate-check.cjs")));
  assert.notEqual(checkerIndex, -1);
  assert.ok(result.events[checkerIndex].args.includes("--baseline-tests=1"));
  const firstWrite = result.events.findIndex((entry) => entry.type === "write");
  assert.equal(result.events.slice(checkerIndex + 1, firstWrite).filter((entry) => entry.type === "process").length,
    0, "检查器必须复用变异集已绿基线，不能逐条再跑基线");
  assertWrites(result, "return 2;");
});

test("单条检查器也固定报告器，断言失败不得错记测试未运行", (t) => {
  const result = run(fixture(t), { driver: "check" });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^KILLED .*fixture behavior/);
  assert.match(result.stdout, /^RESTORED true$/m);
  const firstWrite = result.events.findIndex((entry) => entry.type === "write");
  assert.ok(result.events.slice(0, firstWrite).some((entry) => entry.type === "process"
    && entry.args.length === 1 && entry.args[0].endsWith("subject.test.cjs")), "单独调用须在写入前实际运行基线");
  assertWrites(result, "return 2;");
});

test("等价行为变异必须存活，不能因报告格式或进程错误伪造杀死", (t) => {
  const result = run(fixture(t), { replace: "return 1 + 0;" });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*SURVIVED /m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 1，未评估 0/);
  assertWrites(result, "return 1 + 0;");
});

test("非法语法变异是未评估，并在语法检查失败后还原", (t) => {
  const result = run(fixture(t), { replace: "return (;" });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*INVALID 变异产生语法错/m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 0，未评估 1/);
  assertWrites(result, "return (;");
});

test("红基线在任何源码写入和单条检查器启动前中止", (t) => {
  const result = run(fixture(t, { body: "assert.equal(value(), 999);" }));
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /^FATAL 基线不是绿的/m);
  assert.equal(result.events.filter((entry) => entry.type === "write").length, 0);
  assert.equal(result.events.some((entry) => entry.type === "process"
    && entry.args.some((arg) => arg.endsWith("mutate-check.cjs"))), false);
});

test("零测试基线和非法缓存计数都在目标写入前中止", (t) => {
  for (const driver of ["suite", "check"]) {
    const result = run(fixture(t, { emptySuite: true }), { driver });
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stdout, /^(?:FATAL|ABORT) 基线未真正运行:/);
    assert.equal(result.events.filter((entry) => entry.type === "write").length, 0);
    assert.doesNotMatch(result.stdout, /^KILLED|^RESTORED/m);
  }
  const result = run(fixture(t), { driver: "check", checkOptions: ["--baseline-tests=0"] });
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /^ABORT 基线测试数参数缺失或无效:/);
  assert.equal(result.events.filter((entry) => entry.type === "write").length, 0);
  assert.doesNotMatch(result.stdout, /^KILLED|^RESTORED/m);
});

test("合法语法但整个测试文件加载失败不能算杀死", (t) => {
  const result = run(fixture(t), {
    find: "module.exports =", replace: 'throw new Error("fixture load failure"); module.exports =',
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*INVALID 测试文件整体加载失败/m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 0，未评估 1/);
});

test("仅有未完成 Promise 的取消不是断言杀死", (t) => {
  const result = run(fixture(t, {
    body: "if (value() === 2) await new Promise(() => {}); assert.equal(value(), 1);",
    testTimeoutMs: 100,
  }));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*INVALID 测试存在取消项，未完整评估变异:/m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 0，未评估 1/);
  assertWrites(result, "return 2;");
});

test("断言失败同时发生取消时不能把未完成测试轮冒充杀死", (t) => {
  const result = run(fixture(t, {
    extraTests: 'test("fixture pending", { timeout: 100 }, async () => { if (value() === 2) await new Promise(() => {}); });',
  }));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*INVALID 测试存在取消项，未完整评估变异:/m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 0，未评估 1/);
  assertWrites(result, "return 2;");
});

test("测试进程异常退出不是断言杀死", (t) => {
  const result = run(fixture(t, { body: "if (value() === 2) process.exit(17); assert.equal(value(), 1);" }));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*INVALID /m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 0，未评估 1/);
});

test("命名断言失败不能掩盖同轮测试文件进程的异常退出", (t) => {
  const result = run(fixture(t, {
    extraTests: 'test("fixture fatal exit", async () => { if (value() === 2) { await new Promise(resolve => setImmediate(resolve)); process.exit(17); } });',
  }));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^\s*INVALID 测试数量与绿基线不一致: 基线 2，实际 1/m);
  assert.match(result.stdout, /合计 1：杀掉 0，存活 0，未评估 1/);
  assertWrites(result, "return 2;");
});

test("缺少测试文件在写入前 ABORT，不是 KILLED 或已还原", (t) => {
  const result = run(fixture(t), { driver: "check", testFile: "test/missing.test.cjs" });
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /^ABORT 测试文件不存在:/);
  assert.doesNotMatch(result.stdout, /^KILLED|^RESTORED/m);
  assert.equal(result.events.filter((entry) => entry.type === "write").length, 0);
});

test("基线、检查器及测试子进程沿用本次 Node，不依赖 PATH 另找 runtime", (t) => {
  const result = run(fixture(t), { emptyPath: true });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /合计 1：杀掉 1，存活 0，未评估 0/);
  const processes = result.events.filter((entry) => entry.type === "process");
  assert.ok(processes.length >= 3, "必须实际观察多级子进程，不能对空列表断言 runtime 一致");
  assert.ok(processes.some((entry) => entry.args.some((arg) => arg.endsWith("mutate-check.cjs"))));
  for (const entry of processes) assert.equal(entry.executable, process.execPath);
  assertWrites(result, "return 2;");
});
