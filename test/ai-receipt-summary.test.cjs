"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { SeatAiStore } = require("../src/authority/seat-ai-store.cjs");
const { createAiLifecycleReceipts } = require("../src/host/ai-lifecycle-receipts.cjs");
const { summarizeAiReceipts, main } = require("../test-support/summarize-ai-receipts.cjs");

async function sample({ turns = 1 } = {}) {
  let now = 1000;
  let id = 0;
  let raw = "";
  const store = new SeatAiStore({ now: () => now, idFactory: () => `sample-${++id}` });
  const receipts = await createAiLifecycleReceipts({ store, filePath: "memory-only" }, {
    async openFile() {
      return { async write(buffer, offset, length) { raw += buffer.subarray(offset, offset + length).toString(); return { bytesWritten: length }; }, async close() {} };
    },
  });
  try {
    store.registerSeat({ seatId: "a", playerId: "p" });
    store.confirmDefaultPublicScope({ seatId: "a", roomBindingId: "room", tableRulesVersion: "rules", acknowledged: true });
    for (let index = 0; index < turns; index += 1) {
      if (index > 0) now += 5000;
      const { evaluations } = store.submitPlayerText({ seatId: "a", text: "CHAT_PRIVATE_SENTINEL", roomBindingId: "room", tableRulesVersion: "rules" });
      now += 10;
      const { payload } = store.startEvaluation({ seatId: "a", intentId: evaluations[0].intent_id });
      now += 25;
      store.resolveEvaluation({ seatId: "a", turnId: payload.turn_id, decision: "silent" });
    }
  } finally { await receipts.close(); }
  return raw.trim().split("\n").map(JSON.parse);
}

// 用来独立验证“结构/计数完整，但缺因果节点”的保守处理；不伪称它由记录器正常生成。
function encode(rows, { repairCounts = false } = {}) {
  const footer = rows.find((row) => row.kind === "footer");
  if (repairCounts && footer !== undefined) {
    const prefix = rows.slice(0, rows.indexOf(footer));
    const count = prefix.filter((row) => row.kind === "event").length;
    footer.counts.accepted_events = count;
    footer.counts.written_events = count;
    footer.counts.ignored_events = footer.counts.observed_events - count - footer.counts.dropped_events;
    footer.counts.records_before_footer = prefix.length;
    footer.counts.bytes_before_footer = Buffer.byteLength(prefix.map((row) => `${JSON.stringify(row)}\n`).join(""));
  }
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

function noTimes(summary) {
  assert.ok(summary.turns.length > 0, "反例必须保留至少一个可被错误分类的回合");
  for (const turn of summary.turns) assert.ok(Object.values(turn.timing_ms).every((value) => value === null));
}

test("离线汇总只按已观察权威事件配对，零 turn 不是 AI 成功", async () => {
  const rows = await sample();
  const good = summarizeAiReceipts(encode(rows));
  assert.equal(good.status, "complete");
  assert.equal(good.counts.silent, 1);
  assert.equal(good.turns[0].chain_status, "complete");
  assert.equal(good.turns[0].timing_ms.source_to_terminal, 35);
  assert.equal(good.gate5_evaluated, false);
  assert.equal(good.gate5_status, undefined);
  const none = summarizeAiReceipts(encode(rows.filter((row) => row.kind !== "event"), { repairCounts: true }));
  assert.equal(none.counts.starts_observed, 0);
  assert.equal(none.counts.turns, 0);
  assert.equal(none.counts.silent, 0);
  assert.equal(none.ai_success, undefined);
});

for (const removed of ["source", "start", "terminal", "header", "footer"]) {
  test(`缺 ${removed} 不产完整 AI 链`, async () => {
    const rows = await sample();
    const drop = removed === "source" ? "PLAYER_PUBLIC_SPEECH"
      : removed === "start" ? "SEAT_AI_EVALUATION_STARTED"
        : removed === "terminal" ? "SEAT_AI_SILENT" : null;
    const filtered = rows.filter((row) => row.kind !== removed && row.type !== drop);
    const result = summarizeAiReceipts(encode(filtered, { repairCounts: true }));
    assert.equal(result.status, "partial", JSON.stringify(result.issues));
    assert.equal(result.turns.length, 1);
    assert.equal(result.turns[0].chain_status, "partial");
    assert.ok(result.turns[0].missing.includes(removed));
    if (removed === "terminal") {
      assert.equal(result.counts.no_terminal_observed, 1);
      assert.equal(result.turns[0].observed_terminal, null);
    }
    if (["start", "header", "footer"].includes(removed)) noTimes(result);
    if (removed === "source") {
      assert.equal(result.turns[0].timing_ms.source_to_start, null);
      assert.equal(result.turns[0].timing_ms.source_to_terminal, null);
      assert.equal(result.turns[0].timing_ms.start_to_terminal, 25);
    }
  });
}

test("未知来源不能以排队时间或 HAND_STARTED 冒充 source", async () => {
  const rows = await sample();
  const source = rows.find((row) => row.type === "PLAYER_PUBLIC_SPEECH");
  source.type = "HAND_STARTED";
  const result = summarizeAiReceipts(encode(rows, { repairCounts: true }));
  assert.equal(result.status, "partial");
  assert.equal(result.turns[0].source, null);
  assert.equal(result.turns[0].observed_terminal, "silent");
  assert.equal(result.turns[0].timing_ms.source_to_start, null);
});

for (const defect of ["negative", "backwards", "sequence", "duplicate", "conflicting_terminal", "source_conflict", "bad_enum", "bad_field", "counts", "first_after_last", "event_outside_range"]) {
  test(`${defect}：畸形/冲突只报固定诊断，不形成伪时延与成功`, async () => {
    const rows = await sample();
    const source = rows.find((row) => row.type === "PLAYER_PUBLIC_SPEECH");
    const started = rows.find((row) => row.type === "SEAT_AI_EVALUATION_STARTED");
    const terminal = rows.find((row) => row.type === "SEAT_AI_SILENT");
    if (defect === "negative") terminal.at = -1;
    if (defect === "backwards") terminal.at = source.at - 1;
    if (defect === "sequence") terminal.sequence = started.sequence;
    if (defect === "duplicate") rows.splice(rows.indexOf(terminal), 0, structuredClone(started));
    if (defect === "conflicting_terminal") {
      const extra = { ...terminal, event_ref: "f".repeat(64), sequence: terminal.sequence + 1 };
      rows.splice(rows.indexOf(terminal) + 1, 0, extra);
      rows.at(-1).capture_through_sequence += 1;
      rows.at(-1).counts.observed_events += 1;
    }
    if (defect === "source_conflict") terminal.source_event_ref = "f".repeat(64);
    if (defect === "bad_enum") terminal.reason = "REASON_PRIVATE_SENTINEL";
    if (defect === "bad_field") source.model_context = "CONTEXT_PRIVATE_SENTINEL";
    if (defect === "counts") rows.at(-1).counts.observed_events += 100;
    if (defect === "first_after_last") rows.at(-1).first_event_at = rows.at(-1).last_event_at + 1;
    if (defect === "event_outside_range") rows.at(-1).last_event_at = terminal.at - 1;
    const result = summarizeAiReceipts(encode(rows, { repairCounts: true }));
    assert.equal(result.status, "invalid", JSON.stringify(result));
    noTimes(result);
    assert.equal(JSON.stringify(result).includes("PRIVATE_SENTINEL"), false);
    assert.ok(result.turns.every((turn) => turn.chain_status !== "complete"));
  });
}

for (const defect of [
  "terminal_hand_conflict", "public_based_street_conflict", "hand_advanced_start_conflict",
  "hand_advanced_not_advanced", "start_source_absent", "terminal_source_absent",
  "start_hand_absent", "start_street_absent", "terminal_hand_absent", "discard_hand_absent",
]) {
  test(`${defect}：完整计数不能掩盖已观察回合的字段缺失或手数街道矛盾`, async () => {
    const rows = await sample();
    const start = rows.find((row) => row.type === "SEAT_AI_EVALUATION_STARTED");
    const terminal = rows.find((row) => row.type === "SEAT_AI_SILENT");
    if (defect === "terminal_hand_conflict") terminal.hand_index = start.hand_index + 1;
    if (defect === "public_based_street_conflict") {
      Object.assign(terminal, {
        type: "AI_PUBLIC_SPEECH", decision: "public_speech", street: "flop", based_on_street: "flop", late: false,
      });
      assert.notEqual(start.street, terminal.based_on_street, "反例要与真实 start 街道矛盾");
    }
    if (defect.startsWith("hand_advanced_") || defect === "discard_hand_absent") {
      Object.assign(terminal, {
        type: "SEAT_AI_OUTPUT_DISCARDED", reason: "hand_advanced", source_event_ref: null, hand_index: null,
        started_hand_index: start.hand_index, current_hand_index: start.hand_index + 1,
      });
      if (defect === "hand_advanced_start_conflict") {
        terminal.started_hand_index += 1;
        terminal.current_hand_index += 1;
      }
      if (defect === "hand_advanced_not_advanced") terminal.current_hand_index = terminal.started_hand_index;
      if (defect === "discard_hand_absent") terminal.current_hand_index = null;
    }
    if (defect === "start_source_absent") start.source_event_ref = null;
    if (defect === "terminal_source_absent") terminal.source_event_ref = null;
    if (defect === "start_hand_absent") start.hand_index = null;
    if (defect === "start_street_absent") start.street = null;
    if (defect === "terminal_hand_absent") terminal.hand_index = null;
    const result = summarizeAiReceipts(encode(rows, { repairCounts: true }));
    assert.equal(result.status, "invalid", JSON.stringify(result));
    assert.equal(result.capture.complete, false, "内容有矛盾时不能仍称捕获内容完整");
    noTimes(result);
    assert.ok(result.turns.every((turn) => turn.chain_status !== "complete"));
  });
}

test("同一个 turn_ref 不能靠换 seat_ref 拼成两条完整链", async () => {
  const rows = await sample({ turns: 2 });
  const starts = rows.filter((row) => row.type === "SEAT_AI_EVALUATION_STARTED");
  const secondTurn = starts[1].turn_ref;
  for (const row of rows.filter((row) => row.turn_ref === secondTurn)) {
    row.turn_ref = starts[0].turn_ref;
    row.seat_ref = "e".repeat(64);
  }
  const result = summarizeAiReceipts(encode(rows, { repairCounts: true }));
  assert.equal(result.status, "invalid", JSON.stringify(result));
  assert.equal(result.counts.turns, 1, "权威回合标识在一次运行内唯一，不能按席位拆成两次成功");
  assert.ok(result.turns[0].anomalies.includes("seat_reference_conflict"));
  assert.equal(result.counts.silent, 0);
  assert.equal(result.capture.complete, false);
  noTimes(result);
});

for (const brokenIndex of [0, 1]) {
  test(`第 ${brokenIndex + 1} 条链冲突：整份非法输入的结论与时差不依赖处理顺序`, async () => {
    const rows = await sample({ turns: 2 });
    const terminals = rows.filter((row) => row.type === "SEAT_AI_SILENT");
    terminals[brokenIndex].source_event_ref = "d".repeat(64);
    const result = summarizeAiReceipts(encode(rows, { repairCounts: true }));
    assert.equal(result.status, "invalid");
    assert.equal(result.capture.complete, false);
    assert.equal(result.capture.status, "invalid");
    assert.equal(result.counts.silent, 0);
    assert.equal(result.counts.unknown, 2);
    assert.ok(result.turns.every((turn) => turn.chain_status === "invalid"));
    noTimes(result);
  });
}

test("尾行截断、缺换行、空文件、混合运行和缺字节明确拒绝完整", async () => {
  const rows = await sample();
  const raw = encode(rows);
  assert.equal(summarizeAiReceipts(raw.slice(0, -20)).status, "invalid");
  const noNewline = summarizeAiReceipts(raw.trimEnd());
  assert.equal(noNewline.status, "partial");
  noTimes(noNewline);
  assert.equal(summarizeAiReceipts("").status, "partial");
  assert.equal(summarizeAiReceipts("{raw-secret\n").status, "invalid");
  rows[2].run_ref = "0".repeat(32);
  const mixed = summarizeAiReceipts(encode(rows, { repairCounts: true }));
  assert.equal(mixed.status, "invalid");
  noTimes(mixed);
});

test("满额与伪 complete footer 不能把截断当成功", async () => {
  const rows = await sample();
  rows.at(-1).capture_complete = false;
  rows.at(-1).stop_reason = "record_limit";
  const partial = summarizeAiReceipts(encode(rows));
  assert.equal(partial.status, "partial");
  noTimes(partial);
  rows.at(-1).capture_complete = true;
  const fakeComplete = summarizeAiReceipts(encode(rows));
  assert.equal(fakeComplete.status, "invalid");
  noTimes(fakeComplete);
});

test("异常输入规模有界，解析器不回显未知字段或错误正文", () => {
  assert.equal(summarizeAiReceipts(null).status, "invalid");
  assert.equal(summarizeAiReceipts("x".repeat(16 * 1024 * 1024 + 1)).status, "invalid");
  const result = summarizeAiReceipts('"secret"\n'.repeat(40));
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.length <= 32);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("真实离线 CLI：0 完整/2 不完整/1 错误，只输出 JSON 或固定码", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-receipt-summary-"));
  t.after(() => {
    const actual = fs.realpathSync(dir);
    assert.equal(path.dirname(actual).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(actual).startsWith("tokengame-receipt-summary-"));
    fs.rmSync(actual, { recursive: true, force: true });
  });
  const entry = path.resolve(__dirname, "../test-support/summarize-ai-receipts.cjs");
  const rows = await sample();
  const cases = [
    { name: "complete", raw: encode(rows), code: 0, status: "complete" },
    { name: "partial", raw: encode(rows.slice(0, -1)), code: 2, status: "partial" },
    { name: "invalid", raw: '{"private":"BODY_PRIVATE_SENTINEL"}\n', code: 1, status: "invalid" },
  ];
  for (const item of cases) {
    const file = path.join(dir, `${item.name}.jsonl`);
    fs.writeFileSync(file, item.raw, { flag: "wx" });
    const run = spawnSync(process.execPath, [entry, file], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    assert.equal(run.status, item.code, run.stderr);
    assert.equal(JSON.parse(run.stdout).status, item.status);
    assert.equal((run.stdout + run.stderr).includes("PRIVATE_SENTINEL"), false);
  }
  const missingPath = path.join(dir, "PATH_PRIVATE_SENTINEL.jsonl");
  const missing = spawnSync(process.execPath, [entry, missingPath], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.equal(missing.stderr, "ai_receipt_read_failed\n");
  const output = { stdout: { write() { assert.fail("usage wrote stdout"); } }, stderr: { write(text) { assert.equal(text, "ai_receipt_usage\n"); } } };
  assert.equal(await main([], output), 1);
});
