"use strict";
// 变异检查：临时改一处源码，跑指定测试，要求它失败，然后无条件还原。
// 用法：node test-support/mutate-check.cjs <文件> <查找串> <替换串> <测试文件>
// 内部可选参数 --baseline-tests=N 仅供 mutate-suite 传入本轮已绿基线计数，避免逐条重跑。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// 单独一个类，好让下面的 catch 把「语法错」和「测试真的失败了」分开。
class SyntaxCheckFailed extends Error {}

const [rel, needle, replacement, testFile, baselineOption, ...extraOptions] = process.argv.slice(2);

// 参数校验必须在这里，不能只靠调用方。曾经真的发生过：mutate-suite 读错了规格键名，把四个
// 参数全传成 undefined，execFileSync 把它们强制成字符串 "undefined"——而源码里确实含
// "undefined" 这个词，于是「查找串存在」成立、替换成自身等于空变异，测试文件名也成了
// "undefined"，node --test 找不到文件必然非零退出，下面就报 KILLED。
// 四个变异集因此集体假绿，而且 RESTORED true 让它看起来更可信。
//
// 所以这里逐个查：缺参数、空串、测试文件不存在，都当 ABORT，绝不进入判定。
for (const [name, value] of [["文件", rel], ["查找串", needle], ["测试文件", testFile]]) {
  if (typeof value !== "string" || value === "" || value === "undefined") {
    process.stdout.write(`ABORT 参数「${name}」缺失或无效: ${String(value)}\n`);
    process.exit(2);
  }
}
// 替换串单独判：空串是合法的（整行删除就是最常用的变异形态），所以只要求它是个字符串。
// 上面三项已经足以挡住那次真实事故——那个 bug 会让四个参数同时变成 "undefined"。
if (typeof replacement !== "string") {
  process.stdout.write(`ABORT 参数「替换串」缺失: ${String(replacement)}\n`);
  process.exit(2);
}
let baselineTests = null;
if (baselineOption !== undefined) {
  const match = /^--baseline-tests=([1-9]\d*)$/.exec(baselineOption);
  baselineTests = Number(match?.[1]);
  if (extraOptions.length !== 0 || !Number.isSafeInteger(baselineTests)) {
    process.stdout.write(`ABORT 基线测试数参数缺失或无效: ${baselineOption}\n`);
    process.exit(2);
  }
}
if (!fs.existsSync(path.join(__dirname, "..", testFile))) {
  process.stdout.write(`ABORT 测试文件不存在: ${testFile}\n`);
  process.exit(2);
}

const target = path.join(__dirname, "..", rel);
const original = fs.readFileSync(target, "utf8");

if (!original.includes(needle)) {
  process.stdout.write(`ABORT 查找串不存在，变异没生效: ${needle}\n`);
  process.exit(2);
}
if (needle === replacement) {
  process.stdout.write("ABORT 查找串与替换串相同，这是空变异\n");
  process.exit(2);
}

function reportedTests(out) {
  const count = Number(/^\s*ℹ tests (\d+)\s*$/m.exec(out)?.[1]);
  return Number.isSafeInteger(count) ? count : null;
}

// 单独调用时也必须先证明未变异基线为绿；缺失、零测试或运行失败都不能进入写入阶段。
if (baselineTests === null) {
  try {
    const out = execFileSync(process.execPath, ["--test", "--test-reporter=spec", "--test-concurrency=1", testFile], {
      stdio: "pipe", encoding: "utf8",
    });
    baselineTests = reportedTests(out);
    if (baselineTests === null || baselineTests < 1) {
      process.stdout.write(`ABORT 基线未真正运行: ${testFile}\n`);
      process.exit(2);
    }
  } catch (error) {
    const tail = `${error.stdout ?? ""}\n${error.stderr ?? ""}`
      .split("\n").filter((line) => line.trim() !== "").slice(-4).join(" | ");
    process.stdout.write(`ABORT 基线不是绿的，此时任何 KILLED 都不可信: ${testFile} — ${tail}\n`);
    process.exit(2);
  }
}

// Node 有时会把文件加载失败或进程异常退出记成文件级失败；同轮已有命名断言失败也不能忽略它。
// spec 也可能省略异常退出，所以还需与已绿基线计数对照，捕获本次已复现的截断报告。
function hasFileLevelFailures(out) {
  const marks = out.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("✖"));
  return marks.some((line) => {
    const body = line.replace(/^✖\s*/, "");
    if (body.startsWith("failing tests:")) return false;
    // `✖ test\foo.test.cjs (12ms)` 是文件级；`✖ 某个测试名 (12ms)` 是真断言失败。
    return /^\S*[\\/]?[\w.-]+\.test\.cjs\s*\(/.test(body);
  });
}

let verdict = "UNKNOWN";
try {
  fs.writeFileSync(target, original.replace(needle, replacement));
  // 变异必须仍然是合法 JavaScript。删掉 `if (...) {` 这类行会破坏花括号配对，产出的是
  // 「整文件语法错」，那会让每个测试都失败——看起来像杀掉，实际什么行为都没测到。
  //
  // 只对 JS 做这一步。node --check 认扩展名，喂给它 .html / .css 会直接
  // ERR_UNKNOWN_FILE_EXTENSION，而那被上面记成 INVALID——于是一条针对 HTML 结构或 CSS
  // 规则的变异永远不会被评估，报出来是「未评估」而不是「防线有洞」。产品确实依赖这两类
  // 文件里的不变量（同意门挂在哪个 main 下面、[hidden] 的 display:none 有没有
  // !important），所以要的是让检查按类型分流，不是把那些变异删掉。
  const JS_EXTENSIONS = [".js", ".cjs", ".mjs"];
  let syntaxError = null;
  if (JS_EXTENSIONS.includes(path.extname(target).toLowerCase())) {
    try {
      execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
    } catch (failure) {
      const detail = `${failure.stderr ?? ""}`.split("\n").find((line) => line.includes("Error")) ?? "";
      syntaxError = new SyntaxCheckFailed(detail.trim());
    }
  }
  if (syntaxError !== null) {
    verdict = `INVALID 变异产生语法错，不是行为改动: ${syntaxError.message}`;
  } else try {
    const out = execFileSync(process.execPath, ["--test", "--test-reporter=spec", testFile], { stdio: "pipe", encoding: "utf8" });
    const tests = reportedTests(out);
    verdict = tests === baselineTests ? "SURVIVED 变异没被任何测试杀掉"
      : `INVALID 测试数量与绿基线不一致: 基线 ${baselineTests}，实际 ${tests ?? "缺失或无效"}`;
  } catch (error) {
    const out = `${error.stdout ?? ""}`;
    // 非零退出不等于「被变异杀掉」。语法错的替换串、跑不起来的测试文件、崩掉的运行器，
    // 全都是非零退出。把它们记成 KILLED 就是把工具坏掉伪装成防线有效。
    //
    // `ℹ tests N` 缺失时无法证明测试运行；有汇总也需对照基线，不能把截断报告冒充完整一轮。
    const tests = reportedTests(out);
    const failed = /^\s*ℹ fail (\d+)/m.exec(out);
    const cancelled = /^\s*ℹ cancelled (\d+)/m.exec(out);
    const failing = out
      .split("\n")
      .filter((line) => line.trim().startsWith("✖") || line.includes("AssertionError"))
      .slice(0, 4)
      .map((line) => line.trim())
      .join(" | ");
    if (tests === null) {
      const why = `${out}\n${error.stderr ?? ""}`.split("\n").filter((l) => l.trim() !== "").slice(-3).join(" | ");
      verdict = `INVALID 测试未真正运行，这条变异什么也没证明: ${why}`;
    } else if (cancelled !== null && Number(cancelled[1]) > 0) {
      verdict = `INVALID 测试存在取消项，未完整评估变异: ${failing}`;
    } else if (hasFileLevelFailures(out)) {
      verdict = `INVALID 测试文件整体加载失败或异常退出，未完整评估变异: ${failing}`;
    } else if (tests !== baselineTests) {
      verdict = `INVALID 测试数量与绿基线不一致: 基线 ${baselineTests}，实际 ${tests}`;
    } else if (failed !== null && Number(failed[1]) === 0) {
      // 跑完了、一个都没失败，却仍然非零退出：运行器自身的问题，同样不算证据。
      verdict = `INVALID 测试全过但退出码非零: ${failing}`;
    } else {
      verdict = `KILLED ${failing}`;
    }
  }
} finally {
  fs.writeFileSync(target, original);
  const restored = fs.readFileSync(target, "utf8") === original;
  process.stdout.write(`${verdict}\nRESTORED ${restored}\n`);
}
