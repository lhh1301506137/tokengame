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

const { CommandSurface } = require("./authority/command-surface.cjs");
const { createDueWorkDriver } = require("./authority/due-work.cjs");
const {
  DEFAULT_AUTHORITY_TOKEN,
} = require("./authority/command-server.cjs");
const { HttpCoreClient, InProcessCoreClient } = require("./host/core-client.cjs");
const { TableWebHost } = require("./host/table-web-host.cjs");

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

  let core;
  let ownedDueWork = null;
  if (commandOrigin !== "") {
    core = new HttpCoreClient({
      origin: commandOrigin,
      token: process.env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN,
    });
  } else {
    const surface = new CommandSurface();
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
  })}\n`);
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
