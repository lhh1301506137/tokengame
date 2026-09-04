"use strict";

// classic script 无法直接 require；这里用静态可达性断言守住浏览器闭环的四个接点。
// 行为本身由 test-chip-refill-browser-acceptance.mjs 在真实 Chromium 中验证。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "web/table/index.html"), "utf8");
const client = fs.readFileSync(path.join(root, "web/table/table.js"), "utf8");

test("牌桌把补测试筹码做成独立按钮，并只服从权威投影资格", () => {
  assert.match(html, /id="refill-test-chips"/);
  assert.match(client, /const canRefill = me\.test_chip_refill_available === true;/);
  assert.match(client, /readyBtn\.disabled = me\.leave_requested === true \|\| canRefill;/);
  assert.match(client, /refillBtn\.hidden = !canRefill;/);
});

test("补筹按钮发真人命令，不把补筹与 Ready 合并", () => {
  assert.match(client, /wireControl\("refill-test-chips", \(\) => act\("seat\.refill_test_chips", \{\}\)\);/);
  const refillBinding = client.match(/wireControl\("refill-test-chips",[^\n]+/g) ?? [];
  assert.deepEqual(refillBinding, [
    'wireControl("refill-test-chips", () => act("seat.refill_test_chips", {}));',
  ]);
});
