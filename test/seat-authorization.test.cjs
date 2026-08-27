"use strict";

// F4：席位状态写命令必须逐条过席位授权，且集合不得自证完整。
//
// 直接缺陷是 seat.connect 不在 SEAT_AUTHORIZED 里：只持外层传输令牌、不持席位凭据的
// 调用者可以为任意席位添加连接，从而把 retention_expires_at 清空。后果不是「多了一条
// 假在线记录」，而是**阻止另一席进入掉线保留与释放流程**——被顶住的席位永远等不到
// releaseExpiredSeats，位子不还，桌子也凑不齐下一手。
//
// 第二个缺陷是结构性的：授权靠 dispatch 里一句 SEAT_AUTHORIZED.includes(name)，而
// hand.act / hand.reveal 又各自在 handler 里自验凭据。于是「有没有把关」这件事有两个
// 来源，任何新命令都可能两边都没落。所以本文件的第二段不查集合，改用行为探测：
// 手写一份「这些命令写席位状态」的期望清单，逐条发伪造凭据，断言必须被拒。
// 集合遗漏时，这段会因为伪造凭据居然成功而失败。
//
// 这段不是和 command-surface.test.cjs 的授权测试重复。那边写的是
// `for (const command of SEAT_AUTHORIZED)`——枚举的正是可能出错的那个集合，集合漏一条
// 它就跟着漏一条。实测过：把 "seat.connect" 从集合里删掉，
//   mutate-check … test/command-surface.test.cjs  -> SURVIVED
//   mutate-check … test/seat-authorization.test.cjs -> KILLED
// 那边还有第二个弱点：它只传 { seat_id }，所以摘掉把关后缺 connection_id 也会抛
// invalid_field，看起来仍像「被拒了」。本文件的探测因此把参数给全（见 forgedParams）。

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CommandSurface,
  SEAT_AUTHORIZED,
} = require("../src/authority/command-surface.cjs");
const { ProbeError } = require("../src/authority/event-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { confirmAllSeatsViaSurface } = require("../test-support/public-scope.cjs");

const RULES = "table-rules-v1";
const FORGED = "forged-credential-0000";

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

function table({ playerCount = 2, confirm = true } = {}) {
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
  if (confirm) {
    confirmAllSeatsViaSurface(surface, seats);
  }

  return {
    s: surface,
    o: surface.orchestrator,
    room: created.room,
    seats,
    auth: (index) => ({
      seat_id: seats[index].seat_id,
      recovery_credential: seats[index].credential,
    }),
    advance: (ms) => { now += ms; },
    seatState: (index) => surface.orchestrator.rooms.seatState(seats[index].seat_id),
  };
}

// 把一席打到「掉线且正在保留倒计时」的状态——被攻击的就是这个窗口。
function disconnected(ctx, index) {
  const connectionId = `conn-${index}`;
  ctx.s.dispatch("seat.connect", { ...ctx.auth(index), connection_id: connectionId });
  ctx.s.dispatch("seat.disconnect", { ...ctx.auth(index), connection_id: connectionId });
  const state = ctx.seatState(index);
  assert.equal(state.state, "DISCONNECTED");
  // 投影只给剩余毫秒，不给绝对到期时刻——这本身是对的，所以断言也用剩余量。
  assert.equal(state.retention_remaining_ms, 120_000);
  assert.equal(state.connected, false);
  return state.retention_remaining_ms;
}

// --------------------------------------------------------------- 直接复现

test("F4 复现：无席位凭据的调用者能为他席建连并清掉保留倒计时", () => {
  const ctx = table();
  const retentionAt = disconnected(ctx, 1);

  // 攻击者只有外层传输令牌（能走到 dispatch 就已经代表它有），没有 1 号席的凭据。
  assert.throws(
    () => ctx.s.dispatch("seat.connect", {
      seat_id: ctx.seats[1].seat_id,
      connection_id: "attacker-conn",
    }),
    (error) => error instanceof ProbeError && error.code === "invalid_field",
  );

  const after = ctx.seatState(1);
  assert.equal(after.state, "DISCONNECTED", "他席状态不该被外人改回在线");
  assert.equal(after.retention_remaining_ms, retentionAt, "保留倒计时必须原样保留");
  assert.equal(after.connected, false);
});

test("F4：被顶住保留窗后，席位仍能按时释放", () => {
  // 这条才是 F4 的影响面。上一条证明连接建不起来，这条证明「因此释放流程没被阻断」。
  const ctx = table();
  disconnected(ctx, 1);

  try {
    ctx.s.dispatch("seat.connect", {
      seat_id: ctx.seats[1].seat_id,
      connection_id: "attacker-conn",
    });
  } catch (error) {
    assert.ok(error instanceof ProbeError);
  }

  ctx.advance(120_001);
  const released = ctx.o.rooms.releaseExpiredSeats();
  assert.equal(released.length, 1, "保留窗到点必须释放，不能被外人无限续期");
  assert.equal(released[0], ctx.seats[1].seat_id);
  assert.equal(ctx.seatState(1).state, "RELEASED");
});

// ------------------------------------------------- seat.connect 的四类凭据

test("seat.connect：缺凭据被拒", () => {
  const ctx = table();
  assert.throws(
    () => ctx.s.dispatch("seat.connect", {
      seat_id: ctx.seats[0].seat_id,
      connection_id: "c1",
    }),
    (error) => error instanceof ProbeError
      && error.code === "invalid_field"
      && error.details.field === "recoveryCredential",
  );
});

test("seat.connect：伪造凭据被拒", () => {
  const ctx = table();
  assert.throws(
    () => ctx.s.dispatch("seat.connect", {
      seat_id: ctx.seats[0].seat_id,
      recovery_credential: FORGED,
      connection_id: "c1",
    }),
    probe("recovery_credential_rejected"),
  );
});

test("seat.connect：持他席凭据不能为本席建连", () => {
  // 串线适配器最现实的形态：它手里确实有一份真凭据，只是不是这一席的。
  const ctx = table();
  assert.throws(
    () => ctx.s.dispatch("seat.connect", {
      seat_id: ctx.seats[1].seat_id,
      recovery_credential: ctx.seats[0].credential,
      connection_id: "c1",
    }),
    probe("recovery_credential_rejected"),
  );
  assert.equal(ctx.seatState(1).connected, false);
});

test("seat.connect：席位释放后原凭据失效", () => {
  const ctx = table();
  const credential = ctx.seats[1].credential;
  disconnected(ctx, 1);
  ctx.advance(120_001);
  assert.equal(ctx.o.rooms.releaseExpiredSeats().length, 1);

  assert.throws(
    () => ctx.s.dispatch("seat.connect", {
      seat_id: ctx.seats[1].seat_id,
      recovery_credential: credential,
      connection_id: "c-after-release",
    }),
    probe("seat_credential_revoked"),
  );
});

// 等长伪造。这一条是变异测试逼出来的：把 sameSecret 换成「长度相等即通过」，上面四段探测
// 全都还是绿的。原因是巧合——本 harness 的 tokenFactory 产出 tok-6 与 tok-10，长度 5 与 6，
// 于是连他席凭据都因为长度不同而被拒。四段探测因此只证明了「会拒」，没证明「比的是值」。
//
// 伪造串从真凭据改一个字符得来，长度必然相同。改末位杀「只比前若干位」，改首位杀「只比后
// 若干位」，两条一起把比对钉成全值相等。
test("seat.connect：等长但不同值的凭据必须被拒", () => {
  const ctx = table();
  const real = ctx.seats[0].credential;
  const flip = (char) => (char === "0" ? "1" : "0");
  const variants = [
    ["末位不同", real.slice(0, -1) + flip(real.at(-1))],
    ["首位不同", flip(real[0]) + real.slice(1)],
  ];

  for (const [label, forged] of variants) {
    assert.equal(forged.length, real.length, `${label}：伪造串必须与真凭据等长`);
    assert.notEqual(forged, real, `${label}：伪造串不能恰好等于真凭据`);
    assert.throws(
      () => ctx.s.dispatch("seat.connect", {
        seat_id: ctx.seats[0].seat_id,
        recovery_credential: forged,
        connection_id: `c-${label}`,
      }),
      probe("recovery_credential_rejected"),
      `${label}：等长伪造凭据居然通过了，比对没在比值`,
    );
  }
});

test("seat.connect：持本席凭据仍然照常可用", () => {
  // 加门不能把正常路径关掉：适配器重连是产品主路径。
  const ctx = table();
  const first = ctx.s.dispatch("seat.connect", { ...ctx.auth(0), connection_id: "c1" });
  assert.equal(first.connected.seat_id, ctx.seats[0].seat_id);
  assert.equal(first.connected.connection_count, 1);
  assert.equal(ctx.seatState(0).connected, true);
});

// 被授权的那一席，必须就是被改动的那一席。
//
// 这条也是变异逼出来的：把 handler 改成 `seatId: p.target_seat_id ?? p.seat_id`，把关照旧验
// p.seat_id，动作却落到 target_seat_id 上。所有既有测试都还是绿的——因为没有一个测试会去传
// 这个多出来的字段。于是「验一扇门、走另一扇门」这类缺陷对整套测试完全隐形。
//
// 所以这里刻意塞一个未知字段，断言它不改变动作落点。这不是在测某个具体字段名（那样只能挡住
// 我恰好想到的那个名字），而是在钉住一条不变量：授权对象与动作对象是同一个。
test("授权的席位就是被改动的席位：多传的字段不得改变动作落点", () => {
  const ctx = table({ playerCount: 2 });
  // 第 1 席进入掉线保留窗——它是「被冒名顶替」的目标，状态变化最容易观察。
  const before = disconnected(ctx, 1);
  assert.equal(before, 120_000);

  // 第 0 席带着自己的合法凭据建连，同时试图把动作导向第 1 席。
  const result = ctx.s.dispatch("seat.connect", {
    ...ctx.auth(0),
    target_seat_id: ctx.seats[1].seat_id,
    seat_id_override: ctx.seats[1].seat_id,
    connection_id: "c-redirect",
  });

  // 落点必须是第 0 席。
  assert.equal(result.connected.seat_id, ctx.seats[0].seat_id, "动作落到了别的席位上");
  assert.equal(ctx.seatState(0).connected, true);

  // 第 1 席必须一点没动：仍在掉线状态，保留倒计时未被清掉。清掉它正是 F4 的原始危害。
  const target = ctx.seatState(1);
  assert.equal(target.state, "DISCONNECTED", "目标席位被顶替改动了状态");
  assert.equal(target.connected, false, "目标席位被顶替建立了连接");
  assert.equal(target.retention_remaining_ms, 120_000, "目标席位的保留倒计时被清掉了");
});

// ------------------------------------------------------------ 独立期望清单
//
// 下面三份清单是**手写**的，逐条判定过 handler 体，不是从 SEAT_AUTHORIZED 生成的。
// F4 要求这样：集合自身枚举出来的测试永远自洽，集合漏一条它就跟着漏一条。

// 会写席位状态、或以该席身份对外发布的命令。全部必须拒伪造凭据。
const SEAT_STATE_WRITES = Object.freeze([
  "room.confirm_public_scope", // 写 public_scope_confirmation：隐私同意，只能本人接受
  "seat.connect", //             写 connections / retention_expires_at —— F4 的缺口
  "seat.disconnect", //          写 state / retention_expires_at，启动保留窗
  "seat.ready", //               写 ready，影响开局门禁
  "seat.sit_out_after_hand", //  写 sit_out_after_hand
  "seat.leave", //               写 privacy_fence / pending_fold / leave_requested
  "hand.act", //                 以该席身份行动，写筹码与牌局版本
  "hand.reveal", //              以该席身份亮牌，写牌局版本
  "chat.say", //                 以该席身份发 PLAYER_PUBLIC_SPEECH
  "ai.set_mode", //              写 mode，决定本席 AI 会不会替你说话
  "ai.hide_local", //            写该查看者的本地隐藏表
  "ai.take_intents", //          取走本席待办，取走即消费
  "ai.start", //                 占住本席评估闸门并起租约
  "ai.resolve", //               以该席 AI 身份发 AI_PUBLIC_SPEECH
  "view.hand", //                只读，但读的是该席底牌：泄露即违反隔离
]);

// 不需要席位凭据的命令，逐条写明理由。理由不成立就不该在这份清单里。
const NO_SEAT_IDENTITY = Object.freeze({
  "room.create": "凭据由它铸造，要求先持有凭据是循环",
  "room.join": "同上，凭据是它的返回值",
  "hand.evaluate_start": "到期驱动：谁都可以催，只在真到期时才动作，不带身份主张",
  "hand.start_if_due": "同上，开局门禁在 room-store 判定",
  "hand.settle_expired": "同上，超时处置由权威时钟决定",
  "ai.reclaim_expired": "同上，租约到期由权威时钟决定",
  "hand.apply_pending_fold": "只在权威已记下 pending_fold 时动作，seat_id 是选择器不是身份主张",
  "view.projection": "公开投影，不含任何席位私密内容",
  "view.timeline": "公开时间线；viewer_seat_id 只影响本地隐藏渲染，不解锁内容",
  "view.seat": "席位公开投影 + AI 公开状态，均不含底牌与凭据",
  "view.room_events": "权威事件流；凭据从不进事件，见 room-store 注释",
  "view.ai_events": "同上",
});

// 以凭据为入参、而不是「先验身份再执行」的命令。它一样必须拒伪造凭据，只是单独一段探测：
// 它在席位已释放时抛 seat_released 而不是 seat_credential_revoked（recoverSeat 先结算保留窗
// 再比对凭据，见 room-store 注释），套不进下面第四段的统一循环。
const CREDENTIAL_AS_INPUT = Object.freeze(["seat.recover"]);

test("独立清单必须覆盖命令面的每一条命令", () => {
  // 这条守的是「以后新增命令时必须做出判定」。漏判会在这里失败，而不是等到线上。
  const ctx = table();
  const classified = [
    ...SEAT_STATE_WRITES,
    ...Object.keys(NO_SEAT_IDENTITY),
    ...CREDENTIAL_AS_INPUT,
  ].sort();
  assert.deepEqual(
    classified,
    ctx.s.commandNames(),
    "有命令未被分类，或清单里写了不存在的命令名",
  );
  assert.equal(new Set(classified).size, classified.length, "同一条命令不得落入两类");
});

// 每条写命令的一组「除凭据外都合法」的参数。给足参数是刻意的：万一把关被摘掉，命令会
// 真的执行下去，于是探测拿到的不是 invalid_field 而是成功或别的错——两者都判失败。
// 若只传 seat_id，摘掉把关后可能刚好撞上缺字段报错，看起来还像被拒了。
function forgedParams(command, seatId) {
  const base = { seat_id: seatId, recovery_credential: FORGED };
  switch (command) {
    case "room.confirm_public_scope": return { ...base, acknowledged: true };
    case "seat.connect": return { ...base, connection_id: "probe-conn" };
    case "seat.disconnect": return { ...base, connection_id: "probe-conn" };
    case "seat.ready": return { ...base, ready: true };
    case "hand.act": return {
      ...base, action: "fold", hand_id: "probe-hand", expected_revision: 0, idempotency_key: "k1",
    };
    case "hand.reveal": return {
      ...base, hand_id: "probe-hand", expected_revision: 0, idempotency_key: "k2",
    };
    case "chat.say": return { ...base, text: "探测", idempotency_key: "k3" };
    case "ai.set_mode": return { ...base, mode: "OFF" };
    case "ai.hide_local": return { ...base, target: "ai", target_id: seatId, hidden: true };
    case "ai.start": return { ...base, context: { revision: 0 } };
    case "ai.resolve": return { ...base, turn_id: "probe-turn", decision: "silent" };
    default: return base;
  }
}

// seat.recover 单独一段：它必须和其他命令一样拒伪造/缺失/他席凭据，否则「凭据是入参」就
// 会被读成「凭据可以随便填」。它归入哪一类靠的是这一段实测，不是分类注释。
test("seat.recover：伪造、缺失、他席凭据都必须被拒", () => {
  const ctx = table({ playerCount: 2 });
  disconnected(ctx, 1);
  const target = ctx.seats[1].seat_id;

  assert.throws(
    () => ctx.s.dispatch("seat.recover", { seat_id: target, recovery_credential: FORGED }),
    probe("recovery_credential_rejected"),
    "伪造凭据居然恢复了席位",
  );
  assert.throws(
    () => ctx.s.dispatch("seat.recover", { seat_id: target }),
    (error) => error instanceof ProbeError
      && error.code === "invalid_field"
      && error.details?.field === "recoveryCredential",
    "缺凭据居然恢复了席位",
  );
  assert.throws(
    () => ctx.s.dispatch("seat.recover", {
      seat_id: target,
      recovery_credential: ctx.seats[0].credential,
    }),
    probe("recovery_credential_rejected"),
    "持他席凭据居然恢复了这一席",
  );

  // 正面：本席凭据仍然照常恢复。加门不能把产品主路径关掉。
  const recovered = ctx.s.dispatch("seat.recover", {
    seat_id: target,
    recovery_credential: ctx.seats[1].credential,
  });
  assert.equal(recovered.seat_id, target);
  assert.equal(recovered.state, "SEATED");
});

test("清单上每条写命令都必须拒绝伪造凭据", () => {
  // 这段不读 SEAT_AUTHORIZED。它只看行为：拿一份格式合法但不属于任何席位的凭据去调，
  // 必须得到 recovery_credential_rejected。
  //
  // 为什么只认这一个错误码：命令没把关时，它会带着我给的合法参数真的跑下去，于是要么
  // 成功、要么抛别的错（not_players_turn、hand_not_found……）。只要不是「凭据被拒」，
  // 就说明这条命令没在验凭据，无论它是漏出集合还是自验时忘了写。
  const failures = [];
  for (const command of SEAT_STATE_WRITES) {
    const ctx = table();
    let code = "<未抛错>";
    try {
      ctx.s.dispatch(command, forgedParams(command, ctx.seats[0].seat_id));
    } catch (error) {
      code = error instanceof ProbeError ? error.code : `<${error.constructor.name}>`;
    }
    if (code !== "recovery_credential_rejected") {
      failures.push(`${command} -> ${code}`);
    }
  }
  assert.deepEqual(failures, [], `以下写命令未验证席位凭据：\n  ${failures.join("\n  ")}`);
});

test("清单上每条写命令都必须拒绝缺失的凭据", () => {
  // 与上一条分开：漏掉字段和填错字段走的是不同分支，缺字段那条更容易被「反正没传就跳过」
  // 式的实现放过去。
  const failures = [];
  for (const command of SEAT_STATE_WRITES) {
    const ctx = table();
    const params = forgedParams(command, ctx.seats[0].seat_id);
    delete params.recovery_credential;
    // 缺字段走本仓统一的 invalid_field 约定（room-store 的 requiredString）。连字段名
    // 一起断言：只认 invalid_field 的话，别的必填字段缺失也会被当成「凭据把关生效」。
    let code = "<未抛错>";
    try {
      ctx.s.dispatch(command, params);
    } catch (error) {
      code = error instanceof ProbeError
        ? `${error.code}:${error.details?.field ?? "-"}`
        : `<${error.constructor.name}>`;
    }
    if (code !== "invalid_field:recoveryCredential") {
      failures.push(`${command} -> ${code}`);
    }
  }
  assert.deepEqual(failures, [], `以下写命令未要求席位凭据：\n  ${failures.join("\n  ")}`);
});

test("清单上每条写命令都必须拒绝他席凭据", () => {
  // 串线场景：调用者持有的是真凭据，只是配错了席位。
  const failures = [];
  for (const command of SEAT_STATE_WRITES) {
    const ctx = table();
    const params = forgedParams(command, ctx.seats[1].seat_id);
    params.recovery_credential = ctx.seats[0].credential;
    let code = "<未抛错>";
    try {
      ctx.s.dispatch(command, params);
    } catch (error) {
      code = error instanceof ProbeError ? error.code : `<${error.constructor.name}>`;
    }
    if (code !== "recovery_credential_rejected") {
      failures.push(`${command} -> ${code}`);
    }
  }
  assert.deepEqual(failures, [], `以下写命令接受了他席凭据：\n  ${failures.join("\n  ")}`);
});

test("清单上每条写命令在席位释放后都必须拒绝原凭据", () => {
  const failures = [];
  for (const command of SEAT_STATE_WRITES) {
    const ctx = table({ playerCount: 3 });
    const credential = ctx.seats[2].credential;
    ctx.s.dispatch("seat.connect", { ...ctx.auth(2), connection_id: "c" });
    ctx.s.dispatch("seat.disconnect", { ...ctx.auth(2), connection_id: "c" });
    ctx.advance(120_001);
    assert.equal(ctx.o.rooms.releaseExpiredSeats().length, 1, `${command}：前置释放未生效`);

    const params = forgedParams(command, ctx.seats[2].seat_id);
    params.recovery_credential = credential;
    let code = "<未抛错>";
    try {
      ctx.s.dispatch(command, params);
    } catch (error) {
      code = error instanceof ProbeError ? error.code : `<${error.constructor.name}>`;
    }
    if (code !== "seat_credential_revoked") {
      failures.push(`${command} -> ${code}`);
    }
  }
  assert.deepEqual(failures, [], `以下写命令在释放后仍接受原凭据：\n  ${failures.join("\n  ")}`);
});
