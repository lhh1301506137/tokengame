"use strict";

// 合同一致性套件。任何一侧适配器实现都要过这一套，两侧共用同一份断言。
//
// 为什么要有它：合同文件本身只是一组常量和几个纯函数，全绿也只证明「常量还在」。真正要
// 守的是「一个实现遵守了它」，而那必须对着实现跑。上一轮的教训就在这里——五处缺口都不会红，
// 因为没有一条断言走到那些路径上。
//
// 宿主中立：本文件不引用 Codex / Claude / MCP / 浏览器。
//
// 用法：
//   const { runConformance } = require("./adapter-conformance.cjs");
//   const report = await runConformance(() => new MyAdapter(...), { role: "seat_model" });
//   report.failures  // 空数组才算过
//
// 返回报告而不是直接抛：一处不合规之后剩下的检查往往还有诊断价值，和验收脚本
// 「断言不抛错」是同一条理由。

const {
  CONTRACT_VERSION,
  commandsForRole,
} = require("../src/contract/adapter-contract.cjs");

// 一致性检查项。每一项写明「它在查什么」，因为报告里只会出现这个名字。
async function runConformance(makeAdapter, { role } = {}) {
  const checks = [];
  const failures = [];
  // 不可验证项。既不是通过也不是失败：套件够不到的地方要在报告里留下痕迹，
  // 否则一份全绿的报告读起来像「全都验过了」。
  const unverifiable = [];

  function record(name, ok, detail = "") {
    checks.push({ name, ok, detail });
    if (!ok) failures.push(`${name}：${detail || "条件不成立"}`);
    return ok;
  }

  async function attempt(name, fn) {
    try {
      return await fn();
    } catch (error) {
      record(name, false, `抛出 ${error?.code ?? error?.name ?? "未知错误"}：${error?.message ?? ""}`);
      return undefined;
    }
  }

  if (typeof makeAdapter !== "function") {
    record("提供了适配器工厂", false, `收到 ${typeof makeAdapter}`);
    return { role: role ?? null, checks, failures, unverifiable, passed: false };
  }
  const commands = commandsForRole(role);

  // ---- 协商 ----
  const adapter = await attempt("能构造适配器", async () => makeAdapter());
  if (adapter === undefined) return { role, checks, failures, unverifiable, passed: false };

  record("暴露 role", adapter.role === role, `role=${adapter.role ?? "（无）"}`);
  record("初始生命周期状态是 created",
    adapter.state === "created", `state=${adapter.state ?? "（无）"}`);
  record("暴露 capabilities 数组", Array.isArray(adapter.capabilities),
    `capabilities=${JSON.stringify(adapter.capabilities ?? null)}`);

  const negotiation = await attempt("协商成功", async () => adapter.negotiate());
  if (negotiation !== undefined) {
    record("协商回的合同版本与本地一致",
      negotiation.contract_version === CONTRACT_VERSION,
      `收到 ${negotiation.contract_version}`);
    record("协商后进入 negotiated",
      adapter.state === "negotiated", `state=${adapter.state}`);
    record("协商回的命令面与角色相符",
      negotiation.commands === commands,
      "命令面应当是 host-surface 里那个同一个冻结数组，不是抄的副本");
    record("协商回了降级清单", Array.isArray(negotiation.degradations));
    // 关键一条：声明没有主动唤醒的适配器，必须能从协商结果里读出「我要轮询」。
    const declaredWake = (adapter.capabilities ?? []).includes("proactive_wake");
    const wakeDegradation = (negotiation.degradations ?? [])
      .find((entry) => entry.capability === "proactive_wake");
    if (declaredWake) {
      record("声明了主动唤醒就不该出现在降级清单里", wakeDegradation === undefined);
      // 本套件查不了这个声明是不是真的：它只看内部一致性，而「收到权威事件后无需点击就能
      // 启动一次 follow-up」只有真实宿主答得出。所以在报告里显式记一条不可验证项——
      // 一份全绿的一致性报告绝不能被读成 Gate 5 通过。
      //
      // 记成 unverifiable 而不是 failure：适配器声明它并不违规（某个宿主真有这个能力时
      // 就该声明）。判成失败会逼人为了让套件绿而少声明一项，那是更坏的结果。
      unverifiable.push({
        capability: "proactive_wake",
        reason: "本套件只验内部一致性。无点击主动唤醒只有真实宿主实机能证实，"
          + "SAME_VISIBLE_TASK_SPIKE_V1 尚未执行，两个宿主都未验证。",
        gate: "Gate 5",
      });
    } else {
      record("没声明主动唤醒时降级清单点明退回轮询",
        wakeDegradation?.degrade_to === "polling",
        `degrade_to=${wakeDegradation?.degrade_to ?? "（缺）"}`);
    }
  }

  // ---- 命令面边界 ----
  //
  // 越界命令必须被适配器自己拒绝，不能靠核心兜。靠核心兜的话，一次拒绝也要先把请求发出去，
  // 而模型面越界发出去的那条请求带着的正是它不该有的权限。
  const outOfFace = role === "seat_model" ? "hand.act" : "ai.take_intents";
  const rejected = await attempt(`越界命令 ${outOfFace} 被本地拒绝`, async () => {
    try {
      await adapter.call(outOfFace, {});
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error?.code ?? null };
    }
  });
  if (rejected !== undefined) {
    record(`越界命令 ${outOfFace} 被本地拒绝`, rejected.threw === true,
      "适配器放过了不属于本面的命令");
    if (rejected.threw) {
      record("越界拒绝用的是合同里的错误码",
        typeof rejected.code === "string" && rejected.code !== "",
        `code=${rejected.code ?? "（无）"}`);
    }
  }

  // ---- 信封形状 ----
  //
  // 读命令按角色挑：真人面里没有 view.projection（它在模型面），第一版写死这一条的后果是
  // 真人侧的信封检查整段被跳过——而「跳过」在报告里和「通过」长得一样。这正是本轮反复
  // 撞到的那一类：一段永远走不到的检查。
  const readCommand = role === "seat_model" ? "view.projection" : "view.seat";
  record("角色的命令面里有可用的读命令", commands.includes(readCommand),
    `${readCommand} 不在 ${role} 的命令面里，信封检查会被整段跳过`);
  if (commands.includes(readCommand)) {
    const response = await attempt("公开读取返回信封", async () => adapter.call(readCommand, {}));
    if (response !== undefined) {
      record("信封带 ok 字段", typeof response.ok === "boolean",
        `ok=${JSON.stringify(response.ok ?? null)}`);
      record("信封带 status 字段", Number.isInteger(response.status),
        `status=${JSON.stringify(response.status ?? null)}`);
      record("信封带合同版本", response.contract_version === CONTRACT_VERSION,
        `contract_version=${response.contract_version ?? "（缺）"}`);
      if (response.ok === false) {
        record("失败信封带错误码", typeof response.code === "string");
      }
    }
  }

  // ---- 身份边界 ----
  //
  // inspectableState 两侧都要求实现，不只模型侧。缺了它，下面那些检查看到的是一个空对象
  // ——而「什么都没看到」会被读成「什么都没发现」。这两句话差得很远。
  record("实现了 inspectableState()", typeof adapter.inspectableState === "function",
    "缺这个方法的话，身份边界检查看到的是空对象，读起来像通过");
  const inspectable = typeof adapter.inspectableState === "function"
    ? adapter.inspectableState()
    : null;
  const serialized = JSON.stringify(inspectable ?? {});

  if (role === "seat_model") {
    // 模型面最要紧的一条：一张句柄也不许有。这里查的是对象自己，不是它发出去的参数
    // ——参数那一层由 model-command-surface 的测试覆盖，这一层查的是「它有没有存一份」。
    for (const forbidden of ["seat_handle", "recovery_credential", "seat_credential"]) {
      record(`模型侧适配器不持有 ${forbidden}`,
        inspectable !== null && serialized.includes(forbidden) === false,
        inspectable === null
          ? "没有 inspectableState() 可查"
          : `在 inspectableState() 里发现了 ${forbidden}`);
    }
    record("模型侧适配器不声明持有句柄",
      adapter.holdsSeatHandle === false, `holdsSeatHandle=${adapter.holdsSeatHandle}`);
  } else {
    record("真人侧适配器声明持有句柄",
      adapter.holdsSeatHandle === true, `holdsSeatHandle=${adapter.holdsSeatHandle}`);
    // 真人面持有句柄，但可检视状态里只该有数目。值一旦进了报告就等于凭据落进日志。
    record("真人侧可检视状态里没有句柄原文",
      inspectable !== null && /seat_handle-|credential/.test(serialized) === false,
      inspectable === null ? "没有 inspectableState() 可查" : serialized);
  }

  // ---- 释放 ----
  //
  // 「释放真的清了东西」这句话只能在**有东西可清**的状态下检验。第一版忘了这一点：
  // 套件跑到这里时真人面一张句柄都没有（一致性检查只发读命令，从不建房落座），于是
  // 「handle_count 归零」在 0 上成立，一个只写 this.state = "released" 的实现照样全绿。
  //
  // 所以要求适配器提供 seedForRelease()：把自己带到一个持有可数资源的状态。不实现它的
  // 后果是这条检查判失败而不是跳过——套件里「没能检验」绝不能读成「检验通过」，本轮
  // 已经因为这个区别修过两次了。
  record("实现了 seedForRelease()，释放检查才有东西可清",
    typeof adapter.seedForRelease === "function",
    "缺这个方法的话，释放检查会在一个空状态上成立，什么都证明不了");

  let seededCounts = [];
  if (typeof adapter.seedForRelease === "function") {
    await attempt("seedForRelease() 不抛", async () => adapter.seedForRelease());
    const seeded = typeof adapter.inspectableState === "function"
      ? adapter.inspectableState()
      : null;
    seededCounts = Object.entries(seeded ?? {}).filter(([key]) => key.endsWith("_count"));
    record("seedForRelease() 之后确实持有可数资源",
      seededCounts.length > 0 && seededCounts.some(([, value]) => value > 0),
      `计数字段：${JSON.stringify(Object.fromEntries(seededCounts))}`);
  }

  await attempt("能释放", async () => adapter.release());
  record("释放后进入 released", adapter.state === "released", `state=${adapter.state}`);
  if (typeof adapter.inspectableState === "function") {
    const afterState = adapter.inspectableState() ?? {};
    // 只对账计数字段。整份 JSON 比对没用：state 自己就从 bound 变成了 released，
    // 所以「前后不同」恒为真——那是我第一版写错的地方。
    for (const [key] of seededCounts) {
      record(`释放后 ${key} 归零`, afterState[key] === 0, `${key}=${afterState[key]}`);
    }
  }
  const afterRelease = await attempt("释放后不能再发命令", async () => {
    try {
      await adapter.call(commands[0], {});
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error?.code ?? null };
    }
  });
  if (afterRelease !== undefined) {
    record("释放后不能再发命令", afterRelease.threw === true,
      "释放之后还能发命令，说明清理只是改了个标记");
  }
  const reNegotiate = await attempt("释放后不能重新协商", async () => {
    try {
      adapter.negotiate();
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error?.code ?? null };
    }
  });
  if (reNegotiate !== undefined) {
    record("释放后不能重新协商", reNegotiate.threw === true,
      "released 是终态：允许回头就得回答「回来时凭据从哪来」");
  }

  return { role, checks, failures, unverifiable, passed: failures.length === 0 };
}

module.exports = { runConformance };
