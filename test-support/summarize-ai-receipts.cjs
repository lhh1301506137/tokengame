"use strict";

// 离线读取本地权威观察，不连接牌桌/宿主，不重放模型，也不裁决 Gate 5。
const fs = require("node:fs");
const {
  RECEIPT_SCHEMA, RECEIPT_EVENT_TYPES, STREETS, DISCARD_REASONS, STOP_REASONS,
} = require("../src/host/ai-lifecycle-receipts.cjs");

const SUMMARY_SCHEMA = "tokengame.ai-lifecycle-summary.v1";
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_INPUT_RECORDS = 20_000;
const SOURCE_TYPES = ["PLAYER_PUBLIC_SPEECH", "STREET_ADVANCED"];
const TERMINAL_TYPES = [
  "AI_PUBLIC_SPEECH", "SEAT_AI_SILENT", "SEAT_AI_OUTPUT_DISCARDED", "SEAT_AI_EVALUATION_RECLAIMED",
];
const EVENT_KEYS = [
  "schema", "kind", "run_ref", "sequence", "at", "type", "event_ref", "seat_ref", "turn_ref",
  "source_event_ref", "hand_index", "street", "started_hand_index", "current_hand_index",
  "based_on_street", "decision", "reason", "late",
];
const COUNT_KEYS = [
  "observed_events", "ignored_events", "accepted_events", "written_events", "dropped_events",
  "records_before_footer", "bytes_before_footer",
];

const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const nullable = (value, check) => value === null || check(value);
const reference = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function keys(value, expected) {
  return object(value) && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function validRow(row) {
  if (!object(row) || row.schema !== RECEIPT_SCHEMA || typeof row.run_ref !== "string"
      || !/^[0-9a-f]{32}$/.test(row.run_ref)) return false;
  if (row.kind === "header") {
    return keys(row, ["schema", "kind", "run_ref", "source", "id_encoding", "capture_after_sequence", "capture_started_at", "limits"])
      && row.source === "SeatAiStore.onEvent" && row.id_encoding === "run_hmac_sha256"
      && integer(row.capture_after_sequence) && integer(row.capture_started_at)
      && keys(row.limits, ["max_records", "max_bytes", "max_queued_records", "max_queued_bytes"])
      && Object.values(row.limits).every((value) => integer(value) && value > 0);
  }
  if (row.kind === "footer") {
    return keys(row, ["schema", "kind", "run_ref", "capture_through_sequence", "capture_ended_at", "first_event_at", "last_event_at", "capture_complete", "stop_reason", "counts"])
      && integer(row.capture_through_sequence) && nullable(row.capture_ended_at, integer)
      && nullable(row.first_event_at, integer) && nullable(row.last_event_at, integer)
      && typeof row.capture_complete === "boolean" && STOP_REASONS.includes(row.stop_reason)
      && keys(row.counts, COUNT_KEYS) && Object.values(row.counts).every(integer);
  }
  if (row.kind !== "event" || !keys(row, EVENT_KEYS)) return false;
  if (!RECEIPT_EVENT_TYPES.includes(row.type) || !integer(row.sequence) || row.sequence === 0
      || !integer(row.at) || !reference(row.event_ref)
      || !["seat_ref", "turn_ref", "source_event_ref"].every((key) => nullable(row[key], reference))
      || !["hand_index", "started_hand_index", "current_hand_index"].every((key) => nullable(row[key], integer))
      || !["street", "based_on_street"].every((key) => nullable(row[key], (value) => STREETS.includes(value)))) return false;
  if ((row.type === "SEAT_AI_EVALUATION_STARTED" || TERMINAL_TYPES.includes(row.type))
      && (row.seat_ref === null || row.turn_ref === null)) return false;
  // 这些字段由实际权威事件必带。来源事件没被捕获与来源引用本身缺失是两回事：
  // engine 来源可以没有同 ID 的本地 source 行，但 start / 已发布决定仍必须带其引用。
  if (["SEAT_AI_EVALUATION_STARTED", "AI_PUBLIC_SPEECH", "SEAT_AI_SILENT"].includes(row.type)
      && (row.source_event_ref === null || row.hand_index === null)) return false;
  if (row.type === "SEAT_AI_EVALUATION_STARTED" && row.street === null) return false;
  if (row.type === "AI_PUBLIC_SPEECH") {
    return row.decision === "public_speech" && row.reason === null && typeof row.late === "boolean"
      && row.street !== null && row.based_on_street !== null
      && row.late === (row.street !== row.based_on_street);
  }
  if (row.type === "SEAT_AI_SILENT") return row.decision === "silent" && row.reason === null && row.late === null;
  if (row.type === "SEAT_AI_OUTPUT_DISCARDED") {
    return ["silent", "public_speech"].includes(row.decision) && DISCARD_REASONS.includes(row.reason) && row.late === null
      && (row.reason !== "hand_advanced" || (row.started_hand_index !== null && row.current_hand_index !== null));
  }
  return row.decision === null && row.reason === null && row.late === null;
}

function emptySummary() {
  return {
    schema: SUMMARY_SCHEMA, status: "partial", gate5_evaluated: false,
    writer_acknowledgement_status: "unknown", resource_close_status: "unknown",
    capture: { status: "partial", complete: false, after_sequence: null, through_sequence: null, stop_reason: null },
    counts: {
      event_records: 0, source_records: 0, starts_observed: 0, turns: 0, public_speech: 0, silent: 0,
      discarded: 0, reclaimed: 0, reclaimed_late_output_discarded: 0, no_terminal_observed: 0, unknown: 0,
    },
    turns: [], issues: [],
    limitations: [
      "authority_event_intervals_are_not_pure_model_inference_time",
      "no_evidence_of_model_identity_effort_or_host_clicks",
      "failed_mcp_request_count_unknown",
      "no_terminal_observed_does_not_mean_still_running_or_silent",
      "capture_covers_only_this_subscription_not_prior_or_future_events",
      "local_receipts_are_not_cryptographic_attestation",
      "readable_file_does_not_prove_writer_acknowledgement_or_resource_close",
    ],
  };
}

function observation(row) {
  return row === undefined ? null : {
    sequence: row.sequence, at: row.at, type: row.type, hand_index: row.hand_index,
    street: row.street, started_hand_index: row.started_hand_index,
    current_hand_index: row.current_hand_index, based_on_street: row.based_on_street,
    decision: row.decision, reason: row.reason, late: row.late,
  };
}

function summarizeAiReceipts(input) {
  const result = emptySummary();
  let invalid = false;
  const issue = (code, severity = "partial", line = null) => {
    if (severity === "invalid") invalid = true;
    // 有界错误列表；绝不把坏行、未知字段值、JSON 解析器正文或路径复制进摘要。
    if (result.issues.length < 32) result.issues.push({ code, severity, line });
  };
  if (typeof input !== "string" || Buffer.byteLength(input) > MAX_INPUT_BYTES) {
    issue("input_type_or_size_invalid", "invalid");
    result.status = "invalid";
    result.capture.status = "invalid";
    return result;
  }
  const lines = input.split("\n");
  const endsWithNewline = lines.at(-1) === "";
  if (endsWithNewline) lines.pop();
  else issue("truncated_last_line");
  if (lines.length > MAX_INPUT_RECORDS) {
    issue("record_count_limit", "invalid");
    result.status = "invalid";
    result.capture.status = "invalid";
    return result;
  }
  const rows = [];
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    const start = offset;
    offset += Buffer.byteLength(line) + (index < lines.length - 1 || endsWithNewline ? 1 : 0);
    if (Buffer.byteLength(line) > 4096) { issue("record_size_limit", "invalid", index + 1); continue; }
    let row;
    try { row = JSON.parse(line); } catch { issue("malformed_json", "invalid", index + 1); continue; }
    if (!validRow(row)) { issue("invalid_record", "invalid", index + 1); continue; }
    rows.push({ row, line: index + 1, offset: start });
  }
  const headers = rows.filter(({ row }) => row.kind === "header");
  const footers = rows.filter(({ row }) => row.kind === "footer");
  if (headers.length === 0) issue("missing_header");
  if (footers.length === 0) issue("missing_footer");
  if (headers.length > 1 || footers.length > 1) issue("duplicate_capture_marker", "invalid");
  const header = headers.length === 1 ? headers[0].row : null;
  const footer = footers.length === 1 ? footers[0].row : null;
  if ((header !== null && headers[0].line !== 1) || (footer !== null && footers[0].line !== lines.length)) {
    issue("capture_marker_order", "invalid");
  }
  const events = rows.filter(({ row }) => row.kind === "event").map(({ row }) => row);
  const runRef = header?.run_ref ?? rows[0]?.row.run_ref;
  if (rows.some(({ row }) => row.run_ref !== runRef)) issue("mixed_runs", "invalid");
  const byEvent = new Map();
  let previousSequence = header?.capture_after_sequence ?? 0;
  let previousAt = header?.capture_started_at ?? 0;
  for (const event of events) {
    if (event.sequence <= previousSequence) issue("sequence_conflict", "invalid");
    if (event.at < previousAt) issue("authority_time_backwards", "invalid");
    if (byEvent.has(event.event_ref)) issue("event_reference_conflict", "invalid");
    previousSequence = event.sequence;
    previousAt = event.at;
    byEvent.set(event.event_ref, event);
  }
  if (footer !== null) {
    const counts = footer.counts;
    if (counts.written_events !== events.length || counts.records_before_footer !== footers[0].line - 1
        || counts.bytes_before_footer !== footers[0].offset) issue("capture_count_mismatch", "invalid");
    if (counts.accepted_events !== counts.written_events
        || counts.observed_events !== counts.ignored_events + counts.written_events + counts.dropped_events) {
      issue("capture_count_mismatch", "invalid");
    }
    if (footer.capture_through_sequence < previousSequence) issue("capture_sequence_range", "invalid");
    if (footer.capture_ended_at === null) issue("capture_end_time_unknown");
    else if (footer.capture_ended_at < previousAt) issue("authority_time_backwards", "invalid");
    if (counts.observed_events === 0) {
      if (footer.first_event_at !== null || footer.last_event_at !== null) issue("capture_event_time_range", "invalid");
    } else if (footer.first_event_at === null || footer.last_event_at === null
        || footer.first_event_at > footer.last_event_at
        || (header !== null && footer.first_event_at < header.capture_started_at)
        || (footer.capture_ended_at !== null && footer.last_event_at > footer.capture_ended_at)
        || events.some((event) => event.at < footer.first_event_at || event.at > footer.last_event_at)) {
      issue("capture_event_time_range", "invalid");
    }
    if (footer.capture_complete && (footer.stop_reason !== "normal_close" || counts.dropped_events !== 0)) {
      issue("false_complete_marker", "invalid");
    }
    if (!footer.capture_complete) issue("capture_incomplete");
    if (header !== null) {
      if (footer.capture_through_sequence - header.capture_after_sequence !== counts.observed_events) {
        issue("capture_sequence_count_mismatch", "invalid");
      }
      if (lines.length > header.limits.max_records || Buffer.byteLength(input) > header.limits.max_bytes) {
        issue("declared_capture_limit_exceeded", "invalid");
      }
    }
  }
  result.counts.event_records = events.length;
  result.counts.source_records = events.filter((event) => SOURCE_TYPES.includes(event.type)).length;
  result.counts.starts_observed = events.filter((event) => event.type === "SEAT_AI_EVALUATION_STARTED").length;

  const traces = new Map();
  for (const event of events) {
    if (event.type !== "SEAT_AI_EVALUATION_STARTED" && !TERMINAL_TYPES.includes(event.type)) continue;
    // turn_id 由权威一次性铸造。换一个 seat_ref 不能把同一回合的身份冲突拆成两次成功。
    const key = event.turn_ref;
    if (!traces.has(key)) traces.set(key, []);
    traces.get(key).push(event);
  }
  const analyzedTraces = [];
  for (const trace of traces.values()) {
    const anomalies = [];
    const missing = [];
    const starts = trace.filter((event) => event.type === "SEAT_AI_EVALUATION_STARTED");
    const terminals = trace.filter((event) => TERMINAL_TYPES.includes(event.type));
    const start = starts[0];
    const terminal = terminals[0];
    const lateOutput = terminals[1];
    if (new Set(trace.map((event) => event.seat_ref)).size > 1) anomalies.push("seat_reference_conflict");
    if (starts.length > 1) anomalies.push("duplicate_start");
    const reclaimedThenLate = terminals.length === 2
      && terminal.type === "SEAT_AI_EVALUATION_RECLAIMED"
      && lateOutput.type === "SEAT_AI_OUTPUT_DISCARDED"
      && ["turn_reclaimed", "seat_ai_off"].includes(lateOutput.reason);
    if (terminals.length > 1 && !reclaimedThenLate) anomalies.push("conflicting_terminals");
    if (header === null) missing.push("header");
    if (footer === null) missing.push("footer");
    if (start === undefined) missing.push("start");
    if (terminal === undefined) missing.push("terminal");
    const sourceRef = start?.source_event_ref ?? terminal?.source_event_ref ?? null;
    const candidateSource = byEvent.get(sourceRef);
    const source = candidateSource !== undefined && SOURCE_TYPES.includes(candidateSource.type) ? candidateSource : undefined;
    if (source === undefined) missing.push("source");
    if (terminal?.reason === "turn_reclaimed") missing.push("reclaim");
    if (start !== undefined && terminal !== undefined) {
      if (terminal.sequence <= start.sequence || terminal.at < start.at) anomalies.push("terminal_precedes_start");
      for (const end of terminals) {
        if (end.source_event_ref !== null && end.source_event_ref !== start.source_event_ref) {
          anomalies.push("source_reference_conflict");
        }
        if (end.hand_index !== null && end.hand_index !== start.hand_index) anomalies.push("terminal_hand_conflict");
        if (end.type === "AI_PUBLIC_SPEECH" && end.based_on_street !== start.street) anomalies.push("based_street_conflict");
        if (end.reason === "hand_advanced" && (end.started_hand_index !== start.hand_index
            || end.current_hand_index <= end.started_hand_index)) anomalies.push("discard_hand_conflict");
      }
    }
    if (source !== undefined && start !== undefined
        && (source.sequence >= start.sequence || source.at > start.at)) anomalies.push("source_follows_start");
    if (source !== undefined && start !== undefined && source.hand_index !== null
        && start.hand_index !== null && source.hand_index !== start.hand_index) anomalies.push("source_hand_conflict");
    if (reclaimedThenLate && (lateOutput.sequence <= terminal.sequence || lateOutput.at < terminal.at)) {
      anomalies.push("late_output_precedes_reclaim");
    }
    if (anomalies.length > 0) issue("invalid_turn_chain", "invalid");
    analyzedTraces.push({ trace, anomalies, missing, start, terminal, lateOutput, sourceRef, source, reclaimedThenLate });
  }
  // 先校验全部链再给出完整性和时差。否则后面一条链才发现的冲突会留下前面链的伪成功，
  // 或让后面链同时出现 unknown 与数字时差，结果随 Map 的遍历顺序变化。
  const captureComplete = !invalid && result.issues.length === 0 && header !== null && footer?.capture_complete === true;
  result.capture = {
    status: invalid ? "invalid" : captureComplete ? "complete" : "partial", complete: captureComplete,
    after_sequence: header?.capture_after_sequence ?? null,
    through_sequence: footer?.capture_through_sequence ?? null,
    started_at: header?.capture_started_at ?? null, ended_at: footer?.capture_ended_at ?? null,
    stop_reason: footer?.stop_reason ?? null,
  };
  for (const { trace, anomalies, missing, start, terminal, lateOutput, sourceRef, source, reclaimedThenLate } of analyzedTraces) {
    let observedTerminal = terminal === undefined ? null
      : reclaimedThenLate ? "reclaimed_late_output_discarded"
        : terminal.type === "AI_PUBLIC_SPEECH" ? "public_speech"
          : terminal.type === "SEAT_AI_SILENT" ? "silent"
            : terminal.type === "SEAT_AI_EVALUATION_RECLAIMED" ? "reclaimed" : "discarded";
    if (invalid || anomalies.length > 0) observedTerminal = "unknown";
    const chainStatus = invalid || anomalies.length > 0 ? "invalid"
      : captureComplete && missing.length === 0 ? "complete" : "partial";
    // 不完整捕获或冲突时不算时差；缺 source 的完整文件仍可报告已观察的 start→terminal。
    const canTime = captureComplete && anomalies.length === 0;
    result.turns.push({
      seat_ref: trace[0].seat_ref, turn_ref: trace[0].turn_ref, source_event_ref: sourceRef,
      observed_terminal: observedTerminal, chain_status: chainStatus, missing, anomalies,
      source: observation(source), start: observation(start), terminal: observation(terminal),
      late_output: reclaimedThenLate ? observation(lateOutput) : null,
      timing_ms: {
        source_to_start: canTime && source !== undefined && start !== undefined ? start.at - source.at : null,
        start_to_terminal: canTime && start !== undefined && terminal !== undefined ? terminal.at - start.at : null,
        source_to_terminal: canTime && source !== undefined && start !== undefined && terminal !== undefined ? terminal.at - source.at : null,
        reclaim_to_late_output: canTime && reclaimedThenLate ? lateOutput.at - terminal.at : null,
      },
    });
    result.counts[observedTerminal ?? "no_terminal_observed"] += 1;
  }
  result.counts.turns = result.turns.length;
  result.status = invalid ? "invalid"
    : captureComplete && result.turns.every((turn) => turn.chain_status === "complete") ? "complete" : "partial";
  return result;
}

async function summarizeAiReceiptFile(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw Object.assign(new Error("ai_receipt_read_failed"), { code: "ai_receipt_read_failed" });
  }
  const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) throw new Error("limit");
      chunks.push(chunk);
    }
  } catch {
    // 文件错误可能包含路径；返回固定的本地诊断，不传播 Node 的 error.message。
    throw Object.assign(new Error("ai_receipt_read_failed"), { code: "ai_receipt_read_failed" });
  } finally {
    stream.destroy();
  }
  return summarizeAiReceipts(Buffer.concat(chunks).toString("utf8"));
}

async function main(argv = process.argv.slice(2), output = process) {
  if (argv.length !== 1 || typeof argv[0] !== "string" || argv[0] === "") {
    output.stderr.write("ai_receipt_usage\n");
    return 1;
  }
  let summary;
  try { summary = await summarizeAiReceiptFile(argv[0]); } catch {
    output.stderr.write("ai_receipt_read_failed\n");
    return 1;
  }
  output.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.status === "invalid") {
    output.stderr.write("ai_receipt_invalid_input\n");
    return 1;
  }
  return summary.status === "complete" ? 0 : 2;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    process.stderr.write("ai_receipt_summary_failed\n");
    process.exitCode = 1;
  });
}

module.exports = { summarizeAiReceipts, summarizeAiReceiptFile, main, SUMMARY_SCHEMA };
