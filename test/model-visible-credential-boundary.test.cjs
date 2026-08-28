"use strict";
// 模型可见出口的凭据边界（P1）。
//
// 全部使用合成秘密。这些字符串只在本文件与测试进程里存在，不是任何真实凭据。
//
// 要钉的是四条出口，而不是「某一个字段有没有被摘掉」：
//   1. 成功 result —— dispatch 回来的东西直通模型。
//   2. 核心错误的 details —— 核心报错时带的诊断字段直通模型。
//   3. 本地拒绝的 details —— 托管层与命令面自己抛的错。
//   4. 公开对象图 —— adapter.surface.custody 这条属性链本身。
//
// 第 4 条与前三条是不同性质的问题。前三条是「文本里漏了值」，第 4 条是「对象上挂着能力」：
// 就算所有文本出口都净化干净，只要 adapter.surface.custody.resolve(handle) 还能调，
// 拿到适配器引用的人就能直接取出凭据原文，一次净化都不用绕。

const test = require("node:test");
const assert = require("node:assert/strict");

const { SeatModelAdapter } = require("../src/host/seat-model-adapter.cjs");
const { SeatCustody, CredentialLeak } = require("../src/host/seat-custody.cjs");

// 合成秘密。刻意做成一眼能认出是假的，同时够长、够独特，扫描不会误命中别的东西。
const FAKE_CREDENTIAL = "SYNTHETIC-CRED-do-not-use-3f9c1a7e5b2d4086";
const FAKE_CREDENTIAL_2 = "SYNTHETIC-CRED-second-seat-8e1b6d0c9a4f7532";
const FAKE_INVITE = "SYNTHETIC-INVITE-4b7e2c9d1a6f8035";
const FAKE_SEAT = "seat-synthetic-0001";

function makeCustody() {
  let n = 0;
  const custody = new SeatCustody({ handleFactory: () => `handle-synthetic-${++n}` });
  custody.bind({ seatId: FAKE_SEAT, credential: FAKE_CREDENTIAL });
  custody.remember(FAKE_INVITE);
  return custody;
}

// 建一个适配器，dispatch 由用例给。negotiate 一次好让 call 可用。
function makeAdapter(dispatch) {
  const custody = makeCustody();
  const adapter = new SeatModelAdapter({ custody, dispatch });
  adapter.negotiate();
  return { adapter, custody };
}

// 把整个信封序列化，逐个合成秘密扫一遍。判据是「值有没有出现」，
// 而不是「某个键有没有被摘掉」——换个键名照样是搬运。
function envelopeContainsSecret(envelope) {
  const text = JSON.stringify(envelope) ?? "";
  const hits = [];
  for (const [label, secret] of [
    ["credential", FAKE_CREDENTIAL],
    ["credential_2", FAKE_CREDENTIAL_2],
    ["invite", FAKE_INVITE],
  ]) {
    if (text.includes(secret)) hits.push(label);
  }
  // 字段名只查**键位**（后面紧跟冒号）。第一版没限定键位，于是
  // seat_identity_not_model_supplied 那条拒绝被判成泄漏——它的 details.field 的**值**
  // 正是 "recovery_credential"，那是边界在报「我拦下了什么」。
  // 把一次成功的拦截读成一次泄漏，就会有人靠删掉报告来「修」它。
  if (/"recovery_credential"\s*:/.test(text)) hits.push("field:recovery_credential");
  if (/"credential"\s*:/.test(text)) hits.push("field:credential");
  return hits;
}

// ---- 出口一：成功 result ----

test("成功出口：核心回显 recovery_credential 时失败关闭，而不是摘掉字段照常返回", async () => {
  // 为什么这个场景是真的：view.projection 打到核心，而核心的投影构造只要有一处把
  // 请求参数原样并进返回（inject 注入过 recovery_credential），凭据就会跟着回来。
  // 适配器不该指望上游永远不犯这个错——它是模型可见出口的最后一道。
  //
  // 判据是失败关闭，不只是「信封里没有原文」。理由有两条：
  //
  // 一、五条模型面命令（ai.take_intents / ai.start / ai.resolve / view.projection /
  //     view.timeline）没有一条会正当地返回凭据。所以这个字段出现在这里只有一种解释：
  //     上游破了。摘掉字段照常返回，等于把上游的破洞无声补好，没有人会知道它漏过。
  //     room.create / room.join 那条真正产生凭据的路径不经过本适配器（它走 MCP 服务器的
  //     custody.bindFromResult），所以这里从严不会误伤。
  //
  // 二、这一条同时钉住 #guard 里两步的顺序。反过来写（先净化再扫描）就看不见这个缺陷：
  //     sanitizeResult 会把 recovery_credential 摘掉，摘干净之后扫描什么都扫不到，
  //     于是本用例会绿——而它本该红。
  const { adapter } = makeAdapter(async () => ({
    seats: [{ seat_id: FAKE_SEAT, recovery_credential: FAKE_CREDENTIAL }],
  }));
  const envelope = await adapter.call("view.projection", {});
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `成功信封里出现了秘密：${JSON.stringify(envelope)}`);
  assert.equal(envelope.ok, false, "上游回显凭据必须失败关闭，不能摘掉字段照常返回");
  assert.equal(envelope.code, "credential_leak", `实际 ${JSON.stringify(envelope)}`);
});

test("成功出口：嵌套深处的凭据也要被拦住", async () => {
  // 深度不是装饰。一个只查顶层键的实现能让上一条绿而这一条红。
  const { adapter } = makeAdapter(async () => ({
    room: { table: { seats: [{ inner: { deep: { recovery_credential: FAKE_CREDENTIAL } } }] } },
  }));
  const envelope = await adapter.call("view.projection", {});
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `嵌套凭据漏了：${JSON.stringify(envelope)}`);
  assert.equal(envelope.ok, false, "嵌套凭据同样要失败关闭");
  assert.equal(envelope.code, "credential_leak");
});

test("成功出口：藏在自由文本里的凭据也要被拦住", async () => {
  // 这一条是 stripSecrets 单独做不到的：它按键名摘字段，而这里凭据在一个叫 text 的
  // 普通字符串里。只有按原文比对的值扫描能抓到。
  //
  // 也因此这一条与 #guard 的两步顺序无关：净化摘不掉它，先摘后扫也照样命中。
  // 前面那条 recovery_credential 用例才是钉顺序的那一条。
  const { adapter } = makeAdapter(async () => ({
    timeline: [{ text: `恢复失败，请用 ${FAKE_CREDENTIAL} 重试` }],
  }));
  const envelope = await adapter.call("view.projection", {});
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `自由文本里的凭据漏了：${JSON.stringify(envelope)}`);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "credential_leak");
});

test("成功出口：邀请码也在托管记账里，同样不得出现在模型可见文本", async () => {
  // 邀请码走 remember() 而不是 bind()，所以它证明扫描认的是 knownSecrets 整个集合，
  // 不只是绑过席位的那几份凭据。
  const { adapter } = makeAdapter(async () => ({ note: `邀请码 ${FAKE_INVITE}` }));
  const envelope = await adapter.call("view.projection", {});
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `邀请码漏了：${JSON.stringify(envelope)}`);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "credential_leak");
});

test("成功出口：扇出里某一席失败，失败码也过闸", async () => {
  // ai.take_intents 会把逐席失败收进 result.failures，而那条 code 来自核心。
  // 核心把凭据拼进错误码这件事听起来离谱，但 code 是字符串，而字符串是最常被拼接的东西
  // ——「凭据 xxx 已吊销」正是人会写出来的错误消息。
  //
  // 这一条还顺带证明扇出的成功返回也走成功出口的闸：failures 藏在 result 里，
  // 一个只看 result 顶层几个已知字段的净化会漏掉它。
  const { adapter } = makeAdapter(async () => {
    const error = new Error("boom");
    error.code = `seat_credential_revoked:${FAKE_CREDENTIAL}`;
    error.status = 403;
    throw error;
  });
  const envelope = await adapter.call("ai.take_intents", {});
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `扇出失败码漏了凭据：${JSON.stringify(envelope)}`);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "credential_leak");
  assert.equal(envelope.details?.where, "model_result",
    "扇出的整体返回是成功形状，所以它该在成功出口被拦下");
});

test("成功出口：命中秘密时失败关闭，不是打码后继续", async () => {
  // 判据是「这一次调用不成功」。打码后继续会让搬运这条路径继续存在，
  // 下一次换个字段名或换个格式就又漏出去了。要修的是搬运，不是显示。
  const { adapter } = makeAdapter(async () => ({ leak: FAKE_CREDENTIAL }));
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.ok, false, "命中秘密的调用必须失败");
  assert.equal(envelope.code, "credential_leak",
    `应报 credential_leak，实际 ${JSON.stringify(envelope)}`);
  // 报错里说得出是哪条出口，但说不出值。where 用来定位，不用来复现。
  assert.equal(envelope.details?.where, "model_result");
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `失败关闭的报错本身漏了秘密：${JSON.stringify(envelope)}`);
});

test("成功出口：没有秘密时正常放行，净化不是把所有返回都掐掉", async () => {
  // 反向断言。少了这一条，一个「永远失败」的实现也能让上面几条全绿。
  const { adapter } = makeAdapter(async () => ({ seats: [{ seat_id: FAKE_SEAT, stack: 200 }] }));
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.ok, true, `正常返回被误拦：${JSON.stringify(envelope)}`);
  assert.deepEqual(envelope.result, { seats: [{ seat_id: FAKE_SEAT, stack: 200 }] });
});

test("成功出口：托管层没见过的新凭据，靠键位扫描也要拦住", async () => {
  // 这一条只有键名扫描能过。值扫描认的是 knownSecrets，而这份凭据从没绑过、从没
  // remember 过——它是核心刚签发的。
  //
  // 没有这一条，把键名那一圈整段删掉的变异能存活：其余用例的凭据都在 knownSecrets 里，
  // 值扫描一个人就全接住了。
  const NEVER_BOUND = "SYNTHETIC-CRED-never-bound-0a5f8c3e7d1b6492";
  const { adapter, custody } = makeAdapter(async () => ({
    seat: { seat_id: "seat-synthetic-0002" }, recovery_credential: NEVER_BOUND,
  }));
  assert.equal(custody.knownSecrets.has(NEVER_BOUND), false, "前提：这份凭据托管层没见过");
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.ok, false, "新签发的凭据也要失败关闭");
  assert.equal(envelope.code, "credential_leak");
  assert.equal(envelope.details?.field, "recovery_credential",
    "键位命中要报出是哪个字段，好让人回去修上游");
  assert.equal(JSON.stringify(envelope).includes(NEVER_BOUND), false);
});

test("成功出口：命中秘密不影响生命周期状态——这一跳确实成功过", async () => {
  // 顺序问题。过闸放在状态推进之前的话，一次泄漏会把 bound 吃掉，
  // 宿主于是以为自己还没接上，而实际上核心答得好好的。
  //
  // 反过来说核心失败那一条也一样：见下面 degraded 那条用例。
  const { adapter } = makeAdapter(async () => ({ leak: FAKE_CREDENTIAL }));
  assert.equal(adapter.state, "negotiated");
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.code, "credential_leak");
  assert.equal(adapter.state, "bound",
    "核心这一跳成功了，泄漏是出口的问题，不该把连接状态一起判成没接上");
});

test("核心错误出口：命中秘密时仍然进 degraded", async () => {
  const { adapter } = makeAdapter(async () => {
    const error = new Error("core_rejected");
    error.code = "seat_credential_revoked";
    error.status = 403;
    error.details = { received: { recovery_credential: FAKE_CREDENTIAL } };
    throw error;
  });
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.code, "credential_leak");
  assert.equal(adapter.state, "degraded",
    "核心确实失败过。泄漏把 degraded 吃掉的话，宿主就不知道自己该退回轮询");
});

// ---- 出口二：核心错误的 details ----

test("核心错误出口：details 里的凭据不得回显给模型", async () => {
  const { adapter } = makeAdapter(async () => {
    const error = new Error("core_rejected");
    error.code = "seat_credential_revoked";
    error.status = 403;
    // 核心把「我收到的凭据」放进诊断字段。这是真实会发生的事：报错时带上收到的参数
    // 是最常见的诊断写法，而 inject 注入的正是凭据原文。
    error.details = { received: { recovery_credential: FAKE_CREDENTIAL } };
    throw error;
  });
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.ok, false);
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `错误 details 里漏了凭据：${JSON.stringify(envelope)}`);
});

test("核心错误出口：净化之后错误码与状态仍然保留", async () => {
  // 净化不能把诊断价值一起吃掉。宿主要靠 code 决定退不退回轮询。
  const { adapter } = makeAdapter(async () => {
    const error = new Error("core_rejected");
    error.code = "seat_not_found";
    error.status = 404;
    error.details = { seat_id: FAKE_SEAT };
    throw error;
  });
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "seat_not_found");
  assert.equal(envelope.status, 404);
  // seat_id 是公开字段，不该被当秘密摘掉。
  assert.equal(JSON.stringify(envelope).includes(FAKE_SEAT), true,
    "公开的 seat_id 不该被净化掉，否则诊断信息全没了");
});

// ---- 出口三：本地拒绝的 details ----

test("本地拒绝出口：越界命令抛出，且抛出的 details 不含任何秘密", async () => {
  // 越界命令走的是 assertUsable，它抛而不是回信封（seat-model-adapter.test.cjs 钉的就是
  // 这条）。抛出来的 details 一样是模型可见的：MCP 服务器会把它转成 tool_result。
  const { adapter } = makeAdapter(async () => ({}));
  let thrown = null;
  await assert.rejects(() => adapter.call("hand.act", { type: "fold" }), (error) => {
    thrown = error;
    return error.code === "command_not_model_facing";
  });
  assert.deepEqual(envelopeContainsSecret({ code: thrown.code, details: thrown.details }), [],
    `本地拒绝漏了秘密：${JSON.stringify(thrown.details)}`);
});

test("本地拒绝出口：命令名里夹带凭据时，抛出的报错也失败关闭", async () => {
  // 为什么这个场景值得拦：details 里的 command 原样来自模型。模型能构造任意字符串，
  // 而边界不该靠「谁会这么写命令名」来论证安全——那是在推理可达性，不是在设边界。
  const { adapter } = makeAdapter(async () => ({}));
  await assert.rejects(
    () => adapter.call(`hand.act?leak=${FAKE_CREDENTIAL}`, {}),
    (error) => {
      assert.equal(error.code, "credential_leak", `实际 ${error.code}`);
      assert.equal(String(error.message).includes(FAKE_CREDENTIAL), false,
        "报错消息里带上了凭据原文");
      assert.deepEqual(envelopeContainsSecret({ details: error.details }), [],
        `失败关闭的 details 漏了秘密：${JSON.stringify(error.details)}`);
      return true;
    });
});

test("本地拒绝出口：模型自带凭据时报错，且报错本身不回显那份凭据", async () => {
  // 模型手里出现凭据本身就说明托管破了。此时的报错绝不能把它再抄一遍——
  // 那会让一次泄漏变成两处留痕（一处在模型的输入，一处在它的输出）。
  const { adapter } = makeAdapter(async () => ({}));
  const envelope = await adapter.call("ai.resolve", {
    turn_id: "turn-x",
    recovery_credential: FAKE_CREDENTIAL,
  });
  assert.equal(envelope.ok, false);
  assert.deepEqual(envelopeContainsSecret(envelope), [],
    `拒收模型自带凭据时把它回显了：${JSON.stringify(envelope)}`);
  // 反面：拒绝本身必须说得出拦的是哪个字段。少了这一条，「把报告删干净」
  // 也能让上一条断言变绿，而那正好把边界的可观测性拆掉。
  assert.equal(envelope.code, "seat_identity_not_model_supplied");
  assert.equal(envelope.details?.field, "recovery_credential",
    `拒绝没报出拦的是哪个字段：${JSON.stringify(envelope.details)}`);
});

// ---- 出口四：公开对象图 ----

test("对象能力：外部拿到适配器后，不得经公开属性链取到托管层", () => {
  // 这一条与文本净化是不同性质的问题。就算所有文本出口都干净，只要这条属性链还通，
  // 拿到适配器引用的人就能直接取出凭据原文，一次净化都不用绕。
  const { adapter } = makeAdapter(async () => ({}));
  assert.equal(adapter.surface, undefined,
    "adapter.surface 不该是公开属性——它通向 custody 与 issued");
});

test("对象能力：属性遍历里不得出现 custody、句柄、凭据或 issued", () => {
  const { adapter } = makeAdapter(async () => ({}));
  const seen = new Set();
  // 自有属性 + 原型链上的可枚举键，两边都查。只查 Object.keys 会漏掉挂在原型上的 getter。
  for (let node = adapter; node !== null && node !== Object.prototype;
    node = Object.getPrototypeOf(node)) {
    for (const key of Reflect.ownKeys(node)) seen.add(String(key));
  }
  for (const forbidden of ["custody", "issued", "bindings", "knownSecrets",
    "dispatchImpl", "surface"]) {
    assert.equal(seen.has(forbidden), false,
      `${forbidden} 不该出现在适配器的可达属性里；当前可达：${[...seen].join(",")}`);
  }
});

test("对象能力：把适配器整个序列化，出不来秘密", () => {
  const { adapter } = makeAdapter(async () => ({}));
  // 有人把适配器塞进日志或错误上下文时会发生这件事。
  let text;
  try {
    text = JSON.stringify(adapter) ?? "";
  } catch {
    text = ""; // 序列化不了反而是好事。
  }
  assert.equal(text.includes(FAKE_CREDENTIAL), false, `序列化适配器漏了凭据：${text}`);
  assert.equal(text.includes(FAKE_INVITE), false, `序列化适配器漏了邀请码：${text}`);
});

test("对象能力：inspectableState 只报数目，不报值，也不给出通往托管层的引用", () => {
  const { adapter } = makeAdapter(async () => ({}));
  adapter.seedForRelease();
  const state = adapter.inspectableState();
  const text = JSON.stringify(state) ?? "";
  assert.equal(text.includes(FAKE_CREDENTIAL), false);
  assert.equal(text.includes("handle-synthetic"), false,
    `inspectableState 报了句柄原文：${text}`);
  assert.equal(typeof state.tracked_id_count, "number");
  // 返回值里不得夹带对象引用。数字与字符串可以，对象会成为一条新的可达路径。
  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value)) {
      assert.ok(value.every((v) => typeof v !== "object" || v === null),
        `inspectableState.${key} 数组里夹带了对象引用`);
      continue;
    }
    assert.ok(value === null || typeof value !== "object",
      `inspectableState.${key} 是对象引用，那是一条新的可达路径`);
  }
});

test("对象能力：seedForRelease 之后计数为 2，release 之后归零", () => {
  // 让上面那条「只报数目」不至于在一个恒为 0 的实现上空过。
  // 2 是 intent_id 与 turn_id 各一条：共用一张表，所以一次 clear 两条都清。
  const { adapter } = makeAdapter(async () => ({}));
  assert.equal(adapter.inspectableState().tracked_id_count, 0);
  adapter.seedForRelease();
  assert.equal(adapter.inspectableState().tracked_id_count, 2);
  adapter.release();
  assert.equal(adapter.inspectableState().tracked_id_count, 0);
});

test("对象能力：命令面本身也收窄了，不只是适配器挡在前面", () => {
  // 为什么单独测这一层：适配器不再暴露 surface，所以从 adapter 出发走不到 surface 上的
  // 任何东西——把 custody 重新挂回 ModelCommandSurface 的公开属性，从适配器一侧完全
  // 观测不到。而 plugins/tokengame/mcp/server.cjs 是**直接**构造 ModelCommandSurface 并
  // 一直持有它的，所以那一层的公开属性是一条真实可达路径。
  //
  // 只测适配器等于把「谁都不该拿到 custody」偷换成「适配器不给」。
  const { ModelCommandSurface } = require("../src/host/model-command-surface.cjs");
  const custody = makeCustody();
  const surface = new ModelCommandSurface({ custody, request: async () => ({ ok: true, body: {} }) });

  assert.equal(surface.custody, undefined, "命令面不该公开 custody");
  assert.equal(surface.issued, undefined, "命令面不该公开 issued——它可写");
  assert.equal(surface.request, undefined, "命令面不该公开 request");

  // 与适配器那条同样的对象图搜索，不靠猜属性名。
  const seen = new Set();
  const queue = [{ node: surface, path: "surface" }];
  const hits = [];
  let visited = 0;
  while (queue.length > 0 && visited < 5000) {
    const { node, path } = queue.shift();
    if (node === null || (typeof node !== "object" && typeof node !== "function")) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    visited += 1;
    if (node === custody) hits.push(`${path} -> custody 实例`);
    if (node instanceof Map && node !== seen) hits.push(`${path} -> 可写 Map`);
    for (let obj = node; obj !== null && obj !== Object.prototype
      && obj !== Function.prototype; obj = Object.getPrototypeOf(obj)) {
      for (const key of Reflect.ownKeys(obj)) {
        if (key === "constructor" || key === "caller" || key === "arguments") continue;
        let value;
        try {
          value = node[key];
        } catch {
          continue;
        }
        if (typeof value === "string" && value.includes(FAKE_CREDENTIAL)) {
          hits.push(`${path}.${String(key)} -> 凭据原文`);
        }
        if (value !== null && (typeof value === "object" || typeof value === "function")) {
          queue.push({ node: value, path: `${path}.${String(key)}` });
        }
      }
    }
  }
  assert.deepEqual(hits, [], `命令面的对象图上有可达路径：${hits.join(" / ")}`);
  // 反面：托管层自己当然还取得出来，否则上面的「无」可能只是因为凭据没绑上。
  assert.equal(custody.resolve("handle-synthetic-1").credential, FAKE_CREDENTIAL);
});

test("对象能力：#guard 里非泄漏的异常照原样抛出，不被改写成 credential_leak", async () => {
  // 循环引用会让 assertNoLeak 里的 JSON.stringify 抛 TypeError。它不是泄漏。
  // 把它报成 credential_leak 的后果是：一份泄漏报告掩盖了另一个缺陷，
  // 而读报告的人会去找根本不存在的凭据。
  const circular = { seats: [] };
  circular.self = circular;
  const { adapter } = makeAdapter(async () => circular);
  await assert.rejects(() => adapter.call("view.projection", {}), (error) => {
    assert.notEqual(error.code, "credential_leak",
      "非泄漏异常被改写成了 credential_leak");
    assert.equal(error instanceof TypeError, true, `实际 ${error.name}: ${error.message}`);
    return true;
  });
});

// ---- 净化必须是唯一那一份，而不是各出口各写一遍 ----

test("三条出口走的是同一个净化实现", async () => {
  // 各出口各写一份净化，迟早有一份漏掉新加的字段。这一条钉住它们共用一处：
  // 三条出口在同一个秘密上必须给出同样的结论。
  const results = [];
  {
    const { adapter } = makeAdapter(async () => ({ leak: FAKE_CREDENTIAL }));
    results.push(await adapter.call("view.projection", {}));
  }
  {
    const { adapter } = makeAdapter(async () => {
      const error = new Error("x");
      error.code = "core_boom";
      error.details = { leak: FAKE_CREDENTIAL };
      throw error;
    });
    results.push(await adapter.call("view.projection", {}));
  }
  for (const envelope of results) {
    assert.equal(envelope.ok, false);
    assert.deepEqual(envelopeContainsSecret(envelope), [],
      `某条出口的净化与其他不一致：${JSON.stringify(envelope)}`);
  }
});

test("三条出口各自都挂着闸，包括暂时构造不出负例的那一条", () => {
  // 静态断言，而且我知道它比行为断言弱。写在这里是因为第三条出口（本地拒绝的 details）
  // 今天**构造不出**带秘密的负例：
  //
  //   ModelSurfaceError 的 details 只有三种形状——{field}、{command, field}、{command}。
  //   field 是 MODEL_FORBIDDEN_PARAMS 里的字面量；command 在进入 #surface.call 之前
  //   已经被 assertUsable 过了闸（而且 commandsForRole 与 MODEL_COMMANDS 是同一个对象，
  //   所以 #surface.call 那条 command_not_model_facing 从本适配器根本走不到）。
  //
  // 于是那条出口的闸在行为上不可观测。可选项有三个：编一个假的 ModelSurfaceError 注进去、
  // 不管它、或者钉住它存在。第一个是伪造可达性，第二个会让删掉那一行的变异存活。
  //
  // 这条断言的真实作用是：任何人删掉或漏写一处 #guarded，这里会红。它不证明那条路径
  // 会拦住秘密，只证明闸还在。这个区别记在 REVIEW-LOG 里。
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "host", "seat-model-adapter.cjs"), "utf8");
  const code = source.split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  const calls = code.split("this.#guarded(").length - 1;
  assert.equal(calls, 3, `模型可见出口应当恰好三处过闸，实际 ${calls} 处`);
  for (const where of ["model_result", "model_core_error", "model_local_rejection"]) {
    assert.equal(code.includes(`"${where}"`), true, `少了 ${where} 这条出口的标记`);
  }
  // 闸自己只有一份实现。两份的话就是「各出口各写一遍」，正是要避免的东西。
  assert.equal(code.split("assertNoLeak(").length - 1, 2,
    "适配器里应当只有 #guard 与 assertUsable 两处调 assertNoLeak");
});

test("托管层的 assertNoLeak 仍然是失败关闭的（净化不得把它降级成打码）", () => {
  const custody = makeCustody();
  assert.throws(() => custody.assertNoLeak(`前缀 ${FAKE_CREDENTIAL} 后缀`), CredentialLeak);
  assert.throws(() => custody.assertNoLeak('{"recovery_credential":"whatever"}'), CredentialLeak);
  // 没有秘密时原样返回，否则一个「永远抛」的实现也能让上面两条通过。
  assert.equal(custody.assertNoLeak("干净文本"), "干净文本");
});

test("多席时每一席的凭据都在扫描范围内", async () => {
  // 只记住第一份凭据的实现会在这里漏。
  const custody = new SeatCustody({ handleFactory: (() => {
    let n = 0;
    return () => `handle-synthetic-${++n}`;
  })() });
  custody.bind({ seatId: FAKE_SEAT, credential: FAKE_CREDENTIAL });
  custody.bind({ seatId: "seat-synthetic-0002", credential: FAKE_CREDENTIAL_2 });
  const adapter = new SeatModelAdapter({
    custody,
    dispatch: async () => ({ leak: FAKE_CREDENTIAL_2 }),
  });
  adapter.negotiate();
  const envelope = await adapter.call("view.projection", {});
  assert.equal(envelope.ok, false, "第二席的凭据也必须被拦住");
  assert.deepEqual(envelopeContainsSecret(envelope), []);
});
