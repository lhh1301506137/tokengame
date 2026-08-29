"use strict";

// host_command 剖面的参考适配器。
//
// 这个文件分三组，每组回答一个不同的问题：
//
//   一、一致性套件在真实实现上是否通过。此前 host_command 那一侧只有模拟器实现，而模拟器
//       过了只说明套件自洽——一份只有模拟器实现的剖面整个就是「一段永远走不到的检查」。
//
//   二、本适配器的语义是不是我现编的。靠特征测试：同一件事在 TableWebHost 和本适配器上各
//       测一遍，两边结果必须相同。这一组保护的是**已闭合的 TableWebHost 行为**——如果哪天
//       有人照本适配器去改牌桌，或者反过来改牌桌时忘了这一侧，这一组会红。
//
//   三、真人侧独有的边界：这一侧真的持有句柄，所以「取不到」必须是结构上的。
//
// 不测的事：本适配器不起服务、不开定时器、不碰网络，所以没有路由、轮询、租约的测试。
// 那些是 TableWebHost 的事，由 test/table-web-host.test.cjs 与浏览器验收看着。

const test = require("node:test");
const assert = require("node:assert/strict");

const { CONTRACT_VERSION, commandsForRole } = require("../src/contract/adapter-contract.cjs");
const { CREDENTIAL_COMMANDS } = require("../src/authority/host-surface.cjs");
const { DECLARED_CAPABILITIES, HostCommandAdapter } = require("../src/host/host-command-adapter.cjs");
const { SeatCustody } = require("../src/host/seat-custody.cjs");
const { runConformance } = require("../test-support/adapter-conformance.cjs");

// 一张真的托管层加一张真的句柄。不用替身：这一组要证明的正是「真实实现能过」。
function bound({ dispatch } = {}) {
  const custody = new SeatCustody();
  const { seat_handle: handle } = custody.bind({
    seatId: "seat-a",
    credential: "cred-synthetic-not-a-real-secret",
  });
  const calls = [];
  const adapter = new HostCommandAdapter({
    custody,
    dispatch: dispatch ?? (async (command, params) => {
      calls.push({ command, params });
      return { echoed: command };
    }),
  });
  adapter.rememberHandle(handle);
  return { adapter, calls, custody, handle };
}

// ---- 一、一致性套件跑真实实现 ----

test("真实的 host_command 适配器通过一致性套件", async () => {
  // observeDispatch 是**取**已记下的载荷，不是接收回调。套件用它检验
  // dispatch_payload_envelope_ready：适配器只交 (command, params)，信封由传输构造，
  // 所以这一层验的是载荷构不构得出合规信封。
  const observed = [];
  const report = await runConformance(() => {
    const custody = new SeatCustody();
    const { seat_handle: handle } = custody.bind({
      seatId: "seat-a",
      credential: "cred-synthetic-not-a-real-secret",
    });
    const adapter = new HostCommandAdapter({
      custody,
      dispatch: async (command, params) => {
        observed.push({ command, params });
        // 套件只发读命令。view.seat 要凭据，所以它会走注入那条路——这正是要覆盖的。
        return { command };
      },
    });
    adapter.rememberHandle(handle);
    // 套件不知道句柄这回事，所以由工厂把默认句柄接上：本适配器刻意不猜句柄，
    // 而套件发的 view.seat 要凭据。这不是给可测性开口子，是宿主本来就要做的接线。
    const inner = adapter.call.bind(adapter);
    adapter.call = (command, params) => inner(command, params, { seatHandle: handle });
    return adapter;
  }, {
    role: "host_command",
    observeDispatch: () => observed,
  });

  assert.equal(report.report_integrity.ok, true,
    `记账对不上：${JSON.stringify(report.report_integrity)}`);
  assert.deepEqual(report.failures, [], `一致性套件有失败项：${report.failures.join(" / ")}`);
  assert.equal(report.conformance_passed, true);
});

test("套件在真实实现上仍然不声称主动唤醒已验证", async () => {
  const report = await runConformance(() => bound().adapter, { role: "host_command" });
  const wake = report.checks.find((entry) => entry.check_id === "proactive_wake_actually_works");
  assert.notEqual(wake, undefined);
  assert.notEqual(wake.status, "pass", "套件产出了一条读起来像「主动唤醒验过了」的记录");
  assert.equal(report.fully_verified, false,
    "fully_verified 为真意味着没有 unverifiable 也没有 not_run，而 Gate 5 未验证");
});

test("不声明 proactive_wake，也不声明自己不提供的 structured_ui", () => {
  assert.deepEqual(DECLARED_CAPABILITIES, ["command_dispatch"]);
});

// ---- 二、特征测试：与 TableWebHost 逐字段对账 ----
//
// 这一组保护的是**已闭合的 TableWebHost 行为**，不是给它开改动许可。两侧对同一条命令
// 各注入一次，结果必须逐字段相同。
//
// 为什么值得这样测：两处各自调 custody.inject 看起来不可能漂移，而漂移的真实形状是有人
// 在一侧加了「顺手补个默认值」或「这条命令特殊处理一下」。那种改动不会让任何现有测试红，
// 因为两侧各有各的测试，没有一条把它们放在一起看。

function webHostLike() {
  // 只借 TableWebHost 的 injected 那一段，不起服务：起服务会引入端口、定时器、
  // 会话表，而这一组要对账的只有注入语义。构造真的 TableWebHost 再调它的 injected
  // 会连带启动驱动与租约扫描，那些与本组无关，也会让测试变成一次集成跑。
  const { TableWebHost } = require("../src/host/table-web-host.cjs");
  const custody = new SeatCustody();
  const { seat_handle: handle } = custody.bind({
    seatId: "seat-a",
    credential: "cred-synthetic-not-a-real-secret",
  });
  const host = Object.create(TableWebHost.prototype);
  host.custody = custody;
  return { host, custody, handle, session: { seat_handle: handle } };
}

for (const command of ["view.seat", "seat.ready", "chat.say", "hand.act"]) {
  test(`注入语义与 TableWebHost 一致：${command}`, async () => {
    const web = webHostLike();
    const params = command === "hand.act"
      ? { action: "check" }
      : command === "chat.say" ? { text: "hi" } : {};

    const fromHost = web.host.injected(command, web.session, params);

    const seen = [];
    const custody = new SeatCustody();
    const { seat_handle: handle } = custody.bind({
      seatId: "seat-a",
      credential: "cred-synthetic-not-a-real-secret",
    });
    const adapter = new HostCommandAdapter({
      custody,
      dispatch: async (cmd, payload) => {
        seen.push({ cmd, payload });
        return { ok: true };
      },
    });
    adapter.rememberHandle(handle);
    adapter.negotiate();
    await adapter.call(command, params, { seatHandle: handle });

    assert.equal(seen.length, 1, "适配器没把命令交给传输");
    assert.deepEqual(seen[0].payload, fromHost,
      `${command} 的注入结果与 TableWebHost 不一致——两处会漂移，而漂移方向不可预测`);
    // 两侧都不能把句柄发给核心：核心不认识它。
    assert.equal("seat_handle" in seen[0].payload, false);
    assert.equal("seat_handle" in fromHost, false);
  });
}

test("要凭据的命令两侧都补上 seat_id 与 recovery_credential", () => {
  const web = webHostLike();
  const injected = web.host.injected("seat.ready", web.session, {});
  // 这一条钉的是「对账通过」不等于「两边都什么也没做」：如果两侧都恰好返回原样参数，
  // 上面那组 deepEqual 一样会过，而那时凭据根本没补上。
  assert.equal(injected.seat_id, "seat-a");
  assert.equal(injected.recovery_credential, "cred-synthetic-not-a-real-secret");
  assert.ok(CREDENTIAL_COMMANDS.includes("seat.ready"));
});

test("不要凭据的命令两侧都不补，也都把句柄摘掉", async () => {
  const web = webHostLike();
  const fromHost = web.host.injected("room.create", web.session,
    { player_id: "p1", table_rules_version: "table-rules-v1" });
  assert.deepEqual(fromHost, { player_id: "p1", table_rules_version: "table-rules-v1" });

  const { adapter, calls, handle } = bound();
  adapter.negotiate();
  await adapter.call("room.create",
    { player_id: "p1", table_rules_version: "table-rules-v1" }, { seatHandle: handle });
  assert.deepEqual(calls[0].params, fromHost);
  assert.equal(CREDENTIAL_COMMANDS.includes("room.create"), false);
});

// ---- 三、真人侧独有的边界 ----
//
// 这一侧**真的**持有句柄，所以「取不到」必须是结构上的，不能靠 inspectableState() 选择
// 不展示。模型侧那一版曾把 custody 挂成公开属性，于是 adapter.surface.custody.resolve(handle)
// 一步就取出凭据原文——文本出口净化得再干净都没用，因为根本不用走文本出口。

test("句柄与托管层在类外取不到：点号、Reflect、JSON 三条路都不通", () => {
  const { adapter, handle } = bound();
  adapter.rememberHandle(handle);

  assert.equal(adapter.custody, undefined);
  assert.equal(adapter.handles, undefined);
  assert.equal(adapter.dispatch, undefined);
  const keys = Reflect.ownKeys(adapter);
  for (const banned of ["custody", "handles", "dispatch", "#custody", "#handles"]) {
    assert.equal(keys.includes(banned), false, `Reflect.ownKeys 列出了 ${banned}`);
  }
  const serialized = JSON.stringify(adapter);
  assert.equal(serialized.includes(handle), false, "JSON.stringify 把句柄序列化出来了");
  assert.equal(serialized.includes("cred-synthetic"), false);
});

test("可检视状态只报句柄数目，不含句柄本身", () => {
  const { adapter, handle } = bound();
  const state = adapter.inspectableState();
  assert.equal(state.seat_handle_count, 1);
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(handle), false);
  // 套件按这个正则扫。句柄的真实前缀就是 seat_handle-，所以摊出来会当场红。
  assert.equal(/seat_handle-|credential/.test(serialized), false, serialized);
});

test("对象图搜索：从适配器出发走不到凭据原文", () => {
  const { adapter } = bound();
  const secret = "cred-synthetic-not-a-real-secret";
  const seen = new Set();
  const queue = [adapter];
  let visited = 0;
  while (queue.length > 0 && visited < 200) {
    const node = queue.shift();
    if (node === null || seen.has(node)) continue;
    if (typeof node === "string") {
      assert.notEqual(node, secret, "对象图里能走到凭据原文");
      continue;
    }
    if (typeof node !== "object" && typeof node !== "function") continue;
    seen.add(node);
    visited += 1;
    for (const key of Reflect.ownKeys(node)) {
      let value;
      try {
        value = node[key];
      } catch {
        continue;
      }
      queue.push(value);
    }
    queue.push(Object.getPrototypeOf(node));
  }
  // 对照组：托管层自己当然走得到，否则上面那圈是在一张空图上跑。
  const { custody } = bound();
  assert.ok([...custody.bindings.values()].some((entry) => entry.credential === secret),
    "对照组也走不到，说明这次搜索什么都没证明");
});

test("释放会走托管层的 forget，不只清本地那份 Set", () => {
  const { adapter, custody, handle } = bound();
  assert.equal(custody.bindings.has(handle), true);
  adapter.negotiate();
  adapter.release();
  assert.equal(adapter.inspectableState().seat_handle_count, 0);
  // 只清本地 Set 的话，托管层里那份句柄到凭据的映射还在，而那份映射正是凭据原文的存放处。
  assert.equal(custody.bindings.has(handle), false,
    "句柄从本地清了，托管层里的凭据映射还在");
});

test("不猜句柄：记着一张也要显式传", async () => {
  const { adapter, calls } = bound();
  adapter.negotiate();
  const envelope = await adapter.call("seat.ready", {});
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "seat_handle_required");
  assert.equal(calls.length, 0);
  // 「只有一席就用那一席」在多席宿主上的表现是替错的人行动，而单席测试永远发现不了。
  // 托管层那条注释已经把这件事写死，本层再开一个猜的口子等于把那条判断绕过去。
});

test("越界命令本地拒绝，且错误码分得出是哪一面越界", async () => {
  const { adapter, calls, handle } = bound();
  adapter.negotiate();
  // ai.take_intents 在模型面，不在真人面。
  assert.equal(commandsForRole("host_command").includes("ai.take_intents"), false);
  assert.throws(() => adapter.assertUsable("ai.take_intents"), (error) => {
    assert.equal(error.code, "command_not_host_facing");
    return true;
  });
  assert.equal(calls.length, 0);
  void handle;
});

test("未协商就发命令被拒，释放之后也不能再发或重新协商", async () => {
  const { adapter, handle } = bound();
  assert.throws(() => adapter.assertUsable("view.seat"), (error) => {
    assert.equal(error.code, "required_capability_missing");
    assert.equal(error.details.reason, "not_negotiated");
    return true;
  });
  adapter.negotiate();
  assert.equal(adapter.negotiation.contract_version, CONTRACT_VERSION);
  await adapter.call("view.seat", {}, { seatHandle: handle });
  adapter.release();
  assert.throws(() => adapter.assertUsable("view.seat"), (error) => {
    assert.equal(error.code, "illegal_lifecycle_transition");
    return true;
  });
  assert.throws(() => adapter.negotiate());
});

test("构造时缺 dispatch 或缺托管层都当场报，不推迟到第一次调用", () => {
  const custody = new SeatCustody();
  assert.throws(() => new HostCommandAdapter({ custody }), (error) => {
    assert.equal(error.code, "invalid_field");
    assert.equal(error.details.field, "dispatch");
    return true;
  });
  // 模型侧不查 custody（ModelCommandSurface 已经查了并报同一个码），本适配器没有那层中介，
  // 所以这里是唯一的检查点。少了它，一个没接托管层的真人适配器会一路构造成功。
  assert.throws(() => new HostCommandAdapter({ dispatch: async () => ({}) }), (error) => {
    assert.equal(error.code, "invalid_field");
    assert.equal(error.details.field, "custody");
    return true;
  });
  assert.throws(() => new HostCommandAdapter({ dispatch: async () => ({}), custody: {} }),
    (error) => {
      assert.equal(error.details.field, "custody");
      return true;
    });
});

test("核心失败进 degraded，下一次成功回到 bound", async () => {
  let fail = true;
  const custody = new SeatCustody();
  const { seat_handle: handle } = custody.bind({
    seatId: "seat-a",
    credential: "cred-synthetic-not-a-real-secret",
  });
  const adapter = new HostCommandAdapter({
    custody,
    dispatch: async () => {
      if (fail) {
        const error = new Error("boom");
        error.code = "core_unreachable";
        error.status = 502;
        throw error;
      }
      return { ok: true };
    },
  });
  adapter.rememberHandle(handle);
  adapter.negotiate();

  const bad = await adapter.call("view.seat", {}, { seatHandle: handle });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "core_unreachable");
  assert.equal(adapter.state, "degraded");

  fail = false;
  const good = await adapter.call("view.seat", {}, { seatHandle: handle });
  assert.equal(good.ok, true);
  assert.equal(adapter.state, "bound", "degraded 成了终态，宿主会一直以为自己该退回轮询");
});

test("浏览器自带 seat_id 或 recovery_credential 时两侧都拒", async () => {
  const web = webHostLike();
  for (const forged of [{ seat_id: "seat-b" }, { recovery_credential: "stolen" }]) {
    assert.throws(() => web.host.injected("seat.ready", web.session, forged));

    const { adapter, calls, handle } = bound();
    adapter.negotiate();
    const envelope = await adapter.call("seat.ready", forged, { seatHandle: handle });
    // 适配器回信封而不是抛：真人面的调用方是 HTTP 路由，它要一个可以直接回给浏览器的形状。
    assert.equal(envelope.ok, false);
    assert.match(envelope.code, /not_model_supplied/);
    assert.equal(calls.length, 0, "越权参数被拒之后仍然把请求发出去了");
    // 本地拒绝**不是**降级。把它算成降级会让「适配器刚失败过」这个状态失去意义，
    // 而宿主正是靠它决定要不要退回轮询——一次伪造参数会让整桌退回轮询模式。
    assert.equal(adapter.state, "negotiated",
      "本地拒绝把状态推成了 degraded，而核心一次都没被打到");
  }
});

test("记句柄要求非空串：空句柄解析不出任何席位", () => {
  const { adapter } = bound();
  for (const bad of ["", null, undefined, 42]) {
    assert.throws(() => adapter.rememberHandle(bad), (error) => {
      assert.equal(error.code, "invalid_field");
      assert.equal(error.details.field, "seat_handle");
      return true;
    }, `rememberHandle(${JSON.stringify(bad)}) 没有报错`);
  }
  // 收下空句柄的表现是 seat_handle_count 报了个数，而那张句柄什么都发不出去——
  // 「明明记着一张却用不了」比一开始就拒更难查。
  assert.equal(adapter.inspectableState().seat_handle_count, 1);
});
