import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { loadPlaywright, describeMissing } = require("./playwright-resolve.cjs");
const { createManagedWakeUiFixture } = require("./managed-wake-ui-fixture.cjs");
const { acceptanceOutcome, cleanupWithEvidence } = require("./model-binding-result.cjs");

// 主线程 Browser-first 之后的可复跑补充；不把此脚本称为原生 Codex 证据。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-b16-ui-")));
const relative = path.relative(root, output);
if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
  throw new Error("B16 QA evidence must be outside the repository");
}
fs.mkdirSync(output, { recursive: true });
const began = performance.now();
const report = { schema: "tokengame.managed-wake-browser.v1", environment: "local-scripted-receiver",
  native_model_calls: 0, native_queue_calls: 0, completed: false, failure: null,
  checks: [], errors: [], expected_faults: [], screenshots: [], cleanup: [] };
let fixture;
let browser;
const contexts = [];
let expectedStartAbort = false;
const requests = [];
const responses = [];
const responseTasks = [];
const check = (name, value, evidence) => {
  report.checks.push({ name, passed: Boolean(value), ...(evidence === undefined ? {} : { evidence }) });
  assert.ok(value, name);
};
async function until(predicate, label, timeoutMs = 6_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`未在 ${timeoutMs}ms 内观察到：${label}`);
}
async function wakeState(page, state) {
  await until(async () => await page.locator("#modelWakeControls").getAttribute("data-state") === state, `控件 ${state}`);
}
async function screenshot(page, name, { fullPage = true } = {}) {
  const filename = `${name}.png`;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, filename), fullPage });
  report.screenshots.push(filename);
}
async function openGame(page) {
  await page.locator("#nav-game").click();
  await page.locator("#table-main").waitFor({ state: "visible" });
}
async function openSettings(page) {
  await page.locator("#nav-settings").click();
  await page.locator("#config-main").waitFor({ state: "visible" });
}
async function settingClick(page, id) {
  await openSettings(page);
  await page.locator(`#${id}`).click();
}
async function tableLayout(page, label, expectedSeats) {
  await openGame(page);
  const layout = await page.evaluate(() => {
    const rect = (el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height };
    };
    const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const seats = [...document.querySelectorAll("#seats > .seat")];
    const protectedRects = [".board-area", ".pot", "#actions"].map((selector) => ({
      selector, box: rect(document.querySelector(selector)) }));
    const collisions = [];
    const seatCollisions = [];
    let bubblesWithinSeat = true;
    for (const seat of seats) {
      const seatBox = rect(seat);
      for (const target of protectedRects) {
        if (intersects(seatBox, target.box)) seatCollisions.push({ position: seat.dataset.position,
          target: target.selector });
      }
      for (const bubble of seat.querySelectorAll(".seat-bubble")) {
        const box = rect(bubble);
        if (box.width === 0 || box.height === 0) continue;
        bubblesWithinSeat &&= box.left >= seatBox.left - 1 && box.right <= seatBox.right + 1;
        for (const target of protectedRects) {
          if (intersects(box, target.box)) collisions.push({ position: seat.dataset.position,
            speaker: bubble.dataset.speaker, target: target.selector });
        }
      }
    }
    const machine = JSON.parse(window.render_game_to_text());
    const panel = rect(document.querySelector(".table-panel"));
    const sidebar = rect(document.querySelector(".side-panel"));
    const width = document.documentElement.clientWidth;
    return { width, scrollWidth: document.documentElement.scrollWidth,
      seatCount: seats.length, positions: seats.map((seat) => seat.dataset.position),
      viewerPosition: seats.find((seat) => seat.dataset.viewer === "true")?.dataset.position,
      companionCount: document.querySelectorAll("#seats .ai-avatar").length,
      bubbles: document.querySelectorAll("#seats .seat-bubble").length,
      bubblesWithinSeat, collisions, seatCollisions,
      settingsOpen: !document.querySelector("#config-main").hidden,
      sidebarSeparate: width > 1080 ? sidebar.left >= panel.right - 1 : sidebar.top >= panel.bottom - 1,
      hideControlsVisible: seats.filter((seat) => seat.dataset.viewer !== "true")
        .every((seat) => rect(seat.querySelector(".seat-hide-row")).height > 0),
      boardPresent: protectedRects[0].box.width > 0 && protectedRects[0].box.height > 0,
      machineMatches: machine.ui.surface === "game" && machine.ui.seat_count === seats.length
        && machine.ui.settings_open === false
        && machine.ui.scope_confirmation_open === !document.querySelector("#scope-gate").hidden };
  });
  check(`${label} 席位与机器视图一致`, layout.seatCount === expectedSeats
    && new Set(layout.positions).size === expectedSeats && layout.viewerPosition === "bottom"
    && layout.companionCount === expectedSeats && layout.machineMatches, layout);
  check(`${label} 气泡不遮牌面动作，侧栏不遮主桌`, layout.bubblesWithinSeat
    && layout.collisions.length === 0 && layout.seatCollisions.length === 0
    && layout.sidebarSeparate && layout.hideControlsVisible
    && layout.boardPresent && layout.scrollWidth <= layout.width + 1, layout);
  return layout;
}
async function openPage() {
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ kind: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = { kind: "console", message: message.text() };
    const location = message.location().url;
    const plannedFailure = expectedStartAbort && ((/\/api\/model\/wake\/start$/.test(location)
      && /net::ERR_FAILED/.test(message.text())) || (/\/api\/model\/wake\/status$/.test(location)
        && /404 \(Not Found\)/.test(message.text())));
    if (plannedFailure) report.expected_faults.push(entry);
    else report.errors.push(entry);
  });
  page.on("requestfailed", (request) => {
    const pathname = new URL(request.url()).pathname;
    const error = request.failure()?.errorText ?? "unknown";
    if (["/api/view", "/api/session/disconnect"].includes(pathname) && /ERR_ABORTED/.test(error)) return;
    const entry = { kind: "network", route: pathname, error };
    if (expectedStartAbort && pathname === "/api/model/wake/start") report.expected_faults.push(entry);
    else report.errors.push(entry);
  });
  page.on("request", (request) => {
    const route = new URL(request.url()).pathname;
    if (!/^\/api\/model\/wake\/(?:start|status|stop)$/.test(route)) return;
    const body = request.postDataJSON();
    requests.push({ route, target_configured: fixture.snapshot().target_configured,
      request_id: body.request_id, has_thread_id: Object.hasOwn(body, "thread_id"),
      thread_id_matches_fixture: body.thread_id === fixture.threadId,
      max_notifications: body.max_notifications, max_duration_ms: body.max_duration_ms,
      acknowledged: body.acknowledged }); // 不留会话令牌。
  });
  page.on("response", (response) => {
    const route = new URL(response.url()).pathname;
    if (route !== "/api/view" && !/^\/api\/model\/wake\/(?:start|status|stop)$/.test(route)) return;
    const targetConfigured = fixture.snapshot().target_configured;
    const knownThread = fixture.threadId;
    responseTasks.push((async () => {
      try {
        const payload = await response.json();
        const visible = route === "/api/view" ? payload?.view?.model_wake : payload?.wake ?? payload;
        const serialized = JSON.stringify(visible);
        responses.push({ route, status: response.status(), target_configured: targetConfigured,
          projected_target_configured: visible?.target_configured,
          contains_thread_id: serialized.includes("thread_id"), contains_known_uuid: serialized.includes(knownThread) });
      } catch (error) {
        report.errors.push({ kind: "response-capture", route, message: error.message });
      }
    })());
  });
  await page.goto(fixture.origin, { waitUntil: "networkidle" });
  check("入口标题和非空主区", (await page.title()).includes("TokenGame")
    && await page.locator("#entry-view").isVisible());
  return page;
}
async function start(page, { manualThread = false } = {}) {
  await openSettings(page);
  if (manualThread) await page.locator("#modelWakeTaskId").fill(fixture.threadId);
  await page.locator("#modelWakeMaxNotifications").fill("2");
  await page.locator("#modelWakeDurationSeconds").fill("600");
  await page.locator("#modelWakeConsent").check();
  await page.locator("#modelWakeStart").click();
}
async function say(page, text) {
  await openGame(page);
  await fixture.control({ command: "advance", ms: 5_500 });
  await page.locator("#say-text").fill(text);
  await page.locator("#say-submit").click();
}

try {
  const playwright = loadPlaywright();
  if (playwright === null) throw new Error(`not_run: ${describeMissing()}`);
  fixture = await createManagedWakeUiFixture({ enabled: false });
  browser = await playwright.chromium.launch({ headless: true });
  const disabled = await openPage();
  await disabled.locator("#create-player").fill("b16_ui_disabled");
  await disabled.locator("#create-form button").click();
  await disabled.locator("#scope-accept").click();
  await disabled.locator("#table-main").waitFor({ state: "visible" });
  await openSettings(disabled);
  await fixture.control({ command: "bind", seat: 0 });
  await wakeState(disabled, "unavailable");
  check("未配置发送器，即使绑定也不能开启", !(await disabled.locator("#modelWakeStart").isEnabled())
    && fixture.snapshot().notifications.length === 0);
  await screenshot(disabled, "desktop-default-disabled");
  await disabled.context().close();
  report.disabled_fixture_cleanup = await fixture.stop();

  // 默认夹具仍代表旧手填合同：target_configured 缺失/false 时，页面可编辑并发送显式 UUID。
  fixture = await createManagedWakeUiFixture();
  const manual = await openPage();
  await manual.locator("#create-player").fill("b16_ui_manual_target");
  await manual.locator("#create-form button").click();
  await manual.locator("#scope-accept").click();
  await manual.locator("#table-main").waitFor({ state: "visible" });
  await openSettings(manual);
  await fixture.control({ command: "bind", seat: 0 });
  await wakeState(manual, "idle");
  check("旧手填模式仍显示并启用任务UUID输入", await manual.locator("#modelWakeTaskField").isVisible()
    && await manual.locator("#modelWakeTaskId").isEnabled()
    && !(await manual.locator("#modelWakeFixedTarget").isVisible()));
  await start(manual, { manualThread: true });
  await wakeState(manual, "waiting");
  const manualStart = requests.filter((entry) => entry.route.endsWith("/start")
    && entry.target_configured === false).at(-1);
  check("旧手填模式按旧合同发送thread_id", manualStart?.has_thread_id === true
    && manualStart.thread_id_matches_fixture === true);
  await settingClick(manual, "modelWakeStop");
  await wakeState(manual, "stopped");
  await manual.context().close();
  report.manual_fixture_cleanup = await fixture.stop();

  fixture = await createManagedWakeUiFixture({ fixedTarget: true });
  const fixedStarts = () => requests.filter((entry) => entry.route.endsWith("/start")
    && entry.target_configured === true);
  const a = await openPage();
  await a.locator("#create-player").fill("b16_ui_a");
  await a.locator("#create-form button").click();
  await a.locator("#scope-accept").click();
  await a.locator("#table-main").waitFor({ state: "visible" });
  check("落座后确认遮罩消失", !(await a.locator("#scope-gate").isVisible()));
  const invite = await a.locator("#invite-code").innerText();
  const b = await openPage();
  await b.locator("#join-player").fill("b16_ui_b");
  await b.locator("#join-code").fill(invite);
  await b.locator("#join-form button").click();
  await b.locator("#scope-accept").click();
  await b.locator("#table-main").waitFor({ state: "visible" });
  await until(async () => await a.locator("#seats > .seat").count() === 2, "双席布局");
  const initialLayout = await tableLayout(a, "1365px 双人默认界面", 2);
  check("双人明确对置且本人诊断默认折叠", initialLayout.positions.join(",") === "top,bottom"
    && !initialLayout.settingsOpen);
  await screenshot(a, "desktop-two-friend-default");
  for (const page of [a, b]) await openSettings(page);
  await wakeState(a, "unbound");
  check("未连接时不能开启", !(await a.locator("#modelWakeStart").isEnabled()));
  await fixture.control({ command: "bind", seat: 0 });
  await wakeState(a, "idle");
  check("固定目标模式隐藏并禁用任务UUID输入", !(await a.locator("#modelWakeTaskField").isVisible())
    && await a.locator("#modelWakeTaskId").isDisabled()
    && await a.locator("#modelWakeFixedTarget").isVisible());
  const fixedTargetText = await a.locator("#modelWakeFixedTarget").innerText();
  check("固定目标说明不显示真实UUID", fixedTargetText.includes("UUID不向页面公开")
    && await a.locator("#modelWakeTaskId").inputValue() === ""
    && !(await a.locator("body").innerText()).includes(fixture.threadId));
  check("固定目标说明要求任务先结束当前回复并保持空闲", fixedTargetText.includes("结束当前回复")
    && fixedTargetText.includes("保持空闲") && fixedTargetText.includes("不能并发结清"));
  check("每窗确认同时覆盖目标任务可接收新回合", (await a.locator("label[for='modelWakeConsent']").innerText())
    .includes("已结束当前回复并可接收新回合"));
  await screenshot(a, "desktop-fixed-target-ready");
  const formHandle = await a.locator("#model-bind-form").elementHandle();
  const bindingBeforeNavigation = await a.evaluate(() => JSON.parse(window.render_game_to_text()).model_connection.binding_id);
  const commandsBeforeNavigation = fixture.snapshot().commands.filter((item) => item.command !== "view.projection").length;
  await a.locator("#modelWakeMaxNotifications").fill("1");
  await a.locator("#modelWakeConsent").check();
  await openGame(a);
  check("游戏工作面不展示连接诊断表单", !(await a.locator("#model-bind-form").isVisible())
    && !(await a.locator("#modelWakeForm").isVisible()));
  await openSettings(a);
  check("切换工作面保留同一连接DOM、参数与本人授权", await a.evaluate((original) => original === document.querySelector("#model-bind-form"), formHandle)
    && await a.locator("#modelWakeMaxNotifications").inputValue() === "1"
    && await a.locator("#modelWakeConsent").isChecked());
  check("切换工作面不离席、不重绑、不发权威命令", bindingBeforeNavigation === await a.evaluate(() => JSON.parse(window.render_game_to_text()).model_connection.binding_id)
    && commandsBeforeNavigation === fixture.snapshot().commands.filter((item) => item.command !== "view.projection").length);
  await formHandle.dispose();
  await a.locator("#modelWakeConsent").uncheck();
  check("次数上限来自服务实际配置", await a.locator("#modelWakeMaxNotifications").getAttribute("max") === "2");
  check("未同意时不能开启", !(await a.locator("#modelWakeStart").isEnabled()));
  check("绑定不自动通知", fixture.snapshot().notifications.length === 0);
  await start(a);
  await wakeState(a, "waiting");
  check("一次显式启动只有一个请求且省略thread_id", fixedStarts().length === 1
    && fixedStarts()[0].has_thread_id === false);
  check("成功后清空同意", !(await a.locator("#modelWakeConsent").isChecked()));
  check("运行中不能重复开启", !(await a.locator("#modelWakeStart").isEnabled()));
  check("本人运行不改变B的未绑定状态", await b.locator("#modelWakeControls").getAttribute("data-state") === "unbound");
  await say(b, "B16 第一条真人页面测试消息");
  await wakeState(a, "awaiting_resolution");
  check("通知已接收并不等于AI完成", fixture.snapshot().windows[0].wake.queued_count === 1
    && fixture.snapshot().windows[0].wake.resolved_count === 0);
  await fixture.control({ command: "begin", index: 0 });
  await say(b, "B16 第二条真人页面测试消息");
  check("未回执期间仍可聊天且通知单槽", fixture.snapshot().notifications.length === 1);
  await tableLayout(a, "1365px 双人公开玩家气泡", 2);
  await screenshot(a, "desktop-awaiting-resolution");
  for (const width of [390, 320]) {
    await a.setViewportSize({ width, height: 844 });
    await openSettings(a);
    const layout = await a.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const controls = [...document.querySelectorAll("#modelWakeForm input, #modelWakeForm button")]
        .map((el) => ({ id: el.id, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0);
      const requiredIds = ["modelWakeMaxNotifications", "modelWakeDurationSeconds",
        "modelWakeConsent", "modelWakeStart", "modelWakeStop"];
      return { width, scrollWidth: document.documentElement.scrollWidth,
        visibleControls: controls.length,
        fixedTargetVisible: document.querySelector("#modelWakeFixedTarget")?.getBoundingClientRect().height > 0,
        requiredControlsPresent: requiredIds.every((id) => controls.some((control) => control.id === id)),
        controlsWithinViewport: controls.every(({ box }) => box.left >= -1 && box.right <= width + 1) };
    });
    check(`${width}px 无横向溢出且固定目标控件完整`, layout.visibleControls === 5 && layout.fixedTargetVisible
      && layout.requiredControlsPresent
      && layout.scrollWidth <= layout.width + 1 && layout.controlsWithinViewport, layout);
    await screenshot(a, `mobile-${width}-notification-settings`);
    await tableLayout(a, `${width}px 双人公开玩家气泡`, 2);
    await screenshot(a, `mobile-${width}-awaiting-resolution`);
  }
  await a.setViewportSize({ width: 1365, height: 1000 });
  await fixture.control({ command: "resolve", index: 0, decision: "public_speech" });
  const speech = "这是本地脚本的测试吐槽，不是真实模型生成。";
  for (const page of [a, b]) {
    await until(async () => (await page.locator("#timeline").innerText()).includes(speech), "两页公开脚本气泡");
  }
  check("真实权威公开结果在两页可见", true);
  await tableLayout(a, "1365px AI公开气泡", 2);
  check("AI气泡在所属座位内有AI文字和独立说话者标识",
    await a.locator('#seats .seat-bubble[data-speaker="SEAT_AI"]').count() > 0
    && (await a.locator('#seats .seat-bubble[data-speaker="SEAT_AI"]').first().innerText()).includes("AI"));
  await openGame(a);
  await screenshot(a, "desktop-two-friend-ai-talk");
  await openSettings(a);
  await until(() => fixture.snapshot().notifications.length === 2, "第二次通知");
  await fixture.control({ command: "resolve", index: 1, decision: "silent" });
  await wakeState(a, "stopped");
  const final = fixture.snapshot().windows[0].wake;
  check("次数上限自动停止，公开和silent都算实际resolve", final.reason === "max_notifications"
    && final.queued_count === 2 && final.resolved_count === 2);
  check("状态不冒充原生回合完成", final.native_turn_state === "unknown");
  await screenshot(a, "desktop-count-limit");

  // 请求在传输中丢失：第一次没有转交服务器，客户端无法凭此猜测未执行。
  // 显式重试应保留相同幂等请求；不自动产生新窗口。
  const beforeRetry = fixedStarts().length;
  expectedStartAbort = true;
  const abortStart = async (route) => {
    try { await route.abort("failed"); }
    catch (error) { report.errors.push({ kind: "fixture-route", message: error.message }); }
  };
  await a.route("**/api/model/wake/start", abortStart);
  await start(a);
  await wakeState(a, "start_unknown");
  await a.unroute("**/api/model/wake/start", abortStart);
  check("未知请求不会自动重发", fixedStarts().length === beforeRetry + 1);
  check("未知结果时可见重试而非新建窗口", await a.locator("#modelWakeRetry").isVisible()
    && !(await a.locator("#modelWakeStart").isEnabled()));
  check("新请求未知时不挪用上个窗口的原因和计数", !(await a.locator("#modelWakeStatus").innerText()).includes("已到通知次数上限")
    && await a.locator("#modelWakeCounts").innerText() === "尚无本席窗口回执。"
    && await a.locator("#modelWakeCleanup").innerText() === "");
  await screenshot(a, "desktop-unknown-start");
  await a.locator("#modelWakeRetry").click();
  await wakeState(a, "waiting");
  expectedStartAbort = false;
  check("显式重试逐字段保留原请求且仍省略thread_id", fixedStarts().length === beforeRetry + 2
    && JSON.stringify(fixedStarts()[beforeRetry]) === JSON.stringify(fixedStarts()[beforeRetry + 1])
    && fixedStarts().slice(beforeRetry).every((entry) => entry.has_thread_id === false));
  await settingClick(a, "modelWakeStop");
  await wakeState(a, "stopped");
  check("空闲窗口可手动停止且没有追加通知", fixture.snapshot().notifications.length === 2);

  // 通知功能失败或被关闭不能拖住真人操作。这里仍使用正常按钮。
  await start(a);
  await wakeState(a, "waiting");
  await openGame(a);
  await a.locator("#ai-toggle").click();
  await wakeState(a, "off");
  const afterOff = fixture.snapshot().notifications.length;
  await say(b, "B16 AI关闭后玩家仍可聊天");
  check("AI OFF 后不再发送", fixture.snapshot().notifications.length === afterOff);
  await settingClick(a, "model-unbind");
  await wakeState(a, "unbound");
  check("解绑清除本人窗口投影", fixture.snapshot().windows[0].bound === false);
  check("停止语义有明确说明", (await a.locator("#modelWakeWarning").innerText()).includes("撤回"));
  for (const page of [a, b]) { await openGame(page); await page.locator("#ready-toggle").click(); }
  check("启停和撤权不阻塞正常Ready", (await fixture.control({ command: "start_hand" })).hand_status === "active");
  await until(async () => (await a.locator("#hand-index").innerText()).includes("1"), "第一手开始");
  await a.setViewportSize({ width: 1365, height: 800 });
  await tableLayout(a, "1365×800 进行中双人桌", 2);
  const checkAboveFold = async (label) => {
    await a.evaluate(() => window.scrollTo(0, 0));
    const visible = await a.evaluate(() => {
      const boxes = (selector) => [...document.querySelectorAll(selector)].map((el) => {
        const box = el.getBoundingClientRect();
        const topElement = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { width: box.width, height: box.height, top: box.top, bottom: box.bottom,
          unobscured: topElement !== null && (el === topElement || el.contains(topElement)) };
      });
      const cards = boxes('#seats > .seat[data-viewer="true"] .seat-hole .card-face');
      const buttons = boxes("#action-buttons button");
      const sizing = document.querySelector("#raise-row").hidden ? [] : boxes("#raise-amount, #raise-submit");
      const machine = JSON.parse(window.render_game_to_text());
      return { scrollY: window.scrollY, viewportHeight: innerHeight, cards, buttons, sizing,
        isActor: machine.action_panel.is_actor,
        allAboveFold: [...cards, ...buttons, ...sizing].every((box) => box.top >= 0
          && box.bottom <= innerHeight && box.width >= 24 && box.height >= 24 && box.unobscured) };
    });
    check(label, visible.scrollY === 0 && visible.isActor && visible.cards.length === 2
      && visible.buttons.length > 0 && visible.allAboveFold, visible);
  };
  await checkAboveFold("1365×800 不滚动即可看到本人底牌与所有合法动作");
  await screenshot(a, "desktop-1365x800-two-friend-active", { fullPage: false });
  await a.locator('#action-buttons button[data-action="raise"]').click();
  await tableLayout(a, "1365×800 展开加注的双人桌", 2);
  await checkAboveFold("1365×800 展开加注后输入与提交按钮仍在首屏可操作");
  await screenshot(a, "desktop-1365x800-raise-open", { fullPage: false });
  await a.setViewportSize({ width: 1365, height: 1000 });
  await screenshot(a, "desktop-revoked-normal-game");

  // 可选通知模块卡在加载中时，原有标签页会话仍必须恢复；不能等它完成才进入牌桌。
  await fixture.control({ command: "bind", seat: 0 });
  await until(() => a.locator("#model-unbind").isEnabled(), "挂起加载前存在可撤销的本席连接");
  await a.locator("#ai-toggle").click();
  await wakeState(a, "idle");
  let moduleHeld = false;
  let releaseModule;
  const moduleGate = new Promise((resolve) => { releaseModule = resolve; });
  let moduleFinished = Promise.resolve();
  let offHeld = false;
  let releaseOff;
  const offGate = new Promise((resolve) => { releaseOff = resolve; });
  let offFinished = Promise.resolve();
  const holdModule = (route) => {
    moduleHeld = true;
    moduleFinished = (async () => { await moduleGate; await route.continue(); })();
    return moduleFinished;
  };
  const holdOff = (route) => {
    const body = route.request().postDataJSON();
    if (body.command !== "ai.set_mode" || body.params?.mode !== "OFF") return route.continue();
    offHeld = true;
    offFinished = (async () => { await offGate; await route.continue(); })();
    return offFinished;
  };
  await a.route("**/wake-controls.mjs", holdModule);
  await a.route("**/api/action", holdOff);
  try {
    await a.reload({ waitUntil: "domcontentloaded" });
    await until(() => moduleHeld, "通知模块请求实际被夹具挂起");
    await until(() => a.locator("#table-main").isVisible(), "可选模块未返回时恢复已有牌桌");
    check("通知模块加载挂起不阻塞已存会话恢复", moduleHeld
      && (await a.locator("#hand-index").innerText()).includes("1"));
    await openSettings(a);
    await say(a, "B16 通知模块加载中仍可真人聊天");
    await until(async () => (await b.locator("#timeline").innerText()).includes("B16 通知模块加载中仍可真人聊天"), "模块仍挂起时B看到A真人发言");
    check("通知模块仍挂起时真人聊天可用", moduleHeld
      && (await b.locator("#timeline").innerText()).includes("B16 通知模块加载中仍可真人聊天"));
    await screenshot(a, "desktop-restored-while-module-pending");
    await a.locator("#ai-toggle").click();
    await until(() => offHeld, "AI OFF 请求实际被夹具挂起");
    releaseModule();
    await moduleFinished;
    await wakeState(a, "blocked");
    check("模块迟到成功继承未完成OFF操作的屏障", !(await a.locator("#modelWakeConsent").isEnabled())
      && !(await a.locator("#modelWakeTaskId").isEnabled()));
    await settingClick(a, "model-unbind");
    check("模块迟到加载后仍可撤销本席连接", fixture.snapshot().windows[0].bound === false);
    check("后发撤销先完成不能解除尚未完成的OFF屏障",
      await a.locator("#modelWakeControls").getAttribute("data-state") === "blocked"
      && !(await a.locator("#modelWakeConsent").isEnabled()));
    await screenshot(a, "desktop-late-module-pending-off");
  } finally {
    releaseModule();
    releaseOff();
    await Promise.all([moduleFinished, offFinished]);
    await a.unroute("**/wake-controls.mjs", holdModule);
    await a.unroute("**/api/action", holdOff);
  }
  await wakeState(a, "unbound");
  await new Promise((resolve) => setTimeout(resolve, 100));
  await Promise.all(responseTasks.slice());
  const fixedResponses = responses.filter((entry) => entry.target_configured === true);
  const fixedRoutes = new Set(fixedResponses.map((entry) => entry.route));
  check("固定目标模式捕获到view与start/status/stop响应", ["/api/view", "/api/model/wake/start",
    "/api/model/wake/status", "/api/model/wake/stop"].every((route) => fixedRoutes.has(route)),
  { routes: [...fixedRoutes].sort() });
  check("固定目标的轮询与控制响应不含thread_id或已知UUID", fixedResponses.length > 0
    && fixedResponses.every((entry) => !entry.contains_thread_id && !entry.contains_known_uuid)
    && fixedResponses.filter((entry) => entry.projected_target_configured !== undefined)
      .every((entry) => entry.projected_target_configured === true), { count: fixedResponses.length });
  check("所有固定目标启动请求都省略thread_id", fixedStarts().length >= 3
    && fixedStarts().every((entry) => entry.has_thread_id === false));
  const pageEvidence = await a.evaluate(() => ({
    taskFieldVisible: document.querySelector("#modelWakeTaskField")?.getBoundingClientRect().height > 0,
    taskInputDisabled: document.querySelector("#modelWakeTaskId")?.disabled === true,
    taskInputValue: document.querySelector("#modelWakeTaskId")?.value,
    fixedTargetVisible: document.querySelector("#modelWakeFixedTarget")?.getBoundingClientRect().height > 0,
    machineText: typeof window.render_game_to_text === "function" ? window.render_game_to_text() : "",
  }));
  check("最终页面状态仍不含任务UUID或thread_id", pageEvidence.taskFieldVisible === false
    && pageEvidence.taskInputDisabled && pageEvidence.taskInputValue === "" && pageEvidence.fixedTargetVisible
    && !pageEvidence.machineText.includes("thread_id") && !pageEvidence.machineText.includes(fixture.threadId));

  // 席位布局必须来自投影：同一张桌动态加入第三、第四席，不生成另一套固定身份页面。
  await openGame(a);
  for (const [name, count] of [["b30_ui_c", 3], ["b30_ui_d", 4]]) {
    const guest = await openPage();
    await guest.locator("#join-player").fill(name);
    await guest.locator("#join-code").fill(invite);
    await guest.locator("#join-form button").click();
    await guest.locator("#scope-accept").click();
    await guest.locator("#table-main").waitFor({ state: "visible" });
    await until(async () => await a.locator("#seats > .seat").count() === count, `${count}席布局`);
    await tableLayout(a, `1365px 动态${count}席`, count);
  }
  await screenshot(a, "desktop-four-seat-layout");
  await a.setViewportSize({ width: 320, height: 844 });
  await tableLayout(a, "320px 动态四席", 4);
  await screenshot(a, "mobile-320-four-seat-layout");
  check("正常链路无浏览器错误", report.errors.length === 0, { count: report.errors.length });
  report.request_capture = requests;
  report.response_capture = responses;
  report.page_evidence = { ...pageEvidence, machineText: undefined };
  report.fixture_final = fixture.snapshot();
  report.completed = true;
} catch (error) {
  report.failure = { name: error.name, message: error.message };
} finally {
  const cleanup = contexts.map((context, i) => [`browser-context-${i}`, () => context.close()]);
  if (browser) cleanup.push(["browser", () => browser.close()]);
  if (fixture) cleanup.push(["scripted-fixture", async () => { report.fixture_cleanup = await fixture.stop(); }]);
  await cleanupWithEvidence(cleanup.map(([name, run]) => [name, async () => {
    try { await run(); report.cleanup.push({ name, passed: true }); }
    catch (error) { report.cleanup.push({ name, passed: false }); throw error; }
  }]), report.errors, (message) => String(message));
  report.duration_ms = performance.now() - began;
  const outcome = acceptanceOutcome(report);
  report.passed = outcome.passed;
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, checks: report.checks.length,
    errors: report.errors.length, failure: report.failure, duration_ms: report.duration_ms, output })}\n`);
  process.exitCode = outcome.exitCode;
}
