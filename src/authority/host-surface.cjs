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
  // 看牌桌。view.hand 是独立私有读取口；ai.start 的私有上下文也投影本席底牌。
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

// 需要席位凭据的命令。宿主本机协调器按这份清单决定往哪些命令注入托管的凭据（F6）。
//
// 为什么在这里而不从 command-surface.cjs 派生：适配器 require 命令面就会把整个牌桌实现
// 装进宿主进程，而「宿主不在本进程构造牌桌」是 test/mcp-table-surface.test.cjs 用源码断言
// 守着的边界。传递依赖不会触发那条字符串检查，所以它是一条能悄悄失效的防线——这份清单要么
// 放在纯字符串模块里，要么就把那条防线换成运行时检查，前者更便宜。
//
// 手写清单的风险由 test/seat-authorization.test.cjs 兜住，那里做两件事：拿真实的
// SEAT_AUTHORIZED 加两条自验命令对账（测试进程 require 命令面无所谓，它不是宿主），
// 再对每条命令发伪造凭据实测必须被拒。所以这份字面量不自证，它被行为钉住。
//
// 少一条的后果是模型被逼自己回传凭据（F6 要防的正是这个）；多一条的后果是那条命令永远
// 缺不了句柄。两种都会被上面那个测试当场抓到。
const CREDENTIAL_COMMANDS = Object.freeze([
  "ai.hide_local",
  "ai.resolve",
  "ai.set_mode",
  "ai.start",
  "ai.take_intents",
  "chat.say",
  // hand.act 与 hand.reveal 不在权威的 SEAT_AUTHORIZED 里，但一样要凭据：它们要
  // requireSeatCredential 的返回值去推 playerId，所以把关写在各自 handler 第一行。
  "hand.act",
  "hand.reveal",
  "room.confirm_public_scope",
  "seat.connect",
  "seat.disconnect",
  "seat.leave",
  "seat.ready",
  // seat.recover 的凭据不是「被验证的身份」而是「入参本身」，但对协调器没区别：它一样带
  // recovery_credential，一样必须由协调器注入。
  //
  // 曾经想把它当例外，让模型直接传凭据原文，理由是「句柄丢了要靠它重新绑定」。那个理由是
  // 错的：凭据只存在于协调器内存，协调器一重启，句柄和凭据一起没了。此时模型手上还留着一份
  // 凭据，只可能是它先前把凭据存进了上下文——正是 F6 要禁的那件事。所以那个「例外」保护的不是
  // 恢复能力，而是泄漏路径。
  //
  // 代价说清楚：协调器在保留窗内重启，该席无法恢复，120 秒后正常释放。掉线恢复要覆盖的是
  // 连接断开，协调器进程还活着，那条路径不受影响。
  "seat.recover",
  "seat.sit_out_after_hand",
  "view.hand",
]);

// 宿主面再分权：这一条是谁做的决定。
//
// 上面那个三分回答「适配器能发什么」，这个二分回答「适配器里的哪一半能发」。宿主面是
// 一份平坦清单时，hand.act 与 ai.resolve 并列其中，于是把整份清单交给模型可见的工具就
// 成了最省事的做法——而那等于让模型替玩家下注、按 Ready、代确认隐私范围、翻开底牌。
//
// 判断标准是「这个决定的后果记在谁头上」。筹码、开局时机、隐私承诺、亮牌都记在真人头上，
// 所以归真人；该席 AI 的公开发言记在那一席的 AI 头上，所以归模型。
//
// 模型面是白名单：新命令默认落到真人面。反过来（黑名单）会让每一条新命令悄悄对模型开放，
// 而漏掉一条的代价是模型获得一项没人审过的权限。

// 模型可见面。只有该席 AI 的参赛回路，加上公开读取。
//
// 这三条 AI 命令在核心侧要席位凭据（见 command-surface.cjs 的 SEAT_AUTHORIZED），所以
// 「模型面不含需凭据命令」这句是假的，别照那个方向写断言。真正成立的是更强的一句：模型
// 手里没有句柄。句柄只在 room.create / room.join 的返回里产生，而那两条在真人面上。模型
// 能出示的只有权威铸造的 intent_id / turn_id，一次性，且只有这三条命令认它。
// 席位身份的补齐在 src/host/model-command-surface.cjs。
//
// view.hand 刻意不在这里：座位 AI 在 ai.start 成功的同次权威 dispatch 才收到本席私有
// model_context；领取快照可能已经陈旧。给模型独立自取底牌的路会绕开评估回路与绑定围栏。
const MODEL_COMMANDS = Object.freeze([
  "ai.take_intents",
  "ai.start",
  "ai.resolve",
  "view.projection",
  "view.timeline",
]);

// 真人操作面。宿主面减去模型面，逐条写出而不是算出来：算出来的清单读不出「为什么这条是
// 真人的」，而下一个人要改的正是这个判断。两者相等由 test/model-command-isolation.test.cjs
// 对账。
const HUMAN_COMMANDS = Object.freeze([
  "room.create",
  "room.confirm_public_scope",
  "room.join",
  "seat.recover",
  "seat.connect",
  "seat.disconnect",
  "seat.ready",
  "seat.sit_out_after_hand",
  "seat.leave",
  "hand.act",
  "hand.reveal",
  "chat.say",
  "ai.set_mode",
  "ai.hide_local",
  "view.hand",
  "view.seat",
]);

function classify(command) {
  if (HOST_COMMANDS.includes(command)) return "host";
  if (AUTHORITY_DRIVEN_COMMANDS.includes(command)) return "authority_driven";
  if (DIAGNOSTIC_COMMANDS.includes(command)) return "diagnostic";
  return "unknown";
}

// 宿主面之外一律 "none"。不叫 "unknown"：权威自驱与诊断命令是已知的，只是不属于任何
// 一方适配器。答成 unknown 会被读作「没归类」，而没归类容易被当成「随便谁都能发」。
function classifyActor(command) {
  if (MODEL_COMMANDS.includes(command)) return "model";
  if (HUMAN_COMMANDS.includes(command)) return "human";
  return "none";
}

module.exports = {
  AUTHORITY_DRIVEN_COMMANDS,
  CREDENTIAL_COMMANDS,
  DIAGNOSTIC_COMMANDS,
  HOST_COMMANDS,
  HUMAN_COMMANDS,
  MODEL_COMMANDS,
  classify,
  classifyActor,
};
