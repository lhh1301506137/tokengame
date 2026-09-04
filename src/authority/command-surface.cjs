"use strict";

// 宿主中立命令面：两个宿主适配器共用的唯一调用词表。
//
//   Codex 宿主   MCP 工具 + HTTP 路由  ->  dispatch(command, params)
//   Claude 宿主  MCP App UI            ->  dispatch(command, params)
//
// 存在的理由与编排层相同：如果两个适配器各自直接调编排层，它们会各自发明一套命令名、
// 各自决定哪些参数必填、各自决定错误怎么回。三个月后就是两个 TokenGame。
//
// 三条自我约束：
//   1. 不新增产品语义。每条命令都是编排层某个方法的薄封装，判定权在内核。
//   2. 不发明第二套错误约定。失败一律抛 ProbeError，适配器自己映射到 HTTP / MCP。
//   3. 不返回任何凭据。凭据只在 room.create / room.join / seat.recover 的返回里出现
//      一次，此后任何投影、任何事件、任何错误详情都不得再出现。
//
// 注意 SC-TG-L2-SESSION-LAUNCH-20260827-B 明确把「MCP 接口形态与 URL 形式」排除在
// 受保护产品语义之外。所以下面的命令名是工程选择，不是合同锁定项，Codex 归队后可改名；
// 但改名要一次改完，不能让两个适配器各用一半。

const { ProbeError } = require("./event-store.cjs");
const { TableOrchestrator } = require("./table-orchestrator.cjs");

// 需要凭据授权的命令：任何会改变某一席位状态或以该席位名义说话的操作。
// 只读投影不在其中；创建与加入房间此时还没有凭据可验。
const SEAT_AUTHORIZED = Object.freeze([
  // F3：默认公开确认是隐私同意，只有该席的人能替自己接受。不验凭据就等于谁都能
  // 替全桌承诺「你打的自由文本默认公开」，而被代为承诺的人从未见过这句话。
  "room.confirm_public_scope",
  "seat.ready",
  "seat.refill_test_chips",
  "seat.sit_out_after_hand",
  "seat.leave",
  // F4：connect 与 disconnect 必须成对把关。原来只有 disconnect 在这里，于是只持传输
  // 令牌的调用者能为任意席位建连——而 markConnected 会把 retention_expires_at 清成 null。
  // 后果不是多一条假在线记录，而是被顶住的席位永远走不到 releaseExpiredSeats：位子不还，
  // 桌子也凑不齐下一手。一个能被外人无限续期的保留窗等于没有保留窗。
  "seat.connect",
  "seat.disconnect",
  "chat.say",
  "ai.set_mode",
  "ai.hide_local",
  // AI 回填三件套。双宿主部署里两个适配器都持有传输令牌才能通信，所以传输令牌区分不了
  // 它们；把关只能落在席位凭据上。ai.resolve 带 public_speech 就是「以该席 AI 的名义
  // 公开发言」——真人版的 chat.say 一直要凭据，AI 版不要就是冒名洞。
  // ai.take_intents 是领取（claim）：不按席位把关，先轮询的一方会把另一方的工作项
  // 全领走，让对面那些席的 AI 在整个租约期内静默。租约到期会放回去，所以不再是永久
  // 静默——但「等 30 秒才轮到你」和「不该被你碰到」是两件事，闸门照旧要有。
  "ai.take_intents",
  "ai.start",
  "ai.resolve",
  // 需要凭据的独立私有读取命令。ai.start 也会在其私有上下文里投影本席底牌。
  // 不验证就等于谁都能拿别人的 seat_id 读走对手底牌，而「隐藏信息边界」是 L0 定义的
  // 产品核心。公开信息走 view.projection，不需要凭据。
  "view.hand",
]);

// hand.act 与 hand.reveal 不在上面那个集合里：它们要 requireSeatCredential 的返回值
// （seat 对象）去推 playerId，所以把关写在各自 handler 的第一行。
//
// 「哪些命令需要席位凭据」这个问题宿主适配器也要问（F6 的托管层要决定往哪注入），但那份
// 清单在 host-surface.cjs 里，不从这里导出：适配器 require 本文件就会把整个命令面连带
// 牌桌状态一起装进宿主进程，而那正是 mcp-table-surface 那条源码断言要挡的事。
// 两份清单由 test/seat-authorization.test.cjs 的行为探测同时钉住。

function requiredString(value, field, max = 256) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new ProbeError("invalid_field", 400, { field });
  }
  return value;
}

class CommandSurface {
  constructor(options = {}) {
    this.orchestrator = options.orchestrator instanceof TableOrchestrator
      ? options.orchestrator
      : new TableOrchestrator(options);
    this.handlers = this.buildHandlers();
  }

  commandNames() {
    return Object.keys(this.handlers).sort();
  }

  dispatch(command, params = {}) {
    const name = requiredString(command, "command", 64);
    const handler = this.handlers[name];
    if (handler === undefined) {
      throw new ProbeError("unknown_command", 404, {
        command: name,
        known_commands: this.commandNames(),
      });
    }
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw new ProbeError("invalid_field", 400, { field: "params" });
    }
    if (SEAT_AUTHORIZED.includes(name)) {
      // 私有读取/模型回路不能在到期 tick 之前偷用已经过期的席位。规则仍由 RoomStore
      // 结算，本层只在这几条认证边界主动问一次，不复制保留窗的时间判断。
      if (["ai.take_intents", "ai.start", "ai.resolve", "view.hand"].includes(name)) {
        this.orchestrator.rooms.releaseExpiredSeats();
      }
      // 凭据授权。内核在进程内可信，命令面才是信任边界：不验证就等于任何调用者
      // 都能让别人的席位离桌、以别人的名义公开发言。
      this.orchestrator.rooms.requireSeatCredential(
        params.seat_id,
        params.recovery_credential,
      );
    }
    return handler(params);
  }

  buildHandlers() {
    const o = this.orchestrator;
    return {
      // ------------------------------------------------------------ 房间与席位
      "room.create": (p) => {
        const created = o.createRoom({
          hostPlayerId: p.player_id,
          tableRulesVersion: p.table_rules_version,
          ...(p.max_seats === undefined ? {} : { maxSeats: p.max_seats }),
        });
        // 凭据在这里出现一次，之后任何面上都不再出现。
        return {
          room: created.room,
          invite_code: created.invite.invite_code,
          seat: created.seat,
          recovery_credential: created.credential,
        };
      },

      // 默认公开确认必须由玩家在宿主界面上明确点过，适配器不得代为承诺。
      // acknowledged 必须原样透传：在这里或编排层填 true 就让门永远自我满足。
      "room.confirm_public_scope": (p) => ({
        confirmed: o.confirmPublicScope({
          seatId: p.seat_id,
          acknowledged: p.acknowledged,
        }).payload,
      }),

      "room.join": (p) => {
        const joined = o.joinRoom({
          playerId: p.player_id,
          inviteCode: p.invite_code,
        });
        return {
          room: joined.room,
          seat: joined.seat,
          recovery_credential: joined.credential,
        };
      },

      "seat.recover": (p) => {
        const recovered = o.rooms.recoverSeat({
          seatId: p.seat_id,
          recoveryCredential: p.recovery_credential,
          ...(p.connection_id === undefined ? {} : { connectionId: p.connection_id }),
        });
        return recovered;
      },

      "seat.connect": (p) => ({
        connected: o.rooms.markConnected({
          seatId: p.seat_id,
          connectionId: p.connection_id,
        }).payload,
      }),

      "seat.disconnect": (p) => ({
        disconnected: o.rooms.markDisconnected({
          seatId: p.seat_id,
          connectionId: p.connection_id,
        }).payload,
      }),

      "seat.ready": (p) => ({
        ready: o.setReady({ seatId: p.seat_id, ready: p.ready !== false }).payload,
      }),

      "seat.refill_test_chips": (p) => ({
        refilled: o.rooms.refillTestChips({ seatId: p.seat_id }),
      }),

      "seat.sit_out_after_hand": (p) => ({
        scheduled: o.rooms.requestSitOutAfterHand({ seatId: p.seat_id }).payload,
      }),

      "seat.leave": (p) => ({ fenced: o.rooms.leaveTable({ seatId: p.seat_id }).payload }),

      // ---------------------------------------------------------------- 牌局
      "hand.evaluate_start": () => o.evaluateStart(),

      // 宿主在倒计时/手间展示到点后调用。开局门禁由 room-store 判定，这里不复判。
      "hand.start_if_due": () => {
        const outcome = o.startHandIfDue();
        return outcome.started
          ? {
            started: true,
            hand_id: outcome.hand_id,
            hand_index: outcome.hand_index,
            roster: outcome.roster,
            intent_count: outcome.intents.length,
          }
          : { started: false, decision: outcome.decision };
      },

      // 三个绑定字段必填，理由见 action-ledger.cjs 头部。本层只透传，判定在编排层，
      // 因为幂等账要记的是编排层形成的整个信封（含 intents）。
      "hand.act": (p) => {
        const seat = o.rooms.requireSeatCredential(p.seat_id, p.recovery_credential);
        const playerId = o.requirePlayerId(seat.seat_id);
        const envelope = o.act({
          playerId,
          type: p.action,
          ...(p.amount === undefined ? {} : { amount: p.amount }),
          handId: p.hand_id,
          expectedRevision: p.expected_revision,
          idempotencyKey: p.idempotency_key,
        });
        return {
          result: envelope.result,
          intent_count: envelope.intents.length,
          ...(envelope.replay === true ? { replay: true } : {}),
        };
      },

      // 回收租约到期的 AI 评估回合。同样是「谁都可以催，只在真的到期时才动作」，
      // 平时由 due-work 驱动按真实时钟调用，这条命令只为跨进程可观测与测试而存在。
      "ai.reclaim_expired": () => {
        const events = o.reclaimExpiredEvaluations();
        return { reclaimed: events.map((event) => event.payload) };
      },

      // 到期自动处置。谁都可以催，因为它只在真的到期时才动作。
      "hand.settle_expired": () => {
        const { result, intents } = o.settleExpiredAction();
        return { result, intent_count: intents.length };
      },

      // 规则 4：只有 all_others_folded 的赢家可自愿亮牌，由引擎裁决。
      // 同 hand.act 的幂等门：亮牌也是一条会推进版本号的可重放写命令。
      "hand.reveal": (p) => {
        const seat = o.rooms.requireSeatCredential(p.seat_id, p.recovery_credential);
        const playerId = o.requirePlayerId(seat.seat_id);
        return o.revealCards({
          playerId,
          handId: p.hand_id,
          expectedRevision: p.expected_revision,
          idempotencyKey: p.idempotency_key,
        });
      },

      "hand.apply_pending_fold": (p) => ({
        applied: o.applyPendingFold(requiredString(p.seat_id, "seat_id", 64)),
      }),

      // ------------------------------------------------------------ 公开交流
      // 公开发言也要幂等键。它按房间记账、不要 expected_revision，理由在
      // table-orchestrator.submitPlayerText 的注释里。
      "chat.say": (p) => {
        const result = o.submitPlayerText({
          seatId: p.seat_id,
          text: p.text,
          ...(p.channel === undefined ? {} : { channel: p.channel }),
          idempotencyKey: p.idempotency_key,
        });
        return {
          published: result.published === null ? null : result.published.payload,
          local_control: result.local_control,
          intent_count: result.evaluations.length,
          ...(result.replay === true ? { replay: true } : {}),
        };
      },

      // ---------------------------------------------------------------- AI
      // 适配器取走意图 -> 自己调模型 -> ai.start + ai.resolve 回填。
      // 命令面不调模型：它跑在权威侧，不该有出网能力。
      // 只取走本席的意图。适配器只该看见自己负责那些席的待办。
      "ai.take_intents": (p) => ({ intents: o.takeIntents({ seatId: p.seat_id }) }),

      // 只收权威生成的 intent_id（F5 要求 2）。
      //
      // 以前这里透传适配器回传的 p.context。source_event_id 是「这句公开话术因何而起」的
      // 唯一审计依据，让被审计方填等于没有审计：宿主可以把任何一句话挂到任何一个事件上，
      // 也可以挂到一个根本没发生过的事件上。现在上下文只从权威队列里取。
      // claim_token 透传：世代围栏由权威判定，命令面只负责把它带到。
      // 不在这里补默认值——补了就等于替一个没出示令牌的调用方冒充当前世代。
      "ai.start": (p) => {
        const started = o.startEvaluation({
          seatId: p.seat_id,
          intentId: p.intent_id,
          claimToken: p.claim_token,
        }).payload;
        return { started, model_context: o.modelContext({ seatId: p.seat_id, turnId: started.turn_id }) };
      },

      "ai.resolve": (p) => ({
        resolved: o.resolveEvaluation({
          seatId: p.seat_id,
          turnId: p.turn_id,
          decision: p.decision,
          ...(p.text === undefined ? {} : { text: p.text }),
        }).payload,
      }),

      "ai.set_mode": (p) => ({
        mode: o.setSeatAiMode({ seatId: p.seat_id, mode: p.mode }).payload,
      }),

      // 规则 7：本地隐藏只影响该查看者渲染，不写权威事件。
      "ai.hide_local": (p) => o.ai.setLocalHidden({
        viewerSeatId: p.seat_id,
        target: p.target,
        targetId: p.target_id,
        ...(p.hidden === undefined ? {} : { hidden: p.hidden }),
      }),

      // ------------------------------------------------------------ 只读投影
      "view.projection": () => o.projection(),

      "view.timeline": (p) => ({
        timeline: o.ai.publicTimeline(
          p.viewer_seat_id === undefined ? {} : { viewerSeatId: p.viewer_seat_id },
        ),
      }),

      // 私密视图。dispatch 已用 requireSeatCredential 证明调用者拥有该席，这里才敢把
      // seat_id 当 viewerId 用。牌局不存在时返回 null，不是错误——开局前问牌很正常。
      "view.hand": (p) => ({ hand: o.seatHandView(p.seat_id) }),

      "view.seat": (p) => ({
        seat: o.rooms.seatState(requiredString(p.seat_id, "seat_id", 64)),
        ai: o.ai.seatState(requiredString(p.seat_id, "seat_id", 64)),
      }),

      "view.room_events": () => ({ events: o.rooms.events.map((event) => ({ ...event })) }),

      "view.ai_events": () => ({ events: o.ai.events.map((event) => ({ ...event })) }),
    };
  }
}

module.exports = { CommandSurface, SEAT_AUTHORIZED };
