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

// 两套键名都认：f1/f2 写的是 needle/replacement，f3/f4 写的是 find/replace。这是真实的
// 规格漂移，不是设计。这里兼容而不去手改 33 条既有变异——那些查找串是逐字对源码的长片段，
// 手改一次就多一次抄错的机会，而抄错的表现恰好是「查找串不存在」被当成变异生效前的 ABORT。
// 统一格式是治理层该做的事，记在这里以免被当成已解决。
function testFileFor(mutation) {
  const file = mutation.test ?? spec.test;
  if (typeof file !== "string" || file === "") {
    process.stdout.write(`FATAL ${mutation.id} 没有测试文件：规格顶层或该条都要写 "test"\n`);
    process.exit(2);
  }
  return file;
}

// 变异前先证明测试文件本身是绿的。
//
// 这一步是整个工具的信任根。没有它，「测试失败」就有两种可能：变异被抓住了，或者这个测试
// 本来就跑不起来。而后者会让每条变异都报 KILLED——曾经真的这样：驱动读错规格键名，测试文件
// 名传成了字符串 "undefined"，node --test 找不到文件必然失败，于是四个变异集全部假绿，
// 每条都显示 ✔。判定的可信度不取决于判定逻辑多严，取决于基线是否已知为绿。
function assertBaselineGreen(files) {
  const counts = new Map();
  for (const file of [...new Set(files)]) {
    try {
      // Node 22 在管道中默认使用 TAP；本驱动的 ℹ/✖ 解析合同必须显式固定为 spec。
      const out = execFileSync(process.execPath, ["--test", "--test-reporter=spec", "--test-concurrency=1", file], {
        encoding: "utf8", stdio: "pipe",
      });
      const count = Number(/^\s*ℹ tests (\d+)\s*$/m.exec(out)?.[1]);
      if (!Number.isSafeInteger(count) || count < 1) {
        process.stdout.write(`FATAL 基线未真正运行: ${file}\n`);
        process.exit(2);
      }
      counts.set(file, count);
      process.stdout.write(`基线绿 ${file}\n`);
    } catch (error) {
      const tail = `${error.stdout ?? ""}\n${error.stderr ?? ""}`
        .split("\n").filter((line) => line.trim() !== "").slice(-4).join("\n  ");
      process.stdout.write(`FATAL 基线不是绿的，此时任何 KILLED 都不可信: ${file}\n  ${tail}\n`);
      process.exit(2);
    }
  }
  return counts;
}

const baselineCounts = assertBaselineGreen(selected.map((mutation) => testFileFor(mutation)));

const results = [];
for (const mutation of selected) {
  // 键名按规格实际使用的 find/replace。曾经这里读的是 needle/replacement，规格里没有这两个
  // 键，于是 undefined 被 execFileSync 强制成字符串 "undefined"——而源码里确实含这个词，
  // 空变异就此成立。所以缺键要当场报错，不能让它悄悄降级成一次无害的替换。
  const find = mutation.find ?? mutation.needle;
  const replace = mutation.replace ?? mutation.replacement;
  if (typeof mutation.file !== "string" || mutation.file === ""
      || typeof find !== "string" || find === "") {
    process.stdout.write(`FATAL ${mutation.id} 缺少 file 或 find/needle\n`);
    process.exit(2);
  }
  // 替换串允许是空串：整行删除是合法变异，也是这些规格里最常用的一种。
  if (typeof replace !== "string") {
    process.stdout.write(`FATAL ${mutation.id} 缺少 replace/replacement\n`);
    process.exit(2);
  }
  // mutate-check 在 ABORT 时退出码 2，execFileSync 会抛。抛出去等于整集中断在半路，
  // 而前面几条的结论也就跟着看不见了，所以接住它、记成这一条的判定。
  let output;
  try {
    const testFile = testFileFor(mutation);
    output = execFileSync(
      process.execPath,
      [checker, mutation.file, find, replace, testFile, `--baseline-tests=${baselineCounts.get(testFile)}`],
      { encoding: "utf8" },
    );
  } catch (error) {
    output = `${error.stdout ?? ""}`;
    if (output.trim() === "") output = `ABORT 变异检查自身失败: ${error.message}\n`;
  }
  const verdict = output.split("\n")[0] ?? "";
  const restored = /^RESTORED true$/m.test(output);
  results.push({ id: mutation.id, verdict, restored });
  const mark = verdict.startsWith("KILLED") ? "✔" : "✖";
  process.stdout.write(`${mark} ${mutation.id}\n    ${verdict}\n`);
  // ABORT 发生在写文件之前，源码从未被改，所以它不打 RESTORED 也不算「未还原」。
  if (!restored && !verdict.startsWith("ABORT")) {
    // 还原失败就必须立刻停：继续跑会在已被改坏的源码上叠加下一条变异。
    process.stdout.write("FATAL 源码未还原，停止\n");
    process.exit(1);
  }
}

// 三分而不是二分。INVALID 与 ABORT 不是「变异存活」——那说的是「防线没抓住它」，而这两类
// 说的是「这条变异没被真正评估」。混在一起报会同时骗两次：把工具坏掉说成防线有洞，或者反过来
// 在修好工具后误以为洞消失了。
const tally = (prefix) => results.filter((r) => r.verdict.startsWith(prefix));
const killed = tally("KILLED");
const survived = tally("SURVIVED");
const unevaluated = results.filter(
  (r) => !r.verdict.startsWith("KILLED") && !r.verdict.startsWith("SURVIVED"),
);
process.stdout.write(
  `\n合计 ${results.length}：杀掉 ${killed.length}，存活 ${survived.length}，未评估 ${unevaluated.length}\n`,
);
for (const r of survived) process.stdout.write(`存活：${r.id}\n`);
for (const r of unevaluated) process.stdout.write(`未评估：${r.id} — ${r.verdict}\n`);
process.exit(survived.length === 0 && unevaluated.length === 0 ? 0 : 1);
