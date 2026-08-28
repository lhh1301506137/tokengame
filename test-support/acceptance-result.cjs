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

module.exports = { buildResult, summarize, redactDetail, CREDENTIAL_KEYS };
