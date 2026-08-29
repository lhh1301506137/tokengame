"use strict";

// 插件入口文案的边界声明。
//
// 为什么要测一段文案：`plugin.json` 的 longDescription 是用户在装插件之前**唯一**看到的
// 说明，而它此前写着「牌局行动仍由独立四人 Web 牌桌裁决」。那句话把裁决权说反了——
// 裁决在宿主中立的权威内核，Web 牌桌只是真人操作它的界面之一。
//
// 说反的后果不是措辞难看。读者据此会以为「换一个界面就换了一个裁决者」，
// 于是「两个宿主是不是同一场牌局」这个问题的答案在文案里是错的；而那正是 L2 章程
// 点名要防的「不同房间命名空间或独立玩家身份」。
//
// 这个文件此前不存在，所以这段文案从来没有任何检查看着它。装机文案和代码边界一样，
// 说错了就是承诺错了。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ENTRY = path.join(__dirname, "..", "plugins", "tokengame", ".codex-plugin", "plugin.json");

function entry() {
  return JSON.parse(fs.readFileSync(ENTRY, "utf8"));
}

test("入口文案存在且是合法 JSON", () => {
  const manifest = entry();
  assert.equal(typeof manifest.interface?.longDescription, "string");
  assert.ok(manifest.interface.longDescription.length > 0);
});

test("入口文案不把裁决权交给 Web 牌桌", () => {
  // 只禁这一个具体说法，不做宽泛的关键词扫描：宽扫会连带禁掉正确表述里的「Web 牌桌」，
  // 而那个词本身是对的——它确实是一个界面。
  const text = entry().interface.longDescription;
  for (const wrong of [
    "牌局行动仍由独立四人 Web 牌桌裁决",
    "由 Web 牌桌裁决",
    "Web 牌桌裁决",
  ]) {
    assert.equal(text.includes(wrong), false, `入口文案里仍有「${wrong}」`);
  }
});

test("入口文案说明裁决者是权威内核，牌桌是界面", () => {
  // 反方向。只禁错的说法不够：删掉那半句、什么都不说也能过上面那条，
  // 而「没说」在装机页上和「说错了」几乎一样——用户仍然不知道谁在裁决。
  const text = entry().interface.longDescription;
  assert.match(text, /权威内核/, "没有点明裁决者是权威内核");
  assert.match(text, /宿主中立/, "没有点明权威内核是宿主中立的");
  assert.match(text, /界面|UI/, "没有说明 Web 牌桌的角色是界面");
});

test("入口文案点明下注与亮牌是真人的决定", () => {
  // 这四条是模型面发不出去的命令。入口文案是唯一在安装前说明这条边界的地方，
  // 而「AI 能不能替我下注」正是用户装之前会问的问题。
  const text = entry().interface.longDescription;
  for (const word of ["下注", "Ready", "公开范围", "亮牌"]) {
    assert.ok(text.includes(word), `入口文案没提到「${word}」`);
  }
  assert.match(text, /真人的决定/, "没说明这些是真人的决定");
  // 硬的那一半：模型面**发不出**这些命令。
  //
  // 单独断言，因为把这半句软化成「通常由真人操作」既不删词也不说反，语气上还挑不出错，
  // 但它把一道硬边界写成了一个习惯做法——「通常」意味着存在例外，而这里没有例外。
  // 变异 soften-human-decision 正是从这个缺口活着出去的。
  assert.match(text, /发不出|无法发出|不能发出/,
    "没说明模型面发不出这些命令——只说「由真人操作」会被读成一个习惯做法");
  // 「通常」「一般」这类限定词在这句话里就是错的。
  for (const hedge of ["通常由真人", "一般由真人", "默认由真人"]) {
    assert.equal(text.includes(hedge), false, `这道边界被写成了习惯做法：「${hedge}」`);
  }
});

test("入口文案不声明任何主动唤醒能力", () => {
  // Gate 5 未验证。装机页上声明一个未验证的能力，比在报告里声明更糟——
  // 报告有 unverifiable 数组承载它，装机页没有。
  const manifest = entry();
  const serialized = JSON.stringify(manifest);
  for (const claim of ["proactive_wake", "主动唤醒", "自动唤醒"]) {
    assert.equal(serialized.includes(claim), false, `入口清单里声明了「${claim}」`);
  }
  assert.deepEqual(manifest.interface.capabilities, [],
    "capabilities 不为空时，每一项都要能对上已验证的门禁");
});
