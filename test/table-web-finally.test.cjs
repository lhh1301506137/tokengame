"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { buildResult, summarize, redactDetail, observedHandIndex } = require("../test-support/acceptance-result.cjs");

// 执行实际 main 的提前抛错路径；只替换浏览器/子进程/文件的外部端口，不复制 finally。
// 原先只查 snapshot 在 close 之前，错误地放在 §12 的采样照样通过那条静态检查。
async function abortBeforeScope({ handText = "7", atTable = true, unreadable = false, unknownElapsed = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../test-support/table-web-acceptance.mjs"), "utf8");
  const main = source.slice(source.indexOf("async function main() {"), source.indexOf("\nmain().catch("));
  const bounded = source.slice(source.indexOf("async function boundedObservation("), source.indexOf("\n// 「客户端"));
  const phase = source.slice(source.indexOf("function phase("), source.indexOf("\nfunction log("));
  const written = new Map();
  const calls = [];
  const steps = [];
  const failures = [];
  const phaseTimes = [];
  const abort = new Error("controlled_before_scope");
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    calls.push("server.close");
    child.signalCode = "SIGTERM";
    queueMicrotask(() => child.emit("exit", null, "SIGTERM"));
  };
  let connected = true;
  const browser = {
    close: async () => { calls.push("browser.close"); connected = false; },
    isConnected: () => connected,
  };
  const player = {
    name: "alice",
    page: { evaluate: async (fn) => {
      calls.push("page.read");
      if (unreadable) throw new Error("page closed");
      return fn();
    } },
    context: { close: async () => { calls.push("context.close"); } },
  };
  const sandbox = {
    Promise, Date, setTimeout, clearTimeout, path, steps, failures, phaseTimes,
    PLAYERS: ["alice", "bob", "carol", "dave"], DECK_SEED: "test_seed_not_in_banner",
    artifactDir: "in-memory-artifacts", runStartedAt: Date.now(), currentPhase: "启动",
    resolver: { loadPlaywright: () => ({ chromium: { launch: async () => browser } }) },
    startServer: () => ({ child, serverLog: [], origin: Promise.resolve({
      origin: "http://127.0.0.1:1", model_adapter: { simulated: true }, due_work_owned_here: true,
      deterministic_deck: { seed_fingerprint: "fixture_fingerprint" },
    }) }),
    newPlayer: async () => player,
    sessionCount: async () => 0,
    stageCreate: async () => {
      if (unknownElapsed) phaseTimes.at(-1).started_at_ms = NaN;
      throw abort;
    },
    document: { getElementById: (id) => id === "hand-index" ? { textContent: handText }
      : id === "entry-view" ? { hidden: atTable } : null },
    fs: { writeFileSync: (file, data) => written.set(path.basename(file), JSON.parse(data)) },
    buildResult, summarize, redactDetail, observedHandIndex,
    buildEvidenceReport: () => ({ perPlayer: [], totalConsole: 0, totalNetwork: 0,
      totalExpectedNetwork: 0, totalClientCancellations: 0, networkByPhase: {} }),
    log: () => {},
    check: (name, condition, detail = "") => {
      steps.push({ name, ok: Boolean(condition), detail });
      if (!condition) failures.push(name);
      return Boolean(condition);
    },
    process: { exit: (code) => { throw new Error(`unexpected process.exit(${code})`); } },
  };
  vm.createContext(sandbox);
  const run = vm.runInContext(`${bounded}\n${phase}\n${main}\nmain();`, sandbox);
  await assert.rejects(run, (error) => error === abort, "必须保留原始中止原因");
  return { result: written.get("result.json"), timing: written.get("timing-evidence.json"), calls };
}

test("main 在 §1 提前失败仍实际读取手数，再清理与写失败结果", async () => {
  const { result, timing, calls } = await abortBeforeScope();
  assert.equal(result.passed, false);
  assert.equal(result.aborted.message, "controlled_before_scope");
  assert.equal(result.hands_reached, 7, "没跑到 §12 也不能把已到第 7 手写成 unknown/0");
  assert.deepEqual(timing.final_hand_observation, [{ player: "alice", hand: 7, source: "final_dom_snapshot" }]);
  assert.deepEqual(calls, ["page.read", "context.close", "browser.close", "server.close"]);
  assert.equal(timing.cleanup.contexts_closed, 1);
  assert.equal(timing.cleanup.browser_closed, true);
  assert.equal(timing.cleanup.server.exited, true);
  assert.equal(timing.phases.length, 1, "不得假装完成后面的阶段");
  assert.equal(typeof timing.phases[0].elapsed_ms, "number");
  assert.ok(timing.phases[0].elapsed_ms >= 0);
});

test("main 提前失败且页面不可读时保留 unknown，不阻断清理", async () => {
  const { result, timing, calls } = await abortBeforeScope({ unreadable: true });
  assert.equal(result.hands_reached, "unknown");
  assert.equal(timing.final_hand_observation.length, 1, "实际尝试读页面，失败也必须留下记录");
  assert.equal(timing.final_hand_observation[0].source, "page_closed_or_unreadable");
  assert.equal(timing.final_hand_observation[0].hand, "unknown");
  assert.equal(result.passed, false);
  assert.deepEqual(calls, ["page.read", "context.close", "browser.close", "server.close"]);
});

test("入口旧手数或非数字不当作实际手数，真实 0 则保留", async () => {
  for (const options of [{ atTable: false }, { handText: "—" }, { handText: "" }]) {
    const { result } = await abortBeforeScope(options);
    assert.equal(result.hands_reached, "unknown");
  }
  assert.equal((await abortBeforeScope({ handText: "0" })).result.hands_reached, 0);
});

test("末阶段无法计算耗时时显式 unknown，不让 JSON 的 NaN 变成 null", async () => {
  const { timing } = await abortBeforeScope({ unknownElapsed: true });
  assert.equal(timing.phases[0].elapsed_ms, "unknown");
});
