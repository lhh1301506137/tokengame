"use strict";
// A3：能力协商按「角色 + 具体宿主剖面」验证，不按全局布尔。
//
// 这里修三处，第三处最要紧。
//
// 1. `verified_on_any_host` 是一个全局布尔，名字本身就是那个缺陷。它记录的是「有没有任何
//    宿主验证过」，而合同要回答的问题是「**这个**宿主验证过没有」。Codex 侧真跑通一次实机
//    Gate 5 之后把它翻成 true，Claude 侧的同一项声明立刻也变成合法的——而 Claude 那边什么
//    都没验证过。一次实机证据于是授权了另一个宿主。
//
// 2. 协商完全不知道说话的是哪个宿主。同一个 role 从任何进程发起都得到同样的答复，于是
//    「哪个宿主能做什么」这件事在合同层不可表达，只能靠适配器自己老实。
//
// 3. `seat_model` 能声明 `structured_ui` / `private_hand_view` / `persistent_session`。
//    这三项描述的是真人面的 UI 表面，模型剖面根本没有那个表面——`view.hand` 不在它的命令
//    面里，它连底牌出口都没有，声明「我能只给本人看底牌」不可能为真。
//
//    危害要按实情说，不夸大：今天 `degradations` 和 `granted` 只有测试在读，产品代码里
//    还没有消费者（B7 的轮询兜底未建）。所以现在的后果是「合同接受了一句永远不可能为真的
//    声明，并把它记进 granted」。等 B7 把 degradations 接成轮询与 UI 提示的依据之后，同一句
//    假声明就会变成「该退的降级没退」。趁没有消费者的时候关掉，比等它长出消费者再关便宜。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contract = require("../src/contract/adapter-contract.cjs");
const { CONTRACT_VERSION, negotiate, CAPABILITIES, HOST_PROFILES, ADAPTER_ROLES } = contract;

const attempt = (fn) => {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
};

test("剖面登记表", async (t) => {
  await t.test("每个剖面写明它是哪个宿主的哪一侧", () => {
    assert.ok(HOST_PROFILES, "合同必须有剖面登记表");
    const names = Object.keys(HOST_PROFILES);
    assert.ok(names.length >= 2, `至少要有两个剖面，实际 ${names.join("、")}`);
    for (const [name, spec] of Object.entries(HOST_PROFILES)) {
      assert.ok(typeof spec.note === "string" && spec.note.length > 0, `${name} 缺 note`);
      assert.ok(
        Object.keys(ADAPTER_ROLES).includes(spec.role),
        `${name} 的 role「${spec.role}」不是已知角色`,
      );
    }
  });

  await t.test("能力的验证记录按剖面分开，不是一个全局布尔", () => {
    for (const [name, spec] of Object.entries(CAPABILITIES)) {
      assert.ok(
        Array.isArray(spec.verified_on),
        `${name} 应当有 verified_on 数组（哪些剖面验证过），而不是一个全局标志`,
      );
      for (const profile of spec.verified_on) {
        assert.ok(
          HOST_PROFILES[profile] !== undefined,
          `${name}.verified_on 里的「${profile}」不是已登记的剖面`,
        );
      }
    }
  });

  await t.test("主动唤醒在任何剖面上都还没验证过", () => {
    // 这一条是当下的事实陈述，会随实机证据改变。改它必须有实机产物支撑，
    // 见 docs/ACCEPTANCE-EVIDENCE.md 的 Blocked evidence 段。
    assert.deepEqual(
      CAPABILITIES.proactive_wake.verified_on,
      [],
      "proactive_wake 至今没有任何剖面验证过；要改这条先拿实机证据",
    );
  });
});

test("一个宿主的实机证据不授权另一个宿主", async (t) => {
  // 这组是 A3 的核心。构造法：拿一项在某个剖面上已验证的能力，从另一个剖面去声明它。
  const codexish = Object.entries(HOST_PROFILES).find(([, s]) => s.role === "seat_model");
  const humanish = Object.entries(HOST_PROFILES).find(([, s]) => s.role === "host_command");
  assert.ok(codexish && humanish, "两个角色各要至少一个剖面");

  // 挑一对「同角色、一个验证过一个没验证过」的剖面 + 能力。同角色是必须的：跨角色去声明
  // 会先撞上 capability_not_for_role，测到的就不是剖面隔离而是角色隔离了。
  const splitPair = () => {
    for (const [capName, capSpec] of Object.entries(CAPABILITIES)) {
      for (const verified of capSpec.verified_on) {
        const role = HOST_PROFILES[verified].role;
        const unverified = Object.keys(HOST_PROFILES).find(
          (p) => HOST_PROFILES[p].role === role && !capSpec.verified_on.includes(p),
        );
        if (unverified) return { capName, capSpec, verified, unverified, role };
      }
    }
    return null;
  };

  await t.test("在未验证该能力的剖面上声明会被拒", () => {
    // 没有这样的一对时不静默跳过，说明为什么——否则它会变成一条永远为真的断言。
    const pair = splitPair();
    assert.ok(pair, "需要一对同角色、验证状态不同的剖面才能测出剖面隔离");
    const { capName, unverified: unverifiedProfile } = pair;
    const spec = HOST_PROFILES[unverifiedProfile];
    const result = attempt(() => negotiate({
      role: spec.role,
      profile: unverifiedProfile,
      contract_version: CONTRACT_VERSION,
      // 去重：挑中的那一项可能本身就是 command_dispatch（claude_desktop 连必需能力都没
      // 验证过，那正是最干净的例子），重复声明会让 details.unverified 里出现两条同名。
      capabilities: [...new Set(["command_dispatch", capName])],
    }));
    assert.equal(result.ok, false, `${unverifiedProfile} 没验证过 ${capName}，声明必须被拒`);
    assert.equal(result.error.code, "capability_not_verified");
    assert.deepEqual(result.error.details.unverified, [capName]);
    // 报错要点名是哪个剖面，否则读的人会以为这项能力全局不可用。
    assert.equal(result.error.details.profile, unverifiedProfile);
  });

  await t.test("在验证过该能力的剖面上同一项声明成立", () => {
    // 反面。少了这条，上面那条可以靠「拒收一切声明」通过，而那不是剖面隔离，是全面禁止。
    // 同一对剖面、同一项能力，只换说话的那一侧。
    const pair = splitPair();
    const { capName, verified: verifiedProfile } = pair;
    const spec = HOST_PROFILES[verifiedProfile];
    const caps = [...new Set(["command_dispatch", capName])].filter(
      (n) => CAPABILITIES[n].verified_on.includes(verifiedProfile),
    );
    const result = attempt(() => negotiate({
      role: spec.role,
      profile: verifiedProfile,
      contract_version: CONTRACT_VERSION,
      capabilities: caps,
    }));
    assert.equal(result.ok, true, `${verifiedProfile} 验证过 ${capName}，声明应当成立：${result.error?.message}`);
    assert.ok(result.value.granted.includes(capName));
    assert.equal(result.value.profile, verifiedProfile, "协商结果要带回是哪个剖面");
  });

  await t.test("认不出的剖面名报错，不当成「哪里都没验证过」", () => {
    // 静默降级成「未验证」会让一处拼写错误和一个诚实的未验证宿主长得一模一样。
    const result = attempt(() => negotiate({
      role: "seat_model",
      profile: "codex_clii",
      contract_version: CONTRACT_VERSION,
      capabilities: ["command_dispatch"],
    }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "unknown_host_profile");
    assert.equal(result.error.details.profile, "codex_clii");
  });

  await t.test("剖面与角色不匹配时报错", () => {
    // 拿真人面的剖面去协商模型角色，等于声称「我这一侧既是那个宿主的真人面又是模型面」。
    const [profileName, spec] = humanish;
    const other = Object.keys(ADAPTER_ROLES).find((r) => r !== spec.role);
    const result = attempt(() => negotiate({
      role: other,
      profile: profileName,
      contract_version: CONTRACT_VERSION,
      capabilities: ["command_dispatch"],
    }));
    assert.equal(result.ok, false, `剖面 ${profileName} 是 ${spec.role} 的，不该能协商 ${other}`);
    assert.equal(result.error.code, "profile_role_mismatch");
    assert.deepEqual(
      { profile: result.error.details.profile, role: result.error.details.role },
      { profile: profileName, role: other },
    );
  });

  await t.test("不给剖面就协商不了", () => {
    // 允许省略等于允许「不说自己是谁」，而那正好是改这一节要消灭的状态。
    const result = attempt(() => negotiate({
      role: "seat_model",
      contract_version: CONTRACT_VERSION,
      capabilities: ["command_dispatch"],
    }));
    assert.equal(result.ok, false, "缺 profile 必须报错，不能按「随便哪个宿主」处理");
    assert.equal(result.error.code, "unknown_host_profile");
  });
});

test("模型剖面不得声明真人面的 UI 能力", async (t) => {
  const modelProfile = Object.entries(HOST_PROFILES).find(([, s]) => s.role === "seat_model")[0];

  for (const capName of ["structured_ui", "private_hand_view", "persistent_session"]) {
    await t.test(`seat_model 声明 ${capName} 被拒`, () => {
      const result = attempt(() => negotiate({
        role: "seat_model",
        profile: modelProfile,
        contract_version: CONTRACT_VERSION,
        capabilities: ["command_dispatch", capName],
      }));
      assert.equal(result.ok, false, `${capName} 描述的是真人面的表面，模型剖面没有那个表面`);
      assert.equal(result.error.code, "capability_not_for_role");
      assert.deepEqual(result.error.details.rejected, [capName]);
      assert.equal(result.error.details.role, "seat_model");
    });
  }

  await t.test("host_command 声明同样三项不受影响", () => {
    // 不对称是有理由的，所以要把不对称本身钉住：这三项对真人面是真的。
    const humanProfile = Object.entries(HOST_PROFILES).find(([, s]) => s.role === "host_command")[0];
    const caps = ["command_dispatch", "structured_ui", "private_hand_view", "persistent_session"]
      .filter((n) => CAPABILITIES[n].verified_on.includes(humanProfile));
    assert.ok(caps.length > 1, `${humanProfile} 该验证过至少一项 UI 能力，否则这条测不出不对称`);
    const result = attempt(() => negotiate({
      role: "host_command",
      profile: humanProfile,
      contract_version: CONTRACT_VERSION,
      capabilities: caps,
    }));
    assert.equal(result.ok, true, `真人面声明 UI 能力应当成立：${result.error?.message}`);
  });

  await t.test("角色允许的能力集写在合同里，不靠 negotiate 里的字面量", () => {
    // 写死名字的实现在下一项 UI 能力加进来时不会红，而它同样会被模型剖面静默接受——
    // 与 capability-honesty 那次「写死 proactive_wake」是同一类。
    const spec = ADAPTER_ROLES.seat_model;
    assert.ok(
      Array.isArray(spec.allowed_capabilities),
      "seat_model 应当写明它允许哪些能力",
    );
    for (const banned of ["structured_ui", "private_hand_view", "persistent_session"]) {
      assert.ok(!spec.allowed_capabilities.includes(banned), `seat_model 不该允许 ${banned}`);
    }
    assert.ok(spec.allowed_capabilities.includes("command_dispatch"), "必需能力要允许");

    const source = fs.readFileSync(
      path.join(__dirname, "..", "src", "contract", "adapter-contract.cjs"),
      "utf8",
    );
    const body = source.slice(source.indexOf("function negotiate("));
    const fnEnd = body.indexOf("\n}\n");
    const negotiateBody = body.slice(0, fnEnd === -1 ? body.length : fnEnd);
    assert.match(negotiateBody, /allowed_capabilities/, "negotiate 应当读角色的允许集");
    for (const banned of ["structured_ui", "private_hand_view", "persistent_session"]) {
      assert.doesNotMatch(
        negotiateBody,
        new RegExp(`["']${banned}["']`),
        `negotiate 里把 ${banned} 的名字写死了`,
      );
    }
  });
});

test("旧的全局标志不再有人读", () => {
  // verified_on_any_host 必须真的消失，不能留成一个派生的兼容读法。留着的代价是下一个人
  // 会去读它——而它给出的答案恰好是这次要否定的那个：「有人验证过」不等于「你验证过」。
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "contract", "adapter-contract.cjs"),
    "utf8",
  );
  assert.doesNotMatch(
    source.replace(/^\s*\/\/.*$/gm, ""),
    /verified_on_any_host/,
    "合同的可执行部分仍在用 verified_on_any_host",
  );
  for (const spec of Object.values(CAPABILITIES)) {
    assert.equal(spec.verified_on_any_host, undefined, "能力表仍带着旧的全局标志");
  }
});

test("错误码都已归类", () => {
  // 三个新码不能落到 unknown——test/adapter-contract.test.cjs 有一条通扫，这里点名再钉一次，
  // 因为那条通扫的失败信息说不出是哪个码。
  for (const code of ["unknown_host_profile", "profile_role_mismatch", "capability_not_for_role"]) {
    const category = contract.classifyError(code);
    assert.notEqual(category, "unknown", `${code} 没归类`);
  }
});
