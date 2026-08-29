"use strict";

// policy epoch：什么算实质性改变，以及它由权威侧强制而不是只在界面上成立。
//
// 这个文件的头两组测试对着纯函数跑，第三组对着 seat-ai-store 跑——后者才是关键：
// 「同意门在权威侧生效」这句话只能用「绕过界面直接调权威，旧同意会被拒」来证明。

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  POLICY_SCOPE_FIELDS,
  POLICY_EXCLUDED_FIELDS,
  epochChangeReason,
  policyEpoch,
} = require("../src/authority/policy-epoch.cjs");
const { LIVELY_V1, SeatAiStore } = require("../src/authority/seat-ai-store.cjs");

const BINDING = "room-binding-1";
const RULES = "table-rules-v1";

function epochOf(overrides = {}) {
  return policyEpoch({
    roomBindingId: BINDING,
    tableRulesVersion: RULES,
    limits: { ...LIVELY_V1, ...overrides },
  });
}

// ---- 哪些变化算实质 ----

test("同一套输入得到同一个 epoch", () => {
  assert.equal(epochOf(), epochOf());
});

test("六个公开范围字段任一变化，epoch 就变", () => {
  // 逐个改。少了这一条，一个只看第一个字段的实现也能过「有变化就变」那种笼统断言。
  const baseline = epochOf();
  for (const field of POLICY_SCOPE_FIELDS) {
    const bumped = epochOf({ [field]: LIVELY_V1[field] + 1 });
    assert.notEqual(bumped, baseline, `${field} 变了，epoch 没变`);
  }
});

test("放宽额度算实质变化，收紧也算", () => {
  // 两个方向都算。只把放宽算实质的话，「收紧之后又改回来」这条路径上会有一段时间
  // 旧同意对着一套更宽的限制成立。
  assert.notEqual(epochOf({ playerMaxPerHand: 20 }), epochOf());
  assert.notEqual(epochOf({ playerMaxPerHand: 2 }), epochOf());
});

test("短窗时长算实质变化：它与条数合起来才是速率", () => {
  // 窗口从 5 秒缩到 1 秒、条数不变，等于速率放宽五倍。
  // 只看条数的实现会把这次变化判成非实质。
  assert.notEqual(epochOf({ playerRollingWindowMs: 1_000 }), epochOf());
});

test("版本串变化本身不算实质", () => {
  // 这是这一轮明确要避免的形状：把任意配置版本变化都算成实质，每次都要重新点同意，
  // 于是同意门被当成噪音。
  assert.equal(epochOf({ version: "LIVELY_V1-hotfix" }), epochOf());
  assert.ok(Object.prototype.hasOwnProperty.call(POLICY_EXCLUDED_FIELDS, "version"));
});

test("纯本地显示时长不算实质", () => {
  // 气泡停多久只影响自己的屏幕，不改变公开了什么。
  assert.equal(epochOf({ bubbleDisplayMs: 60_000 }), epochOf());
  assert.ok(Object.prototype.hasOwnProperty.call(POLICY_EXCLUDED_FIELDS, "bubbleDisplayMs"));
});

test("排除清单里的每一项都写了理由，且确实不在实质字段里", () => {
  // 没有理由的排除等于一个沉默的决定。
  for (const [field, reason] of Object.entries(POLICY_EXCLUDED_FIELDS)) {
    assert.equal(typeof reason, "string");
    assert.ok(reason.length > 10, `${field} 的排除理由太短`);
    assert.equal(POLICY_SCOPE_FIELDS.includes(field), false,
      `${field} 同时出现在实质字段与排除清单里`);
  }
});

test("绑房与桌规版本也在 epoch 里", () => {
  const baseline = epochOf();
  assert.notEqual(
    policyEpoch({ roomBindingId: "另一间", tableRulesVersion: RULES, limits: LIVELY_V1 }),
    baseline);
  assert.notEqual(
    policyEpoch({ roomBindingId: BINDING, tableRulesVersion: "v2", limits: LIVELY_V1 }),
    baseline);
});

test("缺字段与字段为空不是同一个 epoch", () => {
  // 跳过缺失字段会让「没这一维」和「这一维被清空」撞成同一个串。
  const withField = policyEpoch({
    roomBindingId: BINDING, tableRulesVersion: RULES,
    limits: { maxGraphemesPerMessage: 140 },
  });
  const withoutField = policyEpoch({
    roomBindingId: BINDING, tableRulesVersion: RULES, limits: {},
  });
  assert.notEqual(withField, withoutField);

  // 缺字段与「字段在、值是空串」也必须分开。这一对才是占位符真正挡住的那次相撞：
  // 用空串当占位符时两者都渲染成 `字段=`，于是一份被清空的额度与一份根本没有那一维的
  // 额度得到同一个 epoch，旧同意跨过一次清空继续有效。
  const emptyValue = policyEpoch({
    roomBindingId: BINDING, tableRulesVersion: RULES,
    limits: { maxGraphemesPerMessage: "" },
  });
  assert.notEqual(emptyValue, withoutField,
    "缺字段与空值撞成同一个 epoch——检查缺字段的占位符是不是空串");

  // 绑房与桌规两段同理。
  assert.notEqual(
    policyEpoch({ roomBindingId: "", tableRulesVersion: RULES, limits: {} }),
    policyEpoch({ roomBindingId: null, tableRulesVersion: RULES, limits: {} }),
  );
  assert.notEqual(
    policyEpoch({ roomBindingId: BINDING, tableRulesVersion: "", limits: {} }),
    policyEpoch({ roomBindingId: BINDING, tableRulesVersion: null, limits: {} }),
  );
});

// ---- 变化理由 ----

test("epoch 相同时没有理由", () => {
  assert.equal(epochChangeReason(epochOf(), epochOf()), null);
});

test("三维各自给出可区分的理由", () => {
  // 重新确认的界面要说清为什么又要点一次；「变了」这一个词对用户没有用。
  const base = epochOf();
  assert.equal(
    epochChangeReason(base, policyEpoch({
      roomBindingId: "另一间", tableRulesVersion: RULES, limits: LIVELY_V1,
    })),
    "new_room_binding");
  assert.equal(
    epochChangeReason(base, policyEpoch({
      roomBindingId: BINDING, tableRulesVersion: "v2", limits: LIVELY_V1,
    })),
    "table_rules_changed");
  assert.equal(
    epochChangeReason(base, epochOf({ playerMaxPerHand: 20 })),
    "public_limits_changed");
});

// ---- 权威侧强制（关键的一组）----

function storeWithSeat(limits) {
  let clock = 1_000;
  const store = new SeatAiStore({
    now: () => clock,
    ...(limits === undefined ? {} : { limits }),
  });
  store.registerSeat({ seatId: "seat-1", playerId: "alice" });
  return store;
}

test("权威侧：发言限制实质放宽之后，旧同意被拒", () => {
  // 这一条在改动之前是红的：权威只比 room_binding_id 与 table_rules_version，
  // limits_version 写进了确认记录却从不检查，于是这一维只在 table-view-model 里生效。
  // 「同意门只在界面上成立」等于没有同意门——绕过界面直接打命令就能拿旧同意继续发言。
  const store = storeWithSeat();
  store.confirmDefaultPublicScope({
    seatId: "seat-1",
    roomBindingId: BINDING,
    tableRulesVersion: RULES,
    acknowledged: true,
  });
  // 同一套限制下旧同意仍然有效。
  store.requireConfirmedScope("seat-1", BINDING, RULES);

  // 换一套实质放宽的限制，同一席、同一绑房、同一桌规。
  const relaxed = { ...LIVELY_V1, aiMaxPublicPerHand: 99 };
  const store2 = storeWithSeat(relaxed);
  store2.registerSeat; // 保持形状一致，下面用它自己的席位
  store2.seats.get("seat-1").public_scope_confirmation = {
    seat_id: "seat-1",
    room_binding_id: BINDING,
    table_rules_version: RULES,
    limits_version: LIVELY_V1.version,
    policy_epoch: epochOf(),
    confirmed_at: 1_000,
  };
  assert.throws(
    () => store2.requireConfirmedScope("seat-1", BINDING, RULES),
    { code: "default_public_scope_not_confirmed" },
    "发言限制实质放宽之后，权威仍然接受旧同意");
});

test("权威侧：非实质变化不要求重新确认", () => {
  // 反方向，同样重要。把任意配置变化都算实质，会让用户每次开局都被要求重新点同意，
  // 于是同意门变成噪音——那是同意机制最实际的失效方式。
  const cosmetic = { ...LIVELY_V1, bubbleDisplayMs: 60_000, version: "LIVELY_V1-hotfix" };
  const store = storeWithSeat(cosmetic);
  store.seats.get("seat-1").public_scope_confirmation = {
    seat_id: "seat-1",
    room_binding_id: BINDING,
    table_rules_version: RULES,
    limits_version: LIVELY_V1.version,
    policy_epoch: epochOf(),
    confirmed_at: 1_000,
  };
  const confirmation = store.requireConfirmedScope("seat-1", BINDING, RULES);
  assert.equal(confirmation.room_binding_id, BINDING);
});

test("权威侧：确认记录里带上 epoch", () => {
  // 不记下来的话，「上次同意的是哪一套」就只能靠三个分散字段重新推导，
  // 而漏推一维的表现正是这次要修的东西。
  const store = storeWithSeat();
  const event = store.confirmDefaultPublicScope({
    seatId: "seat-1",
    roomBindingId: BINDING,
    tableRulesVersion: RULES,
    acknowledged: true,
  });
  assert.equal(event.payload.policy_epoch, epochOf());
  assert.equal(store.seats.get("seat-1").public_scope_confirmation.policy_epoch, epochOf());
});

test("权威侧：拒绝时说出两个 epoch，不只说「没确认」", () => {
  // 跨 epoch 调试要靠猜的话，最省事的「修法」是让调用方重新点一次同意——
  // 而那掩盖了「限制被谁改了」这个真问题。
  const relaxed = { ...LIVELY_V1, playerMaxPerHand: 99 };
  const store = storeWithSeat(relaxed);
  store.seats.get("seat-1").public_scope_confirmation = {
    seat_id: "seat-1",
    room_binding_id: BINDING,
    table_rules_version: RULES,
    limits_version: LIVELY_V1.version,
    policy_epoch: epochOf(),
    confirmed_at: 1_000,
  };
  try {
    store.requireConfirmedScope("seat-1", BINDING, RULES);
    assert.fail("应当抛出");
  } catch (error) {
    assert.equal(error.code, "default_public_scope_not_confirmed");
    assert.equal(error.details.confirmed_policy_epoch, epochOf());
    assert.equal(error.details.current_policy_epoch,
      policyEpoch({ roomBindingId: BINDING, tableRulesVersion: RULES, limits: relaxed }));
    assert.equal(error.details.reason, "public_limits_changed");
  }
});
