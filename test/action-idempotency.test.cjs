"use strict";

// F2：官方动作必须绑定 hand_id + expected_revision + idempotency_key。
//
// 缺陷形状（Codex 复核 F2）：HoldemHand.act() 只收 playerId/type/amount，命令面也不校验
// 这三个字段。于是一次丢了响应的正常重试可以替玩家执行下一街的动作——双人桌里 check
// 让街推进后仍由同一玩家先行动，重放同一个请求就被当作新街的新 check 接受了。
//
// 三个字段各挡一件不同的事，缺一个都留洞：
//   hand_id           挡「上一手的请求打到这一手」。
//   expected_revision 挡「用过期状态形成的请求在新状态上执行」，也就是跨街重放本体。
//   idempotency_key   挡「重试被当成第二个动作」。只有前两个字段时，一次真实的网络重试
//                     会被确定性拒绝，客户端反而无法判断自己那一手到底成没成。
//
// 这里不重新验证德扑裁决，只钉「同一个请求执行几次」。

const assert = require("node:assert/strict");
const test = require("node:test");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { LIVELY_V1 } = require("../src/authority/seat-ai-store.cjs");
const { confirmAllSeatsViaSurface, confirmParams } = require("../test-support/public-scope.cjs");

const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

// 固定牌堆，让每一手走同一条确定路径。
function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d", "8c", "7d",
    "2c", "3d", "4h", "5s", "6c",
    "Ac", "Kh", "Qs", "Jd", "Th", "9c", "8d", "7h",
    "2d", "3h", "4s", "5c", "6d",
    "Ah", "Ks", "Qc", "Jh", "Td", "9h", "8s", "7c",
    "2h", "3s", "4c", "5d", "6h",
  ]);
}

// silenceAi 默认为真：绝大多数用例只关心「同一个请求执行几次」，让 AI 说话只会往
// 时间线里掺进无关记录。测发言唤醒的那一条必须把它关掉，否则没有任何意图可数。
function harness({ playerCount = 2, silenceAi = true, ...options } = {}) {
  let now = 1_000;
  let id = 0;
  const surface = new CommandSurface({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
    ...options,
  });
  const o = surface.orchestrator;

  const created = surface.dispatch("room.create", {
    player_id: "p1",
    table_rules_version: RULES,
  });
  const seats = [{ seat_id: created.seat.seat_id, credential: created.recovery_credential }];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = surface.dispatch("room.join", {
      player_id: `p${index}`,
      invite_code: created.invite_code,
    });
    seats.push({ seat_id: joined.seat.seat_id, credential: joined.recovery_credential });
  }
  // F3：确认按席位记账，逐席带凭据确认。
  confirmAllSeatsViaSurface(surface, seats);
  for (const seat of seats) {
    o.rooms.markConnected({ seatId: seat.seat_id, connectionId: `conn-${seat.seat_id}` });
    if (silenceAi) o.setSeatAiMode({ seatId: seat.seat_id, mode: "OFF" });
  }

  return {
    s: surface,
    o,
    seats,
    seatOf(playerId) {
      const seatId = o.playerToSeat.get(playerId);
      return seats.find((seat) => seat.seat_id === seatId);
    },
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

function begin(ctx) {
  for (const seat of ctx.seats) {
    ctx.s.dispatch("seat.ready", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      ready: true,
    });
  }
  ctx.s.dispatch("hand.evaluate_start", {});
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.s.dispatch("hand.start_if_due", {});
}

// 当前状态快照：街、行动者、版本号。请求就是按这个快照形成的。
function snapshot(ctx) {
  const hand = ctx.o.hand;
  return {
    hand_id: hand.id,
    revision: hand.revision,
    street: hand.street,
    actor: hand.seats[hand.actorIndex].id,
  };
}

// 一个完整的官方行动请求。调用方可以覆盖任意字段来模拟重放或伪造。
function actParams(ctx, overrides = {}) {
  const snap = snapshot(ctx);
  const seat = ctx.seatOf(snap.actor);
  return {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential,
    hand_id: snap.hand_id,
    expected_revision: snap.revision,
    idempotency_key: `key-${snap.revision}`,
    action: "check",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 复现：跨街重放
// ---------------------------------------------------------------------------

test("F2：丢响应后的重放不得替玩家执行下一街的动作", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);

  // 走到「一次 check 让街推进，且推进后仍是同一玩家先行动」的那一刻。
  // 这正是 Codex 复现里的形状：重放看起来完全合法，因为演员恰好又是同一个人。
  const before = snapshot(ctx);
  ctx.s.dispatch("hand.act", actParams(ctx, { action: "call" }));
  const params = actParams(ctx);
  const first = ctx.s.dispatch("hand.act", params);
  const after = snapshot(ctx);
  assert.notEqual(after.street, before.street, "这一步应当推进街");
  assert.equal(after.actor, params.seat_id ? after.actor : null);

  // 同一个请求原样重放。它带的是上一街的 revision，必须不再执行。
  const replay = ctx.s.dispatch("hand.act", params);
  const afterReplay = snapshot(ctx);
  assert.equal(replay.replay, true, "重放必须被识别为重放");
  assert.deepEqual(replay.result, first.result, "重放必须返回原结果");
  assert.equal(
    afterReplay.revision,
    after.revision,
    "重放不得推进版本号——推进就意味着又执行了一次动作",
  );
  assert.equal(afterReplay.street, after.street, "重放不得推进街");
  assert.equal(afterReplay.actor, after.actor, "重放不得改变行动者");
});

test("F2：过期 expected_revision 被确定性拒绝，哪怕演员恰好又是同一人", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  ctx.s.dispatch("hand.act", actParams(ctx, { action: "call" }));

  const stale = snapshot(ctx);
  ctx.s.dispatch("hand.act", actParams(ctx));
  const now = snapshot(ctx);
  assert.notEqual(now.revision, stale.revision);

  // 用过期 revision 形成一个**新**幂等键的请求：这不是重试，是一个基于过期状态的新动作。
  // 幂等表救不了它，只有 expected_revision 能挡。
  assert.throws(
    () => ctx.s.dispatch("hand.act", {
      ...actParams(ctx),
      expected_revision: stale.revision,
      idempotency_key: "brand-new-key",
    }),
    probe("revision_conflict"),
  );
  assert.deepEqual(snapshot(ctx), now, "被拒的请求不得改动任何状态");
});

test("F2：旧 hand_id 被确定性拒绝，不靠 revision 恰好对上放行", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  const firstHandId = ctx.o.hand.id;

  // 结束这一手，开下一手。
  ctx.s.dispatch("hand.act", actParams(ctx, { action: "fold" }));
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const next = ctx.s.dispatch("hand.start_if_due", {});
  assert.equal(next.started, true);
  assert.notEqual(ctx.o.hand.id, firstHandId);

  const now = snapshot(ctx);
  assert.throws(
    () => ctx.s.dispatch("hand.act", {
      ...actParams(ctx),
      hand_id: firstHandId,
      // 故意把 revision 填成当前值：只有 hand_id 这一道能挡住它。
      expected_revision: now.revision,
      idempotency_key: "key-from-old-hand",
    }),
    probe("hand_mismatch"),
  );
  assert.deepEqual(snapshot(ctx), now, "被拒的请求不得改动任何状态");
});

test("F2：同一幂等键换 payload 被确定性拒绝，不执行也不覆盖原结果", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);

  const params = actParams(ctx, { action: "call" });
  const first = ctx.s.dispatch("hand.act", params);
  const after = snapshot(ctx);

  // 同键不同动作。可能是客户端 bug，也可能是有人拿别人的键做别的事；
  // 无论哪种都不能猜，必须拒绝。
  assert.throws(
    () => ctx.s.dispatch("hand.act", { ...params, action: "fold" }),
    probe("idempotency_key_conflict"),
  );
  assert.deepEqual(snapshot(ctx), after, "冲突请求不得改动任何状态");

  // 原键原 payload 仍然返回原结果：冲突不能污染已记下的那一条。
  const replay = ctx.s.dispatch("hand.act", params);
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.result, first.result);
});

test("F2：三个字段各自必填，缺一个就拒绝", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  const complete = actParams(ctx, { action: "call" });

  for (const field of ["hand_id", "expected_revision", "idempotency_key"]) {
    const params = { ...complete };
    delete params[field];
    assert.throws(
      () => ctx.s.dispatch("hand.act", params),
      probe("invalid_field"),
      `缺 ${field} 必须被拒绝`,
    );
  }
  // 类型也要挡：expected_revision 收字符串就等于把比较推迟到「为什么这一手重复执行了」。
  for (const bad of ["1", 1.5, -1, 0, null, true, Number.NaN]) {
    assert.throws(
      () => ctx.s.dispatch("hand.act", { ...complete, expected_revision: bad }),
      probe("invalid_field"),
      `expected_revision=${String(bad)} 必须被拒绝`,
    );
  }
  // 到这里一次都没执行成功过。
  assert.equal(ctx.o.hand.revision, complete.expected_revision);
});

test("F2：重放不得再次唤醒 AI——意图数与原次一致", () => {
  // 幂等表若只记「结果」不记整个信封，重放会返回原结果但重新跑一次事件翻译，
  // 于是该席 AI 被唤醒两次。公开发言配额是按手计的，重复唤醒会真的多发一次言。
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  const params = actParams(ctx, { action: "call" });
  const first = ctx.s.dispatch("hand.act", params);
  const eventsAfterFirst = ctx.o.ai.events.length;

  const replay = ctx.s.dispatch("hand.act", params);
  assert.equal(replay.intent_count, first.intent_count, "重放的意图数必须与原次一致");
  assert.equal(
    ctx.o.ai.events.length,
    eventsAfterFirst,
    "重放不得再往 AI 时间线里写事件",
  );
});

test("F2：hand.reveal 用同一套幂等策略", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  // 一方弃牌，赢家未被跟注，可自愿亮牌。
  ctx.s.dispatch("hand.act", actParams(ctx, { action: "fold" }));
  assert.equal(ctx.o.hand.status, "complete");

  const winnerId = ctx.o.hand.settlement.winner_ids[0];
  const seat = ctx.seatOf(winnerId);
  const params = {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential,
    hand_id: ctx.o.hand.id,
    expected_revision: ctx.o.hand.revision,
    idempotency_key: "reveal-key-1",
  };

  const first = ctx.s.dispatch("hand.reveal", params);
  assert.equal(first.revealed, true);
  const revisionAfter = ctx.o.hand.revision;

  const replay = ctx.s.dispatch("hand.reveal", params);
  assert.equal(replay.replay, true, "重放必须被识别");
  assert.equal(ctx.o.hand.revision, revisionAfter, "重放不得推进版本号");

  // 同键不同 payload 同样拒绝。这里换的是 expected_revision：同一个逻辑请求必须带同一个
  // 版本号，换了就不是重试。不拿 seat_id 做这条，因为只有赢家能亮牌，换 seat_id 会先被
  // 凭据门挡住，测到的就不是幂等门了。
  assert.throws(
    () => ctx.s.dispatch("hand.reveal", { ...params, expected_revision: params.expected_revision + 1 }),
    probe("idempotency_key_conflict"),
  );
  // 缺字段同样拒绝。
  for (const field of ["hand_id", "expected_revision", "idempotency_key"]) {
    const partial = { ...params };
    delete partial[field];
    assert.throws(
      () => ctx.s.dispatch("hand.reveal", partial),
      probe("invalid_field"),
      `hand.reveal 缺 ${field} 必须被拒绝`,
    );
  }
});

test("F2：幂等键按手隔离，上一手用过的键在这一手是新键", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  const reused = "same-key-both-hands";

  ctx.s.dispatch("hand.act", actParams(ctx, { action: "fold", idempotency_key: reused }));
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  assert.equal(ctx.s.dispatch("hand.start_if_due", {}).started, true);

  // 同一个键在新的一手里必须当作新请求执行，而不是返回上一手的结果。
  const second = ctx.s.dispatch("hand.act", actParams(ctx, {
    action: "fold",
    idempotency_key: reused,
  }));
  assert.notEqual(second.replay, true, "新的一手里同名键不是重放");
  assert.equal(ctx.o.hand.status, "complete");
});

// ---------------------------------------------------------------------------
// 要求 4：其他可重放写命令
// ---------------------------------------------------------------------------

// chat.say 有和 hand.act 完全同形的危害，而且更直接：重放一次就多一条公开发言，
// 还多唤醒一次该席 AI——而公开发言配额按手计，多唤醒一次会真的多发一次言。
function sayParams(ctx, overrides = {}) {
  return {
    seat_id: ctx.seats[0].seat_id,
    recovery_credential: ctx.seats[0].credential,
    text: "我这把跟",
    idempotency_key: "say-1",
    ...overrides,
  };
}

test("F2：公开发言的重放不得多出一条时间线记录，也不得多唤醒一次 AI", () => {
  const ctx = harness({ playerCount: 2, silenceAi: false });
  begin(ctx);
  ctx.o.takeIntents();
  // 只跨过 AI 冷却，不跨过行动时限（30 秒）：跨过去这一手就被判超时，
  // 后面的动作全部拿到 action_deadline_expired。
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);

  const first = ctx.s.dispatch("chat.say", sayParams(ctx));
  assert.notEqual(first.published, null, "第一次发言应当进入公开时间线");
  const afterFirst = ctx.s.dispatch("view.timeline").timeline.length;
  // F5：待办队列在权威侧。数条数之外还要记下每席的 context_revision——每产生一份新
  // 上下文就 +1，所以「重放又唤醒了一次」即使条数不变也逃不掉（每席只留最新一份，
  // 重复唤醒表现为就地覆盖而不是多一条）。
  const intentsAfterFirst = ctx.o.ai.workItems.size;
  const revisionsAfterFirst = [...ctx.o.ai.seats.values()].map((seat) => seat.context_revision);
  assert.ok(intentsAfterFirst > 0, "前置条件：发言应当唤醒至少一席");

  const replay = ctx.s.dispatch("chat.say", sayParams(ctx));
  assert.equal(replay.replay, true, "同键同 payload 必须标记为重放");
  assert.deepEqual(replay.published, first.published, "重放必须返回原来那条发言");
  assert.equal(
    ctx.s.dispatch("view.timeline").timeline.length,
    afterFirst,
    "重放不得往公开时间线里再加一条",
  );
  assert.equal(
    ctx.o.ai.workItems.size,
    intentsAfterFirst,
    "重放不得再产生一轮 AI 意图：多唤醒一次就是多发一次言",
  );
  assert.deepEqual(
    [...ctx.o.ai.seats.values()].map((seat) => seat.context_revision),
    revisionsAfterFirst,
    "重放不得推进任何一席的 context_revision：推进了就说明又组了一份上下文",
  );
});

test("F2：发言同键不同内容确定性拒绝", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  ctx.o.takeIntents();
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);

  ctx.s.dispatch("chat.say", sayParams(ctx));
  assert.throws(
    () => ctx.s.dispatch("chat.say", sayParams(ctx, { text: "我弃了" })),
    probe("idempotency_key_conflict"),
  );
});

test("F2：发言的幂等键必填", () => {
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  ctx.o.takeIntents();
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);

  for (const bad of [undefined, "", 1, null]) {
    assert.throws(
      () => ctx.s.dispatch("chat.say", sayParams(ctx, { idempotency_key: bad })),
      (error) => error instanceof ProbeError && error.code === "invalid_field",
      `idempotency_key=${JSON.stringify(bad)} 应当被拒`,
    );
  }
});

test("F2：发言按房间记账而非按手，跨手的重放仍是重放", () => {
  // 这一条钉的是作用域的选择本身。发言在牌局之间也合法，此时没有 hand_id 可绑；
  // 若把发言记进 hand: 作用域，新的一手会把账清掉，一次跨手到达的重试就会重新发一遍言。
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  ctx.o.takeIntents();
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);

  const firstHandId = ctx.o.hand.id;
  ctx.s.dispatch("chat.say", sayParams(ctx));
  const timelineAfterSay = ctx.s.dispatch("view.timeline").timeline.length;

  // 打完这一手，进入下一手。
  const actor = ctx.o.hand.seats[ctx.o.hand.actorIndex].id;
  ctx.s.dispatch("hand.act", actParams(ctx, { action: "fold" }));
  assert.equal(ctx.o.hand.status, "complete", `前置条件：${actor} 弃牌应当结束这一手`);
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs + 1);
  ctx.s.dispatch("hand.start_if_due", {});
  assert.notEqual(ctx.o.hand.id, firstHandId, "前置条件：应当已经开了新的一手");

  const late = ctx.s.dispatch("chat.say", sayParams(ctx));
  assert.equal(late.replay, true, "跨手到达的同键重试仍必须是重放");
  assert.equal(
    ctx.s.dispatch("view.timeline").timeline.length,
    timelineAfterSay,
    "跨手重放不得往时间线里再加一条",
  );
});

test("F2：内部自动动作不经幂等门，超时结算与离桌弃牌照常落地", () => {
  // 门禁只加在玩家发起的官方动作上。权威自己产生的动作（超时自动处置、离桌强制弃牌）
  // 没有客户端可重试，硬要它们编一个幂等键只会让权威给自己发明假身份。
  const ctx = harness({ playerCount: 2 });
  begin(ctx);
  const before = snapshot(ctx);
  ctx.advance(ctx.o.actionTimeoutMs + 1);
  const settled = ctx.s.dispatch("hand.settle_expired", {});
  assert.notEqual(settled.result, null, "到期动作应当被自动处置");
  assert.notEqual(ctx.o.hand.revision, before.revision, "自动处置照常推进版本号");
});

// ---------------------------------------------------------------------------
// 要求 4 的覆盖面：一份独立的命令分类清单
// ---------------------------------------------------------------------------

// 「其他可重放写命令采用同一套幂等策略」的问题在于「其他」是哪些。靠读代码逐个判断
// 不成立：漏掉一个不会有任何症状，直到某天一次重试悄悄执行了两遍。
//
// 所以这里独立列一份清单，对每个命令给出明确判决，再断言清单与命令面的真实命令表
// **完全相等**。新增命令必然落在清单之外，测试立刻失败，迫使加命令的人表态。
//
// 这份清单是手写的期望值，不从实现导出——从实现导出就是让集合自证正确。
const CLASSIFICATION = {
  // 经幂等门，且额外绑 hand_id + expected_revision。
  gated_hand_scoped: ["hand.act", "hand.reveal"],

  // 经幂等门，按房间记账，不绑 revision。理由见 submitPlayerText 注释。
  gated_room_scoped: ["chat.say"],

  // 权威自己的到期处置。没有客户端，也就没有「重试」这回事；判定是当前时钟的函数，
  // 同一时刻重复调用得到同一结论。给它们编幂等键等于让权威给自己发明客户端身份。
  authority_due_work: [
    "hand.evaluate_start",
    "hand.start_if_due",
    "hand.settle_expired",
    "hand.apply_pending_fold",
    "ai.reclaim_expired",
  ],

  // 收敛型写命令：重复调用落到同一个状态，或被状态机按非法转换拒绝。二次执行不产生
  // 第二个效果，所以幂等键不增加任何保证。
  convergent_state_writes: [
    "room.confirm_public_scope",
    "seat.connect",
    "seat.disconnect",
    "seat.ready",
    "seat.refill_test_chips",
    "seat.sit_out_after_hand",
    "seat.leave",
    "ai.set_mode",
    "ai.hide_local",
  ],

  // 归属其他 finding，本轮不在 F2 里改。写在这里是为了「已知且已归属」，不是「忘了」。
  owned_by_other_finding: [
    // F5：领取与租约必须原子。它们的重复提交危害是抢占与丢窗口，不是重复执行，
    // 需要的是权威生成并绑定的 intent/evaluation id，而不是客户端自带的幂等键。
    "ai.take_intents",
    "ai.start",
    "ai.resolve",
    // F6：凭据保管。重复调用不产生第二个效果，但它的问题是凭据经过哪些面。
    "seat.recover",
  ],

  // 建号命令。每次调用本就该产生一个新身份，"重放返回原结果" 与它的语义相反：
  // 同一个人第二次点「创建房间」要的是第二个房间。客户端若怕重复建号，该在自己那侧
  // 控制点击，而不是让权威把两次创建合并成一次。
  identity_creation: ["room.create", "room.join"],

  // 只读。
  read_only: [
    "view.projection",
    "view.timeline",
    "view.hand",
    "view.seat",
    "view.room_events",
    "view.ai_events",
  ],
};

test("F2 要求 4：每个命令都有明确的幂等判决，新增命令必须表态", () => {
  const ctx = harness({ playerCount: 2 });
  const actual = ctx.s.commandNames();

  const classified = Object.values(CLASSIFICATION).flat();
  const duplicates = classified.filter((name, index) => classified.indexOf(name) !== index);
  assert.deepEqual(duplicates, [], "同一个命令不得落在两个类别里");

  assert.deepEqual(
    [...classified].sort(),
    [...actual].sort(),
    "清单与命令面必须完全相等：多出来的是清单写错了，少的是新命令还没表态",
  );
});

test("F2 要求 4：被判为经幂等门的命令，确实都要幂等键", () => {
  // 分类不是注释，要能被证伪。对每个被判为「经幂等门」的命令，把键去掉必须被拒。
  const ctx = harness({ playerCount: 2 });
  begin(ctx);

  const withoutKey = {
    "hand.act": () => {
      const params = actParams(ctx);
      delete params.idempotency_key;
      return params;
    },
    "chat.say": () => {
      const params = sayParams(ctx);
      delete params.idempotency_key;
      return params;
    },
    "hand.reveal": () => ({
      seat_id: ctx.seats[0].seat_id,
      recovery_credential: ctx.seats[0].credential,
      hand_id: ctx.o.hand.id,
      expected_revision: ctx.o.hand.revision,
    }),
  };

  const gated = [
    ...CLASSIFICATION.gated_hand_scoped,
    ...CLASSIFICATION.gated_room_scoped,
  ];
  assert.deepEqual(
    Object.keys(withoutKey).sort(),
    [...gated].sort(),
    "每个经幂等门的命令都要在这里有一个去掉键的构造",
  );

  for (const command of gated) {
    assert.throws(
      () => ctx.s.dispatch(command, withoutKey[command]()),
      (error) => error instanceof ProbeError && error.code === "invalid_field"
        && error.details?.field === "idempotency_key",
      `${command} 缺 idempotency_key 时必须以 invalid_field/idempotency_key 拒绝`,
    );
  }
});

test("F2 要求 4：被判为收敛型的席位写命令，重复调用不产生第二个效果", () => {
  // 收敛不是靠说的。这里只验能在当前状态下安全重复的那几条：重复一次之后，
  // 席位投影必须与第一次之后完全相同。
  const ctx = harness({ playerCount: 2 });
  const seat = ctx.seats[0];
  const auth = { seat_id: seat.seat_id, recovery_credential: seat.credential };

  const repeatable = [
    ["seat.connect", { ...auth, connection_id: "conn-repeat" }],
    ["seat.ready", { ...auth, ready: true }],
    ["ai.set_mode", { ...auth, mode: "OFF" }],
    // F3 之后它要带凭据与表态。重复确认仍然收敛：落到同一条三元组记录上，
    // 只有 confirmed_at 会刷新，而那不进席位投影。
    ["room.confirm_public_scope", confirmParams(seat)],
  ];

  for (const [command, params] of repeatable) {
    ctx.s.dispatch(command, params);
    const after = JSON.stringify(ctx.s.dispatch("view.seat", auth));
    ctx.s.dispatch(command, params);
    assert.equal(
      JSON.stringify(ctx.s.dispatch("view.seat", auth)),
      after,
      `${command} 重复调用后席位投影应当不变`,
    );
  }
});

test("F2：一次发言对同一席只产生一个意图，唤醒不重复记账", () => {
  // 变异 F2-15 暴露的空白：原来的重放用例比较的是「重放前后意图数不变」，若首次执行
  // 本身就把意图推了两遍，前后差值仍然是 0，测试照过。
  //
  // 精确的判据是 (seat_id, source_event_id)：一个来源事件对一席最多唤醒一次。
  // 重复唤醒不是多一条队列记录而已——公开发言配额按手计，多唤醒一次会真的多发一次言。
  const ctx = harness({ playerCount: 2, silenceAi: false });
  begin(ctx);
  ctx.o.takeIntents();
  ctx.advance(LIVELY_V1.aiMinEvaluationIntervalMs + 1);

  // F5：待办队列在权威侧（o.ai.workItems），不再是编排层那个数组。判据不变，取数的
  // 地方变了：只看本次来源事件唤醒出来的那些工作项。
  const said = ctx.s.dispatch("chat.say", sayParams(ctx));
  assert.ok(said.published !== null, "前置条件：这句话应当发布出去");
  // 命令面返回的是 payload，不含 event_id；唤醒用的 source_event_id 是那条事件自己的
  // event_id，所以从权威事件流里取最后一条 PLAYER_PUBLIC_SPEECH。
  const speech = [...ctx.o.ai.events].reverse()
    .find((event) => event.type === "PLAYER_PUBLIC_SPEECH");
  assert.ok(speech !== undefined, "前置条件：权威事件流里应当有这条公开发言");
  const woken = [...ctx.o.ai.workItems.values()].filter(
    (item) => item.context.source_event_id === speech.event_id,
  );
  assert.ok(woken.length > 0, `前置条件：发言应当唤醒至少一席（source=${speech.event_id}）`);

  const seen = woken.map((item) => `${item.seat_id}|${item.context.source_event_id}`);
  assert.deepEqual(
    [...new Set(seen)].sort(),
    [...seen].sort(),
    `同一来源事件对同一席只能唤醒一次，实得 ${JSON.stringify(seen)}`,
  );
  // 信封声称的意图数必须与队列里真实的条数一致：不一致说明有人多推或少推了一份。
  assert.equal(
    said.intent_count,
    woken.length,
    "返回的 intent_count 与待办队列必须一致",
  );
});

test("F2：新的一手开始时旧手的幂等账被清掉，长会话不无界增长", () => {
  // 变异 F2-12 暴露的空白：清理只影响内存占用，不改变任何判定（旧手的键本来就被
  // hand_id 门禁拒绝），所以没有任何行为用例会失败。但「不清理」在长会话里是真的
  // 泄漏，所以直接断言这件事发生了。
  const ctx = harness({ playerCount: 2 });
  begin(ctx);

  const firstHandId = ctx.o.hand.id;
  ctx.s.dispatch("hand.act", actParams(ctx, { action: "fold" }));
  assert.equal(ctx.o.hand.status, "complete", "前置条件：弃牌应当结束这一手");
  assert.ok(ctx.o.actions.size(`hand:${firstHandId}`) > 0, "前置条件：第一手应当记了账");

  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs + 1);
  ctx.s.dispatch("hand.start_if_due", {});
  const secondHandId = ctx.o.hand.id;
  assert.notEqual(secondHandId, firstHandId, "前置条件：应当已经开了新的一手");

  assert.equal(
    ctx.o.actions.size(`hand:${firstHandId}`),
    0,
    "新的一手开始后，上一手的幂等账必须已经清掉",
  );
  const handScopes = [...ctx.o.actions.byScope.keys()].filter((s) => s.startsWith("hand:"));
  assert.deepEqual(
    handScopes,
    [],
    `本手还没有任何官方动作，此时不该残留任何 hand: 作用域，实得 ${JSON.stringify(handScopes)}`,
  );
});
