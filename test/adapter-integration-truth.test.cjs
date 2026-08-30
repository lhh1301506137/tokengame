"use strict";

// 「网关 call」与「推理运行时 evaluate」是两件事，文档必须分开说（C.3）。
//
// 仓库里有两个东西都被叫过「模型适配器」，而它们的接口、方向、接入状态全都不同：
//
//   1. 模型命令网关：SeatModelAdapter.call(command, params) / ModelCommandSurface.call。
//      方向是**模型 → 权威**：模型发 ai.take_intents / ai.start / ai.resolve /
//      view.projection。它是 MCP 工具背后的那一层。
//
//   2. 模型推理运行时：modelAdapter.evaluate({seat_id, turn_id, context}) → decision。
//      方向是**权威 → 模型**：协调器问「你这一席现在说什么」。
//      src/host/table-web-host.cjs 的 driveOnce 调它。
//
// 两者的接入状态不一样，而这正是这个文件要钉的：
//
//   evaluate 这个接口**已经接进运行路径**（driveOnce 真的调它），但唯一的实现是
//     test-support/scripted-model-adapter.cjs，自报 simulated:true。所以能说的是
//     「接口已接入，实现是模拟的」，不能说「真实模型集成完成」。
//
//   SeatModelAdapter **没有接进任何运行路径**。plugins/tokengame/mcp/server.cjs 直接
//     构造 ModelCommandSurface，一次都没有构造 SeatModelAdapter。所以它是**参考实现**：
//     它过一致性套件，这是真的；它在产品里跑着，这是假的。
//
// 为什么要有测试而不是只在文档里写清楚：这两句话的差别恰好是「读者以为 Gate 5 快了」
// 与「读者知道 Gate 5 一步都没走」的差别，而文档会漂，接线会变。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

// 去掉注释。注释里出现 new SeatModelAdapter 不算接线。
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

// 运行路径 = 从入口能到达的产品代码。test/ 与 test-support/ 不算。
const RUN_PATH_FILES = [
  ["src", "run-table-web.cjs"],
  ["src", "run-table-core.cjs"],
  ["src", "run-probe.cjs"],
  ["src", "host", "table-web-host.cjs"],
  ["src", "host", "core-client.cjs"],
  ["src", "authority", "command-server.cjs"],
  ["plugins", "tokengame", "mcp", "server.cjs"],
];

test("SeatModelAdapter 没有接进任何运行路径——它是参考实现", () => {
  const constructed = RUN_PATH_FILES.filter(
    (parts) => /new\s+SeatModelAdapter\b/.test(code(read(...parts))));
  assert.deepEqual(constructed.map((p) => p.join("/")), [],
    "如果它真的接进了运行路径，这条断言就该改成正向断言，"
    + "同时把文档里的「参考实现」改成「已接入」——两件事要一起做");
});

// 真人侧同一句话。写成一条测试而不是只写在提交信息与计划树里：一句「零个构造点」放在散文
// 里，下一次有人真的接上它时不会有任何东西变红，于是文档继续说「参考实现」而代码已经是
// 产品路径——本轮反复在修的正是这类「说的与做的对不上，而没有任何东西对账」。
test("HostCommandAdapter 也没有接进任何运行路径——它同样是参考实现", () => {
  const constructed = RUN_PATH_FILES.filter(
    (parts) => /new\s+HostCommandAdapter\b/.test(code(read(...parts))));
  assert.deepEqual(constructed.map((p) => p.join("/")), [],
    "如果它真的接进了运行路径，这条断言就该改成正向断言，"
    + "同时把提交信息与计划树里的「参考实现」改成「已接入」——两件事要一起做");
});

test("TableWebHost 仍直接持有 custody 与 core，没有改成经 HostCommandAdapter 走", () => {
  // 上一条的正面。少了这一条，上一条读起来像「真人面根本没有实现」，而那是错的：
  // 真人面的产品实现就是 TableWebHost 自己，参考适配器与它并存。
  const host = code(read("src", "host", "table-web-host.cjs"));
  assert.match(host, /new SeatCustody\(/, "牌桌应当自己持有托管层");
  assert.match(host, /this\.custody\.inject\(/, "牌桌应当自己调托管层的注入");
  assert.doesNotMatch(host, /HostCommandAdapter/);
});

test("协调器直接持有 ModelCommandSurface，绕过 SeatModelAdapter", () => {
  // 这一条是上一条的正面：不是「谁都没接」，而是「接的是更下面那一层」。
  // 少了这一条，上一条读起来像「模型网关根本没人用」，而那是错的。
  //
  // 构造点在 B6 收敛时从 MCP 进程搬到了协调器，而这不是搬家：此前 MCP 进程那份
  // ModelCommandSurface 配的是它自己的 SeatCustody，而往那份托管里 bind 句柄的唯一入口
  // 有零个产品调用者——于是它扇出到零席，模型一个席位也驱动不了。现在它与真人命令共用
  // 同一份托管，而 MCP 进程降级为一条 stdio 到 HTTP 的转运。
  const host = code(read("src", "host", "table-web-host.cjs"));
  assert.match(host, /new ModelCommandSurface\(/,
    "协调器应当直接构造 ModelCommandSurface");
  assert.doesNotMatch(host, /new SeatModelAdapter\(/);

  // MCP 进程那一侧的反面：它不该再持有托管或模型命令面。持有等于又有了第二份，
  // 而第二份的表现是「模型照样能调工具，只是永远收到空意图」。
  const server = code(read("plugins", "tokengame", "mcp", "server.cjs"));
  assert.doesNotMatch(server, /new\s+SeatCustody\s*\(/,
    "MCP 进程自持托管等于模型永远扇出到零席");
  assert.doesNotMatch(server, /new\s+ModelCommandSurface\s*\(/,
    "模型命令面必须在协调器里，与真人命令共用同一份托管");
});

test("evaluate 这个接口已经接进运行路径", () => {
  const host = code(read("src", "host", "table-web-host.cjs"));
  assert.match(host, /this\.modelAdapter\.evaluate\(/,
    "协调器的到期驱动应当调用 modelAdapter.evaluate");
  const entry = code(read("src", "run-table-web.cjs"));
  assert.match(entry, /typeof adapter\?\.evaluate !== "function"/,
    "入口应当在装载时就检查 evaluate 存在，而不是等第一次调用");
});

test("唯一的 evaluate 实现自报模拟，且不可被环境变量翻成 false", () => {
  const scripted = read("test-support", "scripted-model-adapter.cjs");
  assert.match(scripted, /simulated:\s*true/,
    "脚本适配器必须自报 simulated:true");
  // 硬编码 true，不是从配置读。可覆盖的话，一次配置失误就会让证据看起来像实机。
  //
  // 逐个匹配再检查值，不用 /simulated:\s*(?!true)/ 那种否定式：`\s*` 会回退成零宽，
  // 于是 (?!true) 面对 " true" 也成立，那条断言对任何写法都通过。
  const assignments = [...code(scripted).matchAll(/simulated:\s*([^,\n}]+)/g)]
    .map((match) => match[1].trim());
  assert.ok(assignments.length > 0, "找不到 simulated 的赋值");
  assert.deepEqual(assignments.filter((value) => value !== "true"), [],
    "simulated 必须是硬编码的 true，不能从环境或参数读");
});

test("产品代码里没有第二个 evaluate 实现冒充真实模型", () => {
  // 只有一个实现这件事本身要被盯住：将来真加了实机适配器，这条会红，
  // 而那时该做的是把文档里的「实现是模拟的」一起改掉。
  const candidates = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".cjs")) candidates.push(full);
    }
  };
  walk(path.join(ROOT, "src"));
  const withEvaluate = candidates.filter((file) => {
    const source = code(fs.readFileSync(file, "utf8"));
    // 定义一个 evaluate 方法（不是调用它，也不是 evaluateStart / evaluateBest 这些同名前缀）
    return /(?:^|\s)(?:async\s+)?evaluate\s*\(/.test(source)
      && !/evaluateStart|evaluateBest|evaluateFive/.test(source.match(
        /(?:^|\s)(?:async\s+)?evaluate\w*\s*\(/g)?.join(" ") ?? "");
  });
  assert.deepEqual(withEvaluate.map((f) => path.relative(ROOT, f)), [],
    "src/ 下不该有 evaluate 的实现——唯一实现在 test-support/scripted-model-adapter.cjs "
    + "且自报模拟。这里出现文件说明加了真实模型接入，那时文档里「实现是模拟的」要一起改");
});

test("文档把网关与推理运行时分开说，且不把参考实现写成已集成", () => {
  const doc = read("docs", "HOST-ADAPTER-CONTRACT.md");
  // 两个概念都要出现，并且要说清哪个接了哪个没接。
  assert.match(doc, /模型命令网关/, "文档要点名「模型命令网关」");
  assert.match(doc, /推理运行时/, "文档要点名「推理运行时」");
  assert.match(doc, /参考实现/, "没接进运行路径的那个只能叫参考实现");
  // 声称过头的说法只在**状态表**里查，不在全文查。
  //
  // 全文查过不去，而且是因为一个真实的原因：正文要解释这份文档之前写错了什么，
  // 于是必须引用那句错话。我先写了全文禁串，被自己的两句解释各触发一次——
  // 子串禁令分不清「引用」与「声称」。
  //
  // 状态表是声称真正发生的地方（读者扫表决定「这个能做了吗」），所以判据落在那里。
  // 这比全文禁串强：它查的是声称面，而不是「这几个字有没有出现过」。
  const table = doc.slice(doc.indexOf("## 本轮实现到哪一步"), doc.indexOf("## 模型命令网关"));
  assert.ok(table.length > 100, "找不到状态表");
  for (const forbidden of ["真实集成完成", "真实模型集成已完成", "已完成真实集成",
    "已实现真实适配器"]) {
    assert.ok(table.includes(forbidden) === false,
      `状态表里出现了「${forbidden}」，而 Gate 5 一步都没走`);
  }
  // 状态表必须点明网关侧没接线。少了这句，读者扫表会把「过一致性套件」读成「在跑」。
  assert.match(table, /没有接进任何运行路径|未接线/,
    "状态表要写明 SeatModelAdapter 没有接进运行路径");
});
