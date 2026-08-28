"use strict";

// 验收结果的判定式。抽出来只为一件事：让它能被 node --test 看见。
//
// 它原先内联在 test-support/table-web-acceptance.mjs 的 finally 里，写作
// passed: failures.length === 0。那个式子漏掉了异常终止——脚本抛错时一条
// failure 也不会记下，于是中止的运行和跑完的运行在 result.json 里完全同形。
// artifacts/negctl6 就是这么写出 passed: true 的：那是一次第 25 步超时的负控，
// 前 24 步确实都过了。负控证据的全部价值在于它失败。
//
// .mjs 里的东西单元测试加载不了（两个浏览器 UI 也是同样的原因被排除在变异之外），
// 所以判定式只要留在那边，就永远只能靠跑一次真浏览器来发现它错了。

function buildResult({
  banner,
  contexts,
  finalHandIndex,
  artifacts,
  steps,
  failures,
  consoleReport,
  totalConsole,
  aborted = null,
}) {
  return {
    generated_at: new Date().toISOString(),
    server: banner,
    note: "模型适配器是 test-support/scripted-model-adapter.cjs（simulated:true）。"
      + "本文件不构成真实宿主主动唤醒已验证的证据。",
    contexts,
    hands_reached: finalHandIndex,
    console_errors: totalConsole,
    console_detail: consoleReport,
    artifacts,
    // steps_ran 与 steps.length 同值，但中止的那份文件里这个名字才读得懂：
    // 「跑到第几步」不等于「一共有几步」。
    steps_ran: steps.length,
    steps,
    failures,
    // 中止如实记下，不折算成一条断言失败——它不是某条断言的结论，
    // 而是「后面的断言一条都没跑」。
    aborted: aborted === null ? null : {
      message: aborted.message ?? String(aborted),
      stack: aborted.stack ?? null,
    },
    passed: failures.length === 0 && aborted === null,
  };
}

// 产物里记形状，不记值。
//
// 起因：artifacts/negctl5/result.json 里有一条 `invite_code=Kep2jgEI…`，是那次运行的真
// 邀请码原文。那个进程早没了，所以它是死的——但复核的人分不出死活，而 artifacts/ 只要
// 有谁 force-add 一次，一个凭据形状的字符串就进了库。
//
// 修在记录路径上而不是那一个调用点：以后任何一条 check 传什么进来都不会漏。断言本身不受
// 影响——它判的是 `length >= 6`，判完才轮到写盘。
const CREDENTIAL_KEYS = [
  "invite_code",
  "session_token",
  "seat_credential",
  "seat_handle",
  "custody_token",
  "bearer",
];

function redactDetail(detail) {
  if (typeof detail !== "string" || detail === "") return detail;
  let out = detail;
  for (const key of CREDENTIAL_KEYS) {
    // 同时盖 `key=值` 与 JSON 里的 `"key":"值"`。留下长度，因为「拿到了一个 43 字长的
    // 邀请码」本身就是断言要说的话，而值不是。
    out = out.replace(
      new RegExp(`("?)${key}\\1(\\s*[:=]\\s*)"?([A-Za-z0-9._~+/-]{6,})"?`, "g"),
      (_match, quote, sep, value) => `${quote}${key}${quote}${sep}[已脱敏 ${value.length} 字]`,
    );
  }
  return out;
}

function summarize({ steps, failures, totalConsole, finalHandIndex, aborted = null }) {
  const line = `步骤 ${steps.length}：通过 ${steps.filter((s) => s.ok).length}，`
    + `失败 ${failures.length}；控制台错误 ${totalConsole}；到第 ${finalHandIndex} 手。`;
  if (aborted === null) return line;
  return `${line} 运行在此中止：${aborted.message ?? String(aborted)}`;
}

// ---- 多手对局的判定式 ----
//
// 这几个函数从浏览器脚本里抽出来，不是为了复用——只有一个调用点。是为了让它们能被
// node --test 和变异驱动碰到：.mjs 里的逻辑单元测试装不进来，而一条装不进来的判定式
// 等于没有测试。前一轮的「中止却判通过」就是这么漏过去的。

// 筹码守恒：双边界而不是等式。
//
// 等式在这里必然误报，因为 #chips 与 #pot-total 的语义按阶段切换
// （src/host/table-view-model.cjs:180-192、src/game/holdem.cjs:782）：
//   手内   —— stack 是引擎值（下注已扣），pot 是争夺中的池，相加守恒。
//   结算后 —— stack 是账本值（赢的已进账），pot 仍是 settlement.total_pot，
//             相加等于把池算两遍。
// DOM 里读不到 in_hand，所以画面上分不清阶段。上界抓凭空产生，下界抓凭空消失，
// 两个阶段都成立。
function chipConservation({ seatStacks, pot, startingTotal }) {
  const stacks = Array.isArray(seatStacks) ? seatStacks : [];
  const total = stacks.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const inPlay = Number.isFinite(pot) ? pot : 0;
  return {
    total,
    pot: inPlay,
    startingTotal,
    // 席位合计超过起始总额：筹码凭空产生了。任何阶段都不允许。
    created: total > startingTotal,
    // 席位合计加池仍不足起始总额：筹码凭空消失了。
    destroyed: total + inPlay < startingTotal,
    get ok() { return !this.created && !this.destroyed; },
  };
}

// 畸形投影下的降级判定。
//
// 两条正当的降级路：render 抛错 -> refresh 的 catch -> #global-error 显示出来；
// 或者字段本来带可选链与默认值 -> 静默退到合理值。单看一种畸形，两条都对。
// 不对的是「每一种都静默」——那时坏投影的唯一表现是一张不动的旧牌桌，而那比一张
// 空桌子更糟：空桌子能看出问题，不动的旧桌子看起来是真的。
function degradationVerdict(shapeReport) {
  const shapes = Array.isArray(shapeReport) ? shapeReport : [];
  const undelivered = shapes.filter((r) => !(Number.isFinite(r.delivered) && r.delivered > 0));
  const withBanner = shapes.filter((r) => typeof r.banner === "string" && r.banner !== "");
  const reasons = [];
  // 没送达的必须先说。一次都没送到的话，后面所有「页面还活着」都是在正常投影下成立的，
  // 那是恒真而不是通过。
  if (shapes.length === 0) reasons.push("一种畸形都没跑");
  if (undelivered.length > 0) {
    reasons.push(`有 ${undelivered.length} 种畸形没有真的送到页面：`
      + undelivered.map((r) => r.shape).join("、"));
  }
  if (shapes.length > 0 && withBanner.length === 0) {
    reasons.push("每一种畸形都静默降级，画面上没有任何提示");
  }
  return {
    shapes: shapes.length,
    delivered: shapes.filter((r) => Number.isFinite(r.delivered) && r.delivered > 0).length,
    withBanner: withBanner.map((r) => r.shape),
    silent: shapes.filter((r) => r.banner === null || r.banner === "").map((r) => r.shape),
    reasons,
    ok: reasons.length === 0,
  };
}

// 多手对局覆盖到了什么。
//
// 判据是「这一段真的走过这些形状」，而不是「跑完没报错」。跑完没报错的一段可能十手
// 全是过牌到河牌——那样单挑、全下、边池一条都没碰到，而断言仍然全绿。
function handCoverage(handsPlayed, { target, headsUp, multiway, allInAction, allInTag }) {
  const hands = Array.isArray(handsPlayed) ? handsPlayed : [];
  const reasons = [];
  const reached = hands.length === 0 ? 0 : Math.max(...hands.map((h) => h.hand ?? 0));
  if (hands.length === 0) reasons.push("一手都没记录");
  if (reached < target) reasons.push(`只打到第 ${reached} 手，目标第 ${target} 手`);
  if (!headsUp) reasons.push("没有出现过单挑（两家争池）");
  if (!multiway) reasons.push("没有出现过多人局（三家以上争池）");
  // 动作与画面标记两样都要。只看动作，等于只证明「点下去了」；只看标记，等于承认
  // 一次没点也可能算过——第一版只挂在 onNewStreet 上，而全下常把一手打在翻牌前收掉，
  // 那一手一张公共牌都不发，钩子一次都不触发。
  if (!allInAction) reasons.push("没有任何一手真的点下全下");
  if (!allInTag) reasons.push("画面上一次都没出现过「全下」标记");
  if (!hands.some((h) => (h.board ?? 0) >= 3)) reasons.push("一次都没发出翻牌");
  return {
    reached,
    hands: hands.length,
    withFlop: hands.filter((h) => (h.board ?? 0) >= 3).length,
    reasons,
    ok: reasons.length === 0,
  };
}

module.exports = {
  buildResult, summarize, redactDetail, CREDENTIAL_KEYS,
  chipConservation, degradationVerdict, handCoverage,
};
