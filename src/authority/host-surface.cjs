"use strict";

// 宿主适配器可以发哪些命令。
//
// 存在的理由是 L2-SESSION-LAUNCH 章程点名的那种失败：「为每个宿主做一个看似能启动游戏
// 的入口，但它们使用不同房间命名空间或独立玩家身份」。防止这件事的办法不是叮嘱，而是
// 让两个适配器只有一份词汇表可用——Codex 适配器和 Claude 适配器都 require 这里。
//
// 章程同时写明「不把席位凭据的字段、存储目录、MCP 接口、URL 形式或具体页面布局冻结为
// 产品语义」，所以这份划分是工程判断，不是受保护语义，可以随实现演进。
//
// 三分而不是二分，因为被排除的两类理由完全不同，混在一起会让人以为都是安全边界。

// 适配器可以发的命令。玩家在宿主里的每个动作最终都落到这一组里。
const HOST_COMMANDS = Object.freeze([
  // 会话与入房：章程要求的「创建或加入邀请房、座位归属、中断后回到原座位」。
  "room.create",
  "room.confirm_public_scope",
  "room.join",
  "seat.recover",
  // 席位在场状态。
  "seat.connect",
  "seat.disconnect",
  "seat.ready",
  "seat.sit_out_after_hand",
  "seat.leave",
  // 牌局里玩家自己做的决定。只有这两条：下注动作，以及无人跟注时自愿亮牌。
  "hand.act",
  "hand.reveal",
  // 说话。
  "chat.say",
  // 该席 AI 的参赛：取意图 -> 适配器自己调模型 -> 回填。命令面不出网，模型只在宿主侧。
  "ai.take_intents",
  "ai.start",
  "ai.resolve",
  "ai.set_mode",
  "ai.hide_local",
  // 看牌桌。view.hand 是唯一吐底牌的出口，凭据把关。
  "view.projection",
  "view.timeline",
  "view.hand",
  "view.seat",
]);

// 权威自己推进的命令。排除它们不是安全边界——这几条本来就「谁都可以催，因为只在真的到期
// 时才动作」。排除的是责任：due-work.cjs 已经在按真实时钟走这三步了，宿主再去轮询就等于
// 把「规则要靠有人在场才前进」这件事又写回来一次，而那正是驱动存在要否定的东西。
//
// hand.apply_pending_fold 同理：引擎 drain 时会自动补上离桌席位的弃牌，宿主不必介入。
//
// ai.reclaim_expired 也归这里，而且理由最直接：它要修的正是「适配器死了」这件事。
// 一个死掉的适配器不可能自己来催回收，所以把它放进宿主面等于把解药交给病人。
const AUTHORITY_DRIVEN_COMMANDS = Object.freeze([
  "hand.evaluate_start",
  "hand.start_if_due",
  "hand.settle_expired",
  "hand.apply_pending_fold",
  "ai.reclaim_expired",
]);

// 诊断用的原始权威日志。不给适配器，因为它们绕过规则 7：本地隐藏只改该查看者的渲染、
// 不写权威事件，所以只有 view.timeline 会按查看者把隐藏项标出来。适配器照原始事件渲染，
// 用户自己按下的「隐藏这个人」就会静默失效。房间与连接状态走 view.projection / view.seat，
// 不需要原始日志。
//
// 这两条也确实不含秘密：凭据与邀请码从不进入任何 record() 的 payload，验证留在铸造方。
const DIAGNOSTIC_COMMANDS = Object.freeze([
  "view.room_events",
  "view.ai_events",
]);

function classify(command) {
  if (HOST_COMMANDS.includes(command)) return "host";
  if (AUTHORITY_DRIVEN_COMMANDS.includes(command)) return "authority_driven";
  if (DIAGNOSTIC_COMMANDS.includes(command)) return "diagnostic";
  return "unknown";
}

module.exports = {
  AUTHORITY_DRIVEN_COMMANDS,
  DIAGNOSTIC_COMMANDS,
  HOST_COMMANDS,
  classify,
};
