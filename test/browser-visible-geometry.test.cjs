"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { clippedBubbleRect, bubbleGeometry } = require("../test-support/browser-visible-geometry.cjs");
const rect = (x, y, w, h) => ({ x, y, w, h, right: x + w, bottom: y + h });
const refs = { boardArea: rect(300, 0, 100, 80), pot: rect(320, 10, 50, 20), actions: rect(0, 110, 400, 80) };
const bubble = (overrides = {}) => ({ seatId: "a", rect: rect(0, 30, 100, 50), clips: [], rendered: true, ...overrides });

test("滚动区裁掉的部分不算遮挡，仍有可读部分", () => {
  const measured = bubbleGeometry([bubble({ rect: rect(0, 30, 100, 130),
    clips: [{ x: false, y: true, rect: rect(0, 0, 200, 90) }] })], refs);
  assert.equal(measured.overlapActions, 0);
  assert.equal(measured.readable, true);
  assert.equal(measured.bubbleCount, 1);
});

test("可见部分真的盖住按钮，仍然报重叠", () => {
  const measured = bubbleGeometry([bubble({ rect: rect(0, 90, 100, 80),
    clips: [{ x: false, y: true, rect: rect(0, 0, 200, 140) }] })], refs);
  assert.equal(measured.overlapActions, 3000);
  assert.equal(measured.readable, true);
});

test("overflow visible 祖先不产生裁剪，不能凭容器边界藏掉真实遮挡", () => {
  const measured = bubbleGeometry([bubble({ rect: rect(0, 90, 100, 80),
    clips: [{ x: false, y: false, rect: rect(0, 0, 200, 90) }] })], refs);
  assert.equal(measured.overlapActions, 6000);
});

test("裁剪只作用于指定轴，多个真实祖先逐层相交", () => {
  assert.deepEqual(clippedBubbleRect(bubble({ rect: rect(-10, 10, 200, 150), clips: [
    { x: true, y: false, rect: rect(0, 0, 100, 200) },
    { x: false, y: true, rect: rect(-100, 40, 500, 50) },
  ] })), rect(0, 40, 100, 50));
});

test("全部裁掉不能把零重叠伪装成通过", () => {
  const measured = bubbleGeometry([bubble({ clips: [{ x: true, y: true, rect: rect(200, 200, 10, 10) }] })], refs);
  assert.equal(measured.overlapActions, 0);
  assert.equal(measured.visibleCount, 0);
  assert.equal(measured.readable, false);
  assert.equal(measured.bubbleCount, 1, "不从原始数据条数里删除已裁剪节点");
});

test("空气泡、压成细线、隐藏一席都不能通过可读性", () => {
  assert.equal(bubbleGeometry([], refs).readable, false);
  assert.equal(bubbleGeometry([bubble({ rect: rect(0, 0, 100, 2) })], refs).readable, false);
  assert.equal(bubbleGeometry([bubble(), bubble({ seatId: "b", rendered: false })], refs).readable, false);
});

test("一个座位的后续气泡可滚动裁剪，但每席至少一条能读", () => {
  const measured = bubbleGeometry([bubble(), bubble({ rect: rect(0, 100, 100, 80),
    clips: [{ x: false, y: true, rect: rect(0, 0, 200, 85) }] }), bubble({ seatId: "b", rect: rect(110, 30, 100, 50) })], refs);
  assert.equal(measured.bubbleCount, 3);
  assert.equal(measured.visibleCount, 2);
  assert.equal(measured.readableSeats, 2);
  assert.equal(measured.readable, true);
});

test("真实盖住公牌或底池也会失败，不只检查行动栏", () => {
  const measured = bubbleGeometry([bubble({ rect: rect(310, 0, 100, 70) })], refs);
  assert.ok(measured.overlapBoard > 0);
  assert.ok(measured.overlapPot > 0);
});

test("浏览器使用真实 overflow 祖先与可见可读性，退出样本来自新已接受发言", () => {
  const source = fs.readFileSync(path.join(__dirname, "../test-support/table-web-acceptance.mjs"), "utf8");
  assert.match(source, /bubbleGeometry\(measurements\.bubbles, measurements\.refs\)/);
  assert.match(source, /getComputedStyle\(ancestor\)/);
  assert.match(source, /style\.overflowX/);
  assert.match(source, /style\.overflowY/);
  assert.match(source, /geometry\.readable/);
  const sampler = source.slice(source.indexOf('async function sendSpeechSample('), source.indexOf('// 截图连同一个状态指纹'));
  assert.match(sampler, /waitForResponse/);
  assert.match(sampler, /request\.params\?\.text === text/);
  assert.match(sampler, /response\.status\(\) === 200 && body\.ok === true/);
  const geometry = source.slice(source.indexOf('// ---- 6c.'), source.indexOf('// ---- 6d.'));
  const sampleAt = geometry.indexOf('await sendSpeechSample(');
  const measureAt = geometry.indexOf('const measurements =');
  const shotAt = geometry.indexOf('await shot(');
  assert.ok(sampleAt >= 0 && measureAt > sampleAt && shotAt > measureAt,
    "每视口先生成新样本并测量，最后才做昂贵截图");
  assert.match(geometry, /window\.scrollTo\(0, 0\)/);
  assert.match(geometry, /measurements\.bubbles\.some\(\(bubble\) => bubble\.isSample\)/);
  const expiry = source.slice(source.indexOf('// ---- 6d.'), source.indexOf('// ---- 7.'));
  assert.match(expiry, /await sendSpeechSample\(alice, expiryText,/);
  assert.match(expiry, /expiryAcceptedAt/);
});
