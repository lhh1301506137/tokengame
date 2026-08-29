"use strict";
// A5：门禁入口必须跨平台，且它自己的判定不能有假绿。
//
// 为什么这个文件存在：`npm run gate` 原先是 `bash test-support/gate.sh`。在原生
// PowerShell 里 PATH 上的 `bash` 解析到 C:\WINDOWS\system32\bash.exe，那是 WSL，
// 本机的 WSL 又坏在 localhost 代理上——于是这台机器上 `npm run gate` 在 PowerShell
// 里根本跑不起来，而同一条命令在 Git Bash 里是绿的。「门禁通过」这句话因此依赖于说话
// 的人当时开的是哪个终端，这不是判定，是巧合。
//
// 这里不重跑门禁（那要两分钟以上，且会和别的测试抢文件）。这里盯两件事：
//   1. 入口的形状——谁被调用、有没有写死本机路径、判定住在哪一份文件里；
//   2. 聚合判定本身——用合成输入驱动纯函数，逼出 shell 版里那些「没测也算过」的洞。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json"));

test("gate 入口", async (t) => {
  await t.test("npm run gate 不经过 bash", () => {
    const gate = pkg.scripts.gate;
    assert.equal(typeof gate, "string", "package.json 必须有 gate 脚本");
    // 关键的一条。bash 在 Windows 上不是一个稳定的名字：可能是 Git Bash，可能是 WSL，
    // 也可能不存在。门禁的判定口径不该由 PATH 的先后顺序决定。
    assert.doesNotMatch(
      gate,
      /\bbash\b|\bsh\b|\bcmd\b|\bpowershell\b|\bpwsh\b/,
      `gate 脚本不能调用具体 shell，实际是 ${gate}`,
    );
    assert.match(gate, /^node /, `gate 应当由 node 直接驱动，实际是 ${gate}`);
  });

  await t.test("入口脚本存在，且不把判定转包给 shell", () => {
    const entry = pkg.scripts.gate.replace(/^node\s+/, "").trim();
    assert.ok(fs.existsSync(path.join(ROOT, entry)), `${entry} 不存在`);
    const source = read(entry);
    // spawn 一个 shell 会把「哪个 bash」这个问题原封不动搬进 Node 里。
    assert.doesNotMatch(
      source,
      /shell:\s*true|\/bin\/(ba)?sh|\bexecFileSync\(\s*["']bash|spawnSync\(\s*["'](bash|sh|cmd)/,
      "门禁入口不能借 shell 执行",
    );
  });

  await t.test("仓库里没有写死本机 Git 或 WSL 路径", () => {
    // 剥注释再扫。这几份文件的注释里正要引用 C:\WINDOWS\system32\bash.exe 来说明
    // 问题出在哪——把解释文字和执行路径一起禁掉，就等于禁止记录这次修的是什么。
    const strip = (source) =>
      source
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(#|\/\/).*$/, "").replace(/\/\*[\s\S]*?\*\//g, ""))
        .join("\n");
    // 剥注释这一步本身会造成新的假绿：剥过头把整份文件清空，断言就永远成立。
    // 所以先证明剥完还剩下真正的执行语句。
    const expectedResidue = {
      "package.json": /"gate":/,
      "test-support/gate.sh": /exec node test-support\/gate\.cjs/,
      "test-support/gate.cjs": /spawnSync\(/,
    };
    for (const rel of ["package.json", "test-support/gate.sh", pkg.scripts.gate.replace(/^node\s+/, "").trim()]) {
      const source = strip(read(rel));
      assert.match(source, expectedResidue[rel], `剥注释把 ${rel} 的执行部分也剥掉了，这条断言在空字符串上通过`);
      assert.doesNotMatch(source, /[A-Za-z]:[\\/]/, `${rel} 的可执行部分里有盘符路径`);
      assert.doesNotMatch(source, /Program Files|system32|Git[\\/]usr/i, `${rel} 的可执行部分里有本机路径`);
    }
  });

  await t.test("gate.sh 只剩转发，判定不再有第二份", () => {
    // 保留 gate.sh 是为了不打断已经写进证据文档的那条命令，但它必须是壳。
    // 两份判定逻辑迟早会分叉，而分叉的那天两边都会声称自己是门禁。
    const sh = read("test-support/gate.sh");
    assert.match(sh, /node\s+test-support\/gate\.cjs/, "gate.sh 应当转发到 node 入口");
    for (const marker of ["GATE=PASS", "GATE=FAIL", "MUTATION_TOTAL="]) {
      assert.ok(!sh.includes(marker), `gate.sh 不应再自己产出 ${marker}`);
    }
  });
});

test("门禁聚合判定", async (t) => {
  const { judge, parseTally } = require("../test-support/gate.cjs");

  const spec = (name, tally) => ({ name, tally });
  const ok = (n) => ({ total: n, killed: n, survived: 0, unevaluated: 0 });

  await t.test("全杀且测试通过才是 PASS", () => {
    const verdict = judge({ npmExit: 0, specs: [spec("a.json", ok(3)), spec("b.json", ok(2))] });
    assert.equal(verdict.pass, true);
    assert.deepEqual(
      { total: verdict.total, killed: verdict.killed, survived: verdict.survived, skipped: verdict.skipped },
      { total: 5, killed: 5, survived: 0, skipped: 0 },
    );
  });

  await t.test("存活即 FAIL", () => {
    const verdict = judge({
      npmExit: 0,
      specs: [spec("a.json", { total: 3, killed: 2, survived: 1, unevaluated: 0 })],
    });
    assert.equal(verdict.pass, false);
    assert.match(verdict.reason, /存活/);
  });

  await t.test("未评估即 FAIL，和存活一样刺眼", () => {
    const verdict = judge({
      npmExit: 0,
      specs: [spec("a.json", { total: 3, killed: 2, survived: 0, unevaluated: 1 })],
    });
    assert.equal(verdict.pass, false);
    assert.match(verdict.reason, /未评估/);
  });

  await t.test("npm test 非零即 FAIL", () => {
    const verdict = judge({ npmExit: 1, specs: [spec("a.json", ok(3))] });
    assert.equal(verdict.pass, false);
    assert.match(verdict.reason, /npm test/);
  });

  // 下面三条是 shell 版真实存在的假绿，不是假想的边界。
  await t.test("一条规格没打出合计行，不能算 0 条通过", () => {
    // shell 版：line 为空 → t/k/s/u 全部 sed 不出来 → ${t:-0} 兜成 0 → 四个计数
    // 一动不动 → SURVIVED=0、TOTAL==KILLED → GATE=PASS。一个跑崩的规格因此长得和
    // 一个干净的规格一模一样。
    const verdict = judge({ npmExit: 0, specs: [spec("a.json", ok(3)), spec("broken.json", null)] });
    assert.equal(verdict.pass, false, "缺合计行必须判失败");
    assert.match(verdict.reason, /broken\.json/, "失败理由要点名是哪一份规格");
  });

  await t.test("一条规格都没跑，不能算门禁通过", () => {
    // 同理：glob 没匹配到任何文件时，shell 版四个计数都是 0，0==0 且 SURVIVED=0。
    // 「一条变异都没跑」于是等价于「全部通过」。
    const verdict = judge({ npmExit: 0, specs: [] });
    assert.equal(verdict.pass, false, "空规格表必须判失败");
    assert.match(verdict.reason, /没有|零|空/);
  });

  await t.test("规格自报的合计与明细不一致时判失败", () => {
    const verdict = judge({
      npmExit: 0,
      specs: [spec("a.json", { total: 5, killed: 3, survived: 0, unevaluated: 0 })],
    });
    assert.equal(verdict.pass, false, "5 条里只杀了 3 条，剩下 2 条去哪了必须问出来");
    assert.match(verdict.reason, /不一致|合计/);
  });

  await t.test("合计行解析出的是数字，不是字符串拼接", () => {
    const tally = parseTally("合计 30：杀掉 28，存活 1，未评估 1\n存活：X-01\n");
    assert.deepEqual(tally, { total: 30, killed: 28, survived: 1, unevaluated: 1 });
    // shell 版用 $((...)) 做算术所以碰巧是数字；Node 里 "5"+"3" 会拼成 "53"。
    for (const [key, value] of Object.entries(tally)) {
      assert.equal(typeof value, "number", `${key} 应当是数字`);
    }
  });

  await t.test("只有最后一行合计算数", () => {
    // 变异驱动每条变异都会打输出，中间可能出现别的行；取最后一条是 shell 版
    // `tail -1` 的口径，换成 Node 之后不能悄悄变成第一条。
    const tally = parseTally("合计 2：杀掉 1，存活 1，未评估 0\n\n合计 2：杀掉 2，存活 0，未评估 0\n");
    assert.deepEqual(tally, { total: 2, killed: 2, survived: 0, unevaluated: 0 });
  });

  await t.test("没有合计行时解析返回 null，而不是一组零", () => {
    assert.equal(parseTally("FATAL 源码未还原，停止\n"), null);
    assert.equal(parseTally(""), null);
  });
});
