"use strict";

// 只旁观 SeatAiStore 已经写下的事实。这里不领取意图、不读取模型上下文，也不判游戏结果。
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const RECEIPT_SCHEMA = "tokengame.ai-lifecycle-receipt.v1";
const RECEIPT_EVENT_TYPES = Object.freeze([
  "PLAYER_PUBLIC_SPEECH", "STREET_ADVANCED", "HAND_STARTED",
  "SEAT_AI_EVALUATION_STARTED", "AI_PUBLIC_SPEECH", "SEAT_AI_SILENT",
  "SEAT_AI_EVALUATION_RECLAIMED", "SEAT_AI_OUTPUT_DISCARDED",
]);
const STREETS = Object.freeze(["preflop", "flop", "turn", "river", "showdown", "settled"]);
const DISCARD_REASONS = Object.freeze([
  "hand_advanced", "seat_ai_off", "turn_cancelled", "turn_reclaimed",
]);
const STOP_REASONS = Object.freeze([
  "normal_close", "startup_failed", "abnormal_close", "shutdown_failed",
  "record_limit", "byte_limit", "queue_limit", "write_failed", "close_failed",
  "invalid_event", "source_sequence_invalid", "subscription_failed",
]);
const DEFAULT_RECEIPT_LIMITS = Object.freeze({
  maxRecords: 10_000,
  maxBytes: 8 * 1024 * 1024,
  maxQueuedRecords: 128,
  maxQueuedBytes: 256 * 1024,
});
// 首尾也计入文件上限。预留尾记录空间，满额时仍能明确写“不完整”。
const FOOTER_RESERVE_BYTES = 2048;

function receiptError(code) {
  // 不附加原始 Error/cause、文件路径或任意调用者文本；同一个对象也可能被入口打印。
  return Object.assign(new Error(code), { code });
}

function validNumber(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function readLimits(input = {}) {
  const limits = { ...DEFAULT_RECEIPT_LIMITS, ...input };
  const minimums = { maxRecords: 2, maxBytes: 4096, maxQueuedRecords: 1, maxQueuedBytes: 1024 };
  for (const [key, minimum] of Object.entries(minimums)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < minimum
        || limits[key] > DEFAULT_RECEIPT_LIMITS[key]) {
      throw receiptError("ai_receipt_invalid_limits");
    }
  }
  return Object.freeze(limits);
}

class AiLifecycleReceipts {
  constructor({ store, handle, limits, onWarning }) {
    this.store = store;
    this.handle = handle;
    this.limits = limits;
    this.onWarning = onWarning;
    this.key = crypto.randomBytes(32);
    this.runRef = crypto.randomBytes(16).toString("hex");
    this.afterSequence = store.sequence;
    this.throughSequence = store.sequence;
    this.startedAt = store.now();
    if (!validNumber(this.afterSequence) || !validNumber(this.startedAt)) {
      throw receiptError("ai_receipt_invalid_source");
    }
    this.endedAt = null;
    this.firstEventAt = null;
    this.lastEventAt = null;
    this.observed = 0;
    this.ignored = 0;
    this.accepted = 0;
    this.written = 0;
    this.dropped = 0;
    this.bytesAccepted = 0;
    this.bytesWritten = 0;
    this.recordsWritten = 0;
    this.pendingRecords = 0;
    this.pendingBytes = 0;
    this.queue = [];
    this.pump = null;
    this.unsubscribe = null;
    this.stopped = false;
    this.closed = false;
    this.failed = false;
    this.ioFailed = false;
    this.captureComplete = null;
    this.writeAcknowledged = null;
    this.closeSucceeded = null;
    this.reason = "normal_close";
    this.closePromise = null;
  }

  ref(domain, value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
      throw receiptError("ai_receipt_invalid_event");
    }
    // 每次运行的新密钥，不落盘、不保留自由 ID 的反向表，不能跨运行关联或字典反查。
    return crypto.createHmac("sha256", this.key).update(domain).update("\0").update(value).digest("hex");
  }

  project(event) {
    const p = event.payload;
    if (p === null || typeof p !== "object" || Array.isArray(p)) {
      throw receiptError("ai_receipt_invalid_event");
    }
    const integer = (value) => {
      if (value === undefined || value === null) return null;
      if (!validNumber(value)) throw receiptError("ai_receipt_invalid_event");
      return value;
    };
    const street = (value) => {
      if (value === undefined || value === null) return null;
      if (!STREETS.includes(value)) throw receiptError("ai_receipt_invalid_event");
      return value;
    };
    const decision = event.type === "AI_PUBLIC_SPEECH" ? "public_speech"
      : event.type === "SEAT_AI_SILENT" ? "silent"
        : event.type === "SEAT_AI_OUTPUT_DISCARDED" ? p.decision : null;
    if (decision !== null && !["silent", "public_speech"].includes(decision)) {
      throw receiptError("ai_receipt_invalid_event");
    }
    const reason = event.type === "SEAT_AI_OUTPUT_DISCARDED" ? p.reason : null;
    if (reason !== null && !DISCARD_REASONS.includes(reason)) {
      throw receiptError("ai_receipt_invalid_event");
    }
    let late = null;
    if (event.type === "AI_PUBLIC_SPEECH") {
      if (p.late_annotation !== null && p.late_annotation !== "延迟 · 基于前一街") {
        throw receiptError("ai_receipt_invalid_event");
      }
      late = p.late_annotation !== null;
    }
    const eventRef = this.ref("event", event.event_id);
    if (eventRef === null) throw receiptError("ai_receipt_invalid_event");
    // 必须逐字段构造；即使权威以后加字段，也不能顺手复制整个 payload。
    return {
      schema: RECEIPT_SCHEMA, kind: "event", run_ref: this.runRef,
      sequence: event.sequence, at: event.at, type: event.type, event_ref: eventRef,
      seat_ref: this.ref("seat", p.seat_id), turn_ref: this.ref("turn", p.turn_id),
      source_event_ref: this.ref("event", p.source_event_id),
      hand_index: integer(p.hand_index), street: street(p.street),
      started_hand_index: integer(p.started_hand_index), current_hand_index: integer(p.current_hand_index),
      based_on_street: street(p.based_on_street), decision, reason, late,
    };
  }

  stopCapture() {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.endedAt = this.store.now();
      if (!validNumber(this.endedAt) || this.endedAt < (this.lastEventAt ?? this.startedAt)) {
        this.endedAt = null;
        this.failed = true;
        if (this.reason === "normal_close") this.reason = "invalid_event";
      }
    } catch {
      this.endedAt = null;
      this.failed = true;
      if (this.reason === "normal_close") this.reason = "invalid_event";
    }
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = null;
    try { unsubscribe?.(); } catch {
      this.failed = true;
      this.reason = "subscription_failed";
    }
  }

  fail(reason) {
    const first = !this.failed;
    this.failed = true;
    if (first) this.reason = reason;
    this.stopCapture();
    if (first) {
      try { this.onWarning?.(`ai_receipt_${this.reason}`); } catch {
        // 诊断接收者也不是权威，失败不能逃逸进牌局。
      }
    }
  }

  observe(event) {
    if (this.stopped) return;
    this.observed += 1;
    try {
      if (!validNumber(event?.sequence) || event.sequence !== this.throughSequence + 1) {
        this.dropped += 1;
        this.fail("source_sequence_invalid");
        return;
      }
      this.throughSequence = event.sequence;
      if (!validNumber(event.at) || event.at < (this.lastEventAt ?? this.startedAt)) {
        throw receiptError("ai_receipt_invalid_event");
      }
      this.firstEventAt ??= event.at;
      this.lastEventAt = event.at;
      if (!RECEIPT_EVENT_TYPES.includes(event.type)) {
        this.ignored += 1;
        return;
      }
      const line = Buffer.from(`${JSON.stringify(this.project(event))}\n`);
      let overflow = null;
      if (this.accepted + 2 >= this.limits.maxRecords) overflow = "record_limit";
      else if (this.bytesAccepted + line.length + FOOTER_RESERVE_BYTES > this.limits.maxBytes) overflow = "byte_limit";
      else if (this.pendingRecords + 1 > this.limits.maxQueuedRecords
          || this.pendingBytes + line.length > this.limits.maxQueuedBytes) overflow = "queue_limit";
      if (overflow !== null) {
        this.dropped += 1;
        this.fail(overflow);
        return;
      }
      this.accepted += 1;
      this.enqueue(line, true);
    } catch {
      this.dropped += 1;
      this.fail("invalid_event");
    }
  }

  enqueue(line, isEvent) {
    this.bytesAccepted += line.length;
    this.pendingRecords += 1;
    this.pendingBytes += line.length;
    this.queue.push({ line, isEvent });
    this.ensurePump();
  }

  ensurePump() {
    if (this.pump !== null || this.queue.length === 0) return;
    this.pump = this.drain().finally(() => {
      this.pump = null;
      if (this.queue.length > 0) this.ensurePump();
    });
  }

  async writeLine(line) {
    let offset = 0;
    while (offset < line.length) {
      const { bytesWritten } = await this.handle.write(line, offset, line.length - offset, null);
      if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > line.length - offset) {
        throw receiptError("ai_receipt_write_failed");
      }
      offset += bytesWritten;
      this.bytesWritten += bytesWritten;
    }
    this.recordsWritten += 1;
  }

  async drain() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        await this.writeLine(item.line);
        if (item.isEvent) this.written += 1;
      } catch {
        this.ioFailed = true;
        this.dropped += (item.isEvent ? 1 : 0) + this.queue.filter((entry) => entry.isEvent).length;
        this.queue = [];
        this.pendingRecords = 0;
        this.pendingBytes = 0;
        this.fail("write_failed");
        return;
      }
      this.pendingRecords -= 1;
      this.pendingBytes -= item.line.length;
    }
  }

  async flush() {
    while (this.pump !== null) await this.pump;
    return this.status();
  }

  status() {
    return {
      enabled: true, run_ref: this.runRef, closed: this.closed,
      // 数据范围、写入 ACK 和句柄关闭是三个不同事实。文件不能自证最后一次 close 的结果。
      capture_complete: this.captureComplete, write_acknowledged: this.writeAcknowledged,
      close_succeeded: this.closeSucceeded,
      run_complete: this.closed && this.captureComplete === true
        && this.writeAcknowledged === true && this.closeSucceeded === true,
      stop_reason: this.reason, capture_after_sequence: this.afterSequence,
      capture_through_sequence: this.throughSequence,
      observed_events: this.observed, ignored_events: this.ignored,
      accepted_events: this.accepted, written_events: this.written, dropped_events: this.dropped,
      pending_records: this.pendingRecords, pending_bytes: this.pendingBytes,
      records_written: this.recordsWritten, bytes_written: this.bytesWritten,
    };
  }

  close({ reason = "normal_close" } = {}) {
    if (this.closePromise !== null) return this.closePromise;
    if (reason !== "normal_close") {
      this.fail(STOP_REASONS.includes(reason) ? reason : "abnormal_close");
    }
    this.stopCapture();
    this.closePromise = this.finish();
    return this.closePromise;
  }

  async finish() {
    await this.flush();
    this.captureComplete = false;
    this.writeAcknowledged = false;
    if (!this.ioFailed) {
      const completeAtFooter = !this.failed;
      const footer = Buffer.from(`${JSON.stringify({
        schema: RECEIPT_SCHEMA, kind: "footer", run_ref: this.runRef,
        capture_through_sequence: this.throughSequence, capture_ended_at: this.endedAt,
        first_event_at: this.firstEventAt, last_event_at: this.lastEventAt,
        capture_complete: completeAtFooter, stop_reason: this.reason,
        counts: {
          observed_events: this.observed, ignored_events: this.ignored, accepted_events: this.accepted,
          written_events: this.written, dropped_events: this.dropped,
          records_before_footer: this.recordsWritten, bytes_before_footer: this.bytesWritten,
        },
      })}\n`);
      try {
        if (footer.length > FOOTER_RESERVE_BYTES || this.bytesWritten + footer.length > this.limits.maxBytes) {
          throw receiptError("ai_receipt_write_failed");
        }
        await this.writeLine(footer);
        this.captureComplete = completeAtFooter;
        this.writeAcknowledged = true;
      } catch {
        // 一次 write 可以已经落下整行再报错；无 ACK 不能断言文件不存在，也不能反推成功。
        this.captureComplete = null;
        this.ioFailed = true;
        this.fail("write_failed");
      }
    }
    try { await this.handle.close(); this.closeSucceeded = true; } catch {
      this.closeSucceeded = false;
      this.fail("close_failed");
    }
    this.key.fill(0);
    this.closed = true;
    return this.status();
  }
}

async function createAiLifecycleReceipts({ store, filePath, limits, onWarning } = {}, io = {}) {
  // 默认关闭时甚至不读取 store，也不打开文件、订阅事件或增加定时器。
  if (filePath === undefined || filePath === "") return null;
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw receiptError("ai_receipt_invalid_file");
  }
  if (typeof store?.onEvent !== "function" || typeof store?.now !== "function") {
    throw receiptError("ai_receipt_invalid_source");
  }
  const configuredLimits = readLimits(limits);
  let handle;
  try { handle = await (io.openFile ?? fs.open)(filePath, "wx", 0o600); } catch (error) {
    throw receiptError(error?.code === "EEXIST" ? "ai_receipt_file_exists" : "ai_receipt_open_failed");
  }
  let receipts;
  try {
    receipts = new AiLifecycleReceipts({ store, handle, limits: configuredLimits, onWarning });
    const header = Buffer.from(`${JSON.stringify({
      schema: RECEIPT_SCHEMA, kind: "header", run_ref: receipts.runRef,
      source: "SeatAiStore.onEvent", id_encoding: "run_hmac_sha256",
      capture_after_sequence: receipts.afterSequence, capture_started_at: receipts.startedAt,
      limits: {
        max_records: configuredLimits.maxRecords, max_bytes: configuredLimits.maxBytes,
        max_queued_records: configuredLimits.maxQueuedRecords, max_queued_bytes: configuredLimits.maxQueuedBytes,
      },
    })}\n`);
    receipts.enqueue(header, false);
    // 基线、排头记录与订阅之间没有 await；文件写入期间的事件也进入同一个有界队列。
    receipts.unsubscribe = store.onEvent((event) => receipts.observe(event));
    if (typeof receipts.unsubscribe !== "function") throw receiptError("ai_receipt_subscription_failed");
    await receipts.flush();
    if (receipts.ioFailed) throw receiptError("ai_receipt_write_failed");
    return receipts;
  } catch (error) {
    if (receipts !== undefined) await receipts.close({ reason: "startup_failed" });
    else { try { await handle.close(); } catch { /* 首记录前失败，没有完整尾记录。 */ } }
    throw receiptError(error?.code === "ai_receipt_write_failed"
      ? "ai_receipt_write_failed" : "ai_receipt_startup_failed");
  }
}

module.exports = {
  createAiLifecycleReceipts, RECEIPT_SCHEMA, RECEIPT_EVENT_TYPES,
  STREETS, DISCARD_REASONS, STOP_REASONS, DEFAULT_RECEIPT_LIMITS,
};
