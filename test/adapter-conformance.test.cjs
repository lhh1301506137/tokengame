"use strict";

// 一致性套件自己的测试。
//
// 两件事，第二件才是重点：
//   1. 套件对着合规实现全绿。
//   2. 套件真的能抓到不合规——模拟器里每一项故意破坏都必须让至少一条检查变红。
//
// 少了第二件，这套东西就是一组恒为真的断言：跑得很好看，一个真问题也抓不住。本轮已经
// 撞到过四次同一类缺陷（恒假的条件、恒真的断言），所以这里把「套件能失败」当成一等要求。

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runConformance, CHECKS, requiredCheckIds,
} = require("../test-support/adapter-conformance.cjs");
const { BROKEN, SimulatedAdapter } = require("../test-support/adapter-simulator.cjs");
const { ADAPTER_ROLES, CAPABILITIES } = require("../src/contract/adapter-contract.cjs");

const ROLES = ["host_command", "seat_model"];

// 与模拟器里那份同源。这里不 require 它是因为模拟器只导出 BROKEN 与 SimulatedAdapter，
// 而给它加一个导出只为测试读一份映射，会让「模拟器的公开面」多一样东西。两处相等由下面
// 「模拟器挑的剖面与这里一致」那条对账。
const PROFILE_FOR_ROLE = Object.freeze({
  host_command: "web_table",
  seat_model: "codex_cli",
});

function make(role, overrides = {}) {
  return () => new SimulatedAdapter({
    role,
    dispatch: async () => ({ room: { room_id: "r1" }, seats: [] }),
    ...overrides,
  });
}

// 带请求观察点的工厂。dispatch_payload_envelope_ready 要看适配器交给传输的载荷，
// 而适配器不该为了被测多暴露一个出口，所以由调用方把 dispatch 接成记账的。
function makeObserved(role, overrides = {}) {
  const seen = [];
  return {
    factory: () => new SimulatedAdapter({
      role,
      dispatch: async (command, params) => {
        seen.push({ command, params });
        return { room: { room_id: "r1" }, seats: [] };
      },
      ...overrides,
    }),
    observeDispatch: () => seen,
  };
}

test("模拟器挑的剖面与本文件用的那份一致", () => {
  // 上面那份 PROFILE_FOR_ROLE 是抄的，抄的东西会漂。这条对账让漂移当场红：
  // 模拟器换了剖面而这里没跟，「降级清单是余集」那条就会拿错剖面算余集，
  // 而它仍然可能碰巧通过。
  for (const role of ROLES) {
    const adapter = new SimulatedAdapter({ role });
    assert.equal(adapter.profile, PROFILE_FOR_ROLE[role],
      `模拟器给 ${role} 挑的是 ${adapter.profile}，本文件按 ${PROFILE_FOR_ROLE[role]} 算`);
  }
});

for (const role of ROLES) {
  test(`参考适配器过一致性套件：${role}`, async () => {
    const { factory, observeDispatch } = makeObserved(role);
    const report = await runConformance(factory, { role, observeDispatch });
    assert.deepEqual(report.failures, [], `不合规项：${report.failures.join(" / ")}`);
    assert.equal(report.conformance_passed, true);
    // 报告结构完整：每条必需检查恰好一次。这比「条数够多」强——
    // 旧版那条 `checks.length >= 18` 只挡得住整段消失，挡不住某一条被跳过。
    assert.deepEqual(report.report_integrity.missing, []);
    assert.deepEqual(report.report_integrity.duplicated, []);
    assert.deepEqual(report.report_integrity.unknown, []);
    assert.equal(report.report_integrity.ok, true);
    assert.equal(report.checks.length, requiredCheckIds(role).length);
    // 每一条都有四态之一，没有漏写 status 的。
    for (const entry of report.checks) {
      assert.ok(["pass", "fail", "not_run", "unverifiable"].includes(entry.status),
        `${entry.check_id} 的 status 是 ${entry.status}`);
    }
  });

  test(`降级清单恰好是该剖面诚实声明之外的余集：${role}`, async () => {
    // 断言改过两次，两次的理由都写在这里。
    //
    // 第一版把 proactive_wake 也塞进声明里，断言「报告仍全绿但留下一条不可验证项」。
    // 那个组合后来协商就过不去了：合同拒收未验证能力的声明，因为 degradations 是宿主
    // 决定要不要轮询的依据——声明了它，polling 就不在清单里，宿主不轮询，而那个能力
    // 实际上并不存在。
    //
    // 第二版（2026-08-29 A3）写死了四项「已验证能力」，那假定了两个角色对称。剖面隔离
    // 之后不对称了：web_table 验证过三项 UI 能力，codex_cli 一项都没有，而模型角色连
    // 声明 UI 能力的资格都没有（allowed_capabilities）。写死清单于是对 seat_model 变成
    // 假的。
    //
    // 现在按合同算出「这个剖面能诚实声明什么」，再断言降级清单恰好是它的余集。这比写死
    // 清单强两处：不假定对称，也不会在加进新能力时悄悄过期。
    const declarable = ADAPTER_ROLES[role].allowed_capabilities.filter(
      (name) => CAPABILITIES[name].verified_on.includes(PROFILE_FOR_ROLE[role]),
    );
    assert.ok(declarable.includes("command_dispatch"),
      `${role} 的剖面必须验证过必需能力，否则这条测不出东西`);
    const { factory, observeDispatch } = makeObserved(role, { capabilities: declarable });
    const report = await runConformance(factory, { role, observeDispatch });
    assert.deepEqual(report.failures, []);
    // 降级清单直接问合同，不给一致性报告加字段。这条断言问的是 negotiate 的返回值，
    // 而报告是「套件跑完的结论」——为了一条断言往报告里加个出口会让两者的职责糊在一起。
    const adapter = factory();
    const degraded = adapter.negotiate().degradations.map((d) => d.capability).sort();
    const expected = Object.keys(CAPABILITIES).filter((n) => !declarable.includes(n)).sort();
    assert.deepEqual(degraded, expected,
      "降级清单必须恰好是没声明的那些——多一条会让宿主白退，少一条会让它不该省的省了");
    // 主动唤醒无论如何都在余集里：任何剖面都没验证过它。
    assert.ok(degraded.includes("proactive_wake"),
      "主动唤醒必须始终出现在降级清单里");
    // 没声明主动唤醒，所以那一条记 not_run（没这个能力，无需实机验证），不是 unverifiable。
    assert.deepEqual(report.unverifiable.map((e) => e.check_id), []);
    assert.equal(report.fully_verified, false,
      "有 not_run 项时不得判为完整验证——Gate 5 那一条永远够不到 pass");
  });

  test(`谎称有主动唤醒的适配器协商就失败：${role}`, async () => {
    // 上一条的正面。这一条钉住那道拒收真的在适配器路径上生效，而不只在直接调 negotiate 时。
    const { factory, observeDispatch } = makeObserved(role, {
      capabilities: ["command_dispatch", "proactive_wake"],
    });
    const report = await runConformance(factory, { role, observeDispatch });
    assert.equal(report.conformance_passed, false,
      "谎称有主动唤醒竟然过了一致性套件");
    assert.ok(report.failures.some((line) => line.includes("negotiate_succeeds")),
      `失败项里没有协商那一条：${report.failures.join(" / ")}`);
    // 而那一条检查仍然不会说 pass——两条防线各自成立。
    const wake = report.checks.find(
      (entry) => entry.check_id === "proactive_wake_actually_works");
    assert.notEqual(wake.status, "pass");
  });

  test(`没声明主动唤醒时那一条记 not_run，不记 pass：${role}`, async () => {
    // 反方向：不声明也不能产出一条读起来像「主动唤醒验过了」的记录。
    const { factory, observeDispatch } = makeObserved(role);
    const report = await runConformance(factory, { role, observeDispatch });
    const wake = report.checks.find((c) => c.check_id === "proactive_wake_actually_works");
    assert.equal(wake.status, "not_run", `实际是 ${wake.status}`);
    assert.equal(report.fully_verified, false);
  });
}

// ---- 套件必须能失败 ----

for (const [name, variant] of Object.entries(BROKEN)) {
  for (const role of variant.roles) {
    test(`套件抓得住：${name}（${role}）`, async () => {
      const seen = [];
      const report = await runConformance(
        () => variant.make({
          role,
          dispatch: async (command, params) => { seen.push({ command, params }); return {}; },
        }),
        { role, observeDispatch: () => seen });
      assert.ok(report.failures.length > 0,
        `${name} 这项破坏在 ${role} 上没有被任何一条检查抓到——套件在这一点上是空的`);
      assert.equal(report.conformance_passed, false);

      // 关键一步：红的必须是**该红的那一条**。
      //
      // 只断言 failures 非空的话，一个宽的破坏被下游某条检查抓住就算过——
      // out_of_face_passthrough 当初正是这样：它连带破坏了释放语义，被
      // 「释放后不能再发命令」抓住，而越界那一条其实一次都没红过。
      const failedIds = report.checks
        .filter((entry) => entry.status === "fail")
        .map((entry) => entry.check_id);
      for (const expected of variant.expect) {
        assert.ok(failedIds.includes(expected),
          `${name}（${role}）应当让 ${expected} 变红，实际红的是：`
          + `${failedIds.join(", ") || "（一条都没红，只有结构性失败）"}`);
      }

      // 报告结构在破坏下也必须成立：缺条、重条都会让上面那个断言失去意义
      // （缺条时 failedIds 里当然找不到它，但原因是没记，不是没红）。
      assert.deepEqual(report.report_integrity.missing, [],
        `${name}（${role}）的报告漏记了检查`);
      assert.deepEqual(report.report_integrity.duplicated, [],
        `${name}（${role}）的报告重复记账`);
    });
  }
}

test("每一项破坏都声明了它该让哪条检查变红", () => {
  // 不声明的话，「套件抓得住」就退化回只断言 failures 非空——那是这一轮要拆掉的形状。
  for (const [name, variant] of Object.entries(BROKEN)) {
    assert.ok(Array.isArray(variant.expect) && variant.expect.length > 0,
      `${name} 缺 expect`);
    for (const id of variant.expect) {
      assert.ok(Object.prototype.hasOwnProperty.call(CHECKS, id),
        `${name} 的 expect 里有未登记的 check_id：${id}`);
      for (const role of variant.roles) {
        assert.ok(requiredCheckIds(role).includes(id),
          `${name} 声明在 ${role} 上跑，但 ${id} 不是该角色的必需检查`);
      }
    }
  }
});

test("越界检查不是空的：只破坏那一条也要被抓住", async () => {
  // out_of_face_passthrough 连带破坏了释放语义，所以它被「释放后不能再发命令」抓住——
  // 那不能证明越界那一条不空。这里把破坏收窄到命令面上，并且要求失败项里点名越界。
  for (const role of ["host_command", "seat_model"]) {
    const report = await runConformance(
      () => BROKEN.out_of_face_only.make({ role, dispatch: async () => ({}) }), { role });
    assert.ok(report.failures.some((line) => line.includes("越界命令")),
      `${role}：失败项里没有点名越界。失败项：${report.failures.join(" | ") || "（一条都没有）"}`);
  }
});

test("缺 inspectableState 时报告点名这个方法，不只重复症状", async () => {
  // 下游那几条身份检查也会红（它们会说「没有 inspectableState() 可查」），所以光看
  // failures 非空抓不出这条显式检查是不是空的。诊断价值在于报告要说出根因，
  // 而不是把同一个症状说四遍。
  for (const role of ["host_command", "seat_model"]) {
    const report = await runConformance(
      () => BROKEN.no_inspectable_state.make({ role, dispatch: async () => ({}) }), { role });
    assert.ok(report.failures.some((line) => line.includes("实现了 inspectableState()")),
      `${role}：报告没点名缺失的方法。失败项：${report.failures.join(" | ")}`);
  }
});

test("每一项破坏都声明了适用角色", () => {
  // 第一版按名字前缀猜角色，于是 release_keeps_tracked_ids 被拿去真人面上跑——那一侧
  // 本来就没有一次性 id，不构成违规，而「没抓到」被读成了「套件有洞」。这条钉住角色
  // 必须显式写出来。
  for (const [name, variant] of Object.entries(BROKEN)) {
    assert.ok(Array.isArray(variant.roles) && variant.roles.length > 0, `${name} 缺 roles`);
    assert.equal(typeof variant.make, "function", `${name} 缺 make`);
    for (const role of variant.roles) {
      assert.ok(["host_command", "seat_model"].includes(role), `${name} 的 roles 里有 ${role}`);
    }
  }
});

test("模型面专属的破坏项确实只声明模型面", () => {
  // 反向确认：真人面本来就该持有句柄，同一段代码在那边合规。少了这一条，
  // 「只在模型面跑」看起来像是为了让测试过。
  assert.deepEqual(BROKEN.model_holds_handle.roles, ["seat_model"]);
  assert.deepEqual(BROKEN.model_claims_handle.roles, ["seat_model"]);
  assert.deepEqual(BROKEN.release_keeps_tracked_ids.roles, ["seat_model"]);
  // 真人面上跑 model_claims_handle 必须是**通过**的——它声明持有句柄，那是真人面的正解。
  return runConformance(
    () => BROKEN.model_claims_handle.make({ role: "host_command", dispatch: async () => ({}) }),
    { role: "host_command" },
  ).then((report) => {
    assert.deepEqual(report.failures, [],
      "声明持有句柄在真人面上是正解，不该被判违规");
  });
});

test("真人面持有句柄，模型面不持有", async () => {
  const human = await runConformance(make("host_command"), { role: "host_command" });
  const model = await runConformance(make("seat_model"), { role: "seat_model" });
  const names = (report) => report.checks.map((c) => c.name);
  assert.ok(names(human).includes("真人侧适配器声明持有句柄"));
  assert.ok(names(model).includes("模型侧适配器不持有 seat_handle"));
  assert.equal(names(human).some((n) => n.includes("不持有 seat_handle")), false);
});

test("角色名不认时套件不静默通过", async () => {
  await assert.rejects(
    () => runConformance(make("host_command"), { role: "nope" }),
    { code: "unknown_adapter_role" });
});

test("没给工厂时套件报出来而不是崩", async () => {
  const report = await runConformance(undefined, { role: "seat_model" });
  assert.equal(report.failures.length, 1);
  assert.match(report.failures[0], /提供了适配器工厂/);
});

test("工厂抛错时套件如实记下，不当成通过", async () => {
  const report = await runConformance(() => { throw new Error("接线错了"); },
    { role: "seat_model" });
  assert.equal(report.failures.length > 0, true);
  assert.match(report.failures[0], /adapter_constructs/);
  // 提前返回也要给出一份**结构完整**的报告：剩下的全部显式记成 not_run。
  // 旧版直接 return 一份两条的报告，而两条的和三十几条的在调用方看来都只是「报告」。
  assert.deepEqual(report.report_integrity.missing, [],
    `提前返回时漏记了检查：${report.report_integrity.missing.join(", ")}`);
  assert.equal(report.checks.length, requiredCheckIds("seat_model").length);
  assert.equal(report.conformance_passed, false);
  // 除了构造那条，其余都该是 not_run 并写明原因。
  const notRunIds = report.not_run.map((e) => e.check_id);
  assert.equal(notRunIds.length, requiredCheckIds("seat_model").length - 2,
    `not_run 条数不对：${notRunIds.length}`);
  for (const entry of report.not_run) {
    assert.match(entry.reason, /没得可查/, `${entry.check_id} 的 not_run 没写理由`);
  }
});

test("失败行以 check_id 开头，报告能按 id 对账", async () => {
  // 名字里带插值（越界命令那条在两个角色下是两个字符串），只按名字对账跨报告对不上。
  const report = await runConformance(
    () => BROKEN.starts_negotiated.make({ role: "seat_model", dispatch: async () => ({}) }),
    { role: "seat_model" });
  assert.ok(report.failures.length > 0);
  for (const line of report.failures) {
    const id = line.split("｜")[0];
    assert.ok(Object.prototype.hasOwnProperty.call(CHECKS, id) || id === "report_integrity",
      `失败行没有以已登记的 check_id 开头：${line}`);
  }
  assert.ok(report.failures.some((line) => line.startsWith("initial_state_created")));
});

test("没给 observeDispatch 时请求载荷那条记 not_run，不记 pass", async () => {
  // 「没能查」绝不能读成「查过了」。这条检查需要调用方提供观察点，
  // 而适配器不该为了被测多暴露一个出口——所以缺观察点是常态，必须在报告里看得见。
  const report = await runConformance(make("seat_model"), { role: "seat_model" });
  const entry = report.checks
    .find((c) => c.check_id === "dispatch_payload_envelope_ready");
  assert.equal(entry.status, "not_run", `实际是 ${entry.status}`);
  assert.match(entry.detail, /observeDispatch/);
  assert.equal(report.fully_verified, false);
});

test("读命令成功时失败信封那条记 not_run，不记 pass", async () => {
  // 这一跑根本没产生失败信封，判 pass 等于宣称「失败信封的形状验过了」。
  const { factory, observeDispatch } = makeObserved("seat_model");
  const report = await runConformance(factory, { role: "seat_model", observeDispatch });
  const entry = report.checks.find((c) => c.check_id === "failure_envelope_has_code");
  assert.equal(entry.status, "not_run", `实际是 ${entry.status}`);
  assert.match(entry.detail, /没有失败信封可查/);
});

test("读命令回失败信封时那条才真的查", async () => {
  // 反方向：not_run 不能是个永远的挡箭牌。核心失败时适配器回错误信封，
  // 那一跑里这条检查必须真的跑起来。
  const seen = [];
  const report = await runConformance(
    () => new SimulatedAdapter({
      role: "seat_model",
      dispatch: async (command, params) => {
        seen.push({ command, params });
        throw Object.assign(new Error("核心挂了"), { code: "core_unreachable" });
      },
    }),
    { role: "seat_model", observeDispatch: () => seen });
  const entry = report.checks.find((c) => c.check_id === "failure_envelope_has_code");
  assert.equal(entry.status, "pass", `实际是 ${entry.status}：${entry.detail}`);
});

test("核心失败时适配器回错误信封而不是抛", async () => {
  // 传输失败是可重试类，适配器该把它变成一个信封交上去，让调用方按分类决定。抛出去
  // 会让每个调用点自己写 try/catch，而那些 catch 里迟早有人写成静默忽略。
  const adapter = new SimulatedAdapter({
    role: "seat_model",
    dispatch: async () => {
      const error = new Error("core_unreachable");
      error.code = "core_unreachable";
      error.status = 502;
      throw error;
    },
  });
  adapter.negotiate();
  const response = await adapter.call("view.projection", {});
  assert.equal(response.ok, false);
  assert.equal(response.code, "core_unreachable");
  assert.equal(response.status, 502);
  assert.equal(adapter.state, "degraded");
});

test("一次传输失败之后还能继续发命令", async () => {
  // degraded 不是终态。一次网络抖动让适配器再也发不出命令的话，牌局就停在那里了。
  let fail = true;
  const adapter = new SimulatedAdapter({
    role: "seat_model",
    dispatch: async () => {
      if (fail) {
        fail = false;
        const error = new Error("core_unreachable");
        error.code = "core_unreachable";
        throw error;
      }
      return { ok: true };
    },
  });
  adapter.negotiate();
  await adapter.call("view.projection", {});
  assert.equal(adapter.state, "degraded");
  const second = await adapter.call("view.projection", {});
  assert.equal(second.ok, true);
  assert.equal(adapter.state, "bound");
});

test("没协商就发命令被拒", async () => {
  const adapter = new SimulatedAdapter({ role: "seat_model" });
  await assert.rejects(() => adapter.call("view.projection", {}),
    (error) => error.code === "required_capability_missing"
      && error.details.reason === "not_negotiated");
});

test("重复释放不抛", async () => {
  // 用户关页面之后连接租约又超时，两条路都会调 release。第二次抛错会让清理路径自己
  // 变成一个错误来源。
  const adapter = new SimulatedAdapter({ role: "seat_model" });
  adapter.negotiate();
  adapter.release();
  assert.doesNotThrow(() => adapter.release());
  assert.equal(adapter.state, "released");
});

test("释放清空句柄", async () => {
  const adapter = new SimulatedAdapter({ role: "host_command" });
  adapter.handles = ["h1", "h2"];
  adapter.negotiate();
  adapter.release();
  assert.deepEqual(adapter.handles, []);
});

test("真人面的可检视状态只报句柄数目，不报值", () => {
  // 值一旦进了报告就等于凭据落进了日志——本轮刚在验收产物里修过同一类问题。
  const adapter = new SimulatedAdapter({ role: "host_command" });
  adapter.handles = ["seat_handle-secret-value"];
  const serialized = JSON.stringify(adapter.inspectableState());
  assert.equal(serialized.includes("secret-value"), false);
  assert.match(serialized, /"handle_count":1/);
});

test("模拟器与一致性套件都不引用宿主专有名字", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  for (const file of ["adapter-conformance.cjs", "adapter-simulator.cjs"]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "test-support", file), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
    assert.doesNotMatch(code, /\b(claude|codex|cowork|anthropic)\b/i,
      `${file} 的可执行代码里出现了宿主专有名字`);
  }
});
