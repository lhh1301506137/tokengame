"use strict";

// 真实的座位模型适配器过合同一致性套件。
//
// 这个文件是「这份合同可实现」的唯一证据。模拟器过了只说明套件自洽——一份只有模拟器
// 实现的合同，整个就是本轮反复撞到的那种东西：一段永远走不到的检查。
//
// 除了一致性，这里还钉住三条只有真实实现才谈得上的事：
//   1. 权限边界仍然由 ModelCommandSurface 把关（适配器没有放宽它）。
//   2. 适配器不持有句柄，可检视状态里连一个都读不出来。
//   3. proactive_wake 未声明，所以协商结果必须给出「退回轮询」。

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runConformance, requiredCheckIds,
} = require("../test-support/adapter-conformance.cjs");
const {
  CONTRACT_VERSION, commandsForRole,
} = require("../src/contract/adapter-contract.cjs");
const { SeatCustody } = require("../src/host/seat-custody.cjs");
const {
  DECLARED_CAPABILITIES,
  SeatModelAdapter,
} = require("../src/host/seat-model-adapter.cjs");

// 假核心。返回什么不重要，一致性套件只发读命令。
function makeAdapter({ dispatch, capabilities } = {}) {
  const custody = new SeatCustody();
  // bind 要的是 seatId / credential（驼峰），不是核心那边的 snake_case 参数名。
  custody.bind({ seatId: "seat-1", credential: "cred-abcdefghijklmnop" });
  return new SeatModelAdapter({
    custody,
    dispatch: dispatch ?? (async () => ({ room: { room_id: "r1" }, seats: [] })),
    ...(capabilities === undefined ? {} : { capabilities }),
  });
}

test("真实座位模型适配器过合同一致性套件", async () => {
  const seen = [];
  const report = await runConformance(
    () => makeAdapter({
      dispatch: async (command, params) => {
        seen.push({ command, params });
        return { room: { room_id: "r1" }, seats: [] };
      },
    }),
    { role: "seat_model", observeDispatch: () => seen });
  assert.deepEqual(report.failures, [], `不合规项：${report.failures.join(" / ")}`);
  assert.equal(report.conformance_passed, true);
  assert.equal(report.report_integrity.ok, true,
    `报告结构不完整：${JSON.stringify(report.report_integrity)}`);
  assert.equal(report.checks.length, requiredCheckIds("seat_model").length);
  // 真实适配器交给传输的载荷必须能构成合规请求信封——不是 not_run。
  // 这一条是 C.2 那个请求信封在适配器层的落点：适配器只交 (command, params)，
  // 信封由传输构造，所以这一层能验的是「交下去的东西构不构得出信封」。
  const dispatchCheck = report.checks
    .find((entry) => entry.check_id === "dispatch_payload_envelope_ready");
  assert.equal(dispatchCheck.status, "pass", dispatchCheck.detail);
});

test("真实适配器：完整验证仍然为假，因为主动唤醒够不到", async () => {
  // conformance_passed 与 fully_verified 必须分开。合并成一个 passed 的话，
  // 一份「Gate 5 根本没验」的报告读起来像完整通过——那正是这一轮要拆的形状。
  //
  // 声明清单在 2026-08-29 改过：旧版把 proactive_wake 塞进来，而那个组合现在协商就过不去
  // （合同拒收 verified_on_any_host 为假的声明）。用默认声明同样够不到 fully_verified，
  // 因为那一条会记 not_run——两条路都到不了完整验证，而这正是要钉的。
  const report = await runConformance(() => makeAdapter(), { role: "seat_model" });
  assert.equal(report.conformance_passed, true, `不合规项：${report.failures.join(" / ")}`);
  assert.equal(report.fully_verified, false);
});

test("谎称有主动唤醒的适配器协商就失败，套件不再给它一份合规报告", async () => {
  // 这一条在 2026-08-29 换过语义，而换掉的是一段有理由的旧设计，所以两边都得说清楚。
  //
  // 旧设计：声明了就记 unverifiable，报告仍判合规。理由写在当时的注释里——「某个宿主真有
  // 这个能力时就该声明它，判成失败会逼人为了让套件绿而少声明一项」。那个顾虑是真的。
  //
  // 新设计：合同拒收任何 verified_on_any_host 为假的声明，于是协商这一步就抛。
  // 旧顾虑不适用于这道新检查，因为它的判据不是「你这个宿主做不到」，而是「至今没有任何
  // 宿主验证过它」。真有一次实机 Gate 5 通过、标志翻成 true 之后，声明立刻合法——
  // 这道检查会自己退休，不会逼任何人少声明一项自己真有的能力。
  //
  // 换的理由是后果不对称：negotiate 的 degradations 是宿主决定要不要轮询的唯一依据。
  // 声明了主动唤醒，polling 就不在清单里，宿主不轮询，而那个能力实际上不存在——牌局停在
  // 某一席上，谁都不知道是在等模型还是已经死了。一份「合规但被标注」的报告挡不住这件事，
  // 因为标注在报告里，而轮询决定在宿主里。
  const report = await runConformance(
    () => makeAdapter({ capabilities: ["command_dispatch", "proactive_wake"] }),
    { role: "seat_model" });
  assert.equal(report.conformance_passed, false,
    "谎称有主动唤醒仍然拿到一份合规报告");
  assert.ok(report.failures.some((line) => line.includes("negotiate_succeeds")),
    `失败项里没有协商那一条：${report.failures.join(" / ")}`);
  assert.ok(report.failures.some((line) => line.includes("capability_not_verified")),
    "失败原因里没说是能力未验证，读报告的人无从判断该改声明还是改实现");
  // 套件那一侧的防线仍然成立：这一条检查在任何路径上都不会说 pass。
  const inChecks = report.checks
    .find((item) => item.check_id === "proactive_wake_actually_works");
  assert.notEqual(inChecks.status, "pass",
    "套件产出了一条读起来像「主动唤醒验过了」的记录");
});

test("自己拼协商结果绕过合同的适配器，套件仍记下不可验证项", async () => {
  // 上一条把合同那道防线钉住了，这一条钉套件那道。两者不重复，因为套件**不要求**适配器
  // 走 contract.negotiate()——它只检视适配器报出来的东西。一个自己拼 negotiation 的适配器
  // 完全绕过合同的拒收，而那时套件里这条 unverifiable 就是最后一道。
  //
  // 这也是这条分支现在唯一的到达路径：走合同的适配器已经在协商这一步被拒了。分支还活着
  // 而不是死代码——一条只能靠「有人绕过合同」触发的记录，正是为那种情形写的。
  //
  // 另一条到达路径在将来：实机 Gate 5 通过、verified_on_any_host 翻成 true 之后，声明变得
  // 合法，而套件**仍然**验不了那个能力（只有实机答得出），所以那时这条记录照样要留下。
  const rogue = {
    role: "seat_model",
    capabilities: ["command_dispatch", "proactive_wake"],
    state: "created",
    negotiation: null,
    holdsSeatHandle: false,
    negotiate() {
      this.state = "negotiated";
      // 自己拼一份，不经合同。degradations 里没有 polling——正是「声明了就不给降级路径」。
      this.negotiation = {
        contract_version: CONTRACT_VERSION,
        role: this.role,
        actor: "model",
        commands: commandsForRole("seat_model"),
        degradations: [],
      };
      return this.negotiation;
    },
    inspectableState() {
      return { role: this.role, state: this.state, tracked_id_count: 0 };
    },
    seedForRelease() {},
    assertUsable() {},
    async call() {
      return { ok: true, status: 200, contract_version: CONTRACT_VERSION, result: null };
    },
    release() {
      this.state = "released";
      this.negotiation = null;
    },
  };

  const report = await runConformance(() => rogue, { role: "seat_model" });
  const entry = report.unverifiable
    .find((item) => item.check_id === "proactive_wake_actually_works");
  assert.ok(entry !== undefined,
    "声明了主动唤醒却没留下不可验证项：一份全绿报告会被读成 Gate 5 通过");
  assert.match(entry.reason, /只验内部一致性/);
  assert.match(entry.reason, /都未验证/);
  assert.match(entry.reason, /Gate 5/);
  // 那一条在 checks 里的 status 也必须是 unverifiable，不是 pass。
  // 只查 unverifiable 数组的话，同一条同时被记成 pass 也发现不了。
  const inChecks = report.checks
    .find((item) => item.check_id === "proactive_wake_actually_works");
  assert.equal(inChecks.status, "unverifiable");
  // 完整验证必须为假。这是这条记录存在的全部意义。
  assert.equal(report.fully_verified, false);
});

test("默认不声明时报告里没有不可验证项，但那一条也不是 pass", async () => {
  // 反面。默认配置下这一项不该出现在 unverifiable 里，否则「有没有不可验证项」
  // 就不再是一个信号。同时它也不该是 pass——套件永远不该产出一条读起来像
  // 「主动唤醒验过了」的记录，哪怕适配器根本没声明它。
  const report = await runConformance(() => makeAdapter(), { role: "seat_model" });
  assert.deepEqual(report.unverifiable, []);
  const wake = report.checks
    .find((item) => item.check_id === "proactive_wake_actually_works");
  assert.equal(wake.status, "not_run");
  assert.match(wake.detail, /没声明这个能力/);
});

test("默认不声明主动唤醒", () => {
  // 不是「暂时没实现」：它在两个宿主上都未验证（SAME_VISIBLE_TASK_SPIKE_V1 未执行）。
  // 声明它等于把一个未验证的能力写成已具备，而协商结果会据此不给降级路径——后果是
  // 宿主不轮询，牌局静默停住。
  assert.equal(DECLARED_CAPABILITIES.includes("proactive_wake"), false);
  assert.deepEqual([...DECLARED_CAPABILITIES], ["command_dispatch"]);
});

test("协商结果要求退回轮询", () => {
  const adapter = makeAdapter();
  const result = adapter.negotiate();
  const wake = result.degradations.find((d) => d.capability === "proactive_wake");
  assert.equal(wake.degrade_to, "polling");
});

test("不持有句柄，可检视状态里读不出任何秘密", () => {
  const adapter = makeAdapter();
  assert.equal(adapter.holdsSeatHandle, false);
  const serialized = JSON.stringify(adapter.inspectableState());
  for (const forbidden of ["seat_handle", "recovery_credential", "cred-", "seat-1"]) {
    assert.equal(serialized.includes(forbidden), false, `可检视状态里出现了 ${forbidden}`);
  }
  assert.match(serialized, /"tracked_id_count":0/);
});

test("真人面命令被本地拒绝，一个请求都不发出去", async () => {
  // 靠核心兜的话，一次拒绝也要先把请求发出去，而那条请求带着的正是模型不该有的权限。
  let dispatched = 0;
  const adapter = makeAdapter({ dispatch: async () => { dispatched += 1; return {}; } });
  adapter.negotiate();
  for (const command of ["hand.act", "hand.reveal", "seat.ready", "room.confirm_public_scope"]) {
    await assert.rejects(() => adapter.call(command, {}),
      (error) => error.code === "command_not_model_facing",
      `${command} 应当被本地拒绝`);
  }
  assert.equal(dispatched, 0, "被拒的命令不该产生任何一次核心调用");
});

test("模型自带身份字段被拒，且不算降级", async () => {
  // 本地拒绝不是传输失败。把它算成 degraded 会让「适配器刚失败过」这个状态失去意义，
  // 而宿主正是靠它决定要不要退回轮询。
  const adapter = makeAdapter();
  adapter.negotiate();
  const response = await adapter.call("view.projection", { seat_id: "seat-1" });
  assert.equal(response.ok, false);
  assert.equal(response.code, "seat_identity_not_model_supplied");
  assert.equal(adapter.state, "negotiated", "本地拒绝不该把适配器推进 degraded");
});

test("核心失败进 degraded，下一次成功回到 bound", async () => {
  let fail = true;
  const adapter = makeAdapter({
    dispatch: async () => {
      if (fail) {
        fail = false;
        const error = new Error("core_unreachable");
        error.code = "core_unreachable";
        error.status = 502;
        throw error;
      }
      return { ok: true };
    },
  });
  adapter.negotiate();
  const first = await adapter.call("view.projection", {});
  assert.equal(first.ok, false);
  assert.equal(first.code, "core_unreachable");
  assert.equal(adapter.state, "degraded");
  const second = await adapter.call("view.projection", {});
  assert.equal(second.ok, true);
  assert.equal(adapter.state, "bound");
});

test("释放清空一次性 id", () => {
  const adapter = makeAdapter();
  adapter.negotiate();
  // 从 seedForRelease 播种，不再从外部 adapter.surface.track 塞。
  // 外部塞得进去这件事本身就是缺陷：往那张表里写一条 intent_id -> handle，
  // 等于给自己发了一张替那一席行动的通行证，而 ai.start 只查这张表。
  adapter.seedForRelease();
  assert.equal(adapter.inspectableState().tracked_id_count, 2);
  adapter.release();
  assert.equal(adapter.inspectableState().tracked_id_count, 0);
  assert.equal(adapter.state, "released");
});

test("释放后不能再发命令，也不能重新协商", async () => {
  const adapter = makeAdapter();
  adapter.negotiate();
  adapter.release();
  await assert.rejects(() => adapter.call("view.projection", {}),
    (error) => error.code === "illegal_lifecycle_transition");
  assert.throws(() => adapter.negotiate(),
    (error) => error.code === "illegal_lifecycle_transition");
});

test("没协商就发命令被拒", async () => {
  const adapter = makeAdapter();
  await assert.rejects(() => adapter.call("view.projection", {}),
    (error) => error.code === "required_capability_missing"
      && error.details.reason === "not_negotiated");
});

test("构造时缺 custody 或 dispatch 都报出是哪个字段", () => {
  // custody 那条由 ModelCommandSurface 报（同码同字段），dispatch 那条由适配器自己报
  // ——后者必须在适配器里查，因为 ModelCommandSurface 收到的 request 永远是那个闭包，
  // 它看不到 dispatch 缺没缺。
  assert.throws(() => new SeatModelAdapter({ dispatch: async () => ({}) }),
    (error) => error.code === "invalid_field" && error.details.field === "custody");
  assert.throws(() => new SeatModelAdapter({ custody: new SeatCustody() }),
    (error) => error.code === "invalid_field" && error.details.field === "dispatch");
});

test("重复释放不抛", () => {
  // 用户关页面之后连接租约又超时，两条路都会调 release。第二次抛错会让清理路径自己
  // 变成一个错误来源——而清理路径报错最难处理：此时该清的东西已经清了一半。
  const adapter = makeAdapter();
  adapter.negotiate();
  adapter.release();
  assert.doesNotThrow(() => adapter.release());
  assert.doesNotThrow(() => adapter.release());
  assert.equal(adapter.state, "released");
  assert.equal(adapter.inspectableState().tracked_id_count, 0);
});

test("适配器不引用宿主专有名字", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "host", "seat-model-adapter.cjs"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(code, /\b(claude|codex|cowork|anthropic)\b/i);
});
