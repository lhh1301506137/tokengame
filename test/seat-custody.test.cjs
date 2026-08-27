"use strict";

// F6：席位凭据必须留在本机协调器，不进模型上下文。
//
// 原状：MCP 工具把 room.create / room.join 的返回整体作为文本交给模型，其中包含
// recovery_credential；之后每条席位命令又要求模型在 params 里把它回传一次。于是一个
// 长期有效的席位秘密变成了模型上下文里的普通文本——对手发言、提示注入、错误回显、
// 日志、转写记录，每一处都是泄漏面。Skill 里写一句「不要公开凭据」不是托管。
//
// 本文件测的是托管层本身，不测 MCP 传输。分开是因为托管是宿主中立的：任何适配器都要
// 一份「秘密留在本地、模型只拿句柄」的实现，写进某个宿主就等于下一个宿主再抄一遍。
//
// 泄漏扫描刻意用「比对真正持有的那几份秘密」而不是「长得像令牌的正则」。正则是猜，
// 猜就会既漏又误伤；协调器手里本来就有原文，逐份精确比对才是能说得清的判定。

const assert = require("node:assert/strict");
const test = require("node:test");
const { SeatCustody, CredentialLeak } = require("../src/host/seat-custody.cjs");

const CRED_A = "tok-seat-a-secret-0001";
const CRED_B = "tok-seat-b-secret-0002";

function custody() {
  let n = 0;
  return new SeatCustody({ handleFactory: () => `h-${++n}` });
}

test("绑定后模型只拿到句柄，凭据不出现在返回里", () => {
  const c = custody();
  const bound = c.bind({ seatId: "seat-1", credential: CRED_A });

  assert.equal(bound.seat_handle, "h-1");
  assert.equal(bound.seat_id, "seat-1", "seat_id 是公开标识，可以给模型");
  assert.equal(JSON.stringify(bound).includes(CRED_A), false, "凭据不得出现在绑定结果里");
});

test("句柄能解回凭据，但只在协调器内部", () => {
  const c = custody();
  const { seat_handle: handle } = c.bind({ seatId: "seat-1", credential: CRED_A });
  const resolved = c.resolve(handle);

  assert.equal(resolved.seat_id, "seat-1");
  assert.equal(resolved.credential, CRED_A);
});

test("未知句柄被拒，错误既不回显秘密也不回显句柄清单", () => {
  const c = custody();
  const a = c.bind({ seatId: "seat-1", credential: CRED_A });
  const b = c.bind({ seatId: "seat-2", credential: CRED_B });

  let caught = null;
  try {
    c.resolve("h-does-not-exist");
    assert.fail("未知句柄必须被拒");
  } catch (error) {
    caught = error;
  }
  assert.equal(caught.code, "seat_handle_unknown");

  const dump = `${caught.message} ${JSON.stringify(caught.details ?? {})}`;
  for (const secret of [CRED_A, CRED_B]) {
    assert.equal(dump.includes(secret), false, "错误里不得出现凭据原文");
  }

  // 句柄清单同样不能回显。句柄不是凭据，但把它变成可枚举的东西就等于给模型一条挨个试
  // 出别席句柄的路——句柄一到手，注入层会老老实实替那一席补上凭据，越权就成了。
  //
  // 这一条是变异测试逼出来的：往 details 里塞 { known: [...this.bindings.keys()] }，
  // 上面那段凭据断言全绿，因为泄的不是凭据。只查凭据的测试看不见枚举口。
  for (const handle of [a.seat_handle, b.seat_handle]) {
    assert.equal(dump.includes(handle), false, `错误回显了已持有的句柄 ${handle}`);
  }
});

test("注入：模型给句柄，协调器补上 seat_id 与凭据", () => {
  const c = custody();
  const { seat_handle: handle } = c.bind({ seatId: "seat-1", credential: CRED_A });

  const params = c.inject("seat.ready", { seat_handle: handle, ready: true });

  assert.equal(params.seat_id, "seat-1");
  assert.equal(params.recovery_credential, CRED_A);
  assert.equal(params.ready, true);
  assert.equal("seat_handle" in params, false, "句柄不该继续发给核心");
});

test("注入：模型自带的 seat_id 与凭据一律不采信", () => {
  // 这条是整个托管的关键。若模型传的 seat_id 能盖过句柄，它就能拿别人的公开 seat_id
  // 配自己的句柄去操作别席——句柄制反而成了绕过口。凭据同理：模型手里不该有凭据，
  // 出现了就说明泄漏已经发生，此时静默采信等于把泄漏变成可用权限。
  const c = custody();
  const { seat_handle: handle } = c.bind({ seatId: "seat-1", credential: CRED_A });

  assert.throws(
    () => c.inject("seat.ready", { seat_handle: handle, seat_id: "seat-2", ready: true }),
    (error) => error.code === "seat_id_not_model_supplied",
  );
  assert.throws(
    () => c.inject("seat.ready", { seat_handle: handle, recovery_credential: CRED_A }),
    (error) => error.code === "credential_not_model_supplied",
  );
});

test("注入：需要凭据的命令缺句柄时被拒，且不去猜哪一席", () => {
  // 只绑了一席时「猜」看起来无害，多席适配器上就是拿错席位替人行动。
  const c = custody();
  c.bind({ seatId: "seat-1", credential: CRED_A });

  assert.throws(
    () => c.inject("hand.act", { action: "fold" }),
    (error) => error.code === "seat_handle_required",
  );
});

test("注入：不需要凭据的命令原样通过，但句柄不得随之进核心", () => {
  const c = custody();
  assert.deepEqual(c.inject("view.projection", {}), {});

  // 模型手上只有句柄，所以它调只读命令时很可能顺手带上。句柄是协调器的内部标识，核心
  // 不认识它——放进去只会原样落在事件参数或错误回显里，把托管层的内部命名渗进权威状态。
  //
  // 这一条是变异测试逼出来的：删掉 delete incoming.seat_handle，原来那条只传 {} 的用例
  // 照旧全绿，因为没有句柄可删。空入参证明不了「会删」。
  const { seat_handle: handle } = c.bind({ seatId: "seat-1", credential: CRED_A });
  const params = c.inject("view.projection", { seat_handle: handle, viewer_id: "seat-1" });
  assert.deepEqual(params, { viewer_id: "seat-1" }, "句柄跟着只读命令进了核心");
  assert.equal("seat_handle" in params, false);
});

// ------------------------------------------------------- 净化与负向扫描

// 命令面 room.create 返回的真实形状。凭据与邀请码都在这里。
function createResult() {
  return {
    ok: true,
    result: {
      room: { room_id: "room-1", room_binding_id: "rb-1", table_rules_version: "table-rules-v1" },
      invite_code: "invite-secret-9999",
      seat: { seat_id: "seat-1", player_id: "p1", stack: 200 },
      recovery_credential: CRED_A,
    },
  };
}

test("净化：create 返回换成句柄，凭据不在模型可见结果里", () => {
  const c = custody();
  const { result, seat_handle: handle, seat_id: seatId } = c.bindFromResult(createResult());
  const text = JSON.stringify(result);

  assert.equal(typeof handle, "string");
  assert.equal(seatId, "seat-1");
  assert.equal(text.includes(CRED_A), false, "凭据不得进入模型可见结果");
  assert.equal(text.includes("recovery_credential"), false, "连字段名都不该留");
  // 公开内容必须还在，否则净化就变成了把功能一起删掉。
  assert.equal(result.result.room.room_id, "room-1");
  assert.equal(result.result.seat.seat_id, "seat-1");
  assert.equal(result.result.seat.stack, 200);
});

test("净化：邀请码必须仍然可见", () => {
  // 刻意的正面断言，不是遗漏。建房的人要把邀请码转给朋友，看不见就没法入房——净化到
  // 把功能删掉不叫修好。判断标准是「有没有人必须读它」：邀请码有，席位凭据没有。
  const c = custody();
  const { result } = c.bindFromResult(createResult());
  assert.equal(result.result.invite_code, "invite-secret-9999");
});

test("净化：秘密字段是摘掉而不是置空", () => {
  // 留一个 recovery_credential: null 会让下游以为「这里本该有凭据」，于是有人填回去。
  const c = custody();
  const { result } = c.bindFromResult(createResult());
  assert.equal("recovery_credential" in result.result, false);
});

test("净化后的句柄真的能用", () => {
  // 只证明「没泄漏」不够：净化把功能砍断了也能通过那条断言。
  const c = custody();
  const { seat_handle: handle } = c.bindFromResult(createResult());
  const params = c.inject("seat.ready", { seat_handle: handle, ready: true });
  assert.equal(params.seat_id, "seat-1");
  assert.equal(params.recovery_credential, CRED_A);
});

test("扫描：已托管的凭据出现在任何模型可见文本里都算泄漏", () => {
  const c = custody();
  c.bindFromResult(createResult());

  // 四类 Codex 点名的出口：工具返回、错误、日志、投影。
  const carriers = [
    ["tool_result", JSON.stringify({ ok: true, note: CRED_A })],
    ["error", `core rejected: credential ${CRED_A} not accepted`],
    ["log", `[debug] posting params {"recovery_credential":"${CRED_A}"}`],
    ["projection", JSON.stringify({ seats: [{ seat_id: "seat-1", secret: CRED_A }] })],
  ];
  for (const [where, text] of carriers) {
    assert.throws(
      () => c.assertNoLeak(text, where),
      (error) => error.code === "credential_leak" && error.details.where === where,
      `${where} 里的凭据没被扫出来`,
    );
  }
});

test("扫描：直接 bind 的凭据也必须进扫描集", () => {
  // 上一条走的是 bindFromResult，凭据会经 sanitizeResult 的 onSecret 回调进 knownSecrets。
  // 于是 bind 自己那句 knownSecrets.add 从来没有被任何用例见证过——删掉它，整套测试全绿。
  //
  // 这条路径不是假想的：适配器可以从别处拿到已有的 seat_id + 凭据（比如协调器重启后从
  // 自己的持久化里读回，或者测试夹具直接构造）而不经过任何核心返回。走这条路进来的凭据
  // 若不进扫描集，负向扫描就对它视而不见——托管层自己划定要扫的范围，漏存一份就漏扫一份。
  const c = custody();
  c.bind({ seatId: "seat-1", credential: CRED_A });

  assert.throws(
    () => c.assertNoLeak(`core said: ${CRED_A}`, "tool_result"),
    (error) => error.code === "credential_leak" && error.details.where === "tool_result",
    "直接 bind 进来的凭据没被扫出来",
  );
});

test("扫描：报告本身不得包含秘密原文", () => {
  // 一份把泄漏内容抄进错误消息的泄漏报告，是第二次泄漏。
  const c = custody();
  c.bindFromResult(createResult());
  try {
    c.assertNoLeak(`oops ${CRED_A}`, "tool_result");
    assert.fail("应当抛出");
  } catch (error) {
    const dump = `${error.message} ${JSON.stringify(error.details)}`;
    assert.equal(dump.includes(CRED_A), false, "错误里不得出现凭据原文");
  }
});

test("扫描：秘密字段名出现即算泄漏，不必等到认得那份值", () => {
  // 换发了新凭据的返回还没进 knownSecrets，但一个叫 recovery_credential 的键出现在
  // 模型可见文本里，本身就说明这条路径在搬运秘密。
  const c = custody();
  assert.throws(
    () => c.assertNoLeak(JSON.stringify({ recovery_credential: "brand-new-secret" })),
    (error) => error.code === "credential_leak" && error.details.field === "recovery_credential",
  );
});

test("扫描：干净文本放过，且不误伤公开字段", () => {
  const c = custody();
  const { result } = c.bindFromResult(createResult());
  const text = c.assertNoLeak(JSON.stringify(result));
  assert.ok(text.includes("seat-1"), "seat_id 是公开的，不该被当成秘密");
  assert.ok(text.includes("room-1"));
});

test("离桌后凭据仍然算秘密", () => {
  // forget 让句柄失效，但那份凭据曾经进过这个进程。它出现在模型可见文本里依旧是泄漏，
  // 因为泄漏的时点可能早于离桌。
  const c = custody();
  const { seat_handle: handle } = c.bindFromResult(createResult());
  assert.equal(c.forget(handle), true);
  assert.throws(() => c.resolve(handle), (error) => error.code === "seat_handle_unknown");
  assert.throws(() => c.assertNoLeak(`still ${CRED_A}`), (error) => error.code === "credential_leak");
});

test("多席：句柄之间不串，各自解回自己的凭据", () => {
  const c = custody();
  const a = c.bind({ seatId: "seat-1", credential: CRED_A });
  const b = c.bind({ seatId: "seat-2", credential: CRED_B });

  assert.notEqual(a.seat_handle, b.seat_handle);
  assert.equal(c.inject("seat.ready", { seat_handle: a.seat_handle }).recovery_credential, CRED_A);
  assert.equal(c.inject("seat.ready", { seat_handle: b.seat_handle }).recovery_credential, CRED_B);
  assert.equal(c.inject("seat.ready", { seat_handle: b.seat_handle }).seat_id, "seat-2");
});

