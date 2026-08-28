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
// 判定式与摘要行住在 .cjs 里，这样 node --test 也能加载它们。见那个文件的顶注。
const {
  buildResult, summarize, redactDetail,
  chipConservation, degradationVerdict, handCoverage,
} = require("./acceptance-result.cjs");

const artifactDir = path.resolve(process.argv[2] ?? "artifacts/table-web-acceptance");
fs.mkdirSync(artifactDir, { recursive: true });
// 开跑前先把上一次的判定文件删掉。
//
// 这不是清理癖。finally 里写 result.json 覆盖上一次，但进程如果在 finally 之前就死了
// （路由回调里的未处理拒绝就能做到，而那一类拒绝逃得过 main 的 catch），目录里留下的
// 就是上一次那份。上一次恰好通过的话，一次崩掉的运行在证据目录里长得和通过一模一样。
// 这和 negctl6 那次「中止却写出 passed:true」是同一类缺陷，只是这次的载体是陈旧文件。
const resultPath = path.join(artifactDir, "result.json");
fs.rmSync(resultPath, { force: true });
// 未处理的拒绝要发出声音并且让退出码非零。
//
// main 的 try/catch 只盖得住主流程。Playwright 的路由回调是另一条链：unroute 之后
// 还在飞的那一次 fulfill 会抛「Route is already handled」，那条拒绝不经过 main，
// finally 不跑、判定文件不写。至少要保证退出码不是 0，否则调用方读到的就是通过。
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`\n未处理的拒绝，本次运行不算通过：\n${message}\n`);
  fs.rmSync(resultPath, { force: true });
  process.exitCode = 1;
  process.exit(1);
});

const PLAYERS = ["alice", "bob", "carol", "dave"];
const steps = [];
const failures = [];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function ok(name, rawDetail = "") {
  const detail = redactDetail(rawDetail);
  steps.push({ name, ok: true, detail });
  log(`  [通过] ${name}${detail ? `　${detail}` : ""}`);
}

function bad(name, rawDetail) {
  const detail = redactDetail(rawDetail);
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
  // 有几段是故意让请求失败的：掐掉路由模拟断网，或者拿陈旧的版本号去撞 409。浏览器会
  // 为每个失败请求自己打一条 console error。那不是缺陷，但也不能混进「控制台错误为 0」
  // 里当没看见——两种做法都是错的：算进去会让一条正确的测试永远红，静默丢掉则等于给
  // 自己开了一个可以塞任何错误的口子。
  //
  // 所以按窗口分流：窗口内的进 expectedFailures 并在报告里单列，其余一律进 consoleErrors。
  // 窗口由脚本显式打开与关闭，不按错误文本猜——按文本过滤会顺手滤掉真实的缺陷，而且
  // 「409」这种文本恰好也是真实幂等缺陷的样子。
  const expectedFailures = [];
  const player = {
    name, context, page, consoleErrors, pageErrors, expectedFailures,
    expectFailures: false,
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    (player.expectFailures ? expectedFailures : consoleErrors).push(message.text());
  });
  page.on("pageerror", (error) => {
    (player.expectFailures ? expectedFailures : pageErrors).push(error.message);
  });
  // 离桌要过一次 window.confirm。不接对话框的话点击会一直挂着。
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  return player;
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
      // 真的在屏幕上，而不是「自己的 hidden 属性为 false」。
      //
      // 这两件事分开过一次：#scope-gate 曾经嵌在 #table-main 里面，而入口页阶段
      // #table-main 带着 hidden。于是 el.hidden === false 成立、这里报「可见」，而
      // [hidden] 的 display:none 把整棵子树都关掉了，屏幕上一片空白、按钮点不到。
      // 读 offsetParent 能同时覆盖自己隐藏和祖先隐藏两种情况（fixed 定位的元素在可见时
      // offsetParent 为 body，被 display:none 关掉时为 null）。
      scopeGateVisible: (() => {
        const node = document.getElementById("scope-gate");
        if (node === null || node.hidden === true) return false;
        return node.offsetParent !== null || node.getClientRects().length > 0;
      })(),
      // 重新确认的理由。空串表示没显示——首次入桌就该是空的。
      scopeReason: (() => {
        const node = document.getElementById("scope-reason");
        if (node === null || node.hidden === true) return "";
        return node.textContent.trim();
      })(),
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

// 服务端此刻有几个 web session。用来判「点了创建但还没确认时，服务端什么都没建」——
// 这件事在页面上看不出来，只能问服务。
async function sessionCount(page, origin) {
  return page.evaluate(async (base) => {
    const response = await fetch(`${base}/api/health`);
    const body = await response.json();
    return body.sessions;
  }, origin);
}

// 提交入口表单，停在公开范围确认那一步。此时入口页还在，什么都没建。
async function stageCreate(player) {
  await player.page.fill("#create-player", player.name);
  await player.page.click("#create-form button[type=submit]");
  await until(`${player.name} 提交后看到公开范围确认`, async () =>
    (await readTable(player.page)).scopeGateVisible);
}

async function stageJoin(player, inviteCode) {
  await player.page.fill("#join-player", player.name);
  await player.page.fill("#join-code", inviteCode);
  await player.page.click("#join-form button[type=submit]");
  await until(`${player.name} 提交后看到公开范围确认`, async () =>
    (await readTable(player.page)).scopeGateVisible);
}

// 入口幂等探针。开一个干净上下文，在页面里连发两次同键的 join，然后自己离桌。
//
// 走 fetch 而不是点按钮：页面上的连点被 entryInFlight 挡在客户端，根本到不了服务端，
// 所以点两下证明不了服务端的重放行为。要验的是「重试」——第一次的响应丢在路上，浏览器
// 用同一个键再发一次——而那在浏览器里只能这么模拟。
async function entryIdempotencyProbe(browser, origin, inviteCode) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  try {
    return await page.evaluate(async (code) => {
      const post = async (route, body) => {
        const response = await fetch(route, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      };
      const key = `entry-probe-${crypto.randomUUID()}`;
      const first = await post("/api/room/join", {
        player_id: "probe", invite_code: code, entry_key: key,
      });
      const second = await post("/api/room/join", {
        player_id: "probe", invite_code: code, entry_key: key,
      });
      // 换一个键就不再是重放。内核那条 409 必须照旧出现，否则「幂等」就变成了
      // 「任何重复加入都放过」，而那会让一个人同时占两个座。
      const other = await post("/api/room/join", {
        player_id: "probe", invite_code: code, entry_key: `entry-probe-${crypto.randomUUID()}`,
      });
      const view = await post("/api/view", { session_token: first.body.session_token });
      const seatCount = view.body.view?.seats?.length ?? -1;
      // 自己收拾干净：探针占的那一席要还回去，否则四个人凑不齐一桌。
      await post("/api/action", {
        session_token: first.body.session_token, command: "seat.leave", params: {},
      });
      // 会话令牌与入口键都不带出页面：它们是凭据，而这份返回值会进证据文件。只带出
      // 比较结果。同理，比较必须在页面内做完。
      return {
        status: [first.status, second.status],
        sameToken: first.body.session_token === second.body.session_token
          && typeof first.body.session_token === "string",
        sameSeat: first.body.seat_id === second.body.seat_id
          && typeof first.body.seat_id === "string",
        seatCount,
        differentKey: other.body.code ?? `http_${other.status}`,
      };
    }, inviteCode);
  } finally {
    await context.close();
  }
}

async function createRoom(player) {
  await stageCreate(player);
  await player.page.click("#scope-accept");
  const state = await until(`${player.name} 建房后进入牌桌`, async () => {
    const table = await readTable(player.page);
    // 等第一份视图真的落地，而不只是等 entryVisible 翻面。
    //
    // entryVisible 与 inviteCode 都是 enterTable() 同步设的，第一次 /api/view 还在路上
    // 就已经成立。于是紧接着那条「建房者自己也要过公开范围确认」读到的是 HTML 初始态
    // hidden=true，报一个不存在的缺陷——实测门在 t+500ms 出现。
    //
    // 用 seats 非空作为「视图到了」的判据：座位列表只可能由 render() 填。这不放宽断言，
    // 门若真的不出现，下面那条 check 照旧失败。
    return table.entryVisible === false && table.inviteCode !== "—" && table.seats.length > 0
      ? table : false;
  });
  return state.inviteCode;
}

async function joinRoom(player, inviteCode) {
  await stageJoin(player, inviteCode);
  await player.page.click("#scope-accept");
  await until(`${player.name} 加入后进入牌桌`, async () => {
    const table = await readTable(player.page);
    return table.entryVisible === false && table.seats.length > 0 ? table : false;
  });
}

// 确认之后对话框要关掉。确认与建座位现在是同一次点击，所以这里只等结果：
// scopeGateVisible 翻回 false 意味着 room.confirm_public_scope 真的落地了
// （renderScopeGate 读的是权威给的 public_scope_confirmed，不是本地标记）。
async function acceptScope(player) {
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
    // 每个动作之后给一次观察机会。onNewStreet 不够用：只在公共牌增加时才触发，而
    // 一手全下打在翻牌前收掉的话公共牌一张都不发，那一手里发生的事就全看不见。
    if (typeof hooks.onAction === "function") {
      await hooks.onAction(after, holder.player, taken[taken.length - 1]);
    }
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
  // 中止原因。finally 里要拿它做判定，所以只能声明在 try 之外。
  let aborted = null;
  // 路由回调里吞下的错误。回调不能往外抛（抛出去是未处理的拒绝，会绕过 main 的 catch
  // 把进程打死），但吞掉就必须留痕并且判——只吞不判等于给自己开一个静默失败的口子。
  const routeErrors = [];

  try {
    // ---- 1. 建房、邀请码加入、逐席公开范围确认 ----
    const alice = await newPlayer(browser, banner.origin, "alice");
    players.push(alice);

    // 确认在绑定之前。提交表单只该把对话框顶起来，不该建房、不该占座。
    const beforeStage = await sessionCount(alice.page, banner.origin);
    check("入口阶段服务端一个会话都没有", beforeStage === 0, `sessions=${beforeStage}`);
    await stageCreate(alice);
    const aliceGate = await readTable(alice.page);
    check("建房者自己也要过公开范围确认", aliceGate.scopeGateVisible === true);
    // 这三条一起才说明「确认在绑定之前」：对话框已经在了，入口页还在，而服务端那边
    // 什么都没建。少了最后一条就只是「对话框出现过」——改顺序之前那一版同样满足。
    check("确认之前还停在入口页", aliceGate.entryVisible === true);
    // 首次入桌不显示「为什么又问你」——正文本身就是那段说明。
    check("首次入桌不显示重新确认理由", aliceGate.scopeReason === "",
      `scopeReason=${JSON.stringify(aliceGate.scopeReason)}`);
    const duringGate = await sessionCount(alice.page, banner.origin);
    check("确认之前服务端没有建任何会话（合同：确认在绑定之前）",
      duringGate === 0, `sessions=${duringGate}`);

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

    await alice.page.click("#scope-accept");
    const aliceIn = await until("alice 确认后才进入牌桌", async () => {
      const table = await readTable(alice.page);
      return table.entryVisible === false && table.inviteCode !== "—"
        && table.seats.length > 0 ? table : false;
    });
    const inviteCode = aliceIn.inviteCode;
    check("建房拿到邀请码", typeof inviteCode === "string" && inviteCode.length >= 6,
      `invite_code=${inviteCode}`);
    const afterAccept = await sessionCount(alice.page, banner.origin);
    check("确认之后才出现会话", afterAccept === 1, `sessions=${afterAccept}`);
    await acceptScope(alice);

    // 「先不加入」这条路：现在它连座位都不该建出来。
    //
    // 改顺序之前 eve 会先落座、在公开时间线上留下 SEAT_BOUND、然后靠 seat.leave 还回去；
    // 「座位不残留」是那一版能给出的最强保证。现在要求更强一层：她从来没绑定过，所以
    // 服务端会话数不动，而 alice 的公开时间线里不该出现过 eve。
    const eve = await newPlayer(browser, banner.origin, "eve");
    await stageJoin(eve, inviteCode);
    const duringEve = await sessionCount(eve.page, banner.origin);
    check("eve 确认之前没有建会话", duringEve === 1, `sessions=${duringEve}`);
    await eve.page.click("#scope-decline");
    const eveAfter = await until("eve 拒绝后留在入口", async () => {
      const table = await readTable(eve.page);
      return table.entryVisible === true && table.scopeGateVisible === false
        ? table : false;
    });
    check("不确认公开范围就留在入口，不占座", eveAfter.entryVisible === true);
    const afterDecline = await sessionCount(eve.page, banner.origin);
    check("拒绝确认没有留下任何会话", afterDecline === 1, `sessions=${afterDecline}`);
    await eve.context.close();
    const aliceSeesEve = await readTable(alice.page);
    // 席位数取 1：此刻只剩 alice，bob/carol/dave 要到下面的循环才加入。先要求真的读到了
    // 席位，只写 every(name !== "eve") 时桌子为空也成立，而那等于什么都没证明。
    check("eve 从未出现在桌上",
      aliceSeesEve.seats.length === 1
      && aliceSeesEve.seats.every((seat) => seat.name !== "eve"),
      `seats=${JSON.stringify(aliceSeesEve.seats.map((s) => s.name))}`);
    check("eve 从未出现在公开时间线上（她没有绑定过）",
      aliceSeesEve.bubbles.every((bubble) => !(bubble.who ?? "").includes("eve")));

    // ---- 1b. 入口幂等：丢响应之后重试回到同一个座位 ----
    //
    // 真实场景是「请求到了、座位建了、响应没回来」。浏览器里没法真的把一个已完成请求的
    // 响应弄丢，所以这里直接用同一个 entry_key 发两次：第二次就是重试要走的那条路。
    // 页面上的连点由 entryInFlight 挡住，压根到不了服务端，所以那道防线证明不了这条。
    const idem = await entryIdempotencyProbe(browser, banner.origin, inviteCode);
    check("同一入口键重试回到同一个会话",
      idem.sameToken && idem.sameSeat && idem.status.every((s) => s === 200),
      JSON.stringify(idem));
    check("重试没有占掉第二个座位", idem.seatCount === 2, `seats=${idem.seatCount}`);
    check("换一个入口键不再是重放，撞上内核的 409",
      idem.differentKey === "player_binding_not_released",
      `code=${idem.differentKey}`);
    await until("探针席位被放回", async () => {
      const table = await readTable(alice.page);
      return table.seats.length === 1;
    });
    ok("入口幂等探针没有留下座位");
    for (const name of PLAYERS.slice(1)) {
      const player = await newPlayer(browser, banner.origin, name);
      players.push(player);
      await joinRoom(player, inviteCode);
      await acceptScope(player);
    }
    const roomIds = await Promise.all(
      players.map(async (p) => (await readTable(p.page)).roomId));
    check("四个隔离上下文都在同一房间",
      roomIds.length === PLAYERS.length
      && roomIds.every((id, _, all) => id === all[0] && id !== "—"),
      `room_id=${JSON.stringify(roomIds)}`);

    // ---- 1c. 绑房 / 桌规 / 发言限制版本变化 -> 重新确认 ----
    //
    // 三个维度在真实服务上都不可能在一局中途发生：桌规版本在建房时定下且没有改它的命令，
    // 换绑要另建一个房而 room.create 会撞 room_already_exists，发言限制版本整仓只有一个
    // LIVELY_V1。所以这里改写 /api/view 的响应体，让客户端收到一份「版本变了」的投影。
    //
    // 为什么用路由改写而不是给产品加一个测试钩子：钩子会在产品里留下一条能让全桌重新确认
    // 的路，而那正是隐私门最不该有的东西。改写只影响这一个浏览器上下文，服务端一无所知，
    // 而被检验的是真实的客户端代码路径——render -> renderScopeGate -> renderScopeReason。
    // 服务端那一半由 test/scope-reconfirmation.test.cjs 在单元层钉住。
    const reconfirmCases = [
      { reason: "public_limits_changed", confirmed: true, expect: "发言限制" },
      { reason: "new_room_binding", confirmed: false, expect: "新的牌桌" },
      { reason: "table_rules_changed", confirmed: false, expect: "桌规版本" },
    ];
    for (const item of reconfirmCases) {
      await alice.context.route("**/api/view", async (route) => {
        // 同 8d：unroute 之后还在飞的 fulfill 会抛，而路由回调里的抛出是未处理的拒绝。
        try {
          const response = await route.fetch();
          const body = await response.json();
          for (const seat of body.view?.seats ?? []) {
            if (seat.is_viewer !== true) continue;
            seat.public_scope_confirmed = item.confirmed;
            seat.public_scope_reconfirm_reason = item.reason;
          }
          await route.fulfill({ response, json: body });
        } catch (error) {
          if (!String(error?.message ?? error).includes("already handled")) {
            routeErrors.push(String(error?.message ?? error));
          }
        }
      });
      const shown = await until(`${item.reason} 让同意门重新出现`, async () => {
        const table = await readTable(alice.page);
        return table.scopeGateVisible && table.scopeReason !== "" ? table : false;
      }, { timeout: 15_000 });
      check(`${item.reason}：同意门重新出现并说明是哪一项变了`,
        shown.scopeReason.includes(item.expect),
        `scopeReason=${JSON.stringify(shown.scopeReason)}`);
      await alice.context.unroute("**/api/view");
      // 版本回到原样之后门必须自己收起来。不收的话玩家被永久挡在一个点了也不消失的
      // 对话框后面，而那比不弹更糟。
      await until(`${item.reason} 恢复后同意门收起`, async () => {
        const table = await readTable(alice.page);
        return table.scopeGateVisible === false && table.scopeReason === "";
      }, { timeout: 15_000 });
    }
    // public_limits_changed 那一条是三者里唯一权威不强制的：它 confirmed 仍为 true，
    // 门却必须出现。只看 confirmed 的实现会漏掉它，所以单列一条把这件事说清楚。
    ok("三个维度各自都能让同意门重新出现，且恢复后自己收起");
    artifacts.push(await shot(alice, "01c-reconfirm-cleared"));

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

    // ---- 6b. 座位旁聊天：DOM 归属 ----
    //
    // 这一节查的是「归属」，而归属必须是 DOM 父子关系，不是气泡里那行名字。
    // 只查 class 存在等于没查：一个把所有气泡塞进同一个容器再写上名字的实现也能通过。
    const attribution = await until("座位旁出现聊天气泡", async () => {
      const found = await alice.page.evaluate(() => [...document.querySelectorAll("#seats > li.seat")]
        .map((li) => ({
          seatId: li.dataset.seatId,
          name: li.querySelector(".seat-name")?.textContent?.trim() ?? null,
          // 气泡必须查得到是这张卡片的后代，而不是页面上某处的同名节点。
          bubbles: [...li.querySelectorAll(".seat-speech > li.seat-bubble")].map((b) => ({
            speaker: b.dataset.speaker,
            seatId: b.dataset.seatId,
            who: b.querySelector(".seat-bubble-who")?.textContent?.trim() ?? null,
            badge: b.querySelector(".ai-badge")?.textContent?.trim() ?? null,
            text: b.querySelector(".seat-bubble-text")?.textContent ?? "",
            // 这条气泡的最近祖先 li.seat 是不是这一席：DOM 归属的直接证据。
            ownerSeatId: b.closest("li.seat")?.dataset.seatId ?? null,
          })),
        })));
      return found.some((s) => s.bubbles.length > 0) ? found : false;
    }, { timeout: 30_000 });

    const allSeatBubbles = attribution.flatMap((s) => s.bubbles.map((b) => ({ ...b, cardSeat: s.seatId })));
    check("座位旁气泡真的挂在某一席卡片内（DOM 父子关系）",
      allSeatBubbles.length > 0 && allSeatBubbles.every((b) => b.ownerSeatId === b.cardSeat),
      `共 ${allSeatBubbles.length} 条；不匹配 ${
        allSeatBubbles.filter((b) => b.ownerSeatId !== b.cardSeat).length} 条`);
    check("座位旁气泡的 seat_id 与所在卡片一致（没有串席）",
      allSeatBubbles.every((b) => b.seatId === b.cardSeat),
      `不一致=${JSON.stringify(allSeatBubbles.filter((b) => b.seatId !== b.cardSeat).slice(0, 3))}`);

    const seatAi = allSeatBubbles.filter((b) => b.speaker === "SEAT_AI");
    check("座位旁的 AI 气泡带文字 AI 徽标", seatAi.length > 0 && seatAi.every((b) => b.badge === "AI"),
      `AI 气泡 ${seatAi.length} 条，徽标=${JSON.stringify([...new Set(seatAi.map((b) => b.badge))])}`);
    check("座位旁的 AI 气泡署名为「某人的 AI」，与玩家气泡署名不同",
      seatAi.every((b) => typeof b.who === "string" && b.who.endsWith("的 AI")),
      `who=${JSON.stringify([...new Set(seatAi.map((b) => b.who))]).slice(0, 200)}`);

    // 座位旁与时间线必须是两个区，不能互相冒充。
    const twoRegions = await alice.page.evaluate(() => ({
      seatSide: document.querySelectorAll("#seats .seat-speech > li.seat-bubble").length,
      timeline: document.querySelectorAll("#timeline > li.bubble").length,
      // 时间线的气泡不能出现在座位卡里，座位旁的气泡也不能出现在时间线里。
      timelineInsideSeat: document.querySelectorAll("#seats li.bubble").length,
      seatBubbleInsideTimeline: document.querySelectorAll("#timeline li.seat-bubble").length,
    }));
    check("座位旁与公开时间线是两个独立区域，互不嵌套",
      twoRegions.timelineInsideSeat === 0 && twoRegions.seatBubbleInsideTimeline === 0,
      JSON.stringify(twoRegions));
    check("公开时间线保留的历史条数不少于座位旁（座位旁只是最近一小组）",
      twoRegions.timeline >= twoRegions.seatSide,
      `时间线 ${twoRegions.timeline} 条，座位旁 ${twoRegions.seatSide} 条`);

    // ---- 6c. 座位旁聊天：桌面与窄屏的真实几何 ----
    //
    // 查的是矩形相交，不是 class 存在。「气泡不遮挡牌面」这句话只能这样验证：
    // 拿到 getBoundingClientRect 再算重叠。class 查得再细也证明不了两块东西没有叠在一起。
    for (const [label, size] of [["桌面", { width: 1280, height: 980 }],
      ["窄屏", { width: 420, height: 900 }]]) {
      await alice.page.setViewportSize(size);
      // 换视口后布局要重排一次再量。不等的话读到的是旧矩形。
      await alice.page.waitForTimeout(400);

      const geometry = await alice.page.evaluate(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (node === null) return null;
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
        };
        const overlap = (a, b) => {
          if (a === null || b === null) return 0;
          const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          return w > 0 && h > 0 ? Math.round(w * h) : 0;
        };
        const bubbles = [...document.querySelectorAll("#seats .seat-speech > li.seat-bubble")]
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
          });
        // 参照物用 .board-area 而不是 #board。
        //
        // #board 是一个空的 <ol>，还没发公共牌时宽高都是 0——那时任何重叠都算成 0，
        // 「不遮挡」这条断言就永远为真。负对照跑出来正是这个：气泡钉在公共牌上，
        // overlapBoard 仍然报 0。参照物必须自己有真实尺寸，否则断言是空的。
        const boardArea = rect(".board-area");
        const board = rect("#board");
        const actions = rect("#actions");
        const pot = rect(".pot");
        return {
          viewport: { w: window.innerWidth, h: window.innerHeight },
          bubbleCount: bubbles.length,
          // 每个气泡与公共牌区、行动区、底池的重叠面积。全部应为 0。
          overlapBoard: bubbles.reduce((sum, b) => sum + overlap(b, boardArea), 0),
          overlapActions: bubbles.reduce((sum, b) => sum + overlap(b, actions), 0),
          overlapPot: bubbles.reduce((sum, b) => sum + overlap(b, pot), 0),
          // 参照物自己的尺寸。它们退化时上面那三个 0 没有意义。
          refs: {
            boardArea, actions, pot,
            degenerate: [boardArea, actions, pot]
              .filter((r) => r === null || r.w < 20 || r.h < 10).length,
          },
          // 可读性：气泡必须有真实尺寸。0 宽或 0 高等于「藏起来算不遮挡」。
          degenerate: bubbles.filter((b) => b.w < 40 || b.h < 10).length,
          // 气泡不得溢出所在座位卡片的横向范围——溢出就会压到相邻席位上。
          overflowingCard: [...document.querySelectorAll("#seats > li.seat")].reduce((n, card) => {
            const c = card.getBoundingClientRect();
            const inside = [...card.querySelectorAll(".seat-speech > li.seat-bubble")];
            return n + inside.filter((b) => {
              const r = b.getBoundingClientRect();
              return r.right > c.right + 1 || r.x < c.x - 1;
            }).length;
          }, 0),
          // 座位区整体是否还在文档流里（窄屏下塌成一列，但不该被推到负坐标之外）。
          seatsRect: rect("#seats"),
          boardRect: board,
          actionsRect: actions,
        };
      });

      // 先证明参照物有尺寸，再看重叠。顺序反过来的话，一个 0 宽的参照物会让
      // 下面三条全部通过而什么都没验证——负对照跑出来就是这样。
      check(`${label}：几何参照物本身有真实尺寸（否则"不相交"是空话）`,
        geometry.refs.degenerate === 0,
        `退化 ${geometry.refs.degenerate} 个：${JSON.stringify(geometry.refs)}`);
      check(`${label}：座位旁气泡与公共牌区不相交`,
        geometry.overlapBoard === 0,
        `重叠 ${geometry.overlapBoard}px²　气泡 ${geometry.bubbleCount} 个　视口 ${
          geometry.viewport.w}x${geometry.viewport.h}`);
      check(`${label}：座位旁气泡与行动区不相交`,
        geometry.overlapActions === 0, `重叠 ${geometry.overlapActions}px²`);
      check(`${label}：座位旁气泡与底池不相交`,
        geometry.overlapPot === 0, `重叠 ${geometry.overlapPot}px²`);
      check(`${label}：气泡有可读尺寸（没有靠压成 0 尺寸来"不遮挡"）`,
        geometry.bubbleCount > 0 && geometry.degenerate === 0,
        `退化 ${geometry.degenerate} / ${geometry.bubbleCount} 个`);
      check(`${label}：气泡不横向溢出所在座位卡片（不压到相邻席位）`,
        geometry.overflowingCard === 0, `溢出 ${geometry.overflowingCard} 个`);
      check(`${label}：公共牌与行动区都还在视口内`,
        geometry.boardRect !== null && geometry.actionsRect !== null
          && geometry.boardRect.y >= 0 && geometry.actionsRect.h > 0,
        `board.y=${geometry.boardRect?.y} actions.h=${geometry.actionsRect?.h}`);

      artifacts.push(await shot(alice, `06b-seat-speech-${label === "桌面" ? "desktop" : "narrow"}`));
    }
    // 量完恢复桌面视口，后面的步骤都按桌面几何写的。
    await alice.page.setViewportSize({ width: 1280, height: 980 });
    await alice.page.waitForTimeout(300);

    // ---- 6d. 座位旁聊天：约 10 秒后退出 ----
    //
    // 单元测试已经钉了投影层的阈值，但那是拿注入时钟算的。这里要证明真浏览器里它真的
    // 会消失：轮询把新的 view 拿回来，气泡随之退出。盯一条具体的文本而不是盯条数——
    // 脚本适配器还在说话，条数会来回变，而「这一条走了」是确定的。
    const beforeExit = await alice.page.evaluate(() => {
      const first = document.querySelector("#seats .seat-speech > li.seat-bubble");
      return first === null ? null : {
        text: first.querySelector(".seat-bubble-text")?.textContent ?? "",
        seatId: first.dataset.seatId,
      };
    });
    if (check("座位旁至少有一条气泡可用于观察退出", beforeExit !== null)) {
      const stillThere = async () => alice.page.evaluate((target) => {
        const texts = [...document.querySelectorAll("#seats .seat-speech > li.seat-bubble")]
          .map((n) => n.querySelector(".seat-bubble-text")?.textContent ?? "");
        const timelineTexts = [...document.querySelectorAll("#timeline > li.bubble")]
          .map((n) => n.querySelector(".bubble-text")?.textContent ?? "");
        return {
          besideSeat: texts.includes(target.text),
          inTimeline: timelineTexts.includes(target.text),
        };
      }, beforeExit);

      const atStart = await stillThere();
      check("观察起点：那条气泡此刻在座位旁", atStart.besideSeat === true, JSON.stringify(atStart));

      // 等过阈值。多给 3 秒余量：轮询间隔 700ms，且这一步不该因为差半秒就偶发。
      const exited = await until("座位旁那条气泡退出", async () => {
        const now = await stillThere();
        return now.besideSeat === false ? now : false;
      }, { timeout: 20_000, interval: 500 });

      check("约 10 秒后那条气泡从座位旁退出", exited.besideSeat === false);
      check("退出之后它仍然留在公开时间线里（退出不是删历史）",
        exited.inTimeline === true, JSON.stringify(exited));
    }
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

    // ---- 8b. 自愿亮牌：成功、重复、陈旧版本号 ----
    //
    // 规则 4：只有 all_others_folded 的赢家可自愿亮牌。之前这个按钮从来没有成功过一次——
    // 客户端只发 hand_id，而核心要 hand_id + expected_revision + idempotency_key 三样，
    // 于是每一次点击都以 invalid_field 被拒。它不显眼是因为亮牌只在「其余人全弃牌、你是
    // 赢家」时才出现，而自动化里没有任何一步点过它。
    //
    // 打一手全弃牌局面出来。三个人弃牌之后只剩一个，权威把这一手判为 all_others_folded。
    //
    // 刻意不用 playHand：它要等到手序号变化才返回，而手间展示窗只有 3 秒——等它返回时
    // 亮牌窗口已经关了，can_reveal 变回 false，权威那边也换了 hand_id。这里显式弃三次，
    // 弃完立刻进窗口。
    //
    // 窗口只有 3 秒是产品语义（room-store 的 interHandEndsAt，与首手 Ready 倒计时同为
    // 3 秒），不是这里能改的东西。所以下面这一整段要快：identify -> click -> 读对手视角
    // -> 重复点 -> 三条 HTTP 探针，全部走完在几百毫秒量级。
    const revealHandIndex = (await readTable(alice.page)).handIndex;
    let folded = 0;
    for (let guard = 0; guard < 12 && folded < 3; guard += 1) {
      let holder;
      try {
        holder = await findActor(players, `亮牌前第 ${folded + 1} 次弃牌`);
      } catch {
        break; // 没有人该行动了，这一手已经收尾。
      }
      // 点击前重读。findActor 的快照会被行动超时的自动结算作废：权威到期会替人 check
      // 或 fold，于是那份「谁有哪些按钮」的记录指向的已经是上一个行动者。直接照它点，
      // 结果是等一个已经消失的按钮等到超时——脚本挂在这里，而牌桌本身没有任何问题。
      const fresh = await readTable(holder.player.page);
      if (fresh.handIndex > revealHandIndex) break;
      const available = fresh.myActions.map((a) => a.action);
      if (available.length === 0) continue;
      const pick = available.includes("fold") ? "fold" : available[0];
      await holder.player.page.click(`#action-buttons button[data-action="${pick}"]`);
      if (pick === "fold") folded += 1;
      await sleep(200);
    }
    check("亮牌前确实弃到只剩一个人（三次弃牌都落下去了）", folded === 3,
      `实际弃牌 ${folded} 次`);

    // 并行、在页面内轮询，把往返次数压到最低。串行读四个页面在 3 秒窗口里太慢。
    const revealHolders = await until("全弃牌收尾后出现可亮牌的赢家", async () => {
      const flags = await Promise.all(players.map((p) => p.page.evaluate(() =>
        document.getElementById("reveal-btn")?.hidden === false)));
      const holders = players.filter((_, index) => flags[index]);
      return holders.length > 0 ? holders : false;
    }, { timeout: 8_000, interval: 120 });
    check("全弃牌收尾后恰好一个人可以自愿亮牌（赢家），其余人都不行",
      revealHolders.length === 1,
      `可亮牌的人=${JSON.stringify(revealHolders.map((p) => p.name))}`);

    if (revealHolders.length === 1) {
      const winner = revealHolders[0];
      const others = players.filter((p) => p.name !== winner.name);
      // 席位下标在页面内直接按名字找，省一次整表读取。
      const seatHoleOf = (page, name) => page.evaluate((who) => {
        const seat = [...document.querySelectorAll("#seats > li.seat")]
          .find((li) => li.querySelector(".seat-name")?.textContent?.trim() === who);
        return [...(seat?.querySelectorAll(".seat-hole .card-face") ?? [])]
          .map((c) => c.textContent.trim());
      }, name);

      // 亮牌前：别人看到的必须是暗牌。没有这一条，「亮牌后能看到」就可能是因为一直看得到。
      const beforeReveal = await Promise.all(others.map(async (p) => ({
        viewer: p.name,
        hole: await seatHoleOf(p.page, winner.name),
      })));
      check("亮牌前对手看到的是暗牌",
        beforeReveal.length > 0
        && beforeReveal.every((entry) => entry.hole.length === 2
          && entry.hole.every((card) => card === "?")),
        JSON.stringify(beforeReveal));

      await winner.page.click("#reveal-btn");
      const revealedFor = await until("亮牌后对手看到赢家的两张底牌", async () => {
        const seen = await Promise.all(others.map(async (p) => ({
          viewer: p.name,
          hole: await seatHoleOf(p.page, winner.name),
        })));
        return seen.every((entry) => entry.hole.length === 2
          && entry.hole.every((card) => card !== "?")) ? seen : false;
      }, { timeout: 6_000, interval: 120 });
      check("自愿亮牌成功，同桌都看到那两张牌", true, JSON.stringify(revealedFor));
      check("亮出来的是同一副牌，不是每人看到一份不同的",
        new Set(revealedFor.map((entry) => entry.hole.join(","))).size === 1,
        JSON.stringify(revealedFor));
      artifacts.push(await shot(others[0], "08b-voluntary-reveal-seen-by-others"));

      // 重复：再点一次不得报错，也不得把牌变成别的。
      await winner.page.click("#reveal-btn");
      await sleep(250);
      const secondClickError = await winner.page.evaluate(() =>
        (document.getElementById("global-error")?.hidden === false
          ? document.getElementById("global-error").textContent.trim() : null));
      check("再点一次亮牌不产生错误（重放被识别，不是一条玩家看不懂的失败）",
        secondClickError === null, `globalError=${JSON.stringify(secondClickError)}`);
      const stillSame = await Promise.all(others.map(async (p) =>
        (await seatHoleOf(p.page, winner.name)).join(",")));
      check("重复亮牌后牌面不变",
        new Set([...stillSame, revealedFor[0].hole.join(",")]).size === 1,
        JSON.stringify(stillSame));

      // 陈旧版本号：直接打同一条 HTTP 出口，带一个过期的 expected_revision。
      // 这一步刻意绕过按钮——按钮永远拿当前投影，构造不出陈旧请求。绕过的是 UI 而不是
      // 权威：走的还是浏览器里那条 /api/action，凭据仍在协调器侧注入。
      // 下面两条探针故意要 409。浏览器会为每个非 2xx 的 fetch 自己打一条 console error，
      // 那不是缺陷，但也不能悄悄不算——所以进故意失败窗口，单列在证据里。
      winner.expectFailures = true;
      const staleOutcome = await winner.page.evaluate(async () => {
        const token = sessionStorage.getItem("tokengame.table.session_token");
        const view = await (await fetch("/api/view", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_token: token }),
        })).json();
        const panel = view.view.action_panel;
        const send = async (params) => {
          const response = await fetch("/api/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_token: token, command: "hand.reveal", params }),
          });
          return { status: response.status, body: await response.json() };
        };
        // 按钮用的键。上面两次点击已经把它提交进账本了，所以它是「已存在的键」。
        const buttonKey = `reveal:${panel.hand_id}:${panel.expected_revision}`;
        return {
          panel_revision: panel.expected_revision,
          // 新键 + 陈旧版本号。三道门的顺序是 hand_id -> 幂等账 -> revision，新键在账上
          // 查不到东西，所以这一条会一直走到第三道门。
          staleWithFreshKey: await send({
            hand_id: panel.hand_id,
            expected_revision: panel.expected_revision - 1,
            idempotency_key: `reveal-stale-fresh-${panel.hand_id}`,
          }),
          // 已存在的键 + 换掉的版本号。这一条在第二道门就被拦下，所以它测的是另一件事。
          existingKeyDifferentRevision: await send({
            hand_id: panel.hand_id,
            expected_revision: panel.expected_revision - 1,
            idempotency_key: buttonKey,
          }),
          // 已存在的键 + 同一个版本号：这才是真正的重发，必须回原结果而不是报错。
          trueReplay: await send({
            hand_id: panel.hand_id,
            expected_revision: panel.expected_revision,
            idempotency_key: buttonKey,
          }),
        };
      });
      check("新键带陈旧 expected_revision 被确定性拒绝",
        staleOutcome.staleWithFreshKey.body?.code === "revision_conflict",
        JSON.stringify(staleOutcome.staleWithFreshKey));
      // 拒的理由必须不同：前一条是「你的状态过期了，刷新再来」，这一条是「你用同一个键
      // 做了另一件事」。两者混成一个码时，客户端分不清该刷新还是该换键。
      check("已用过的幂等键换掉版本号被拒为键冲突，而不是当成同一个请求重放",
        staleOutcome.existingKeyDifferentRevision.body?.code === "idempotency_key_conflict",
        JSON.stringify(staleOutcome.existingKeyDifferentRevision));
      check("同键同版本号的重发回到原结果（丢响应后的重试不该失败）",
        staleOutcome.trueReplay.body?.ok === true
        && staleOutcome.trueReplay.body?.result?.replay === true,
        JSON.stringify(staleOutcome.trueReplay));
      // 两条 409 探针必须真的产生过失败请求，否则「被拒」这件事没有发生在浏览器里。
      check("两条故意失败的探针确实撞出了失败请求",
        winner.expectedFailures.length >= 2,
        `窗口内 ${winner.expectedFailures.length} 条：${JSON.stringify(winner.expectedFailures)}`);
      winner.expectFailures = false;
      ok("自愿亮牌的成功、重复与陈旧版本号三条路径都走过",
        `winner=${winner.name} revision=${staleOutcome.panel_revision}`);
    }

    // ---- 8c. 连续打到第 10 手以上：多人局、全下与边池、单挑 ----
    //
    // 前面几节各自钉一条不变量，但都只在头两三手里。跨十手要暴露的是另一类问题：
    // 累积的状态错误。筹码结转、按钮位轮转、边池归属、手序号，这些在第二手上对，
    // 在第八手上不一定还对——而对局本来就要连着打很多手。
    //
    // 放在这里而不是最后：第 10 / 11 节会让人暂离与离桌，那之后桌上凑不出多人局。
    const HAND_TARGET = 10;
    const startHand = (await readTable(alice.page)).handIndex;
    const stacksBefore = (await readTable(alice.page)).seats.map((s) => s.stack);
    const totalBefore = stacksBefore.reduce((sum, value) => sum + value, 0);
    let allInSeen = false;
    let allInTagSeen = false;
    let headsUpSeen = false;
    let multiwaySeen = false;
    const handsPlayed = [];
    const conservationSamples = [];

    for (let guard = 0; guard < HAND_TARGET + 6; guard += 1) {
      const before = await readTable(alice.page);
      const current = before.handIndex;
      if (current > HAND_TARGET) break;

      // 偏好是「按行动顺序消费」的队列，不是按席位下标——playHand 对每一个行动者
      // shift 一项。所以这里写的是这一手前几个动作长什么样，而不是谁做什么。
      //
      // 每三手换一种形状，好让不同的对局都出现，而不是十手都打成同一种：
      // 全下一次（走全下按钮与全下标记）、两弃两跟一次（多人变单挑）、全程过牌一次。
      // 用 all_in 而不是大额 raise——raise 会被 max_to 夹住，夹住之后这一手只是普通
      // 加注，而断言仍写着「全下」。
      //
      // 全下这一手刻意让其余人全弃，不让人跟。跟注的全下会按牌力把一席打到 0，而筹码
      // 归零的席位进 sit out 且再也进不了下一手（test/cross-hand-stacks.test.cjs 的两条
      // F1）。破产的是谁取决于发牌，而第 9 到 11 节各自依赖 dave / carol / bob 还在牌里：
      // 一次运行里 dave 破产，第 9 节就在「reload 前 dave 看得到自己两张底牌」上红了，
      // 而那不是缺陷，是我这一节把下游的前置条件打掉了。
      // 有人跟的全下摊牌另放在第 14 节，那时后面已经没有依赖它的东西了。
      const shape = current % 3;
      const preferences = shape === 0
        ? [["all_in"], ["fold"], ["fold"], ["fold"]]
        : shape === 1
          ? [["fold"], ["fold"], ["check", "call"], ["check", "call"]]
          : [["check", "call"], ["check", "call"], ["check", "call"], ["check", "call"]];

      // 整手之内是否出现过全下标记：只在手末读的话读不到——结算之后标记已经不在了。
      // 用 onAction 而不是 onNewStreet：全下常常把一手打在翻牌前就收掉，那一手一张
      // 公共牌都不发，onNewStreet 一次都不触发。第一版就是这么漏掉的。
      // 这一手里还在争池的最少家数。判据是「还在这手牌里且没弃牌」，从 DOM 读：
      // 底牌位有牌就是在这手牌里（别人画两张暗牌，src/../table.js:536 的 in_hand 分支），
      // 弃牌另有 dataset.folded。
      //
      // 第一版数的是「有多少个不同的人动过手」，那让单挑变成了发牌运气：两弃两跟的一手里
      // 四个人都动过，于是被算成多人局，而摊牌其实只有两家。上一次运行凑巧出现过一次
      // 两人都动的手所以判通过，下一次就红了——一条看牌运气的断言比没有断言更糟，
      // 它会教人重跑到绿。这样数则是由弃牌偏好定死的：两弃必然剩两家。
      let minContenders = Number.POSITIVE_INFINITY;
      const observe = (table) => {
        if (table.seats.some((s) => s.tags.includes("全下"))) allInTagSeen = true;
        const live = table.seats.filter((s) => s.hole.length > 0 && !s.folded).length;
        if (live >= 2 && live < minContenders) minContenders = live;
      };
      const played = await playHand(players, current, preferences, { onAction: observe });
      // 逐动作扫一遍，比看标记可靠：动作是玩家真的点下去的。
      if (played.taken.some((a) => a.action === "all_in")) allInSeen = true;
      const contenders = Number.isFinite(minContenders) ? minContenders : null;
      handsPlayed.push({
        hand: current, shape, actions: played.taken.length,
        streets: played.streets, board: played.maxBoard, contenders,
      });
      if (contenders === 2) headsUpSeen = true;
      if (contenders !== null && contenders >= 3) multiwaySeen = true;

      const after = await readTable(alice.page);
      // 每一手都查筹码守恒。放在循环里而不是循环后：第 8 手上出现的偏差，循环后那一次
      // 检查只会告诉你「总额不对」，读不出是哪一手开始不对的。
      //
      // 判据是双边界，不是等式。等式在这里必然误报，原因是 #pot-total 与 #chips 的语义
      // 按阶段切换（src/host/table-view-model.cjs:180-192、holdem.cjs:782）：
      //   手内   —— stack 是引擎值（已扣下注），pot 是争夺中的池，两者相加守恒。
      //   结算后 —— stack 是账本值（赢的已经进账），而 pot 仍显示 settlement.total_pot。
      //             此时相加是把池算了两遍，第一版写成等式就在第 7 手上炸了（800+3=803）。
      // 而 DOM 里读不到 in_hand，所以从画面上分不清当前是哪个阶段。双边界两个阶段都成立，
      // 并且仍然能同时抓住凭空产生（上界）与凭空消失（下界）。
      const conserved = chipConservation({
        seatStacks: after.seats.map((s) => s.stack),
        pot: after.pot,
        startingTotal: totalBefore,
      });
      conservationSamples.push({ hand: current, seats: conserved.total, pot: conserved.pot });
      check(`第 ${current} 手之后筹码没有凭空产生（席位合计不超过起始总额）`,
        !conserved.created,
        `席位合计 ${conserved.total}，起始总额 ${totalBefore}`);
      check(`第 ${current} 手之后筹码没有凭空消失（席位加池不少于起始总额）`,
        !conserved.destroyed,
        `席位合计 ${conserved.total} + 池 ${conserved.pot} = ${conserved.total + conserved.pot}`
          + `，起始总额 ${totalBefore}`);

      const live = after.seats.filter((s) => Number.isFinite(s.stack) && s.stack > 0).length;
      if (live < 2) {
        ok(`桌上有筹码的席位剩 ${live} 家，按名单开不出下一手`,
          `停在第 ${current} 手`);
        break;
      }
      // 等手序号真的往前走，再进下一轮。playHand 是在「找不到行动者」时退出的，而那既可能
      // 是这一手收完了，也可能是下一手还没开出来——全弃牌收尾时还要过一次自愿亮牌窗口。
      // 第一版在这里立刻读手序号，读到没动就判失败，而那一手其实已经结算完了，只是下一手
      // 还没开始。所以这里等，等不到才算真的卡住。
      let advanced = true;
      try {
        await until(`第 ${current} 手之后开出下一手`, async () =>
          (await readTable(alice.page)).handIndex > current, { timeout: 40_000 });
      } catch {
        advanced = false;
      }
      if (!advanced) {
        bad(`第 ${current} 手之后 40 秒内没有开出下一手`,
          `已走动作 ${played.taken.length} 个，街道 ${JSON.stringify(played.streets)}`
            + `，有筹码的席位 ${live} 家`);
        break;
      }
    }

    const reached = (await readTable(alice.page)).handIndex;
    check(`从第 ${startHand} 手连续打到第 ${HAND_TARGET} 手以上`, reached > HAND_TARGET,
      `实际到第 ${reached} 手，逐手记录：${JSON.stringify(handsPlayed)}`);
    // 覆盖判定走 handCoverage：判据本身要能被单元测试碰到，否则「这一段覆盖了单挑与
    // 全下」只是一句写在浏览器脚本里、没人验过的话。
    const coverage = handCoverage(handsPlayed, {
      target: HAND_TARGET, headsUp: headsUpSeen, multiway: multiwaySeen,
      allInAction: allInSeen, allInTag: allInTagSeen,
    });
    check("这一段真的覆盖到单挑、多人局、全下与翻牌，不只是跑完没报错",
      coverage.ok,
      coverage.ok
        ? `到第 ${coverage.reached} 手，${coverage.hands} 手记录，${coverage.withFlop} 手见到翻牌`
        : `未覆盖：${coverage.reasons.join("；")}`);

    // 边池：浏览器这一层证不了。投影只给 pot_total（src/host/table-view-model.cjs:456），
    // 引擎算出来的 pots 分层根本没进 tokengame.table-view.v1，所以 DOM 里没有边池可读。
    // 分层本身由 test/holdem-engine.test.cjs「三个不同深度的 all-in 形成主池和两层边池」
    // 与 test/cross-hand-stacks.test.cjs「all-in 与边池结算后的 stack 跨手延续」在单元层
    // 钉住。这里如实记为覆盖缺口，不写成一条读 undefined 的断言——那种断言永远为真。
    ok("边池分层在浏览器层不可观测（投影只含 pot_total），已记为覆盖缺口",
      "分层由 holdem-engine 与 cross-hand-stacks 两个单元测试覆盖");

    const stacksAfter = (await readTable(alice.page)).seats.map((s) => s.stack);
    check("十手之后筹码分布确实变了，不是每手都回到原样",
      JSON.stringify(stacksAfter) !== JSON.stringify(stacksBefore),
      `前 ${JSON.stringify(stacksBefore)} 后 ${JSON.stringify(stacksAfter)}`
        + `，逐手守恒采样 ${JSON.stringify(conservationSamples)}`);
    artifacts.push(await shot(alice, "8c-after-ten-hands"));

    // ---- 8d. 畸形模型输出：浏览器里的有界降级 ----
    //
    // 单元层已经覆盖了投影降级（test/view-model-degradation.test.cjs）与模型输出降级
    // （test/model-output-degradation.test.cjs），但那两层都在进程内。这一节要的是
    // 浏览器里那一跳：/api/view 回一份畸形投影时，页面必须退化而不是停在上一帧。
    //
    // 停在上一帧是最坏的表现：牌桌看起来还在，只是不动了，而画面上没有任何东西说明
    // 发生了什么。一张空桌子能看出问题，一张不动的旧桌子看起来是真的。
    const malformedShapes = [
      { label: "seats 不是数组", mutate: (view) => { view.seats = "nope"; } },
      { label: "seats 里混进 null", mutate: (view) => { view.seats = [null, ...view.seats]; } },
      { label: "timeline 不是数组", mutate: (view) => { view.timeline = 42; } },
      { label: "hand 整个缺失", mutate: (view) => { delete view.hand; } },
      { label: "整份投影是 null", mutate: null },
    ];
    // 这一段里的失败请求与解析错误是故意造出来的，浏览器会各自打一条 console error。
    // 开窗口把它们分流到 expectedFailures，而不是过滤错误文本——按文本过滤会顺手滤掉
    // 真实缺陷。
    // carol 在第 11 节才用 players.find 取出来，这里不能直接用那个名字（TDZ）。
    // 用同一份 players 自己取一份局部引用。
    const projectionViewer = players.find((p) => p.name === "carol");
    projectionViewer.expectFailures = true;
    const shapeBefore = await readTable(projectionViewer.page);
    const shapeReport = [];
    for (const shape of malformedShapes) {
      // 送达计数。没有它这一节可能什么都没测到：路由没命中，或者改错了层（投影嵌在
      // body.view 里，不在顶层），页面收到的就是一份完好的投影，于是「页面没停死」
      // 恒为真、整组断言全绿。第一版正是只有断言没有计数。
      let delivered = 0;
      await projectionViewer.context.route("**/api/view", async (route) => {
        // 整个回调包一层 try：unroute 之后还在飞的那一次 fulfill 会抛
        // 「Route is already handled」，而路由回调抛出的错误不经过 main 的 catch，
        // 它是一条未处理的拒绝，会在 finally 之前把进程打死、判定文件写不出来。
        try {
          const response = await route.fetch();
          if (shape.mutate === null) {
            delivered += 1;
            await route.fulfill({ response, json: null });
            return;
          }
          let body;
          try {
            body = await response.json();
          } catch {
            await route.fulfill({ response });
            return;
          }
          if (body.view === undefined || body.view === null) {
            await route.fulfill({ response });
            return;
          }
          shape.mutate(body.view);
          delivered += 1;
          await route.fulfill({ response, json: body });
        } catch (error) {
          // 已经被处理过的路由无事可做。其余错误也不能从这里抛——抛出去就是未处理的
          // 拒绝。落在 routeErrors 里，由下面一条断言判。
          if (!String(error?.message ?? error).includes("already handled")) {
            routeErrors.push(String(error?.message ?? error));
          }
        }
      });
      // 等够两个轮询周期，确保至少一次畸形响应真的到过页面。
      await sleep(1600);
      check(`畸形投影（${shape.label}）真的送到了页面`, delivered > 0,
        `改写并送达 ${delivered} 次`);
      // 判据不是「画面正常」——畸形投影下画面本来就该退化。判据是页面还活着：
      // 还能被读到、还在轮询、没有把整页卡死在一个抛出的渲染函数里。
      let during = null;
      try {
        during = await readTable(projectionViewer.page);
      } catch (error) {
        during = null;
      }
      check(`畸形投影（${shape.label}）没有让页面整体停死`,
        during !== null && typeof during.handIndex === "number",
        during === null ? "DOM 读不出来了" : `读到手序号 ${during.handIndex}`);
      // 还必须仍然是牌桌，而不是被打回入口页——被打回入口页等于把玩家踢出了牌桌，
      // 而这只是一次坏响应。
      check(`畸形投影（${shape.label}）没有把玩家打回入口页`,
        during !== null && during.entryVisible === false,
        `entryVisible=${during?.entryVisible ?? "（读不到）"}`);
      // 页面对每一种畸形的反应如实记下来，不预设哪一种。产品有两条正当的降级路：
      // render 抛错 -> refresh 的 catch -> #global-error 显示出来；或者字段本来就带
      // 可选链与默认值 -> 静默退到合理值。两条都对，但「五种畸形全都静默」不对——
      // 那意味着任何坏投影都只表现为一张不动的旧牌桌。下面单列一条钉这件事。
      shapeReport.push({
        shape: shape.label, delivered,
        banner: during?.globalError ?? null,
        hand: during?.handIndex ?? null,
        seats: during?.seats.length ?? null,
      });
      await projectionViewer.context.unroute("**/api/view");
      // 坏响应过去之后必须自己恢复。恢复靠的是下一次正常轮询，不需要玩家刷新——
      // 需要刷新才能回来的话，一次网络抖动就等于把人赶下桌。
      const recovered = await until(`恢复正常投影后页面自己回来（${shape.label}）`,
        async () => {
          const table = await readTable(projectionViewer.page);
          return table.seats.length === shapeBefore.seats.length ? table : false;
        }, { timeout: 20_000 });
      check(`畸形投影（${shape.label}）过去之后页面自己恢复，不需要刷新`,
        recovered.seats.length === shapeBefore.seats.length
          && recovered.entryVisible === false,
        `席位数 ${recovered.seats.length}，畸形前 ${shapeBefore.seats.length}`);
    }
    // 至少一种畸形必须在画面上说出来。全部静默的话，坏投影的唯一表现就是一张不动的
    // 旧牌桌——玩家看不出发生了什么，而那比一张空桌子更糟：空桌子能看出问题，
    // 不动的旧桌子看起来是真的。
    const degradation = degradationVerdict(shapeReport);
    check("每一种畸形都真的送到了页面，且不是全部静默降级",
      degradation.ok,
      degradation.ok
        ? `${degradation.delivered}/${degradation.shapes} 种送达；`
          + `报错的 ${JSON.stringify(degradation.withBanner)}；`
          + `静默的 ${JSON.stringify(degradation.silent)}`
        : degradation.reasons.join("；"));
    ok("逐种畸形的实际反应", JSON.stringify(shapeReport));
    // 报错之后必须自己把提示收掉。不收的话玩家被一条永久的错误条挡着，
    // 而牌桌其实已经好了。
    const bannerCleared = await until("恢复正常投影后错误提示自己收起", async () =>
      (await readTable(projectionViewer.page)).globalError === null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    check("坏投影过去之后错误提示自己收起，不需要刷新", bannerCleared,
      `globalError=${JSON.stringify((await readTable(projectionViewer.page)).globalError)}`);
    projectionViewer.expectFailures = false;
    check("畸形投影全过去之后，这一席看到的席位数与畸形前一致",
      (await readTable(projectionViewer.page)).seats.length === shapeBefore.seats.length);
    artifacts.push(await shot(projectionViewer, "8d-after-malformed-projections"));

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

    // ---- 9b. 真实 reload：按 F5 不该丢席位 ----
    //
    // 与上面那个「模拟掉线」按钮是两件事。按钮走的是协调器的 disconnect/resume，页面本身
    // 一直活着，内存里的会话令牌没丢；reload 会把整个 JS 世界扔掉重建，所以它检验的是
    // 「浏览器还能不能说出自己是谁」。已确认用户结果要求页面中断后回到原座位
    // （PROJECT-DECISION-LOG.md 的 SESSION-LAUNCH included 第五条）。
    const beforeReload = await readTable(dave.page);
    const daveSeatIdBefore = beforeReload.seats.find((s) => s.isViewer)?.seatId ?? null;
    const daveHoleBefore = beforeReload.seats.find((s) => s.isViewer)?.hole ?? [];
    check("reload 前 dave 确实在席且看得到自己两张底牌",
      daveSeatIdBefore !== null && daveHoleBefore.length === 2
      && daveHoleBefore.every((c) => c !== "?"),
      `seat=${daveSeatIdBefore} hole=${daveHoleBefore.join(",")}`);

    await dave.page.reload({ waitUntil: "domcontentloaded" });
    const afterReload = await until("reload 后 dave 自动回到牌桌", async () => {
      const table = await readTable(dave.page);
      return table.entryVisible === false && table.seats.length > 0 ? table : false;
    });
    check("真实 reload 之后不落回入口页", afterReload.entryVisible === false);
    check("真实 reload 之后仍是同一个 seat_id",
      afterReload.seats.find((s) => s.isViewer)?.seatId === daveSeatIdBefore,
      `before=${daveSeatIdBefore} after=${afterReload.seats.find((s) => s.isViewer)?.seatId}`);
    // 底牌只在同一手内可比。刷新期间正好结算一手时换牌是对的，不是缺陷，所以先看手数。
    // 不写成「手数变了就跳过」——那样这条断言在慢机器上会静默消失。手数没变时必须相等，
    // 手数变了则要求仍是两张自己的牌。
    const holeAfter = afterReload.seats.find((s) => s.isViewer)?.hole ?? [];
    if (afterReload.handIndex === beforeReload.handIndex) {
      check("真实 reload 之后底牌还是自己那两张（同一手内，权威没重发）",
        JSON.stringify(holeAfter) === JSON.stringify(daveHoleBefore),
        `hand=${afterReload.handIndex} before=${daveHoleBefore.join(",")} after=${holeAfter.join(",")}`);
    } else {
      check("真实 reload 跨过一次结算，底牌换成新一手自己的两张",
        holeAfter.length === 2 && holeAfter.every((c) => c !== "?"),
        `hand ${beforeReload.handIndex}->${afterReload.handIndex} after=${holeAfter.join(",")}`);
    }
    check("真实 reload 之后连接状态回到已连接",
      afterReload.connState.includes("已连接"), `connState=${afterReload.connState}`);
    // 同桌视角：这次刷新不该在别人画面上留下一个不消失的掉线标记。允许中途出现——
    // pagehide 的 beacon 会先摘掉旧连接，那一瞬间确实是掉线，正确的要求是它会恢复。
    await until("同桌看到 dave 刷新后不再是掉线", async () => {
      const table = await readTable(alice.page);
      return table.seats[daveIndex].tags.includes("掉线") === false;
    });
    ok("真实 reload 回到原座位，同桌视角也恢复");

    // 令牌留存的位置本身也要钉住：不能进 URL，不能进 localStorage。
    const tokenPlacement = await dave.page.evaluate(() => ({
      href: location.href,
      search: location.search,
      hash: location.hash,
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
      cookie: document.cookie,
    }));
    check("会话令牌不在 URL 里（不进历史、不进 Referer、不进截图）",
      tokenPlacement.search === "" && tokenPlacement.hash === "",
      JSON.stringify({ search: tokenPlacement.search, hash: tokenPlacement.hash }));
    check("会话令牌不写 localStorage（关掉浏览器还在等于白留一份泄漏面）",
      tokenPlacement.localStorageKeys.length === 0,
      `localStorage=${JSON.stringify(tokenPlacement.localStorageKeys)}`);
    check("会话令牌确实留在 sessionStorage（否则上面那条 reload 恢复是靠别的东西过的）",
      tokenPlacement.sessionStorageKeys.includes("tokengame.table.session_token"),
      `sessionStorage=${JSON.stringify(tokenPlacement.sessionStorageKeys)}`);
    artifacts.push(await shot(dave, "09b-after-reload"));

    // ---- 9c. 网络中断：不发任何通知，纯靠连接租约判掉线 ----
    //
    // 这一条和「点掉线按钮」的区别是整件事的要点：按钮会明确告诉服务端「我走了」，而真实
    // 断网什么都发不出去。租约是唯一还能发现这件事的机制，所以这里把路由全掐掉，一个字节
    // 都不让出去，然后要求同桌照样看到掉线。
    //
    // 用 dave 的 context 级路由拦截，而不是 page 级：拦截要覆盖这个上下文里的全部请求。
    dave.expectFailures = true;
    await dave.context.route("**/api/**", (route) => route.abort());
    const netOffline = await until("断网后同桌看到 dave 掉线（无 beacon，纯租约）", async () => {
      const table = await readTable(alice.page);
      return table.seats[daveIndex].tags.includes("掉线") ? table : false;
    }, { timeout: 30_000 });
    check("网络中断在别人的画面上标出掉线，且没有任何断线通知参与",
      netOffline.seats[daveIndex].tags.includes("掉线"));
    artifacts.push(await shot(alice, "09c-dave-network-cut"));

    await dave.context.unroute("**/api/**");
    // 断网必须真的产生过失败请求。一条都没有说明拦截根本没生效，那上面那条「看到掉线」
    // 就是靠别的原因过的——空断言比失败的断言更坏，因为它不会红。
    check("故意断网确实拦下了请求（否则上面那条掉线不是断网造成的）",
      dave.expectedFailures.length > 0,
      `断网期间浏览器网络错误 ${dave.expectedFailures.length} 条`);
    // 网络回来后页面自己就会恢复：轮询还在跑，下一次成功的 /api/view 就是一次续租，
    // 而权威侧 markConnected 由这条路径上的 seat.connect 触发……并不会。轮询只续租，
    // 不重建连接。所以这里要求的是「租约到期后页面能靠 resume 回来」——它由客户端的
    // 终态处理决定，而不是靠视图请求碰巧成功。
    const netRecovered = await until("网络恢复后 dave 重新在线", async () => {
      const table = await readTable(alice.page);
      return table.seats[daveIndex].tags.includes("掉线") === false ? table : false;
    }, { timeout: 30_000 });
    check("网络恢复后掉线标记消失，席位没被换人",
      netRecovered.seats[daveIndex].name === "dave",
      `seat=${netRecovered.seats[daveIndex].name}`);
    // 关掉窗口要在确认恢复之后：提前关会把恢复期间的错误也算进正常统计里。
    dave.expectFailures = false;
    ok("网络中断纯靠连接租约判掉线，恢复后回到原席");

    // ---- 9d. 有人跟的全下摊牌，以及筹码归零之后 ----
    //
    // 第 8c 节的全下刻意没人跟，理由写在那里：跟注的全下会按牌力把一席打到 0，而破产
    // 的是谁取决于发牌，那会把下游几节的前置条件打掉。这一节把那条路补上。
    //
    // 谁承担破产风险是选定的，不是碰运气：
    //   全下方 = alice / bob / dave 里筹码最少的一席。最少的一席全下，跟注方覆盖得住，
    //            所以只有全下方自己可能归零。
    //   跟注方 = 筹码最多的一席。它跟一个比自己小的全下，不可能被打到 0。
    //   carol  = 一律弃牌。第 10 节要她「排定本手后暂离」，一个已经在 sit out 里的席位
    //            走不出那条断言，所以她不承担任何风险。
    const seatsNow = (await readTable(alice.page)).seats
      .filter((s) => Number.isFinite(s.stack) && s.stack > 0);
    const riskable = seatsNow
      .filter((s) => s.name !== "carol")
      .sort((a, b) => a.stack - b.stack);
    const richest = [...seatsNow].sort((a, b) => b.stack - a.stack)[0];
    const allInName = riskable[0]?.name ?? null;
    const callerName = richest?.name === allInName ? riskable[1]?.name ?? null : richest?.name ?? null;
    check("能选出全下方与跟注方，且两者不是同一席",
      allInName !== null && callerName !== null && allInName !== callerName,
      `全下方=${allInName} 跟注方=${callerName}，`
        + `筹码 ${JSON.stringify(seatsNow.map((s) => ({ name: s.name, stack: s.stack })))}`);

    const showdownHand = (await readTable(alice.page)).handIndex;
    const totalBeforeShowdown = seatsNow.reduce((sum, s) => sum + s.stack, 0);
    let allInPlaced = false;
    let callPlaced = false;
    let tagOnScreen = false;
    const showdownActions = [];
    for (let guard = 0; guard < 40; guard += 1) {
      if ((await readTable(alice.page)).handIndex > showdownHand) break;
      let holder;
      try {
        holder = await findActor(players, `全下摊牌（第 ${showdownHand} 手）`);
      } catch {
        break;
      }
      if ((await readTable(holder.player.page)).handIndex > showdownHand) break;
      const who = holder.player.name;
      // 只在轮到指定的那一席时才下指定的动作。takeAction 只从权威给的按钮里选，
      // 所以「想让谁全下」永远不会变成替他构造一个权威没给的动作。
      const want = who === allInName && !allInPlaced
        ? ["all_in"]
        : who === callerName
          ? ["call", "check"]
          : ["fold", "check"];
      const acted = await takeAction(holder, want);
      showdownActions.push(acted);
      if (acted.action === "all_in" && who === allInName) allInPlaced = true;
      if (acted.action === "call" && who === callerName && allInPlaced) callPlaced = true;
      const seen = await readTable(holder.player.page);
      if (seen.seats.some((s) => s.tags.includes("全下"))) tagOnScreen = true;
      await sleep(300);
    }
    check("指定的一席真的全下了，另一席真的跟了——这一手是有人跟的全下",
      allInPlaced && callPlaced,
      `全下=${allInPlaced} 跟注=${callPlaced}，动作 ${JSON.stringify(showdownActions)}`);
    check("全下标记在这一手里画到了屏幕上", tagOnScreen);

    const settled = await until("全下摊牌收尾", async () => {
      const table = await readTable(alice.page);
      return table.handIndex > showdownHand || table.street === "—" ? table : false;
    }, { timeout: 40_000 });
    // 摊牌之后筹码只在桌内搬动。这里能用等式：读的是手间的账本值，池已经分完。
    const totalAfterShowdown = settled.seats
      .filter((s) => Number.isFinite(s.stack))
      .reduce((sum, s) => sum + s.stack, 0);
    check("有人跟的全下结算后，桌上筹码总额与摊牌前一致",
      totalAfterShowdown === totalBeforeShowdown,
      `摊牌前 ${totalBeforeShowdown} 摊牌后 ${totalAfterShowdown}，`
        + `逐席 ${JSON.stringify(settled.seats.map((s) => ({ name: s.name, stack: s.stack })))}`);
    // 有人归零就顺带验一条 F1：归零的席位不能带着 0 筹码被塞进下一手。
    const busted = settled.seats.filter((s) => s.stack === 0);
    if (busted.length === 0) {
      ok("这一手没有人归零（全下方赢了或平分），破产路径本轮未走到",
        `全下方=${allInName}`);
    } else {
      const bustedNames = busted.map((s) => s.name);
      const nextHand = await until("归零之后仍能开出下一手", async () => {
        const table = await readTable(alice.page);
        return table.handIndex > showdownHand ? table : false;
      }, { timeout: 40_000 }).catch(() => null);
      if (nextHand === null) {
        ok("归零之后桌上不足两家有筹码，按名单没开下一手（这是正确收尾）",
          `归零 ${JSON.stringify(bustedNames)}`);
      } else {
        const stillIn = nextHand.seats
          .filter((s) => bustedNames.includes(s.name) && s.hole.length > 0);
        check("筹码归零的席位没有带着 0 筹码进下一手",
          stillIn.length === 0,
          `归零 ${JSON.stringify(bustedNames)}，`
            + `下一手仍在牌里的 ${JSON.stringify(stillIn.map((s) => s.name))}`);
      }
      ok("有人跟的全下把一席打到 0，破产路径在浏览器层真的走过",
        `归零 ${JSON.stringify(bustedNames)}`);
    }
    artifacts.push(await shot(alice, "9d-called-all-in-showdown"));

    // 真实关闭上下文那一条放在第 11 节之后（11b）：它会让一席进入保留窗，而保留窗里的
    // 席位会影响「桌子还能不能开下一手」。放在这里等于让后面几节都在一张少人桌上跑，
    // 那样它们即使有缺陷也可能因为「人不够所以本来就不开牌」而看不出来。

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

    // ---- 11b. 真实关闭上下文：连接租约兜底 ----
    //
    // 关掉整个 browser context 等于关掉标签页。pagehide 有机会发出一次 beacon，但那只是
    // 加速：这里不区分「beacon 送到了」和「没送到」，两条路都必须导致掉线。9c 已经单独
    // 证明了完全没有通知时租约照样判掉线，所以这一条要的是端到端——一个真的被关掉的窗口
    // 不会永远占着座位。
    //
    // 放在这里而不是第 9 节之后：它会让一席进入保留窗，而那会改变「桌子还能不能开下一手」。
    const bob = players.find((p) => p.name === "bob");
    const bobIndex = (await readTable(alice.page)).seats.findIndex((s) => s.name === "bob");
    check("关闭上下文前 bob 确实在席且不是掉线状态",
      bobIndex >= 0
      && (await readTable(alice.page)).seats[bobIndex].tags.includes("掉线") === false,
      `bobIndex=${bobIndex}`);
    await bob.context.close();
    const bobGone = await until("bob 的上下文被真的关掉后，同桌看到掉线", async () => {
      const table = await readTable(alice.page);
      const seat = table.seats[bobIndex];
      return seat !== undefined && seat.tags.includes("掉线") ? table : false;
    }, { timeout: 30_000 });
    check("关闭浏览器上下文导致掉线（beacon 或租约，两条路都算）",
      bobGone.seats[bobIndex].tags.includes("掉线"));
    check("被关掉的一席进入保留窗，位子没有立刻被抹掉",
      bobGone.seats[bobIndex].name === "bob", `seat=${bobGone.seats[bobIndex].name}`);
    artifacts.push(await shot(alice, "11b-bob-context-closed"));
    ok("真实关闭上下文后席位进入掉线与保留窗，不是无限在线");

    // ---- 12. 控制台必须干净 ----
    const consoleReport = players.map((player) => ({
      player: player.name,
      consoleErrors: player.consoleErrors,
      pageErrors: player.pageErrors,
      // 故意断网窗口内的错误单列。不并入合计，但必须出现在证据里——否则「合计为 0」这句话
      // 就变成了「除了我不想算的那些之外为 0」，而读证据的人看不出差别。
      duringDeliberateFailure: player.expectedFailures,
    }));
    const totalConsole = consoleReport.reduce(
      (sum, entry) => sum + entry.consoleErrors.length + entry.pageErrors.length, 0);
    const expectedTotal = consoleReport.reduce(
      (sum, entry) => sum + entry.duringDeliberateFailure.length, 0);
    check("四个上下文的控制台错误合计为 0（故意制造失败的窗口除外，单列在证据里）",
      totalConsole === 0,
      totalConsole === 0
        ? `0；故意失败窗口内 ${expectedTotal} 条已单列`
        : JSON.stringify(consoleReport));
    // 窗口必须全部关上。留着开的窗口会把它之后的所有错误都吞掉。
    check("所有故意失败窗口都已关闭（否则后续错误会被吞掉）",
      players.every((player) => player.expectFailures === false),
      JSON.stringify(players.map((p) => ({ player: p.name, expectFailures: p.expectFailures }))));
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
    // 路由回调吞下的错误在这里结账。「已经被处理过的路由」不算（unroute 的正常竞态），
    // 其余任何一条都说明改写投影这几节里有一次没按预期跑，而那会让那几节的断言变成
    // 在正常投影下成立——恒真而不是通过。
    check("投影改写的路由回调没有吞下任何意外错误", routeErrors.length === 0,
      routeErrors.length === 0 ? "0 条" : JSON.stringify(routeErrors));

    finalHandIndex = (await readTable(alice.page)).handIndex;
  } catch (error) {
    // 记下来再原样抛出。吞掉它会让退出码变成 0，那是另一种假绿。
    aborted = error;
    throw error;
  } finally {
    // 结果无条件落盘，包括脚本中途抛错的情况。第一版把写入放在 try 里，于是一次
    // 异常终止之后我手上只有 "通过 77，失败 3" 这一行、没有失败项——诊断只能靠重跑。
    // 证据文件的价值恰恰在失败的那次。
    const consoleReport = players.map((player) => ({
      player: player.name,
      consoleErrors: player.consoleErrors,
      pageErrors: player.pageErrors,
      duringDeliberateFailure: player.expectedFailures,
    }));
    const totalConsole = consoleReport.reduce(
      (sum, entry) => sum + entry.consoleErrors.length + entry.pageErrors.length, 0);
    if (!consoleChecked) {
      check("四个上下文的控制台错误合计为 0", totalConsole === 0,
        totalConsole === 0 ? "0" : JSON.stringify(consoleReport));
    }
    const summaryInput = {
      banner,
      contexts: PLAYERS.length,
      finalHandIndex,
      artifacts,
      steps,
      failures,
      consoleReport,
      totalConsole,
      aborted,
    };
    const result = buildResult(summaryInput);
    fs.writeFileSync(path.join(artifactDir, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`);

    log("");
    log(summarize(summaryInput));
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
