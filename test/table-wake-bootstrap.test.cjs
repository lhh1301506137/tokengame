"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cases = {
  rejected: "实验模块悬挂或失败不阻断已有席位恢复和真人命令",
  late_success: "实验模块迟到成功只接入已恢复的当前会话，不重复恢复或自动开启",
  left_before_load: "恢复后离桌再收到模块成功不能恢复旧通知会话",
  entered_before_load: "无旧会话时先正常入桌，迟到模块绑定当前会话",
  off_pending: "模块迟到初始化必须继承尚未完成的AI OFF屏障",
  overlap_first_finishes: "交叠授权操作中先发操作先完成也不能提前解除屏障",
  overlap_last_finishes: "交叠授权操作中后发操作先完成也不能提前解除屏障",
  old_session_ticket: "旧会话授权回调不能解除迟到模块的新会话屏障",
  fixed_target_render: "固定发送器目标隐藏并禁用UUID输入，只显示无秘密说明",
};

if (process.argv[2] === "--wake-bootstrap-worker") {
  probe(process.argv[3]).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
} else {
  const test = require("node:test");
  for (const [scenario, name] of Object.entries(cases)) {
    test(name, { timeout: 5_000 }, () => {
      // 自定义动态 import 的 VM 钩子需要显式开启。独立子进程不改变全套测试启动参数。
      const result = spawnSync(process.execPath,
        ["--experimental-vm-modules", __filename, "--wake-bootstrap-worker", scenario],
        { encoding: "utf8", timeout: 3_000, windowsHide: true });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.scenario, scenario);
      assert.equal(report.passed, true);
      assert.equal(report.wake_requests, 0);
    });
  }
}

async function probe(scenario) {
  assert.ok(Object.hasOwn(cases, scenario));
  const vm = require("node:vm");
  const { webcrypto } = require("node:crypto");
  const root = path.resolve(__dirname, "..");
  const moduleGate = deferred();
  const moduleEntered = deferred();
  const resumeGate = deferred();
  const pendingView = deferred();
  const actionGates = [];
  const nodes = new Map();
  const requests = [];
  let intervals = 0;
  let stored = scenario === "entered_before_load" ? null : "fixture-resumed-session";
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", checked: false,
      disabled: id === "modelWakeControls", hidden: id === "table-main", dataset: {},
      addEventListener() {}, setAttribute() {}, removeAttribute() {},
      classList: { add() {}, remove() {}, toggle() {} },
    });
    return nodes.get(id);
  };
  const response = (body) => ({ ok: true, status: 200, json: async () => body });
  const context = vm.createContext({
    document: { getElementById: node },
    window: { addEventListener() {} },
    sessionStorage: {
      getItem(key) { assert.equal(key, "tokengame.table.session_token"); return stored; },
      setItem(key, value) { assert.equal(key, "tokengame.table.session_token"); stored = value; },
      removeItem(key) { assert.equal(key, "tokengame.table.session_token"); stored = null; },
    },
    fetch: async (route, options) => {
      const body = JSON.parse(options.body);
      requests.push({ route, body });
      if (route === "/api/session/resume") return resumeGate.promise;
      // 只测原始启动/请求时序，不模拟 DOM 渲染或在浏览器里玩牌。
      if (route === "/api/view") return pendingView.promise;
      if (route === "/api/action") {
        if (body.command === "ai.set_mode") {
          const gate = deferred(); actionGates.push(gate); return gate.promise;
        }
        return response({ ok: true });
      }
      throw new Error(`unexpected_bootstrap_request: ${route}`);
    },
    AbortController, crypto: webcrypto, Intl, console, setTimeout, clearTimeout,
    setInterval() { intervals += 1; return intervals; }, clearInterval() {},
  });
  const sourcePath = path.join(root, "web/table/table.js");
  const script = new vm.Script(fs.readFileSync(sourcePath, "utf8"), {
    filename: sourcePath,
    importModuleDynamically: async (specifier) => {
      assert.equal(specifier, "/wake-controls.mjs");
      moduleEntered.resolve();
      await moduleGate.promise;
      const module = new vm.SourceTextModule(fs.readFileSync(path.join(root, "web/table/wake-controls.mjs"), "utf8"), { context });
      await module.link(() => { throw new Error("unexpected_nested_import"); });
      await module.evaluate();
      return module;
    },
  });
  const done = script.runInContext(context);
  const run = (code) => vm.runInContext(code, context);
  const resumeCount = () => requests.filter((request) => request.route === "/api/session/resume").length;
  try {
    await moduleEntered.promise;
    await tick();
    assert.equal(node("modelWakeControls").disabled, true);
    if (scenario === "entered_before_load") {
      assert.equal(resumeCount(), 0);
      run("enterTable({ session_token: 'fixture-new-session', connection_id: 'new-connection', seat_id: 'seat-new' })");
    } else {
      assert.equal(resumeCount(), 1, "可选模块还未返回时就必须发出已有会话恢复请求");
      resumeGate.resolve(response({ ok: true, connection_id: "fixture-connection", seat_id: "seat-old" }));
      await tick();
    }
    assert.equal(node("entry-view").hidden, true);
    assert.equal(node("table-main").hidden, false);
    assert.equal(requests.filter((request) => request.route === "/api/view").length, 1);
    assert.equal(intervals, 1);
    await run("act('chat.say', { text: '普通真人命令', idempotency_key: 'fixture-chat' })");
    assert.equal(requests.filter((request) => request.route === "/api/action").length, 1);
    assert.equal(requests.at(-1).body.session_token, stored);
    const guarded = [];
    const overlap = scenario.startsWith("overlap_");
    const guardedCase = scenario === "off_pending" || overlap || scenario === "old_session_ticket";
    if (guardedCase) guarded.push(run("act('ai.set_mode', { mode: 'OFF' })"));
    if (scenario === "old_session_ticket") {
      run("returnToEntry(''); enterTable({ session_token: 'fixture-new-session', connection_id: 'new-connection', seat_id: 'seat-new' })");
    }
    // act 的同一个屏障也包裹真人离桌，绑定/解绑按钮共用 pause/resume。
    // 两条独立授权请求重叠时，先后完成顺序不能改变禁用语义。
    if (overlap || scenario === "old_session_ticket") guarded.push(run("act('ai.set_mode', { mode: 'ON' })"));
    if (scenario === "left_before_load") run("returnToEntry('')");
    if (scenario === "rejected") moduleGate.reject(new Error("planned optional module failure"));
    else moduleGate.resolve();
    await tick();
    await done;
    await tick();
    assert.equal(resumeCount(), scenario === "entered_before_load" ? 0 : 1);
    assert.equal(intervals, scenario === "old_session_ticket" ? 2 : 1, "迟到的实验模块不能新增牌桌轮询器");
    if (scenario === "rejected") {
      assert.equal(node("modelWakeControls").dataset.state, "unavailable");
      assert.equal(node("modelWakeControls").disabled, true);
      assert.equal(run("wakeControls"), null);
      await run("act('seat.ready', { ready: true })");
      assert.equal(requests.filter((request) => request.route === "/api/action").length, 2);
    } else {
      assert.ok(run("wakeControls") !== null, "迟到的模块仍应正常初始化");
      assert.equal(run("wakeControls.viewTicket().session"), stored);
      assert.equal(node("modelWakeStart").disabled, true, "未有新权威投影/同意绝不自动开启");
    }
    if (guardedCase) {
      context.bootstrapView = readyView(run("state.seatId"));
      const assertBlocked = () => {
        assert.equal(run("wakeControls.acceptView(wakeControls.viewTicket(), bootstrapView)"), false,
          "尚有授权操作未完成时不能采纳旧ON投影");
        run("wakeControls.setField('threadId', '16b00000-0000-4000-8000-000000000001'); wakeControls.setField('durationSeconds', '1'); wakeControls.setConsent(true)");
        assert.equal(run("wakeControls.snapshot().can_start"), false);
        assert.equal(run("wakeControls.snapshot().ui_state"), "blocked");
      };
      assert.equal(actionGates.length, guarded.length);
      assertBlocked();
      const first = scenario === "overlap_last_finishes" ? 1 : 0;
      actionGates[first].resolve(response({ ok: true }));
      await guarded[first];
      if (guarded.length === 2) {
        assertBlocked();
        const last = first === 0 ? 1 : 0;
        actionGates[last].resolve(response({ ok: true }));
        await guarded[last];
      }
      assert.equal(run("wakeControls.viewTicket().session"), stored);
      assert.equal(run("wakeControls.snapshot().can_start"), false, "操作结束仍先等新投影和新的明确同意");
      assert.equal(run("wakeControls.acceptView(wakeControls.viewTicket(), bootstrapView)"), true,
        "全部操作结束之后不能永远封锁通知表单");
      run("wakeControls.setField('threadId', '16b00000-0000-4000-8000-000000000001'); wakeControls.setField('durationSeconds', '1'); wakeControls.setConsent(true)");
      assert.equal(run("wakeControls.snapshot().can_start"), true);
    }
    if (scenario === "fixed_target_render") {
      context.bootstrapView = readyView(run("state.seatId"), true);
      assert.equal(run("wakeControls.acceptView(wakeControls.viewTicket(), bootstrapView)"), true);
      run("renderModelWake()");
      assert.equal(node("modelWakeTaskField").hidden, true);
      assert.equal(node("modelWakeTaskId").disabled, true);
      assert.equal(node("modelWakeFixedTarget").hidden, false);
      assert.match(node("modelWakeFixedTarget").textContent, /UUID不向页面公开/);
      assert.equal(run("wakeControls.snapshot().target_configured"), true);
    }
    if (scenario === "left_before_load") {
      assert.equal(stored, null);
      assert.equal(run("state.sessionToken"), null);
      assert.equal(node("entry-view").hidden, false);
      assert.equal(node("table-main").hidden, true);
    }
    const wakeRequests = requests.filter((request) => request.route.startsWith("/api/model/wake/")).length;
    assert.equal(wakeRequests, 0);
    return { scenario, passed: true, wake_requests: wakeRequests, resume_requests: resumeCount() };
  } finally {
    // 提前断言失败也解除本测试创建的闸门；不会清理别的进程或发任何原生通知。
    moduleGate.resolve();
    resumeGate.resolve(response({ ok: true }));
    for (const gate of actionGates) gate.resolve(response({ ok: true }));
  }
}

function readyView(seatId, targetConfigured = false) {
  return { viewer_seat_id: seatId,
    seats: [{ seat_id: seatId, is_viewer: true, public_scope_confirmed: true, leave_requested: false, ai: { mode: "ON" } }],
    model_connection: { state: "host_seen", seat_id: seatId, binding_id: "fixture-binding" },
    model_wake: { enabled: true, target_configured: targetConfigured,
      limits: { max_notifications: 2, max_duration_ms: 600_000 },
      window: { state: "idle", reason: null, request_id: null, attempted_count: 0, queued_count: 0,
        resolved_count: 0, cleanup_ok: true, cleanup_pending: false } },
  };
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function tick() { return new Promise((resolve) => setImmediate(resolve)); }
