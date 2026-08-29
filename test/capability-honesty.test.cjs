"use strict";

// 能力协商的诚实性：合同不接受一个该剖面尚未验证过的能力声明。
//
// 缺陷本体与 policy epoch 那一处同形：「绝不声明 proactive_wake」这条规则此前只写在每个
// 适配器自己的 DECLARED_CAPABILITIES 里，而权威侧（合同）从不检查。两份参考适配器都恰好
// 做对了，于是没有任何测试要求过这件事——规则只在记得它的地方成立。
//
// 后果不是「多了一条声明」。negotiate 的返回值里，degradations 将是宿主决定要不要轮询的
// 依据：声明了 proactive_wake，polling 那一条就不在降级清单里，于是宿主不轮询，
// 而那个能力实际上并不存在。表现是牌局停在某一席上，谁都不知道是在等模型还是已经死了
// ——CAPABILITIES 那张表的注释把这个后果写得很清楚，而代码当时没有照它执行。
//
// 2026-08-29（A3）判据从全局布尔换成逐剖面清单。原来的 `verified_on_any_host` 记的是
// 「有没有任何宿主验证过」，而名字本身就是缺陷：Codex 侧真跑通一次实机 Gate 5、把它翻成
// true 之后，Claude 侧的同一项声明立刻也合法了——而 Claude 那边什么都没验证过。剖面隔离
// 的那一组断言在 test/capability-profile.test.cjs，本文件只管「未验证不许声明」这一件事。
//
// 这一条对 Claude 侧适配器尤其要紧：那一侧的能力**本来就不确定**（本环境没有 Desktop /
// Cowork，跑不了实机门禁）。不确定时唯一诚实的做法是不声明，而「不声明」不能靠适配器作者
// 自觉——它得是合同拒收。
//
// 这道检查会自己退休：某个剖面真跑通一次实机 Gate 5 之后，把它加进那一项的 verified_on，
// 该剖面的声明就合法了。所以它不是「永久禁止」，而是「你没验证过之前不许声明」。

const test = require("node:test");
const assert = require("node:assert/strict");

const contract = require("../src/contract/adapter-contract.cjs");

// 角色与它默认用的剖面。两个角色各挑一个已验证必需能力的剖面——claude_desktop 不选，
// 它连 command_dispatch 都没验证过，拿它测「未验证能力被拒」会分不清拒的是哪一项。
const ROLE_PROFILES = Object.freeze([
  Object.freeze({ role: "host_command", profile: "web_table" }),
  Object.freeze({ role: "seat_model", profile: "codex_cli" }),
]);

function attempt(capabilities, { role, profile } = ROLE_PROFILES[0]) {
  try {
    return { ok: true, value: contract.negotiate({
      role,
      profile,
      contract_version: contract.CONTRACT_VERSION,
      capabilities,
    }) };
  } catch (error) {
    return { ok: false, code: error?.code ?? null, details: error?.details ?? null };
  }
}

test("该剖面尚未验证的能力，声明即被拒", () => {
  for (const combo of ROLE_PROFILES) {
    const result = attempt(["command_dispatch", "proactive_wake"], combo);
    assert.equal(result.ok, false,
      `${combo.role}/${combo.profile} 声明 proactive_wake 竟然协商成功——任何剖面都没验证过它`);
    assert.equal(result.code, "capability_not_verified");
    assert.deepEqual(result.details.unverified, ["proactive_wake"]);
    // 理由里要带剖面名。不带的话，读的人会以为这项能力全局不可用，而实际上问的是
    // 「你这个宿主验证过没有」——另一个剖面可能已经验证过了。
    assert.equal(result.details.profile, combo.profile);
  }
});

test("拒收的理由里说出是哪一项，不只说「协商失败」", () => {
  const result = attempt(["command_dispatch", "proactive_wake"]);
  // 只说失败的话，最省事的「修法」是把整份能力清单删空——那会让所有降级路径一起消失。
  assert.equal(result.details.unverified.length, 1);
  assert.ok(Array.isArray(result.details.unverified));
});

test("该剖面验证过的能力照常接受", () => {
  // 反方向。只测「拒收未验证的」不够：一个把所有声明都拒掉的实现也能过上面两条，
  // 而那时结构化控件、私有底牌、持久会话全都声明不了，宿主只能一路降级。
  //
  // 声明清单按剖面算，不写死：web_table 验证过三项 UI 能力，codex_cli 一项都没有。
  // 写死四项在 A3 之后对模型剖面是假的。
  const declarable = Object.entries(contract.CAPABILITIES)
    .filter(([, spec]) => spec.verified_on.includes("web_table"))
    .map(([name]) => name);
  assert.ok(declarable.length >= 2, `web_table 该验证过多项能力，实际 ${declarable.join("、")}`);
  const result = attempt(declarable);
  assert.equal(result.ok, true, `已验证的能力被拒了：${result.code}`);
  // 降级清单里只剩 proactive_wake，因为它没被声明——而它**不能**被声明。
  // 这正是本文件要钉的那个组合：验证过的都可以声明，唯一未验证的那项只能靠降级。
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

test("检查按 verified_on 走，不是把 proactive_wake 写死", () => {
  // 写死名字的实现在下一个未验证能力加进来时不会红——而那时它同样会被静默接受。
  //
  // CAPABILITIES 是冻结的，插一项假能力进去测不了，所以这一条是静态断言：实现里读的是
  // 那个字段，而且没有出现写死的能力名。
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "contract", "adapter-contract.cjs"),
    "utf8",
  );
  const negotiateBody = source.slice(source.indexOf("function negotiate("));
  assert.match(negotiateBody, /verified_on/,
    "negotiate 没有读 verified_on——它大概把能力名写死了");
  assert.doesNotMatch(negotiateBody, /"proactive_wake"|'proactive_wake'/,
    "negotiate 里出现了写死的 proactive_wake：下一个未验证能力加进来时不会红");
  // 旧的全局标志不许再出现在实现里。留着它的代价是下一个人会去读它，而它给出的答案
  // 恰好是 A3 要否定的那个：「有人验证过」不等于「你验证过」。
  assert.doesNotMatch(negotiateBody, /verified_on_any_host/,
    "negotiate 还在读那个全局标志");
});

test("这道检查会自己退休：某个剖面验证过之后声明就合法", () => {
  // 不是「永久禁止」，而是「你没验证过之前不许声明」。这一条钉住那个语义：
  // 若将来某个剖面实机 Gate 5 通过、名字加进 verified_on，上面第一条就该改成按剖面分叉的
  // 断言，两件事一起做。
  assert.deepEqual(contract.CAPABILITIES.proactive_wake.verified_on, [],
    "已有剖面验证过主动唤醒，那么 test/capability-honesty.test.cjs 的第一条断言也该跟着改，"
    + "并且必须有一份实机证据支撑那次改动");
  // 退休机制本身要能证明：拿一项已验证的能力走同一条路，必须通得过。否则「会自己退休」
  // 只是一句注释——一个无条件拒收的实现同样能让上面那条断言成立。
  const verified = Object.entries(contract.CAPABILITIES)
    .find(([, spec]) => spec.verified_on.includes("web_table"));
  assert.ok(verified, "需要一项 web_table 验证过的能力来证明退休路径通");
  const result = attempt(["command_dispatch", verified[0]]);
  assert.equal(result.ok, true,
    `${verified[0]} 在 web_table 上已验证却被拒，说明拒收不是按 verified_on 走的`);
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
  assert.match(doc, /verified_on/, "文档没说判据是哪个字段");
  // 退休条件也得写在文档里：不写的话，将来实机通过之后没人知道该动哪里。
  assert.match(doc, /verified_on\b/, "文档没写这道检查怎么退休");
});
