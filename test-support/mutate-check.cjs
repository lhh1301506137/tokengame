"use strict";
// 变异检查：临时改一处源码，跑指定测试，要求它失败，然后无条件还原。
// 用法：node test-support/mutate-check.cjs <文件> <查找串> <替换串> <测试文件>
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const [rel, needle, replacement, testFile] = process.argv.slice(2);
const target = path.join(__dirname, "..", rel);
const original = fs.readFileSync(target, "utf8");

if (!original.includes(needle)) {
  process.stdout.write(`ABORT 查找串不存在，变异没生效: ${needle}\n`);
  process.exit(2);
}

let verdict = "UNKNOWN";
try {
  fs.writeFileSync(target, original.replace(needle, replacement));
  try {
    execFileSync("node", ["--test", testFile], { stdio: "pipe", encoding: "utf8" });
    verdict = "SURVIVED 变异没被任何测试杀掉";
  } catch (error) {
    const out = `${error.stdout ?? ""}`;
    const failing = out
      .split("\n")
      .filter((line) => line.trim().startsWith("✖") || line.includes("AssertionError"))
      .slice(0, 4)
      .map((line) => line.trim())
      .join(" | ");
    verdict = `KILLED ${failing}`;
  }
} finally {
  fs.writeFileSync(target, original);
  const restored = fs.readFileSync(target, "utf8") === original;
  process.stdout.write(`${verdict}\nRESTORED ${restored}\n`);
}
