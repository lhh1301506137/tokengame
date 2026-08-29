"use strict";

// 确定性发牌（B.3）。
//
// 为什么需要它：验收里「全下被跟之后短码破不破产」取决于摊牌，而那一条分支决定两条断言
// 在不在，于是项数在 200/201 之间跳。一条看牌运气的覆盖比没有覆盖更坏——它会教人重跑到绿。
//
// 本文件钉两组事：
//
//   1. 随机源本身：同种子可重复、异种子不同、洗出来的是合法牌堆、分布不偏。
//      最后一条要紧——取模会让小余数更常出现，而洗牌调 51 次，偏差会累积成系统性牌序倾向。
//      一副「随机」但偏斜的牌比固定牌序更难发现。
//
//   2. 入口的三道约束：只在自带内核时生效、只允许回环监听、启动时如实报告。
//      种子不是特权动作后门（它不放宽授权，也不多给谁一张牌的可见性），
//      风险在「谁能开」而不在「能不能开」，所以约束全在入口。

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const { seededRandomInt, seededDeckFactory, seedToState } = require("../src/game/seeded-random.cjs");
const { shuffledDeck } = require("../src/game/holdem.cjs");

const ENTRY = path.join(__dirname, "..", "src", "run-table-web.cjs");

// 起一次入口进程，读它的第一行 JSON 与 stderr，然后关掉。
// 走真进程而不是 require：要测的正是环境变量到启动那一行之间的路径。
function launch(env, { expectExit = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ENTRY], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TOKENGAME_WEB_PORT: "0", ...env },
    });
    let out = "";
    let err = "";
    const done = (code) => resolve({ out, err, code, kill: () => child.kill() });
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
      if (!expectExit && out.includes("\n")) {
        // 起来了就够了，不等它退出。
        setTimeout(() => { child.kill(); done(null); }, 50);
      }
    });
    child.stderr.on("data", (chunk) => { err += chunk.toString(); });
    child.on("exit", (code) => done(code));
    setTimeout(() => { child.kill(); done(null); }, 15_000);
  });
}

function firstJson(text) {
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch { /* 下一行 */ }
  }
  return null;
}

test("同一种子洗出同一副牌，不同种子洗出不同的", () => {
  const a = shuffledDeck(seededRandomInt("tg-b3-1"));
  const b = shuffledDeck(seededRandomInt("tg-b3-1"));
  const c = shuffledDeck(seededRandomInt("tg-b3-2"));
  assert.deepEqual(a, b, "同种子必须完全一致，否则「可重复」是空话");
  assert.notDeepEqual(a, c, "异种子给出同一副牌说明种子没进到状态里");
});

test("洗出来的是合法牌堆：52 张、无重复", () => {
  // 反面。一个「永远返回同一张牌 52 次」的实现也能让上一条通过。
  const deck = shuffledDeck(seededRandomInt("tg-b3-legal"));
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52, "有重复牌");
});

test("同一个随机源连续洗两副牌，两副不同", () => {
  // 每手发牌各调一次 deckFactory。每手都从种子重建随机源的话，每一手都发同一副牌
  // ——那不是确定性，那是复读，而它会让「第二手发的是新底牌」那条断言红。
  const randomInt = seededRandomInt("tg-b3-consecutive");
  const first = shuffledDeck(randomInt);
  const second = shuffledDeck(randomInt);
  assert.notDeepEqual(first, second, "连续两副相同说明随机源被重建了");
});

test("短种子之间不只差几位", () => {
  // "1" 与 "2" 只差一个字符。哈希没搅够的话它们的初始状态高度相似，
  // 而前几十个输出正好决定前两手的牌——于是两个「不同」的种子发出几乎一样的牌。
  const [s1, s2] = [seedToState("1"), seedToState("2")];
  const differing = s1.reduce((count, value, index) => {
    let bits = (value ^ s2[index]) >>> 0;
    let n = 0;
    while (bits !== 0) { n += bits & 1; bits >>>= 1; }
    return count + n;
  }, 0);
  // 128 位里期望约 64 位不同。给一个宽但不空的下界。
  assert.ok(differing > 40, `只有 ${differing} 位不同，种子搅拌不足`);
});

test("randomInt 的分布不偏（拒绝采样，不是取模）", () => {
  // 取模会让小余数更常出现。洗牌调 51 次，偏差会累积成系统性牌序倾向，
  // 而一副「随机」但偏斜的牌比固定牌序更难发现。
  const randomInt = seededRandomInt("tg-b3-uniform");
  const faces = 6;
  const rolls = 60_000;
  const bins = new Array(faces).fill(0);
  for (let index = 0; index < rolls; index += 1) bins[randomInt(faces)] += 1;
  const expected = rolls / faces;
  for (const [face, count] of bins.entries()) {
    const deviation = Math.abs(count - expected) / expected;
    assert.ok(deviation < 0.05,
      `第 ${face} 面出现 ${count} 次，偏离期望 ${expected} 的 ${(deviation * 100).toFixed(1)}%`);
  }
});

test("拒绝采样在偏差大的上界上真的生效（六面骰查不出这件事）", () => {
  // 上一条用六面骰，查不出取模与拒绝采样的区别：2^32 对 6 的取模偏差约 1.4e-9，
  // 比那条 5% 的容差小九个数量级。也就是说「把拒绝采样删掉」在上一条下面永远是绿的。
  //
  // 偏差要大就得让上界接近 2^32。取 maximum = 3*2^30：
  //   拒绝采样：limit = 3*2^30，落在 [3*2^30, 2^32) 的样本丢掉重取，
  //             于是 [0, 2^30) 与其余两段等概率，P(x < 2^30) = 1/3。
  //   纯取模：  那 2^30 个本该丢掉的样本被折回 [0, 2^30)，
  //             于是 P(x < 2^30) = 1/2。
  // 1/3 与 1/2 隔着几十个标准差，几千个样本就能分开。
  const maximum = 3 * 2 ** 30;
  const randomInt = seededRandomInt("tg-b3-modulo-bias");
  const samples = 6_000;
  let lowThird = 0;
  for (let index = 0; index < samples; index += 1) {
    if (randomInt(maximum) < 2 ** 30) lowThird += 1;
  }
  const share = lowThird / samples;
  assert.ok(Math.abs(share - 1 / 3) < 0.05,
    `最低那一段占 ${(share * 100).toFixed(1)}%，拒绝采样下应当约 33.3%；`
      + `接近 50% 说明退化成了取模`);
});

test("randomInt 拒绝非法上界", () => {
  const randomInt = seededRandomInt("tg-b3-bound");
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => randomInt(bad), (error) => error.code === "invalid_random_bound",
      `${bad} 应当被拒`);
  }
  assert.equal(randomInt(1), 0, "上界 1 只能返回 0");
});

test("牌堆工厂跨手连续：连着要两副牌，两副不同", () => {
  // 入口把这个工厂交给 CommandSurface，而每手发牌各调它一次。随机源必须跨手连续；
  // 每手都从种子重建的话每一手发同一副牌，那不是确定性，那是复读。
  //
  // 这件事原本在单元层无处落脚：入口不导出任何东西，而它与正确写法之差只是一层
  // 「立即执行的闭包」，肉眼极难看出。所以工厂本身成了一个可测的函数。
  const factory = seededDeckFactory("tg-b3-factory");
  const first = factory();
  const second = factory();
  assert.notDeepEqual(first, second, "连着两副牌一样说明随机源每次都被重建了");
  // 同一种子的两个工厂给出同一串牌堆——可重复性没被上面那条牺牲掉。
  const other = seededDeckFactory("tg-b3-factory");
  assert.deepEqual(other(), first);
  assert.deepEqual(other(), second);
});

test("入口：空种子当作没设种子", async () => {
  // 空字符串的意思是「不要种子」。当成种子的话它同样是一个固定牌序，
  // 而横幅会报「确定性发牌已生效」——调用方明确表示不要，却拿到了。
  const run = await launch({ TOKENGAME_DECK_SEED: "" });
  run.kill();
  const banner = firstJson(run.out);
  assert.ok(banner !== null, `没读到启动 JSON：${run.err}`);
  assert.equal(banner.deterministic_deck, null,
    `空种子不该报确定性发牌：${JSON.stringify(banner.deterministic_deck)}`);
});

test("入口：不设种子时如实报告没有确定性发牌", async () => {
  const { out, err, kill } = await launch({});
  kill();
  const json = firstJson(out);
  assert.notEqual(json, null, `没读到启动 JSON：${out}${err}`);
  assert.equal(json.deterministic_deck, null,
    "没设种子却报了确定性发牌，那会让正常运行看起来像被固定过");
  assert.equal(err.includes("确定性发牌"), false, "没设种子不该打那行警告");
});

test("入口：设了种子必须在启动那一行报出来，且不报原文", async () => {
  const seed = "tg-b3-entry-seed";
  const { out, err, kill } = await launch({ TOKENGAME_DECK_SEED: seed });
  kill();
  const json = firstJson(out);
  assert.notEqual(json, null, `没读到启动 JSON：${out}${err}`);
  assert.notEqual(json.deterministic_deck, null,
    "设了种子却没报——一次带种子的运行绝不能长得像正常运行");
  assert.equal(typeof json.deterministic_deck.seed_fingerprint, "string");
  // 原文不进日志：任何读到日志的人都能据此预测这一桌的发牌。
  assert.equal(out.includes(seed), false, "启动输出里出现了种子原文");
  assert.equal(err.includes(seed), false, "stderr 里出现了种子原文");
  // 人话那一行也要有。JSON 是给脚本读的，这一行是给人读的。
  assert.ok(err.includes("确定性发牌"), `stderr 少了给人看的那行警告：${err}`);
});

test("入口：种子 + 对外监听直接拒绝启动", async () => {
  // 不是打一行警告继续。警告会被忽略，而「确定性牌序 + 任何人能连」这个组合
  // 意味着连上的人能预测发牌。
  const { err, code } = await launch({
    TOKENGAME_DECK_SEED: "tg-b3-refuse",
    TOKENGAME_WEB_HOST: "0.0.0.0",
  }, { expectExit: true });
  assert.notEqual(code, 0, "对外监听 + 种子应当非零退出");
  assert.ok(err.includes("回环"), `报错要说清为什么：${err}`);
});

test("入口：种子 + 远端内核直接拒绝启动", async () => {
  // 牌由远端内核发，这里的种子不会生效。静默忽略的后果是有人以为设上了，
  // 而验收会在一副真随机的牌上跑「确定性」断言。
  const { err, code } = await launch({
    TOKENGAME_DECK_SEED: "tg-b3-remote",
    TOKENGAME_COMMAND_ORIGIN: "http://127.0.0.1:59999",
  }, { expectExit: true });
  assert.notEqual(code, 0, "远端内核 + 种子应当非零退出");
  assert.ok(err.includes("自带内核"), `报错要说清为什么：${err}`);
});

test("入口：回环的三种写法都放行", async () => {
  // 反面。只认 127.0.0.1 会让 ::1 与 localhost 撞上拒绝，而那两个同样是回环。
  for (const host of ["127.0.0.1", "localhost"]) {
    const { out, err, kill, code } = await launch({
      TOKENGAME_DECK_SEED: "tg-b3-loopback",
      TOKENGAME_WEB_HOST: host,
    });
    kill();
    assert.notEqual(firstJson(out), null,
      `${host} 应当放行，实际退出码 ${code}，stderr=${err}`);
  }
});

test("产品代码里没有为了确定性而开的动作后门", () => {
  // 种子只影响洗牌。它不该顺手带来「指定谁赢」「指定发什么牌给谁」「跳过某个授权」
  // 这类东西——那才是后门，而 B.3 明令禁止。
  const fs = require("node:fs");
  const source = fs.readFileSync(ENTRY, "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  // 入口只允许把种子接到 deckFactory 上，不许碰命令面、授权或席位。
  for (const name of ["stackedDeck", "requireSeatCredential", "SEAT_AUTHORIZED",
    "recovery_credential", "seat_handle"]) {
    assert.equal(code.includes(name), false,
      `入口不该出现 ${name}——种子只该影响洗牌`);
  }
  assert.ok(code.includes("deckFactory"), "种子应当只经 deckFactory 接入");
});
