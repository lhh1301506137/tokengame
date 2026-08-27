"use strict";
// 按行号做变异：删掉指定文件的某一行（换成一句无害的 void 0），跑测试，要求失败，
// 然后无条件还原。三处 reclaimSeatIfExpired(seat); 的文本一模一样，靠查找串没法指定
// 是哪一处，所以这里按行号定位。
//
// 用法：node test-support/mutate-batch.cjs <文件> <行号> <测试文件...>
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const [rel, lineNoRaw, ...testFiles] = process.argv.slice(2);
const lineNo = Number(lineNoRaw);
const target = path.join(__dirname, "..", rel);
const original = fs.readFileSync(target, "utf8");
const lines = original.split("\n");

if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > lines.length) {
  process.stdout.write(`ABORT 行号越界: ${lineNoRaw}\n`);
  process.exit(2);
}

const removed = lines[lineNo - 1];
process.stdout.write(`删除 ${rel}:${lineNo}  ${removed.trim()}\n`);

let verdict = "UNKNOWN";
try {
  const mutated = [...lines];
  mutated[lineNo - 1] = removed.replace(/\S.*/, "void 0;");
  fs.writeFileSync(target, mutated.join("\n"));
  try {
    execFileSync("node", ["--test", ...testFiles], { stdio: "pipe", encoding: "utf8" });
    verdict = "SURVIVED 变异没被任何测试杀掉";
  } catch (error) {
    const out = `${error.stdout ?? ""}`;
    const failing = out
      .split("\n")
      .filter((line) => line.trim().startsWith("✖") || line.includes("AssertionError"))
      .slice(0, 3)
      .map((line) => line.trim())
      .join(" | ");
    verdict = `KILLED ${failing}`;
  }
} finally {
  fs.writeFileSync(target, original);
  process.stdout.write(`${verdict}\nRESTORED ${fs.readFileSync(target, "utf8") === original}\n`);
}
