"use strict";

// 命令面回归：只验证信任边界与派发本身，不重复验证内核规则。
// 关注点三个：未知命令与非法参数是否确定性拒绝、凭据授权是否真的拦得住、
// 凭据是否只出现一次。外加一条端到端：整局只经 dispatch 能打完。

const assert = require("node:assert/strict");
const test = require("node:test");
const { CommandSurface, SEAT_AUTHORIZED } = require("../src/authority/command-surface.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const {
  actionBindingFromProjection,
  chatBindingParams,
} = require("../test-support/action-binding.cjs");
const { confirmAllSeatsViaSurface } = require("../test-support/public-scope.cjs");

const RULES = "table-rules-v1";

function probe(code) {
  return (error) => error instanceof ProbeError && error.code === code;
}

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

// 只经 dispatch 建起来的牌桌。测试里刻意不碰 orchestrator/内核，
// 这样「命令面本身够不够用」才有意义。
function surface({ playerCount = 2 } = {}) {
  let now = 1_000;
  let id = 0;
  const s = new CommandSurface({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
  });

  const created = s.dispatch("room.create", {
    player_id: "p1",
    table_rules_version: RULES,
  });
  const seats = [{ seat_id: created.seat.seat_id, credential: created.recovery_credential }];
  for (let index = 2; index <= playerCount; index += 1) {
    const joined = s.dispatch("room.join", {
      player_id: `p${index}`,
      invite_code: created.invite_code,
    });
    seats.push({ seat_id: joined.seat.seat_id, credential: joined.recovery_credential });
  }
  // F3：确认按席位记账，逐席带凭据确认。
  confirmAllSeatsViaSurface(s, seats);
  for (const seat of seats) {
    s.dispatch("seat.connect", { seat_id: seat.seat_id, connection_id: `c-${seat.seat_id}` });
  }

  return {
    s,
    room: created.room,
    inviteCode: created.invite_code,
    seats,
    at: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

// 走到首手已开始。全程只用 dispatch。
function begin(ctx) {
  for (const seat of ctx.seats) {
    ctx.s.dispatch("seat.ready", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      ready: true,
    });
  }
  ctx.s.dispatch("hand.evaluate_start");
  ctx.advance(TABLE_LIFECYCLE_V1.readyCountdownMs);
  return ctx.s.dispatch("hand.start_if_due");
}

function silenceAll(ctx) {
  for (const seat of ctx.seats) {
    ctx.s.dispatch("ai.set_mode", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      mode: "OFF",
    });
  }
}

// 当前该谁行动，换算成 seat_id。
function actorSeat(ctx) {
  const hand = ctx.s.orchestrator.hand;
  const playerId = hand.seats[hand.actorIndex].id;
  const seatId = ctx.s.orchestrator.playerToSeat.get(playerId);
  return ctx.seats.find((seat) => seat.seat_id === seatId);
}

test("派发：未知命令被拒绝，并回报已知命令表", () => {
  const ctx = surface();
  assert.throws(() => ctx.s.dispatch("room.destroy"), probe("unknown_command"));
  try {
    ctx.s.dispatch("room.destroy");
  } catch (error) {
    assert.ok(error.details.known_commands.includes("room.create"));
    assert.ok(!error.details.known_commands.includes("room.destroy"));
  }
});

test("派发：命令名与参数的形状都被确定性校验", () => {
  const ctx = surface();
  assert.throws(() => ctx.s.dispatch(""), probe("invalid_field"));
  assert.throws(() => ctx.s.dispatch(null), probe("invalid_field"));
  assert.throws(() => ctx.s.dispatch("view.projection", []), probe("invalid_field"));
  assert.throws(() => ctx.s.dispatch("view.projection", "nope"), probe("invalid_field"));
  // 只读命令不需要参数。
  assert.ok(ctx.s.dispatch("view.projection") !== null);
});

test("授权：每条需授权命令在凭据缺失时都被拒绝", () => {
  const ctx = surface();
  const seatId = ctx.seats[0].seat_id;
  for (const command of SEAT_AUTHORIZED) {
    assert.throws(
      () => ctx.s.dispatch(command, { seat_id: seatId }),
      probe("invalid_field"),
      `${command} 缺凭据必须被拒`,
    );
  }
});

test("授权：伪造凭据被拒绝，且不改变任何状态", () => {
  const ctx = surface();
  const seatId = ctx.seats[0].seat_id;
  const before = JSON.stringify(ctx.s.dispatch("view.projection"));

  assert.throws(
    () => ctx.s.dispatch("seat.ready", {
      seat_id: seatId,
      recovery_credential: "tok-forged",
      ready: true,
    }),
    probe("recovery_credential_rejected"),
  );
  assert.equal(JSON.stringify(ctx.s.dispatch("view.projection")), before, "状态不得变化");
});

test("授权：拿别人的凭据操作自己的席位同样被拒绝", () => {
  const ctx = surface();
  assert.throws(
    () => ctx.s.dispatch("seat.leave", {
      seat_id: ctx.seats[0].seat_id,
      recovery_credential: ctx.seats[1].credential,
    }),
    probe("recovery_credential_rejected"),
  );
  assert.equal(ctx.s.dispatch("view.seat", { seat_id: ctx.seats[0].seat_id }).seat.state, "SEATED");
});

test("授权：席位释放后凭据即失效", () => {
  const ctx = surface();
  const seat = ctx.seats[0];
  ctx.s.dispatch("seat.leave", {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential,
  });
  assert.equal(ctx.s.dispatch("view.seat", { seat_id: seat.seat_id }).seat.state, "RELEASED");
  assert.throws(
    () => ctx.s.dispatch("seat.ready", {
      seat_id: seat.seat_id,
      recovery_credential: seat.credential,
      ready: true,
    }),
    probe("seat_credential_revoked"),
  );
});

test("授权：牌局动作与亮牌同样需要凭据", () => {
  const ctx = surface();
  silenceAll(ctx);
  begin(ctx);
  const who = actorSeat(ctx);

  assert.throws(
    () => ctx.s.dispatch("hand.act", {
      seat_id: who.seat_id,
      recovery_credential: "tok-forged",
      action: "fold",
    }),
    probe("recovery_credential_rejected"),
  );
  assert.throws(
    () => ctx.s.dispatch("hand.reveal", {
      seat_id: who.seat_id,
      recovery_credential: "tok-forged",
    }),
    probe("recovery_credential_rejected"),
  );
  assert.equal(ctx.s.orchestrator.hand.status, "active", "被拒的动作不得影响牌局");
});

test("凭据：只在创建、加入与恢复的返回里出现，任何投影与事件都不含", () => {
  const ctx = surface({ playerCount: 3 });
  silenceAll(ctx);
  begin(ctx);

  const surfaces = [
    ctx.s.dispatch("view.projection"),
    ctx.s.dispatch("view.timeline"),
    ctx.s.dispatch("view.room_events"),
    ctx.s.dispatch("view.ai_events"),
    ctx.s.dispatch("view.seat", { seat_id: ctx.seats[0].seat_id }),
    ctx.s.dispatch("hand.evaluate_start"),
  ];
  for (const payload of surfaces) {
    const serialized = JSON.stringify(payload);
    assert.ok(!serialized.includes("tok-"), "任何只读面都不得出现令牌");
    assert.ok(
      !serialized.includes("recovery_credential"),
      "任何只读面都不得出现凭据字段",
    );
  }
});

test("凭据：恢复席位返回新连接，且旧凭据仍可继续用", () => {
  const ctx = surface();
  const seat = ctx.seats[0];
  ctx.s.dispatch("seat.disconnect", {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential,
    connection_id: `c-${seat.seat_id}`,
  });

  const recovered = ctx.s.dispatch("seat.recover", {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential,
    connection_id: "c-again",
  });
  assert.ok(recovered !== null);
  // 规则 2：回到原房间原座位，不是第二身份。
  assert.equal(ctx.s.dispatch("view.seat", { seat_id: seat.seat_id }).seat.seat_id, seat.seat_id);
});

test("命令面不具备出网能力：不引用任何模型或网络接口", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "authority", "command-surface.cjs"),
    "utf8",
  );
  for (const forbidden of ["node:http", "node:https", "node:net", "fetch(", "XMLHttpRequest"]) {
    assert.ok(!source.includes(forbidden), `命令面不得引用 ${forbidden}`);
  }
});

test("AI：意图取走后由适配器回填，命令面自己不产生话术", () => {
  const ctx = surface({ playerCount: 3 });
  begin(ctx);

  // 现在按席位取：每席各自凭据，只能取走自己那份。
  const holder = ctx.seats[0];
  const take = () => ctx.s.dispatch("ai.take_intents", {
    seat_id: holder.seat_id,
    recovery_credential: holder.credential,
  }).intents;

  const intents = take();
  assert.ok(intents.length > 0, "开局必然产生意图");
  assert.ok(
    intents.every((i) => i.seat_id === holder.seat_id),
    `按席位取只应拿到本席的意图: ${JSON.stringify(intents)}`,
  );
  assert.deepEqual(take(), [], "取走即清空");

  const intent = intents[0];
  const started = ctx.s.dispatch("ai.start", {
    seat_id: intent.seat_id,
    recovery_credential: holder.credential,
    context: intent.context,
  });
  assert.equal(typeof started.started.turn_id, "string");

  const resolved = ctx.s.dispatch("ai.resolve", {
    seat_id: intent.seat_id,
    recovery_credential: holder.credential,
    turn_id: started.started.turn_id,
    decision: "public_speech",
    text: "这手我看看",
  });
  assert.equal(resolved.resolved.seat_id, intent.seat_id);
  const timeline = ctx.s.dispatch("view.timeline").timeline;
  assert.equal(timeline.at(-1).type, "AI_PUBLIC_SPEECH");
  assert.equal(timeline.at(-1).payload.text, "这手我看看");
  assert.equal(timeline.at(-1).payload.poker_action_effect, null, "AI 话术永无动作效力");
});

test("AI：本地隐藏不写权威事件", () => {
  const ctx = surface({ playerCount: 3 });
  const before = ctx.s.dispatch("view.ai_events").events.length;
  const hidden = ctx.s.dispatch("ai.hide_local", {
    seat_id: ctx.seats[0].seat_id,
    recovery_credential: ctx.seats[0].credential,
    target: "seat",
    target_id: ctx.seats[1].seat_id,
  });
  assert.equal(hidden.hidden, true);
  assert.equal(ctx.s.dispatch("view.ai_events").events.length, before, "不得写权威事件");
});

test("端到端：整局只经 dispatch 打完，两个内核的手序同步推进", () => {
  const ctx = surface({ playerCount: 2 });
  silenceAll(ctx);
  const started = begin(ctx);
  assert.equal(started.started, true);
  assert.equal(started.hand_index, 1);

  // 一方弃牌结束本手。
  const who = actorSeat(ctx);
  ctx.s.dispatch("hand.act", {
    seat_id: who.seat_id,
    recovery_credential: who.credential,
    action: "fold",
    ...actionBindingFromProjection(ctx.s.dispatch("view.projection").public_hand),
  });

  const projection = ctx.s.dispatch("view.projection");
  assert.equal(projection.hand.status, "complete");

  // 手间展示后自动续局，无需重新 Ready。
  ctx.advance(TABLE_LIFECYCLE_V1.interHandDisplayMs);
  const next = ctx.s.dispatch("hand.start_if_due");
  assert.equal(next.started, true);
  assert.equal(next.hand_index, 2);
  assert.equal(ctx.s.orchestrator.ai.handIndex, 2);
});

test("端到端：开局门禁未满足时 hand.start_if_due 回报原因而不是开局", () => {
  const ctx = surface();
  const outcome = ctx.s.dispatch("hand.start_if_due");
  assert.equal(outcome.started, false);
  assert.equal(outcome.decision.can_start, false);
  assert.equal(outcome.decision.reason, "awaiting_ready");
  assert.equal(ctx.s.dispatch("view.projection").hand, null);
});

test("端到端：公开发言经命令面进入时间线，并产生可回填的意图", () => {
  const ctx = surface({ playerCount: 3 });
  begin(ctx);
  // 只是清干净开局意图，不是在测命令路径；命令面现在按席位取，全清走内核。
  ctx.s.orchestrator.takeIntents();

  const said = ctx.s.dispatch("chat.say", {
    seat_id: ctx.seats[0].seat_id,
    recovery_credential: ctx.seats[0].credential,
    text: "我这把跟到底",
    ...chatBindingParams(),
  });
  assert.equal(said.published.text, "我这把跟到底");
  assert.equal(said.published.poker_action_effect, null, "公开话术永无牌局动作效力");
  assert.ok(said.intent_count > 0);
});

test("端到端：LOCAL_CONTROL 通道不公开、不进 AI 上下文", () => {
  const ctx = surface({ playerCount: 2 });
  const before = ctx.s.dispatch("view.timeline").timeline.length;
  const said = ctx.s.dispatch("chat.say", {
    seat_id: ctx.seats[0].seat_id,
    recovery_credential: ctx.seats[0].credential,
    text: "把我的 AI 关掉",
    channel: "LOCAL_CONTROL",
    ...chatBindingParams(),
  });
  assert.equal(said.local_control, true);
  assert.equal(said.published, null);
  assert.equal(said.intent_count, 0);
  assert.equal(ctx.s.dispatch("view.timeline").timeline.length, before);
});

// ---------------------------------------------------------------- 隐藏信息边界
// L0 根合同把「隐藏信息边界」列为产品核心，并要求不由任一玩家宿主掌握牌堆、对手底牌
// 或结算权。view.hand 是全系统唯一吐出底牌的出口，下面几条钉住它的边界。

// 逐席都问一遍，不能只问首席。若 viewerId 被写死成某一席，只问首席的测试会通过——
// 这是变异测试实际暴露出来的漏洞，不是假想。
test("隐藏信息：每一席都只看得见自己的两张底牌", () => {
  const ctx = surface({ playerCount: 3 });
  begin(ctx);

  for (const me of ctx.seats) {
    const view = ctx.s.dispatch("view.hand", {
      seat_id: me.seat_id,
      recovery_credential: me.credential,
    }).hand;

    const myPlayerId = ctx.s.orchestrator.requirePlayerId(me.seat_id);
    const mine = view.seats.find((seat) => seat.id === myPlayerId);
    const others = view.seats.filter((seat) => seat.id !== myPlayerId);

    assert.equal(mine.hole_cards.length, 2, `${me.seat_id} 应当看见自己的底牌`);
    assert.ok(others.length > 0, "必须真的有对手，否则这条测试是空的");
    for (const seat of others) {
      assert.equal(seat.hole_cards, null, `${me.seat_id} 不得看见 ${seat.id} 的底牌`);
    }
  }
});

test("隐藏信息：拿别人的 seat_id 配自己的凭据，读不到对手的牌", () => {
  const ctx = surface({ playerCount: 2 });
  begin(ctx);
  const attacker = ctx.seats[0];
  const victim = ctx.seats[1];

  // 用受害者的 seat_id 加攻击者自己的凭据——凭据是真的，只是不属于这个席位。
  assert.throws(
    () => ctx.s.dispatch("view.hand", {
      seat_id: victim.seat_id,
      recovery_credential: attacker.credential,
    }),
    probe("recovery_credential_rejected"),
  );
});

test("隐藏信息：牌堆与未来的牌不出现在任何投影里", () => {
  const ctx = surface({ playerCount: 2 });
  begin(ctx);
  const me = ctx.seats[0];
  const serialized = JSON.stringify({
    seat_view: ctx.s.dispatch("view.hand", {
      seat_id: me.seat_id,
      recovery_credential: me.credential,
    }),
    projection: ctx.s.dispatch("view.projection"),
  });
  for (const key of ["deck", "deckCursor", "deck_cursor"]) {
    assert.equal(serialized.includes(key), false, `投影里不得出现 ${key}`);
  }
});

test("隐藏信息：无凭据的公开投影有公共牌与底池，但没有任何底牌", () => {
  const ctx = surface({ playerCount: 2 });
  begin(ctx);
  const publicHand = ctx.s.dispatch("view.projection").public_hand;

  assert.ok(publicHand !== null, "开局后公开投影应当有牌局");
  assert.ok(Array.isArray(publicHand.board), "公共牌属公开信息");
  assert.equal(typeof publicHand.pot_total, "number", "底池属公开信息");
  assert.ok(publicHand.actor_player_id !== undefined, "当前行动者属公开信息");
  for (const seat of publicHand.seats) {
    assert.equal(seat.hole_cards, null, "公开投影不得出现任何底牌");
  }
  assert.deepEqual(publicHand.legal_actions, [], "无观众身份就没有合法动作");
});

test("隐藏信息：开局后入座的席位拿到旁观视图，而不是 unknown_player 错误", () => {
  const ctx = surface({ playerCount: 2 });
  begin(ctx);
  const latecomer = ctx.s.dispatch("room.join", {
    player_id: "p-late",
    invite_code: ctx.inviteCode,
  });

  // 已绑房但不在本手 roster 里。这是正常状态，不是错误。
  const view = ctx.s.dispatch("view.hand", {
    seat_id: latecomer.seat.seat_id,
    recovery_credential: latecomer.recovery_credential,
  }).hand;

  assert.ok(view !== null);
  for (const seat of view.seats) {
    assert.equal(seat.hole_cards, null, "轮空席位不得看见任何底牌");
  }
  assert.deepEqual(view.legal_actions, []);
});

test("隐藏信息：开局前问牌返回 null，不是错误", () => {
  const ctx = surface({ playerCount: 2 });
  const me = ctx.seats[0];
  const view = ctx.s.dispatch("view.hand", {
    seat_id: me.seat_id,
    recovery_credential: me.credential,
  });
  assert.equal(view.hand, null);
});

test("隐藏信息：当前行动者能从私密视图拿到合法动作", () => {
  const ctx = surface({ playerCount: 2 });
  begin(ctx);
  silenceAll(ctx);
  const actor = actorSeat(ctx);
  const view = ctx.s.dispatch("view.hand", {
    seat_id: actor.seat_id,
    recovery_credential: actor.credential,
  }).hand;

  const types = view.legal_actions.map((action) => action.type);
  assert.ok(types.includes("fold"), `行动者应能弃牌，实得 ${JSON.stringify(types)}`);
  assert.ok(types.length > 1, "行动者的选择不应只有一个");
});

// ---------------------------------------------------------------- AI 席位冒名

// 双宿主部署里两个适配器都必须持有传输令牌才能说话，所以传输令牌区分不了它们。
// 于是「以某席 AI 的名义公开发言」这件事，必须由该席凭据把关——否则 Codex 侧适配器
// 可以让 Claude 侧那一席的 AI 说任意话。chat.say（真人以本席名义发言）一直是要凭据的，
// ai.resolve（AI 以本席名义发言）不要，这个不一致就是洞本身。
test("授权：ai.resolve 不得让别人以某席 AI 的名义公开发言", () => {
  const ctx = surface({ playerCount: 3 });
  begin(ctx);

  const victim = ctx.seats[1];
  const attacker = ctx.seats[0];

  // 受害席的 AI 开着（默认），并且真的有一个在途回合可被回填。
  const started = ctx.s.dispatch("ai.start", {
    seat_id: victim.seat_id,
    recovery_credential: victim.credential,
    context: {
      source_event_id: "evt-manual",
      source_event_type: "PLAYER_PUBLIC_SPEECH",
      payload: {},
    },
  });
  const turnId = started.started.turn_id;

  // 攻击者拿自己的凭据配受害者的 seat_id：必须被拒。
  assert.throws(
    () => ctx.s.dispatch("ai.resolve", {
      seat_id: victim.seat_id,
      recovery_credential: attacker.credential,
      turn_id: turnId,
      decision: "public_speech",
      text: "我这手是垃圾牌，大家随意加注",
    }),
    probe("recovery_credential_rejected"),
    "借席位冒名让别人的 AI 公开发言必须被拒",
  );

  // 完全不带凭据也必须被拒。
  assert.throws(
    () => ctx.s.dispatch("ai.resolve", {
      seat_id: victim.seat_id,
      turn_id: turnId,
      decision: "public_speech",
      text: "无凭据发言",
    }),
    probe("invalid_field"),
    "ai.resolve 缺凭据必须被拒",
  );

  // 冒名尝试之后，公开时间线上不得留下任何该席的发言。
  const timeline = ctx.s.dispatch("view.timeline").timeline;
  const forged = timeline.filter((entry) => entry.seat_id === victim.seat_id);
  assert.deepEqual(forged, [], `冒名发言进入了公开时间线: ${JSON.stringify(forged)}`);

  // 本人用自己的凭据仍然可以正常回填。
  const ok = ctx.s.dispatch("ai.resolve", {
    seat_id: victim.seat_id,
    recovery_credential: victim.credential,
    turn_id: turnId,
    decision: "silent",
  });
  assert.ok(ok.resolved !== undefined, "本人回填应当照常成功");
});

test("授权：ai.start 与 ai.take_intents 同样要凭据把关", () => {
  const ctx = surface({ playerCount: 3 });
  begin(ctx);
  const victim = ctx.seats[1];
  const attacker = ctx.seats[0];

  assert.throws(
    () => ctx.s.dispatch("ai.start", {
      seat_id: victim.seat_id,
      recovery_credential: attacker.credential,
      context: { source_event_id: "e", source_event_type: "PLAYER_PUBLIC_SPEECH", payload: {} },
    }),
    probe("recovery_credential_rejected"),
    "替别人的席位启动 AI 评估必须被拒",
  );

  // 意图是「该席的 AI 该被唤醒了」这一事实，取走即消费。别人取走等于让该席 AI 静默。
  assert.throws(
    () => ctx.s.dispatch("ai.take_intents", {
      seat_id: victim.seat_id,
      recovery_credential: attacker.credential,
    }),
    probe("recovery_credential_rejected"),
    "取走别人席位的意图必须被拒",
  );
});

// 这条钉的是真正的饿死性质：我取走之后，别席的意图必须还在。
// 「我没拿到别人的」和「别人还拿得到自己的」是两回事，前者过了后者也可能挂——
// 双宿主部署里坏的正是后者：先轮询的一方清空队列，对面那些席的 AI 从此静默。
test("AI：按席位取意图不会饿死另一个适配器负责的席位", () => {
  const ctx = surface({ playerCount: 3 });
  begin(ctx);

  const [a, b] = ctx.seats;
  const take = (seat) => ctx.s.dispatch("ai.take_intents", {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential,
  }).intents;

  const mine = take(a);
  assert.ok(mine.length > 0, "开局必然给每席产生意图");

  const theirs = take(b);
  assert.ok(
    theirs.length > 0,
    "我取走之后另一席的意图必须还在，否则对面适配器永远等不到唤醒",
  );
  assert.ok(
    theirs.every((i) => i.seat_id === b.seat_id),
    `另一席只应拿到自己的: ${JSON.stringify(theirs)}`,
  );

  // 各自都已取空，互不影响。
  assert.deepEqual(take(a), []);
  assert.deepEqual(take(b), []);
});
