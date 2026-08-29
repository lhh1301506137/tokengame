"use strict";
// A4：单一权威错误码注册表，覆盖核心、HTTP 与插件响应。
//
// 缺陷本体：已有的覆盖检查（test/adapter-contract.test.cjs「源码里每一个错误码都被归类」）
// 只扫错误**构造器**——`new CoreError("x")` 这种形状。而项目里还有三条别的出码路径：
//
//   1. HTTP 响应体直接写字面量：`sendJson(response, 404, { ok: false, code: "not_found" })`
//   2. 插件 MCP 响应体：`{ code: "core_unavailable", ... }`
//   3. 挂在 Error 对象上的字段：`Object.assign(new Error(...), { code: "adapter_timeout" })`
//
// 那条检查扫不到这三类，于是它们一个都没归类，全部落到 `unknown`。而 `unknown` 的处置是
// `{ retryable: false, user_visible: true, is_defect: true }`——`not_found`、
// `method_not_allowed`、`unknown_route` 这些例行 HTTP 状况因此都被当成缺陷弹给用户。
//
// 更要紧的是反向：`credential_leak` 与 `response_withheld_secret_detected` 确实该当缺陷，
// 但它们现在落在那一档是**碰巧**，不是被归类过。哪天有人把 unknown 的兜底改宽一点
// （比如让它可重试），这两条会跟着变宽，而没有任何测试会红——那正是 adapter-contract 里
// 「兜底一变覆盖检查就恒真」那条注释担心的事，只是它当时没意识到还有一半码根本没进视野。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contract = require("../src/contract/adapter-contract.cjs");

const ROOT = path.join(__dirname, "..");

// 扫描范围：核心 + 宿主 + 插件。插件也要扫——它是模型和用户真正看到的那一层，
// 而它此前完全不在覆盖检查的视野里。
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      yield* walk(full);
    } else if (entry.name.endsWith(".cjs")) {
      yield full;
    }
  }
}

const SOURCES = [
  ...walk(path.join(ROOT, "src")),
  ...walk(path.join(ROOT, "plugins")),
];

// 四种出码形状。前一种是原有覆盖检查看得见的，后三种是它的盲区。
const SHAPES = Object.freeze([
  {
    name: "构造器",
    pattern: /(?:CoreError|ProbeError|ModelSurfaceError|CustodyError|ContractError)\(\s*"([a-z_]+)"/g,
  },
  {
    name: "响应体字面量",
    pattern: /\bcode:\s*"([a-z_]+)"/g,
  },
  {
    name: "错误码常量表",
    pattern: /^\s*(?:CODE_[A-Z_]+|[A-Z_]+_CODE)\s*=\s*"([a-z_]+)"/gm,
  },
]);

function collect() {
  const found = new Map();  // code -> [{file, shape}]
  for (const file of SOURCES) {
    const source = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const shape of SHAPES) {
      // 每次都新建正则实例：带 g 的正则有 lastIndex 状态，共用一个会跳过匹配。
      const re = new RegExp(shape.pattern.source, shape.pattern.flags);
      for (const match of source.matchAll(re)) {
        if (!found.has(match[1])) found.set(match[1], []);
        found.get(match[1]).push({ file: rel, shape: shape.name });
      }
    }
  }
  return found;
}

test("扫描本身没瞎", () => {
  const found = collect();
  // 数量下界。正则失效时它会静默扫到零个，而零个会让下面每一条都通过。
  assert.ok(found.size >= 80, `只扫到 ${found.size} 个错误码，正则大概失效了`);
  // 三种形状各要真的命中过。少了任何一种，那一类的盲区就回来了而没人知道。
  const shapesSeen = new Set();
  for (const sites of found.values()) for (const site of sites) shapesSeen.add(site.shape);
  for (const shape of ["构造器", "响应体字面量"]) {
    assert.ok(shapesSeen.has(shape), `没有扫到任何「${shape}」形状的错误码`);
  }
  // 插件目录必须在视野里。它是模型和用户真正看到的那一层。
  const files = new Set();
  for (const sites of found.values()) for (const site of sites) files.add(site.file);
  assert.ok([...files].some((f) => f.startsWith("plugins/")),
    "扫描范围里没有插件文件——那一层的错误码此前完全不在覆盖检查视野内");
  assert.ok([...files].some((f) => f.startsWith("src/authority/")), "没扫到核心");
  assert.ok([...files].some((f) => f.startsWith("src/host/")), "没扫到宿主层");
});

test("每一个出码都已归类，HTTP 与插件响应也算", () => {
  const found = collect();
  const unclassified = [...found.keys()]
    .filter((code) => contract.classifyError(code) === "unknown")
    .sort();
  const detail = unclassified
    .map((code) => `${code}（${found.get(code).map((s) => `${s.file}:${s.shape}`).join("、")}）`)
    .join("\n  ");
  assert.deepEqual(unclassified, [],
    `以下错误码没有归类，会被按最保守的一档当成缺陷弹给用户：\n  ${detail}`);
});

test("例行 HTTP 状况不当缺陷", () => {
  // 归类不是为了让覆盖检查变绿，是为了让处置正确。这一条钉住那个目的：路由不存在、
  // 方法不对、请求体太大都是客户端问的方式不对，不是本地缺陷——把它们当缺陷会让
  // 一次拼错的 URL 在用户面前变成一条「程序出错了」。
  for (const code of ["not_found", "unknown_route", "method_not_allowed", "request_body_too_large"]) {
    const d = contract.dispositionFor(code);
    assert.equal(d.is_defect, false, `${code} 被当成缺陷`);
    assert.equal(d.retryable, false, `${code} 原样重试没有意义`);
  }
});

test("失败关闭的安全码明确当缺陷，不是碰巧落在兜底里", () => {
  // 这两条现在也是 is_defect: true，但那是 unknown 兜底的结果，不是归类的结果。
  // 差别在哪天有人把兜底改宽——比如让 unknown 可重试以「提高健壮性」——这两条会跟着变宽，
  // 而一条重试的凭据泄漏检测等于把泄漏又发一次。
  for (const code of ["credential_leak", "response_withheld_secret_detected"]) {
    assert.notEqual(contract.classifyError(code), "unknown",
      `${code} 仍然只靠兜底，没有被真正归类`);
    const d = contract.dispositionFor(code);
    assert.equal(d.is_defect, true, `${code} 必须当缺陷`);
    assert.equal(d.retryable, false, `${code} 绝不可重试——重试等于把泄漏再发一次`);
  }
});

test("核心不可达归传输类，因为它是唯一原样重试有意义的一类", () => {
  for (const code of ["core_unavailable", "invalid_core_response", "adapter_timeout"]) {
    assert.notEqual(contract.classifyError(code), "unknown", `${code} 没归类`);
  }
  // core_unavailable 与 adapter_timeout 都是「对面没答」，重试有意义。
  assert.equal(contract.dispositionFor("core_unavailable").retryable, true);
  assert.equal(contract.dispositionFor("adapter_timeout").retryable, true);
  // invalid_core_response 不同：对面答了，但答的不是 JSON。重发同一条请求会得到同一份
  // 坏响应，所以它不可重试，且是缺陷。
  assert.equal(contract.dispositionFor("invalid_core_response").retryable, false);
  assert.equal(contract.dispositionFor("invalid_core_response").is_defect, true);
});

test("注册表里没有源码不存在的码", () => {
  // 反向对账。留着不存在的码本身无害，但它说明有人删了实现却没删分类——而下一个人会
  // 以为那条路还在。
  const found = collect();
  // core_request_failed 是 HTTP 客户端的兜底默认值（body?.code ?? "core_request_failed"），
  // 不以上面任何一种形状出现，所以扫不到它。
  const byDefault = new Set(["core_request_failed"]);
  const stale = Object.values(contract.ERROR_CLASSES).flat()
    .filter((code) => !found.has(code) && !byDefault.has(code))
    .sort();
  assert.deepEqual(stale, [], `注册表里这些码源码里已经没有了：${stale.join(" ")}`);
});

test("覆盖检查不靠 unknown 兜底的返回值判缺口", () => {
  // 这一条防的是 adapter-contract 那条注释里写的退化路径：覆盖检查靠
  // `classifyError(code) === "unknown"` 判断缺口，于是把兜底从 "unknown" 改成任何别的名字
  // ——比如让它回 "state"——覆盖检查就永远读不出缺口，变成一条恒真的断言。
  //
  // 所以这里直接钉住兜底的名字与它的处置。改它必须有人先看见这条。
  assert.equal(contract.classifyError("something_nobody_classified"), "unknown");
  assert.equal(contract.classifyError(""), "unknown");
  assert.equal(contract.classifyError(undefined), "unknown");
  const fallback = contract.dispositionFor("something_nobody_classified");
  assert.deepEqual(
    { retryable: fallback.retryable, is_defect: fallback.is_defect, user_visible: fallback.user_visible },
    { retryable: false, is_defect: true, user_visible: true },
    "兜底必须是最保守的一档：认不出的码不许被静默重发",
  );
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
