// 两独立浏览器 + 两个真实 Connector 对象 + HTTP broker/模型命令面的本地整合。
// 仅发送器与模型推理是明确脚本替身，不调用原生 Codex，不建立公网隧道。
// node test-support/remote-friend-browser-acceptance.mjs <仓库外的新证据目录>
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadPlaywright, describeMissing } = require("./playwright-resolve.cjs");
const { startBeta } = require("../src/run-beta.cjs");
const { MODEL_COMMAND_TOKEN_HEADER } = require("../src/host/table-web-host.cjs");
const { RemoteWakeConnector } = require("../src/host/remote-wake-connector.cjs");
const { readModelConnectionFile } = require("../src/shared/model-connection-file.cjs");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-remote-browser-")));
const relative = path.relative(root, output);
assert.ok(relative !== "" && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)), "证据目录必须在仓库外");
fs.mkdirSync(output, { recursive: true });
assert.ok(!fs.existsSync(path.join(output, "report.json")), "使用新证据目录，不能复用旧通过报告");
const began = performance.now();
const report = { schema: "tokengame.remote-friend-browser.v1", environment: "loopback-two-scripted-ai",
  native_model_calls: 0, native_queue_calls: 0, public_tunnel_calls: 0,
  completed: false, passed: false, checks: [], errors: [], screenshots: [], cleanup: [] };
const players = [];
let browser;
let runtime;
let privateDirectory;
const check = (name, value) => {
  report.checks.push({ name, passed: Boolean(value) });
  assert.ok(value, name);
};
const sample = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function until(predicate, label, duration = 10_000) {
  const end = performance.now() + duration;
  while (performance.now() < end) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error(`未观察到：${label}`);
}
async function settings(page) {
  await page.locator("#nav-settings").click();
  const panel = page.locator("#model-connection-panel");
  if (!(await panel.evaluate((element) => element.open))) await panel.locator("summary").click();
}
async function model(connection, command, params) {
  const response = await fetch(`${connection.origin}/api/model/command`, {
    method: "POST", headers: { "content-type": "application/json", [MODEL_COMMAND_TOKEN_HEADER]: connection.token },
    body: JSON.stringify(requestEnvelope(command, params)), redirect: "error", signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.ok, `脚本模型命令未成功：${command}`);
  return body.result;
}
async function cleanup(name, operation) {
  try { await operation(); report.cleanup.push({ name, passed: true }); }
  catch { report.cleanup.push({ name, passed: false }); }
}

try {
  const playwright = loadPlaywright();
  assert.ok(playwright, describeMissing());
  // 复用产品启动入口，包括权威到期驱动；单独创建 TableWebHost 不会推进 Ready 倒计时。
  // 不注入时钟、特权发牌或另一套协调器。
  runtime = await startBeta({ env: { TOKENGAME_WEB_PORT: "0", TOKENGAME_REMOTE_WAKE: "1" } });
  const origin = runtime.origin;
  check("产品入口拥有唯一到期驱动且已启用远程传输", runtime.banner.due_work_owned_here === true
    && runtime.banner.remote_wake_connector === "available");
  privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-remote-browser-private-"));
  browser = await playwright.chromium.launch({ headless: true });
  for (const name of ["friend_a", "friend_b"]) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 800 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    page.on("pageerror", () => report.errors.push({ player: name, kind: "pageerror" }));
    page.on("console", (message) => { if (message.type() === "error") report.errors.push({ player: name, kind: "console" }); });
    page.on("requestfailed", (request) => {
      const route = new URL(request.url()).pathname;
      if (["/api/view", "/api/session/disconnect"].includes(route) && request.failure()?.errorText === "net::ERR_ABORTED") return;
      report.errors.push({ player: name, kind: "network", route });
    });
    const player = { name, context, page, threadId: randomUUID(), controller: new AbortController(), queueCalls: 0 };
    players.push(player);
    await page.goto(origin);
    if (players.length === 1) {
      await page.locator("#create-player").fill(name);
      await page.locator("#create-form button[type='submit']").click();
    } else {
      await page.locator("#join-player").fill(name);
      await page.locator("#join-code").fill(await players[0].page.locator("#invite-code").innerText());
      await page.locator("#join-form button[type='submit']").click();
    }
    await page.locator("#scope-accept").click();
    await until(async () => (await sample(page)).seats.some((seat) => seat.is_viewer), "本人已落座");
    player.seatId = (await sample(page)).seats.find((seat) => seat.is_viewer).seat_id;
    await settings(page);
    await page.locator("#model-consent").check();
    const downloadReady = page.waitForEvent("download");
    await page.locator("#model-bind-download").click();
    const download = await downloadReady;
    player.file = path.join(privateDirectory, `${name}.json`);
    await download.saveAs(player.file);
    player.connection = readModelConnectionFile(player.file);
    await until(async () => (await sample(page)).model_connection?.status === "bound"
      || await page.locator("#model-unbind").isEnabled(), "本席授权下载生效");
    check(`${name} 未接 Connector 时不得开窗`, await page.locator("#modelWakeStart").isDisabled());
    await page.locator("#nav-game").click();
  }
  const firstRoom = (await sample(players[0].page)).room.room_id;
  check("两页为不同玩家的同一房间", typeof firstRoom === "string" && firstRoom.length > 0
    && players.every((player) => typeof player.seatId === "string" && player.seatId.length > 0)
    && players[0].seatId !== players[1].seatId && firstRoom === (await sample(players[1].page)).room.room_id);
  for (const player of players) {
    player.run = new RemoteWakeConnector({ connectionFile: player.file, threadId: player.threadId,
      maxNotifications: 1, maxDurationMs: 45_000, pollMs: 400, retryMs: 10 }, {
      wakeQueue: async ({ threadId, intentId }) => {
        player.queueCalls += 1;
        assert.ok(threadId === player.threadId, "仅本机发送器接收对应的原生任务 ID");
        const start = await model(player.connection, "ai.start", { intent_id: intentId });
        assert.ok(start.model_context.seat_id === player.seatId, "本席上下文不能错配");
        await model(player.connection, "ai.resolve", { turn_id: start.started.turn_id, decision: "public_speech",
          text: `${player.name} 的 AI：本地脚本连通测试发言，不是真实模型推理。` });
        return { queued: true, attempted: true, cleanup_ok: true, reason: null };
      },
    }).run({ signal: player.controller.signal });
  }
  for (const player of players) {
    await settings(player.page);
    await until(async () => (await sample(player.page)).model_wake?.target_configured === true, "远程连接器投影已接入");
    check(`${player.name} 目标固定且不显示任务输入`, await player.page.locator("#modelWakeTaskId").isDisabled()
      && !(await player.page.locator("#modelWakeTaskField").isVisible()));
    check(`${player.name} 注册不等于本人已同意通知`, await player.page.locator("#modelWakeStart").isDisabled());
    await player.page.locator("#nav-game").click();
    await player.page.locator("#ready-toggle").click();
  }
  await until(async () => (await sample(players[0].page)).room.hand_index === 1, "正常 Ready 后开始第一手");
  for (const player of players) {
    await settings(player.page);
    await player.page.locator("#modelWakeMaxNotifications").fill("1");
    await player.page.locator("#modelWakeDurationSeconds").fill("60");
    await player.page.locator("#modelWakeConsent").check();
    await player.page.locator("#modelWakeStart").click();
    await player.page.locator("#nav-game").click();
  }
  await players[0].page.locator("#say-text").fill("两席连接完成，正常打一手；这条真人测试消息全桌可见。");
  await players[0].page.locator("#say-submit").click();
  for (const player of players) {
    await until(async () => {
      const messages = (await sample(player.page)).messages;
      return players.every((other) => messages.some((message) => message.text?.startsWith(`${other.name} 的 AI：`)));
    }, "两席脚本 AI 的公开消息在双方页面可见");
    const snapshot = await sample(player.page);
    check(`${player.name} 游戏/配置往返保留本人席位`, snapshot.seats.find((seat) => seat.is_viewer)?.seat_id === player.seatId);
    check(`${player.name} 两席气泡有明确 AI 归属`, await player.page.locator("#seats .seat-bubble[data-speaker='SEAT_AI']").count() >= 2);
    const safe = await player.page.evaluate(({ ids, tokens }) => {
      const dom = document.documentElement.innerHTML;
      const storage = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });
      return ids.every((id) => !dom.includes(id) && !storage.includes(id))
        && tokens.every((token) => !dom.includes(token) && !storage.includes(token));
    }, { ids: players.map((entry) => entry.threadId), tokens: players.map((entry) => entry.connection.token) });
    check(`${player.name} 页面和存储不含原生任务 ID / 模型令牌`, safe);
    await player.page.evaluate(() => window.scrollTo(0, 0));
    const filename = `${player.name}-active-hand.png`;
    await player.page.screenshot({ path: path.join(output, filename), fullPage: true });
    report.screenshots.push(filename);
  }
  const outcomes = await Promise.all(players.map((player) => player.run));
  check("两席各一次发送尝试与 ACK，无重复 queue", players.every((player) => player.queueCalls === 1)
    && outcomes.every((result) => result.acks_confirmed === 1 && result.queue_accepted === 1));
  for (const player of players) {
    const fold = player.page.getByRole("button", { name: "弃牌", exact: true });
    if (await fold.isVisible()) { await fold.click(); break; }
  }
  await until(async () => (await sample(players[0].page)).room.hand_index >= 2, "真人合法动作后正常进入下一手");
  check("加入远程传输没有阻断正常扑克下一手", (await sample(players[0].page)).room.hand_index >= 2);
  await players[1].page.reload();
  await until(async () => (await sample(players[1].page)).seats.some((seat) => seat.is_viewer && seat.seat_id === players[1].seatId), "刷新恢复原席");
  check("原浏览器恢复后仍保留公开聊天", (await sample(players[1].page)).messages.some((message) => message.text?.includes("真人测试消息")));
  for (const player of players) {
    await settings(player.page);
    await player.page.locator("#model-unbind").click();
    await until(async () => await player.page.locator("#model-unbind").isDisabled(), "本人撤权完成");
  }
  check("整合期间没有意外浏览器错误", report.errors.length === 0);
  report.completed = true;
} catch (error) {
  report.failure = typeof error?.message === "string" ? error.message : "unknown";
  for (const player of players) {
    try {
      const filename = `${player.name}-failure.png`;
      await player.page.screenshot({ path: path.join(output, filename), fullPage: true });
      report.screenshots.push(filename);
    } catch { /* 截图失败不得覆盖原失败，也不伪造截图记录。 */ }
  }
} finally {
  players.forEach((player) => player.controller.abort());
  for (const player of players) if (player.run) await cleanup(`${player.name} Connector`, async () => {
    assert.equal((await player.run).cleanup_ok, true);
  });
  for (const player of players) await cleanup(`${player.name} 浏览器`, () => player.context.close());
  if (browser) await cleanup("浏览器进程", () => browser.close());
  if (runtime) await cleanup("回环服务与权威到期驱动", () => runtime.close());
  if (privateDirectory) await cleanup("本批私有下载", () => {
    for (const player of players) if (player.file && fs.existsSync(player.file)) fs.unlinkSync(player.file);
    fs.rmdirSync(privateDirectory); // 只移除本脚本创建的空目录，不递归删除未知内容。
  });
  report.duration_ms = performance.now() - began;
  report.passed = report.completed && report.checks.length >= 15 && report.checks.every((entry) => entry.passed)
    && report.errors.length === 0 && report.cleanup.length > 0 && report.cleanup.every((entry) => entry.passed);
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.passed ? 0 : 1;
}
