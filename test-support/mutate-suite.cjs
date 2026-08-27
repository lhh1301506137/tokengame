"use strict";
// 变异集驱动：按 JSON 规格逐条调用 mutate-check.cjs，汇总存活/杀掉。
//
// 为什么要有这一层：mutate-check.cjs 一次只跑一条，而一个 finding 的承重点往往十几处，
// 手敲十几条命令既跑不全也没法复核。规格文件进仓库，复核者能重跑同一组变异并逐条比对。
//
// 与 mutate-batch.cjs 的分工：那个按行号把整行换成 void 0，适合快速扫面；删掉
// `if (...) {` 这类行会破坏花括号配对，产生「整文件语法错」的假杀。本文件只做语义级
// 字符串替换，每条变异都必须是一处能独立成立的行为改动。
//
// 用法：node test-support/mutate-suite.cjs <规格.json> [名称过滤子串]
//
// 规格格式：{ "mutations": [{ "id", "file", "needle", "replacement", "test", "guards" }] }
// guards 是这条变异存活时被放过的行为，写给复核者看，不参与执行。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const [specPath, filter] = process.argv.slice(2);
if (specPath === undefined) {
  process.stdout.write("用法：node test-support/mutate-suite.cjs <规格.json> [名称过滤]\n");
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), "utf8"));
const checker = path.join(__dirname, "mutate-check.cjs");
const selected = spec.mutations.filter(
  (mutation) => filter === undefined || mutation.id.includes(filter),
);

if (selected.length === 0) {
  process.stdout.write("没有匹配的变异，规格或过滤串写错了\n");
  process.exit(2);
}

const results = [];
for (const mutation of selected) {
  const output = execFileSync(
    "node",
    [checker, mutation.file, mutation.needle, mutation.replacement, mutation.test],
    { encoding: "utf8" },
  );
  const verdict = output.split("\n")[0] ?? "";
  const restored = /^RESTORED true$/m.test(output);
  results.push({ id: mutation.id, verdict, restored });
  const mark = verdict.startsWith("KILLED") ? "✔" : "✖";
  process.stdout.write(`${mark} ${mutation.id}\n    ${verdict}\n`);
  if (!restored) {
    // 还原失败就必须立刻停：继续跑会在已被改坏的源码上叠加下一条变异。
    process.stdout.write("FATAL 源码未还原，停止\n");
    process.exit(1);
  }
}

const killed = results.filter((r) => r.verdict.startsWith("KILLED")).length;
const survived = results.length - killed;
process.stdout.write(`\n合计 ${results.length}：杀掉 ${killed}，存活 ${survived}\n`);
if (survived > 0) {
  for (const r of results.filter((x) => !x.verdict.startsWith("KILLED"))) {
    process.stdout.write(`存活：${r.id}\n`);
  }
}
process.exit(survived === 0 ? 0 : 1);
