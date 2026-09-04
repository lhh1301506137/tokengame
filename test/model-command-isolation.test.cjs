"use strict";

// 模型可见面与真人操作面的分权。
//
// 为什么这是一条安全边界而不是整理：HOST_COMMANDS 是一份平坦清单，`hand.act` 和
// `ai.resolve` 并列其中。模型可见的工具把整份清单当枚举暴露出去，于是同一个模型既能替
// 这一席发言，也能替这一席下注、按 Ready、代确认公开范围、翻开底牌。
//
// 这四条被点名不是因为危险程度相同，而是各自对应一个已确认的用户结果：
//   room.confirm_public_scope  隐私同意。F3 已按席位钉死，但「本人确认」不能由模型代劳，
//                              否则钉住的只是席位而不是人。
//   seat.ready                 决定牌局什么时候开始。
//   hand.act                   官方筹码动作。章程写的是真人通过结构化牌桌控件提交。
//   hand.reveal                主动公开自己的底牌，不可撤回。
//
// 本文件分两半：前半是清单对账，后半是行为——清单对得上但工具照旧放行，等于没分权。

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  CREDENTIAL_COMMANDS,
  HOST_COMMANDS,
  HUMAN_COMMANDS,
  MODEL_COMMANDS,
  classifyActor,
} = require("../src/authority/host-surface.cjs");
const { SeatCustody } = require("../src/host/seat-custody.cjs");
const {
  MODEL_FORBIDDEN_PARAMS,
  ModelCommandSurface,
  ModelSurfaceError,
} = require("../src/host/model-command-surface.cjs");

// 目标点名的四条。写成字面量而不是从划分里推导——从被测数据推导出的期望值永远成立。
const MODEL_MUST_NOT_CALL = [
  "room.confirm_public_scope",
  "seat.ready",
  "seat.refill_test_chips",
  "hand.act",
  "hand.reveal",
];

test("分权：目标点名的四条真人操作不在模型面上", () => {
  for (const command of MODEL_MUST_NOT_CALL) {
    assert.ok(
      !MODEL_COMMANDS.includes(command),
      `${command} 出现在模型面上，等于模型可以代替玩家做这个决定`,
    );
    assert.ok(
      HUMAN_COMMANDS.includes(command),
      `${command} 必须明确归入真人面，而不是两边都不在`,
    );
    assert.equal(classifyActor(command), "human");
  }
});

test("分权：真人面与模型面加起来恰好是宿主面，且互不相交", () => {
  const union = [...HUMAN_COMMANDS, ...MODEL_COMMANDS].sort();
  const host = [...HOST_COMMANDS].sort();

  assert.equal(host.length, 22, "宿主面条数变了就要重新审这份分权，而不是让对账自动跟着变");

  const missing = host.filter((name) => !union.includes(name));
  assert.deepEqual(
    missing,
    [],
    `宿主面有命令没分权，那它对模型是开还是关取决于实现细节: ${JSON.stringify(missing)}`,
  );

  const invented = union.filter((name) => !host.includes(name));
  assert.deepEqual(invented, [], `分权里有宿主面不存在的命令: ${JSON.stringify(invented)}`);

  const both = HUMAN_COMMANDS.filter((name) => MODEL_COMMANDS.includes(name));
  assert.deepEqual(both, [], `同时属于两面的命令: ${JSON.stringify(both)}`);
});

test("分权：模型面白名单逐条写死，加一条就得在这里改一次", () => {
  const expected = [
    "ai.resolve",
    "ai.start",
    "ai.take_intents",
    "view.projection",
    "view.timeline",
  ];
  assert.deepEqual([...MODEL_COMMANDS].sort(), expected,
    "模型面变动必须是显式决定，并说明新命令为什么不是真人决定");
});

test("分权：view.hand 不在模型面上", () => {
  // view.hand 是唯一吐底牌的出口。座位 AI 的上下文由权威裁剪后随 intent 一起给出（F5
  // 要求 2），模型不该有第二条自取底牌的路——那条路绕过那次裁剪。
  assert.ok(!MODEL_COMMANDS.includes("view.hand"));
  assert.equal(classifyActor("view.hand"), "human");
});

test("分权：classifyActor 对每条宿主面命令给出确定答案，宿主面之外一律 none", () => {
  for (const command of HOST_COMMANDS) {
    const actor = classifyActor(command);
    assert.ok(
      actor === "human" || actor === "model",
      `${command} 的 classifyActor 返回 ${actor}，宿主面命令必须二者之一`,
    );
  }
  for (const outside of ["hand.start_if_due", "ai.reclaim_expired", "view.room_events", "不存在的命令", "", undefined]) {
    assert.equal(classifyActor(outside), "none", `${outside} 不该被判成某一方能发`);
  }
});

test("分权：两份新清单都是冻结的", () => {
  for (const list of [HUMAN_COMMANDS, MODEL_COMMANDS]) {
    assert.ok(Object.isFrozen(list));
    assert.throws(() => list.push("hand.act"));
  }
});

// ---------------------------------------------------------------- 行为

// 记录每一次「打到核心」的尝试。命令面必须在这一层之前就把真人命令挡下来——
// 挡在核心里也能拒，但那说明请求已经发出去了，本地这道门就是装饰。
function recordingSurface(options = {}) {
  const sent = [];
  const custody = new SeatCustody(options.custody);
  const surface = new ModelCommandSurface({
    custody,
    request: async (command, params) => {
      sent.push({ command, params });
      const reply = options.reply?.(command, params);
      return reply ?? { ok: true, status: 200, body: { result: {} } };
    },
  });
  return { custody, surface, sent };
}

test("分权：四条真人命令经模型面一律被本地挡住，且根本不发请求", async () => {
  const { surface, sent } = recordingSurface();
  for (const command of MODEL_MUST_NOT_CALL) {
    await assert.rejects(
      () => surface.call(command, {}),
      (error) => {
        assert.ok(error instanceof ModelSurfaceError, `${command} 抛的不是 ModelSurfaceError`);
        assert.equal(error.code, "command_not_model_facing", `${command} 的拒绝理由不对`);
        return true;
      },
      `${command} 居然被模型面接受了`,
    );
  }
  assert.deepEqual(sent, [], `被拒的命令仍然发出了请求: ${JSON.stringify(sent)}`);
});

test("分权：真人面的每一条经模型面都被挡住，不只是点名那四条", async () => {
  const { surface, sent } = recordingSurface();
  for (const command of HUMAN_COMMANDS) {
    await assert.rejects(() => surface.call(command, {}), { code: "command_not_model_facing" },
      `${command} 在真人面上却能经模型面发出`);
  }
  assert.equal(sent.length, 0);
  // 数量下限：真人面空了上面的循环会一条都不跑而整个测试照样通过。
  assert.ok(HUMAN_COMMANDS.length >= 16, `真人面只剩 ${HUMAN_COMMANDS.length} 条`);
});

test("分权：模型自带席位身份字段一律报错，不静默覆盖", async () => {
  const { surface, sent } = recordingSurface();
  assert.ok(MODEL_FORBIDDEN_PARAMS.length >= 4);
  for (const field of MODEL_FORBIDDEN_PARAMS) {
    await assert.rejects(
      () => surface.call("view.projection", { [field]: "s-1" }),
      { code: "seat_identity_not_model_supplied" },
      `${field} 被模型自带时应报错`,
    );
  }
  assert.deepEqual(sent, []);
});

test("分权：公开读取不带凭据也不带席位身份", async () => {
  const { custody, surface, sent } = recordingSurface();
  custody.bind({ seatId: "s-1", credential: "cred-1" });

  await surface.call("view.projection", {});
  await surface.call("view.timeline", {});

  assert.equal(sent.length, 2);
  for (const call of sent) {
    assert.equal(call.params.recovery_credential, undefined, `${call.command} 带上了凭据`);
    assert.equal(call.params.seat_id, undefined, `${call.command} 带上了席位身份`);
    assert.equal(call.params.seat_handle, undefined, `${call.command} 带上了句柄`);
  }
});

// 本文件最重的一条。模型手里没有句柄，却要能跑完整条 AI 回路——
// 靠的是权威铸造的 intent_id / turn_id，席位身份由协调器补。
test("分权：模型只凭权威发的 id 就能跑完 AI 回路，全程不持句柄", async () => {
  const { custody, surface, sent } = recordingSurface({
    reply: (command, params) => {
      if (command === "ai.take_intents") {
        return {
          ok: true,
          status: 200,
          body: {
            result: {
              intents: [{
                intent_id: `intent-for-${params.seat_id}`,
                seat_id: params.seat_id,
                claim_token: `claim-for-${params.seat_id}`,
                context: { source_event_id: "evt-1" },
              }],
            },
          },
        };
      }
      if (command === "ai.start") {
        return { ok: true, status: 200, body: { result: { started: { turn_id: `turn-for-${params.seat_id}` } } } };
      }
      return { ok: true, status: 200, body: { result: { resolved: { seat_id: params.seat_id } } } };
    },
  });
  custody.bind({ seatId: "s-1", credential: "cred-1" });

  const taken = await surface.call("ai.take_intents", {});
  const intents = taken.body.result.intents;
  assert.equal(intents.length, 1, `扇出应领到一份待办: ${JSON.stringify(taken.body)}`);
  // 模型看得见的 intent 里没有席位身份，也没有句柄。
  assert.equal(intents[0].seat_id, undefined, "intent 里回了 seat_id，模型就会拿它回传");
  assert.equal(intents[0].seat_handle, undefined);
  assert.equal(intents[0].intent_id, "intent-for-s-1");
  // 领取令牌同理：它是本宿主的领取凭证，模型没有理由持有它。多一条搬运路径就多一处
  // 会被改坏、被忘掉、被上下文截断的地方，而它一旦丢了，本宿主就成了被围栏挡掉的那个。
  assert.equal(intents[0].claim_token, undefined, "claim_token 交给了模型");

  const started = await surface.call("ai.start", { intent_id: intents[0].intent_id });
  const turnId = started.body.result.started.turn_id;
  assert.equal(turnId, "turn-for-s-1");

  const resolved = await surface.call("ai.resolve", { turn_id: turnId, decision: "silent" });
  assert.equal(resolved.ok, true);

  // 三跳都必须带上凭据与 seat_id：核心那一侧的把关没有被削弱，只是身份由协调器补的。
  assert.deepEqual(sent.map((call) => call.command), ["ai.take_intents", "ai.start", "ai.resolve"]);
  for (const call of sent) {
    assert.equal(call.params.seat_id, "s-1", `${call.command} 没补上席位身份`);
    assert.equal(call.params.recovery_credential, "cred-1", `${call.command} 没补上凭据`);
    assert.equal(call.params.seat_handle, undefined, `${call.command} 把句柄发给了核心`);
  }
  // 令牌从模型面摘掉，但必须由本层补回核心：摘掉不等于丢掉。丢了的表现是
  // intent_claim_superseded——本宿主明明是正当持有者，却被自己的围栏挡在门外。
  const startCall = sent.find((call) => call.command === "ai.start");
  assert.equal(startCall.params.claim_token, "claim-for-s-1", "ai.start 没把领取令牌补回核心");
});

test("分权：模型伪造 intent_id / turn_id 时拿不到任何席位", async () => {
  const { custody, surface, sent } = recordingSurface();
  // 绑一席。此时「只绑了一席」的猜测会成立——所以这条测试要证明本层不去猜。
  custody.bind({ seatId: "s-1", credential: "cred-1" });

  await assert.rejects(() => surface.call("ai.start", { intent_id: "intent-made-up" }),
    { code: "unknown_authority_id" }, "伪造的 intent_id 被接受了");
  await assert.rejects(() => surface.call("ai.resolve", { turn_id: "turn-made-up", decision: "silent" }),
    { code: "unknown_authority_id" }, "伪造的 turn_id 被接受了");
  for (const missing of [undefined, "", null, 7]) {
    await assert.rejects(() => surface.call("ai.start", { intent_id: missing }),
      (error) => error.code === "invalid_field" || error.code === "unknown_authority_id");
  }
  assert.deepEqual(sent, [], "伪造 id 的请求仍然发到了核心");
});

test("分权：turn_id 只认一次，重放要由权威判定而不是本层帮它成立", async () => {
  const { custody, surface } = recordingSurface({
    reply: (command, params) => (command === "ai.take_intents"
      ? { ok: true, status: 200, body: { result: { intents: [{ intent_id: "intent-1", seat_id: params.seat_id }] } } }
      : { ok: true, status: 200, body: { result: { started: { turn_id: "turn-1" } } } }),
  });
  custody.bind({ seatId: "s-1", credential: "cred-1" });

  await surface.call("ai.take_intents", {});
  await surface.call("ai.start", { intent_id: "intent-1" });
  // 同一个 intent_id 第二次：已经变成回合了，本层不该再解析它。
  await assert.rejects(() => surface.call("ai.start", { intent_id: "intent-1" }),
    { code: "unknown_authority_id" });

  await surface.call("ai.resolve", { turn_id: "turn-1", decision: "silent" });
  await assert.rejects(() => surface.call("ai.resolve", { turn_id: "turn-1", decision: "silent" }),
    { code: "unknown_authority_id" });
});

test("分权：一席领取失败不影响其他席，失败要回报而不是静默", async () => {
  const { custody, surface } = recordingSurface({
    reply: (command, params) => {
      if (params.seat_id === "s-bad") {
        return { ok: false, status: 409, body: { code: "seat_not_found" } };
      }
      return {
        ok: true,
        status: 200,
        body: { result: { intents: [{ intent_id: `intent-${params.seat_id}`, seat_id: params.seat_id }] } },
      };
    },
  });
  custody.bind({ seatId: "s-bad", credential: "cred-bad" });
  custody.bind({ seatId: "s-ok", credential: "cred-ok" });

  const out = await surface.call("ai.take_intents", {});
  assert.equal(out.body.result.seats_polled, 2);
  assert.equal(out.body.result.intents.length, 1, "好的那一席的待办被一起丢掉了");
  assert.equal(out.body.result.intents[0].intent_id, "intent-s-ok");
  assert.deepEqual(out.body.result.failures, [{ code: "seat_not_found", status: 409 }]);
});

test("分权：一席未托管时领取回空，不报错也不猜席位", async () => {
  const { surface, sent } = recordingSurface();
  const out = await surface.call("ai.take_intents", {});
  assert.deepEqual(out.body.result.intents, []);
  assert.equal(out.body.result.seats_polled, 0);
  assert.deepEqual(sent, [], "没有托管席位时不该往核心发请求");
});

test("分权：命令面构造要求真的 custody 与 request，不接受省略", () => {
  assert.throws(() => new ModelCommandSurface({}), { code: "invalid_field" });
  assert.throws(() => new ModelCommandSurface({ custody: new SeatCustody() }), { code: "invalid_field" });
  assert.throws(() => new ModelCommandSurface({ custody: null, request: async () => ({}) }),
    { code: "invalid_field" });
});

test("分权：需凭据的模型命令仍然经托管注入，模型面没有绕过 F6", () => {
  // 这三条在核心侧要凭据。本层不是把凭据门禁拆了，而是把「谁来出示身份」从模型移到协调器。
  for (const command of ["ai.take_intents", "ai.start", "ai.resolve"]) {
    assert.ok(MODEL_COMMANDS.includes(command));
    assert.ok(CREDENTIAL_COMMANDS.includes(command),
      `${command} 若不再需要凭据，本文件的注入断言就失去意义，要重新审`);
  }
});

test("可信第三参数限定领取席位，同席另一个 binding_id 也不能使用已发 id", async () => {
  const custody = new SeatCustody();
  const a = custody.bind({ seatId: "scope-a", credential: "scope-secret-a" });
  const b = custody.bind({ seatId: "scope-b", credential: "scope-secret-b" });
  const sent = [];
  const surface = new ModelCommandSurface({ custody, request: async (command, params) => {
    sent.push({ command, params });
    return command === "ai.take_intents"
      ? { ok: true, status: 200, body: { result: { intents: [{ intent_id: `intent-${params.seat_id}`, seat_id: params.seat_id, claim_token: "core-claim" }] } } }
      : { ok: true, status: 200, body: { result: { started: { turn_id: `turn-${params.seat_id}` } } } };
  } });
  const scope = { seat_handle: a.seat_handle, binding_id: "binding-one" };
  const claim = await surface.call("ai.take_intents", {}, scope);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.seat_id, "scope-a");
  assert.equal(claim.body.result.seats_polled, 1);
  assert.equal(claim.body.result.intents.length, 1);
  for (const rejectedScope of [
    { seat_handle: b.seat_handle, binding_id: "binding-one" },
    { seat_handle: a.seat_handle, binding_id: "binding-two" },
  ]) {
    await assert.rejects(surface.call("ai.start", { intent_id: "intent-scope-a" }, rejectedScope),
      (error) => error.code === "authority_id_scope_mismatch");
  }
  assert.equal(sent.length, 1, "跨席/跨binding必须在打核心之前拒绝");
  await surface.call("ai.start", { intent_id: "intent-scope-a" }, scope);
  await assert.rejects(surface.call("ai.resolve", { turn_id: "turn-scope-a", decision: "silent" },
    { seat_handle: a.seat_handle, binding_id: "binding-two" }), (error) => error.code === "authority_id_scope_mismatch");
  assert.equal(sent.length, 2);
  await surface.call("ai.resolve", { turn_id: "turn-scope-a", decision: "silent" }, scope);
  assert.equal(sent.length, 3);
});

test("可信 scope 必须完整；释放/换代会围住已经发出但尚未返回的领取", async () => {
  const custody = new SeatCustody();
  const seat = custody.bind({ seatId: "pending-seat", credential: "pending-secret" });
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const surface = new ModelCommandSurface({ custody, request: () => pending });
  for (const scope of [null, {}, { seat_handle: seat.seat_handle }, { seat_handle: seat.seat_handle, binding_id: "" },
    { seat_handle: "unknown-handle", binding_id: "known-binding" }]) {
    await assert.rejects(surface.call("view.projection", {}, scope), (error) => error.code === "model_scope_rejected");
  }
  const waiting = surface.call("ai.take_intents", {}, { seat_handle: seat.seat_handle, binding_id: "pending-binding" });
  surface.clearIssued();
  release({ ok: true, status: 200, body: { result: { intents: [{ intent_id: "pending-intent", seat_id: "pending-seat" }] } } });
  await assert.rejects(waiting, (error) => error.code === "model_binding_changed");
  assert.equal(surface.trackedCount, 0);
  assert.throws(() => new ModelCommandSurface({ custody, request: async () => ({}), scopeIsCurrent: true }),
    (error) => error.code === "invalid_field");
});

test("一致性seed只计数不授权；未来出现同名真实句柄也不能激活旧seed", async () => {
  const { SeatModelAdapter } = require("../src/host/seat-model-adapter.cjs");
  const custody = new SeatCustody({ handleFactory: () => "handle-conformance-seed" });
  let dispatched = 0;
  const adapter = new SeatModelAdapter({ custody, dispatch: async () => { dispatched += 1; return {}; } });
  adapter.negotiate();
  adapter.seedForRelease();
  const attempts = [
    ["ai.start", { intent_id: "intent-conformance-seed" }],
    ["ai.resolve", { turn_id: "turn-conformance-seed", decision: "silent" }],
  ];
  for (const [command, params] of attempts) {
    const rejected = await adapter.call(command, params);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "model_scope_rejected");
  }
  assert.equal(dispatched, 0);
  custody.bind({ seatId: "later-real-seat", credential: "later-real-secret" });
  for (const [command, params] of attempts) {
    const rejected = await adapter.call(command, params);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "model_binding_changed");
  }
  assert.equal(dispatched, 0, "seed的null世代永不匹配真实句柄的正整数世代");
  adapter.seedForRelease();
  for (const [command, params] of attempts) {
    assert.equal((await adapter.call(command, params)).ok, false);
  }
  assert.equal(dispatched, 0, "句柄已经存在时再seed也只能计数，不能铸造调用能力");
  adapter.release();
});
