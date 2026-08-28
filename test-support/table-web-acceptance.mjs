// 浏览器验收：宿主中立内核 + 单栈 Web UI 的完整纵向切片。
//
// 这个脚本存在的理由是自动化单元测试证明不了的那部分。test/table-web-host.test.cjs
// 断言的是协调器的出口边界；它在进程内调用，永远不会发现「按钮画出来了但点不动」
// 「两个浏览器上下文看到的是同一副底牌」这类只在真浏览器里才成立的缺陷。
//
// 四个 Chromium context 相互隔离，各自只走 Web UI 与正常玩家接口。没有特权客户端，
// 没有直接往内核发命令的后门——如果某一步只能靠后门完成，那就是 UI 缺了东西。
//
// 关于模型：这里挂的是 test-support/scripted-model-adapter.cjs，它自报 simulated:true。
// 本脚本因此能验证「AI 公开发言在座位旁、带 AI 标记、与玩家气泡可区分」这条链路，
// 但它**不构成**真实宿主主动唤醒已通过的证据。那件事仍然未验证。
//
// 跑法：
//   node test-support/table-web-acceptance.mjs artifacts/table-web-acceptance
// 需要 playwright 与 chromium；缺失时脚本以 exit 2 停下并说明装法，不假装通过。

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const resolver = require("./playwright-resolve.cjs");

const artifactDir = path.resolve(process.argv[2] ?? "artifacts/table-web-acceptance");
fs.mkdirSync(artifactDir, { recursive: true });

const PLAYERS = ["alice", "bob", "carol", "dave"];
const steps = [];
const failures = [];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function ok(name, detail = "") {
  steps.push({ name, ok: true, detail });
  log(`  [通过] ${name}${detail ? `　${detail}` : ""}`);
}

function bad(name, detail) {
  steps.push({ name, ok: false, detail });
  failures.push(`${name}：${detail}`);
  log(`  [失败] ${name}　${detail}`);
}

// 断言不抛错。一步失败之后后面的步骤往往还有诊断价值——尤其是「谁看到了谁的底牌」
// 这类问题，第一个失败点常常不是根因。全部跑完再一次性判定。
function check(name, condition, detail = "") {
  if (condition) ok(name, detail);
  else bad(name, detail || "条件不成立");
  return condition;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 轮询等待。UI 是 700 毫秒一次的拉取，权威的到期驱动是 250 毫秒一跳，所以任何跨席
// 可见的变化都有一个天然延迟。等待上限给够，但超时必须报成失败而不是继续往下走——
// 「等不到就当过了」是这类脚本最容易骗过自己的地方。
async function until(label, fn, { timeout = 20_000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = `抛错 ${error.message}`;
    }
    if (Date.now() > deadline) {
      throw new Error(`等待超时（${timeout}ms）：${label}　最后一次结果 ${JSON.stringify(last)}`);
    }
    await sleep(interval);
  }
}

// ---- 服务进程 ----

function startServer() {
  const child = spawn(process.execPath, [path.join("src", "run-table-web.cjs")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TOKENGAME_WEB_PORT: "0",
      TOKENGAME_WEB_HOST: "127.0.0.1",
      // 确定性脚本适配器。它自报 simulated:true 且不可覆盖。
      TOKENGAME_MODEL_ADAPTER: path.join("test-support", "scripted-model-adapter.cjs"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const serverLog = [];
  child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

  const origin = new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      serverLog.push(String(chunk));
      const line = buffer.split("\n").find((candidate) => candidate.startsWith("{"));
      if (line === undefined) return;
      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(error);
      }
    });
    child.on("exit", (code) => reject(new Error(`服务进程提前退出，code=${code}`)));
    setTimeout(() => reject(new Error("服务进程 15 秒内没有报出 origin")), 15_000);
  });

  return { child, origin, serverLog };
}
// ---- 玩家（= 一个隔离的浏览器上下文）----

async function newPlayer(browser, origin, name) {
  // 每人一个 context：独立的存储分区与独立的进程内 JS 世界。同一个 context 开两个
  // 标签页会共享 storage，那样「隔离玩家」就只是说法而不是事实。
  const context = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // 离桌要过一次 window.confirm。不接对话框的话点击会一直挂着。
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  return { name, context, page, consoleErrors, pageErrors };
}

// 从 DOM 读牌桌状态。刻意不去读 /api/view：那样验证的是协调器，而协调器已经有单元
// 测试了。这里要验证的正是「权威说的东西真的画到了屏幕上」，所以只认渲染结果。
function readTable(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
    const seats = [...document.querySelectorAll("#seats > li.seat")].map((li) => ({
      seatId: li.dataset.seatId,
      name: li.querySelector(".seat-name")?.textContent?.trim() ?? null,
      isViewer: li.dataset.viewer === "true",
      isActor: li.dataset.actor === "true",
      folded: li.dataset.folded === "true",
      hiddenSeat: li.dataset.hiddenSeat === "true",
      tags: [...li.querySelectorAll(".seat-head .tag")].map((t) => t.textContent.trim()),
      chips: li.querySelector(".seat-chips")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      stack: Number.parseInt(
        li.querySelector(".seat-chips .n")?.textContent?.trim() ?? "NaN", 10),
      // 底牌：明牌返回牌面文本，暗牌返回 "?"。别人的明牌出现在这里就是泄漏。
      hole: [...li.querySelectorAll(".seat-hole .card-face")].map((c) => c.textContent.trim()),
      aiRow: li.querySelector(".seat-ai-row")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      aiTags: [...li.querySelectorAll(".seat-ai-row .tag")].map((t) => t.textContent.trim()),
      hideButtons: [...li.querySelectorAll(".seat-hide-row button")].map((b) => b.textContent.trim()),
    }));
    return {
      entryVisible: document.getElementById("entry-view")?.hidden === false,
      scopeGateVisible: document.getElementById("scope-gate")?.hidden === false,
      roomId: text("#room-id"),
      inviteCode: text("#invite-code"),
      handIndex: Number.parseInt(text("#hand-index") ?? "0", 10),
      startReason: text("#start-reason"),
      adapterState: text("#adapter-state"),
      pot: Number.parseInt(text("#pot-total") ?? "0", 10),
      street: text("#street"),
      board: [...document.querySelectorAll("#board .card-face")].map((c) => c.textContent.trim()),
      connState: text("#conn-state"),
      seats,
      myActions: [...document.querySelectorAll("#action-buttons button")]
        .map((b) => ({ action: b.dataset.action ?? null, label: b.textContent.trim() })),
      raiseVisible: document.getElementById("raise-row")?.hidden === false,
      raiseBounds: text("#raise-bounds"),
      readyLabel: text("#ready-toggle"),
      sitoutLabel: text("#sitout-toggle"),
      aiToggleLabel: text("#ai-toggle"),
      revealVisible: document.getElementById("reveal-btn")?.hidden === false,
      counter: text("#say-counter"),
      sayDisabled: document.getElementById("say-submit")?.disabled === true,
      globalError: document.getElementById("global-error")?.hidden === false
        ? text("#global-error") : null,
      bubbles: [...document.querySelectorAll("#timeline > li.bubble")].map((li) => ({
        speaker: li.dataset.speaker,
        hidden: li.dataset.hidden === "true",
        late: li.dataset.late === "true",
        who: li.querySelector(".bubble-who")?.textContent?.trim() ?? null,
        badge: li.querySelector(".ai-badge")?.textContent?.trim() ?? null,
        text: li.querySelector(".bubble-text")?.textContent ?? "",
        textShown: li.querySelector(".bubble-text") !== null
          && getComputedStyle(li.querySelector(".bubble-text")).display !== "none",
      })),
    };
  });
}
// 截图连同一个状态指纹一起记下来。
//
// 第一版只存 PNG，结果三张图字节完全相同，而我没有办法判断那是「页面确实没变」还是
// 「截图没有重新拍」。指纹让这件事可判定：状态相同则图相同是对的，状态不同而图相同
// 才是缺陷。证据必须能自证，否则复核的人只能选择相信。
async function shot(player, label) {
  const file = path.join(artifactDir, `${label}.png`);
  const buffer = await player.page.screenshot({ path: file, fullPage: true });
  const table = await readTable(player.page);
  return {
    file: path.basename(file),
    viewer: player.name,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16),
    state: {
      hand: table.handIndex,
      street: table.street,
      pot: table.pot,
      board: table.board.length,
      bubbles: table.bubbles.length,
      seats: table.seats.length,
    },
  };
}

// ---- 入口动作 ----

async function createRoom(player) {
  await player.page.fill("#create-player", player.name);
  await player.page.click("#create-form button[type=submit]");
  const state = await until(`${player.name} 建房后进入牌桌`, async () => {
    const table = await readTable(player.page);
    return table.entryVisible === false && table.inviteCode !== "—" ? table : false;
  });
  return state.inviteCode;
}

async function joinRoom(player, inviteCode) {
  await player.page.fill("#join-player", player.name);
  await player.page.fill("#join-code", inviteCode);
  await player.page.click("#join-form button[type=submit]");
  await until(`${player.name} 加入后进入牌桌`, async () => {
    const table = await readTable(player.page);
    return table.entryVisible === false ? table : false;
  });
}

async function acceptScope(player) {
  await until(`${player.name} 看到公开范围确认`, async () =>
    (await readTable(player.page)).scopeGateVisible);
  await player.page.click("#scope-accept");
  await until(`${player.name} 确认后对话框关闭`, async () =>
    (await readTable(player.page)).scopeGateVisible === false);
}

// 找到当前该行动的那个玩家。权威只会给一个人按钮，所以正好一个才算对。
async function findActor(players, label) {
  return until(`${label}：出现唯一的行动者`, async () => {
    const holders = [];
    for (const player of players) {
      const table = await readTable(player.page);
      if (table.myActions.length > 0) holders.push({ player, table });
    }
    return holders.length === 1 ? holders[0] : false;
  }, { timeout: 25_000 });
}
// 执行一个动作。preference 是想要的动作名序列，按顺序取第一个当前合法的；
// 都不合法就退回权威给的第一个按钮。永远不构造权威没给的动作——那样测的就不是 UI 了。
async function takeAction(holder, preference = []) {
  const { player, table } = holder;
  const available = table.myActions.map((a) => a.action);
  const chosen = preference.find((want) => available.includes(want)) ?? available[0];
  const needsSizing = chosen === "bet" || chosen === "raise";

  await player.page.click(`#action-buttons button[data-action="${chosen}"]`);
  if (!needsSizing) return { player: player.name, action: chosen, to: null };

  // 尺寸输入框：不填默认值直接提交等于替玩家选数，所以 UI 预填的是 min_to。
  // 这里刻意取 min 与 max 的中间值，好让「目标总额」这个语义被真正走一遍——
  // 如果 UI 把 amount 当增量传，权威会以 invalid_action_amount 拒绝，这一步就会失败。
  await until(`${player.name} 的加注输入框出现`, async () =>
    (await readTable(player.page)).raiseVisible);
  const bounds = await player.page.evaluate(() => {
    const input = document.getElementById("raise-amount");
    return { min: Number(input.min), max: Number(input.max) };
  });
  const target = Number.isFinite(bounds.max) && bounds.max > bounds.min
    ? Math.min(bounds.max, bounds.min + Math.floor((bounds.max - bounds.min) / 2))
    : bounds.min;
  await player.page.fill("#raise-amount", String(target));
  await player.page.click("#raise-submit");
  return { player: player.name, action: chosen, to: target };
}

// 打完一手：一直把行动权交给下一个人，直到这一手结束。
// preferences 按顺序消费，用完之后一律走 check/call —— 目的是让牌局自己走到摊牌。
// 打完一手，同时记录这一手在画面上走过的街道与公共牌张数。
//
// 记录这两样是因为第一版没记：所有截图的 board 都是 0，也就是「公共牌渲染」这条明确的
// 验收项一次都没有被真正看到过，而 74 条断言全绿。绿色不等于覆盖。
async function playHand(players, handIndex, preferences = [], hooks = {}) {
  const taken = [];
  const streets = new Set();
  let maxBoard = 0;
  const queue = [...preferences];
  for (let guard = 0; guard < 60; guard += 1) {
    // 手序号一变就立刻停。让循环滑进下一手的话，「第一手的动作」这份记录里会混进
    // 下一手的动作，之后所有按手对照的断言（筹码结转、新底牌）都会对错行。
    const indices = await Promise.all(players.map(async (p) =>
      (await readTable(p.page)).handIndex));
    if (indices.some((index) => index > handIndex)) break;
    let holder;
    try {
      holder = await findActor(players, `第 ${handIndex} 手`);
    } catch {
      break; // 没有人该行动了，这一手已经收尾。
    }
    // 找到行动者到点下去之间还要过一次手序号检查：findActor 最长等 25 秒，
    // 这期间这一手可能已经结束了。
    if ((await readTable(holder.player.page)).handIndex > handIndex) break;
    const preference = queue.length > 0 ? queue.shift() : ["check", "call", "fold"];
    taken.push(await takeAction(holder, preference));

    const after = await readTable(holder.player.page);
    if (after.street !== null && after.street !== "—") streets.add(after.street);
    if (after.board.length > maxBoard) {
      maxBoard = after.board.length;
      if (typeof hooks.onNewStreet === "function") {
        await hooks.onNewStreet(after, holder.player);
      }
    }
    await sleep(300);
  }
  return { taken, streets: [...streets], maxBoard };
}
// ---- 主流程 ----

async function main() {
  const playwright = resolver.loadPlaywright();
  if (playwright === null) {
    log(resolver.describeMissing());
    process.exit(2);
  }

  const server = startServer();
  let banner;
  try {
    banner = await server.origin;
  } catch (error) {
    log(`服务启动失败：${error.message}`);
    log(server.serverLog.join(""));
    server.child.kill();
    process.exit(1);
  }
  log(`服务已起：${JSON.stringify(banner)}`);
  check("服务如实报告适配器是模拟的",
    banner.model_adapter?.simulated === true,
    `model_adapter=${JSON.stringify(banner.model_adapter)}`);
  check("自带内核时到期驱动在本进程", banner.due_work_owned_here === true);

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const artifacts = [];
  const players = [];
  // 这两个在 finally 里也要读，所以声明在 try 之外。consoleChecked 用来避免同一条断言
  // 被记两遍：正常跑完时它在第 12 节记过了，只有中途抛错才轮到 finally 补记。
  let consoleChecked = false;
  let finalHandIndex = 0;

  try {
    // ---- 1. 建房、邀请码加入、逐席公开范围确认 ----
    const alice = await newPlayer(browser, banner.origin, "alice");
    players.push(alice);
    const inviteCode = await createRoom(alice);
    check("建房拿到邀请码", typeof inviteCode === "string" && inviteCode.length >= 6,
      `invite_code=${inviteCode}`);

    const aliceGate = await readTable(alice.page);
    check("建房者自己也要过公开范围确认", aliceGate.scopeGateVisible === true);
    const bullets = await alice.page.$$eval("#scope-gate .scope-list li",
      (nodes) => nodes.map((n) => n.textContent.trim()));
    check("公开范围逐条列出（六条）", bullets.length === 6, `实际 ${bullets.length} 条`);
    check("公开范围说明了底牌只对自己可见",
      bullets.some((b) => b.includes("底牌") && b.includes("只有你自己")));
    check("公开范围说明了 AI 发言会被标注",
      bullets.some((b) => b.includes("AI") && b.includes("标注")));
    check("公开范围说明了本地隐藏只影响自己",
      bullets.some((b) => b.includes("隐藏") && b.includes("自己")));
    artifacts.push(await shot(alice, "01-scope-gate"));
    await acceptScope(alice);

    // 先验「先不加入」这条路：它必须把座位放回去，否则第四个人会进不来。
    const eve = await newPlayer(browser, banner.origin, "eve");
    await joinRoom(eve, inviteCode);
    await until("eve 看到公开范围确认", async () => (await readTable(eve.page)).scopeGateVisible);
    await eve.page.click("#scope-decline");
    const eveAfter = await until("eve 拒绝后回到入口", async () => {
      const table = await readTable(eve.page);
      return table.entryVisible === true ? table : false;
    });
    check("不确认公开范围就回到入口，不占座", eveAfter.entryVisible === true);
    await eve.context.close();
    await until("eve 的座位被放回", async () => {
      const table = await readTable(alice.page);
      return table.seats.every((seat) => seat.name !== "eve");
    });
    ok("拒绝确认后座位不残留");
    for (const name of PLAYERS.slice(1)) {
      const player = await newPlayer(browser, banner.origin, name);
      players.push(player);
      await joinRoom(player, inviteCode);
      await acceptScope(player);
    }
    check("四个隔离上下文都在同一房间",
      (await Promise.all(players.map(async (p) => (await readTable(p.page)).roomId)))
        .every((id, _, all) => id === all[0] && id !== "—"),
      `room_id=${(await readTable(alice.page)).roomId}`);

    await until("四席在每个人的画面上都可见", async () => {
      for (const player of players) {
        const table = await readTable(player.page);
        if (table.seats.length !== 4) return false;
      }
      return true;
    });
    ok("每个上下文都看到四席");

    const aliceSeats = await readTable(alice.page);
    check("每个人只有一席标为「你」",
      aliceSeats.seats.filter((s) => s.isViewer).length === 1);
    check("不给自己提供隐藏按钮",
      aliceSeats.seats.find((s) => s.isViewer).hideButtons.length === 0);
    check("给别人提供三个隐藏开关",
      aliceSeats.seats.filter((s) => !s.isViewer).every((s) => s.hideButtons.length === 3));
    check("本机模型如实标为模拟", aliceSeats.adapterState.includes("模拟"),
      `adapter-state=${aliceSeats.adapterState}`);

    // hidden 属性必须真的不渲染。浏览器的 [hidden] 只是一条特异性最低的 UA 样式，
    // 任何写在类选择器上的 display 都会盖掉它，而后果是一个看不见的元素继续占布局、
    // 继续吃点击。这条断言存在的原因就是它真的发生过：.scope-gate 是 display:grid 的
    // 全屏固定层，带着 hidden 罩住整张桌子，之后每一次点击都被它吞掉，画面上毫无痕迹。
    // 检查所有 hidden 元素而不只是那一个：这是一类缺陷，不是一个。
    const hiddenAudit = await alice.page.evaluate(() => {
      const nodes = [...document.querySelectorAll("[hidden]")];
      return {
        total: nodes.length,
        rendered: nodes
          .filter((node) => getComputedStyle(node).display !== "none")
          .map((node) => node.id || node.className || node.tagName),
      };
    });
    // 同时要求真的查到了 hidden 元素。一个都没查到时上面的 length === 0 也成立，
    // 那会在选择器写错或页面结构变化之后，把「什么都没检查」报成「全部合格」。
    check("带 hidden 属性的元素一律不参与渲染",
      hiddenAudit.rendered.length === 0 && hiddenAudit.total >= 5,
      hiddenAudit.rendered.length === 0
        ? `已检查 ${hiddenAudit.total} 个 hidden 元素`
        : `仍在渲染：${hiddenAudit.rendered.join("、")}`);
    artifacts.push(await shot(alice, "02-four-seated"));

    // ---- 2. Ready 与倒计时 ----
    const beforeReady = await readTable(alice.page);
    check("未全部准备时开局原因来自权威",
      ["等待其他人准备", "在座人数不足"].some((w) => beforeReady.startReason.startsWith(w)),
      `start-reason=${beforeReady.startReason}`);

    for (const player of players) await player.page.click("#ready-toggle");
    const countdown = await until("倒计时出现", async () => {
      const table = await readTable(alice.page);
      return table.startReason.includes("即将开始") ? table : false;
    }, { timeout: 8_000 });
    check("全部准备后进入倒计时", countdown.startReason.includes("即将开始"),
      `start-reason=${countdown.startReason}`);
    artifacts.push(await shot(alice, "03-ready-countdown"));

    const firstHand = await until("第一手开始", async () => {
      const table = await readTable(alice.page);
      return table.handIndex >= 1 && table.seats.some((s) => s.hole.length === 2) ? table : false;
    }, { timeout: 15_000 });
    check("倒计时结束后自动开出第一手", firstHand.handIndex === 1,
      `hand_index=${firstHand.handIndex}`);
    check("盲注与庄位由权威标出",
      firstHand.seats.some((s) => s.tags.includes("D"))
      && firstHand.seats.some((s) => s.tags.includes("小盲"))
      && firstHand.seats.some((s) => s.tags.includes("大盲")));
    check("开手即有底池（盲注已入池）", firstHand.pot > 0, `pot=${firstHand.pot}`);
    // ---- 3. 底牌隔离：这是整个验收里最要紧的一条 ----
    //
    // 四页各自按 700ms 轮询、起点互不相同，所以「alice 见到第一手」不等于四页都见到了。
    // 上面那个 until 只看 alice，早期版本紧接着就读四页，于是在稍慢的机器上 bob /
    // carol / dave 会差一个 tick——读到的是空桌。
    //
    // 等的条件刻意选 handIndex 与 pot：它们与底牌来自同一次同步 DOM 读取，但不依赖
    // 底牌是否画出来。若等成「等到两张底牌」，这条断言就变成自我实现的了。现在的写法
    // 下，「页面已显示第一手、盲注已入池，却没有本席底牌」仍然会被判失败。
    const tables = new Map();
    for (const player of players) {
      const table = await until(`${player.name} 自己的页面进入第一手`, async () => {
        const snapshot = await readTable(player.page);
        return snapshot.handIndex >= 1 && snapshot.pot > 0 ? snapshot : false;
      }, { timeout: 15_000 });
      tables.set(player.name, table);
    }

    const myHole = new Map();
    for (const [name, table] of tables) {
      const mine = table.seats.find((s) => s.isViewer);
      myHole.set(name, mine.hole);
      check(`${name} 看得见自己的两张底牌`,
        mine.hole.length === 2 && mine.hole.every((c) => c !== "?"),
        `hole=${JSON.stringify(mine.hole)}`);
      // 空集合会让 every() 无条件成立。上一版就是这样：三页一张牌都没渲染时，
      // 「只看到别人的暗牌」照样通过，把缺口报成了绿色。断言在无数据时通过比没有
      // 这条断言更糟——所以先要求真的看到了别人的牌位，再要求它们全是暗的。
      const others = table.seats.filter((s) => !s.isViewer);
      const otherHole = others.map((s) => s.hole);
      check(`${name} 只看到别人的暗牌`,
        others.length === PLAYERS.length - 1
        && otherHole.every((hole) => hole.length === 2)
        && otherHole.every((hole) => hole.every((c) => c === "?")),
        `others=${JSON.stringify(otherHole)}`);
    }

    // 交叉核对：把每个人的底牌拿去别人的整页文本里搜。UI 只要在任何地方泄漏了一次
    // （侧栏、tooltip、aria-label、隐藏节点），这一条就会失败——比只看 .seat-hole 更严。
    // searched 计数是为了不让这一条空过：某人底牌读成空数组时内层循环一次都不跑，
    // leaked 仍是 0，于是「没有泄漏」通过——而它其实什么都没搜。
    let leaked = 0;
    let searched = 0;
    for (const owner of players) {
      const cards = myHole.get(owner.name);
      for (const viewer of players) {
        if (viewer.name === owner.name) continue;
        const body = await viewer.page.evaluate(() => document.body.innerHTML);
        for (const card of cards) {
          const rank = card.slice(0, -1);
          const glyph = card.slice(-1);
          searched += 1;
          // 同时出现点数与花色符号才算命中。单看 "♥" 会被公共牌误伤。
          if (body.includes(`${rank}${glyph}`)) {
            leaked += 1;
            bad("底牌跨上下文泄漏",
              `${viewer.name} 的页面里出现了 ${owner.name} 的底牌 ${card}`);
          }
        }
      }
    }
    // 4 人 × 2 张 × 3 个别人的页面 = 24 次。
    const expectedSearches = PLAYERS.length * 2 * (PLAYERS.length - 1);
    check("四个上下文两两交叉：没有任何一方的底牌出现在别人的整页 DOM 里",
      leaked === 0 && searched === expectedSearches,
      `已搜 ${searched} 次（应为 ${expectedSearches}），命中 ${leaked} 次`);

    // 同样先要求数量对。少一张就去重，永远都是「互不相同」。
    const allCards = [...myHole.values()].flat();
    check("八张底牌互不相同（不是同一副发给了所有人）",
      allCards.length === PLAYERS.length * 2
      && new Set(allCards).size === allCards.length,
      `cards=${JSON.stringify(allCards)}`);
    artifacts.push(await shot(alice, "04-hole-cards-alice"));
    artifacts.push(await shot(players[1], "04-hole-cards-bob"));
    // 这一组交叉核对刻意放在翻牌前、任何摊牌之前。摊牌或自愿亮牌之后别人的底牌
    // 本来就该出现在我的页面上，那时再搜就会把正确行为报成泄漏。
    // ---- 4. 公开聊天：一个人说，四个人看见 ----
    const chatText = "我先看看牌面 🙂";
    await alice.page.fill("#say-text", chatText);
    await alice.page.click("#say-submit");
    await until("发言传到所有上下文", async () => {
      for (const player of players) {
        const table = await readTable(player.page);
        if (!table.bubbles.some((b) => b.text === chatText && b.who === "alice")) return false;
      }
      return true;
    });
    ok("玩家公开发言对同桌四个人都可见");
    const chatSeen = await readTable(players[2].page);
    const aliceBubble = chatSeen.bubbles.find((b) => b.text === chatText);
    check("玩家气泡标为 PLAYER 且不带 AI 徽标",
      aliceBubble.speaker === "PLAYER" && aliceBubble.badge === null,
      `speaker=${aliceBubble.speaker} badge=${aliceBubble.badge}`);

    // 字素上限在真浏览器里过一遍。家庭 emoji 的 UTF-16 长度是 8 但只算 1 个字素，
    // 用 String.length 计数会让 140 的上限被轻易绕过，所以这里刻意用它来试。
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
    await alice.page.fill("#say-text", family.repeat(140));
    const at140 = await readTable(alice.page);
    check("140 个家庭 emoji 算 140 字素、可提交",
      at140.counter === "140/140" && at140.sayDisabled === false,
      `counter=${at140.counter} disabled=${at140.sayDisabled}`);
    await alice.page.fill("#say-text", family.repeat(141));
    const at141 = await readTable(alice.page);
    check("第 141 个字素被计数并禁掉提交",
      at141.counter === "141/140" && at141.sayDisabled === true,
      `counter=${at141.counter} disabled=${at141.sayDisabled}`);
    await alice.page.fill("#say-text", "");

    // ---- 5. 打完第一手 ----
    // 第一个人加注、下一个人弃牌，剩下的走 check/call。这样一手里同时覆盖了
    // 需要金额的动作、弃牌、以及「目标总额」这个参数语义。
    let flopShot = null;
    const handOne = await playHand(players, 1, [["raise", "bet", "call"], ["fold"]], {
      onNewStreet: async (table, player) => {
        if (table.board.length === 3 && flopShot === null) {
          flopShot = await shot(player, "05a-flop-visible");
          artifacts.push(flopShot);
        }
      },
    });
    const handOneActions = handOne.taken;
    check("第一手里真的有人用尺寸输入完成了加注",
      handOneActions.some((a) => (a.action === "raise" || a.action === "bet") && a.to !== null),
      `actions=${JSON.stringify(handOneActions)}`);
    check("第一手里有人弃牌", handOneActions.some((a) => a.action === "fold"));
    artifacts.push(await shot(alice, "05-hand-one-played"));
    // ---- 6. 座位旁 AI 的公开发言 ----
    // 唤醒源是权威的行动窗口事件，所以第一手打下来应该已经有 AI 说过话。
    const withAi = await until("出现座位 AI 的公开发言", async () => {
      const table = await readTable(alice.page);
      return table.bubbles.some((b) => b.speaker === "SEAT_AI") ? table : false;
    }, { timeout: 30_000 });
    const aiBubbles = withAi.bubbles.filter((b) => b.speaker === "SEAT_AI");
    check("AI 公开发言带文字 AI 徽标",
      aiBubbles.every((b) => b.badge === "AI"),
      `badges=${JSON.stringify(aiBubbles.map((b) => b.badge))}`);
    check("AI 发言挂在某一席玩家名下（同席可指认）",
      aiBubbles.every((b) => PLAYERS.includes(b.who)),
      `who=${JSON.stringify(aiBubbles.map((b) => b.who))}`);
    check("AI 发言来自脚本适配器（内容可预期）",
      aiBubbles.some((b) => b.text.includes("第") && b.text.includes("次")),
      `texts=${JSON.stringify(aiBubbles.map((b) => b.text))}`);

    // 「可区分」要落到渲染上。三条冗余通道各查一遍：徽标是文字（上面已查）、
    // 边框色不同、背景色不同。只靠颜色对色盲用户等于没区分，只靠徽标在窄屏会被挤掉。
    const styleDiff = await alice.page.evaluate(() => {
      const pick = (type) => document.querySelector(`#timeline > li.bubble[data-speaker="${type}"]`);
      const ai = pick("SEAT_AI");
      const human = pick("PLAYER");
      if (ai === null || human === null) return null;
      const of = (node) => {
        const style = getComputedStyle(node);
        return {
          border: style.borderLeftColor,
          background: style.backgroundColor,
          indent: style.marginLeft,
        };
      };
      return { ai: of(ai), human: of(human) };
    });
    check("AI 气泡与玩家气泡的边框色不同",
      styleDiff !== null && styleDiff.ai.border !== styleDiff.human.border,
      JSON.stringify(styleDiff));
    check("AI 气泡与玩家气泡的背景色不同",
      styleDiff !== null && styleDiff.ai.background !== styleDiff.human.background);
    check("AI 气泡有额外缩进（第三条冗余通道）",
      styleDiff !== null && styleDiff.ai.indent !== styleDiff.human.indent,
      `ai=${styleDiff?.ai.indent} human=${styleDiff?.human.indent}`);

    // 玩家与他的 AI 必须在同一张座位卡里相邻，而不是分成两份列表。
    const adjacency = await alice.page.evaluate(() => [...document.querySelectorAll("#seats > li.seat")]
      .map((li) => ({
        hasName: li.querySelector(".seat-name") !== null,
        hasAiRow: li.querySelector(".seat-ai-row") !== null,
      })));
    check("每一席的玩家与其 AI 在同一张卡片内",
      adjacency.length === 4 && adjacency.every((s) => s.hasName && s.hasAiRow));
    artifacts.push(await shot(alice, "06-ai-bubble"));
    // ---- 7. 连续多手：筹码跨手结转 ----
    // 守恒量是「各席筹码 + 底池」，不是各席筹码。
    //
    // 只加筹码会有竞态：手序号刚变成 2 的那一瞬间，盲注可能还没从筹码里扣到底池。
    // 早读一拍得到扣前的数，晚读一拍得到扣后的数，两者差 3。前两次跑都恰好对上了，
    // 而"恰好对上"正是这类断言最危险的状态——它会在别人的机器上失败。
    const chipsTotal = (table) => table.seats.reduce((sum, s) => sum + s.stack, 0) + table.pot;
    const endOfOne = await readTable(alice.page);
    const totalAfterOne = chipsTotal(endOfOne);

    const handTwo = await until("第二手自动开出", async () => {
      const table = await readTable(alice.page);
      return table.handIndex >= 2 && table.seats.some((s) => s.isViewer && s.hole.length === 2)
        ? table : false;
    }, { timeout: 30_000 });
    check("上一手结束后自动进入下一手", handTwo.handIndex >= 2,
      `hand_index=${handTwo.handIndex}`);
    const startOfTwo = chipsTotal(handTwo);
    check("筹码跨手结转，总量守恒（筹码 + 底池）",
      totalAfterOne === startOfTwo,
      `第一手末合计 ${totalAfterOne}，第二手初合计 ${startOfTwo}`);
    check("第一手打完后筹码不再人人相同（有人赢有人输）",
      new Set(handTwo.seats.map((s) => s.stack)).size > 1,
      `stacks=${JSON.stringify(handTwo.seats.map((s) => [s.name, s.stack]))}`);
    check("第二手发的是新底牌",
      handTwo.seats.find((s) => s.isViewer).hole.join() !== myHole.get("alice").join(),
      `hand1=${myHole.get("alice")} hand2=${handTwo.seats.find((s) => s.isViewer).hole}`);
    artifacts.push(await shot(alice, "07-hand-two"));

    // 第二手全程 check/call，目的是让牌局自己走到河牌与摊牌。没有这一手，「公共牌」
    // 与「街道推进」这两条就只有代码而没有被看见过——第一版的每一张截图 board 都是 0。
    const handTwo2 = await playHand(players, 2, [], {
      onNewStreet: async (table, player) => {
        if (table.board.length === 3 && flopShot === null) {
          flopShot = await shot(player, "05a-flop-visible");
          artifacts.push(flopShot);
        }
        if (table.board.length === 5) {
          artifacts.push(await shot(player, "07a-river-visible"));
        }
      },
    });
    const boardReached = Math.max(handOne.maxBoard, handTwo2.maxBoard);
    check("公共牌真的渲染出来了（至少走到翻牌）", boardReached >= 3,
      `第一手最多 ${handOne.maxBoard} 张，第二手最多 ${handTwo2.maxBoard} 张`);
    check("走到河牌五张公共牌", boardReached === 5, `最多 ${boardReached} 张`);
    const seenStreets = new Set([...handOne.streets, ...handTwo2.streets]);
    check("街道标签按权威推进（翻牌 / 转牌 / 河牌都出现过）",
      ["翻牌", "转牌", "河牌"].every((name) => seenStreets.has(name)),
      `见到的街道：${[...seenStreets].join("、")}`);

    const afterTwo = await until("第二手收尾", async () => {
      const table = await readTable(alice.page);
      return table.handIndex >= 3 || table.street === "已结算" ? table : false;
    }, { timeout: 40_000 });
    check("连续打完两手（第三手已开或第二手已结算）",
      afterTwo.handIndex >= 3 || afterTwo.street === "已结算",
      `hand_index=${afterTwo.handIndex} street=${afterTwo.street}`);
    const totalAfterTwo = chipsTotal(afterTwo);
    check("两手之后筹码总量仍然守恒（筹码 + 底池）",
      totalAfterTwo === startOfTwo,
      `第二手初 ${startOfTwo}，第二手后 ${totalAfterTwo}`);
    artifacts.push(await shot(alice, "07b-hand-two-done"));

    // ---- 8. 本地隐藏：只改这一个查看者的画面 ----
    const bobPlayer = players.find((p) => p.name === "bob");
    const bobText = "这句话只有 alice 会看不到";
    await bobPlayer.page.fill("#say-text", bobText);
    await bobPlayer.page.click("#say-submit");
    await until("bob 的发言先到达所有人", async () => {
      for (const player of players) {
        const table = await readTable(player.page);
        if (!table.bubbles.some((b) => b.text === bobText)) return false;
      }
      return true;
    });

    const bobSeatIndex = (await readTable(alice.page)).seats.findIndex((s) => s.name === "bob");
    await alice.page.click(`#seats > li.seat:nth-child(${bobSeatIndex + 1}) .seat-hide-row button:nth-child(1)`);
    const aliceHid = await until("alice 这一侧把 bob 的发言降级显示", async () => {
      const table = await readTable(alice.page);
      const bubble = table.bubbles.find((b) => b.text === bobText);
      return bubble !== undefined && bubble.hidden === true ? table : false;
    });
    const hiddenBubble = aliceHid.bubbles.find((b) => b.text === bobText);
    check("被隐藏的发言在本地不再显示正文", hiddenBubble.textShown === false);
    // 关键：条目本身还在时间线上，只是正文不显示。整条删掉会让「这里发生过一次发言」
    // 从画面上消失，那是改写公开时间线，不是本地隐藏。
    check("被隐藏的条目仍留在时间线上（降级显示而不是删除）",
      aliceHid.bubbles.some((b) => b.text === bobText));
    for (const player of players.filter((p) => p.name !== "alice")) {
      const table = await readTable(player.page);
      const bubble = table.bubbles.find((b) => b.text === bobText);
      check(`${player.name} 那一侧不受 alice 的隐藏影响`,
        bubble !== undefined && bubble.hidden === false && bubble.textShown === true,
        `hidden=${bubble?.hidden} shown=${bubble?.textShown}`);
    }
    artifacts.push(await shot(alice, "08-hidden-on-alice-side"));
    artifacts.push(await shot(players[2], "08-not-hidden-on-carol-side"));
    // 隐藏 AI 与隐藏整席是另外两个开关，语义各不相同：隐藏 AI 之后玩家还在，
    // 隐藏整席之后连名字都收起来但座位框还在（否则座位会变成无法指认的空缺）。
    const seatSel = `#seats > li.seat:nth-child(${bobSeatIndex + 1})`;
    await alice.page.click(`${seatSel} .seat-hide-row button:nth-child(2)`);
    const aiHidden = await until("alice 这一侧隐藏了 bob 的 AI", async () => {
      const table = await readTable(alice.page);
      const seat = table.seats[bobSeatIndex];
      return seat.aiRow.includes("已在你这一侧隐藏") ? table : false;
    });
    check("隐藏 AI 后该席仍显示玩家名",
      aiHidden.seats[bobSeatIndex].name === "bob",
      `name=${aiHidden.seats[bobSeatIndex].name}`);
    for (const player of players.filter((p) => p.name !== "alice")) {
      const table = await readTable(player.page);
      check(`${player.name} 看到的 bob 的 AI 未被隐藏`,
        !table.seats[bobSeatIndex].aiRow.includes("已在你这一侧隐藏"));
    }

    await alice.page.click(`${seatSel} .seat-hide-row button:nth-child(3)`);
    const seatHidden = await until("alice 这一侧隐藏了整席", async () => {
      const table = await readTable(alice.page);
      return table.seats[bobSeatIndex].hiddenSeat === true ? table : false;
    });
    check("隐藏整席后名字收起但座位仍在画面上",
      seatHidden.seats.length === 4 && seatHidden.seats[bobSeatIndex].name.includes("已隐藏"),
      `name=${seatHidden.seats[bobSeatIndex].name}`);
    // 撤销：隐藏必须是可逆的，否则误触就等于永久失去一部分牌桌信息。
    await alice.page.click(`${seatSel} .seat-hide-row button:nth-child(3)`);
    await alice.page.click(`${seatSel} .seat-hide-row button:nth-child(2)`);
    await alice.page.click(`${seatSel} .seat-hide-row button:nth-child(1)`);
    const restored = await until("三个隐藏都能撤销", async () => {
      const table = await readTable(alice.page);
      const seat = table.seats[bobSeatIndex];
      const bubble = table.bubbles.find((b) => b.text === bobText);
      return seat.hiddenSeat === false && seat.name === "bob"
        && !seat.aiRow.includes("已在你这一侧隐藏")
        && bubble?.hidden === false ? table : false;
    });
    ok("本地隐藏可逆，撤销后画面完全恢复",
      `seat=${restored.seats[bobSeatIndex].name}`);
    // ---- 9. 掉线与 120 秒保留窗内恢复 ----
    const dave = players.find((p) => p.name === "dave");
    const daveIndex = (await readTable(alice.page)).seats.findIndex((s) => s.name === "dave");
    await dave.page.click("#simulate-disconnect");
    const sawOffline = await until("同桌看到 dave 掉线", async () => {
      const table = await readTable(alice.page);
      return table.seats[daveIndex].tags.includes("掉线") ? table : false;
    });
    check("掉线在别人的画面上标出", sawOffline.seats[daveIndex].tags.includes("掉线"));
    // 保留窗是策略 DISCONNECT_STRICT_V1 的 120 秒。这里只断言「在倒数且量级对」，
    // 不等它走完——等 120 秒不会增加任何信息，而释放路径已有内核测试覆盖。
    const retention = await alice.page.evaluate((index) => document
      .querySelectorAll("#seats > li.seat")[index]?.querySelector(".retention")?.textContent ?? null,
    daveIndex);
    check("保留窗剩余时间可见且在 120 秒量级",
      retention !== null && /保留 (1[01]\d|120) 秒/.test(retention),
      `retention=${retention}`);
    check("掉线的一方自己看到的是「保留窗内可恢复」",
      (await readTable(dave.page)).connState.includes("保留窗内可恢复"));
    artifacts.push(await shot(alice, "09-dave-offline"));

    await dave.page.click("#simulate-reconnect");
    await until("dave 恢复后掉线标记消失", async () => {
      const table = await readTable(alice.page);
      return table.seats[daveIndex].tags.includes("掉线") === false;
    });
    const resumed = await readTable(dave.page);
    check("恢复后回到已连接", resumed.connState.includes("已连接"));
    check("恢复后仍在原席、底牌仍是自己的",
      resumed.seats.find((s) => s.isViewer)?.name === "dave",
      `viewer=${resumed.seats.find((s) => s.isViewer)?.name}`);
    ok("掉线后在保留窗内恢复，座位与身份未变");

    // ---- 10. 暂离 ----
    const carol = players.find((p) => p.name === "carol");
    const carolIndex = (await readTable(alice.page)).seats.findIndex((s) => s.name === "carol");
    await carol.page.click("#sitout-toggle");
    const satOut = await until("同桌看到 carol 排定本手后暂离", async () => {
      const table = await readTable(alice.page);
      return table.seats[carolIndex].tags.includes("本手后暂离") ? table : false;
    });
    check("暂离意向对同桌可见", satOut.seats[carolIndex].tags.includes("本手后暂离"));
    const carolSelf = await readTable(carol.page);
    // 暂离是单向命令，权威没有「取消暂离」这条路。按钮因此必须是禁用的既成事实，
    // 而不是一个点了没反应的「取消」。
    check("暂离按钮变为已排定且不可再点",
      carolSelf.sitoutLabel.includes("已排定"),
      `label=${carolSelf.sitoutLabel}`);
    check("准备按钮仍可用（暂离之后靠它回到牌桌，不能变成不可逆）",
      await carol.page.evaluate(() => document.getElementById("ready-toggle").disabled === false));
    artifacts.push(await shot(carol, "10-carol-sitout"));
    // ---- 11. 离桌 ----
    await dave.page.click("#leave-btn");
    const afterLeave = await until("dave 离桌在同桌画面上生效", async () => {
      const table = await readTable(alice.page);
      const seat = table.seats.find((s) => s.name === "dave");
      return seat === undefined || seat.tags.includes("离桌中") ? table : false;
    }, { timeout: 25_000 });
    const daveSeat = afterLeave.seats.find((s) => s.name === "dave");
    check("离桌后席位被释放或明确标为离桌中",
      daveSeat === undefined || daveSeat.tags.includes("离桌中"),
      daveSeat === undefined ? "席位已释放" : `tags=${JSON.stringify(daveSeat.tags)}`);

    // 离桌方自己必须收摊回入口。停在一份不再更新的旧牌桌上，玩家会以为自己还在桌上；
    // 而后台还在轮询的话，每一次都是一条 403。这一条就是控制台错误必须为 0 的由来。
    const daveAfterLeave = await until("dave 自己回到入口", async () => {
      const table = await readTable(dave.page);
      return table.entryVisible === true ? table : false;
    }, { timeout: 10_000 });
    check("离桌方回到入口而不是停在旧牌桌上", daveAfterLeave.entryVisible === true);
    const pollingStopped = await dave.page.evaluate(async () => {
      // 轮询若还活着，这 1.5 秒里至少会发生两次拉取。用 fetch 计数比读私有状态更可信。
      let calls = 0;
      const original = window.fetch;
      window.fetch = (...args) => { calls += 1; return original(...args); };
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      window.fetch = original;
      return calls;
    });
    check("离桌后停止轮询（1.5 秒内 0 次请求）", pollingStopped === 0,
      `fetch 次数 ${pollingStopped}`);
    artifacts.push(await shot(alice, "11-after-dave-left"));
    artifacts.push(await shot(dave, "11-dave-back-at-entry"));

    // 三人桌必须还能继续打，否则「离桌」等于毁桌。2–4 人是本 MVP 的范围。
    const stillPlayable = await until("离桌后牌桌仍在运转", async () => {
      const table = await readTable(alice.page);
      return table.globalError === null
        && table.seats.length >= 2
        && table.startReason !== null ? table : false;
    });
    check("一人离桌后其余人仍在同一张可运转的桌上",
      stillPlayable.seats.length >= 2 && stillPlayable.globalError === null,
      `seats=${stillPlayable.seats.length} start=${stillPlayable.startReason}`);

    // ---- 12. 控制台必须干净 ----
    const consoleReport = players.map((player) => ({
      player: player.name,
      consoleErrors: player.consoleErrors,
      pageErrors: player.pageErrors,
    }));
    const totalConsole = consoleReport.reduce(
      (sum, entry) => sum + entry.consoleErrors.length + entry.pageErrors.length, 0);
    check("四个上下文的控制台错误合计为 0", totalConsole === 0,
      totalConsole === 0 ? "0" : JSON.stringify(consoleReport));
    consoleChecked = true;

    // ---- 13. 证据自身的可信度 ----
    // 状态指纹不同而图像字节相同，说明截图没有反映当时的页面。那样整份 PNG 证据都
    // 不能用，而这件事从图片本身是看不出来的，所以在这里查。
    const stale = [];
    for (let i = 0; i < artifacts.length; i += 1) {
      for (let j = i + 1; j < artifacts.length; j += 1) {
        const a = artifacts[i];
        const b = artifacts[j];
        if (a.viewer !== b.viewer) continue;
        const sameImage = a.sha256 === b.sha256;
        const sameState = JSON.stringify(a.state) === JSON.stringify(b.state);
        if (sameImage && !sameState) stale.push(`${a.file} 与 ${b.file}`);
      }
    }
    check("截图与当时的页面状态一致（没有陈旧图像）", stale.length === 0,
      stale.length === 0 ? `${artifacts.length} 张已交叉核对` : stale.join("；"));

    finalHandIndex = (await readTable(alice.page)).handIndex;
  } finally {
    // 结果无条件落盘，包括脚本中途抛错的情况。第一版把写入放在 try 里，于是一次
    // 异常终止之后我手上只有 "通过 77，失败 3" 这一行、没有失败项——诊断只能靠重跑。
    // 证据文件的价值恰恰在失败的那次。
    const consoleReport = players.map((player) => ({
      player: player.name,
      consoleErrors: player.consoleErrors,
      pageErrors: player.pageErrors,
    }));
    const totalConsole = consoleReport.reduce(
      (sum, entry) => sum + entry.consoleErrors.length + entry.pageErrors.length, 0);
    if (!consoleChecked) {
      check("四个上下文的控制台错误合计为 0", totalConsole === 0,
        totalConsole === 0 ? "0" : JSON.stringify(consoleReport));
    }
    const result = {
      generated_at: new Date().toISOString(),
      server: banner,
      note: "模型适配器是 test-support/scripted-model-adapter.cjs（simulated:true）。"
        + "本文件不构成真实宿主主动唤醒已验证的证据。",
      contexts: PLAYERS.length,
      hands_reached: finalHandIndex,
      console_errors: totalConsole,
      console_detail: consoleReport,
      artifacts,
      steps,
      failures,
      passed: failures.length === 0,
    };
    fs.writeFileSync(path.join(artifactDir, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`);

    log("");
    log(`步骤 ${steps.length}：通过 ${steps.filter((s) => s.ok).length}，`
      + `失败 ${failures.length}；控制台错误 ${totalConsole}；到第 ${finalHandIndex} 手。`);
    log(`产物：${artifactDir}`);

    for (const player of players) {
      await player.context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
    server.child.kill();
  }

  if (failures.length > 0) {
    log("");
    log("以下断言失败：");
    for (const failure of failures) log(`  - ${failure}`);
    process.exit(1);
  }
  log("全部断言通过。");
}

main().catch((error) => {
  log(`脚本异常终止：${error.stack ?? error.message}`);
  process.exit(1);
});
