"use strict";

// 到期驱动：让权威自己走表。
//
// 存在的理由是受保护规则 2——「截止时可 check 则自动 check，否则自动 fold」，以及
// 「自最后一个有效玩家连接消失起保留原席和恢复凭据 120 秒，随后释放」。这两条讲的都是
// 玩家**不在场**时该发生什么，所以它们不能依赖某个在场玩家来轮询触发。内核的判定本来就
// 齐了，缺的是有人按时去问。进程内测试注入时钟手动推进，看不出这个缺口；一旦搬到 HTTP
// 后面，没有客户端轮询就没有人推动截止时间，桌子会无限期挂住。
//
// 三条自我约束：
//   1. 不做任何判定。只调内核已有的方法，「到没到期」「该 check 还是 fold」全由内核决定。
//   2. 不吞真错误。settleExpiredAction 在无手时抛 no_active_hand，那是「没什么可做」；
//      其余错误一律上报，不做静默兜底。
//   3. 不持有进程。定时器 unref，测试和适配器都不会因为它退不出去。

const SETTLE_NO_WORK_CODES = Object.freeze(["no_active_hand"]);

// 默认 250 毫秒。规则 1 的倒计时是 3 秒、手间展示 3 秒，规则 2 的保留窗 120 秒，
// 行动时限 30 秒——250 毫秒对这些量级都够细，代价也可以忽略。
const DEFAULT_INTERVAL_MS = 250;

function createDueWorkDriver(options = {}) {
  const orchestrator = options.orchestrator;
  if (orchestrator === undefined || orchestrator === null) {
    throw new TypeError("createDueWorkDriver 需要 orchestrator");
  }
  const intervalMs = options.intervalMs === undefined ? DEFAULT_INTERVAL_MS : options.intervalMs;
  const onError = typeof options.onError === "function" ? options.onError : null;

  let timer = null;
  let ticks = 0;
  let lastError = null;

  // 一次到期检查。顺序即因果：先把到期的行动结算掉（可能因此结束这一手），
  // 再释放保留窗到期的席位，最后才看下一手能不能开。反过来会用上一手的席位状态开新手。
  function tick() {
    ticks += 1;
    const done = {
      settled: null,
      released: [],
      reclaimed: [],
      started: false,
      decision: null,
    };

    try {
      const expired = orchestrator.settleExpiredAction();
      if (expired.result !== null) done.settled = expired.result;
    } catch (error) {
      // 无手可结算不是故障。其余错误不吞。
      if (!SETTLE_NO_WORK_CODES.includes(error.code)) throw error;
    }

    done.released = orchestrator.rooms.releaseExpiredSeats();

    // 回收被遗弃的 AI 评估回合。适配器是独立进程，可以死在 ai.start 与 ai.resolve
    // 之间；没有这一步，那一席就永久停在「已有回合在飞」，从此不再被唤醒——而且
    // 换手也救不回来（seat-ai-store.startHand 故意不取消在途回合，它指望 resolve
    // 时按 hand_advanced 丢弃，可死掉的适配器永远不会 resolve）。
    // 必须排在 startHandIfDue 之前，这不是整洁问题：开新手会开第一个行动窗口，而
    // SEAT_ACTION_WINDOW_OPENED 是白名单唤醒源。反过来的话这次唤醒会撞在幽灵回合上
    // 被吞掉，之后再回收也追不回来，那一席得等到下一个来源事件才说得上话。
    done.reclaimed = orchestrator.reclaimExpiredEvaluations();

    const start = orchestrator.startHandIfDue();
    done.started = start.started;
    done.decision = start.decision;

    return done;
  }

  return {
    tick,
    get ticks() {
      return ticks;
    },
    get lastError() {
      return lastError;
    },
    get running() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        try {
          tick();
        } catch (error) {
          // 定时器里抛出去就是 unhandled，会掀掉整个进程。记下来并交给 onError，
          // 但不停表：一次瞬时失败不该让整张桌子从此不再走表。
          lastError = error;
          if (onError !== null) onError(error);
        }
      }, intervalMs);
      // 不让驱动成为进程退不出去的理由。
      if (typeof timer.unref === "function") timer.unref();
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { createDueWorkDriver, DEFAULT_INTERVAL_MS, SETTLE_NO_WORK_CODES };
