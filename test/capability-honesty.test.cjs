"use strict";

// 能力协商的诚实性：合同不接受一个尚未在任何宿主上验证过的能力声明。
//
// 缺陷本体与 policy epoch 那一处同形：「绝不声明 proactive_wake」这条规则此前只写在每个
// 适配器自己的 DECLARED_CAPABILITIES 里，而权威侧（合同）从不检查。两份参考适配器都恰好
// 做对了，于是没有任何测试要求过这件事——规则只在记得它的地方成立。
//
// 后果不是「多了一条声明」。negotiate 的返回值里，degradations 是宿主决定要不要轮询的
// 唯一依据：声明了 proactive_wake，polling 那一条就不在降级清单里，于是宿主不轮询，
// 而那个能力实际上并不存在。表现是牌局停在某一席上，谁都不知道是在等模型还是已经死了
// ——CAPABILITIES 那张表的注释把这个后果写得很清楚，而代码没有照它执行。
//
// 这一条对 Claude 侧适配器尤其要紧：那一侧的能力**本来就不确定**（本环境没有 Desktop /
// Cowork，跑不了实机门禁）。不确定时唯一诚实的做法是不声明，而「不声明」不能靠适配器作者
// 自觉——它得是合同拒收。
//
// 这道检查会自己退休：真有一次实机 Gate 5 通过之后，把 verified_on_any_host 翻成 true，
// 声明就合法了。所以它不是「永久禁止」，而是「未验证之前不许声明」。

const test = require("node:test");
const assert = require("node:assert/strict");

const contract = require("../src/contract/adapter-contract.cjs");

const ROLES = ["host_command", "seat_model"];

function attempt(capabilities, role = "host_command") {
  try {
    return { ok: true, value: contract.negotiate({
      role,
      contract_version: contract.CONTRACT_VERSION,
      capabilities,
    }) };
  } catch (error) {
    return { ok: false, code: error?.code ?? null, details: error?.details ?? null };
  }
}

test("尚未在任何宿主上验证的能力，声明即被拒", () => {
  for (const role of ROLES) {
    const result = attempt(["command_dispatch", "proactive_wake"], role);
    assert.equal(result.ok, false,
      `${role} 声明 proactive_wake 竟然协商成功——这条能力在两个宿主上都未验证`);
    assert.equal(result.code, "capability_not_verified");
    assert.deepEqual(result.details.unverified, ["proactive_wake"]);
  }
});

test("拒收的理由里说出是哪一项，不只说「协商失败」", () => {
  const result = attempt(["command_dispatch", "proactive_wake"]);
  // 只说失败的话，最省事的「修法」是把整份能力清单删空——那会让所有降级路径一起消失。
  assert.equal(result.details.unverified.length, 1);
  assert.ok(Array.isArray(result.details.unverified));
});

test("已验证过的能力照常接受", () => {
  // 反方向。只测「拒收未验证的」不够：一个把所有声明都拒掉的实现也能过上面两条，
  // 而那时结构化控件、私有底牌、持久会话全都声明不了，宿主只能一路降级。
  const result = attempt([
    "command_dispatch", "structured_ui", "private_hand_view", "persistent_session",
  ]);
  assert.equal(result.ok, true, `已验证的能力被拒了：${result.code}`);
  // 降级清单里只剩 proactive_wake，因为它没被声明——而它**不能**被声明。
  // 这正是本文件要钉的那个组合：四项已验证的都可以声明，唯一未验证的那项只能靠降级。
  assert.deepEqual(result.value.degradations.map((entry) => entry.capability),
    ["proactive_wake"]);
});

test("不声明未验证能力时，polling 出现在降级清单里", () => {
  // 这是这道检查存在的正面理由：宿主靠 degradations 决定要不要轮询。
  const result = attempt(["command_dispatch"]);
  assert.equal(result.ok, true);
  const polling = result.value.degradations.find(
    (entry) => entry.capability === "proactive_wake");
  assert.notEqual(polling, undefined,
    "proactive_wake 没出现在降级清单里，宿主不会知道该退回轮询");
  assert.equal(polling.degrade_to, "polling");
});

test("检查按 verified_on_any_host 走，不是把 proactive_wake 写死", () => {
  // 写死名字的实现在下一个未验证能力加进来时不会红——而那时它同样会被静默接受。
  // 这一条用一个临时插进 CAPABILITIES 的假能力来测，测完还原。
  const table = contract.CAPABILITIES;
  const fake = "test_only_unverified_capability";
  assert.equal(Object.isFrozen(table), true);
  // 冻结表加不进去，所以改测「实现读的是那个字段」：把 proactive_wake 之外的一项
  // 临时当成未验证不可行（同样冻结），于是这一条改为静态断言实现里出现了那个字段名。
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "contract", "adapter-contract.cjs"),
    "utf8",
  );
  const negotiateBody = source.slice(source.indexOf("function negotiate("));
  assert.match(negotiateBody, /verified_on_any_host/,
    "negotiate 没有读 verified_on_any_host——它大概把能力名写死了");
  assert.doesNotMatch(negotiateBody, /"proactive_wake"|'proactive_wake'/,
    "negotiate 里出现了写死的 proactive_wake：下一个未验证能力加进来时不会红");
  void fake;
});

test("这道检查会自己退休：翻转标志之后声明就合法", () => {
  // 不是「永久禁止」，而是「未验证之前不许声明」。这一条钉住那个语义：
  // 若将来实机 Gate 5 通过、标志翻成 true，上面第一条就该改成正向断言，两件事一起做。
  assert.equal(contract.CAPABILITIES.proactive_wake.verified_on_any_host, false,
    "标志已翻成 true，那么 test/capability-honesty.test.cjs 的第一条断言方向也该跟着改，"
    + "并且必须有一份实机证据支撑那次翻转");
});

test("capability_not_verified 已归类，不落到 unknown", () => {
  assert.notEqual(contract.classifyError("capability_not_verified"), "unknown");
});

test("合同文档不再说「声明了主动唤醒也全绿」", () => {
  // 文档与代码对不上时，读文档的人会照文档去写适配器。那句话此前是对的（当时确实全绿），
  // 而现在它会让人以为可以声明一项未验证的能力，只要接受报告里多一条标注。
  const doc = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "docs", "HOST-ADAPTER-CONTRACT.md"), "utf8");
  // 那句话只许出现在勘误段**之后**，作为「此前写的是什么」的引文。
  //
  // 一刀切禁掉整个文件里的这个串是错的：勘误要说清楚改掉的是哪句话，就得把它引出来，
  // 而读不出改了什么的勘误等于没写。所以判据是位置，不是有无——现行指导里不许有，
  // 引文里可以有。
  const errata = doc.indexOf("2026-08-29 修正");
  assert.notEqual(errata, -1, "文档里没有这条勘误");
  const live = doc.slice(0, errata);
  assert.equal(live.includes("而实际没有，一致性报告仍然全绿"), false,
    "现行指导里还在说声明了也全绿");
  assert.match(doc, /capability_not_verified/, "文档没提这道拒收的错误码");
  assert.match(doc, /verified_on_any_host/, "文档没说判据是哪个字段");
  // 退休条件也得写在文档里：不写的话，将来实机通过之后没人知道该动哪个标志。
  assert.match(doc, /翻成\s*`?true`?/, "文档没写这道检查怎么退休");
});
