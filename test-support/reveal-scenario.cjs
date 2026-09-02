"use strict";

// 只判浏览器验收前置与观察结果，不负责发牌、计时或决定扑克规则。
// 把「本手已结束」与「暂时没同步到行动者」分开，避免等进下一手才发现亮牌窗已过。
function revealTurn(tables, handIndex) {
  if (tables.some((table) => table.handIndex > handIndex)) return { kind: "advanced" };
  if (tables.some((table) => table.handIndex === handIndex && table.handStatus === "complete")) {
    return { kind: "settled" };
  }
  if (tables.length !== 4 || tables.some((table) => table.handIndex !== handIndex)) {
    return { kind: "waiting" };
  }
  const actors = tables.map((table, index) => ({ table, index }))
    .filter(({ table }) => table.handStatus === "active" && table.myActions.length > 0);
  return actors.length === 1 ? { kind: "actor", index: actors[0].index } : { kind: "waiting" };
}

function revealPrecondition(tables, { afterHandIndex, now, minimumRemainingMs = 10_000 }) {
  const reasons = [];
  if (tables.length !== 4) reasons.push("必须读到四个隔离玩家页面");
  const handId = tables[0]?.handId;
  if (typeof handId !== "string" || handId.length === 0
      || tables.some((table) => table.handId !== handId || table.handIndex !== afterHandIndex + 1)) {
    reasons.push("四页必须是旧手之后的同一新手");
  }
  if (tables.some((table) => table.handStatus !== "active" || table.handRevision !== 1
      || table.board.length !== 0)) reasons.push("新手必须尚未消费任何行动");
  if (tables.some((table) => table.seats.length !== 4
      || new Set(table.seats.map((seat) => seat.seatId)).size !== 4
      || table.seats.some((seat) => seat.hole.length !== 2 || seat.folded || seat.tags.includes("全下")))) {
    reasons.push("必须四席都在本手、未弃牌且未全下");
  }
  const viewers = tables.flatMap((table) => table.seats.filter((seat) => seat.isViewer));
  if (viewers.length !== 4 || new Set(viewers.map((seat) => seat.seatId)).size !== 4) {
    reasons.push("四页必须分别属于四个不同席位");
  }
  const turn = revealTurn(tables, afterHandIndex + 1);
  if (turn.kind !== "actor") reasons.push("必须已有唯一行动者");
  const deadline = turn.kind === "actor" ? tables[turn.index].actionDeadlineAt : null;
  if (!Number.isFinite(now) || !Number.isFinite(deadline) || deadline - now < minimumRemainingMs) {
    reasons.push("当前行动窗口不足以开始三次手工弃牌验收");
  }
  return { ok: reasons.length === 0, reasons };
}

function revealFoldVerdict({ before, after, request, status, body }) {
  const reasons = [];
  if (request?.command !== "hand.act" || request.params?.action !== "fold"
      || request.params?.hand_id !== before.handId
      || request.params?.expected_revision !== before.handRevision) {
    reasons.push("按钮没有提交本手本版本的弃牌");
  }
  if (status !== 200 || body?.ok !== true || body.result?.replay === true) {
    reasons.push("弃牌没有被权威作为一次新动作接受");
  }
  if (after.handId !== before.handId || after.handIndex !== before.handIndex
      || after.handRevision !== before.handRevision + 1) {
    reasons.push("弃牌前后手或版本不连续，可能混入了自动行动");
  }
  const beforeFolded = before.seats.filter((seat) => seat.folded).length;
  const afterFolded = after.seats.filter((seat) => seat.folded).length;
  if (before.seats.length !== 4 || after.seats.length !== 4
      || before.seats.find((seat) => seat.isViewer)?.folded !== false
      || after.seats.find((seat) => seat.isViewer)?.folded !== true
      || afterFolded !== beforeFolded + 1) reasons.push("DOM 未见本席且仅本席新弃牌");
  return { ok: reasons.length === 0, reasons };
}

module.exports = { revealTurn, revealPrecondition, revealFoldVerdict };
