"use strict";

// getBoundingClientRect 包括滚动区里没画出来的部分。只沿浏览器实际报告的 overflow
// 祖先裁剪，不按牌桌/按钮位置“避让”，也不把文档折叠线以下的内容一律抹掉。
function clippedBubbleRect({ rect, clips = [], rendered = true }) {
  if (!rendered || !rect || ![rect.x, rect.y, rect.right, rect.bottom].every(Number.isFinite)) return null;
  let { x, y, right, bottom } = rect;
  for (const clip of clips) {
    if (clip.x) { x = Math.max(x, clip.rect.x); right = Math.min(right, clip.rect.right); }
    if (clip.y) { y = Math.max(y, clip.rect.y); bottom = Math.min(bottom, clip.rect.bottom); }
  }
  return { x, y, right, bottom, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

function overlap(a, b) {
  if (!a || !b) return 0;
  return Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)));
}

function bubbleGeometry(bubbles, refs) {
  const visible = bubbles.map((bubble) => ({ ...bubble, visible: clippedBubbleRect(bubble) }));
  // 被裁得只剩一条线不算可读。每个有气泡的座位必须至少留下一个 40×24px 可读区。
  const readable = visible.filter((bubble) => bubble.visible?.w >= 40 && bubble.visible?.h >= 24);
  const occupiedSeats = new Set(bubbles.map((bubble) => bubble.seatId));
  const readableSeats = new Set(readable.map((bubble) => bubble.seatId));
  return {
    bubbleCount: bubbles.length,
    degenerate: bubbles.filter((bubble) => !bubble.rect || bubble.rect.w < 40 || bubble.rect.h < 10).length,
    visibleCount: visible.filter((bubble) => bubble.visible?.w > 0 && bubble.visible?.h > 0).length,
    readableCount: readable.length,
    readableSeats: readableSeats.size,
    occupiedSeats: occupiedSeats.size,
    readable: occupiedSeats.size > 0 && readableSeats.size === occupiedSeats.size,
    overlapBoard: visible.reduce((sum, bubble) => sum + overlap(bubble.visible, refs.boardArea), 0),
    overlapActions: visible.reduce((sum, bubble) => sum + overlap(bubble.visible, refs.actions), 0),
    overlapPot: visible.reduce((sum, bubble) => sum + overlap(bubble.visible, refs.pot), 0),
  };
}

module.exports = { clippedBubbleRect, bubbleGeometry };
