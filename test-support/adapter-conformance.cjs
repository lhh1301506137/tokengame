"use strict";

// 合同一致性套件。任何一侧适配器实现都要过这一套，两侧共用同一份断言。
//
// 为什么要有它：合同文件本身只是一组常量和几个纯函数，全绿也只证明「常量还在」。真正要
// 守的是「一个实现遵守了它」，而那必须对着实现跑。上一轮的教训就在这里——五处缺口都不会红，
// 因为没有一条断言走到那些路径上。
//
// 宿主中立：本文件不引用 Codex / Claude / MCP / 浏览器。
//
// ---- 报告结构（2026-08-29 改）----
//
// 每一项检查有稳定的 check_id 和四态之一的 status：
//   pass          查了，成立。
//   fail          查了，不成立。
//   not_run       没查。可能是它依赖的前一条已经失败，也可能是调用方没提供必要的观察点。
//   unverifiable  本套件够不到。不是通过也不是失败——「无点击主动唤醒」只有真实宿主答得出。
//
// 为什么要 check_id 而不是只有名字。名字里带插值（`越界命令 ${outOfFace} 被本地拒绝`），
// 于是同一条逻辑检查在两个角色下是两个字符串，跨报告对不上。更要紧的是变体测试：
// 断言「failures 非空」只能证明有东西红了，证明不了红的是**该红的那一条**——
// 上一轮 out_of_face_passthrough 就是被「释放后不能再发命令」抓住的，越界那一条其实是空的。
//
// 为什么要求「每项必需检查恰好出现一次」。少一条意味着某段代码被跳过了，而跳过在旧报告里
// 和通过长得一样：`checks` 数组短了几条，没人数。多一条意味着同一件事记了两遍，
// 于是 failures 里同一个症状说两次，根因反而被淹掉。report_integrity 把这两种都变成硬失败。
//
// 为什么把 passed 拆成两个。旧的 `passed = failures.length === 0` 在
// unverifiable 非空时仍然是 true，于是一份「Gate 5 根本没验」的报告读起来像完整通过。
//   conformance_passed  没有 fail，且报告结构完整。这是「实现遵守了合同」。
//   fully_verified      在上面之外还要求没有 unverifiable、没有 not_run。
//                       这是「合同的每一条都真的验过了」。当前两个角色都到不了这一格，
//                       因为 proactive_wake 永远是 unverifiable。
// 刻意不再导出一个叫 passed 的字段：调用方必须说出自己要的是哪一个。
//
// 用法：
//   const { runConformance } = require("./adapter-conformance.cjs");
//   const report = await runConformance(() => new MyAdapter(...), { role: "seat_model" });
//   report.conformance_passed  // 合规
//   report.fully_verified      // 合规且无未验证项（当前恒为 false，proactive_wake 够不到）
//
// 返回报告而不是直接抛：一处不合规之后剩下的检查往往还有诊断价值，和验收脚本
// 「断言不抛错」是同一条理由。

const {
  CONTRACT_VERSION,
  commandsForRole,
  requestEnvelope,
} = require("../src/contract/adapter-contract.cjs");

const BOTH = Object.freeze(["host_command", "seat_model"]);

// 检查清单。id 稳定，name 只用来读。roles 决定这一项在哪个角色的报告里是必需的。
//
// 这张表是报告完整性的判据：跑完之后逐条比对，缺了、重了、或记了表外的 id 都是硬失败。
// 所以新增检查必须先在这里登记——忘登记的话 record 会立刻抛，而不是悄悄多出一条。
const CHECKS = Object.freeze({
  factory_provided: { name: "提供了适配器工厂", roles: BOTH },
  adapter_constructs: { name: "能构造适配器", roles: BOTH },
  role_exposed: { name: "暴露 role", roles: BOTH },
  initial_state_created: { name: "初始生命周期状态是 created", roles: BOTH },
  capabilities_is_array: { name: "暴露 capabilities 数组", roles: BOTH },

  negotiate_succeeds: { name: "协商成功", roles: BOTH },
  negotiated_contract_version: { name: "协商回的合同版本与本地一致", roles: BOTH },
  state_negotiated: { name: "协商后进入 negotiated", roles: BOTH },
  command_face_by_identity: { name: "协商回的命令面与角色相符（按对象身份，不是抄的副本）", roles: BOTH },
  degradations_is_array: { name: "协商回了降级清单", roles: BOTH },
  wake_declaration_consistent: { name: "主动唤醒的声明与降级清单一致", roles: BOTH },
  // 恒定登记，两种结果都不是 pass：声明了就是 unverifiable（只有实机答得出），
  // 没声明就是 not_run（没这个能力，无需实机验证）。
  // 刻意没有 pass 分支——本套件永远不该产出一条读起来像「主动唤醒验过了」的记录。
  proactive_wake_actually_works: { name: "主动唤醒真的不需要点击（Gate 5）", roles: BOTH },

  out_of_face_rejected: { name: "越界命令被本地拒绝", roles: BOTH },
  out_of_face_error_code: { name: "越界拒绝用的是合同里的错误码", roles: BOTH },

  read_command_available: { name: "角色的命令面里有可用的读命令", roles: BOTH },
  read_returns_envelope: { name: "公开读取返回信封", roles: BOTH },
  envelope_has_ok: { name: "信封带 ok 字段", roles: BOTH },
  envelope_has_status: { name: "信封带 status 字段", roles: BOTH },
  envelope_has_contract_version: { name: "信封带合同版本", roles: BOTH },
  failure_envelope_has_code: { name: "失败信封带错误码", roles: BOTH },
  dispatch_payload_envelope_ready: { name: "交给传输的载荷能构成合规请求信封", roles: BOTH },

  inspectable_state_implemented: { name: "实现了 inspectableState()", roles: BOTH },
  model_holds_no_seat_handle: { name: "模型侧适配器不持有 seat_handle", roles: ["seat_model"] },
  model_holds_no_recovery_credential: { name: "模型侧适配器不持有 recovery_credential", roles: ["seat_model"] },
  model_holds_no_seat_credential: { name: "模型侧适配器不持有 seat_credential", roles: ["seat_model"] },
  model_does_not_claim_handle: { name: "模型侧适配器不声明持有句柄", roles: ["seat_model"] },
  human_claims_handle: { name: "真人侧适配器声明持有句柄", roles: ["host_command"] },
  human_inspectable_has_no_secret: { name: "真人侧可检视状态里没有句柄原文", roles: ["host_command"] },

  seed_for_release_implemented: { name: "实现了 seedForRelease()，释放检查才有东西可清", roles: BOTH },
  seed_for_release_does_not_throw: { name: "seedForRelease() 不抛", roles: BOTH },
  seeded_holds_countable: { name: "seedForRelease() 之后确实持有可数资源", roles: BOTH },
  release_succeeds: { name: "能释放", roles: BOTH },
  state_released: { name: "释放后进入 released", roles: BOTH },
  release_zeroes_counts: { name: "释放后计数字段全部归零", roles: BOTH },
  no_call_after_release: { name: "释放后不能再发命令", roles: BOTH },
  no_renegotiate_after_release: { name: "释放后不能重新协商", roles: BOTH },
});

function requiredCheckIds(role) {
  return Object.entries(CHECKS)
    .filter(([, spec]) => spec.roles.includes(role))
    .map(([id]) => id);
}

// 报告记账。每条必需检查先落成 not_run，跑到哪条改哪条——这样「没跑到」在报告里
// 是一条带 status 的记录，而不是数组里少一项。
function createLedger(role) {
  const order = requiredCheckIds(role);
  const entries = new Map(order.map((id) => [id, {
    check_id: id,
    name: CHECKS[id].name,
    status: "not_run",
    detail: "",
  }]));
  // 记过一次的 id。重复记账是缺陷，不是「后面那次覆盖前面那次」——覆盖会让同一件事
  // 的第一次结论静默消失。
  const written = new Set();
  const unknown = [];
  const duplicated = [];

  function write(id, status, detail) {
    if (!Object.prototype.hasOwnProperty.call(CHECKS, id)) {
      // 未登记的 id 立刻抛。悄悄接受的话，拼错的 id 会让本该被登记的那条永远停在
      // not_run，而报告里多出一条谁也不认识的记录——两头都被削弱。
      const error = new Error(`未登记的 check_id: ${id}`);
      error.code = "unknown_check_id";
      throw error;
    }
    if (!entries.has(id)) {
      // 登记过，但不属于这个角色。同样是缺陷：它会让 host_command 的报告里出现
      // 只该在 seat_model 出现的结论。
      unknown.push({ check_id: id, reason: `${id} 不属于角色 ${role}` });
      return;
    }
    if (written.has(id)) duplicated.push(id);
    written.add(id);
    const entry = entries.get(id);
    entry.status = status;
    entry.detail = detail;
  }

  return {
    // 查了，按条件真假落 pass / fail。返回条件本身，方便调用点接着分支。
    record(id, ok, detail = "") {
      write(id, ok ? "pass" : "fail", detail || (ok ? "" : "条件不成立"));
      return ok;
    },
    // 本套件够不到。带上原因和门禁编号，让读报告的人知道谁能回答。
    unverifiable(id, detail) {
      write(id, "unverifiable", detail);
    },
    // 显式记「没跑」。理由是必填：一条没写理由的 not_run 等于让人猜是漏了还是故意的。
    notRun(id, reason) {
      write(id, "not_run", reason);
    },
    finish() {
      const checks = order.map((id) => ({ ...entries.get(id) }));
      const missing = order.filter((id) => !written.has(id));
      const integrity = {
        expected: order.length,
        recorded: written.size,
        missing,
        duplicated,
        unknown,
        // 结构完整 = 每条必需检查恰好记了一次，且没有越界记账。
        // not_run 也算「记过一次」：它是四态之一，不是缺席。
        ok: missing.length === 0 && duplicated.length === 0 && unknown.length === 0,
      };
      const failures = checks
        .filter((entry) => entry.status === "fail")
        .map((entry) => `${entry.check_id}｜${entry.name}：${entry.detail}`);
      if (!integrity.ok) {
        // 结构问题也进 failures。只放在 report_integrity 里的话，只看 failures 的
        // 调用方会把一份缺了十条的报告读成通过。
        if (missing.length > 0) {
          failures.push(`report_integrity｜有必需检查一次都没记：${missing.join(", ")}`);
        }
        if (duplicated.length > 0) {
          failures.push(`report_integrity｜有检查记了不止一次：${duplicated.join(", ")}`);
        }
        for (const item of unknown) {
          failures.push(`report_integrity｜${item.reason}`);
        }
      }
      const unverifiableList = checks
        .filter((entry) => entry.status === "unverifiable")
        .map((entry) => ({ check_id: entry.check_id, reason: entry.detail }));
      const notRunList = checks
        .filter((entry) => entry.status === "not_run")
        .map((entry) => ({ check_id: entry.check_id, reason: entry.detail }));
      return {
        checks,
        failures,
        report_integrity: integrity,
        unverifiable: unverifiableList,
        not_run: notRunList,
        // 合规：没有 fail，且报告结构完整。
        conformance_passed: failures.length === 0,
        // 完整验证：在合规之外还要求没有够不到的、没有没跑的。
        // proactive_wake 恒为 unverifiable，所以当前两个角色都到不了这一格——
        // 这正是要的：Gate 5 没过就不该有任何字段读起来像过了。
        fully_verified: failures.length === 0
          && unverifiableList.length === 0
          && notRunList.length === 0,
      };
    },
  };
}

async function runConformance(makeAdapter, { role, observeDispatch } = {}) {
  // 角色先验。报告的形状由角色决定（模型面多四条句柄检查），所以角色不认时
  // 连一份报告都构不出来——这里抛，不返回一份半成品。
  const commands = commandsForRole(role);
  const ledger = createLedger(role);

  // 前置失败时把剩下的都显式记成 not_run。旧版是直接 return 一份两条的报告，
  // 而两条的报告和三十几条的报告在调用方看来都只是「报告」。
  function bailOut(reason) {
    for (const id of requiredCheckIds(role)) {
      ledger.notRun(id, reason);
    }
    return ledger.finish();
  }

  async function attempt(id, fn) {
    try {
      return await fn();
    } catch (error) {
      ledger.record(id, false,
        `抛出 ${error?.code ?? error?.name ?? "未知错误"}：${error?.message ?? ""}`);
      return undefined;
    }
  }

  if (typeof makeAdapter !== "function") {
    ledger.record("factory_provided", false, `收到 ${typeof makeAdapter}`);
    const rest = requiredCheckIds(role).filter((id) => id !== "factory_provided");
    for (const id of rest) ledger.notRun(id, "没有适配器工厂，后面都没得可查");
    return { role, ...ledger.finish() };
  }
  ledger.record("factory_provided", true);

  // ---- 协商 ----
  const adapter = await attempt("adapter_constructs", async () => makeAdapter());
  if (adapter === undefined) {
    for (const id of requiredCheckIds(role)) {
      if (id === "factory_provided" || id === "adapter_constructs") continue;
      ledger.notRun(id, "适配器没构造出来，后面都没得可查");
    }
    return { role, ...ledger.finish() };
  }
  ledger.record("adapter_constructs", true);

  ledger.record("role_exposed", adapter.role === role, `role=${adapter.role ?? "（无）"}`);
  ledger.record("initial_state_created",
    adapter.state === "created", `state=${adapter.state ?? "（无）"}`);
  ledger.record("capabilities_is_array", Array.isArray(adapter.capabilities),
    `capabilities=${JSON.stringify(adapter.capabilities ?? null)}`);

  const negotiation = await attempt("negotiate_succeeds", async () => adapter.negotiate());
  if (negotiation === undefined) {
    for (const id of [
      "negotiated_contract_version", "state_negotiated",
      "command_face_by_identity", "degradations_is_array", "wake_declaration_consistent",
      "proactive_wake_actually_works",
    ]) {
      ledger.notRun(id, "协商没成功，协商结果里的检查没得可查");
    }
  } else {
    ledger.record("negotiate_succeeds", true);
    ledger.record("negotiated_contract_version",
      negotiation.contract_version === CONTRACT_VERSION,
      `收到 ${negotiation.contract_version}，本地 ${CONTRACT_VERSION}`);
    ledger.record("state_negotiated",
      adapter.state === "negotiated", `state=${adapter.state}`);
    ledger.record("command_face_by_identity",
      negotiation.commands === commands,
      "命令面应当是 host-surface 里那个同一个冻结数组，不是抄的副本");
    ledger.record("degradations_is_array", Array.isArray(negotiation.degradations),
      `degradations=${JSON.stringify(negotiation.degradations ?? null)}`);

    // 关键一条：声明没有主动唤醒的适配器，必须能从协商结果里读出「我要轮询」。
    //
    // 两个方向合成一条 check_id，不拆成两条互斥的。拆开的话「恰好出现一次」就要按
    // 声明与否分别成立，而那种条件性必需项正是最容易退化成「两条都没跑」的形状。
    const declaredWake = (adapter.capabilities ?? []).includes("proactive_wake");
    const wakeDegradation = (negotiation.degradations ?? [])
      .find((entry) => entry.capability === "proactive_wake");
    if (declaredWake) {
      ledger.record("wake_declaration_consistent", wakeDegradation === undefined,
        wakeDegradation === undefined
          ? "声明了主动唤醒，降级清单里也没有它"
          : "声明了主动唤醒，却又出现在降级清单里");
      // 本套件查不了这个声明是不是真的：它只看内部一致性，而「收到权威事件后无需点击就能
      // 启动一次 follow-up」只有真实宿主答得出。所以在报告里显式记一条不可验证项——
      // 一份全绿的一致性报告绝不能被读成 Gate 5 通过。
      //
      // 记 unverifiable 而不是 fail：适配器声明它并不违规（某个宿主真有这个能力时就该声明）。
      // 判失败会逼人为了让套件绿而少声明一项，那是更坏的结果。
      ledger.unverifiable("proactive_wake_actually_works",
        "本套件只验内部一致性。无点击主动唤醒只有真实宿主实机能证实，"
        + "SAME_VISIBLE_TASK_SPIKE_V1 尚未执行，两个宿主都未验证。门禁：Gate 5");
    } else {
      ledger.record("wake_declaration_consistent",
        wakeDegradation?.degrade_to === "polling",
        `没声明主动唤醒，降级清单应点明退回轮询；degrade_to=${wakeDegradation?.degrade_to ?? "（缺）"}`);
      ledger.notRun("proactive_wake_actually_works",
        "适配器没声明这个能力，退回轮询，无需实机验证");
    }
  }

  // ---- 命令面边界 ----
  //
  // 越界命令必须被适配器自己拒绝，不能靠核心兜。靠核心兜的话，一次拒绝也要先把请求发出去，
  // 而模型面越界发出去的那条请求带着的正是它不该有的权限。
  const outOfFace = role === "seat_model" ? "hand.act" : "ai.take_intents";
  const rejected = await attempt("out_of_face_rejected", async () => {
    try {
      await adapter.call(outOfFace, {});
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error?.code ?? null };
    }
  });
  if (rejected === undefined) {
    ledger.notRun("out_of_face_error_code", "越界调用本身没跑通，错误码没得可查");
  } else {
    ledger.record("out_of_face_rejected", rejected.threw === true,
      rejected.threw ? `越界命令 ${outOfFace} 被拒` : `适配器放过了不属于本面的 ${outOfFace}`);
    if (rejected.threw) {
      ledger.record("out_of_face_error_code",
        typeof rejected.code === "string" && rejected.code !== "",
        `code=${rejected.code ?? "（无）"}`);
    } else {
      ledger.notRun("out_of_face_error_code", "越界命令没被拒，没有错误码可查");
    }
  }

  // ---- 信封形状 ----
  //
  // 读命令按角色挑：真人面里没有 view.projection（它在模型面），第一版写死这一条的后果是
  // 真人侧的信封检查整段被跳过——而「跳过」在报告里和「通过」长得一样。
  const readCommand = role === "seat_model" ? "view.projection" : "view.seat";
  const readAvailable = ledger.record("read_command_available", commands.includes(readCommand),
    commands.includes(readCommand)
      ? `${readCommand} 在 ${role} 的命令面里`
      : `${readCommand} 不在 ${role} 的命令面里，信封检查会被整段跳过`);

  const envelopeIds = [
    "read_returns_envelope", "envelope_has_ok", "envelope_has_status",
    "envelope_has_contract_version", "failure_envelope_has_code",
    "dispatch_payload_envelope_ready",
  ];
  if (!readAvailable) {
    for (const id of envelopeIds) ledger.notRun(id, "角色命令面里没有读命令，信封检查没得可查");
  } else {
    const response = await attempt("read_returns_envelope", async () => adapter.call(readCommand, {}));
    if (response === undefined) {
      for (const id of envelopeIds.filter((id) => id !== "read_returns_envelope")) {
        ledger.notRun(id, "读命令没返回信封，字段没得可查");
      }
    } else {
      ledger.record("read_returns_envelope", true, `读的是 ${readCommand}`);
      ledger.record("envelope_has_ok", typeof response.ok === "boolean",
        `ok=${JSON.stringify(response.ok ?? null)}`);
      ledger.record("envelope_has_status", Number.isInteger(response.status),
        `status=${JSON.stringify(response.status ?? null)}`);
      ledger.record("envelope_has_contract_version",
        response.contract_version === CONTRACT_VERSION,
        `contract_version=${response.contract_version ?? "（缺）"}`);
      if (response.ok === false) {
        ledger.record("failure_envelope_has_code", typeof response.code === "string",
          `code=${JSON.stringify(response.code ?? null)}`);
      } else {
        // 成功路径上没有失败信封可查。记 not_run 而不是 pass：
        // 判 pass 等于宣称「失败信封的形状验过了」，而这一跑根本没产生失败信封。
        ledger.notRun("failure_envelope_has_code",
          "这一跑的读命令成功了，没有失败信封可查");
      }

      // 请求信封：适配器把 (command, params) 交给传输，信封由传输构造，
      // 所以这一层能验的是「交下去的载荷构不构得出合规信封」。
      //
      // 需要调用方提供 observeDispatch 才查得了——适配器不该为了被测而多暴露一个出口。
      // 没提供时记 not_run 并写明原因，不是默默不查。
      if (typeof observeDispatch !== "function") {
        ledger.notRun("dispatch_payload_envelope_ready",
          "调用方没有提供 observeDispatch，看不到交给传输的载荷");
      } else {
        const seen = observeDispatch();
        const last = Array.isArray(seen) ? seen[seen.length - 1] : undefined;
        ledger.record("dispatch_payload_envelope_ready",
          envelopeReady(last, commands),
          `最后一次交给传输的载荷=${JSON.stringify(last ?? null)}`);
      }
    }
  }

  // ---- 身份边界 ----
  //
  // inspectableState 两侧都要求实现，不只模型侧。缺了它，下面那些检查看到的是一个空对象
  // ——而「什么都没看到」会被读成「什么都没发现」。这两句话差得很远。
  const hasInspectable = ledger.record("inspectable_state_implemented",
    typeof adapter.inspectableState === "function",
    typeof adapter.inspectableState === "function"
      ? ""
      : "缺这个方法的话，身份边界检查看到的是空对象，读起来像通过");
  const inspectable = hasInspectable ? adapter.inspectableState() : null;
  const serialized = JSON.stringify(inspectable ?? {});

  if (role === "seat_model") {
    // 模型面最要紧的一条：一张句柄也不许有。这里查的是对象自己，不是它发出去的参数
    // ——参数那一层由 model-command-surface 的测试覆盖，这一层查的是「它有没有存一份」。
    const forbidden = [
      ["model_holds_no_seat_handle", "seat_handle"],
      ["model_holds_no_recovery_credential", "recovery_credential"],
      ["model_holds_no_seat_credential", "seat_credential"],
    ];
    for (const [id, needle] of forbidden) {
      if (inspectable === null) {
        ledger.notRun(id, "没有 inspectableState() 可查");
        continue;
      }
      ledger.record(id, serialized.includes(needle) === false,
        serialized.includes(needle) ? `在 inspectableState() 里发现了 ${needle}` : "");
    }
    ledger.record("model_does_not_claim_handle",
      adapter.holdsSeatHandle === false, `holdsSeatHandle=${adapter.holdsSeatHandle}`);
  } else {
    ledger.record("human_claims_handle",
      adapter.holdsSeatHandle === true, `holdsSeatHandle=${adapter.holdsSeatHandle}`);
    // 真人面持有句柄，但可检视状态里只该有数目。值一旦进了报告就等于凭据落进日志。
    if (inspectable === null) {
      ledger.notRun("human_inspectable_has_no_secret", "没有 inspectableState() 可查");
    } else {
      ledger.record("human_inspectable_has_no_secret",
        /seat_handle-|credential/.test(serialized) === false, serialized);
    }
  }
  // ---- 释放 ----
  //
  // 「释放真的清了东西」这句话只能在**有东西可清**的状态下检验。第一版忘了这一点：
  // 套件跑到这里时真人面一张句柄都没有（一致性检查只发读命令，从不建房落座），于是
  // 「handle_count 归零」在 0 上成立，一个只写 this.state = "released" 的实现照样全绿。
  //
  // 所以要求适配器提供 seedForRelease()：把自己带到一个持有可数资源的状态。不实现它的
  // 后果是这条检查判失败而不是跳过——套件里「没能检验」绝不能读成「检验通过」。
  const hasSeed = ledger.record("seed_for_release_implemented",
    typeof adapter.seedForRelease === "function",
    typeof adapter.seedForRelease === "function"
      ? ""
      : "缺这个方法的话，释放检查会在一个空状态上成立，什么都证明不了");

  let seededCounts = [];
  if (!hasSeed) {
    ledger.notRun("seed_for_release_does_not_throw", "没有 seedForRelease() 可调");
    ledger.notRun("seeded_holds_countable", "没有 seedForRelease()，进不到有资源的状态");
  } else {
    const seedOk = await attempt("seed_for_release_does_not_throw",
      async () => { await adapter.seedForRelease(); return true; });
    if (seedOk === true) ledger.record("seed_for_release_does_not_throw", true);
    const seeded = hasInspectable ? adapter.inspectableState() : null;
    seededCounts = Object.entries(seeded ?? {}).filter(([key]) => key.endsWith("_count"));
    ledger.record("seeded_holds_countable",
      seededCounts.length > 0 && seededCounts.some(([, value]) => value > 0),
      `计数字段：${JSON.stringify(Object.fromEntries(seededCounts))}`);
  }

  const released = await attempt("release_succeeds", async () => { await adapter.release(); return true; });
  if (released === true) ledger.record("release_succeeds", true);
  ledger.record("state_released", adapter.state === "released", `state=${adapter.state}`);

  // 计数字段的名字随实现而变，所以聚合成一条，明细写进 detail。
  // 逐个字段各记一条的话，「必需检查恰好一次」就成了随实现浮动的数目，对不了账。
  if (!hasInspectable) {
    ledger.notRun("release_zeroes_counts", "没有 inspectableState() 可查");
  } else if (seededCounts.length === 0) {
    ledger.notRun("release_zeroes_counts",
      "释放前一个计数字段都没有，归零无从检验（seeded_holds_countable 已记下这一点）");
  } else {
    const afterState = adapter.inspectableState() ?? {};
    const leftover = seededCounts
      .map(([key]) => [key, afterState[key]])
      .filter(([, value]) => value !== 0);
    ledger.record("release_zeroes_counts", leftover.length === 0,
      leftover.length === 0
        ? `全部归零：${seededCounts.map(([key]) => key).join(", ")}`
        : `没归零：${JSON.stringify(Object.fromEntries(leftover))}`);
  }

  const afterRelease = await attempt("no_call_after_release", async () => {
    try {
      await adapter.call(commands[0], {});
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error?.code ?? null };
    }
  });
  if (afterRelease !== undefined) {
    ledger.record("no_call_after_release", afterRelease.threw === true,
      afterRelease.threw ? `code=${afterRelease.code ?? "（无）"}` : "释放之后还能发命令，说明清理只是改了个标记");
  }
  const reNegotiate = await attempt("no_renegotiate_after_release", async () => {
    try {
      adapter.negotiate();
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error?.code ?? null };
    }
  });
  if (reNegotiate !== undefined) {
    ledger.record("no_renegotiate_after_release", reNegotiate.threw === true,
      reNegotiate.threw ? `code=${reNegotiate.code ?? "（无）"}` : "released 是终态：允许回头就得回答「回来时凭据从哪来」");
  }

  return { role, ...ledger.finish() };
}

// 交给传输的载荷能不能构成合规请求信封。
//
// 查四件事：命令是非空字符串、命令在本角色的命令面里（适配器不许改写成别的命令）、
// 参数是可序列化的普通对象（带方法的实例过不了 JSON，传输那一跳会静默丢字段）、
// 以及真的拿 requestEnvelope 构一遍且三个字段都对得上。
function envelopeReady(payload, commands) {
  if (payload === undefined || payload === null) return false;
  const { command, params } = payload;
  if (typeof command !== "string" || command === "") return false;
  if (!commands.includes(command)) return false;
  if (params === null || typeof params !== "object" || Array.isArray(params)) return false;
  let roundTripped;
  try {
    roundTripped = JSON.parse(JSON.stringify(params));
  } catch {
    return false;
  }
  // 比键集合，不比序列化后的字符串。
  //
  // 比字符串是我第一版写的，而它查不出函数属性：JSON.stringify 在**两侧**都会把函数丢掉，
  // 于是 `{a:1, f(){}}` 和它的往返结果序列化出来一模一样，断言恒成立。
  // 变异 unserializable_dispatch_params 指出了这一点。
  // 真正要守的是「没有字段在序列化时静默消失」，那要看键。
  // 只比键的数目就够，不必再逐个比成员：JSON 往返只会**丢**键（函数、undefined、symbol），
  // 从不新增也不改名，所以数目相等的子集就是同一个集合。
  // 第一版在这里多写了一条逐个比成员的断言，它永远不会红——数目那条已经先拦下了。
  if (Object.keys(params).length !== Object.keys(roundTripped).length) return false;
  const envelope = requestEnvelope(command, params);
  return envelope.contract_version === CONTRACT_VERSION
    && envelope.command === command
    && JSON.stringify(envelope.params) === JSON.stringify(params);
}

// createLedger 也导出。报告结构那几条不变量（漏记、重记、越界记账）没有任何适配器能触发
// ——它们是套件自己的缺陷形状，只能对着记账器直接构造。不导出的话这几条只能靠源码断言，
// 而那正是这一轮在拆的东西。本文件整体是测试机械，不是产品面，所以为自测导出一个内部件
// 不构成产品让步。
module.exports = { runConformance, CHECKS, requiredCheckIds, createLedger };
