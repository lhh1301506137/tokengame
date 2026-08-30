"use strict";

// 朋友私人房内测的启动入口。一条命令。
//
// 它与 `npm run web` 的差别只有一件事，而那件事是 B6 之后新出现的：模型命令口需要一个
// 进程级令牌，`npm run web` 从来不生成它。于是那条路默认关着，而它关着的方式是安静的
// ——牌桌照常能玩，只是没有任何一席的宿主 AI 能说话，而 /api/health 里那行 disabled
// 不会有人主动去看。这个入口存在的全部理由就是把那一步做掉，并把人需要的两个值
// 交到人手上。
//
// 三条自我约束，与 run-table-core.cjs / run-table-web.cjs 一致，外加一条：
//   1. 不新增产品语义。它只生成令牌、起协调器、打印事实。
//   2. 不发明鉴权。对外监听由协调器自己拒绝，这里不提供任何绕过它的参数。
//   3. 不冒充模型能力。没挂适配器就报 null，也不声称主动唤醒。
//   4. 秘密不进终端。人要拿令牌去填宿主配置，所以它落在文件里，终端只说路径。
//      `npm run beta > log.txt` 与一次截屏因此都不含秘密。
//
// 刻意**不做**的事：不写任何宿主的配置文件。令牌怎么进 Codex / Claude Desktop 的注册项
// 是人的决定，替人改全局配置越界了。所以这里打印一段可粘贴的文本，仅此而已。

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { CommandSurface } = require("./authority/command-surface.cjs");
const { createDueWorkDriver } = require("./authority/due-work.cjs");
const { DEFAULT_AUTHORITY_TOKEN } = require("./authority/command-server.cjs");
const { HttpCoreClient, InProcessCoreClient } = require("./host/core-client.cjs");
const { TableWebHost } = require("./host/table-web-host.cjs");
const { DEFAULT_TABLE_ORIGIN, DEFAULT_TABLE_PORT } = require("./shared/endpoints.cjs");

const TOKEN_FILE = "model-token.txt";

// 端口默认取约定端口，不取 0。
//
// 这一条与 `npm run web` 不同，理由是内测的形态不同：随机端口每次重启都变，而人刚把
// TOKENGAME_TABLE_ORIGIN 填进宿主配置里。约定端口让那份配置只填一次，也让没填的人
// 直接就对——MCP 插件的默认值是同一个常量。
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

// 令牌只有两个来源：环境里已经有一个（人自己管着），或者本次现生成一个。
//
// 没有第三种。写一个「本地够用了」的默认值等于本机任何进程都能替这个协调器上所有席位
// 发言——而那正是这道门要挡的东西，一个默认值会让它对每一台装了这个仓库的机器同时失效。
function resolveModelToken(fromEnv) {
  if (typeof fromEnv === "string" && fromEnv !== "") {
    return { token: fromEnv, generated: false };
  }
  // 32 字节 = 64 个十六进制字符。randomBytes 是 CSPRNG；Math.random 在这里是错的答案，
  // 它的种子可预测，而这一串是「替所有席位发言」的凭证。
  return { token: crypto.randomBytes(32).toString("hex"), generated: true };
}

// 令牌落盘。终端只得到路径。
//
// 为什么是文件而不是打印出来：人的下一步是把它粘到宿主配置里，那时人本来就在编辑器里。
// 而打印出来意味着它进了终端回滚缓冲、进了任何一次 `> log.txt`、进了任何一张截屏。
// 两者对「人能不能拿到」没有差别，对「它会不会不小心被带到别处」差别很大。
//
// 权限位只在 POSIX 上有意义。Windows 上 mode 基本被忽略，所以不假装它是一道门——
// 那台机器上的保护是「这个目录在 .gitignore 里，而且只有本机用户能读家目录」。
function writeTokenFile(stateDir, token) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, TOKEN_FILE);
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows 上会失败或无效。不当成错误：这一行是 POSIX 上的加固，不是功能。
  }
  return file;
}

function joinInstructions({ origin, tokenFile, adapter }) {
  return [
    "",
    "———— 朋友私人房内测已启动 ————",
    "",
    `牌桌地址：${origin}`,
    "",
    "第一个人（建房）：",
    `  1. 浏览器打开 ${origin}`,
    "  2. 点「建房」，把页面上显示的邀请码发给朋友",
    "  3. 勾选公开范围确认，然后按 Ready",
    "",
    "后面的人（加入，2 到 4 人）：",
    `  1. 浏览器打开 ${origin}`,
    "  2. 点「加入」，填入邀请码",
    "  3. 勾选公开范围确认，然后按 Ready",
    "",
    "让自己的宿主 AI 在座位旁说话：",
    `  1. 模型令牌在 ${tokenFile}`,
    "  2. 把它填进宿主里 TokenGame MCP 的环境变量：",
    "       TOKENGAME_MODEL_TOKEN=<上面那个文件里的值>",
    origin === DEFAULT_TABLE_ORIGIN
      ? "     牌桌地址不用填：这是约定端口，插件默认就连它。"
      : `       TOKENGAME_TABLE_ORIGIN=${origin}`,
    "  3. 在宿主里让模型调 tokengame_table 的 ai.take_intents",
    "",
    "关于唤醒：没有任何宿主验证过无点击主动唤醒，所以本机不提供它。",
    "模型靠**轮询** ai.take_intents 拿待办；还没有人入座时它会明确回一句",
    "「等真人入座」，而不是静默地空转。需要有人按一下才动的地方就是需要按一下。",
    "",
    adapter === null
      ? "本进程没有挂推理运行时，所以协调器自己不会替任何席位说话——发言全部来自各人宿主里的模型。"
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

async function main() {
  const webPort = readPort(process.env.TOKENGAME_WEB_PORT, "TOKENGAME_WEB_PORT", DEFAULT_TABLE_PORT);
  const webHost = process.env.TOKENGAME_WEB_HOST || "127.0.0.1";
  const commandOrigin = process.env.TOKENGAME_COMMAND_ORIGIN || "";
  const stateDir = process.env.TOKENGAME_BETA_STATE_DIR
    || path.join(__dirname, "..", "artifacts", "beta");
  const adapter = loadAdapter(process.env.TOKENGAME_MODEL_ADAPTER);
  const { token, generated } = resolveModelToken(process.env.TOKENGAME_MODEL_TOKEN);

  let core;
  let ownedDueWork = null;
  if (commandOrigin !== "") {
    core = new HttpCoreClient({
      origin: commandOrigin,
      token: process.env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN,
    });
  } else {
    const surface = new CommandSurface({});
    core = new InProcessCoreClient({ surface });
    // 自带内核时到期驱动必须由本进程跑：Ready 倒计时、行动截止、120 秒保留窗都不能
    // 依赖有没有客户端在轮询。连远端内核时那边自己在跑，这里不能再跑一份。
    ownedDueWork = createDueWorkDriver({
      orchestrator: surface.orchestrator,
      onError: (error) => {
        process.stderr.write(`[due-work] tick 失败: ${error.code || error.message}\n`);
      },
    });
    ownedDueWork.start();
  }

  const host = new TableWebHost({ core, modelAdapter: adapter, modelCommandToken: token });
  // 对外监听在这一步被协调器拒绝（U-TG-LOCAL-BRIDGE-AUTH 未关闭）。刻意不先自己查一遍：
  // 两处各写一遍判断会让「谁说了算」变得不确定，而这道门的权威在协调器里。
  const origin = await host.start({ host: webHost, port: webPort });
  const tokenFile = writeTokenFile(stateDir, token);

  // 启动行给脚本读。绝不含令牌原文——只报它是新生成的还是沿用环境里的、以及它在哪。
  process.stdout.write(`${JSON.stringify({
    service: "tokengame-beta",
    origin,
    core_transport: core.transport,
    core_origin: commandOrigin === "" ? "in_process" : commandOrigin,
    due_work_owned_here: ownedDueWork !== null,
    model_command_route: "enabled",
    model_token_generated: generated,
    model_token_file: path.relative(stateDir, tokenFile) === TOKEN_FILE
      ? TOKEN_FILE
      : tokenFile,
    model_token_dir: stateDir,
    // 如实报告。没挂就是没挂。
    model_adapter: adapter === null ? null : {
      label: adapter.label ?? "unnamed-adapter",
      simulated: adapter.simulated !== false,
    },
    // 主动唤醒在任何宿主上都未经实机验证，所以这里写死 false 而不是省略——省略会让
    // 读的人以为「没提就是有」。
    proactive_wake_verified: false,
    wake_fallback: "polling",
  })}\n`);
  // 人话那一段。路径写全，人要照着去找那个文件。
  process.stdout.write(joinInstructions({ origin, tokenFile, adapter }));

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
