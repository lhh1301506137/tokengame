"use strict";

// 浏览器牌桌的进程入口。
//
// 两种形态，由环境变量决定，默认第一种：
//
//   1. 自带内核（默认）——本进程内构造 CommandSurface，协调器用 InProcessCoreClient
//      直连。单机一个人开四个窗口试牌桌时最省事，一条命令就够。
//   2. 连远端内核（设 TOKENGAME_COMMAND_ORIGIN）——协调器用 HttpCoreClient 连一个
//      已经跑着的 `npm run core`。这条形态才是产品形态：内核在自己的进程里，
//      协调器只是它的客户端，跟将来的 Codex / Claude 适配器地位相同。
//
// 两种都要能跑，而且行为必须一致。只留第一种等于默认「宿主嵌内核」，而 L0 要否定的
// 正是那个形态；只留第二种则让本地试一次牌桌要开两个终端。测试对两种传输各跑一遍
// 同一批断言（test/table-web-host.test.cjs），所以这里的分支不是没有约束的选择。
//
// 三条自我约束，与 run-table-core.cjs 一致：
//   1. 不新增产品语义。读环境变量、起服务、装信号处理、打印一行事实。
//   2. 不发明鉴权。对外监听由协调器自己拒绝，这里不提供绕过它的参数。
//   3. 不冒充模型能力。没有 --model-adapter 就是没有适配器，视图会如实说未接入。

const path = require("node:path");
const crypto = require("node:crypto");

const { CommandSurface } = require("./authority/command-surface.cjs");
const { createDueWorkDriver } = require("./authority/due-work.cjs");
const {
  DEFAULT_AUTHORITY_TOKEN,
} = require("./authority/command-server.cjs");
const { HttpCoreClient, InProcessCoreClient } = require("./host/core-client.cjs");
const { TableWebHost } = require("./host/table-web-host.cjs");
const { seededDeckFactory } = require("./game/seeded-random.cjs");

// 确定性发牌。只给自动化验收用，为的是让「关键牌局分支」不随机漂移：全下被跟之后短码
// 到底破不破产取决于摊牌，而那一条分支决定两条断言在不在，于是项数在 200/201 之间跳。
// 一条看牌运气的覆盖比没有覆盖更坏——它会教人重跑到绿。
//
// 这不是特权动作后门：种子只决定牌怎么洗，不放宽任何一条命令的授权，也不多给任何人
// 一张牌的可见性（底牌可见性由权威的 view.hand 按席位裁决，与洗牌无关）。
//
// 真正的风险是把种子带进真实对局——牌序可预测，对德扑是致命的。所以三道约束：
//
//   1. 只在自带内核时生效。连远端内核时牌是那边的事，这里读了也没用，
//      读了还会让人以为设了就生效——所以那种组合直接报错停下。
//   2. 只允许回环监听。种子 + 对外监听是危险的那个组合，撞上就拒绝启动，
//      不是打一行警告继续——警告会被忽略，而这件事不能靠人记得。
//   3. 启动时如实报告。一次带种子的运行绝不能长得像正常运行，否则「确定性」这个前提
//      会在某次悄悄丢掉之后仍然被当成成立。验收脚本据此断言。
function readDeckSeed(raw, { commandOrigin, webHost }) {
  if (raw === undefined || raw === "") return null;
  if (commandOrigin !== "") {
    throw new Error(
      "TOKENGAME_DECK_SEED 只在自带内核时有效。已设 TOKENGAME_COMMAND_ORIGIN，"
      + "牌由那个内核发，这里的种子不会生效——所以直接停下，而不是假装设上了。");
  }
  const loopback = ["127.0.0.1", "::1", "localhost"];
  if (!loopback.includes(webHost)) {
    throw new Error(
      `TOKENGAME_DECK_SEED 只允许回环监听，当前 TOKENGAME_WEB_HOST=${webHost}。`
      + "确定性牌序 + 对外监听意味着任何能连上的人都能预测发牌。");
  }
  return String(raw);
}

function readPort(raw, name) {
  if (raw === undefined || raw === "") return 0;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${name} 不是合法端口: ${JSON.stringify(raw)}`);
  }
  return port;
}

// 模型适配器按需加载。路径由环境变量给出，加载失败就直接停——静默回落到「没有适配器」
// 会让人以为 AI 是在沉默，而其实是本机根本没加载上那个文件。
function loadAdapter(spec) {
  if (spec === undefined || spec === "") return null;
  const resolved = path.isAbsolute(spec) ? spec : path.resolve(process.cwd(), spec);
  const loaded = require(resolved);
  const adapter = typeof loaded === "function" ? loaded() : (loaded.adapter ?? loaded);
  if (typeof adapter?.evaluate !== "function") {
    throw new Error(`模型适配器 ${spec} 没有 evaluate 方法`);
  }
  return adapter;
}

async function main() {
  const webPort = readPort(process.env.TOKENGAME_WEB_PORT, "TOKENGAME_WEB_PORT");
  const webHost = process.env.TOKENGAME_WEB_HOST || "127.0.0.1";
  const commandOrigin = process.env.TOKENGAME_COMMAND_ORIGIN || "";
  const adapter = loadAdapter(process.env.TOKENGAME_MODEL_ADAPTER);
  const deckSeed = readDeckSeed(process.env.TOKENGAME_DECK_SEED, { commandOrigin, webHost });

  let core;
  let ownedDueWork = null;
  if (commandOrigin !== "") {
    core = new HttpCoreClient({
      origin: commandOrigin,
      token: process.env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN,
    });
  } else {
    // 每手发牌各调一次 deckFactory，而随机源要跨手连续——每手都从种子重建的话，
    // 每一手都发同一副牌，那不是确定性，那是复读。
    const surface = new CommandSurface(deckSeed === null ? {} : {
      deckFactory: seededDeckFactory(deckSeed),
    });
    core = new InProcessCoreClient({ surface });
    // 自带内核时到期驱动必须由本进程跑：Ready 倒计时、行动截止、120 秒保留窗都不能
    // 依赖有没有客户端在轮询。连远端内核时那边自己在跑，这里不能再跑一份——两份驱动
    // 会让同一个到期事件被处理两次。
    ownedDueWork = createDueWorkDriver({
      orchestrator: surface.orchestrator,
      onError: (error) => {
        process.stderr.write(`[due-work] tick 失败: ${error.code || error.message}\n`);
      },
    });
    ownedDueWork.start();
  }

  const host = new TableWebHost({ core, modelAdapter: adapter });
  const origin = await host.start({ host: webHost, port: webPort });

  process.stdout.write(`${JSON.stringify({
    service: "tokengame-table-web",
    origin,
    core_transport: core.transport,
    core_origin: commandOrigin === "" ? "in_process" : commandOrigin,
    due_work_owned_here: ownedDueWork !== null,
    // 如实报告适配器状态。没有就是没有。
    model_adapter: adapter === null ? null : {
      label: adapter.label ?? "unnamed-adapter",
      simulated: adapter.simulated !== false,
    },
    // 确定性发牌必须在启动那一行就说出来。一次带种子的运行绝不能长得像正常运行。
    // 报的是「有没有种子」和它的指纹，不是种子原文——原文进日志之后，
    // 任何读到日志的人都能预测这一桌的发牌。
    deterministic_deck: deckSeed === null ? null : {
      seed_fingerprint: crypto.createHash("sha256").update(deckSeed).digest("hex").slice(0, 12),
      why: "自动化验收要可重复的牌序；仅回环监听，仅自带内核",
    },
  })}\n`);
  if (deckSeed !== null) {
    // 除了 JSON 再打一行人话。JSON 那行是给脚本读的，这一行是给人读的——
    // 一个人手动开了牌桌又忘了自己设过种子，看到的应当是一句话，不是一个字段。
    process.stderr.write(
      "[确定性发牌] 本进程按固定种子洗牌，牌序可预测。仅供自动化验收，不要用于真实对局。\n");
  }
  process.stdout.write(`在浏览器打开 ${origin} ，多开几个窗口就是多个玩家。\n`);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    process.stderr.write(`\n[${signal}] 正在关停…\n`);
    try {
      if (ownedDueWork !== null) ownedDueWork.stop();
      await host.stop();
      process.stderr.write("[shutdown] 端口已释放，定时器已停。\n");
      process.exit(0);
    } catch (error) {
      process.stderr.write(`[shutdown] 关停失败: ${error.message}\n`);
      process.exit(1);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => { void shutdown(signal); });
  }
}

main().catch((error) => {
  process.stderr.write(`[fatal] ${error.code || "startup_failed"}: ${error.message}\n`);
  if (error.details !== undefined) {
    process.stderr.write(`[fatal] details=${JSON.stringify(error.details)}\n`);
  }
  process.exit(1);
});
