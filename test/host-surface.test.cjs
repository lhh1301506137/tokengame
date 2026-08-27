"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  AUTHORITY_DRIVEN_COMMANDS,
  DIAGNOSTIC_COMMANDS,
  HOST_COMMANDS,
  classify,
} = require("../src/authority/host-surface.cjs");
const { CommandSurface, SEAT_AUTHORIZED } = require("../src/authority/command-surface.cjs");

function coreVocabulary() {
  return new CommandSurface().commandNames();
}

// 这一条是整份文件的重点。
//
// 「三类加起来恰好等于核心词汇表」比「每条都是真命令」强得多：后者允许新增命令谁都不管，
// 前者迫使任何新命令必须被归类。而没归类的命令就是下一个分叉的入口——一个适配器发现了它、
// 另一个没有，两边能做的事从此不同。所以这条断言的作用不是查错，是让分叉在结构上做不到。
test("宿主面：三类划分恰好覆盖核心命令词汇表，无遗漏无虚构", () => {
  const core = coreVocabulary();
  const partition = [
    ...HOST_COMMANDS,
    ...AUTHORITY_DRIVEN_COMMANDS,
    ...DIAGNOSTIC_COMMANDS,
  ].sort();

  const missing = core.filter((name) => !partition.includes(name));
  assert.deepEqual(
    missing,
    [],
    `核心新增了命令但没归类，这就是下一个分叉的入口: ${JSON.stringify(missing)}`,
  );

  const invented = partition.filter((name) => !core.includes(name));
  assert.deepEqual(invented, [], `划分里有核心不存在的命令: ${JSON.stringify(invented)}`);

  assert.deepEqual(partition, core, "划分必须与核心词汇表逐条相等");
});

test("宿主面：三类互不相交", () => {
  const groups = {
    host: HOST_COMMANDS,
    authority_driven: AUTHORITY_DRIVEN_COMMANDS,
    diagnostic: DIAGNOSTIC_COMMANDS,
  };
  for (const [nameA, listA] of Object.entries(groups)) {
    assert.equal(new Set(listA).size, listA.length, `${nameA} 内部有重复项`);
    for (const [nameB, listB] of Object.entries(groups)) {
      if (nameA >= nameB) continue;
      const both = listA.filter((command) => listB.includes(command));
      assert.deepEqual(both, [], `${nameA} 与 ${nameB} 同时收录: ${JSON.stringify(both)}`);
    }
  }
});

// 规则推进不该出现在宿主面上。这不是安全断言——那几条命令本来就「只在真的到期时才动作」，
// 宿主催了也不会越权。钉住的是责任归属：due-work 已经在按真实时钟走这几步，宿主面上再留
// 一份入口，就等于把「规则要靠有人在场才前进」写回来一次。
test("宿主面：规则推进命令不在宿主面上，由核心自己按时钟走", () => {
  for (const command of ["hand.start_if_due", "hand.settle_expired", "hand.evaluate_start", "hand.apply_pending_fold"]) {
    assert.equal(classify(command), "authority_driven", `${command} 应归权威自驱`);
    assert.ok(!HOST_COMMANDS.includes(command), `${command} 不该出现在宿主面上`);
  }
});

// 原始权威日志绕过规则 7：本地隐藏只改该查看者的渲染、不写权威事件，所以只有
// view.timeline 会把隐藏项按查看者标出来。适配器照原始事件渲染，用户按下的「隐藏这个人」
// 就静默失效了。
test("宿主面：原始事件日志不在宿主面上，公开渲染只走 view.timeline", () => {
  for (const command of ["view.room_events", "view.ai_events"]) {
    assert.equal(classify(command), "diagnostic");
    assert.ok(!HOST_COMMANDS.includes(command), `${command} 不该出现在宿主面上`);
  }
  assert.ok(HOST_COMMANDS.includes("view.timeline"), "宿主必须有一条按查看者过滤的公开渲染入口");
});

// 玩家在宿主里能做的事必须都在。少一条就是「这个宿主玩不了完整的牌」，而章程要求各宿主
// 通往同一套房间、座位与恢复含义。
test("宿主面：一次完整游玩所需的命令一条都不缺", () => {
  const required = [
    "room.create", "room.join", "room.confirm_public_scope", "seat.recover",
    "seat.connect", "seat.disconnect", "seat.ready", "seat.leave", "seat.sit_out_after_hand",
    "hand.act", "hand.reveal",
    "chat.say",
    "ai.take_intents", "ai.start", "ai.resolve", "ai.set_mode", "ai.hide_local",
    "view.projection", "view.timeline", "view.hand", "view.seat",
  ];
  for (const command of required) {
    assert.ok(HOST_COMMANDS.includes(command), `宿主面缺少 ${command}，该宿主玩不了完整的牌`);
  }
});

// 每条需要凭据的命令都必须是宿主发得出去的，否则凭据门禁就成了死路：核心要凭据，
// 而适配器根本没有那条命令可用。
test("宿主面：所有需凭据命令都在宿主面上", () => {
  for (const command of SEAT_AUTHORIZED) {
    assert.ok(
      HOST_COMMANDS.includes(command),
      `${command} 要凭据却不在宿主面上，适配器无法使用`,
    );
  }
});

test("宿主面：未知命令归 unknown，不默认放行", () => {
  assert.equal(classify("hand.deal_myself_aces"), "unknown");
  assert.equal(classify(""), "unknown");
  assert.equal(classify(undefined), "unknown");
});

test("宿主面：三份清单都是冻结的", () => {
  for (const list of [HOST_COMMANDS, AUTHORITY_DRIVEN_COMMANDS, DIAGNOSTIC_COMMANDS]) {
    assert.ok(Object.isFrozen(list));
    assert.throws(() => list.push("hand.start_if_due"));
  }
});
