"use strict";

// 到期判定不能取决于驱动跑没跑。
//
// 到期驱动自称「不做任何判定」（due-work.cjs 第一条自我约束），但它实际上做了一个：
// 每条期限目前只在 tick() 里被检查，而 tick 每 250 毫秒一次。于是同一个请求，落在
// tick 之前还是之后，结果不一样：
//
//   - 租约过期 10 毫秒的 ai.resolve，抢在 tick 前到达就**发布**，晚到就按
//     turn_reclaimed 丢弃。同样的输入，公开时间线不同——而公开时间线是验收证据面。
//   - 行动时限过了 10 毫秒的 hand.act，抢在 tick 前到达就被当成正常行动接受，
//     规则 2 承诺的「截止时自动 check 或 fold」被绕过。
//   - 保留窗过期 10 毫秒的 seat.recover，抢在 tick 前到达就恢复成功，凭据活过了
//     它自己的窗口。
//
// 更要紧的是宽限期的长度是**宿主选项**：dueWorkIntervalMs 由建服务的一方传。宿主传
// 60000 就把这三条规则的宽限期一起放宽到一分钟。宿主中立的权威核心存在的意义正是
// 「宿主配置不能改变规则结果」，所以这不是精度问题，是边界破了。
//
// 正确的分工：内核在被问到的那一刻自己判定到期，驱动只负责「没人问的时候也照样发生」。
// 也就是驱动提供活性，不提供正确性。下面每条测试都用同一个形状表达这件事：
// 同一时刻做同一件事，跑过驱动与没跑过驱动，结果必须一致。

const assert = require("node:assert/strict");
const test = require("node:test");
const { SeatAiStore, EVALUATION_LEASE_MS } = require("../src/authority/seat-ai-store.cjs");
const { RoomStore, TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { actionBinding } = require("../test-support/action-binding.cjs");
const { confirmAllSeats } = require("../test-support/public-scope.cjs");

const ACTION_TIMEOUT_MS = 30_000;

const ROOM = "room-binding-1";
const RULES = "table-rules-v1";

// F3：AI 发布点也要过该席的公开确认。产品里房间事实由编排层注入；本文件直接驱动
// SeatAiStore，就在这里注入。
function resolveVia(store, input) {
  return store.resolveEvaluation({
    ...input,
    roomBindingId: ROOM,
    tableRulesVersion: RULES,
  });
}

function aiTable(options = {}) {
  let now = 1_000;
  let id = 0;
  const store = new SeatAiStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    ...options,
  });
  // F3：确认按席位记账，所以必须先注册席位——不存在的席位没有人能替它表态。
  store.registerSeat({ seatId: "seat-1", playerId: "player-seat-1" });
  store.confirmDefaultPublicScope({
    seatId: "seat-1",
    roomBindingId: ROOM,
    tableRulesVersion: RULES,
    acknowledged: true,
  });
  return { store, advance: (ms) => (now += ms) };
}

function wake(store, eventId) {
  const intents = store.notifyDomainEvent({ type: "BET", eventId, payload: {} });
  return intents.find((intent) => intent.seat_id === "seat-1");
}

// 已创建房间、两名玩家入座、每席一条连接。与 room-store.test.cjs 的 room() 同形。
function room(playerCount = 2) {
  let now = 1_000;
  let id = 0;
  const store = new RoomStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
  });
  const created = store.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  const seats = [created.seat];
  const credentials = [created.credential];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = store.joinRoom({
      playerId: `p${index}`,
      inviteCode: created.invite.invite_code,
    });
    seats.push(joined.seat);
    credentials.push(joined.credential);
  }
  for (const seat of seats) {
    store.markConnected({ seatId: seat.seat_id, connectionId: `conn-${seat.seat_id}` });
  }
  return { store, seats, credentials, advance: (ms) => (now += ms) };
}

// 真编排层 + 三名玩家。行动窗口那几条要走完整链路：期限在牌局引擎里，而入口在编排层。
function orchestrated(playerCount = 3) {
  let now = 1_000;
  let id = 0;
  const o = new TableOrchestrator({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: () => stackedDeck([]),
    actionTimeoutMs: ACTION_TIMEOUT_MS,
  });
  const created = o.createRoom({ hostPlayerId: "p1", tableRulesVersion: RULES });
  const seats = [created.seat];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = o.joinRoom({ playerId: `p${index}`, inviteCode: created.invite.invite_code });
    seats.push(joined.seat);
  }
  // F3：确认按席位记账，只能在席位存在之后逐席确认。
  confirmAllSeats(o, seats.map((seat) => seat.seat_id));
  for (const seat of seats) {
    o.rooms.markConnected({ seatId: seat.seat_id, connectionId: `conn-${seat.seat_id}` });
  }
  return { o, seats, seatId: (index) => seats[index].seat_id, advance: (ms) => (now += ms) };
}

function begin(ctx, seatIndexes = [0, 1, 2]) {
  for (const index of seatIndexes) {
    ctx.o.setReady({ seatId: ctx.seatId(index), ready: true });
  }
  ctx.o.evaluateStart();
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.o.startHand();
}

// 把「租约已过期的回合来 resolve」跑两遍：一遍先让驱动回收，一遍不让。
function resolveAfterLease({ reclaimFirst }) {
  const t = aiTable();
  const intent = wake(t.store, "event-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  t.advance(EVALUATION_LEASE_MS + 1);
  if (reclaimFirst) t.store.reclaimExpiredEvaluations();
  return resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "迟到 1 毫秒的话",
  });
}

test("时相无关：租约过期后的 resolve，回收跑没跑都必须丢弃", () => {
  const withDriver = resolveAfterLease({ reclaimFirst: true });
  const withoutDriver = resolveAfterLease({ reclaimFirst: false });

  assert.equal(withDriver.type, "SEAT_AI_OUTPUT_DISCARDED");
  assert.equal(withDriver.payload.reason, "turn_reclaimed");

  // 这一条是缺陷本身：不跑驱动时，同一句话被发布进公开时间线。
  assert.equal(
    withoutDriver.type,
    "SEAT_AI_OUTPUT_DISCARDED",
    "租约已过期，是否发布不该取决于 tick 落在哪一边",
  );
  assert.equal(withoutDriver.payload.reason, "turn_reclaimed");
});

// 唤醒侧的同一件事。注意断言的是 accepted：notifyDomainEvent 无论如何都会给出一条
// 意图，被幽灵回合吃掉时是 {accepted:false, reason:"merged_into_pending"}，所以只断言
// 「有意图」等于什么都没测——这一条最初就是这么写的，看着绿其实是空跑。
function wakeAfterLease({ reclaimFirst }) {
  const t = aiTable();
  const intent = wake(t.store, "event-1");
  t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  t.advance(EVALUATION_LEASE_MS + 1);
  if (reclaimFirst) t.store.reclaimExpiredEvaluations();
  return wake(t.store, "event-2");
}

test("时相无关：租约过期后的唤醒，回收跑没跑都必须被接受", () => {
  const withDriver = wakeAfterLease({ reclaimFirst: true });
  const withoutDriver = wakeAfterLease({ reclaimFirst: false });

  assert.equal(withDriver.accepted, true);
  assert.equal(
    withoutDriver.accepted,
    true,
    `租约已过期，这一席能不能被唤醒不该取决于驱动跑没跑（实得 reason=${withoutDriver.reason}）`,
  );
});

// 领活 + 起回合这条链路上的同一件事。适配器崩在半路留下一个幽灵回合，租约过期之后
// 那一席必须重新领得到活、起得来回合，而这不能取决于驱动跑没跑。
//
// F5 之前这里是「带着先前取到的上下文再调一次 ai.start」，测的是 startEvaluation 自己
// 那句 reclaimSeatIfExpired。现在宿主没有自带上下文这条路了：促进与回收都收在
// claimIntents 里（它先促进、促进又先按席回收），所以走公开接口时 startEvaluation
// 面前永远不会有幽灵回合。那句 reclaim 作为回合创建点的自保留着，但这条用例不再覆盖它，
// 覆盖的是 claimIntents 这条新的惰性路径。
function claimAfterLease({ reclaimFirst }) {
  const t = aiTable();
  const intent = wake(t.store, "event-1");
  t.store.startEvaluation({ seatId: "seat-1", intentId: intent.intent_id });
  // 思考期内到达的新事件：合并成待办，等这个回合让位。
  const merged = wake(t.store, "event-2");
  if (merged.accepted !== false || merged.reason !== "merged_into_pending") {
    return `前置条件不成立: ${JSON.stringify(merged)}`;
  }
  t.advance(EVALUATION_LEASE_MS + 1);
  if (reclaimFirst) t.store.reclaimExpiredEvaluations();
  const [work] = t.store.claimIntents({ seatId: "seat-1" });
  if (work === undefined) return "no_work_available";
  if (work.context.source_event_id !== "event-2") return `wrong_context: ${work.context.source_event_id}`;
  try {
    return t.store.startEvaluation({ seatId: "seat-1", intentId: work.intent_id }).type;
  } catch (error) {
    return error.code ?? "unexpected";
  }
}

test("时相无关：租约过期后重新领活并起回合，回收跑没跑都必须放行", () => {
  assert.equal(claimAfterLease({ reclaimFirst: true }), "SEAT_AI_EVALUATION_STARTED");
  assert.equal(
    claimAfterLease({ reclaimFirst: false }),
    "SEAT_AI_EVALUATION_STARTED",
    "租约已过期，幽灵回合不该还挡着这一席重新说话，而这不能取决于驱动跑没跑",
  );
});

// 冷却是对照组：它同样从 now() 流出来，但它**应该**在被问到时才算，而且本来就是这样。
// 没有这一条，上面两条可能是「凡是时钟相关的都提前结算」的巧合，而不是「判定必须与
// 驱动时相无关」。冷却未满时唤醒被拒，是规则 3 要的结果，不是缺陷。
test("时相无关：冷却未满时被拒，与驱动无关（对照组）", () => {
  const t = aiTable();
  const first = wake(t.store, "event-1");
  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: first.intent_id });
  resolveVia(t.store, {
    seatId: "seat-1",
    turnId: started.payload.turn_id,
    decision: "public_speech",
    text: "先说一句",
  });

  t.advance(1_000);
  const soon = wake(t.store, "event-2");
  assert.equal(soon.accepted, false);
  assert.equal(soon.reason, "cooldown");

  t.store.reclaimExpiredEvaluations();
  const stillSoon = wake(t.store, "event-3");
  assert.equal(stillSoon.accepted, false, "跑一趟回收不该让冷却提前结束");
  assert.equal(stillSoon.reason, "cooldown");
});

// ---- 规则 2：掉线保留窗 ----

// 这个模式在 room-store 里本来就有：evaluateStart() 和 roomState() 都先调
// releaseExpiredSeats() 再回答。也就是说「被问到时先结算到期」不是我发明的写法，
// 项目里已经立过这个规矩——只是 recoverSeat 漏了，而它恰好是最要紧的那个入口：
// 凭据能不能用，本该只取决于窗口在不在。
function recoverAfterRetention({ releaseFirst }) {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  ctx.advance(TABLE_LIFECYCLE_V1.recoveryRetentionMs + 1);
  if (releaseFirst) ctx.store.releaseExpiredSeats();
  try {
    ctx.store.recoverSeat({ seatId, recoveryCredential: ctx.credentials[0] });
    return "recovered";
  } catch (error) {
    return error instanceof ProbeError ? error.code : "unexpected";
  }
}

test("时相无关：保留窗过期后的 recover，释放跑没跑都必须失败", () => {
  assert.equal(recoverAfterRetention({ releaseFirst: true }), "seat_released");
  assert.equal(
    recoverAfterRetention({ releaseFirst: false }),
    "seat_released",
    "保留窗已过期，凭据还能不能用不该取决于释放那一步跑没跑",
  );
});

// ---- 规则 2：行动时限 ----

// 这一条与上面两条形状相同，但修法不同，值得说清。
//
// 前两处能把判定收进单席 helper，让驱动和各入口共用一个谓词。行动窗口不行：如果在
// act() 里先结算超时，结算产生的意图（drainEngine 的返回值）会在拒绝路径上被丢掉——
// 而意图丢了就是一次永久丢失的 AI 唤醒，因为 consumed_source_events 已经记账。所以
// 这里是拒绝迟到行动，自动 check/fold 仍由驱动那一步做：正确性就地判定，活性归驱动。
function actAfterDeadline({ settleFirst }) {
  const ctx = orchestrated();
  begin(ctx);
  const hand = ctx.o.requireHand();
  const actorId = hand.seats[hand.actorIndex].id;
  ctx.advance(ACTION_TIMEOUT_MS + 1);
  if (settleFirst) ctx.o.settleExpiredAction();
  try {
    // 绑定必须在 settleFirst 之后才形成：自动行动推进了 revision，用先前的快照会让
    // 幂等门先答出 revision_conflict，两种情形就都测不到本条要测的东西了。
    ctx.o.act({ playerId: actorId, type: "fold", ...actionBinding(ctx.o) });
    return "acted";
  } catch (error) {
    return error.code ?? "unexpected";
  }
}

test("时相无关：行动时限过后本人的行动，结算跑没跑都必须被拒", () => {
  const withDriver = actAfterDeadline({ settleFirst: true });
  const withoutDriver = actAfterDeadline({ settleFirst: false });

  // 结算跑过了：这一席已被代为行动，轮次已经走开，引擎按非法行动拒绝。
  assert.notEqual(withDriver, "acted", `结算后本人仍能行动（实得 ${withDriver}）`);
  // 没跑结算：必须由现场判定拒掉，而不是照常生效。
  assert.equal(
    withoutDriver,
    "action_deadline_expired",
    "时限已过，本人的行动还能不能生效不该取决于结算那一步跑没跑",
  );
});

test("时相无关：时限内的行动照常生效（对照组）", () => {
  const ctx = orchestrated();
  begin(ctx);
  const hand = ctx.o.requireHand();
  const actorId = hand.seats[hand.actorIndex].id;
  ctx.advance(ACTION_TIMEOUT_MS - 1);
  ctx.o.settleExpiredAction();
  // act 的返回是 resultSummary()：{accepted, hand_id, revision, status, street,
  // actor_player_id}，动作细节在 PLAYER_ACTION 事件里，不在返回值上。
  const { result } = ctx.o.act({ playerId: actorId, type: "fold", ...actionBinding(ctx.o) });
  assert.equal(result.accepted, true, "还剩 1 毫秒，跑一趟结算不该把窗口提前关掉");
  assert.notEqual(result.actor_player_id, actorId, "行动生效后轮次应当走开");
});

test("时相无关：自动行动不会拒掉自己", () => {
  const ctx = orchestrated();
  begin(ctx);
  const before = ctx.o.requireHand();
  const actorId = before.seats[before.actorIndex].id;
  ctx.advance(ACTION_TIMEOUT_MS + 1);
  // settleExpiredAction 是在到期之后调 act 完成自动行动的，拒绝迟到行动那一句必须
  // 排除 automatic，否则自动行动会拒掉自己，规则 2 承诺的自动 check/fold 从此不发生。
  const { result } = ctx.o.settleExpiredAction();
  assert.notEqual(result, null, "到期时自动行动必须发生");
  assert.equal(result.accepted, true);
  assert.notEqual(result.actor_player_id, actorId, "自动行动后轮次应当走开");
});

test("时相无关：保留窗内的 recover 照常成功（对照组）", () => {
  const ctx = room(2);
  const seatId = ctx.seats[0].seat_id;
  ctx.store.markDisconnected({ seatId, connectionId: `conn-${seatId}` });
  ctx.advance(TABLE_LIFECYCLE_V1.recoveryRetentionMs - 1);
  ctx.store.releaseExpiredSeats();
  const recovered = ctx.store.recoverSeat({ seatId, recoveryCredential: ctx.credentials[0] });
  assert.equal(recovered.state, "SEATED", "窗口还剩 1 毫秒，跑一趟释放不该把它提前关掉");
});
