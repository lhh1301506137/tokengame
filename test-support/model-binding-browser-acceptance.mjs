// B8：真实浏览器控件 + 各自连接文件 + 两个真实 MCP stdio 客户端；发言内容是固定测试文本。
// 不调用模型、不改宿主配置，不把 host_seen 当成真实宿主/无点击唤醒证据。
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { loadPlaywright, describeMissing } = require("./playwright-resolve.cjs");
const { startSeatMcp } = require("./mcp-stdio-client.cjs");
const { acceptanceOutcome, cleanupWithEvidence } = require("./model-binding-result.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.resolve(process.argv[2] ?? "artifacts/model-binding-browser");
fs.mkdirSync(artifactDir, { recursive: true });
const began = Date.now();
const resultPath = path.join(artifactDir, "result.json");
// 崩溃/被终止时不能留下上一轮的 passed:true；最终结果仍在 finally 中落盘。
fs.writeFileSync(resultPath, JSON.stringify({ schema: "tokengame.model-binding-browser.v1", passed: false, state: "running" }));
const checks = [];
const errors = [];
const screenshots = [];
const clients = [];
const pages = [];
const modelTokens = [];
let completed = false;
let failure = null;
let browser;
let server;
let privateDir;
function check(name, passed) {
  checks.push({ id: `B8-UI-${checks.length + 1}`, name, passed });
  if (!passed) throw new Error(name);
  process.stdout.write(`[通过] ${name}\n`);
}
function clean(text) {
  let safe = String(text);
  for (const token of modelTokens) safe = safe.split(token).join("[REDACTED_MODEL_TOKEN]");
  return safe;
}
function startBeta() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "src/run-beta.cjs")], {
      cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env, TOKENGAME_WEB_PORT: "0", TOKENGAME_WEB_HOST: "127.0.0.1",
        TOKENGAME_COMMAND_ORIGIN: "", TOKENGAME_MODEL_ADAPTER: "", TOKENGAME_MODEL_TOKEN: "",
        TOKENGAME_MODEL_CONNECTION_FILE: "",
      },
    });
    let output = "";
    let stderr = "";
    const closed = new Promise((done) => child.once("close", done));
    const timer = setTimeout(() => { child.kill(); reject(new Error("beta_start_timeout")); }, 12_000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("beta_start_failed")); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`beta_exited:${code}:${stderr}`));
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const line = output.split("\n").find((item) => item.startsWith("{"));
      if (!line) return;
      let banner;
      try { banner = JSON.parse(line); } catch { return; }
      clearTimeout(timer);
      resolve({ child, closed, banner, output: () => output + stderr });
    });
  });
}
async function pageFor(name) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", (error) => errors.push(`${name}:pageerror:${clean(error.message)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${name}:console:${clean(message.text())}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${name}:http:${response.status()}:${new URL(response.url()).pathname}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText;
    const route = new URL(request.url()).pathname;
    // 刷新时页面会撤回视图请求/发离线 beacon，其余请求失败均进入判定。
    if (reason === "net::ERR_ABORTED" && ["/api/view", "/api/session/disconnect"].includes(route)) return;
    errors.push(`${name}:network:${route}:${reason}`);
  });
  await page.goto(server.banner.origin);
  return page;
}
async function snapshot(page, name) {
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true });
  screenshots.push(name);
}
async function refreshProjection(page) {
  // 只读刷新钩子完成真实 /api/view 与渲染，再独立断言 UI；不等目标文案出现后自证。
  await page.evaluate(() => window.advanceTime(0));
}
async function checkInviteLayout(page, invite, width, phase) {
  const layout = await page.evaluate(() => {
    const code = document.getElementById("invite-code");
    return {
      pageFits: document.documentElement.scrollWidth <= innerWidth && scrollX === 0,
      codeText: code.innerText,
      codeFits: code.scrollWidth <= code.clientWidth + 1 && code.scrollHeight <= code.clientHeight + 1,
      controls: ["invite-wrap", "invite-code", "copy-invite"].map((id) => {
        const node = document.getElementById(id);
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          id,
          visible: style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0,
          inViewport: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
            && rect.right <= innerWidth && rect.bottom <= innerHeight,
        };
      }),
    };
  });
  check(`${width}px 首次入房${phase}页面无横向溢出`, layout.pageFits);
  check(`${width}px 首次入房${phase}邀请码完整可读`, layout.codeText === invite && layout.codeFits);
  check(`${width}px 首次入房${phase}邀请码及复制控件均在可见视口`, layout.controls.length === 3
    && layout.controls.every((control) => control.visible && control.inViewport));
}
async function checkFreshInvite(page, invite) {
  const viewport = page.viewportSize();
  // 只截获测试页的 writeText，验证完整复制语义，不读取或写入系统剪贴板。
  const clipboard = await page.evaluateHandle(() => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const probe = {
      writes: [],
      restore() {
        if (original) Object.defineProperty(navigator, "clipboard", original);
        else delete navigator.clipboard;
      },
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { probe.writes.push(text); } },
    });
    return probe;
  });
  try {
    for (const [index, width] of [390, 320].entries()) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await snapshot(page, `fresh-invite-${width}.png`);
      await checkInviteLayout(page, invite, width, "复制前");
      await page.locator("#copy-invite").click();
      const writes = await clipboard.evaluate((probe) => probe.writes);
      check(`${width}px 复制按钮点击恰好复制一次完整邀请码`, writes.length === index + 1 && writes[index] === invite);
      check(`${width}px 复制按钮显示成功反馈`, await page.locator("#copy-invite").textContent() === "已复制");
      await checkInviteLayout(page, invite, width, "复制后");
    }
  } finally {
    await clipboard.evaluate((probe) => probe.restore());
    await clipboard.dispose();
    await page.setViewportSize(viewport);
  }
}
async function downloadConnection(page, name) {
  await page.locator("#nav-settings").click();
  check(`${name} 未同意时不能下载`, await page.locator("#model-bind-download").isDisabled());
  await page.locator("#model-consent").check();
  const downloadReady = page.waitForEvent("download");
  await page.locator("#model-bind-download").click();
  const download = await downloadReady;
  const file = path.join(privateDir, `${name}.json`);
  await download.saveAs(file);
  const connection = JSON.parse(fs.readFileSync(file, "utf8"));
  check(`${name} 文件只有模型通道配置`, Object.keys(connection).sort().join(",") === "model_token,schema,table_origin"
    && connection.schema === "tokengame.model-connection.v1"
    && connection.table_origin === server.banner.origin && connection.model_token.length >= 32);
  modelTokens.push(connection.model_token);
  await refreshProjection(page);
  check(`${name} 下载后等待宿主而非伪装在线`, await page.locator("#model-connection-state").textContent() === "已授权，等待宿主连接");
  const client = startSeatMcp(file);
  clients.push(client);
  await client.request("initialize", { protocolVersion: "2025-06-18" });
  const read = await client.table("view.projection");
  check(`${name} 私有文件经 stdio 连接同桌`, !read.isError);
  await refreshProjection(page);
  check(`${name} 请求后页面反映 host_seen`, await page.locator("#model-connection-state").textContent() === "已收到本席宿主请求");
  await page.locator("#nav-game").click();
  return client;
}

try {
  const playwright = loadPlaywright();
  if (playwright === null) throw new Error(describeMissing());
  server = await startBeta();
  browser = await playwright.chromium.launch({ headless: true });
  privateDir = fs.mkdtempSync(path.join(artifactDir, "connection-private-"));
  const a = await pageFor("a");
  const b = await pageFor("b");
  await a.locator("#create-player").fill("browser-a");
  await a.locator("#create-form button").click();
  await a.locator("#scope-accept").click();
  await a.locator("#table-main").waitFor({ state: "visible" });
  const invite = await a.locator("#invite-code").textContent();
  check("正常建房并取得邀请码", typeof invite === "string" && invite.length > 4);
  // 刷新恢复不会重新下发邀请码；必须在首次建房、reload 之前覆盖长码布局。
  await checkFreshInvite(a, invite);
  await b.locator("#join-player").fill("browser-b");
  await b.locator("#join-code").fill(invite);
  await b.locator("#join-form button").click();
  await b.locator("#scope-accept").click();
  await b.locator("#table-main").waitFor({ state: "visible" });
  const ca = await downloadConnection(a, "a");
  const cb = await downloadConnection(b, "b");
  check("两席下载的是不同权限", modelTokens[0] !== modelTokens[1]);
  for (const page of [a, b]) await page.locator("#ready-toggle").click();
  await a.waitForFunction(() => JSON.parse(window.render_game_to_text()).hand !== null, undefined, { timeout: 10_000 });
  for (const [index, client] of [ca, cb].entries()) {
    const claim = await client.table("ai.take_intents");
    check(`模型 ${index} 只领本席待办`, !claim.isError && claim.body.result.seats_polled === 1 && claim.body.result.intents.length === 1);
    const start = await client.table("ai.start", { intent_id: claim.body.result.intents[0].intent_id });
    check(`模型 ${index} 取得权威本席上下文`, !start.isError && start.body.result.model_context?.schema === "tokengame.seat-ai-context.v1");
    const reply = await client.table("ai.resolve", {
      turn_id: start.body.result.started.turn_id, decision: "public_speech", text: `浏览器验收 AI-${index}：这一手谨慎一点。`,
    });
    check(`模型 ${index} 发言回同桌`, !reply.isError);
  }
  for (const [index, page] of [a, b].entries()) {
    await refreshProjection(page);
    const seatsText = await page.locator("#seats").textContent();
    check(`玩家 ${index} 在座位旁看到两席 AI 气泡`, seatsText.includes("浏览器验收 AI-0") && seatsText.includes("浏览器验收 AI-1"));
  }
  const before = JSON.parse(await a.evaluate(() => window.render_game_to_text()));
  await snapshot(a, "desktop-bound.png");
  await a.reload();
  await a.locator("#table-main").waitFor({ state: "visible" });
  await refreshProjection(a);
  const after = JSON.parse(await a.evaluate(() => window.render_game_to_text()));
  check("刷新回原席且保留模型绑定", before.seats.find((seat) => seat.is_viewer).seat_id === after.seats.find((seat) => seat.is_viewer).seat_id
    && before.model_connection.binding_id === after.model_connection.binding_id);
  await a.locator("#nav-settings").click();
  await a.setViewportSize({ width: 390, height: 844 });
  await snapshot(a, "narrow-bound.png");
  check("窄屏无横向溢出", await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (const page of [a, b]) {
    const exposed = await page.evaluate(() => JSON.stringify({
      dom: document.documentElement.outerHTML, text: window.render_game_to_text(), url: location.href,
      session: Object.entries(sessionStorage), local: Object.entries(localStorage),
    }));
    for (const token of modelTokens) check("下载权限不进入任一页面、机器视图、URL 或 storage", !exposed.includes(token));
  }
  for (const token of modelTokens) {
    check("MCP stdout/stderr 与 beta 终端不含下载权限", ![...clients.flatMap((c) => c.transcript), ...clients.map((c) => c.stderr()), server.output()].join("\n").includes(token));
  }
  const unboundResponse = a.waitForResponse((response) => new URL(response.url()).pathname === "/api/model/unbind");
  await a.locator("#model-unbind").click();
  const unbound = await unboundResponse;
  check("撤销按钮调用真实本人端点", unbound.status() === 200 && (await unbound.json()).ok === true);
  await refreshProjection(a);
  check("撤销后页面显示未绑定", await a.locator("#model-connection-state").textContent() === "尚未绑定本席 AI");
  check("真人控件撤销后旧文件被拒", (await ca.table("view.projection")).isError);
  check("撤销 A 不影响 B", !(await cb.table("view.projection")).isError);
  await a.locator("#nav-game").click();
  check("撤销后真人仍留在牌桌", await a.locator("#table-main").isVisible());
  await snapshot(a, "narrow-revoked.png");
  check("未宣称无点击唤醒", after.model_connection.proactive_wake_verified === false);
  check("本次浏览器无控制台/意外网络错误", errors.length === 0);
  completed = true;
} catch (error) {
  failure = clean(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  await cleanupWithEvidence([
    ...clients.map((client, index) => [`mcp-${index}`, () => client.stop()]),
    ["browser", () => browser?.close()],
    ["beta", async () => { if (server) { server.child.kill(); await server.closed; } }],
    ["private-files", () => {
      if (!privateDir) return;
      if (path.dirname(path.resolve(privateDir)) !== artifactDir) throw new Error("private_cleanup_out_of_scope");
      fs.rmSync(privateDir, { recursive: true, force: true });
    }],
  ], errors, clean);
  const outcome = acceptanceOutcome({ completed, failure, checks, errors });
  const result = {
    schema: "tokengame.model-binding-browser.v1", started_at: new Date(began).toISOString(),
    duration_ms: Date.now() - began, passed: outcome.passed, state: "finished",
    checks, errors, failure, screenshots, contexts: pages.length, mcp_processes: clients.length,
    real_model: false, real_host_ui: false, proactive_wake_verified: false,
    evidence_boundary: "真实 beta/Chromium/HTTP/MCP stdio；固定测试发言，不是 Codex/Claude Desktop 实机或异地朋友内测。",
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = outcome.exitCode;
  process.stdout.write(`B8_BROWSER=${result.passed ? "PASS" : "FAIL"} checks=${checks.length} duration_ms=${result.duration_ms}\n`);
  if (failure) process.stderr.write(`${failure}\n`);
}
