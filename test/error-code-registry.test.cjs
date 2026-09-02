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

// 扫描范围：核心 + 宿主 + 插件 + 可执行的 B11 离线入口。插件也要扫——它是模型和用户真正看到的那一层，
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
  path.join(ROOT, "test-support/summarize-ai-receipts.cjs"),
];

// 已知出码形状。新增工厂也必须进入扫描，不能因为不叫 CoreError 就躲过集中分类。
const SHAPES = Object.freeze([
  {
    name: "构造器",
    pattern: /(?:CoreError|ProbeError|ModelSurfaceError|CustodyError|ContractError|ConnectorError)\(\s*"([a-z_]+)"/g,
  },
  {
    name: "响应体字面量",
    pattern: /\bcode:\s*"([a-z_]+)"/g,
  },
  {
    name: "错误码常量表",
    pattern: /^\s*(?:CODE_[A-Z_]+|[A-Z_]+_CODE)\s*=\s*"([a-z_]+)"/gm,
  },
  {
    name: "受限连接错误工厂",
    pattern: /\bconnectionError\(\s*"([a-z_]+)"/g,
  },
  {
    name: "本地回执错误工厂",
    // 当前工厂入参是固定字面量或固定字面量的三元式；同时收两条分支，不能只扫第一个码。
    pattern: /\breceiptError\(([^()]*)\)/g,
    codes: (match) => [...new Set([...match[1].matchAll(/"(ai_receipt_[a-z_]+)"/g)].map((item) => item[1]))],
  },
  {
    name: "队列传输错误工厂",
    files: ["src/host/codex-queue-transport.cjs", "src/host/codex-queue-sender.cjs"],
    pattern: /\b(?:ProbeFailure|fail|cancel)\(\s*"([a-z_]+)"/g,
  },
  {
    name: "有界通知动态拒绝与超时",
    files: ["src/host/model-command-surface.cjs", "src/host/model-wake-session.cjs"],
    // reserveWakeIntent的稳定拒绝被管理器提升为CoreError；#bounded的最后一个参数
    // 是超时code。只收这两种真实出码形状，不扫字段名或用整个字符串表自证。
    pattern: /(?:reason:\s*"(wake_[a-z_]+)"|,\s*"(wake_[a-z_]+)"\s*\);)/g,
    codes: (match) => [match[1] ?? match[2]],
  },
  {
    name: "远端通知拒绝回执工厂",
    files: ["src/host/remote-wake-broker.cjs"],
    pattern: /\bfailed\(\s*"([a-z_]+)"/g,
  },
  {
    name: "连接器启动错误工厂与关停码",
    files: ["plugins/tokengame/codex/connect.cjs"],
    pattern: /\b(?:failure|stopOwned)\(\s*"([a-z_]+)"/g,
  },
  {
    name: "连接器终态错误赋值与兜底",
    files: ["src/host/remote-wake-connector.cjs", "plugins/tokengame/codex/run-connector.cjs"],
    // 实际进入返回结果的赋值/兜底；不扫描 STOP_CODES 之类输入白名单自证覆盖。
    pattern: /(?:\breason\s*=|:)\s*"(wake_connector_[a-z_]+)"/g,
  },
  {
    name: "本机游戏入口错误工厂",
    files: ["plugins/tokengame/codex/play.cjs"],
    pattern: /\bplayError\(\s*"([a-z_]+)"/g,
  },
  {
    name: "本机游戏入口错误默认参数与兜底",
    files: ["plugins/tokengame/codex/play.cjs"],
    pattern: /(?:\bcode\s*=|:)\s*"(tokengame_[a-z_]+)"/g,
  },
]);

function collect() {
  const found = new Map();  // code -> [{file, shape}]
  for (const file of SOURCES) {
    const source = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const shape of SHAPES) {
      if (shape.files !== undefined && !shape.files.includes(rel)) continue;
      // 每次都新建正则实例：带 g 的正则有 lastIndex 状态，共用一个会跳过匹配。
      const re = new RegExp(shape.pattern.source, shape.pattern.flags);
      for (const match of source.matchAll(re)) {
        for (const code of shape.codes?.(match) ?? [match[1]]) {
          if (!found.has(code)) found.set(code, []);
          found.get(code).push({ file: rel, shape: shape.name });
        }
      }
    }
  }
  return found;
}

test("扫描本身没瞎", () => {
  const found = collect();
  // 数量下界。正则失效时它会静默扫到零个，而零个会让下面每一条都通过。
  assert.ok(found.size >= 80, `只扫到 ${found.size} 个错误码，正则大概失效了`);
  // 已在源码使用的形状各要真的命中过。少了任何一种，那一类的盲区就回来了而没人知道。
  const shapesSeen = new Set();
  for (const sites of found.values()) for (const site of sites) shapesSeen.add(site.shape);
  for (const shape of ["构造器", "响应体字面量", "受限连接错误工厂", "本地回执错误工厂"]) {
    assert.ok(shapesSeen.has(shape), `没有扫到任何「${shape}」形状的错误码`);
  }
  // 插件目录必须在视野里。它是模型和用户真正看到的那一层。
  const files = new Set();
  for (const sites of found.values()) for (const site of sites) files.add(site.file);
  assert.ok([...files].some((f) => f.startsWith("plugins/")),
    "扫描范围里没有插件文件——那一层的错误码此前完全不在覆盖检查视野内");
  assert.ok([...files].some((f) => f.startsWith("src/authority/")), "没扫到核心");
  assert.ok([...files].some((f) => f.startsWith("src/host/")), "没扫到宿主层");
  for (const code of ["model_connection_invalid", "model_connection_unavailable", "model_connection_origin_conflict"]) {
    assert.ok(found.get(code)?.some((site) => site.shape === "受限连接错误工厂"),
      `${code} 必须从真实抛错调用收集，不能把新增构造方式留在盲区`);
  }
});

test("回执错误工厂的直接调用与三元分支都从实际出码点进入扫描", () => {
  const found = collect();
  for (const code of [
    "ai_receipt_invalid_limits", "ai_receipt_invalid_source", "ai_receipt_invalid_event",
    "ai_receipt_write_failed", "ai_receipt_invalid_file", "ai_receipt_file_exists",
    "ai_receipt_open_failed", "ai_receipt_subscription_failed", "ai_receipt_startup_failed",
  ]) {
    assert.ok(found.get(code)?.some((site) => site.file === "src/host/ai-lifecycle-receipts.cjs"
      && site.shape === "本地回执错误工厂"), `${code} 必须来自真实 receiptError 调用，不靠注册表或兜底例外`);
  }
  assert.ok(found.get("ai_receipt_read_failed")?.some((site) => site.file === "test-support/summarize-ai-receipts.cjs"),
    "可直接运行的离线入口也会抛稳定错误，必须纳入 B11 出码覆盖");
});

test("回执配置和本地文件故障不重试，权威契约与接线异常明确报缺陷", () => {
  const expected = {
    configuration: [
      "ai_receipt_remote_core_unsupported", "ai_receipt_invalid_file", "ai_receipt_file_exists",
      "ai_receipt_open_failed", "ai_receipt_write_failed", "ai_receipt_read_failed",
    ],
    invalid_request: ["ai_receipt_invalid_limits"],
    internal: [
      "ai_receipt_invalid_source", "ai_receipt_invalid_event", "ai_receipt_subscription_failed", "ai_receipt_startup_failed",
    ],
  };
  for (const [category, codes] of Object.entries(expected)) {
    for (const code of codes) {
      assert.equal(contract.classifyError(code), category, `${code} 的故障边界归类错误`);
      assert.deepEqual(contract.dispositionFor(code), {
        retryable: false, user_visible: true, is_defect: category !== "configuration",
      }, `${code} 不能自动重发或静默吞掉`);
    }
  }
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

test("远程 Connector、Broker 与 launcher 的真实出码点都被扫描，queue 未知不可重试", () => {
  const found = collect();
  for (const [code, file, shape] of [
    ["wake_connector_configuration_invalid", "src/host/remote-wake-connector.cjs", "构造器"],
    ["wake_connector_protocol_invalid", "src/host/remote-wake-connector.cjs", "构造器"],
    ["wake_connector_unavailable", "src/host/remote-wake-broker.cjs", "远端通知拒绝回执工厂"],
    ["wake_connector_busy", "src/host/remote-wake-broker.cjs", "远端通知拒绝回执工厂"],
    ["wake_connector_start_timeout", "plugins/tokengame/codex/connect.cjs", "连接器启动错误工厂与关停码"],
    ["wake_connector_detach_failed", "plugins/tokengame/codex/connect.cjs", "连接器启动错误工厂与关停码"],
    ["wake_connector_cleanup_unknown", "plugins/tokengame/codex/connect.cjs", "连接器启动错误工厂与关停码"],
    ["wake_connector_cleanup_failed", "src/host/remote-wake-connector.cjs", "连接器终态错误赋值与兜底"],
    ["wake_connector_queue_failed", "src/host/remote-wake-connector.cjs", "连接器终态错误赋值与兜底"],
    ["wake_connector_failed", "plugins/tokengame/codex/run-connector.cjs", "连接器终态错误赋值与兜底"],
    ["tokengame_public_origin_invalid", "plugins/tokengame/codex/play.cjs", "本机游戏入口错误工厂"],
    ["tokengame_codex_executable_invalid", "plugins/tokengame/codex/play.cjs", "本机游戏入口错误默认参数与兜底"],
  ]) {
    assert.ok(found.get(code)?.some((site) => site.file === file && site.shape === shape), `${code} 未命中实际出码点`);
  }
  for (const code of ["wake_connector_queue_unknown", "wake_connector_queue_failed", "wake_connector_cleanup_unknown",
    "wake_connector_cleanup_failed", "wake_connector_start_timeout", "wake_connector_detach_failed"]) {
    assert.equal(contract.classifyError(code), "execution_uncertain", code);
    assert.equal(contract.dispositionFor(code).retryable, false, `${code} 不得重投 queue`);
    assert.equal(contract.dispositionFor(code).user_visible, true, code);
  }
  assert.equal(contract.classifyError("wake_connector_network_unavailable"), "transport");
  assert.equal(contract.classifyError("wake_connector_protocol_invalid"), "internal");
  assert.equal(contract.classifyError("model_connection_changed"), "identity");
});

test("有界队列错误工厂真实进入扫描；未知接收不得因传输错误而被自动重试", () => {
  const found = collect();
  for (const code of ["invalid_configuration", "child_start_failed", "cancelled",
    "queue_timeout", "queue_child_error", "queue_io_error", "queue_output_limit"]) {
    assert.ok(found.get(code)?.some((site) => site.shape === "队列传输错误工厂"), `${code} 未从实际出码点进入扫描`);
    assert.equal(contract.dispositionFor(code).retryable, false, code);
  }
  for (const code of ["queue_timeout", "queue_child_error", "queue_io_error", "queue_output_limit"]) {
    assert.equal(contract.classifyError(code), "execution_uncertain");
    assert.equal(contract.dispositionFor(code).user_visible, true);
  }
  assert.equal(contract.classifyError("core_request_cancelled"), "state");
  for (const code of ["wake_io_timeout", "wake_queue_timeout", "wake_intent_already_attempted", "wake_intent_history_full"]) {
    assert.ok(found.get(code)?.some((site) => site.shape === "有界通知动态拒绝与超时"), code);
    assert.equal(contract.dispositionFor(code).retryable, false, code);
  }
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

test("对面不可达归传输类，因为它是唯一原样重试有意义的一类", () => {
  // core_unavailable 曾在这一行。它出在插件 MCP 连不上核心，而 B6 收敛后插件不再直接打
  // 核心——那一跳由协调器做，插件那一侧的不可达现在是 table_unavailable。核心不可达本身
  // 没消失，它出在 core-client 里，码是 core_unreachable。
  for (const code of ["core_unreachable", "table_unavailable", "invalid_core_response", "adapter_timeout"]) {
    assert.notEqual(contract.classifyError(code), "unknown", `${code} 没归类`);
  }
  // 这三条都是「对面没答」，重试有意义。
  assert.equal(contract.dispositionFor("core_unreachable").retryable, true);
  assert.equal(contract.dispositionFor("table_unavailable").retryable, true);
  assert.equal(contract.dispositionFor("adapter_timeout").retryable, true);
  // invalid_core_response 不同：对面答了，但答的不是 JSON。重发同一条请求会得到同一份
  // 坏响应，所以它不可重试，且是缺陷。
  assert.equal(contract.dispositionFor("invalid_core_response").retryable, false);
  assert.equal(contract.dispositionFor("invalid_core_response").is_defect, true);
});

test("没配令牌与配错令牌不是同一件事", () => {
  // B6-2 的模型命令口有两种拒绝，读起来都像「你进不来」，而该做的事相反：
  //
  //   model_command_route_disabled       协调器没设令牌 → 这条路整个关着，谁都进不来
  //   model_command_token_not_configured 插件没设令牌 → 路开着，本进程无凭出示
  //   model_command_token_rejected       令牌不对 → 路开着，你出示的那个不对
  //
  // 前两条要运维去设一个环境变量，第三条要运维去核对已设的那个。混成一类会让第一种
  // 情况下有人反复检查一个根本还没生成的令牌。
  for (const code of ["model_command_route_disabled", "model_command_token_not_configured"]) {
    assert.equal(contract.classifyError(code), "configuration", `${code} 归错类了`);
    const d = contract.dispositionFor(code);
    // 不可重试：路关着是常态，不是抖动。重试改不了一个没设的环境变量。
    assert.equal(d.retryable, false, `${code} 原样重试没有意义`);
    // 不是缺陷：不配模型口是合法的默认（本地单机玩牌不需要它）。
    assert.equal(d.is_defect, false, `${code} 不是缺陷，是没配`);
    // 必须可见。这一位是这一档存在的理由：静默的「路关着」会让宿主 AI 对着一个永远
    // 不答的口轮询下去，而运维看不到任何该改配置的信号。
    assert.equal(d.user_visible, true, `${code} 必须让人看见，否则宿主 AI 会静默空转`);
  }
  // 令牌不对是身份问题，与上面两条不同类。这一条断言的是「两者被分开了」——
  // 都归 identity 或都归 configuration 都能让上面那几行通过。
  assert.equal(contract.classifyError("model_command_token_rejected"), "identity");
  assert.notEqual(
    contract.classifyError("model_command_token_rejected"),
    contract.classifyError("model_command_route_disabled"),
    "配错令牌与没配令牌归了同一类，运维读不出该设还是该核对",
  );
});

test("真人命令缺会话令牌归身份类，不是参数类", () => {
  // 协调器收到一条真人命令而调用方没说是哪个会话。归 identity 而不是 invalid_request：
  // 后者的处置里 is_defect 为真，而少带会话令牌在正常使用中会发生（浏览器刚重连、
  // 插件被换了宿主），把它记成缺陷会让例行状况变成一条 bug 报告。
  assert.equal(contract.classifyError("web_session_required"), "identity");
  assert.equal(contract.dispositionFor("web_session_required").is_defect, false);
  // 与 web_session_unknown 同类同处置，但保持两个码：一个是「你没说」，一个是
  // 「你说的我不认」，后者可能是会话过期，也可能是有人在猜会话号。
  assert.equal(contract.classifyError("web_session_unknown"), "identity");
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
