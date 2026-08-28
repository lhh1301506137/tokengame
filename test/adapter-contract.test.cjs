"use strict";

// 两份宿主适配器合同的共享底座。
//
// 这个文件守的是三件事，按重要性排：
//   1. 核心里不许出现 Claude / Codex / MCP 专有判断。目标里的原话是「核心中禁止出现
//      Claude/Codex 专有判断」，而这是一条只能靠源码断言守住的边界——一次 require 就能
//      悄悄破坏它，而破坏之后一切照常工作。
//   2. 源码里每一个错误码都必须被归类。漏一个的后果不是崩溃，是它落到 unknown 档被当成
//      缺陷弹给用户；而如果哪天有人把 unknown 的默认处置改宽，漏掉的码就会被静默重试。
//   3. 模型面不许拿到句柄，两份合同的命令面不许重叠出 host-surface.cjs 之外的东西。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contract = require("../src/contract/adapter-contract.cjs");
const hostSurface = require("../src/authority/host-surface.cjs");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

function walkSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSources(full, out);
    else if (entry.name.endsWith(".cjs")) out.push(full);
  }
  return out;
}

const SOURCES = walkSources(SRC);

// ---- 1. 宿主中立 ----

// 宿主专有名字。查可执行部分而不是全文：合同里「不引用 Codex / Claude」这句注释本身
// 就得写出这两个词。
const HOST_SPECIFIC = /\b(claude|codex|cowork|anthropic)\b/i;

function executablePart(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// 已被替代的模块。文件头自带 SUPERSEDED_BY_ 标记，并写明「本文件不改变行为，仅保留现状」
// ——包括它输出的那个桌名。用标记本身作豁免条件而不是写死文件名：新文件想拿豁免就得先
// 把自己标成已替代，而那是一句谁都看得见的话。
function isSuperseded(source) {
  return /^\/\/ SUPERSEDED_BY_/m.test(source);
}

test("核心与合同里不出现 Claude / Codex / MCP 专有判断", () => {
  // 目标里点名的边界。整个 src/ 都查，不只查合同文件：合同再中立，只要核心某处
  // if (host === "claude") 就已经破了。
  const offenders = [];
  for (const file of SOURCES) {
    const raw = fs.readFileSync(file, "utf8");
    if (isSuperseded(raw)) continue;
    if (HOST_SPECIFIC.test(executablePart(raw))) {
      offenders.push(path.relative(ROOT, file).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(offenders, [], `以下文件的可执行代码里出现了宿主专有名字：${offenders}`);
});

test("带已替代标记的模块清单是钉死的", () => {
  // 上一条的兜底。豁免按标记发放，所以把实际带标记的清单钉住——多一个文件被标成已替代
  // 就会红，而那正是该有人看一眼的时候。
  const marked = SOURCES
    .filter((file) => isSuperseded(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(ROOT, file).replace(/\\/g, "/"))
    .sort();
  assert.deepEqual(marked, [
    "src/authority/event-store.cjs",
    "src/authority/table-store.cjs",
  ]);
});

test("两个已替代模块里只有一个真的用到了豁免", () => {
  // 豁免的射程要尽量小。event-store.cjs 带标记但本来就没有宿主名字——它不需要豁免，
  // 所以哪天它开始需要，这条会红。
  const needsExemption = SOURCES
    .filter((file) => {
      const raw = fs.readFileSync(file, "utf8");
      return isSuperseded(raw) && HOST_SPECIFIC.test(executablePart(raw));
    })
    .map((file) => path.relative(ROOT, file).replace(/\\/g, "/"));
  assert.deepEqual(needsExemption, ["src/authority/table-store.cjs"]);
});

test("已替代模块里的宿主名字只是展示串，不是判断", () => {
  // 豁免的射程说清楚：table-store.cjs 里那两处一是注释，一是它输出的桌名
  // 「Codex 无限注德州扑克测试桌」。桌名是用户可见串，改它属于改行为，而该文件明确写着
  // 「不改变行为，仅保留现状……收口留待 Codex 归队后处理」，所以本轮不改，只钉住它没有
  // 变成一个分支判断。
  //
  // 双宿主下这个桌名确实不对（Claude 侧玩家会看到一张以对方宿主命名的桌子），已列入
  // REVIEW-LOG 的待裁决项。
  const source = fs.readFileSync(path.join(SRC, "authority", "table-store.cjs"), "utf8");
  const lines = executablePart(source).split("\n")
    .map((line, index) => ({ line, no: index + 1 }))
    .filter((entry) => HOST_SPECIFIC.test(entry.line));
  assert.equal(lines.length, 1, `预期只剩桌名那一处，实际 ${lines.length} 处`);
  assert.match(lines[0].line, /name:\s*"Codex/, "剩下的那一处应当是桌名字面量");
  // 关键的一条：没有任何 if / switch / 三元 以宿主名字为条件。
  for (const entry of lines) {
    assert.doesNotMatch(entry.line, /\b(if|switch|case|\?)\b/,
      `第 ${entry.no} 行把宿主名字当成了判断条件：${entry.line.trim()}`);
  }
});

test("合同文件连注释里也只把宿主名字当反例提", () => {
  // 弱一点的一条，但值得钉：合同里若开始出现 "Claude 需要……" 这类注释，下一步就是代码。
  const source = fs.readFileSync(
    path.join(SRC, "contract", "adapter-contract.cjs"), "utf8");
  const mentions = source.split("\n").filter((line) => /claude|codex/i.test(line));
  for (const line of mentions) {
    assert.match(line, /不引用|不许|禁止|两个宿主|专有/,
      `合同里提到宿主名字的这一行读不出「这是反例」：${line.trim()}`);
  }
});

test("合同不 require 任何宿主实现", () => {
  const source = fs.readFileSync(
    path.join(SRC, "contract", "adapter-contract.cjs"), "utf8");
  const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  // 只许引权威侧的词汇表。引 src/host/ 会把某个具体宿主的形状带进合同；引 http / net
  // 会把传输方式冻进来，而「打到哪」是宿主的事。
  assert.deepEqual(requires, ["../authority/host-surface.cjs"]);
});

// ---- 2. 错误码全覆盖 ----

test("源码里每一个错误码都被归类，没有落到 unknown 的", () => {
  const codes = new Set();
  const pattern = /(?:CoreError|ProbeError|ModelSurfaceError|CustodyError|ContractError)\(\s*"([a-z_]+)"/g;
  for (const file of SOURCES) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) codes.add(match[1]);
  }
  assert.ok(codes.size >= 60, `扫到的错误码只有 ${codes.size} 个，正则大概失效了`);
  const unclassified = [...codes].filter((code) => contract.classifyError(code) === "unknown").sort();
  assert.deepEqual(unclassified, [],
    `以下错误码没有归类，会被当成缺陷弹给用户：${unclassified.join(" ")}`);
});

test("归类表里没有源码不存在的码", () => {
  // 反向对账。留着不存在的码本身无害，但它说明有人删了实现却没删分类——而下一个人会
  // 以为那条路还在。
  const codes = new Set();
  const pattern = /(?:CoreError|ProbeError|ModelSurfaceError|CustodyError|ContractError)\(\s*"([a-z_]+)"/g;
  for (const file of SOURCES) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(pattern)) codes.add(match[1]);
  }
  // core_request_failed 是 HTTP 客户端的兜底默认值（body?.code ?? "core_request_failed"），
  // 不经由 new CoreError("core_request_failed") 产生，所以正则扫不到它。
  const byDefault = new Set(["core_request_failed"]);
  const stale = Object.values(contract.ERROR_CLASSES).flat()
    .filter((code) => !codes.has(code) && !byDefault.has(code)).sort();
  assert.deepEqual(stale, [], `归类表里这些码源码里已经没有了：${stale.join(" ")}`);
});

test("一个码只属于一类", () => {
  const seen = new Map();
  for (const [name, codes] of Object.entries(contract.ERROR_CLASSES)) {
    for (const code of codes) {
      assert.equal(seen.has(code), false,
        `${code} 同时在 ${seen.get(code)} 与 ${name} 里。分类要能推出唯一处置。`);
      seen.set(code, name);
    }
  }
});

test("每一类都有处置，每个处置都有类", () => {
  for (const name of Object.keys(contract.ERROR_CLASSES)) {
    assert.ok(contract.ERROR_DISPOSITIONS[name] !== undefined, `${name} 缺处置`);
  }
  for (const name of Object.keys(contract.ERROR_DISPOSITIONS)) {
    if (name === "unknown") continue;
    assert.ok(contract.ERROR_CLASSES[name] !== undefined, `${name} 有处置但不是一个类`);
  }
});

test("认不出的码按最保守的一档处置", () => {
  // 默认必须是「当成缺陷、不重试」。反过来（默认可重试）会让一个新加的真错误被静默重发，
  // 而重发一条改变状态的命令是本轮反复在防的事。
  const d = contract.dispositionFor("something_nobody_classified");
  assert.equal(d.retryable, false);
  assert.equal(d.is_defect, true);
  assert.equal(d.user_visible, true);
});

test("认不出的码归类名就是 unknown，不是某个真实类", () => {
  // 上一条查的是处置，这一条查的是名字，两条都要。
  //
  // 起因是一次变异存活：把兜底 return 从 "unknown" 改成 "invalid_request" 之后，
  // 上面那条断言照旧通过——两者的处置字段完全相同。但覆盖检查（「每个错误码都被归类」）
  // 靠 classifyError() === "unknown" 判断缺口，兜底一变，它就永远读不出缺口了：
  // 一条恒真的覆盖检查。
  assert.equal(contract.classifyError("something_nobody_classified"), "unknown");
  assert.equal(contract.classifyError(""), "unknown");
  assert.equal(contract.classifyError(undefined), "unknown");
  // 反面：真实的码不许答成 unknown。
  assert.equal(contract.classifyError("room_full"), "state");
});

test("只有传输类可重试", () => {
  // 这一条钉的是「重试」的射程。状态类与冲突类重发同一条命令要么无效要么危险——
  // 一次 hand.act 在 conflict 之后重发，可能落在下一手上。
  for (const [name, disposition] of Object.entries(contract.ERROR_DISPOSITIONS)) {
    if (name === "transport") assert.equal(disposition.retryable, true);
    else assert.equal(disposition.retryable, false, `${name} 不该可重试`);
  }
});

test("状态类不当缺陷也不弹给用户", () => {
  // 牌桌本来就会经过 no_active_hand / seat_not_connected 这些状态。把它们弹成错误
  // 会让正常对局途中冒出一串技术文案。
  const d = contract.dispositionFor("no_active_hand");
  assert.equal(d.is_defect, false);
  assert.equal(d.user_visible, false);
});

// ---- 3. 信封 ----

test("请求信封带版本号，参数原样带上", () => {
  const envelope = contract.requestEnvelope("view.projection", { room_id: "r1" });
  assert.equal(envelope.contract_version, contract.CONTRACT_VERSION);
  assert.equal(envelope.command, "view.projection");
  assert.deepEqual(envelope.params, { room_id: "r1" });
});

test("请求信封是冻结的", () => {
  // 信封被下游改写过就不再是「这次请求是什么」的记录了。冻结让改写当场抛错，
  // 而不是变成一次难查的串味。
  const envelope = contract.requestEnvelope("view.projection");
  assert.throws(() => { envelope.command = "hand.act"; }, TypeError);
});

test("请求信封拒绝空命令名", () => {
  assert.throws(() => contract.requestEnvelope(""), { code: "invalid_field" });
  assert.throws(() => contract.requestEnvelope(null), { code: "invalid_field" });
  assert.throws(() => contract.requestEnvelope(undefined), { code: "invalid_field" });
});

test("参数不是对象时收敛成空对象，不抛", () => {
  // 命令名错是接线错误，参数形状错常常来自上游投影，按有界降级处理——本轮项 7 的同一条
  // 判断：这一层不该因为上游给了个数组就让整条链路停住。
  for (const bad of [null, 42, "x", [1, 2]]) {
    assert.deepEqual(contract.requestEnvelope("view.projection", bad).params, {});
  }
});

test("成功与失败信封都带合同版本", () => {
  // 收到方无从判断对面说的是哪一版，就只能靠字段形状猜——而那正是 CONTRACT_VERSION
  // 存在要否定的东西。请求侧那一条在上面已经查过。
  assert.equal(contract.okEnvelope({}).contract_version, contract.CONTRACT_VERSION);
  assert.equal(contract.errorEnvelope("room_full").contract_version, contract.CONTRACT_VERSION);
});

test("成功信封 ok 为真，result 为 undefined 时收敛成 null", () => {
  const envelope = contract.okEnvelope(undefined);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.status, 200);
  // null 与 undefined 在 JSON 里不同形：undefined 会让字段整个消失，于是下游的
  // `"result" in body` 判断突然为假。
  assert.equal(envelope.result, null);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "result"), true);
});

test("错误信封 ok 为假，code 空时不留空串", () => {
  assert.equal(contract.errorEnvelope("").code, "unknown_error");
  assert.equal(contract.errorEnvelope(null).code, "unknown_error");
  const withDetails = contract.errorEnvelope("room_full", 409, { seats: 4 });
  assert.equal(withDetails.ok, false);
  assert.equal(withDetails.status, 409);
  assert.deepEqual(withDetails.details, { seats: 4 });
});

test("不带 details 时不添一个 undefined 字段", () => {
  const envelope = contract.errorEnvelope("room_full", 409);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "details"), false);
});

test("信封里没有重试建议或用户文案字段", () => {
  // 重试由错误分类推出，文案是宿主的事。合同里放一句文案等于替所有宿主定了 UI 语气。
  const envelope = contract.errorEnvelope("core_unreachable", 502);
  for (const field of ["retry_after", "retryable", "message", "user_message", "hint"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(envelope, field), false,
      `信封里不该有 ${field}`);
  }
});

// ---- 4. 身份 ----

test("句柄只在真人面，模型面拿不到", () => {
  // 这是两份合同分开的全部意义所在。
  assert.equal(contract.ADAPTER_ROLES.host_command.holds_seat_handle, true);
  assert.equal(contract.ADAPTER_ROLES.seat_model.holds_seat_handle, false);
  assert.deepEqual(contract.describeIdentity("seat_handle").held_by, ["host_command"]);
});

test("authority_id 是一次性的，两侧都能持有", () => {
  const layer = contract.describeIdentity("authority_id");
  assert.equal(layer.persists, "single_use");
  assert.deepEqual([...layer.held_by].sort(), ["host_command", "seat_model"]);
});

test("席位凭据不在身份模型里", () => {
  // 适配器连「有一个凭据」这件事都不需要知道。把它写进身份模型会让适配器作者觉得
  // 自己该管一份凭据。
  assert.equal(contract.describeIdentity("seat_credential"), null);
  const names = Object.keys(contract.IDENTITY_LAYERS);
  assert.deepEqual(names.sort(), ["authority_id", "player_id", "seat_handle"]);
});

// ---- 5. 生命周期 ----

test("released 是终态", () => {
  // 释放要删 web session、托管绑定与凭据。允许回头就得回答「回来时凭据从哪来」，
  // 而唯一的答案是「适配器自己留了一份」——F6 要禁的正是这个。
  assert.deepEqual(contract.LIFECYCLE_TRANSITIONS.released, []);
  for (const state of contract.LIFECYCLE_STATES) {
    if (state === "released") continue;
    assert.throws(() => contract.nextLifecycleState("released", state),
      { code: "illegal_lifecycle_transition" }, `released -> ${state} 不该允许`);
  }
});

test("每个状态都能走到 released", () => {
  // 反过来的一条：任何时候都必须能释放。少一条就意味着某个状态下资源清不掉。
  for (const state of contract.LIFECYCLE_STATES) {
    if (state === "released") continue;
    assert.equal(contract.nextLifecycleState(state, "released"), "released");
  }
});

test("没协商就不能发命令：created 到 bound 不通", () => {
  assert.throws(() => contract.nextLifecycleState("created", "bound"),
    { code: "illegal_lifecycle_transition" });
});

test("降级态可以回到 bound，不必重新协商", () => {
  // 一次传输失败不该让适配器丢掉席位绑定。反过来（强制重新协商）会在每次网络抖动后
  // 走一遍入房流程，而那条路上有隐私同意门。
  assert.equal(contract.nextLifecycleState("degraded", "bound"), "bound");
  assert.equal(contract.nextLifecycleState("degraded", "negotiated"), "negotiated");
});

test("状态名写错时报的是哪个字段", () => {
  assert.throws(() => contract.nextLifecycleState("nope", "bound"),
    (error) => error.code === "invalid_field" && error.details.field === "from");
  assert.throws(() => contract.nextLifecycleState("created", "nope"),
    (error) => error.code === "invalid_field" && error.details.field === "to");
});

// ---- 6. 能力协商 ----

test("协商成功后给出角色、命令面与降级清单", () => {
  const result = contract.negotiate({
    role: "host_command",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: ["command_dispatch", "structured_ui", "private_hand_view"],
  });
  assert.equal(result.actor, "human");
  assert.equal(result.commands, hostSurface.HUMAN_COMMANDS);
  assert.equal(result.lifecycle_state, "negotiated");
  const degraded = result.degradations.map((d) => d.capability).sort();
  assert.deepEqual(degraded, ["persistent_session", "proactive_wake"]);
});

test("缺主动唤醒时给出的降级路径是轮询，而不是静默", () => {
  // 这一条是整节存在的理由。proactive_wake 在两个宿主上都没验证过，合同要做的不是让它
  // 变成真的，而是让「没有它」表现为一个必须据此降级的事实——静默不动作会让牌局停住而
  // 读不出原因：谁都不知道是在等模型还是已经死了。
  const result = contract.negotiate({
    role: "seat_model",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: ["command_dispatch"],
  });
  const wake = result.degradations.find((d) => d.capability === "proactive_wake");
  assert.ok(wake !== undefined, "缺主动唤醒必须出现在降级清单里");
  assert.equal(wake.degrade_to, "polling");
  assert.match(wake.note, /轮询/);
});

test("主动唤醒在合同里明确记为两个宿主都未验证", () => {
  // 不许有人把它写成已验证。目标里的原话：真实 Gate 5 必须标记 unverified。
  assert.equal(contract.CAPABILITIES.proactive_wake.verified_on_any_host, false);
  assert.equal(contract.CAPABILITIES.proactive_wake.required, false);
});

test("每个非必需能力都有降级路径，必需能力没有", () => {
  // 没有降级路径的能力不该出现在表里：那种能力缺失时只会表现为卡住，而卡住读不出原因。
  for (const [name, spec] of Object.entries(contract.CAPABILITIES)) {
    if (spec.required) {
      assert.equal(spec.degrade_to, null, `${name} 是必需的，不该有降级路径`);
    } else {
      assert.equal(typeof spec.degrade_to, "string", `${name} 缺降级路径`);
      assert.ok(spec.degrade_to.length > 0);
    }
  }
});

test("私有底牌能力缺失时退成只显示公开信息，绝不退成给所有人看", () => {
  const note = contract.CAPABILITIES.private_hand_view.note;
  assert.equal(contract.CAPABILITIES.private_hand_view.degrade_to, "public_only");
  assert.match(note, /绝不许退成/);
});

test("结构化控件缺失时 hand.act 显式不可用，不改成让模型代下", () => {
  // 章程要求真人的筹码动作由结构化控件提交。缺控件时的正确降级是「这条命令不可用」，
  // 而不是找一条别的路把注下出去。
  assert.match(contract.CAPABILITIES.structured_ui.note, /hand\.act 必须显式不可用/);
});

test("缺必需能力直接不成立", () => {
  assert.throws(() => contract.negotiate({
    role: "host_command",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: [],
  }), (error) => error.code === "required_capability_missing"
    && error.details.missing.includes("command_dispatch"));
});

test("版本不同直接不成立，不做向后兼容推断", () => {
  assert.throws(() => contract.negotiate({
    role: "host_command",
    contract_version: contract.CONTRACT_VERSION - 1,
    capabilities: ["command_dispatch"],
  }), (error) => error.code === "contract_version_mismatch"
    && error.details.expected === contract.CONTRACT_VERSION);
  // 缺版本号也不放过。默认成当前版本会让一个忘了填的适配器看起来协商成功了。
  assert.throws(() => contract.negotiate({
    role: "host_command",
    capabilities: ["command_dispatch"],
  }), { code: "contract_version_mismatch" });
});

test("认不出的能力名报错而不是忽略", () => {
  // 忽略会让一处拼写错误表现为「这个能力没有」，而适配器那边以为自己声明过了。
  // 两边都不会有人发现。
  assert.throws(() => contract.negotiate({
    role: "seat_model",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: ["command_dispatch", "proactive_wakeup"],
  }), (error) => error.code === "unknown_capability"
    && error.details.unknown.includes("proactive_wakeup"));
});

test("角色名不认时报错，并带上原值", () => {
  assert.throws(() => contract.negotiate({
    role: "admin",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: ["command_dispatch"],
  }), (error) => error.code === "unknown_adapter_role" && error.details.role === "admin");
  assert.throws(() => contract.commandsForRole(undefined),
    (error) => error.code === "unknown_adapter_role" && error.details.role === null);
});

test("协商结果不含总体可用性评分", () => {
  // 一个分数会诱使调用方用阈值判断，而每一项的降级路径都不一样，平均不出任何
  // 有意义的东西。
  const result = contract.negotiate({
    role: "seat_model",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: ["command_dispatch"],
  });
  for (const field of ["score", "level", "grade", "usable", "ready"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(result, field), false,
      `协商结果里不该有 ${field}`);
  }
});

test("协商不替调用方改生命周期状态", () => {
  // 只回下一个状态名。在这里替它改会让「谁持有状态」变得含糊，而适配器实例才是持有者。
  const result = contract.negotiate({
    role: "seat_model",
    contract_version: contract.CONTRACT_VERSION,
    capabilities: ["command_dispatch"],
  });
  assert.equal(result.lifecycle_state, "negotiated");
  assert.equal(Object.isFrozen(result), true);
});

// ---- 7. 两份合同的命令面 ----

test("命令面直接引 host-surface，不抄一份", () => {
  // 抄一份的后果是两处会漂移，而漂移的方向一定是模型面变宽——「新命令默认落到真人面」
  // 这条规则只写在 host-surface 那一边。用 === 而不是 deepEqual：同一个冻结数组。
  assert.equal(contract.commandsForRole("host_command"), hostSurface.HUMAN_COMMANDS);
  assert.equal(contract.commandsForRole("seat_model"), hostSurface.MODEL_COMMANDS);
});

test("两份命令面不重叠", () => {
  const human = new Set(hostSurface.HUMAN_COMMANDS);
  const overlap = hostSurface.MODEL_COMMANDS.filter((command) => human.has(command));
  assert.deepEqual(overlap, []);
});

test("两份合起来正好是宿主面", () => {
  const union = [...hostSurface.HUMAN_COMMANDS, ...hostSurface.MODEL_COMMANDS].sort();
  assert.deepEqual(union, [...hostSurface.HOST_COMMANDS].sort());
});

test("会改变已确认用户结果的命令一律不在模型面", () => {
  // 逐条点名而不是「检查模型面长度」：长度断言在有人加一条又删一条时照旧为真。
  for (const command of [
    "hand.act", "hand.reveal", "seat.ready", "room.confirm_public_scope",
    "chat.say", "seat.leave", "view.hand",
  ]) {
    assert.equal(contract.classifyActor(command), "human", `${command} 必须归真人`);
    assert.equal(hostSurface.MODEL_COMMANDS.includes(command), false);
  }
});

test("模型面就是那五条 AI 回路加公开读取", () => {
  assert.deepEqual([...hostSurface.MODEL_COMMANDS].sort(), [
    "ai.resolve", "ai.start", "ai.take_intents", "view.projection", "view.timeline",
  ]);
});
