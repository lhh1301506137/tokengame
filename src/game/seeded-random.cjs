"use strict";

// 可重复的随机源。只用于让测试跑出同一副牌，不改变任何授权判断。
//
// 为什么这不是后门。后门是「让某个调用方拿到它本来没有的权限或信息」。这里给出的是
// 洗牌的随机数来源，而洗牌结果本身谁都看不见：底牌可见性由权威的 view.hand 按席位裁决，
// 与牌是怎么洗出来的无关。种子不放宽任何一条命令的授权，也不多给任何一个人一张牌的可见性。
//
// 真正的风险是另一件事：把种子带进真实对局。那时牌序可以预测，而这对德扑是致命的。
// 所以入口那一侧有三道约束（见 src/run-table-web.cjs）：只在自带内核时读、
// 只允许回环监听、启动时必须如实报告。风险在「谁能开」，不在「能不能开」。
//
// 算法用 sfc32：四个 uint32 状态、只有加减位移，没有依赖，跨 Node 版本结果一致。
// 不用 Math.random 加种子——它本来就不接受种子；也不用 crypto，那是不可重复的正主。

const { HoldemRuleError, shuffledDeck } = require("./holdem.cjs");

// 字符串种子摊成四个 uint32。
//
// 用 FNV-1a 的四个不同起点，而不是同一个哈希切四段：切段的话四个状态高度相关，
// sfc32 前几十个输出会有可见规律，而前几十个输出正好决定前两手的牌。
function seedToState(seed) {
  const text = String(seed);
  const offsets = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9];
  return offsets.map((offset) => {
    let hash = offset >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    // 再搅一轮，避免短种子（"1"、"2"）之间只差几位。
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2545f491) >>> 0;
    hash ^= hash >>> 13;
    return hash >>> 0;
  });
}

// sfc32。返回一个每次给出新 uint32 的函数。
function sfc32(seed) {
  let [a, b, c, d] = seedToState(seed);
  // 丢掉前 12 个输出。刚初始化的状态相关性还没散开，而散开之前的输出决定的正是第一手。
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  for (let index = 0; index < 12; index += 1) next();
  return next;
}

// 与 crypto.randomInt(maximum) 同形：返回 [0, maximum) 的整数。
//
// 用拒绝采样，不用取模。取模会让小的余数比大的更常出现，而洗牌调 51 次，
// 偏差会累积成可见的牌序倾向——一副「随机」但系统性偏斜的牌比固定牌序更难发现。
function seededRandomInt(seed) {
  const next = sfc32(seed);
  return (maximum) => {
    if (!Number.isInteger(maximum) || maximum <= 0) {
      throw new HoldemRuleError("invalid_random_bound", 500, { maximum });
    }
    // 2^32 里能被 maximum 整除的最大段。落在段外的样本丢掉重取。
    const limit = Math.floor(0x1_0000_0000 / maximum) * maximum;
    for (;;) {
      const value = next();
      if (value < limit) return value % maximum;
    }
  };
}

// 一个跨手连续的牌堆工厂。
//
// 为什么这件事要单独有个函数：每手发牌各调一次 deckFactory，而随机源必须跨手连续。
// 每手都从种子重建的话，每一手都发同一副牌——那不是确定性，那是复读。这个区别在入口
// 那一行代码里是「立即执行的闭包」与「不立即执行」之差，肉眼极难看出，而入口不导出
// 任何东西，于是它在单元层原本没有落脚点。放在这里就有了。
function seededDeckFactory(seed) {
  const randomInt = seededRandomInt(seed);
  return () => shuffledDeck(randomInt);
}

module.exports = { seededRandomInt, seededDeckFactory, sfc32, seedToState };
