"use strict";

// 公开范围同意的 policy epoch：「什么算实质性改变」的唯一判据。
//
// ---- 为什么需要它 ----
//
// 权威此前只按两维判定同意是否还有效：room_binding_id 与 table_rules_version。
// 发言限制的版本串也被写进了确认记录，但**从来没有被检查过**——只有
// src/host/table-view-model.cjs 会拿它算出一个 public_limits_changed 理由给界面看。
//
// 于是同意门在这一维上是纯 UI 的：绕过界面直接打命令的调用方，在发言限制实质放宽之后
// 仍然握着一份旧同意继续发言，而权威一点意见都没有。同意门只在界面上成立等于没有同意门。
//
// ---- 为什么不直接比版本串 ----
//
// 顺手的做法是让权威也比一次 limits_version。那样做会把「任意配置版本变化」都算成实质变化：
// 改一个纯本地的显示时长、或者只是给版本号加个后缀，全桌就得重新点一遍同意。
// 而每一次不必要的重新确认都在教用户把同意门当成噪音——这是同意机制最实际的失效方式。
//
// 所以 epoch 从**明确列出的实质字段**推导，不从版本串推导。判据是一句话：
// 这个字段的变化会不会改变「关于我的什么内容被公开出去、以多大的量」。
//
// 实质（进 epoch）：
//   maxGraphemesPerMessage      单条能公开多长
//   playerMaxPerHand            一手里我能公开多少条
//   playerMaxPerRollingWindow   短窗内能公开多少条
//   playerRollingWindowMs       与上一条合起来定义速率；窗口缩短就是速率放宽
//   aiMaxPublicPerHand          一手里 AI 替我公开多少条
//   aiMinEvaluationIntervalMs   AI 多久能再说一次；这也是速率
//
// 非实质（不进 epoch，且写明理由）：
//   version                     版本串本身。让它进来就等于「任意版本变化都算实质」，
//                               正是上面要避免的那件事。它仍然记在确认里，用于诊断。
//   bubbleDisplayMs             气泡在自己屏幕上停多久。纯本地显示，不改变公开了什么。
//   EVALUATION_LEASE_MS 等      活性期限，不是公开预算，一格额度也没放宽（seat-ai-store
//                               里已经解释过为什么它不在 LIVELY_V1 里）。
//
// ---- 为什么把三样东西合成一个 epoch ----
//
// 绑房、桌规版本、发言限制这三者要回答的是同一个问题：我上次点同意时，答应的是不是
// 现在这一套。分成三次比较意味着每加一维都要改所有比较点，而漏改一处的表现是
// 「某一维在权威侧不生效」——恰恰是这次要修的形状。合成一个字符串之后，比较点只有一处。

// 进 epoch 的字段。顺序固定：epoch 是字符串，字段顺序变了就等于所有旧同意失效。
const POLICY_SCOPE_FIELDS = Object.freeze([
  "maxGraphemesPerMessage",
  "playerMaxPerHand",
  "playerMaxPerRollingWindow",
  "playerRollingWindowMs",
  "aiMaxPublicPerHand",
  "aiMinEvaluationIntervalMs",
]);

// 明确排除的字段，带理由。写下来是为了让「为什么这个不算实质」有据可查，
// 而不是靠读 POLICY_SCOPE_FIELDS 反推出一个沉默的决定。
const POLICY_EXCLUDED_FIELDS = Object.freeze({
  version: "版本串本身。进 epoch 等于任意版本变化都算实质，会把同意门变成噪音。",
  bubbleDisplayMs: "气泡在本地屏幕上停留多久。不改变公开了什么，也不改变公开的量。",
});

// 把限制对象里的实质字段取成一个稳定串。
//
// 缺字段写成 "-"，不跳过：跳过会让 {a:1} 与 {a:1,b:undefined} 产生同一个 epoch，
// 而前者是「没这一维」、后者是「这一维被清空了」。两者对公开范围的含义不同。
function limitsFingerprint(limits) {
  if (limits === null || typeof limits !== "object") return "none";
  return POLICY_SCOPE_FIELDS
    .map((field) => {
      const value = limits[field];
      return `${field}=${value === undefined || value === null ? "-" : value}`;
    })
    .join(",");
}

// 一次同意所承诺的那一整套。任何一部分实质变化，epoch 就变，旧同意随之失效。
function policyEpoch({ roomBindingId, tableRulesVersion, limits } = {}) {
  return [
    `binding:${roomBindingId ?? "-"}`,
    `rules:${tableRulesVersion ?? "-"}`,
    `limits:${limitsFingerprint(limits)}`,
  ].join("|");
}

// 两个 epoch 不同时，指出是哪一维变了。
//
// 只回「变了」不够：重新确认的界面要告诉用户为什么又要点一次，而「绑了新房间」
// 与「发言限制放宽了」对用户是两件不同的事。理由串沿用界面既有的三个值。
function epochChangeReason(previous, current) {
  if (previous === current) return null;
  const [prevBinding, prevRules] = String(previous ?? "").split("|");
  const [curBinding, curRules] = String(current ?? "").split("|");
  if (prevBinding !== curBinding) return "new_room_binding";
  if (prevRules !== curRules) return "table_rules_changed";
  return "public_limits_changed";
}

module.exports = {
  POLICY_SCOPE_FIELDS,
  POLICY_EXCLUDED_FIELDS,
  epochChangeReason,
  limitsFingerprint,
  policyEpoch,
};
