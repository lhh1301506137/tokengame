"use strict";

// F5 补强：领取的世代围栏（generation fencing）。
//
// 已有的 claim 租约解决了「领走即删除」造成的丢失窗口：工作项被打标而不是删除，30 秒后
// 到期放回。但打标本身不构成身份——startEvaluation 只认 intent_id，而 intent_id 在整个
// 生命周期里不变。于是这条时序成立：
//
//   t+0   宿主 A 领走意图 X，claim 到期时间 t+30s
//   t+31  权威释放过期领取（A 卡住了，可能在等一个死掉的模型）
//   t+32  宿主 B 领走同一个意图 X——这正是租约存在的目的
//   t+33  A 醒过来，拿着它记得的 intent_id 调 startEvaluation：成功，工作项被消费
//   t+34  B 调 startEvaluation：intent_not_found
//
// 结果是租约把活交给了 B，而 A 把它抢回去了。B 拿到的错误码还是「这个 id 现在不可用」，
// 与「我调错了」同一个码——B 无从知道自己被顶掉。
//
// 围栏的做法：每次领取铸一个新的 claim_token，随快照给领取方；startEvaluation 要求出示
// 当前那一个。旧 claimant 手里的是上一世代的令牌，对不上就拒。
//
// 令牌而不是自增计数：计数猜得到（拿 claim_count + 1 就能冒充下一世代），令牌猜不到。
// 这里的信任边界不高——都在本机——但两者成本一样，没有理由选可猜的那个。

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SeatAiStore,
  INTENT_CLAIM_LEASE_MS,
} = require("../src/authority/seat-ai-store.cjs");
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
      seatId, roomBindingId: ROOM, tableRulesVersion: RULES, acknowledged: true,
    });
  }
  return {
    store,
    at: () => now,
    advance(ms) { now += ms; return now; },
  };
}

// 排一个待办，返回未领取的快照。
function queue(store, eventId = "evt-1", seatId = "seat-1") {
  const intents = store.notifyDomainEvent({ type: "BET", eventId, payload: {} });
  const intent = intents.find((entry) => entry.seat_id === seatId);
  assert.ok(intent !== undefined && intent.intent_id !== undefined,
    `没排到待办: ${JSON.stringify(intent)}`);
  return intent;
}

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

test("围栏：领取的快照带 claim_token", () => {
  const t = table();
  queue(t.store);

  const claimed = t.store.claimIntents({ seatId: "seat-1" });
  assert.equal(claimed.length, 1, `应领到一个: ${JSON.stringify(claimed)}`);
  const token = claimed[0].claim_token;
  assert.equal(typeof token, "string", `claim_token 不是字符串: ${JSON.stringify(claimed[0])}`);
  assert.ok(token.length > 0, "claim_token 是空串");
});

test("围栏：每次重新领取都换一个新令牌", () => {
  const t = table();
  queue(t.store);

  const first = t.store.claimIntents({ seatId: "seat-1" })[0].claim_token;
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const second = t.store.claimIntents({ seatId: "seat-1" })[0].claim_token;

  assert.notEqual(first, second, "重新领取沿用了同一个令牌，那它就区分不出世代");
});

// 本文件的主证据。
test("围栏：旧 claimant 在重新领取之后不能启动计算", () => {
  const t = table();
  queue(t.store);

  // A 领走。
  const a = t.store.claimIntents({ seatId: "seat-1" })[0];
  assert.equal(typeof a.claim_token, "string");

  // A 卡住，租约到期，B 领走同一个意图。
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const b = t.store.claimIntents({ seatId: "seat-1" })[0];
  assert.equal(b.intent_id, a.intent_id, "应当是同一个意图被重新领取");
  assert.notEqual(b.claim_token, a.claim_token);

  // A 醒过来，拿旧令牌启动。必须被拒。
  assert.throws(
    () => t.store.startEvaluation({
      seatId: "seat-1", intentId: a.intent_id, claimToken: a.claim_token,
    }),
    probe("intent_claim_superseded"),
    "旧 claimant 用过期令牌启动了计算",
  );

  // B 用它自己的令牌启动，必须成功——围栏不能顺手把正当持有者也挡掉。
  const started = t.store.startEvaluation({
    seatId: "seat-1", intentId: b.intent_id, claimToken: b.claim_token,
  });
  assert.equal(started.type, "SEAT_AI_EVALUATION_STARTED", JSON.stringify(started));
});

test("围栏：旧 claimant 不出示令牌同样启动不了", () => {
  const t = table();
  const queued = queue(t.store);

  t.store.claimIntents({ seatId: "seat-1" });
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  t.store.claimIntents({ seatId: "seat-1" });

  // 「不带令牌」不能成为绕过围栏的办法，否则围栏只挡住了老实人。
  for (const missing of [undefined, null, "", 0]) {
    assert.throws(
      () => t.store.startEvaluation({
        seatId: "seat-1", intentId: queued.intent_id, claimToken: missing,
      }),
      (error) => error instanceof ProbeError
        && ["intent_claim_superseded", "invalid_field"].includes(error.code),
      `claimToken=${JSON.stringify(missing)} 时被放行了`,
    );
  }
});

test("围栏：伪造的令牌启动不了，且不泄露正确值", () => {
  const t = table();
  const claimed = (() => { queue(t.store); return t.store.claimIntents({ seatId: "seat-1" })[0]; })();

  let caught = null;
  try {
    t.store.startEvaluation({
      seatId: "seat-1", intentId: claimed.intent_id, claimToken: `${claimed.claim_token}-x`,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught !== null, "伪造令牌被接受了");
  assert.equal(caught.code, "intent_claim_superseded");
  // 错误详情不该回显正确令牌：那会把这里变成一个取令牌的接口。
  const detailText = JSON.stringify(caught.details ?? {});
  assert.ok(!detailText.includes(claimed.claim_token),
    `错误详情里回显了正确令牌: ${detailText}`);
});

// 租约到期但没人重新领取时，过期的那一方同样不能继续。
//
// 这一条比目标要求的更严：目标说的是「重新领取之后」。但「租约过期了」和「有别人接手了」
// 是两件事——前者已经足以说明这个 claimant 不再被授权。放过它意味着租约只是建议。
test("围栏：租约过期后即使无人接手，旧 claimant 也不能启动", () => {
  const t = table();
  const a = (() => { queue(t.store); return t.store.claimIntents({ seatId: "seat-1" })[0]; })();

  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  // 不让任何人重新领取，直接过期释放。
  t.store.releaseExpiredIntentClaims();

  assert.throws(
    () => t.store.startEvaluation({
      seatId: "seat-1", intentId: a.intent_id, claimToken: a.claim_token,
    }),
    probe("intent_claim_superseded"),
    "过期 claimant 在无人接手时被放行了",
  );

  // 重新领取之后照常可用：围栏挡的是世代，不是这个意图。
  const again = t.store.claimIntents({ seatId: "seat-1" })[0];
  const started = t.store.startEvaluation({
    seatId: "seat-1", intentId: again.intent_id, claimToken: again.claim_token,
  });
  assert.equal(started.type, "SEAT_AI_EVALUATION_STARTED");
});

test("围栏：正当持有者在租约内可以启动，不受围栏影响", () => {
  const t = table();
  const claimed = (() => { queue(t.store); return t.store.claimIntents({ seatId: "seat-1" })[0]; })();

  // 租约还剩 1 毫秒也算在内。
  t.advance(INTENT_CLAIM_LEASE_MS - 1);
  const started = t.store.startEvaluation({
    seatId: "seat-1", intentId: claimed.intent_id, claimToken: claimed.claim_token,
  });
  assert.equal(started.type, "SEAT_AI_EVALUATION_STARTED");
});

// 从未被领取的工作项仍可直接启动。
//
// notifyDomainEvent 的返回本身就是一份可用快照，宿主可以不再单独领一次就直接开工——
// 那是一条正当路径（少一次往返）。围栏只针对「曾经被领取过」的工作项：它一旦进入领取
// 机制，世代就开始有意义。
test("围栏：从未被领取的工作项不要求令牌", () => {
  const t = table();
  const queued = queue(t.store);

  const started = t.store.startEvaluation({ seatId: "seat-1", intentId: queued.intent_id });
  assert.equal(started.type, "SEAT_AI_EVALUATION_STARTED",
    "未经领取的直接启动被围栏挡掉了，这条正当路径不该被切断");
});

test("围栏：跨席检查仍然先于令牌检查", () => {
  const t = table(["seat-1", "seat-2"]);
  t.store.notifyDomainEvent({ type: "BET", eventId: "evt-1", payload: {} });
  const claimed = t.store.claimIntents();
  const one = claimed.find((entry) => entry.seat_id === "seat-1");
  assert.ok(one !== undefined, JSON.stringify(claimed));

  // 拿 seat-1 的工作项去开 seat-2 的回合。要求 5 点名的用例，错误码不该被围栏改写。
  assert.throws(
    () => t.store.startEvaluation({
      seatId: "seat-2", intentId: one.intent_id, claimToken: one.claim_token,
    }),
    probe("intent_seat_mismatch"),
  );

  // 两个条件同时不成立时才真正验证优先级：上面那一条的令牌是对的，所以把围栏挪到
  // 跨席检查之前也看不出差别。这里令牌也是旧的，两条都会命中，只有顺序能决定错误码。
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  t.store.claimIntents();
  assert.throws(
    () => t.store.startEvaluation({
      seatId: "seat-2", intentId: one.intent_id, claimToken: one.claim_token,
    }),
    probe("intent_seat_mismatch"),
    "跨席 + 旧令牌时回了「世代不对」，宿主会以为重领一次就能继续，而它其实是调错了席位",
  );
});

// 提交侧。旧 claimant 连回合都起不来，所以它没有 turn_id 可提交——
// 但这一条要实测，不能靠推理。
test("围栏：旧 claimant 拿不到 turn_id，因此提交不了任何计算", () => {
  const t = table();
  const a = (() => { queue(t.store); return t.store.claimIntents({ seatId: "seat-1" })[0]; })();

  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  const b = t.store.claimIntents({ seatId: "seat-1" })[0];

  assert.throws(() => t.store.startEvaluation({
    seatId: "seat-1", intentId: a.intent_id, claimToken: a.claim_token,
  }), probe("intent_claim_superseded"));

  const started = t.store.startEvaluation({
    seatId: "seat-1", intentId: b.intent_id, claimToken: b.claim_token,
  });
  const bTurn = started.payload.turn_id;

  // A 只可能猜一个 turn_id。猜不中就是 turn_not_active。
  assert.throws(
    () => t.store.resolveEvaluation({
      seatId: "seat-1", turnId: `${bTurn}-guessed`, decision: "silent",
      roomBindingId: ROOM, tableRulesVersion: RULES,
    }),
    probe("turn_not_active"),
  );

  // B 自己收尾照常。
  const resolved = t.store.resolveEvaluation({
    seatId: "seat-1", turnId: bTurn, decision: "silent",
    roomBindingId: ROOM, tableRulesVersion: RULES,
  });
  assert.equal(resolved.type, "SEAT_AI_SILENT");
});

test("围栏：被顶掉的一方看到的错误码与「id 不存在」不同", () => {
  const t = table();
  const a = (() => { queue(t.store); return t.store.claimIntents({ seatId: "seat-1" })[0]; })();
  t.advance(INTENT_CLAIM_LEASE_MS + 1);
  t.store.claimIntents({ seatId: "seat-1" });

  // 两种情形必须能区分：被顶掉 vs 这个 id 压根不存在。
  // 混成同一个码时，被顶掉的宿主只会以为自己调错了，然后无限重试。
  let superseded = null;
  try {
    t.store.startEvaluation({ seatId: "seat-1", intentId: a.intent_id, claimToken: a.claim_token });
  } catch (error) { superseded = error.code; }

  let unknown = null;
  try {
    t.store.startEvaluation({ seatId: "seat-1", intentId: "intent-never-existed", claimToken: "x" });
  } catch (error) { unknown = error.code; }

  assert.equal(superseded, "intent_claim_superseded");
  assert.equal(unknown, "intent_not_found");
  assert.notEqual(superseded, unknown);
});
