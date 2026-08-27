"use strict";

// F3：默认公开确认必须按席位记账。
//
// 这条不是 UI 缺口而是隐私同意边界：确认的内容是「我在游戏任务频道打的自由文本默认公开」，
// 只有该席的人能替自己接受。原实现把确认存成整桌单例，于是先到的一个调用者一按确认，
// 全桌所有从未见过这句话的玩家都被代为承诺了。
//
// 用命令面而不是编排层直接调，因为席位授权是命令面的职责——F3 要求 2 要的正是
// 「confirm_public_scope 加入席位授权」，绕过命令面就测不到它。

const assert = require("node:assert/strict");
const test = require("node:test");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { SeatAiStore } = require("../src/authority/seat-ai-store.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { chatBindingParams } = require("../test-support/action-binding.cjs");

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

// 建好房、拉够人，但**不做任何公开确认**：确认是每条用例自己的被测动作。
function table({ playerCount = 2 } = {}) {
  let now = 1_000;
  let id = 0;
  const surface = new CommandSurface({
    now: () => now,
    idFactory: () => `id-${++id}`,
    tokenFactory: () => `tok-${++id}`,
    deckFactory: deck,
  });

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

  return {
    s: surface,
    o: surface.orchestrator,
    room: created.room,
    inviteCode: created.invite_code,
    seats,
    auth: (index) => ({
      seat_id: seats[index].seat_id,
      recovery_credential: seats[index].credential,
    }),
    advance: (ms) => { now += ms; },
  };
}

function say(ctx, index, text) {
  return ctx.s.dispatch("chat.say", {
    ...ctx.auth(index),
    text,
    ...chatBindingParams(),
  });
}

test("F3 复现：一席确认后，从未确认的另一席也能发布 TABLE_PUBLIC", () => {
  const ctx = table();

  // 只有 0 号席确认。1 号席从头到尾没见过这句话。
  ctx.s.dispatch("room.confirm_public_scope", { ...ctx.auth(0), acknowledged: true });

  assert.throws(
    () => say(ctx, 1, "我从没确认过默认公开"),
    probe("default_public_scope_not_confirmed"),
    "未确认的席位不得发布 TABLE_PUBLIC——同意边界是按人给的，不是按桌给的",
  );

  // 而已确认的那一席正常。否则上面那条可能是被别的原因挡下来的。
  assert.equal(
    say(ctx, 0, "我确认过").published.scope,
    "TABLE_PUBLIC",
  );
});

test("F3 要求 2：确认必须带席位凭据，且必须显式 acknowledged", () => {
  const ctx = table();

  assert.throws(
    () => ctx.s.dispatch("room.confirm_public_scope", {}),
    probe("invalid_field"),
    "不带任何身份的确认必须被拒——原实现正是这样代全桌承诺的",
  );

  assert.throws(
    () => ctx.s.dispatch("room.confirm_public_scope", {
      seat_id: ctx.seats[0].seat_id,
      recovery_credential: "wrong-credential",
      acknowledged: true,
    }),
    probe("recovery_credential_rejected"),
  );

  // 借别人的席位号 + 自己的凭据：这是「替他人确认」最直接的形状。
  assert.throws(
    () => ctx.s.dispatch("room.confirm_public_scope", {
      seat_id: ctx.seats[1].seat_id,
      recovery_credential: ctx.seats[0].credential,
      acknowledged: true,
    }),
    probe("recovery_credential_rejected"),
  );

  // 凭据对但没有明确表态。acknowledged 必须由调用方传，编排层不得代填 true。
  for (const acknowledged of [undefined, false, "true", 1, null]) {
    assert.throws(
      () => ctx.s.dispatch("room.confirm_public_scope", {
        ...ctx.auth(0),
        ...(acknowledged === undefined ? {} : { acknowledged }),
      }),
      probe("default_public_scope_not_acknowledged"),
      `acknowledged=${JSON.stringify(acknowledged)} 不算表态`,
    );
  }
});

test("F3 要求 4：两席各自确认后互不影响，各自都能发言", () => {
  const ctx = table();
  for (const index of [0, 1]) {
    ctx.s.dispatch("room.confirm_public_scope", { ...ctx.auth(index), acknowledged: true });
  }
  for (const index of [0, 1]) {
    assert.equal(say(ctx, index, `第 ${index} 席发言`).published.scope, "TABLE_PUBLIC");
  }
});

test("F3 要求 1：确认事件记到席位，且带上三元组", () => {
  const ctx = table();
  const confirmed = ctx.s.dispatch("room.confirm_public_scope", {
    ...ctx.auth(0),
    acknowledged: true,
  }).confirmed;

  assert.equal(confirmed.seat_id, ctx.seats[0].seat_id);
  assert.equal(confirmed.room_binding_id, ctx.room.room_binding_id);
  assert.equal(confirmed.table_rules_version, RULES);
});

// 关闭 F3 时发现的第二个发布点。Codex 的要求 3 只点了 chat.say，但同一条规则 1 有两个
// TABLE_PUBLIC 出口：PLAYER_PUBLIC_SPEECH 与 AI_PUBLIC_SPEECH。
//
// 为什么这不是「AI 的事而与同意无关」：席位 AI 默认 mode 就是 ON（registerSeat 里写死），
// 而唤醒来源不止 PLAYER_PUBLIC_SPEECH——SEAT_ACTION_WINDOW_OPENED / BET / RAISE 都能唤醒。
// 于是一个刚入座、从未见过「你的自由文本默认公开」这句话的席位，只要牌桌开始行动，
// 它的 AI 就会替它往公开时间线上说话。这比玩家自己打字那条更严重：玩家连一个字都没打。
//
// 落点与玩家路径对称：门留在发布点（seat-ai-store 的 resolveEvaluation），房间事实由
// 编排层注入，宿主没有机会传错一个房间去过确认。
// 加入不等于表态，而且这件事必须体现在记录上，不能只体现在门的判定上。
//
// 这条是变异测试逼出来的。把新席位的初始 public_scope_confirmation 从 null 改成一份伪造的
// 确认（room_binding_id 填 null），整套 F3 测试仍然全绿——因为门会拿它和真实绑房比对，null
// 对不上，于是照样被拒。行为没变，所以行为断言杀不掉它；它也不发事件，所以事件断言也杀不掉。
//
// 但那份伪造记录是真缺陷：这一席从未表态，状态里却写着已同意。今天靠「null 对不上」侥幸拦住，
// 哪天有人把 null 补成真实绑房（看起来像修 bug），伪造的同意立刻生效。所以断言要落在记录上。
test("F3 要求 1：新加入的席位，确认记录必须是空的", () => {
  const ctx = table();
  for (const [index, seat] of ctx.seats.entries()) {
    const view = ctx.s.dispatch("view.seat", { seat_id: seat.seat_id });
    assert.equal(
      view.ai.public_scope_confirmation,
      null,
      `第 ${index} 席刚入座就带着确认记录：加入被当成了表态`,
    );
  }

  // 正面对照：确认之后记录必须出现，而且带的是真实房间事实。否则上面那条 null 断言可能
  // 只是因为这个字段永远是 null（比如投影里写死了），那它什么也证明不了。
  ctx.s.dispatch("room.confirm_public_scope", { ...ctx.auth(0), acknowledged: true });
  const confirmed = ctx.s.dispatch("view.seat", { seat_id: ctx.seats[0].seat_id });
  assert.equal(confirmed.ai.public_scope_confirmation.seat_id, ctx.seats[0].seat_id);
  assert.equal(confirmed.ai.public_scope_confirmation.room_binding_id, ctx.room.room_binding_id);
  assert.equal(confirmed.ai.public_scope_confirmation.table_rules_version, RULES);

  // 另一席不受影响：这是 F3 的本体，顺手在这里再钉一次。
  const other = ctx.s.dispatch("view.seat", { seat_id: ctx.seats[1].seat_id });
  assert.equal(other.ai.public_scope_confirmation, null, "一席确认把另一席也记成已确认");
});

test("F3 延伸：未确认的席位，其 AI 也不得发布 TABLE_PUBLIC", () => {
  const ctx = table();
  // 两席都不确认。开局所需的 Ready 与连接与公开确认无关，所以牌桌照样能跑起来。
  for (const index of [0, 1]) {
    ctx.s.dispatch("seat.connect", { ...ctx.auth(index), connection_id: `c-${index}` });
    ctx.s.dispatch("seat.ready", { ...ctx.auth(index), ready: true });
  }
  ctx.s.dispatch("hand.evaluate_start");
  ctx.advance(4_000);
  ctx.s.dispatch("hand.start_if_due");

  const intents = ctx.s.dispatch("ai.take_intents", ctx.auth(0));
  assert.ok(intents.intents.length > 0, "开局应当唤醒席位 AI，否则这条用例证不到东西");
  const intent = intents.intents[0];
  const owner = ctx.seats.findIndex((seat) => seat.seat_id === intent.seat_id);
  const auth = ctx.auth(owner);

  const started = ctx.s.dispatch("ai.start", { ...auth, intent_id: intent.intent_id });
  assert.throws(
    () => ctx.s.dispatch("ai.resolve", {
      ...auth,
      turn_id: started.started.turn_id,
      decision: "public_speech",
      text: "该席从未确认过默认公开",
    }),
    probe("default_public_scope_not_confirmed"),
    "未确认的席位，其 AI 同样不得往公开时间线上说话",
  );
});

// 房间事实由权威注入，宿主传什么都不算。
//
// 这条不走命令面，直接打编排层，因为命令面的 ai.resolve 是显式白名单构造参数，
// roomBindingId / tableRulesVersion 根本没有入口，从那里怎么试都试不出来。但
// resolveEvaluation 是编排层的公开方法，宿主适配器就是它的调用方。它今天安全只是因为
// 现有调用方恰好不传这两个字段——把关落在「恰好听话的调用方」上，不落在发生变更的地方，
// 那就不是把关。
//
// 判别方式是让权威事实与宿主事实冲突，然后看谁赢：本席确认的是真房间，宿主塞进来的是
// 假房间。权威赢则调用成功，宿主赢则确认门当场判定「没确认过这个房间」而拒掉。所以
// 这条断言的是**成功**，一条断言拒绝的测试在这里反而抓不到东西。
test("F3 要求 1：AI 结算路径的房间事实由权威注入，宿主传的不算", () => {
  const ctx = table();
  for (const index of [0, 1]) {
    ctx.s.dispatch("seat.connect", { ...ctx.auth(index), connection_id: `c-${index}` });
    ctx.s.dispatch("seat.ready", { ...ctx.auth(index), ready: true });
    // 两席都就真实房间确认过。哪一席先被唤醒由引擎定，两席都确认才不会让这条用例
    // 时不时地因为「恰好轮到没确认的那席」而变成在测别的东西。
    ctx.s.dispatch("room.confirm_public_scope", { ...ctx.auth(index), acknowledged: true });
  }
  ctx.s.dispatch("hand.evaluate_start");
  ctx.advance(4_000);
  ctx.s.dispatch("hand.start_if_due");

  const intent = ctx.s.dispatch("ai.take_intents", ctx.auth(0)).intents[0];
  assert.ok(intent !== undefined, "开局应当唤醒席位 AI，否则这条用例证不到东西");
  const owner = ctx.seats.findIndex((seat) => seat.seat_id === intent.seat_id);
  const auth = ctx.auth(owner);
  const started = ctx.s.dispatch("ai.start", { ...auth, intent_id: intent.intent_id });

  // 冲突的前提得先成立：假值必须真的不等于真值，否则「权威赢」和「宿主赢」结果一样，
  // 这条用例就退化成一个永远绿的空壳。
  const hostile = { roomBindingId: "hostile-binding", tableRulesVersion: "hostile-rules" };
  assert.notEqual(hostile.roomBindingId, ctx.room.room_binding_id);
  assert.notEqual(hostile.tableRulesVersion, RULES);

  const resolved = ctx.o.resolveEvaluation({
    seatId: intent.seat_id,
    turnId: started.started.turn_id,
    decision: "public_speech",
    text: "权威事实必须压过宿主传来的",
    ...hostile,
  });
  // 编排层这一层直接返回权威事件本身（不像 submitPlayerText 会包一层 published），
  // 所以断言落在事件类型上：发布成功才有 AI_PUBLIC_SPEECH。
  assert.equal(
    resolved.type,
    "AI_PUBLIC_SPEECH",
    "宿主传的假房间盖掉了权威事实：宿主可以指定一个自己确认过的房间去过门",
  );
  assert.equal(resolved.payload.scope, "TABLE_PUBLIC");
  assert.equal(resolved.payload.seat_id, intent.seat_id);
});

test("F3 延伸：未确认的席位仍能把在途回合结算为 silent，回合不会卡死", () => {
  // 这条是上一条的必要配套。若把门加在整个 resolveEvaluation 之前，未确认席位的在途回合
  // 就再也结算不掉，该席 AI 从此永久占着闸门——修一个同意洞换来一个活性洞。
  // silent 什么都不发布，所以它不需要任何同意。
  const ctx = table();
  for (const index of [0, 1]) {
    ctx.s.dispatch("seat.connect", { ...ctx.auth(index), connection_id: `c-${index}` });
    ctx.s.dispatch("seat.ready", { ...ctx.auth(index), ready: true });
  }
  ctx.s.dispatch("hand.evaluate_start");
  ctx.advance(4_000);
  ctx.s.dispatch("hand.start_if_due");

  const intent = ctx.s.dispatch("ai.take_intents", ctx.auth(0)).intents[0];
  const owner = ctx.seats.findIndex((seat) => seat.seat_id === intent.seat_id);
  const auth = ctx.auth(owner);
  const started = ctx.s.dispatch("ai.start", { ...auth, intent_id: intent.intent_id });
  const resolved = ctx.s.dispatch("ai.resolve", {
    ...auth,
    turn_id: started.started.turn_id,
    decision: "silent",
  });
  // handler 返回的是事件 payload，不含 type。能拿到该回合的 turn_id 就说明这一回合
  // 正常结算掉了，闸门没有被永久占住。
  assert.equal(resolved.resolved.turn_id, started.started.turn_id);
  // 而且没有任何东西被发布到公开时间线上。
  assert.deepEqual(
    ctx.s.dispatch("view.timeline", {}).timeline.filter((row) => row.speaker_type === "SEAT_AI"),
    [],
  );
});

test("F3 要求 3：桌规版本变化后，原确认失效，必须重新确认", () => {
  // 产品里没有改桌规版本的写入点（RoomStore 只在建房时写一次），所以这条只能直接驱动
  // SeatAiStore。不为了测试去发明一个改版本的产品 API：那会把未确认的语义先做进来。
  const store = new SeatAiStore({ now: () => 1_000, idFactory: () => "id-1" });
  store.registerSeat({ seatId: "seat-1", playerId: "p1" });
  store.confirmDefaultPublicScope({
    seatId: "seat-1",
    roomBindingId: "bind-1",
    tableRulesVersion: "table-rules-v1",
    acknowledged: true,
  });

  const speak = (roomBindingId, tableRulesVersion) => store.submitPlayerText({
    seatId: "seat-1",
    text: "试试",
    roomBindingId,
    tableRulesVersion,
  });

  assert.equal(speak("bind-1", "table-rules-v1").published.payload.scope, "TABLE_PUBLIC");
  assert.throws(() => speak("bind-1", "table-rules-v2"), probe("default_public_scope_not_confirmed"));
  assert.throws(() => speak("bind-2", "table-rules-v1"), probe("default_public_scope_not_confirmed"));
});

test("F3 要求 4：离桌后凭据吊销，无法再确认；重新加入的新席位要自己确认", () => {
  const ctx = table({ playerCount: 3 });
  ctx.s.dispatch("room.confirm_public_scope", { ...ctx.auth(1), acknowledged: true });
  ctx.s.dispatch("seat.leave", ctx.auth(1));

  assert.throws(
    () => ctx.s.dispatch("room.confirm_public_scope", { ...ctx.auth(1), acknowledged: true }),
    probe("seat_credential_revoked"),
  );

  // 同一个人重新加入拿到的是新席位号。确认跟着席位走而不跟着人走，所以新席位必须重新确认。
  const rejoined = ctx.s.dispatch("room.join", {
    player_id: "p2",
    invite_code: ctx.inviteCode,
  });
  assert.notEqual(rejoined.seat.seat_id, ctx.seats[1].seat_id, "重新加入应得到新席位号");

  const rejoinedAuth = {
    seat_id: rejoined.seat.seat_id,
    recovery_credential: rejoined.recovery_credential,
  };
  assert.throws(
    () => ctx.s.dispatch("chat.say", { ...rejoinedAuth, text: "刚回来", ...chatBindingParams() }),
    probe("default_public_scope_not_confirmed"),
  );
  ctx.s.dispatch("room.confirm_public_scope", { ...rejoinedAuth, acknowledged: true });
  assert.equal(
    ctx.s.dispatch("chat.say", { ...rejoinedAuth, text: "确认过了", ...chatBindingParams() })
      .published.scope,
    "TABLE_PUBLIC",
  );
});
