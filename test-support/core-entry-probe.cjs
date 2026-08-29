"use strict";

// 把 src/run-table-core.cjs 当作真实进程起一遍，从外面验证它。
//
// 进程内构造 createCommandServer 证不了这个入口：入口的全部内容恰好是那些进程级的东西
// ——环境变量怎么读、退出码是什么、信号来了会不会释放端口。所以这里必须 spawn。
//
// 结果以单行 JSON 打到 stdout，由 test/core-entry.test.cjs 断言。

const path = require("node:path");
const { spawn } = require("node:child_process");
const { requestEnvelope } = require("../src/contract/adapter-contract.cjs");

const ENTRY = path.join(__dirname, "..", "src", "run-table-core.cjs");
const TOKEN = "core-entry-probe-token";

function startCore() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        TOKENGAME_COMMAND_PORT: "0",
        TOKENGAME_AUTHORITY_TOKEN: TOKEN,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`核心进程 6 秒内没有打印启动行\nstdout=${out}\nstderr=${err}`));
    }, 6_000);

    child.stdout.on("data", (chunk) => {
      out += chunk;
      const line = out.split("\n").find((candidate) => candidate.trim().startsWith("{"));
      if (line === undefined) return;
      clearTimeout(timer);
      try {
        resolve({ child, banner: JSON.parse(line), stderr: () => err });
      } catch (error) {
        reject(new Error(`启动行不是 JSON: ${line}`));
      }
    });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
  });
}

async function post(origin, command, params, token) {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers["x-tokengame-authority-token"] = token;
  const response = await fetch(`${origin}/command`, {
    method: "POST",
    headers,
    // 请求信封由合同层构造。服务端校验 contract_version。
    body: JSON.stringify(requestEnvelope(command, params)),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const report = {};
  const { child, banner, stderr } = await startCore();
  report.banner = banner;
  report.platform = process.platform;

  try {
    const origin = banner.origin;

    // 传输门确实在守：没有令牌必须 403，而不是靠调用方自觉。
    report.no_token = (await post(origin, "view.projection", {}, null)).status;
    report.wrong_token = (await post(origin, "view.projection", {}, "not-the-token")).status;

    const health = await fetch(`${origin}/health`);
    report.health = { status: health.status, body: await health.json() };

    // 真的打一手牌的开头：建房、确认公开、加入。走 HTTP，不走进程内捷径。
    const created = await post(origin, "room.create", {
      player_id: "p1",
      table_rules_version: "table-rules-v1",
    }, TOKEN);
    report.create_status = created.status;
    const inviteCode = created.body.result.invite_code;
    const hostSeat = created.body.result.seat.seat_id;
    const hostCredential = created.body.result.recovery_credential;

    const joined = await post(origin, "room.join", {
      player_id: "p2",
      invite_code: inviteCode,
    }, TOKEN);
    const guestSeat = joined.body.result.seat.seat_id;
    const guestCredential = joined.body.result.recovery_credential;

    const seats = [
      { seat_id: hostSeat, credential: hostCredential },
      { seat_id: guestSeat, credential: guestCredential },
    ];
    for (const seat of seats) {
      // F3：确认按席位记账，逐席带凭据与显式表态。
      await post(origin, "room.confirm_public_scope", {
        seat_id: seat.seat_id,
        recovery_credential: seat.credential,
        acknowledged: true,
      }, TOKEN);
      await post(origin, "seat.connect", {
        seat_id: seat.seat_id,
        recovery_credential: seat.credential,
        connection_id: `probe-${seat.seat_id}`,
      }, TOKEN);
      await post(origin, "ai.set_mode", {
        seat_id: seat.seat_id,
        recovery_credential: seat.credential,
        mode: "OFF",
      }, TOKEN);
      await post(origin, "seat.ready", {
        seat_id: seat.seat_id,
        recovery_credential: seat.credential,
        ready: true,
      }, TOKEN);
    }

    // 此后**不再发任何会推进规则的请求**。只轮询只读投影，等驱动自己开局。
    // 这是整个探针的重点：真实进程里，没有人催，规则照样发生。
    const deadline = Date.now() + 6_000;
    let polls = 0;
    let started = false;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      polls += 1;
      const view = await post(origin, "view.projection", {}, TOKEN);
      if (view.body.result.hand !== null) {
        started = true;
        report.public_hand_status = view.body.result.public_hand.status;
        report.public_seat_count = view.body.result.public_hand.seats.length;
        // 旁观投影不得含任何底牌。
        report.public_hole_cards = view.body.result.public_hand.seats
          .map((seat) => seat.hole_cards)
          .filter((cards) => cards !== null);
        break;
      }
    }
    report.auto_started = started;
    report.polls = polls;

    // 隐藏信息边界在真实进程里也要成立：自己看得见两张，别人看不见。
    const mine = await post(origin, "view.hand", {
      seat_id: hostSeat,
      recovery_credential: hostCredential,
    }, TOKEN);
    const view = mine.body.result.hand;
    // 牌局投影按 playerId 索引，字段名就是 id（没有 seat_id / player_id）。认错字段会让
    // me 变成 undefined，于是「别人的牌」里混进自己的牌，看上去像泄露——第一次跑就是这样。
    const me = view.seats.find((seat) => seat.id === "p1");
    report.me_found = me !== undefined;
    report.my_hole_card_count = me === undefined ? null : (me.hole_cards || []).length;
    report.foreign_cards_seen = view.seats
      .filter((seat) => seat.id !== "p1")
      .map((seat) => seat.hole_cards)
      .filter((cards) => cards !== null && cards.length > 0);
    report.legal_action_count = view.legal_actions.length;

    // 借别人的 seat_id 配自己的凭据，必须被拒。
    const attack = await post(origin, "view.hand", {
      seat_id: guestSeat,
      recovery_credential: hostCredential,
    }, TOKEN);
    report.cross_seat_status = attack.status;
    report.cross_seat_code = attack.body.code;
  } finally {
    // 信号关停：端口必须真的被释放，退出码必须是 0。
    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ code: null, timed_out: true });
      }, 5_000);
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, timed_out: false });
      });
      child.kill("SIGTERM");
    });
    report.shutdown = exited;
    // stderr 是判断信号处理器有没有真的跑过的唯一凭据。Windows 上 child.kill("SIGTERM")
    // 走的是 TerminateProcess，进程被直接杀掉、处理器根本不执行，此时退出码是 null
    // 而这里会是空的。把它记进报告，好让断言按平台说实话，而不是假装优雅关停已被验证。
    report.shutdown_stderr = stderr();
  }

  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error) => {
  process.stderr.write(`probe failed: ${error.stack || error.message}\n`);
  process.exit(1);
});
