"use strict";
// 变异检查：临时改一处源码，跑指定测试，要求它失败，然后无条件还原。
// 用法：node test-support/mutate-check.cjs <文件> <查找串> <替换串> <测试文件>
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// 单独一个类，好让下面的 catch 把「语法错」和「测试真的失败了」分开。
class SyntaxCheckFailed extends Error {}

const [rel, needle, replacement, testFile] = process.argv.slice(2);

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

// 失败项是不是「测试文件自己」。Node 在文件加载失败时会把整个文件报成一个无名失败测试，
// 于是 `ℹ tests 1 / fail 1` 成立，看起来和真被断言杀掉一模一样。
function onlyFileLevelFailures(out) {
  const marks = out.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("✖"));
  const named = marks.filter((line) => {
    const body = line.replace(/^✖\s*/, "");
    if (body.startsWith("failing tests:")) return false;
    // `✖ test\foo.test.cjs (12ms)` 是文件级；`✖ 某个测试名 (12ms)` 是真断言失败。
    return !/^\S*[\\/]?[\w.-]+\.test\.cjs\s*\(/.test(body);
  });
  return marks.length > 0 && named.length === 0;
}

let verdict = "UNKNOWN";
try {
  fs.writeFileSync(target, original.replace(needle, replacement));
  // 变异必须仍然是合法 JavaScript。删掉 `if (...) {` 这类行会破坏花括号配对，产出的是
  // 「整文件语法错」，那会让每个测试都失败——看起来像杀掉，实际什么行为都没测到。
  let syntaxError = null;
  try {
    execFileSync("node", ["--check", target], { stdio: "pipe" });
  } catch (failure) {
    const detail = `${failure.stderr ?? ""}`.split("\n").find((line) => line.includes("Error")) ?? "";
    syntaxError = new SyntaxCheckFailed(detail.trim());
  }
  if (syntaxError !== null) {
    verdict = `INVALID 变异产生语法错，不是行为改动: ${syntaxError.message}`;
  } else try {
    execFileSync("node", ["--test", testFile], { stdio: "pipe", encoding: "utf8" });
    verdict = "SURVIVED 变异没被任何测试杀掉";
  } catch (error) {
    const out = `${error.stdout ?? ""}`;
    // 非零退出不等于「被变异杀掉」。语法错的替换串、跑不起来的测试文件、崩掉的运行器，
    // 全都是非零退出。把它们记成 KILLED 就是把工具坏掉伪装成防线有效。
    //
    // 判据是运行器有没有真的跑完一轮：Node 的报告器会打 `ℹ tests N`。没有这一行，说明这次
    // 失败发生在测试执行之前，那这条变异什么也没证明。
    const ran = /^\s*ℹ tests \d+/m.test(out);
    const failed = /^\s*ℹ fail (\d+)/m.exec(out);
    const failing = out
      .split("\n")
      .filter((line) => line.trim().startsWith("✖") || line.includes("AssertionError"))
      .slice(0, 4)
      .map((line) => line.trim())
      .join(" | ");
    if (!ran) {
      const why = `${out}\n${error.stderr ?? ""}`.split("\n").filter((l) => l.trim() !== "").slice(-3).join(" | ");
      verdict = `INVALID 测试未真正运行，这条变异什么也没证明: ${why}`;
    } else if (onlyFileLevelFailures(out)) {
      verdict = `INVALID 测试文件整体加载失败，没有任何断言被评估: ${failing}`;
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
