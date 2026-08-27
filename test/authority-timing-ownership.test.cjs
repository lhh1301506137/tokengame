"use strict";

// 权威侧每一处从时钟流出来的比较，都必须回答同一个问题：到期那一刻，权威需要「做」
// 什么吗？需要，就得有一个到期驱动步骤按时去做；不需要，就得说清为什么不需要。
//
// 刚修掉的缺陷正是这个问题没被问过：评估回合有了 lease_deadline_at，却没有任何一步
// 按时去回收，于是适配器一崩，那一席永久静默。所以不止修那一处，还要让这一类在结构上
// 做不到——新增一处时钟比较就必须归类，否则本文件失败。
//
// 为什么按污点找而不是按名字找：
// 名字启发式（含 deadline / expires / at 就算时钟）一改名就绕过去了，而且实测已经漏
// 掉两处——rolling window 的 cutoff 和规则 3 的 cooldown，两者都从 now() 流出来，
// 名字里却没有任何时钟字样。时钟进内核只有一个入口 this.now()，从它流出的才是期限，
// 所以这里追的是数据流，不是命名。
//
// 污点传播是过近似的（宁可多染，不可漏染）：多染只会要求多归类一条，漏染才会放过洞。

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "src");

// 权威核心的文件集：按 require 图从 command-server.cjs 可达的那些，外加牌局引擎。
// 刻意不含 server.cjs / table-store.cjs / event-store.cjs 的 EventStore——那是另一个
// 栈（浏览器探针栈），它的行动窗口不由到期驱动推进，也带着已验收的证据，不该被本文件
// 顺手拉进来造成「已归属」的假象。
const CORE_FILES = Object.freeze([
  "authority/command-server.cjs",
  "authority/command-surface.cjs",
  "authority/due-work.cjs",
  "authority/host-surface.cjs",
  "authority/room-store.cjs",
  "authority/seat-ai-store.cjs",
  "authority/table-orchestrator.cjs",
  "game/holdem.cjs",
]);

// 到期驱动的四步。owner 只能取这四个之一，而且下面有一条测试反过来要求 tick() 里
// 真的调了它——光在登记表里写个名字太便宜，字符串可以是任何东西。
const DRIVER_STEPS = Object.freeze([
  "settleExpiredAction",
  "releaseExpiredSeats",
  "reclaimExpiredEvaluations",
  "startHandIfDue",
]);

// 登记表。每条要么 kind:"driver"（到期必须有人做事，owner 指明是哪一步），要么
// kind:"on_demand"（到期本身没有后果，值只在有人问的时候才读，reason 说明为什么）。
//
// on_demand 不是豁免通道，是一句需要成立的断言：「这个期限过去时，桌面状态不需要
// 任何改变」。写错了就是下一个静默缺陷，所以每条都得写清理由让人能反驳。
const CLOCK_COMPARISONS = Object.freeze([
  {
    file: "authority/room-store.cjs",
    code: "if (at < this.interHandEndsAt) {",
    kind: "driver",
    owner: "startHandIfDue",
    // 手间展示窗结束就该开下一手，没人在场也一样。
  },
  {
    file: "authority/room-store.cjs",
    code: "if (at < this.countdown.ends_at) {",
    kind: "driver",
    owner: "startHandIfDue",
    // 开局倒计时归零就该发牌，这正是「玩家都不点，规则照样前进」的那条。
  },
  {
    file: "authority/room-store.cjs",
    code: "if (at >= seat.retention_expires_at) {",
    kind: "driver",
    owner: "releaseExpiredSeats",
    // 保留期满必须释放原席与恢复凭据，否则座位被永久占住。
  },
  {
    file: "authority/seat-ai-store.cjs",
    code: "if (turn.lease_deadline_at === null || at < turn.lease_deadline_at) continue;",
    kind: "driver",
    owner: "reclaimExpiredEvaluations",
    // 租约到期必须收回回合，否则崩掉的适配器把那一席永久锁在「已有回合在飞」。
  },
  {
    file: "game/holdem.cjs",
    code: "if (this.now() < this.actionDeadlineAt) return null;",
    kind: "driver",
    owner: "settleExpiredAction",
    // 行动超时必须代为过牌或弃牌，否则一个走开的玩家能无限期挂住整桌。
  },
  {
    file: "authority/room-store.cjs",
    code: "return remaining > 0 ? remaining : 0;",
    kind: "on_demand",
    reason: "倒计时剩余毫秒的下限截断，只在快照里显示；归零本身由上面的 ends_at 那条负责推进",
  },
  {
    file: "authority/seat-ai-store.cjs",
    code: "(stamp) => stamp > cutoff,",
    kind: "on_demand",
    reason: "规则 3 滚动窗口剪枝。窗口滑过去不需要发生任何事——没人发言就没什么要剪",
  },
  {
    file: "authority/seat-ai-store.cjs",
    code: "return remaining > 0 ? remaining : 0;",
    kind: "on_demand",
    reason: "冷却剩余毫秒的下限截断，只用于报给宿主显示",
  },
  {
    file: "authority/seat-ai-store.cjs",
    code: "if (seat.active_turn !== null || cooldown > 0) {",
    kind: "on_demand",
    reason:
      "规则 3 最小评估间隔的闸门，在唤醒到达时才检查。冷却期满不需要做任何事：" +
      "评估只由来源事件触发，没有事件就没有该发生的动作。且它不会永久静默一席——" +
      "下一个来源事件照样唤醒，这与租约缺陷（不可自愈）的区别正在于此",
  },
  {
    file: "authority/seat-ai-store.cjs",
    code: "if (cooldown > 0) {",
    kind: "on_demand",
    reason: "同上，startEvaluation 侧的同一道闸门",
  },
]);

// ---- 扫描器：找出操作数从 this.now() 流出来的比较 ----

function codeLines(source) {
  return source.split("\n").map((line, index) => {
    const trimmed = line.trim();
    const isComment =
      trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    return { no: index + 1, text: isComment ? "" : trimmed };
  });
}

function mentions(expr, name) {
  return new RegExp(`(^|[^\\w$.])${name}\\b|\\.${name}\\b`).test(expr);
}

// 逐文件求污点名字集的不动点。种子是 now() 调用本身，然后沿赋值一跳一跳往外染。
function taintedNames(lines) {
  const tainted = new Set();
  const hasTaint = (expr) =>
    /\bnow\s*\(\s*\)/.test(expr) || [...tainted].some((name) => mentions(expr, name));

  for (let pass = 0; pass < 8; pass += 1) {
    const before = tainted.size;
    for (const { text } of lines) {
      if (text === "") continue;
      // const at = this.now()  /  const cutoff = at - windowMs
      let m = text.match(/^(?:const|let|var)\s+([\w$]+)\s*=\s*(.+)$/);
      if (m !== null && hasTaint(m[2])) tainted.add(m[1]);
      // this.interHandEndsAt = at + ...  /  seat.retention_expires_at = at + ...
      m = text.match(/^(?:this|[\w$]+(?:\.[\w$]+)*)\.([\w$]+)\s*=\s*(.+)$/);
      if (m !== null && hasTaint(m[2])) tainted.add(m[1]);
      // 对象字面量字段：lease_deadline_at: at + this.evaluationLeaseMs,
      m = text.match(/^([\w$]+)\s*:\s*(.+?),?$/);
      if (m !== null && hasTaint(m[2])) tainted.add(m[1]);
    }
    if (tainted.size === before) break;
  }
  return tainted;
}

function scanClockComparisons() {
  const found = [];
  for (const file of CORE_FILES) {
    const lines = codeLines(fs.readFileSync(path.join(ROOT, file), "utf8"));
    const tainted = taintedNames(lines);
    const touchesClock = (expr) =>
      /\bnow\s*\(\s*\)/.test(expr) || [...tainted].some((name) => mentions(expr, name));

    for (const { no, text } of lines) {
      if (text === "") continue;
      // 去掉箭头函数与位移再看关系运算符：() => 里的 => 不是比较，把它算进来会让
      // 六个 now = () => Date.now() 构造器默认值伪装成六处到期判定。
      const stripped = text.replace(/=>/g, "").replace(/<<|>>/g, "");
      if (!/[<>]/.test(stripped)) continue;
      if (!touchesClock(text)) continue;
      found.push({ file, no, code: text.replace(/\s+/g, " ") });
    }
  }
  return found;
}

// 稳定标识：文件 + 该行源码（空白归一），不含行号——行号一动就假失败，而假失败会让人
// 把守卫当噪音删掉。刻意保留整行而不抽取表达式：改判定条件就必须重新过一遍归属。
const keyOf = (entry) => `${entry.file} :: ${entry.code}`;

// ---- 断言 ----

// 本文件的重点。「每处时钟比较都已归类」比「刚修的那处有测试」强得多：后者只覆盖已经
// 想到的那一个洞，前者迫使下一个从时钟流出来的状态一出现就得说清到期时谁做事。
test("到期：权威核心每一处时钟比较都已归类", () => {
  const found = scanClockComparisons();
  // 用多重集比较：同一文件里出现两行一模一样的比较，登记表就得写两条，
  // 否则第二处会藏在第一处的 key 后面。
  const foundKeys = found.map(keyOf).sort();
  const registeredKeys = CLOCK_COMPARISONS.map(keyOf).sort();

  const registeredSet = new Set(registeredKeys);
  const unclassified = found.filter((entry) => !registeredSet.has(keyOf(entry)));
  assert.deepEqual(
    unclassified.map((entry) => `${entry.file}:${entry.no} ${entry.code}`),
    [],
    "新增了从 now() 流出来的比较但没归类：到期那一刻要么有驱动步骤去做事，" +
      "要么写明为什么什么都不用做",
  );

  const foundSet = new Set(foundKeys);
  assert.deepEqual(
    registeredKeys.filter((key) => !foundSet.has(key)),
    [],
    "登记表里有源码中已不存在的比较，说明它过期了",
  );

  assert.deepEqual(foundKeys, registeredKeys, "登记表必须与源码逐条相等（含重复行）");
});

// 每条 driver 归属的 owner 必须真的是 tick() 会调的方法。这条把「已归属」从纸面
// 声明变成可验证的事实——删掉驱动里的一步，这里立刻失败。
test("到期：driver 归属的 owner 都是 tick() 真的会调的方法", () => {
  const source = fs.readFileSync(path.join(ROOT, "authority", "due-work.cjs"), "utf8");
  const tickBody = source.slice(source.indexOf("function tick()"), source.indexOf("return {"));
  assert.ok(tickBody.length > 100, "没能截出 tick() 函数体，本条断言会变成空跑");

  const owners = CLOCK_COMPARISONS.filter((entry) => entry.kind === "driver").map(
    (entry) => entry.owner,
  );
  assert.ok(owners.length > 0, "登记表里一条 driver 都没有，本条断言会变成空跑");
  for (const owner of new Set(owners)) {
    assert.ok(DRIVER_STEPS.includes(owner), `${owner} 不是到期驱动的四步之一`);
    assert.ok(tickBody.includes(`${owner}(`), `登记表把比较归给了 ${owner}，但 tick() 里没调它`);
  }
});

// 四步一步都不能少：删掉任一步都会让某一类期限重新变成没人问的状态，而那种失败是
// 静默的——桌子只是不动了，没有任何报错。
test("到期：四步都在，且每步都有归属它的到期状态", () => {
  const source = fs.readFileSync(path.join(ROOT, "authority", "due-work.cjs"), "utf8");
  const owned = new Set(
    CLOCK_COMPARISONS.filter((entry) => entry.kind === "driver").map((entry) => entry.owner),
  );
  assert.deepEqual([...owned].sort(), [...DRIVER_STEPS].sort(), "四步之外多了或少了一类到期状态");
  for (const step of DRIVER_STEPS) {
    assert.ok(source.includes(step), `due-work.cjs 里找不到 ${step}`);
  }
});

// 登记表本身的形状约束：kind 只有两种，driver 必须有 owner、on_demand 必须有 reason。
// reason 的真假机器验不了，那是给人反驳用的；但「必须写」是能强制的。
test("到期：登记表每条都写全了归类依据", () => {
  for (const entry of CLOCK_COMPARISONS) {
    assert.ok(CORE_FILES.includes(entry.file), `${entry.file} 不在权威核心文件集里`);
    assert.ok(["driver", "on_demand"].includes(entry.kind), `未知 kind: ${entry.kind}`);
    if (entry.kind === "driver") {
      assert.equal(typeof entry.owner, "string");
      assert.equal(entry.reason, undefined, "driver 条目不该有 reason，理由就是 owner");
    } else {
      assert.ok(
        typeof entry.reason === "string" && entry.reason.length >= 10,
        `on_demand 条目必须写明到期时为什么什么都不用做: ${keyOf(entry)}`,
      );
      assert.equal(entry.owner, undefined, "on_demand 条目不该有 owner");
    }
  }
});

// 另一个栈不该被卷进来，而且要确认它真的没被卷进来：权威核心只从 event-store 取
// ProbeError，没有碰它的 EventStore（那条路径带着已验收的证据，不由我改）。
test("到期：权威核心与探针栈没有混", () => {
  for (const file of ["authority/event-store.cjs", "authority/server.cjs", "authority/table-store.cjs"]) {
    assert.ok(!CORE_FILES.includes(file), `${file} 属于探针栈，不该在核心文件集里`);
  }
  for (const file of CORE_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!/require\("\.\/event-store\.cjs"\)/.test(source)) continue;
    assert.match(
      source,
      /const \{ ProbeError \} = require\("\.\/event-store\.cjs"\)/,
      `${file} 从 event-store 取了 ProbeError 以外的东西，两个栈开始混了`,
    );
  }
});
