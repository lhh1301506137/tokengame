"use strict";

// 宿主中立牌桌核心的进程入口。
//
// 在这个文件之前，命令服务只能被测试进程内构造出来——没有任何办法把它作为一个独立进程跑
// 起来。而两个宿主适配器按设计都只是它的客户端，所以「核心跑不起来」等于两个适配器都没有
// 可连接的对象。这不是便利脚本，是那条架构的最后一段。
//
// 注意这跟 `npm run authority`（src/authority/server.cjs）不是同一个东西：那个是旧探针栈，
// 建立在 TableStore/EventStore 上，配套 web/ 观察页。本文件启动的是 CommandSurface 栈
// （table-orchestrator + room-store + seat-ai-store + holdem），也就是产品方向所在的那个。
// 两者刻意不合并、也不互相顶替：探针栈是已验收的历史证据，改动它会让那批证据失效。
//
// 三条自我约束：
//   1. 不新增产品语义。本文件只做「读环境变量 -> 起服务 -> 装信号处理 -> 打印一行事实」。
//   2. 不发明鉴权。令牌沿用 command-server.cjs 的 x-tokengame-authority-token 约定；
//      U-TG-LOCAL-BRIDGE-AUTH 仍是 open 的专业设计未知项，归 Codex 与专业设计裁定。
//   3. 不放宽发布门禁。非回环地址由 command-server 自己拒绝，这里不提供绕过它的参数。

const {
  createCommandServer,
  AUTHORITY_TOKEN_HEADER,
  DEFAULT_AUTHORITY_TOKEN,
} = require("./authority/command-server.cjs");

// 端口 0 = 让内核挑。默认挑固定端口会在第二个实例上直接 EADDRINUSE，而本地开发经常
// 同时开着一个旧实例；打印出实际端口比钉死一个更有用。
const DEFAULT_PORT = 0;

function readPort(raw) {
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  // 端口非法时必须停下。回落到随机端口会让适配器连到一个它猜不到的地方，
  // 表现成「核心没起来」，而真正的原因是一个拼错的环境变量。
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`TOKENGAME_COMMAND_PORT 不是合法端口: ${JSON.stringify(raw)}`);
  }
  return port;
}

async function main() {
  const port = readPort(process.env.TOKENGAME_COMMAND_PORT);
  const host = process.env.TOKENGAME_COMMAND_HOST || "127.0.0.1";
  const token = process.env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN;

  const service = createCommandServer({
    internalToken: token,
    // 到期驱动保持默认开启。守护进程正是它存在的场合：没有客户端轮询时，
    // Ready 倒计时、行动截止与 120 秒保留窗仍然必须自己走完。
    onDueWorkError: (error) => {
      // 驱动内部已经保证单次 tick 失败不停表。这里只留一行可诊断的痕迹，
      // 不试图「修复」——真错误应该被看见，而不是被这个入口吞掉。
      process.stderr.write(`[due-work] tick 失败: ${error.code || error.message}\n`);
    },
  });

  const origin = await service.start({ host, port });

  // 只打印事实，不打印令牌。令牌可能来自环境变量，写进日志等于泄漏到 shell 历史与
  // 任何收集 stdout 的地方。需要它的调用方自己就持有它。
  process.stdout.write(`${JSON.stringify({
    service: "tokengame-table-core",
    origin,
    auth_header: AUTHORITY_TOKEN_HEADER,
    using_default_token: token === DEFAULT_AUTHORITY_TOKEN,
    due_work_running: service.dueWork.running,
    command_count: service.surface.commandNames().length,
  })}\n`);

  let closing = false;
  const shutdown = async (signal) => {
    // 连按两次 Ctrl+C 不该触发两次关停：closeServer 对已关闭的服务会 reject。
    if (closing) return;
    closing = true;
    process.stderr.write(`\n[${signal}] 正在关停…\n`);
    try {
      // stop() 内部先停表再关端口，顺序在 command-server.cjs 里有测试钉住。
      await service.stop();
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
  // 起不来就必须非零退出。打印 code 而不是 stack：ProbeError 的 code 才是可判定的那个
  // （例如 local_bridge_auth_unresolved），stack 只会把调用方的注意力引到错误的地方。
  process.stderr.write(`[fatal] ${error.code || "startup_failed"}: ${error.message}\n`);
  if (error.details !== undefined) {
    process.stderr.write(`[fatal] details=${JSON.stringify(error.details)}\n`);
  }
  process.exit(1);
});
