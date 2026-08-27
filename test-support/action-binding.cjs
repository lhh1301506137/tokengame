"use strict";

// 官方动作的三个绑定字段（F2）。测试用它形成一个「此刻状态下的合法请求」。
//
// 为什么要有共享助手：绑定字段是必填的，所以每个测试都得穿三个字段。若各文件各写一遍，
// 迟早有人为了省事把某个字段填成常量，那条测试就悄悄不再覆盖门禁了。
//
// 默认幂等键取 (hand_id, revision)。这不是随手编的：只有 hand.act 与 hand.reveal 会推进
// revision，而两者都经幂等门，所以「某一手的某个版本」唯一对应一个官方动作，正是它的
// 自然键。要测重放或键冲突的测试自己传显式键。
function actionBinding(orchestrator, { key } = {}) {
  const hand = orchestrator.requireHand();
  return {
    handId: hand.id,
    expectedRevision: hand.revision,
    idempotencyKey: key ?? `auto-${hand.id}-${hand.revision}`,
  };
}

// 命令面用的下划线形状。命令面参数是 snake_case，编排层是 camelCase，
// 两边各有一套是既有约定，这里不改它，只各给一个出口。
function actionBindingParams(orchestrator, { key } = {}) {
  const bound = actionBinding(orchestrator, { key });
  return {
    hand_id: bound.handId,
    expected_revision: bound.expectedRevision,
    idempotency_key: bound.idempotencyKey,
  };
}

// 只从投影形成绑定，一步也不碰编排层。命令面与 HTTP 的测试刻意不持有内核引用——
// 「命令面本身够不够用」才是它们要测的东西——而这个出口顺带钉住一条真实约束：
// 投影必须自己就带 hand_id 与 revision，否则任何客户端都拼不出一个合法请求。
// 入参是一份**牌局投影**（引擎的 publicProjection 形状），不是整个 projection 包装：
// view.projection 把它放在 public_hand，view.hand 把它放在 hand，两处形状相同。
// 顶层 projection.hand 只有 {id, status} 摘要，没有 revision，形不成绑定。
function actionBindingFromProjection(hand, { key } = {}) {
  if (hand === undefined || hand === null) {
    throw new Error("没有牌局投影，无法形成动作绑定");
  }
  for (const field of ["hand_id", "revision"]) {
    if (hand[field] === undefined || hand[field] === null) {
      throw new Error(`投影的 hand 缺少 ${field}，客户端无法遵守绑定契约`);
    }
  }
  return {
    hand_id: hand.hand_id,
    expected_revision: hand.revision,
    idempotency_key: key ?? `auto-${hand.hand_id}-${hand.revision}`,
  };
}

// 公开发言的绑定。只有幂等键：发言按房间记账、不带 expected_revision，
// 理由在 table-orchestrator.submitPlayerText 的注释里。
//
// 默认键把 seatId 与 text 都揉进去，因为发言没有 revision 这种天然序号。同一席说同一句话
// 两次是合法的（人确实会重复），所以真要测「说两遍」的测试必须自己传两个不同的键——
// 这正是幂等键的语义：区分「重试」与「又说了一遍」只能靠客户端自己表态。
let chatCounter = 0;
function chatBinding({ key } = {}) {
  return { idempotencyKey: key ?? `chat-${++chatCounter}` };
}

function chatBindingParams({ key } = {}) {
  return { idempotency_key: chatBinding({ key }).idempotencyKey };
}

module.exports = {
  actionBinding,
  actionBindingParams,
  actionBindingFromProjection,
  chatBinding,
  chatBindingParams,
};
