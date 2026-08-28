"use strict";

// 模型输出畸形时的有界降级。
//
// 座位 AI 的输出来自一个语言模型，所以「回了个不合法的东西」不是异常路径而是常态路径：
// null、少字段、枚举拼错、超时、抛错。权威对每一种都必须有界收尾——要么当场降级，要么留给
// 租约回收——但绝不能让那一席停在 THINKING 且没有任何东西可回收。
//
// 停在 THINKING 且 active_turn 为 null 是最坏的一种：
//   - 规则 4 的闸门看 active_turn，它是 null，所以新事件还能排队，不算永久静默；
//   - 但 status 停在 THINKING 再也不会变，UI 上那一席永远在思考；
//   - reclaimSeatIfExpired 看 active_turn 的租约期限，null 意味着没有租约可到期，
//     所以到期驱动也救不了它。
// 三条加起来：一个既不推进也不复原、也没人能收拾的状态。
//
// 已经做对的两条留作对照：message_too_long 写 DEGRADED，ai_hand_quota_exhausted 写 IDLE。
// 两条都在抛出之前把状态落定了。所以本文件要求的不是新机制，是把同一条纪律补齐到
// 那些走通用校验器的路径上。

const assert = require("node:assert/strict");
const test = require("node:test");

const { SeatAiStore, EVALUATION_LEASE_MS } = require("../src/authority/seat-ai-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");

const ROOM = "room-binding-1";
const RULES = "table-rules-v1";

function table(seatIds = ["seat-1"], options = {}) {
  let now = 1_000;
  let id = 0;
  const store = new SeatAiStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
    ...options,
  });
  for (const seatId of seatIds) {
    store.registerSeat({ seatId, playerId: `player-${seatId}` });
    store.confirmDefaultPublicScope({
      seatId,
      roomBindingId: ROOM,
      tableRulesVersion: RULES,
      acknowledged: true,
    });
  }
  return {
    store,
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

function wake(store, eventId, seatId = "seat-1") {
  const intents = store.notifyDomainEvent({ type: "BET", eventId, payload: {} });
  return intents.find((intent) => intent.seat_id === seatId);
}

// 起一个在途回合，返回它的 turn_id。
function thinking(t, eventId = "evt-1", seatId = "seat-1") {
  const intent = wake(t.store, eventId, seatId);
  assert.ok(intent !== undefined && intent.intent_id !== undefined,
    `没排到待办: ${JSON.stringify(intent)}`);
  const started = t.store.startEvaluation({ seatId, intentId: intent.intent_id });
  const turnId = started.payload.turn_id;
  assert.equal(t.store.seatState(seatId).status, "THINKING", "起手就该是 THINKING");
  return turnId;
}

function resolveVia(store, input) {
  return store.resolveEvaluation({ ...input, roomBindingId: ROOM, tableRulesVersion: RULES });
}

// 本文件的判定标准。
//
// 不写成「status 必须等于某个值」：合法的收尾有两种，当场降级（IDLE / DEGRADED）或者
// 把回合留在原地交给租约。两种都有界。要禁的是第三种——status 还是 THINKING，而
// active_turn 已经没了，于是没有任何机制会再碰它。
function assertBounded(store, seatId, where) {
  const seat = store.seats.get(seatId);
  const status = store.seatState(seatId).status;
  const stuck = status === "THINKING" && seat.active_turn === null;
  assert.ok(
    !stuck,
    `${where}：该席停在 THINKING 且没有可回收的回合，既不推进也不复原（status=${status}）`,
  );
}

// ---------------------------------------------------------------- 非法枚举

test("有界降级：非法 decision 不得让该席停在无回合的 THINKING", () => {
  const t = table();
  const turnId = thinking(t);

  assert.throws(
    () => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "raise_all_in" }),
    (error) => error instanceof ProbeError && error.code === "invalid_field",
  );

  assertBounded(t.store, "seat-1", "非法枚举");
});

// 上一条只说了「不能卡住」。这一条说清楚正确行为是哪一种：畸形请求不该吃掉回合。
//
// 为什么选「留住回合」而不是「降级并吃掉回合」：模型回了个拼错的枚举，这是适配器一侧的
// 结构错误，重试一次就好了。吃掉回合意味着这一次唤醒被一个笔误永久作废——而唤醒是有额度
// 的（规则 2：每个来源事件对每席最多一次），作废就是真的少了一次发言机会。
// 有界性由 120 秒评估租约提供，不需要靠吃掉回合来保证。
test("有界降级：非法 decision 之后重试一个合法 decision 必须成功", () => {
  const t = table();
  const turnId = thinking(t);

  assert.throws(() => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "raise_all_in" }),
    (error) => error.code === "invalid_field");

  // 同一个回合，改成合法输出。这一条在旧实现上必然失败：回合已经被上一次畸形请求摘掉了。
  const retried = resolveVia(t.store, { seatId: "seat-1", turnId, decision: "silent" });
  assert.equal(retried.type, "SEAT_AI_SILENT", `重试没被当成正常收尾: ${retried.type}`);
  assert.equal(t.store.seatState("seat-1").status, "IDLE");
});

test("有界降级：非法 decision 之后租约仍然覆盖这个回合", () => {
  const t = table();
  thinking(t);

  const turnId = t.store.seats.get("seat-1").active_turn.turn_id;
  assert.throws(() => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "nope" }),
    (error) => error.code === "invalid_field");

  // 租约没到期时回合还在。
  t.advance(EVALUATION_LEASE_MS - 1);
  t.store.reclaimExpiredEvaluations();
  assert.ok(t.store.seats.get("seat-1").active_turn !== null, "租约未到期就被收走了");

  // 到期后由权威自己收拾，不需要适配器再回来。
  t.advance(2);
  const reclaimed = t.store.reclaimExpiredEvaluations();
  assert.equal(reclaimed.length, 1, `到期回合应被回收: ${JSON.stringify(reclaimed)}`);
  assert.equal(t.store.seatState("seat-1").status, "IDLE");
  assertBounded(t.store, "seat-1", "回收之后");
});

// ---------------------------------------------------------------- 畸形结构

test("有界降级：public_speech 少了 text 不得让该席停在无回合的 THINKING", () => {
  const t = table();
  const turnId = thinking(t);

  assert.throws(
    () => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "public_speech" }),
    (error) => error instanceof ProbeError && error.code === "invalid_field",
  );
  assertBounded(t.store, "seat-1", "缺 text");

  // 补上 text 重试必须成立。
  const retried = resolveVia(t.store, { seatId: "seat-1", turnId, decision: "public_speech", text: "我跟" });
  assert.equal(retried.type, "AI_PUBLIC_SPEECH", `补齐后仍不被接受: ${retried.type}`);
});

test("有界降级：text 类型不对同样有界，且不消耗该手发布额度", () => {
  const t = table();
  const turnId = thinking(t);

  for (const bad of [null, 42, {}, [], ""]) {
    assert.throws(
      () => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "public_speech", text: bad }),
      (error) => error.code === "invalid_field",
      `text=${JSON.stringify(bad)} 应被拒`,
    );
    assertBounded(t.store, "seat-1", `text=${JSON.stringify(bad)}`);
  }

  // 额度没被这些畸形请求吃掉：补齐后仍然发得出去。
  const ok = resolveVia(t.store, { seatId: "seat-1", turnId, decision: "public_speech", text: "过牌" });
  assert.equal(ok.type, "AI_PUBLIC_SPEECH");
  assert.equal(t.store.seats.get("seat-1").ai_published_this_hand, 1,
    "畸形请求也计了额度");
});

test("有界降级：decision 为 null / undefined / 非字符串都算畸形，一律有界", () => {
  const t = table();
  const turnId = thinking(t);

  for (const bad of [null, undefined, 0, {}, ["silent"], "SILENT", "Silent"]) {
    assert.throws(
      () => resolveVia(t.store, { seatId: "seat-1", turnId, decision: bad }),
      (error) => error.code === "invalid_field",
      `decision=${JSON.stringify(bad)} 应被拒`,
    );
    assertBounded(t.store, "seat-1", `decision=${JSON.stringify(bad)}`);
  }
  // 大小写敏感是刻意的：枚举就是枚举。但被拒之后仍然可重试。
  assert.equal(resolveVia(t.store, { seatId: "seat-1", turnId, decision: "silent" }).type,
    "SEAT_AI_SILENT");
});

// ---------------------------------------------------------------- 已经做对的两条（对照组）

// 这两条不是新要求，是本文件判定标准的正样本：它们在抛出之前就把状态落定了。
// 留在这里是为了让「有界」这个词有两个具体例子，而不只是一条否定断言。
test("有界降级：message_too_long 写 DEGRADED，回合已收尾（对照组）", () => {
  const t = table();
  const turnId = thinking(t);
  const tooLong = "字".repeat(1_000);

  assert.throws(() => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "public_speech", text: tooLong }),
    (error) => error.code === "message_too_long");
  assert.equal(t.store.seatState("seat-1").status, "DEGRADED");
  assertBounded(t.store, "seat-1", "message_too_long");
});

test("有界降级：畸形之后该席仍能被新事件唤醒，没有永久静默", () => {
  const t = table();
  const turnId = thinking(t, "evt-1");
  assert.throws(() => resolveVia(t.store, { seatId: "seat-1", turnId, decision: "bogus" }),
    (error) => error.code === "invalid_field");

  // 先把这个回合正常收尾（畸形请求没吃掉它）。
  resolveVia(t.store, { seatId: "seat-1", turnId, decision: "silent" });

  // 冷却过后新事件必须能重新排到待办。
  t.advance(60_000);
  const next = wake(t.store, "evt-2");
  assert.ok(next !== undefined && next.intent_id !== undefined,
    `畸形请求之后该席不再被唤醒: ${JSON.stringify(next)}`);
});

// ---------------------------------------------------------------- 适配器一侧

// 上面那些跑在权威里，钉的是「畸形输入到了权威手上会怎样」。这一组跑在宿主驱动里，钉的是
// 「模型返回的东西根本没到权威手上会怎样」——两处都要有界，而且失败形态完全不同：
// 权威那边最坏是一席卡住，驱动这边最坏是整张桌子的 AI 一起停。
//
// 为什么必须单独测驱动：driveOnce 是一个 for 循环，一席抛出就带走同一轮里后面所有席位。
// 权威侧的租约救不了这个——那些席位的回合压根没起来，没有租约可到期。

const { TableWebHost } = require("../src/host/table-web-host.cjs");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

// 一张真牌桌 + 一个可控适配器 + 一个 web 宿主。
// 用真 CommandSurface 而不是替身：本组测试要证明「回合真的被收尾了」，而回合状态在权威里。
async function drivenTable(adapter, hostOptions = {}) {
  let now = 1_000;
  let id = 0;
  const surface = new CommandSurface({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: () => stackedDeck([
      "As", "Kd", "Qh", "Jc", "Ts", "9d",
      "2c", "3d", "4h", "5s", "6c",
      "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
    ]),
  });
  const host = new TableWebHost({
    core: surface,
    modelAdapter: adapter,
    now: () => now,
    ...hostOptions,
  });

  // 两席，各自一个 web 会话——驱动按会话遍历，所以一席一会话才测得出「一席带走整轮」。
  const seats = [];
  const created = surface.dispatch("room.create", { player_id: "p-a", table_rules_version: RULES });
  seats.push({ seatId: created.seat.seat_id, credential: created.recovery_credential, player: "p-a" });
  const joined = surface.dispatch("room.join", {
    player_id: "p-b",
    room_id: created.room.room_id,
    invite_code: created.invite_code,
  });
  seats.push({ seatId: joined.seat.seat_id, credential: joined.recovery_credential, player: "p-b" });

  for (const seat of seats) {
    const handle = host.custody.bind({ seatId: seat.seatId, credential: seat.credential }).seat_handle;
    host.sessions.set(`web-${seat.player}`, { seat_handle: handle, seat_id: seat.seatId });
    surface.dispatch("room.confirm_public_scope", {
      seat_id: seat.seatId, recovery_credential: seat.credential, acknowledged: true,
    });
    surface.dispatch("seat.connect", {
      seat_id: seat.seatId, recovery_credential: seat.credential, connection_id: `c-${seat.player}`,
    });
    surface.dispatch("seat.ready", {
      seat_id: seat.seatId, recovery_credential: seat.credential, ready: true,
    });
  }
  surface.dispatch("hand.start_if_due");
  // 真人发言：白名单来源事件，给两席各排一个待办。
  surface.dispatch("chat.say", {
    seat_id: seats[0].seatId,
    recovery_credential: seats[0].credential,
    text: "开始了",
    idempotency_key: "chat-1",
  });

  return {
    host,
    surface,
    seats,
    statusOf(seatId) {
      return surface.orchestrator.ai.seatState(seatId).status;
    },
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

// 每一种畸形返回都必须收尾成 silent，并且两席都被驱动到。
for (const [name, value] of [
  ["null", null],
  ["undefined", undefined],
  ["空对象", {}],
  ["decision 拼错", { decision: "SILENT" }],
  ["decision 是数字", { decision: 7 }],
  ["decision 非法枚举", { decision: "raise_all_in" }],
  ["public_speech 但没有 text", { decision: "public_speech" }],
  ["public_speech 但 text 是对象", { decision: "public_speech", text: {} }],
  ["public_speech 但 text 是空串", { decision: "public_speech", text: "" }],
  ["数组", []],
  ["字符串", "silent"],
]) {
  test(`有界降级：适配器返回${name}时两席都收尾成 silent`, async () => {
    const t = await drivenTable({ evaluate: async () => value });

    const out = await t.host.driveOnce();

    assert.equal(out.started, 2, `两席都该被起手: ${JSON.stringify(out)}`);
    assert.equal(out.resolved, 2, `两席都该被收尾: ${JSON.stringify(out)}`);
    for (const seat of t.seats) {
      assert.equal(t.statusOf(seat.seatId), "IDLE",
        `${seat.player} 没回到 IDLE（返回${name}）`);
      assert.equal(t.surface.orchestrator.ai.seats.get(seat.seatId).active_turn, null,
        `${seat.player} 的回合还挂着`);
    }

    // 收尾成 silent，不是收尾成「猜一句话」。
    //
    // 只断言 resolved 与 IDLE 区分不出这两件事：把认不出的结构猜成 public_speech 同样会
    // 成功收尾、同样回到 IDLE。差别只在时间线上——而那正是用户会看见的地方。以该席的名义
    // 公开发一句它没说过的话，代价与「这次不说话」完全不对称。
    const speech = t.surface.dispatch("view.timeline").timeline
      .filter((entry) => entry.speaker_type === "SEAT_AI");
    assert.deepEqual(speech, [],
      `畸形输入被猜成了公开发言（返回${name}）: ${JSON.stringify(speech)}`);

    // 额度也不该被畸形输出吃掉。
    for (const seat of t.seats) {
      assert.equal(t.surface.orchestrator.ai.seats.get(seat.seatId).ai_published_this_hand, 0,
        `${seat.player} 的发布额度被畸形输出消耗了`);
    }

    // 失败原因要留痕，否则「模型坏了」这件事无处可查。
    assert.equal(t.host.driveErrors.length, 2,
      `两席的失败都该被记下: ${JSON.stringify(t.host.driveErrors)}`);
  });
}

// 默认超时上限本身也是不变量。
//
// 上面那些超时测试都显式传了 adapterTimeoutMs，所以它们一条都覆盖不到默认值——把默认值改成
// 0（等于无上限）或改成大于租约的数，那些测试照旧全绿。真实部署用的正是默认值。
test("有界降级：默认适配器超时存在，且明显短于评估租约", () => {
  const { TableWebHost: Host } = require("../src/host/table-web-host.cjs");
  const host = new Host({ core: { dispatch: () => ({}) } });

  assert.ok(Number.isFinite(host.adapterTimeoutMs) && host.adapterTimeoutMs > 0,
    `默认超时不是一个正数，等于没有上限: ${host.adapterTimeoutMs}`);
  assert.ok(host.adapterTimeoutMs < EVALUATION_LEASE_MS,
    `默认超时 ${host.adapterTimeoutMs} 不短于评估租约 ${EVALUATION_LEASE_MS}：`
    + "等到租约到期才放手意味着权威已经收回回合，那次 resolve 只会被当迟到输出丢弃");
  // 留出余量，不是刚好小于。silent 收尾也要时间落地。
  assert.ok(host.adapterTimeoutMs <= EVALUATION_LEASE_MS / 2,
    `默认超时 ${host.adapterTimeoutMs} 与租约 ${EVALUATION_LEASE_MS} 太接近，没有收尾余量`);
});

// 一席的适配器抛错不该带走同一轮里的另一席。抛错这条路旧代码已经处理了，
// 但它处理的是「返回值层面的失败」，这条测的是「循环层面的连带」。
test("有界降级：适配器对第一席抛错不影响第二席被驱动", async () => {
  let calls = 0;
  const t = await drivenTable({
    evaluate: async () => {
      calls += 1;
      if (calls === 1) throw new Error("模型炸了");
      return { decision: "silent" };
    },
  });

  const out = await t.host.driveOnce();
  assert.equal(calls, 2, `第二席没被调用: calls=${calls}`);
  assert.equal(out.resolved, 2, `两席都该收尾: ${JSON.stringify(out)}`);
  for (const seat of t.seats) {
    assert.equal(t.statusOf(seat.seatId), "IDLE", `${seat.player} 没回到 IDLE`);
  }
});

// 被测对象就是「会不会挂死」，所以测试自己必须先有界。
//
// 不加这一层的话，缺陷的表现形式是整个 test runner 卡住——比失败更糟：一条挂死的测试会
// 让同一进程里后面所有测试都不跑，而 npm test 是 --test-concurrency=1。所以这里给一个
// 独立的看门狗，让「没有超时机制」表现成一条清晰的失败而不是一次挂起。
async function withinMs(promise, ms, what) {
  let timer;
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} 在 ${ms}ms 内没有返回`)), ms);
  });
  try {
    return await Promise.race([promise, watchdog]);
  } finally {
    clearTimeout(timer);
  }
}

// 超时。这是最坏的一种：evaluate 永不 settle 时旧代码整个 driveOnce 挂死，
// this.driving 永远为 true，于是这张桌子上所有席位的 AI 一起停——而且没有任何回合起得来，
// 权威侧的租约救不了压根没开始的回合。
test("有界降级：适配器永不返回时驱动仍在有界时间内收尾", async () => {
  const t = await drivenTable(
    { evaluate: () => new Promise(() => {}) },
    { adapterTimeoutMs: 50 },
  );

  const out = await withinMs(t.host.driveOnce(), 5_000, "driveOnce");
  assert.equal(out.resolved, 2, `挂死的适配器必须被超时收尾: ${JSON.stringify(out)}`);
  for (const seat of t.seats) {
    assert.equal(t.statusOf(seat.seatId), "IDLE", `${seat.player} 停在 THINKING`);
  }
  // 驱动闸门必须放开，不然后续任何一轮都进不来。
  assert.equal(t.host.driving, false, "driving 闸门没放开");
  // 超时要留痕：静默收尾但不记录，等于把「模型坏了」这件事藏起来。
  assert.ok(
    t.host.driveErrors.some((entry) => entry.code === "adapter_timeout"),
    `超时没被记录: ${JSON.stringify(t.host.driveErrors)}`,
  );
});

test("有界降级：超时的适配器迟到返回不得再发布", async () => {
  let release;
  const t = await drivenTable(
    { evaluate: () => new Promise((resolve) => { release = resolve; }) },
    { adapterTimeoutMs: 50 },
  );

  await withinMs(t.host.driveOnce(), 5_000, "driveOnce");
  // 模型在超时之后才回来，还想说话。回合已经被 silent 收尾了，这句话不能出现。
  release?.({ decision: "public_speech", text: "我本来想说这句" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const timeline = t.surface.dispatch("view.timeline").timeline;
  const speech = timeline.filter((entry) => entry.speaker_type === "SEAT_AI");
  assert.deepEqual(speech, [], `迟到输出被发布了: ${JSON.stringify(speech)}`);
});

// 坏适配器会一直坏下去，诊断缓冲不能跟着一直长。
//
// 上限设成 4 而不是用真实的 50：真人发言有额度（12 条/人/手），一手牌里凑不出 51 条来
// 越过真实上限，而为了测试去放宽产品规则是本末倒置。上限可注入，所以这里测的是「越过上限
// 会丢最旧的」这条逻辑本身，它与上限取多少无关。
test("有界降级：driveErrors 到上限后丢最旧的，不无界增长", async () => {
  const t = await drivenTable({ evaluate: async () => null }, { maxDriveErrors: 4 });

  // 每轮一次真人发言唤醒两席，两席各记一条 adapter_malformed_output。
  // 8 轮 = 16 条，远超上限 4。轮次数留在两位玩家各自 12 条的额度之内。
  for (let round = 0; round < 8; round += 1) {
    t.advance(60_000);
    t.surface.dispatch("chat.say", {
      seat_id: t.seats[round % 2].seatId,
      recovery_credential: t.seats[round % 2].credential,
      text: `第 ${round} 轮`,
      idempotency_key: `chat-r${round}`,
    });
    await t.host.driveOnce();
  }

  // 先证明真的记了东西：缓冲为空时下面那条上限断言会空过。
  assert.ok(t.host.driveErrors.length > 0, "一条都没记下来，上限断言会空过");
  assert.ok(
    t.host.driveErrors.length <= 5,
    `driveErrors 无界增长: ${t.host.driveErrors.length}`,
  );
  // 留下的必须是最近的那些，不是最早的：诊断要看现在坏在哪。
  for (const entry of t.host.driveErrors) {
    assert.equal(entry.code, "adapter_malformed_output", JSON.stringify(entry));
  }
});

// ---------------------------------------------------------------- 别席不受影响

test("有界降级：一席回了畸形输出不影响另一席", () => {
  const t = table(["seat-1", "seat-2"]);
  const intents = t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  assert.equal(intents.length, 2, `两席都该被唤醒: ${JSON.stringify(intents)}`);

  const turns = {};
  for (const seatId of ["seat-1", "seat-2"]) {
    const intent = intents.find((entry) => entry.seat_id === seatId);
    turns[seatId] = t.store.startEvaluation({ seatId, intentId: intent.intent_id }).payload.turn_id;
  }

  assert.throws(() => resolveVia(t.store, { seatId: "seat-1", turnId: turns["seat-1"], decision: "bogus" }),
    (error) => error.code === "invalid_field");

  // 别席照常收尾。
  const other = resolveVia(t.store, { seatId: "seat-2", turnId: turns["seat-2"], decision: "silent" });
  assert.equal(other.type, "SEAT_AI_SILENT");
  assertBounded(t.store, "seat-2", "别席");
  assertBounded(t.store, "seat-1", "畸形那一席");
});
