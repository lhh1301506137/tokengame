"use strict";

// 核心进程入口的实证。src/run-table-core.cjs 是两个宿主适配器唯一可连接的对象，
// 而它的全部内容恰好都是进程级的事情：环境变量怎么读、启动行打了什么、端口通不通、
// 信号来了怎么办。这些在进程内构造 createCommandServer 一个都证不了，所以必须 spawn。
//
// 探针本体在 test-support/core-entry-probe.cjs，它跑完把单行 JSON 交回来，这里只做断言。

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROBE = path.join(__dirname, "..", "test-support", "core-entry-probe.cjs");
const ENTRY = path.join(__dirname, "..", "src", "run-table-core.cjs");

function runProbe() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PROBE], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`探针退出码 ${code}\nstdout=${out}\nstderr=${err}`));
        return;
      }
      const line = out.split("\n").filter((candidate) => candidate.trim().startsWith("{")).pop();
      if (line === undefined) {
        reject(new Error(`探针没有输出 JSON\nstdout=${out}\nstderr=${err}`));
        return;
      }
      resolve(JSON.parse(line));
    });
  });
}

// 起一个入口进程，只为看它的失败行为，返回 { code, stdout, stderr }。
function runEntry(env, { waitMs = 4_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, out, err, timed_out: true });
    }, waitMs);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, timed_out: false });
    });
  });
}

let probe = null;

// 一次 spawn 打完整条链路，全部断言共用同一份报告：这条链路要等满 3 秒倒计时，
// 每个断言各起一个进程会把这个文件拖成十几秒。
test("核心入口：一次真实进程跑完启动、鉴权、自动开局、隐藏信息与关停", async () => {
  probe = await runProbe();

  // 启动行只报事实，且必须不含令牌。
  assert.equal(probe.banner.service, "tokengame-table-core");
  assert.match(probe.banner.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(probe.banner.using_default_token, false, "探针传了自定义令牌，启动行应当照实说");
  assert.equal(probe.banner.due_work_running, true, "守护进程必须默认开着到期驱动");
  assert.ok(probe.banner.command_count > 0);
  const banner = JSON.stringify(probe.banner);
  assert.ok(!banner.includes("core-entry-probe-token"), `启动行泄露了令牌: ${banner}`);
});

test("核心入口：传输门在真实进程里确实拦住无令牌与错令牌", () => {
  assert.equal(probe.no_token, 403);
  assert.equal(probe.wrong_token, 403);
  assert.equal(probe.health.status, 200, "/health 不需要令牌，它只报活");
});

// 这条是整个特性的意义所在：真实进程、真实时钟，玩家 Ready 之后不再发任何会推进规则的
// 请求，牌局照样开出来。
test("核心入口：Ready 之后无人催促，牌局由权威自己开出来", () => {
  assert.equal(probe.create_status, 200);
  assert.ok(probe.auto_started, `倒计时走完后应当自动开局，实际轮询 ${probe.polls} 次都没有牌局`);
  assert.equal(probe.public_hand_status, "active");
  assert.equal(probe.public_seat_count, 2);
  // 防空过：若它在第一次轮询就已经是活牌，说明不是「等出来的」而是本来就有。
  assert.ok(probe.polls > 1, "必须是等到的开局，不能是第一次轮询就已存在");
});

test("核心入口：隐藏信息边界在跨进程 HTTP 上同样成立", () => {
  assert.deepEqual(probe.public_hole_cards, [], "旁观投影不得含任何底牌");
  assert.equal(probe.me_found, true, "私密视图里应当找得到自己的席位");
  assert.equal(probe.my_hole_card_count, 2, "自己应当看得见自己的两张底牌");
  assert.deepEqual(
    probe.foreign_cards_seen, [],
    `摊牌前看见了别人的底牌: ${JSON.stringify(probe.foreign_cards_seen)}`,
  );
  assert.ok(probe.legal_action_count > 0, "私密视图必须给出合法动作，否则这桌没法打");
  // 借别人的 seat_id 配自己的凭据：必须被凭据校验挡下。
  assert.equal(probe.cross_seat_status, 403);
  assert.equal(probe.cross_seat_code, "recovery_credential_rejected");
});

// 平台事实，不是通过项。写成断言是为了防止有人以后读着一片绿就以为优雅关停已被验证。
test("核心入口：关停行为按平台如实记录（Windows 上 SIGTERM 不经过处理器）", () => {
  assert.equal(probe.shutdown.timed_out, false, "进程必须在 5 秒内消失，不能挂住");
  if (probe.platform === "win32") {
    // child.kill("SIGTERM") 在 Windows 上走 TerminateProcess：进程被直接杀掉，
    // 信号处理器不执行，所以退出码是 null 且 stderr 里不会有关停日志。
    // 这条路径的关停逻辑本身由 due-work.test.cjs 的 service.stop() 用例覆盖；
    // 「真实信号触发优雅关停」在本机**未被证明**，不得声称已验证。
    assert.equal(probe.shutdown.code, null);
    assert.equal(
      probe.shutdown_stderr, "",
      "Windows 上处理器本不该运行；若这里有输出，说明平台行为与假设不符，需要重新判断",
    );
  } else {
    assert.equal(probe.shutdown.code, 0, "POSIX 上 SIGTERM 应当走处理器并以 0 退出");
    assert.match(probe.shutdown_stderr, /正在关停/);
    assert.match(probe.shutdown_stderr, /端口已释放/);
  }
});

test("核心入口：非法端口直接失败退出，不回落到随机端口", async () => {
  const result = await runEntry({ TOKENGAME_COMMAND_PORT: "70000" });
  assert.equal(result.timed_out, false, "非法端口不该让进程挂住");
  assert.equal(result.code, 1);
  assert.match(result.err, /TOKENGAME_COMMAND_PORT/);
  assert.equal(result.out, "", "启动失败时不得打印启动行");
});

// STATUS.md 的发布门禁：本地桥接鉴权未闭合前不允许连真实远端。这里验证它是代码里的拒绝，
// 而不是文档里靠人记住的一句话。
test("核心入口：非回环地址被拒，并指名阻塞的 unknown", async () => {
  const result = await runEntry({ TOKENGAME_COMMAND_HOST: "0.0.0.0" });
  assert.equal(result.timed_out, false);
  assert.equal(result.code, 1);
  assert.match(result.err, /local_bridge_auth_unresolved/);
  assert.match(result.err, /U-TG-LOCAL-BRIDGE-AUTH/);
  assert.equal(result.out, "", "被门禁拒绝时不得打印启动行");
});
