"use strict";

// 本地私人房原型入口。开启真人逐席 AI 绑定，不生成“任何模型都能控制整桌”的共用令牌。
// 仍仅监听回环，不安装插件、不修改宿主配置、不声称真实宿主或主动唤醒已验证。

const path = require("node:path");

const { CommandSurface } = require("./authority/command-surface.cjs");
const { createDueWorkDriver } = require("./authority/due-work.cjs");
const { DEFAULT_AUTHORITY_TOKEN } = require("./authority/command-server.cjs");
const { HttpCoreClient, InProcessCoreClient } = require("./host/core-client.cjs");
const { TableWebHost } = require("./host/table-web-host.cjs");
const { createAiLifecycleReceipts } = require("./host/ai-lifecycle-receipts.cjs");
const { loadCodexWakeQueue } = require("./host/codex-queue-sender.cjs");
const { DEFAULT_TABLE_PORT } = require("./shared/endpoints.cjs");

// 只有 fork/spawn 时继承的 Node IPC 可送达；不增加 HTTP 或模型可用的关停能力。
const BETA_SHUTDOWN_MESSAGE = Object.freeze({ schema: "tokengame.beta-control.v1", command: "shutdown" });
const SHUTDOWN_TIMEOUT_MS = 5_000;

// 端口默认取约定端口，不取 0。
//
// 这一条与 `npm run web` 不同，理由是内测的形态不同：连接文件带着本次 origin，随机端口
// 每次重启都变会迫使所有席位重新下载，即使牌桌只是同进程恢复。约定端口也让手工兼容入口
// 的默认值保持可用；项目 MCP 自身不再因换席而改配置。
//
// 端口被占用时直接失败而不是回落到随机口：回落之后人的宿主配置指向的是上一次那个端口，
// 表现是「模型说连不上牌桌，而牌桌明明开着」。宁可停下来说清楚。
function readPort(raw, name, fallback = 0) {
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${name} 不是合法端口: ${JSON.stringify(raw)}`);
  }
  return port;
}

function joinInstructions({ origin, adapter, banner }) {
  return [
    "",
    "———— 本地私人房原型已启动 ————",
    "",
    `牌桌地址：${origin}`,
    "仅供本机隔离浏览器/宿主测试；此回环地址不能直接发给异地朋友。远程联机尚未开放。",
    "",
    "第一个人（建房）：",
    `  1. 浏览器打开 ${origin}`,
    "  2. 点「创建牌桌」，先确认公开范围，再取得邀请码",
    "  3. 按「我准备好了」",
    "",
    "后面的人（加入，2 到 4 人）：",
    `  1. 浏览器打开 ${origin}`,
    "  2. 在独立浏览器上下文中点「加入牌桌」，填入邀请码并确认公开范围",
    "  3. 按「我准备好了」",
    "",
    "让自己的宿主 AI 在座位旁说话：",
    "  0. 首次按插件 README 的当前宿主接入章节配置项目；新增服务器后可能需要重启一次宿主。",
    "  1. 在自己的牌桌上确认权限，点「下载本席 AI 连接文件」",
    "  2. 由真人运行 npm run connection:activate -- <下载文件的绝对路径>",
    "     文件已经带有本次牌桌地址，不要复制给其他玩家，也不要把内容粘贴到对话。",
    "     原下载文件不会自动删除；确认激活后请自行安全删除。换发无需重启 MCP。",
    "  3. 在宿主里让模型调 tokengame_table 的 ai.take_intents",
    "  4. 可在牌桌上随时撤销；随后运行 npm run connection:clear 清本地活动槽位。",
    "",
    "关于唤醒：固定版本的单席一次通知已验证，持续主动产品尚未验证。",
    banner?.managed_wake === "available"
      ? "有界通知发送器已配置，但尚未启动；必须由本人另行开启最多4次/10分钟的窗口。开启前先让固定目标游戏任务结束当前回复并保持空闲；任务正在运行时，通知可能已接收却不能并发结清。"
      : "有界自动通知默认关闭；当前可由宿主轮询领取 ai.take_intents。",
    "宿主停止运行时可能需要用户发消息或点击继续；这不是持续自主 AI 已验证的证明。",
    "",
    adapter === null
      ? "未挂推理运行时；模型通道有请求也不等于真实模型能力已验证。"
      : `本进程挂了推理运行时 ${adapter.label}${adapter.simulated ? "（模拟，不是真实宿主能力）" : ""}。`,
    "",
    "Ctrl+C 停止。",
    "",
  ].join("\n");
}

// 模型适配器按需加载，与 run-table-web.cjs 同一份判断。内测默认不挂：这一轮要证的是
// 「各人的宿主 AI 在自己座位旁说话」，本进程挂一个脚本运行时会让每张截图都无法区分
// 「宿主真的说话了」与「本机脚本替它说了」。
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

// 可调用入口与 CLI 共用资源归属/清理路径。surface 只供进程内确定性测试注入；没有调试 HTTP 命令。
async function startBeta({ env = process.env, surface: suppliedSurface } = {}) {
  const webPort = readPort(env.TOKENGAME_WEB_PORT, "TOKENGAME_WEB_PORT", DEFAULT_TABLE_PORT);
  const webHost = env.TOKENGAME_WEB_HOST || "127.0.0.1";
  const commandOrigin = env.TOKENGAME_COMMAND_ORIGIN || "";
  const receiptFile = env.TOKENGAME_AI_RECEIPT_FILE;
  // 远程命令客户端看不到 SeatAiStore.onEvent；不能写一个看似完整的空捕获文件。
  if (commandOrigin !== "" && receiptFile !== undefined && receiptFile !== "") {
    throw Object.assign(new Error("ai_receipt_remote_core_unsupported"), {
      code: "ai_receipt_remote_core_unsupported",
    });
  }
  const adapter = loadAdapter(env.TOKENGAME_MODEL_ADAPTER);
  const wakeQueue = loadCodexWakeQueue(env);
  let core;
  let surface = null;
  let ownedDueWork = null;
  let host = null;
  let receipts = null;
  let closePromise = null;
  const close = (options = {}) => {
    if (closePromise !== null) return closePromise;
    closePromise = (async () => {
      if (ownedDueWork !== null) ownedDueWork.stop();
      let hostError = null;
      try { if (host !== null) await host.stop(); } catch (error) { hostError = error; }
      // HTTP 排空期间可能收到父通道断开；在捕获结束前取本次最新原因。
      // 已进入 receipts.close 的事实不再改写，后续故障由进程退出单独报告。
      const reason = options.reason ?? "normal_close";
      const receiptStatus = receipts === null ? null : await receipts.close({
        reason: hostError === null ? reason : "shutdown_failed",
      });
      if (hostError !== null) throw hostError;
      return receiptStatus;
    })();
    return closePromise;
  };

  let origin;
  try {
    if (commandOrigin !== "") {
      core = new HttpCoreClient({
        origin: commandOrigin,
        token: env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN,
      });
    } else {
      surface = suppliedSurface ?? new CommandSurface({});
      core = new InProcessCoreClient({ surface });
      receipts = await createAiLifecycleReceipts({
        store: surface.orchestrator.ai, filePath: receiptFile,
        onWarning: (code) => { process.stderr.write(`[ai-receipts] ${code}\n`); },
      });
      // 自带内核时到期驱动必须由本进程跑；远程内核由那边推进，不能再跑一份。
      ownedDueWork = createDueWorkDriver({
        orchestrator: surface.orchestrator,
        onError: (error) => {
          process.stderr.write(`[due-work] tick 失败: ${error.code || error.message}\n`);
        },
      });
      ownedDueWork.start();
    }
    host = new TableWebHost({ core, modelAdapter: adapter, modelBindingEnabled: true, wakeQueue });
    // 对外监听仍由协调器拒绝；接入回执不复制或绕过这一条门禁。
    origin = await host.start({ host: webHost, port: webPort });
  } catch (error) {
    await close({ reason: "startup_failed" });
    throw error;
  }
  const banner = {
    service: "tokengame-beta",
    origin,
    core_transport: core.transport,
    core_origin: commandOrigin === "" ? "in_process" : commandOrigin,
    due_work_owned_here: ownedDueWork !== null,
    model_command_route: "enabled",
    model_auth: "per_seat_binding",
    // 如实报告。没挂就是没挂。
    model_adapter: adapter === null ? null : {
      label: adapter.label ?? "unnamed-adapter",
      simulated: adapter.simulated !== false,
    },
    // B14仅验证固定版本的一次通知，不能据此开启持续产品能力声明。
    proactive_wake_verified: false,
    managed_wake: wakeQueue === null ? "disabled" : "available",
    wake_fallback: "polling",
  };
  return { origin, banner, adapter, host, surface, receipts, close };
}

function drainOutput(stream) {
  return new Promise((resolve, reject) => {
    let returned = false;
    let accepted = false;
    let callbackDone = false;
    let drained = false;
    const cleanup = () => {
      stream.off("error", fail);
      stream.off("close", fail);
      stream.off("drain", onDrain);
    };
    const check = () => {
      if (returned && callbackDone && (accepted || drained)) { cleanup(); resolve(); }
    };
    const fail = () => { cleanup(); reject(new Error("output_flush_failed")); };
    const onDrain = () => { drained = true; check(); };
    stream.once("error", fail);
    stream.once("close", fail);
    stream.once("drain", onDrain);
    try {
      // 空写是同一 Writable 队列的屏障，须同时等 callback 和必要的 drain。
      accepted = stream.write("", (error) => {
        if (error) { fail(); return; }
        callbackDone = true;
        check();
      });
      returned = true;
      check();
    } catch { fail(); }
  });
}

function disconnectParent() {
  if (!process.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.off("disconnect", done);
      process.off("error", fail);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("ipc_disconnect_failed")); };
    process.once("disconnect", done);
    process.once("error", fail);
    try { process.disconnect(); } catch { fail(); }
  });
}

async function main({ env = process.env } = {}) {
  let starting;
  let closing = false;
  let outputFailed = false;
  let parentDisconnected = false;
  let parentDisconnectExpected = false;
  const closeOptions = { reason: "normal_close" };
  const diagnostic = (text) => {
    try { process.stderr.write(text); } catch { outputFailed = true; }
  };
  const shutdown = async (signal, reason = "normal_close") => {
    if (closing) return;
    closing = true;
    closeOptions.reason = reason;
    process.exitCode = 1;
    let phase = "startup";
    // 保持引用：一个永不返回的 Promise 本身不会阻止 Node 提前退出。
    // 只有这条失败兜底强制退出；正常路径排空输出、断 IPC 后自然退出。
    const timer = setTimeout(() => {
      diagnostic(`[shutdown] ${phase}_timeout\n`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    try {
      const run = await starting;
      phase = "close";
      diagnostic(`\n[${signal}] 正在关停…\n`);
      const receiptStatus = await run.close(closeOptions);
      diagnostic("[shutdown] 端口已释放，定时器已停。\n");
      if (receiptStatus !== null) {
        // 仅启用回执时增加这条白名单收尾记录。离线文件不可能证明自己的写入 ACK/close 成功。
        diagnostic(`${JSON.stringify({ schema: "tokengame.ai-lifecycle-close.v1", ...receiptStatus })}\n`);
        if (!receiptStatus.run_complete) {
          diagnostic(`[ai-receipts] incomplete: ${receiptStatus.stop_reason}\n`);
        }
      }
      if (reason === "normal_close" && !parentDisconnected
          && (receiptStatus === null || receiptStatus.run_complete)) process.exitCode = 0;
    } catch (error) {
      if (phase === "startup") diagnostic(`[fatal] ${error.code || "startup_failed"}\n`);
      else diagnostic("[shutdown] shutdown_failed\n");
    }
    phase = "output_flush";
    const writes = await Promise.allSettled([drainOutput(process.stdout), drainOutput(process.stderr)]);
    if (writes.some((item) => item.status === "rejected")) {
      outputFailed = true;
      diagnostic("[shutdown] output_flush_failed\n");
      await drainOutput(process.stderr).catch(() => {});
    }
    if (outputFailed || parentDisconnected) process.exitCode = 1;
    phase = "ipc_disconnect";
    if (inheritedIpc && !process.connected) onParentDisconnect();
    parentDisconnectExpected = true;
    try { await disconnectParent(); } catch { process.exitCode = 1; }
    clearTimeout(timer);
  };
  const onParentDisconnect = () => {
    if (parentDisconnectExpected || parentDisconnected) return;
    parentDisconnected = true;
    closeOptions.reason = "abnormal_close";
    process.exitCode = 1;
    diagnostic("[shutdown] parent_ipc_disconnected\n");
    void shutdown("IPC_DISCONNECT", "abnormal_close");
  };
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", () => {
      outputFailed = true;
      // 错误可能晚于最后一次排空检查、早于 IPC 断开完成，不能只改局部标记。
      process.exitCode = 1;
      void shutdown("OUTPUT_ERROR", "shutdown_failed");
    });
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => { void shutdown(signal); });
  }
  const inheritedIpc = typeof process.send === "function";
  if (inheritedIpc) {
    process.on("message", (message) => {
      if (message !== null && typeof message === "object" && !Array.isArray(message)
          && Object.keys(message).length === 2
          && Object.hasOwn(message, "schema") && Object.hasOwn(message, "command")
          && message.schema === BETA_SHUTDOWN_MESSAGE.schema && message.command === BETA_SHUTDOWN_MESSAGE.command) {
        void shutdown("IPC");
      }
    });
    process.on("disconnect", onParentDisconnect);
  }
  // 先注册控制入口，避免父进程在异步启动期间断开后留下孤儿服务。
  starting = startBeta({ env });
  if (inheritedIpc && !process.connected) onParentDisconnect();
  try {
    const run = await starting;
    if (!closing) {
      // 启动行给脚本读，不含文件路径或任何权限；逐席令牌仍只由本人认证后下载。
      process.stdout.write(`${JSON.stringify(run.banner)}\n`);
      process.stdout.write(joinInstructions(run));
    }
  } catch {
    await shutdown("STARTUP_FAILURE", "startup_failed");
    return false;
  }
  return true;
}

if (require.main === module) {
  main().then((started) => {
    if (started === false) process.exitCode = 1;
  }, (error) => {
    process.stderr.write(`[fatal] ${error.code || "startup_failed"}: ${error.message}\n`);
    if (error.details !== undefined) {
      process.stderr.write(`[fatal] details=${JSON.stringify(error.details)}\n`);
    }
    process.exit(1);
  });
}

module.exports = { startBeta, main, BETA_SHUTDOWN_MESSAGE };
