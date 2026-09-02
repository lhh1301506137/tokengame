"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { SeatAiStore } = require("../src/authority/seat-ai-store.cjs");
const { createAiLifecycleReceipts, DEFAULT_RECEIPT_LIMITS } = require("../src/host/ai-lifecycle-receipts.cjs");
const { summarizeAiReceipts } = require("../test-support/summarize-ai-receipts.cjs");

function fixture(t, { idPrefix = "id" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-ai-receipts-"));
  let at = 1000;
  let id = 0;
  const store = new SeatAiStore({ now: () => at, idFactory: () => `${idPrefix}-${++id}` });
  const receipts = [];
  t.after(async () => {
    await Promise.all(receipts.map((value) => value.close()));
    const actual = fs.realpathSync(dir);
    assert.equal(path.dirname(actual).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(actual).startsWith("tokengame-ai-receipts-"));
    fs.rmSync(actual, { recursive: true, force: true });
  });
  const file = path.join(dir, "run.jsonl");
  return {
    store, dir, file, advance(ms) { at += ms; },
    async capture(options = {}, io = {}) {
      const receipt = await createAiLifecycleReceipts({ store, filePath: file, ...options }, io);
      receipts.push(receipt);
      return receipt;
    },
    read() { return fs.readFileSync(file, "utf8"); },
  };
}

function register(store, seatId = "a") {
  store.registerSeat({ seatId, playerId: `player-${seatId}`, aiPersona: "persona-secret" });
  store.confirmDefaultPublicScope({ seatId, roomBindingId: "room", tableRulesVersion: "rules", acknowledged: true });
}
function say(store, text = "player-secret", seatId = "a") {
  return store.submitPlayerText({ seatId, roomBindingId: "room", tableRulesVersion: "rules", text });
}
function start(store, speech, seatId = "a") {
  const intent = speech.evaluations.find((value) => value.seat_id === seatId);
  assert.ok(intent?.intent_id, "夹具必须真的产生权威意图");
  return store.startEvaluation({ seatId, intentId: intent.intent_id }).payload.turn_id;
}
function resolve(store, turnId, decision = "public_speech", extra = {}) {
  return store.resolveEvaluation({
    seatId: "a", turnId, decision, text: "answer-secret", roomBindingId: "room", tableRulesVersion: "rules", ...extra,
  });
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("默认关闭不访问存储、文件或计时器", async () => {
  const store = new Proxy({}, { get() { assert.fail("disabled touched store"); } });
  const io = { openFile() { assert.fail("disabled opened file"); } };
  assert.equal(await createAiLifecycleReceipts({ store }, io), null);
  assert.equal(await createAiLifecycleReceipts({ store, filePath: "" }, io), null);
});

for (const decision of ["public_speech", "silent"]) {
  test(`真实权威 source→start→${decision}：精确本地事件时差与覆盖计数`, async (t) => {
    const f = fixture(t);
    const receipt = await f.capture();
    register(f.store);
    const speech = say(f.store);
    f.advance(17);
    const turn = start(f.store, speech);
    f.advance(43);
    const terminal = resolve(f.store, turn, decision);
    const closed = await receipt.close();
    assert.equal(closed.capture_complete, true);
    assert.equal(f.store.listeners.size, 0);
    const rows = f.read().trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].capture_after_sequence, 0);
    assert.equal(rows.at(-1).capture_through_sequence, terminal.sequence);
    assert.equal(rows.at(-1).counts.observed_events, f.store.sequence);
    assert.equal(rows.at(-1).counts.written_events, 3);
    assert.equal(rows[1].at, speech.published.at);
    assert.equal(rows[2].source_event_ref, rows[1].event_ref);
    const summary = summarizeAiReceipts(f.read());
    assert.equal(summary.status, "complete", JSON.stringify(summary.issues));
    assert.equal(summary.counts[decision], 1);
    assert.equal(summary.turns.length, 1);
    assert.deepEqual(summary.turns[0].timing_ms, {
      source_to_start: 17, start_to_terminal: 43, source_to_terminal: 60, reclaim_to_late_output: null,
    });
    assert.equal(summary.gate5_evaluated, false);
    assert.equal(summary.gate5_status, undefined);
  });
}

test("跨街合法公开按权威 late 标记，跨手输出保留 hand_advanced 决定", async (t) => {
  const f = fixture(t);
  const receipt = await f.capture();
  register(f.store);
  const turn = start(f.store, say(f.store));
  f.advance(20);
  f.store.advanceStreet({ street: "flop" });
  f.advance(10);
  resolve(f.store, turn);
  await receipt.flush();
  f.advance(5000);
  const nextTurn = start(f.store, say(f.store, "second-player-secret"));
  f.store.startHand();
  resolve(f.store, nextTurn, "silent");
  await receipt.close();
  const summary = summarizeAiReceipts(f.read());
  assert.equal(summary.status, "complete", JSON.stringify(summary.issues));
  assert.equal(summary.counts.public_speech, 1);
  assert.equal(summary.counts.discarded, 1);
  assert.equal(summary.turns[0].terminal.late, true);
  assert.equal(summary.turns[0].terminal.based_on_street, "preflop");
  assert.equal(summary.turns[1].terminal.reason, "hand_advanced");
  assert.equal(summary.turns[1].terminal.decision, "silent");
  assert.equal(summary.turns[1].terminal.started_hand_index, 0);
  assert.equal(summary.turns[1].terminal.current_hand_index, 1);
});

for (const reopen of [false, true]) {
  test(`OFF 后迟到输出保留 ${reopen ? "turn_cancelled" : "seat_ai_off"}，不计沉默`, async (t) => {
    const f = fixture(t);
    const receipt = await f.capture();
    register(f.store);
    const turn = start(f.store, say(f.store));
    f.store.setSeatAiMode({ seatId: "a", mode: "OFF" });
    if (reopen) f.store.setSeatAiMode({ seatId: "a", mode: "ON" });
    resolve(f.store, turn, "silent");
    await receipt.close();
    const result = summarizeAiReceipts(f.read());
    assert.equal(result.status, "complete");
    assert.equal(result.counts.silent, 0);
    assert.equal(result.counts.discarded, 1);
    assert.equal(result.turns[0].terminal.reason, reopen ? "turn_cancelled" : "seat_ai_off");
  });
}

for (const lateOutput of [false, true]) {
  test(`租约回收${lateOutput ? "后迟到" : "本身"}不等于模型 silent`, async (t) => {
    const f = fixture(t);
    const receipt = await f.capture();
    register(f.store);
    const turn = start(f.store, say(f.store));
    f.advance(f.store.evaluationLeaseMs);
    assert.equal(f.store.reclaimExpiredEvaluations().length, 1);
    if (lateOutput) { f.advance(9); resolve(f.store, turn, "silent"); }
    await receipt.close();
    const result = summarizeAiReceipts(f.read());
    assert.equal(result.status, "complete", JSON.stringify(result.issues));
    assert.equal(result.counts.silent, 0);
    assert.equal(result.counts.discarded, 0, "回收及迟到只能归入同一个 turn，不重复计数");
    assert.equal(result.counts.turns, 1);
    assert.equal(result.counts[lateOutput ? "reclaimed_late_output_discarded" : "reclaimed"], 1);
    assert.equal(result.turns[0].terminal.decision, null);
    assert.equal(result.turns[0].timing_ms.start_to_terminal, f.store.evaluationLeaseMs);
    assert.equal(result.turns[0].timing_ms.reclaim_to_late_output, lateOutput ? 9 : null);
  });
}

for (const end of ["none", "off", "invalid_output"]) {
  test(`${end}：start 后未观察到终态不猜 still-running 或 silent`, async (t) => {
    const f = fixture(t);
    const receipt = await f.capture();
    register(f.store);
    const turn = start(f.store, say(f.store));
    if (end === "off") f.store.setSeatAiMode({ seatId: "a", mode: "OFF" });
    if (end === "invalid_output") {
      assert.throws(() => resolve(f.store, turn, "public_speech", { text: "x".repeat(141) }), { code: "message_too_long" });
      assert.equal(f.store.seats.get("a").active_turn, null);
    }
    await receipt.close();
    const result = summarizeAiReceipts(f.read());
    assert.equal(result.capture.complete, true, "捕获完整不等于有 AI 终态");
    assert.equal(result.status, "partial");
    assert.equal(result.counts.no_terminal_observed, 1);
    assert.equal(result.counts.silent, 0);
    assert.equal(result.turns[0].observed_terminal, null);
    assert.ok(result.turns[0].missing.includes("terminal"));
    assert.equal(result.turns[0].timing_ms.start_to_terminal, null);
  });
}

test("没有可订阅源事件的 engine 来源只保留 observed terminal，不冒充来源时间", async (t) => {
  const f = fixture(t);
  const receipt = await f.capture();
  register(f.store);
  const intent = f.store.notifyDomainEvent({ type: "HAND_SETTLED", eventId: "engine-source-not-observed", payload: {} });
  const turn = start(f.store, { evaluations: intent });
  f.advance(23);
  resolve(f.store, turn, "silent");
  await receipt.close();
  const result = summarizeAiReceipts(f.read());
  assert.equal(result.status, "partial");
  assert.equal(result.turns[0].observed_terminal, "silent");
  assert.equal(result.turns[0].source, null);
  assert.equal(result.turns[0].timing_ms.source_to_start, null);
  assert.equal(result.turns[0].timing_ms.start_to_terminal, 23);
});

test("STREET_ADVANCED 本身是可关联的权威来源", async (t) => {
  const f = fixture(t);
  const receipt = await f.capture();
  register(f.store);
  const advanced = f.store.advanceStreet({ street: "turn" });
  f.advance(4);
  const turn = start(f.store, advanced);
  f.advance(8);
  resolve(f.store, turn, "silent");
  await receipt.close();
  const result = summarizeAiReceipts(f.read());
  assert.equal(result.status, "complete");
  assert.equal(result.turns[0].source.type, "STREET_ADVANCED");
  assert.equal(result.turns[0].timing_ms.source_to_start, 4);
});

test("正文、回答、手牌、令牌、昵称、上下文及自由 ID 均不落盘，HMAC 每次运行不同", async (t) => {
  const secret = "SENSITIVE_FREE_ID_牌面_As_Kh_TOKEN";
  const f = fixture(t, { idPrefix: secret });
  const warnings = [];
  const first = await f.capture({ onWarning: (code) => warnings.push(code) });
  const secondFile = path.join(f.dir, "second.jsonl");
  const second = await f.capture({ filePath: secondFile });
  register(f.store, secret);
  const speech = say(f.store, "CHAT_SECRET_不要读取其他任务", secret);
  const turn = start(f.store, speech, secret);
  f.store.record("NOT_ALLOWED_SECRET_EVENT", { text: "ignored-text-secret", token: "token-secret" });
  f.store.resolveEvaluation({
    seatId: secret, turnId: turn, decision: "public_speech", text: "AI_ANSWER_SECRET_下注建议",
    roomBindingId: "room", tableRulesVersion: "rules",
  });
  f.store.record("HAND_STARTED", {
    hand_index: 0, text: "injected-text-secret", hole_cards: ["As", "Kh"], model_token: "token-secret",
    model_context: { text: "context-secret", nickname: "nickname-secret" },
  });
  await Promise.all([first.close(), second.close()]);
  const all = f.read() + fs.readFileSync(secondFile, "utf8") + JSON.stringify(warnings);
  for (const sentinel of [secret, "CHAT_SECRET", "AI_ANSWER_SECRET", "persona-secret", "ignored-text-secret",
    "injected-text-secret", "token-secret", "context-secret", "nickname-secret", '"As"', '"Kh"']) {
    assert.equal(all.includes(sentinel), false, sentinel);
  }
  const a = summarizeAiReceipts(f.read());
  const b = summarizeAiReceipts(fs.readFileSync(secondFile, "utf8"));
  assert.equal(a.status, "complete");
  assert.equal(b.status, "complete");
  assert.equal(a.turns.length, 1);
  assert.notEqual(a.turns[0].seat_ref, b.turns[0].seat_ref);
  assert.notEqual(a.turns[0].turn_ref, b.turns[0].turn_ref);
  assert.equal(a.turns[0].source_event_ref.length, 64);
});

test("wx 文件冲突与不可写路径不覆盖原证据，错误不泄漏路径", async (t) => {
  const f = fixture(t);
  const old = "old-evidence-secret";
  fs.writeFileSync(f.file, old, { flag: "wx" });
  await assert.rejects(f.capture(), { code: "ai_receipt_file_exists", message: "ai_receipt_file_exists" });
  assert.equal(f.read(), old);
  await assert.rejects(f.capture({ filePath: path.join(f.dir, "missing-secret-dir", "x.jsonl") }),
    { code: "ai_receipt_open_failed", message: "ai_receipt_open_failed" });
  assert.equal(f.store.listeners.size, 0);
});

for (const limit of ["record", "byte"]) {
  test(`${limit} 满额仍可写不完整 footer，文件与内存有界且权威继续`, async (t) => {
    const f = fixture(t);
    const warnings = [];
    const limits = limit === "record" ? { maxRecords: 4 } : { maxBytes: 4096 };
    const receipt = await f.capture({ limits, onWarning: (code) => warnings.push(code) });
    for (let i = 0; i < 30; i += 1) {
      f.store.startHand();
      await receipt.flush();
    }
    const status = await receipt.close();
    assert.equal(status.capture_complete, false);
    assert.equal(status.stop_reason, `${limit}_limit`);
    assert.equal(f.store.handIndex, 30);
    assert.equal(f.store.listeners.size, 0);
    assert.deepEqual(warnings, [`ai_receipt_${limit}_limit`]);
    assert.equal(status.pending_records, 0);
    assert.equal(status.pending_bytes, 0);
    assert.ok(fs.statSync(f.file).size <= (limits.maxBytes ?? DEFAULT_RECEIPT_LIMITS.maxBytes));
    assert.ok(f.read().trim().split("\n").length <= (limits.maxRecords ?? DEFAULT_RECEIPT_LIMITS.maxRecords));
    const summary = summarizeAiReceipts(f.read());
    assert.equal(summary.status, "partial", JSON.stringify(summary.issues));
    assert.equal(summary.capture.complete, false);
  });
}

test("慢写入时队列满额，close 等排空、重复 close 同一 Promise，只关一次", async (t) => {
  const f = fixture(t);
  const gate = deferred();
  let closes = 0;
  let writes = 0;
  const receipt = await f.capture({ limits: { maxQueuedRecords: 2 }, onWarning() { throw new Error("warning-secret"); } }, {
    async openFile(...args) {
      const handle = await fsp.open(...args);
      return {
        async write(...values) { writes += 1; if (writes === 2) await gate.promise; return handle.write(...values); },
        async close() { closes += 1; await handle.close(); },
      };
    },
  });
  try {
    f.store.startHand();
    f.store.startHand();
    f.store.startHand();
    assert.equal(receipt.status().pending_records, 2);
    assert.ok(receipt.status().pending_bytes <= DEFAULT_RECEIPT_LIMITS.maxQueuedBytes);
    assert.equal(receipt.status().stop_reason, "queue_limit");
    const closing = receipt.close();
    assert.equal(receipt.close(), closing);
    let completed = false;
    closing.then(() => { completed = true; });
    await Promise.resolve();
    assert.equal(completed, false, "慢盘没写完不能声称已关闭");
    assert.equal(closes, 0);
    f.store.startHand();
    assert.equal(f.store.handIndex, 4);
    gate.resolve();
    const status = await closing;
    assert.equal(closes, 1);
    assert.equal(status.written_events, 2);
    assert.equal(status.dropped_events, 1);
    assert.equal(summarizeAiReceipts(f.read()).status, "partial");
  } finally { gate.resolve(); }
});

test("待写 byte 上限独立于条数上限", async (t) => {
  const f = fixture(t);
  const gate = deferred();
  let writes = 0;
  const receipt = await f.capture({ limits: { maxQueuedBytes: 1024 } }, {
    async openFile(...args) {
      const handle = await fsp.open(...args);
      return {
        async write(...values) { writes += 1; if (writes === 2) await gate.promise; return handle.write(...values); },
        close: () => handle.close(),
      };
    },
  });
  try {
    for (let i = 0; i < 8; i += 1) f.store.startHand();
    assert.equal(receipt.status().stop_reason, "queue_limit");
    assert.ok(receipt.status().pending_bytes <= 1024);
    assert.ok(receipt.status().pending_records < DEFAULT_RECEIPT_LIMITS.maxQueuedRecords);
  } finally { gate.resolve(); await receipt.close(); }
});

test("异步写失败不逃逸进权威，输出只有固定错误码且缺 footer 不完整", async (t) => {
  const f = fixture(t);
  const warnings = [];
  let writes = 0;
  let closes = 0;
  const receipt = await f.capture({ onWarning: (code) => warnings.push(code) }, {
    async openFile(...args) {
      const handle = await fsp.open(...args);
      return {
        async write(...values) { writes += 1; if (writes === 2) throw new Error("disk-secret-path-token"); return handle.write(...values); },
        async close() { closes += 1; await handle.close(); },
      };
    },
  });
  f.store.startHand();
  await receipt.flush();
  f.store.startHand();
  assert.equal(f.store.handIndex, 2);
  const closed = await receipt.close();
  assert.equal(closed.capture_complete, false);
  assert.equal(closed.stop_reason, "write_failed");
  assert.equal(f.store.listeners.size, 0);
  assert.equal(closes, 1);
  assert.deepEqual(warnings, ["ai_receipt_write_failed"]);
  assert.equal(f.read().includes("disk-secret"), false);
  const summary = summarizeAiReceipts(f.read());
  assert.equal(summary.status, "partial");
  assert.ok(summary.issues.some((issue) => issue.code === "missing_footer"));
});

test("首记录写失败与订阅异常都清理句柄，不留下完整标记", async (t) => {
  const f = fixture(t);
  let closes = 0;
  await assert.rejects(f.capture({}, {
    async openFile() { return { async write() { throw new Error("disk-secret"); }, async close() { closes += 1; } }; },
  }), { code: "ai_receipt_write_failed" });
  assert.equal(closes, 1);
  assert.equal(f.store.listeners.size, 0);
  f.store.onEvent = () => { throw new Error("subscription-secret"); };
  await assert.rejects(f.capture({ filePath: path.join(f.dir, "subscribe.jsonl") }), { code: "ai_receipt_startup_failed" });
  const raw = fs.readFileSync(path.join(f.dir, "subscribe.jsonl"), "utf8");
  assert.equal(raw.includes("subscription-secret"), false);
  assert.equal(JSON.parse(raw.trim().split("\n").at(-1)).capture_complete, false);
});

for (const fault of ["close", "footer_write"]) {
  test(`${fault} 已落盘后报错：文件可读不等于写入/关闭成功`, async (t) => {
    const f = fixture(t);
    const warnings = [];
    const receipt = await f.capture({ onWarning: (code) => warnings.push(code) }, {
      async openFile(...args) {
        const handle = await fsp.open(...args);
        return {
          async write(...values) {
            const result = await handle.write(...values);
            if (fault === "footer_write" && values[0].toString().includes('"kind":"footer"')) {
              throw new Error("PRIVATE_AFTER_WRITE_SENTINEL");
            }
            return result;
          },
          async close() {
            await handle.close();
            if (fault === "close") throw new Error("PRIVATE_AFTER_CLOSE_SENTINEL");
          },
        };
      },
    });
    f.store.startHand();
    const status = await receipt.close();
    assert.equal(status.run_complete, false);
    assert.equal(status.capture_complete, fault === "close" ? true : null);
    assert.equal(status.write_acknowledged, fault === "close");
    assert.equal(status.close_succeeded, fault !== "close");
    assert.equal(f.store.listeners.size, 0);
    assert.deepEqual(warnings, [fault === "close" ? "ai_receipt_close_failed" : "ai_receipt_write_failed"]);
    const summary = summarizeAiReceipts(f.read());
    assert.equal(summary.capture.complete, true, "只说明文件当时可读且范围完整，不能回填 runtime ACK");
    assert.equal(summary.writer_acknowledgement_status, "unknown");
    assert.equal(summary.resource_close_status, "unknown");
    assert.equal((f.read() + JSON.stringify(warnings) + JSON.stringify(status)).includes("PRIVATE_"), false);
  });
}

test("短写被排空；人工异常关闭、来源序号冲突和坏枚举不生成完整证据", async (t) => {
  const f = fixture(t);
  const receipt = await f.capture({}, {
    async openFile(...args) {
      const handle = await fsp.open(...args);
      return { write: (buffer, offset, length, position) => handle.write(buffer, offset, Math.min(31, length), position), close: () => handle.close() };
    },
  });
  f.store.startHand();
  await receipt.close({ reason: "abnormal_close" });
  const result = summarizeAiReceipts(f.read());
  assert.equal(result.status, "partial");
  assert.equal(result.capture.stop_reason, "abnormal_close");
  for (const [index, event] of [
    { sequence: 99, at: 1000, type: "HAND_STARTED", event_id: "secret", payload: { hand_index: 0 } },
    { sequence: f.store.sequence + 1, at: 1000, type: "STREET_ADVANCED", event_id: "secret", payload: { street: "street-secret" } },
  ].entries()) {
    const observer = await f.capture({ filePath: path.join(f.dir, `bad-${index}.jsonl`) });
    for (const listener of f.store.listeners) listener(event);
    const status = await observer.close();
    assert.equal(status.capture_complete, false);
    assert.equal(f.store.listeners.size, 0);
    assert.equal(fs.readFileSync(path.join(f.dir, `bad-${index}.jsonl`), "utf8").includes("secret"), false);
  }
});
