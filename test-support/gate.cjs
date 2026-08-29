"use strict";
// 门禁：完整测试 + 全部变异规格。结果无条件落盘，包括失败的那些。
//
// 用法：npm run gate    或    node test-support/gate.cjs
//
// 为什么是 .cjs 而不是原来的 gate.sh：
// `bash` 在 Windows 上不是一个稳定的名字。原生 PowerShell 里 PATH 上的 bash 解析到
// C:\WINDOWS\system32\bash.exe——那是 WSL，不是 Git Bash——本机的 WSL 又坏在 localhost
// 代理上，于是同一条 `npm run gate` 在 Git Bash 里是绿的，在 PowerShell 里连不起来。
// 「门禁通过」这句话不能取决于说话的人当时开的是哪个终端。这里唯一的假设是 node 在
// PATH 上，而 npm 脚本本来就已经这么假设了。
//
// 放在 test-support/ 而不是 artifacts/：artifacts/ 是 gitignore 的，而这个脚本要能在
// 全新 checkout 里复跑——复核者拿到的必须是同一个判定口径，不是一段抄在报告里的命令。
// 输出仍然落在 artifacts/ 下（那里该被忽略），脚本本身进仓库。

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "artifacts", "gate-run");
const SPEC_DIR = path.join(ROOT, "test-support", "mutations");

const TALLY = /^合计 (\d+)：杀掉 (\d+)，存活 (\d+)，未评估 (\d+)/;

// 只有最后一行合计算数（等价于 shell 版的 `grep 合计 | tail -1`）：变异驱动每条变异都会
// 打自己的判词，中间出现别的行是正常的。没有合计行时返回 null 而不是一组零——这两件事
// 在 shell 版里被 ${t:-0} 揉成了同一件，见下面 judge() 的注释。
function parseTally(text) {
  let found = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = TALLY.exec(line);
    if (m) found = { total: +m[1], killed: +m[2], survived: +m[3], unevaluated: +m[4] };
  }
  return found;
}

// 判定是纯函数：输入是每份规格自报的合计加 npm test 的退出码，输出是过不过和为什么。
// 抽出来是为了能用合成输入把假绿逼出来——真跑一遍门禁要两分钟以上，而「一条规格都没跑
// 也算过」这种洞，在真跑里恰好永远看不见。
function judge({ npmExit, specs }) {
  // 一条规格都没跑不是「全部通过」。shell 版在 glob 没匹配到文件时四个计数都是 0，
  // 0 == 0 且 SURVIVED == 0，于是 GATE=PASS——空防线和完整防线长得一模一样。
  if (specs.length === 0) {
    return { pass: false, reason: "没有找到任何变异规格，空的防线不算通过", total: 0, killed: 0, survived: 0, skipped: 0 };
  }

  // 缺合计行同理：shell 版 line 为空时 sed 什么也吐不出来，${t:-0} 把它兜成 0，
  // 四个计数一动不动。一个跑崩的规格因此和一个干净的规格产生完全相同的聚合结果。
  const silent = specs.filter((s) => s.tally === null).map((s) => s.name);
  if (silent.length > 0) {
    return {
      pass: false,
      reason: `这些规格没有打出合计行（跑崩了，不是通过）：${silent.join("、")}`,
      total: 0, killed: 0, survived: 0, skipped: 0,
    };
  }

  const sum = (key) => specs.reduce((acc, s) => acc + s.tally[key], 0);
  const total = sum("total");
  const killed = sum("killed");
  const survived = sum("survived");
  const skipped = sum("unevaluated");
  const counts = { total, killed, survived, skipped };

  // 未评估必须和存活一样刺眼。
  //
  // 这一条是踩过两次的坑：改实现会让某条变异的查找串失配，那条变异于是根本没跑，
  // 而它既不计入存活也不计入杀掉——聚合行显示 SURVIVED=0，复核者看一眼就过了。
  // WEB-15 和 F5-26 都是这么溜过去的。未评估的变异不是「通过」，是「没测」。
  if (survived !== 0 || skipped !== 0) {
    return { pass: false, reason: `存活 ${survived} 条，未评估 ${skipped} 条（未评估等于没测，不算通过）`, ...counts };
  }
  if (total !== killed) {
    return { pass: false, reason: `合计 ${total} 与杀掉 ${killed} 不一致，聚合逻辑或某个规格的合计行有问题`, ...counts };
  }
  if (npmExit !== 0) {
    return { pass: false, reason: `npm test 退出码 ${npmExit}`, ...counts };
  }
  return { pass: true, reason: "", ...counts };
}

module.exports = { judge, parseTally, TALLY };

// ——— 以下只在直接执行时跑，require 进来做单元测试时不动 ———
if (require.main === module) main();

function main() {
const say = (line = "") => process.stdout.write(`${line}\n`);
const grepLines = (text, re, limit = Infinity) => {
  const hits = [];
  for (const line of text.split(/\r?\n/)) {
    if (re.test(line) && hits.length < limit) hits.push(line);
  }
  return hits;
};

fs.mkdirSync(OUT, { recursive: true });

// npm test 的口径必须和 `npm test` 完全一致，所以从 package.json 读，不在这里抄一份。
// 抄一份的那天，门禁跑的就不再是别人跑的那套测试了。
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const testScript = pkg.scripts?.test ?? "";
const testArgv = testScript.trim().split(/\s+/);
if (testArgv[0] !== "node" || /[|&;<>$`(){}]/.test(testScript)) {
  // 直接 spawn node 而不是借 shell 跑 npm，是为了不把「哪个 shell」的问题搬进来。
  // 代价是只能跑形状简单的命令；一旦 test 脚本用上管道或多命令，就在这里停，而不是
  // 悄悄跑一个和 `npm test` 不同的东西。
  say(`GATE=FAIL package.json 的 test 脚本不是单条 node 命令，无法在不借 shell 的前提下复现：${testScript}`);
  process.exit(1);
}

say("=== npm test ===");
const npmTest = spawnSync(process.execPath, testArgv.slice(1), {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const npmOutput = `${npmTest.stdout ?? ""}${npmTest.stderr ?? ""}`;
fs.writeFileSync(path.join(OUT, "npm-test.txt"), npmOutput);
// spawnSync 拿不到退出码时（进程被信号打断、或根本没起来）不能当成 0。
const npmExit = npmTest.status ?? (npmTest.error ? 70 : 71);
say(`NPM_TEST_EXIT=${npmExit}`);
if (npmTest.error) say(`NPM_TEST_ERROR=${npmTest.error.message}`);
for (const line of grepLines(npmOutput, /^ℹ (tests|pass|fail)/)) say(line);
for (const line of grepLines(npmOutput, /^✖ /, 10)) say(line);

say();
say("=== mutation specs ===");
// 显式排序：readdirSync 的顺序是操作系统给的，PowerShell 和 Git Bash 下不保证一致。
// 门禁的输出要能逐行对账，顺序就不能随平台漂。
const specFiles = fs.existsSync(SPEC_DIR)
  ? fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".json")).sort()
  : [];

const specs = [];
for (const name of specFiles) {
  const run = spawnSync(process.execPath, [path.join("test-support", "mutate-suite.cjs"), path.join("test-support", "mutations", name)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  fs.writeFileSync(path.join(OUT, `mut-${name}.txt`), output);
  const tally = parseTally(output);
  const line = tally
    ? `合计 ${tally.total}：杀掉 ${tally.killed}，存活 ${tally.survived}，未评估 ${tally.unevaluated}`
    : "无合计行（跑失败了）";
  say(`${name.padEnd(40)} ${line}`);
  for (const bad of grepLines(output, /^(存活：|未评估：)/)) say(`    ${bad}`);
  specs.push({ name, tally });
}

say();
const verdict = judge({ npmExit, specs });
say(`MUTATION_TOTAL=${verdict.total} KILLED=${verdict.killed} SURVIVED=${verdict.survived} SKIPPED=${verdict.skipped}`);
if (!verdict.pass) {
  say(`GATE=FAIL ${verdict.reason}`);
  process.exit(1);
}
say("GATE=PASS");
}
