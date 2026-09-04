// 两个隔离浏览器走真实 UI，验证好友现金桌的破产恢复闭环。
//
// 这不是单元测试替身：建房、加入、公开范围确认、Ready、全下、跟注、补筹码与再次
// Ready 全部点击玩家页面；固定牌堆只负责稳定地产生一名破产玩家。

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const { CommandSurface } = require("../src/authority/command-surface.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { startBeta } = require("../src/run-beta.cjs");
const resolver = require("./playwright-resolve.cjs");

const artifactDir = path.resolve(process.argv[2] ?? "artifacts/test-chip-refill-browser");
fs.mkdirSync(artifactDir, { recursive: true });
const resultPath = path.join(artifactDir, "result.json");
fs.rmSync(resultPath, { force: true });

function deck() {
  return stackedDeck([
    // heads-up：B 拿 AA，A 拿 KQ；两边 200 全下后 A 稳定归零。
    "As", "Kd", "Ah", "Qd",
    "2c", "3c", "4d", "5h", "7s", "9c",
  ]);
}

function machineState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function enter(page, kind, { playerId, inviteCode = null }) {
  if (kind === "create") {
    await page.fill("#create-player", playerId);
    await page.click("#create-form button[type=submit]");
  } else {
    await page.fill("#join-player", playerId);
    await page.fill("#join-code", inviteCode);
    await page.click("#join-form button[type=submit]");
  }
  await page.waitForSelector("#scope-gate:not([hidden])");
  await page.click("#scope-accept");
  await page.waitForSelector("#table-main:not([hidden])");
}

async function main() {
  const playwright = resolver.loadPlaywright();
  if (playwright === null) {
    throw Object.assign(new Error(resolver.describeMissing()), { code: "playwright_unavailable" });
  }

  const startedAt = Date.now();
  const consoleErrors = [];
  const checks = [];
  const check = (name, ok, detail = null) => checks.push({ name, ok: ok === true, detail });
  let run = null;
  let browser = null;

  try {
    const surface = new CommandSurface({ deckFactory: deck });
    run = await startBeta({
      surface,
      env: {
        ...process.env,
        TOKENGAME_WEB_HOST: "127.0.0.1",
        TOKENGAME_WEB_PORT: "0",
        TOKENGAME_PUBLIC_ORIGIN: "",
        TOKENGAME_COMMAND_ORIGIN: "",
        TOKENGAME_MODEL_ADAPTER: "",
        TOKENGAME_REMOTE_WAKE: "0",
        TOKENGAME_CODEX_WAKE_QUEUE: "",
        TOKENGAME_AI_RECEIPT_FILE: "",
      },
    });
    browser = await playwright.chromium.launch({ headless: true });
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const page of pages) {
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(String(error)));
      await page.goto(run.origin, { waitUntil: "domcontentloaded" });
    }
    const [alice, bob] = pages;

    await enter(alice, "create", { playerId: "alice" });
    const inviteCode = (await alice.textContent("#invite-code"))?.trim() ?? "";
    check("建房者取得邀请码", inviteCode.length > 0, { invite_length: inviteCode.length });
    await enter(bob, "join", { playerId: "bob", inviteCode });

    await alice.click("#ready-toggle");
    await bob.click("#ready-toggle");
    await alice.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return state.hand?.status === "active";
    }, null, { timeout: 8_000 });

    const aliceStart = await machineState(alice);
    const actor = aliceStart.action_panel?.is_actor ? alice : bob;
    const caller = actor === alice ? bob : alice;
    await actor.waitForSelector('[data-action="all_in"]');
    await actor.click('[data-action="all_in"]');
    await caller.waitForSelector('[data-action="call"]');
    await caller.click('[data-action="call"]');

    await alice.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return state.hand?.status === "complete";
    });
    const states = await Promise.all(pages.map(machineState));
    const bustedIndex = states.findIndex(
      (state) => state.seats.find((seat) => seat.is_viewer)?.stack === 0,
    );
    check("全下后恰有一名查看者归零", bustedIndex !== -1);
    if (bustedIndex === -1) throw new Error("busted_seat_not_observed");

    const bustedPage = pages[bustedIndex];
    await bustedPage.waitForSelector("#refill-test-chips:visible");
    const before = await machineState(bustedPage);
    const beforeMine = before.seats.find((seat) => seat.is_viewer);
    check("补筹码按钮来自权威资格投影", beforeMine?.test_chip_refill_available === true);
    check("补充目标为 200 测试筹码", beforeMine?.test_chip_refill_amount === 200);
    check("破产时 Ready 被禁用", await bustedPage.isDisabled("#ready-toggle"));
    check(
      "按钮明确写出补充目标",
      (await bustedPage.textContent("#refill-test-chips"))?.includes("200") === true,
    );
    await bustedPage.screenshot({ path: path.join(artifactDir, "before-refill.png"), fullPage: true });

    await bustedPage.click("#refill-test-chips");
    await bustedPage.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      const mine = state.seats.find((seat) => seat.is_viewer);
      return mine?.stack === 200 && mine?.state === "SIT_OUT"
        && mine?.test_chip_refill_available === false;
    });
    check("补筹码后按钮隐藏", await bustedPage.isHidden("#refill-test-chips"));
    check("补筹码后 Ready 恢复可用", !(await bustedPage.isDisabled("#ready-toggle")));

    await bustedPage.click("#ready-toggle");
    await bustedPage.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return state.seats.find((seat) => seat.is_viewer)?.state === "READY";
    });
    const after = await machineState(bustedPage);
    const afterMine = after.seats.find((seat) => seat.is_viewer);
    check("补筹码后当前显示 200", afterMine?.stack === 200);
    check("再次 Ready 是独立动作", afterMine?.state === "READY");
    await bustedPage.screenshot({ path: path.join(artifactDir, "after-refill-ready.png"), fullPage: true });

    check("两个页面没有控制台错误", consoleErrors.length === 0, { console_errors: consoleErrors });
  } finally {
    if (browser !== null) await browser.close();
    if (run !== null) await run.close({ reason: "browser_acceptance_complete" });
  }

  const result = {
    passed: checks.length > 0 && checks.every((entry) => entry.ok),
    checks,
    console_errors: consoleErrors,
    elapsed_ms: Date.now() - startedAt,
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  const result = {
    passed: false,
    error: error?.code ?? error?.message ?? "browser_acceptance_failed",
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 1;
});
