"use strict";

// B10 test-support only. Importing or running without live === true has no I/O.
// This is one bounded notification attempt, not a scheduler or a model runtime.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { MODEL_CONNECTION_SCHEMA } = require("../src/shared/endpoints.cjs");
const {
  UUID, ProbeFailure, fail, absolute, intentId, buildQueueCommand, ownChild, sendQueue, cleanup,
} = require("../src/host/codex-queue-transport.cjs");

const LIMITS = Object.freeze({
  maxWaitMs: 120_000,
  ioTimeoutMs: 5_000,
  queueTimeoutMs: 10_000,
  pollIntervalMs: 250,
  cleanupTimeoutMs: 2_000,
  maxOutputBytes: 1024 * 1024,
  maxTimelineEvents: 4096,
});
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MCP_SERVER = path.resolve(__dirname, "../plugins/tokengame/mcp/server.cjs");
const KNOWN_REJECTIONS = new Set([
  "model_command_token_rejected", "model_binding_changed", "model_connection_invalid",
  "model_connection_unavailable", "model_command_route_disabled", "table_unavailable",
  "seat_credential_revoked", "seat_ai_off", "unknown_authority_id",
]);
const CAVEATS = Object.freeze([
  "queue_acceptance_is_not_native_turn_evidence",
  "public_recheck_does_not_verify_ai_on_or_make_claim_to_start_atomic",
  "native_ai_start_must_recheck_binding_hand_off_and_claim_lease",
]);

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function configuration(options) {
  const allowed = new Set([
    "live", "nodeExecutable", "codexExecutable", "cwd", "connectionFile", "threadId",
    "triggerSeatId", "probeId", "signal", ...Object.keys(LIMITS),
  ]);
  if (Object.keys(options).some((key) => !allowed.has(key))) fail("invalid_configuration");
  for (const key of ["nodeExecutable", "codexExecutable", "cwd", "connectionFile"]) {
    if (!absolute(options[key])) fail("invalid_configuration");
  }
  if (typeof options.threadId !== "string" || !UUID.test(options.threadId)
    || typeof options.probeId !== "string" || !UUID.test(options.probeId)
    || typeof options.triggerSeatId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(options.triggerSeatId)) {
    fail("invalid_configuration");
  }
  if (options.signal !== undefined && (!(options.signal instanceof AbortSignal))) fail("invalid_configuration");
  const limits = {};
  for (const [key, upper] of Object.entries(LIMITS)) {
    const value = options[key] ?? upper;
    if (!Number.isSafeInteger(value) || value < 1 || value > upper) fail("invalid_configuration");
    limits[key] = value;
  }
  return Object.freeze({ ...options, ...limits });
}

// Pin this private authorization once. The normal MCP server rereads its connection
// file for every call; changing that file mid-probe must not silently switch seats.
// No file is copied or rewritten, and its content/path never enters a result/notice.
function pinnedConnection(file) {
  let fd;
  let value;
  try {
    fd = fs.openSync(file, "r");
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 16 * 1024) fail("model_connection_invalid");
    const buffer = Buffer.alloc(16 * 1024 + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size > 16 * 1024) fail("model_connection_invalid");
    value = JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("model_connection_unavailable");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  if (!record(value) || value.schema !== MODEL_CONNECTION_SCHEMA
    || Object.keys(value).some((key) => !["schema", "table_origin", "model_token"].includes(key))
    || typeof value.model_token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(value.model_token)) {
    fail("model_connection_invalid");
  }
  let url;
  try { url = new URL(value.table_origin); } catch { fail("model_connection_invalid"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("model_connection_invalid");
  return { origin: url.origin, token: value.model_token };
}

function abortableWait(ms, { signal }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new ProbeFailure("cancelled")); return; }
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    };
    const aborted = () => finish(new ProbeFailure("cancelled"));
    signal.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(() => finish(), ms);
  });
}

class Boundary {
  constructor(config, now) {
    this.config = config;
    this.now = now;
    this.started = now();
    if (!Number.isFinite(this.started)) fail("invalid_clock");
    this.last = this.started;
    this.deadline = this.started + config.maxWaitMs;
  }
  check() {
    if (this.config.signal?.aborted) fail("cancelled");
    const at = this.now();
    if (!Number.isFinite(at) || at < this.last) fail("invalid_clock");
    this.last = at;
    if (at >= this.deadline) fail("deadline_reached");
    return this.deadline - at;
  }
  async run(stage, upper, operation) {
    const remaining = this.check();
    const controller = new AbortController();
    let timer;
    let rejectStop;
    const stopped = new Promise((_, reject) => { rejectStop = reject; });
    const stop = (code) => {
      rejectStop(new ProbeFailure(code));
      controller.abort();
    };
    const aborted = () => stop("cancelled");
    this.config.signal?.addEventListener("abort", aborted, { once: true });
    // Referenced while work is pending; every path clears it in finally. An
    // unref'ed deadline alone would let a stalled injected transport exit early.
    timer = setTimeout(() => stop(remaining <= upper ? "deadline_reached" : `${stage}_timeout`), Math.min(remaining, upper));
    try {
      const result = await Promise.race([
        stopped,
        Promise.resolve().then(() => {
          this.check();
          if (controller.signal.aborted) fail("cancelled");
          return operation({ signal: controller.signal, timeoutMs: Math.min(remaining, upper) });
        }),
      ]);
      this.check(); // Cancellation/deadline while awaiting must not permit a send.
      return result;
    } finally {
      clearTimeout(timer);
      this.config.signal?.removeEventListener("abort", aborted);
      controller.abort();
    }
  }
}

function createSeatMcp(config, children, spawnImpl, check) {
  const connection = pinnedConnection(config.connectionFile);
  check();
  const owned = ownChild(config.nodeExecutable, [MCP_SERVER, "--stdio"], {
    cwd: config.cwd,
    env: {
      ...process.env,
      TOKENGAME_MODEL_CONNECTION_FILE: "",
      TOKENGAME_MODEL_TOKEN: connection.token,
      TOKENGAME_TABLE_ORIGIN: connection.origin,
      TOKENGAME_COMMAND_ORIGIN: "",
      TOKENGAME_AUTHORITY_TOKEN: "",
      TOKENGAME_CORE_TIMEOUT_MS: String(config.ioTimeoutMs),
    },
  }, children, spawnImpl);
  const child = owned.child;
  let buffer = Buffer.alloc(0);
  let bytes = 0;
  let id = 0;
  let pending = null;
  let failure = null;
  const failed = (code) => {
    failure ??= new ProbeFailure(code);
    pending?.reject(failure);
    pending = null;
  };
  child.on("error", () => failed("mcp_child_error"));
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on("error", () => failed("mcp_io_error"));
  owned.ended.then(() => failed("mcp_closed"));
  const count = (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > config.maxOutputBytes) { failed("mcp_output_limit"); return false; }
    return true;
  };
  child.stderr.on("data", (chunk) => { count(chunk); }); // Count, never log/store.
  child.stdout.on("data", (chunk) => {
    if (!count(chunk) || failure !== null) return;
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    let end;
    while ((end = buffer.indexOf(10)) !== -1) {
      const line = buffer.subarray(0, end).toString("utf8");
      buffer = buffer.subarray(end + 1);
      let reply;
      try { reply = JSON.parse(line); } catch { failed("mcp_protocol_invalid"); return; }
      if (!record(reply) || reply.jsonrpc !== "2.0" || pending === null || reply.id !== pending.id) {
        failed("mcp_protocol_invalid"); return;
      }
      if (reply.error !== undefined || !record(reply.result)) { failed("mcp_protocol_error"); return; }
      const waiter = pending;
      pending = null;
      waiter.resolve(reply.result);
    }
  });
  const assertHealthy = () => {
    if (failure !== null) throw failure;
    if (owned.isClosed()) fail("mcp_closed");
  };
  const request = async (method, params, { signal }) => {
    const result = await new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new ProbeFailure("cancelled")); return; }
      if (failure !== null || owned.isClosed()) { reject(failure ?? new ProbeFailure("mcp_closed")); return; }
      if (pending !== null) { reject(new ProbeFailure("mcp_concurrent_request")); return; }
      const aborted = () => { failed("cancelled"); };
      const finish = (callback, value) => { signal.removeEventListener("abort", aborted); callback(value); };
      pending = { id: ++id, resolve: (value) => finish(resolve, value), reject: (error) => finish(reject, error) };
      signal.addEventListener("abort", aborted, { once: true });
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
          if (error) failed("mcp_io_error");
        });
      } catch { failed("mcp_io_error"); }
    });
    // A valid reply can be followed by a malformed line, I/O error or close
    // before this await resumes. Resolving that reply cannot erase the failure.
    assertHealthy();
    return result;
  };
  return {
    assertHealthy,
    async initialize(context) {
      const initialized = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "tokengame-b10-test-probe", version: "1" } }, context);
      if (initialized.protocolVersion !== "2025-06-18" || !record(initialized.capabilities?.tools)) fail("mcp_protocol_invalid");
      if (context.signal.aborted) fail("cancelled");
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      const listed = await request("tools/list", {}, context);
      if (!Array.isArray(listed.tools) || listed.tools.filter((tool) => tool?.name === "tokengame_table").length !== 1) fail("mcp_tool_missing");
    },
    async table(command, context) {
      if (!["view.timeline", "ai.take_intents"].includes(command)) fail("probe_command_forbidden");
      const result = await request("tools/call", { name: "tokengame_table", arguments: { command, params: {} } }, context);
      if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== "text"
        || typeof result.content[0].text !== "string" || typeof result.isError !== "boolean") fail("mcp_protocol_invalid");
      let body;
      try { body = JSON.parse(result.content[0].text); } catch { fail("mcp_protocol_invalid"); }
      if (result.isError) fail(KNOWN_REJECTIONS.has(body?.code) ? body.code : "mcp_command_rejected");
      return body;
    },
    close: () => owned.close(config.cleanupTimeoutMs),
  };
}

function tableResult(body) {
  if (!record(body) || body.ok !== true || !record(body.result)) {
    fail(KNOWN_REJECTIONS.has(body?.code) ? body.code : "mcp_result_invalid");
  }
  return body.result;
}

// Strip text immediately; observation records contain only immutable public IDs
// and source metadata. No snapshot, opponent text or private context is returned.
function timeline(body, config) {
  const events = tableResult(body).timeline;
  if (!Array.isArray(events) || events.length > config.maxTimelineEvents) fail("timeline_invalid");
  const ids = new Set();
  const sequences = new Set();
  return events.map((event) => {
    if (!record(event) || typeof event.event_id !== "string" || !ID.test(event.event_id) || !Number.isSafeInteger(event.sequence) || event.sequence < 1
      || !Number.isFinite(event.at) || event.at < 0 || !record(event.payload)
      || !["PLAYER_PUBLIC_SPEECH", "AI_PUBLIC_SPEECH"].includes(event.type)
      || typeof event.payload.seat_id !== "string" || !ID.test(event.payload.seat_id) || event.payload.scope !== "TABLE_PUBLIC"
      || event.payload.speaker_type !== (event.type === "PLAYER_PUBLIC_SPEECH" ? "PLAYER" : "SEAT_AI")
      || !Number.isSafeInteger(event.payload.hand_index) || event.payload.hand_index < 0
      || typeof event.payload.street !== "string" || event.payload.street.length > 32
      || ids.has(event.event_id) || sequences.has(event.sequence)) fail("timeline_invalid");
    ids.add(event.event_id);
    sequences.add(event.sequence);
    return {
      event_id: event.event_id, sequence: event.sequence, type: event.type, at: event.at,
      seat_id: event.payload.seat_id, hand_index: event.payload.hand_index, street: event.payload.street,
    };
  });
}

function claimedIntent(body, source, config) {
  const result = tableResult(body);
  // The real model surface deliberately removes seat_id and claim_token. Its
  // authenticated binding + seats_polled=1 proves scope; never guess a seat.
  if (result.seats_polled !== 1 || result.failures !== undefined) fail("claim_scope_invalid");
  if (!Array.isArray(result.intents)) fail("claim_invalid");
  if (result.intents.length === 0) fail("no_eligible_intent");
  if (result.intents.length !== 1) fail("claim_count_invalid");
  const item = result.intents[0];
  if (!record(item) || item.accepted !== true || !intentId(item.intent_id)
    || Object.keys(item).some((key) => !["intent_id", "accepted", "context"].includes(key))
    || !record(item.context) || !record(item.context.payload)) fail("claim_invalid");
  const context = item.context;
  if (context.source_event_id !== source.event_id || context.source_event_type !== "PLAYER_PUBLIC_SPEECH"
    || context.payload.seat_id !== config.triggerSeatId || context.payload.speaker_type !== "PLAYER"
    || context.payload.scope !== "TABLE_PUBLIC" || context.hand_index !== source.hand_index
    || context.street !== source.street) fail("claim_source_changed");
  return item.intent_id;
}

async function execute(options, dependencies) {
  const result = {
    schema: "tokengame.codex-queue-wake-probe.v1", outcome: "disabled", reason: "explicit_live_opt_in_required",
    gate5_status: "not_run", queue_status: "not_attempted", native_wake_status: "not_attempted",
    queue_attempts: 0, claim_attempts: 0, timeline_reads: 0, baseline_established: false,
    cleanup_ok: true, cleanup_failures: 0, elapsed_ms: 0, elapsed_includes_cleanup: true,
    stage_spans: "not_observed",
    caveats: [...CAVEATS],
  };
  if (options?.live !== true) return result;
  let config;
  let boundary;
  let mcp;
  const children = new Set();
  try {
    config = configuration(options);
    result.probe_id = config.probeId;
    result.transport = dependencies.createMcp ? "injected_mcp" : "real_mcp_stdio";
    result.queue_transport = dependencies.queue ? "scripted_receiver" : "codex_queue_command";
    boundary = new Boundary(config, dependencies.now ?? (() => performance.now()));
    boundary.check();
    // Factories are synchronous: all owned resources must be registered before an
    // await can time out. Tests may inject a client, not a deferred child creator.
    mcp = dependencies.createMcp
      ? dependencies.createMcp(config)
      : createSeatMcp(config, children, dependencies.spawn ?? spawn, () => boundary.check());
    if (!record(mcp) || typeof mcp.initialize !== "function" || typeof mcp.table !== "function" || typeof mcp.close !== "function") fail("mcp_factory_invalid");
    await boundary.run("mcp", config.ioTimeoutMs, (context) => mcp.initialize(context));
    const readTimeline = async () => {
      const body = await boundary.run("mcp", config.ioTimeoutMs, (context) => {
        result.timeline_reads += 1;
        return mcp.table("view.timeline", context);
      });
      return timeline(body, config);
    };
    const first = await readTimeline();
    result.baseline_established = true;
    result.baseline_sequence = Math.max(0, ...first.map((event) => event.sequence));
    boundary.check();
    mcp.assertHealthy?.();
    // Synchronous, one-shot readiness notification. CLI writes this JSONL record
    // only after the authenticated baseline exists; process launch is not ready.
    dependencies.onReady?.(Object.freeze({
      schema: "tokengame.codex-queue-wake-probe.ready.v1",
      probe_id: config.probeId, baseline_sequence: result.baseline_sequence,
    }));
    boundary.check();
    let highWater = result.baseline_sequence;
    const seen = new Map(first.map((event) => [event.event_id, JSON.stringify(event)]));
    let source;
    while (!source) {
      await boundary.run("wait", config.ioTimeoutMs, (context) => (dependencies.wait ?? abortableWait)(Math.min(config.pollIntervalMs, boundary.check()), context));
      const events = await readTimeline();
      const fresh = [];
      for (const event of events) {
        const prior = seen.get(event.event_id);
        if (prior !== undefined && prior !== JSON.stringify(event)) fail("timeline_changed");
        if (prior === undefined && event.sequence > highWater) fresh.push(event);
        seen.set(event.event_id, JSON.stringify(event));
      }
      if (seen.size > config.maxTimelineEvents) fail("timeline_limit");
      highWater = Math.max(highWater, ...events.map((event) => event.sequence));
      source = fresh.filter((event) => event.type === "PLAYER_PUBLIC_SPEECH" && event.seat_id === config.triggerSeatId)
        .sort((left, right) => right.sequence - left.sequence)[0];
    }
    result.trigger_sequence = source.sequence;
    const claim = await boundary.run("mcp", config.ioTimeoutMs, (context) => {
      result.claim_attempts += 1;
      return mcp.table("ai.take_intents", context);
    });
    const id = claimedIntent(claim, source, config);
    // Recheck public source/auth once, without extending or reclaiming the lease.
    // This cannot observe AI OFF or guarantee no race after this read. Native
    // ai.start still owns hand/binding/claim/OFF fencing; no atomicity is claimed.
    const rechecked = await readTimeline();
    const same = rechecked.find((event) => event.event_id === source.event_id);
    if (!same || JSON.stringify(same) !== JSON.stringify(source)
      || rechecked.some((event) => event.type === "PLAYER_PUBLIC_SPEECH" && event.sequence > source.sequence)) fail("source_changed_after_claim");
    const plan = buildQueueCommand(config, id);
    const queued = await boundary.run("queue", config.queueTimeoutMs, (context) => {
      boundary.check();
      mcp.assertHealthy?.(); // Recheck failures observed after the final MCP await.
      result.queue_attempts = 1; // No path loops back to this line.
      result.queue_status = "unknown";
      result.native_wake_status = "native_woken_unknown";
      return dependencies.queue
        ? dependencies.queue(plan, context)
        : sendQueue(plan, context, config, children, dependencies.spawn ?? spawn);
    });
    if (!record(queued) || queued.exit_code !== 0 || queued.signal !== null) fail("queue_result_unknown");
    result.outcome = "queued";
    result.queue_status = "queued";
    result.reason = "queue_command_accepted_native_wake_unverified";
  } catch (error) {
    result.reason = error instanceof ProbeFailure ? error.code : "probe_failed";
    result.outcome = result.queue_attempts === 1 ? "native_woken_unknown"
      : ["cancelled", "deadline_reached"].includes(result.reason) ? "stopped" : "failed_closed";
  } finally {
    // Only resources created by this instance. Never touch other Codex processes,
    // old beta servers, user configuration, credentials or authoritative leases.
    if (mcp && typeof mcp.close === "function") {
      const ok = await cleanup(() => mcp.close(), (config?.cleanupTimeoutMs ?? LIMITS.cleanupTimeoutMs) + 50);
      if (!ok) result.cleanup_failures += 1;
    }
    for (const child of children) {
      const ok = await cleanup(() => child.close(config.cleanupTimeoutMs), config.cleanupTimeoutMs + 50);
      if (!ok) result.cleanup_failures += 1;
    }
    result.cleanup_ok = result.cleanup_failures === 0;
    if (!result.cleanup_ok) result.outcome = "cleanup_failed";
    if (boundary) {
      // Includes cleanup, not an event/claim/queue latency span. last alone is
      // insufficient when an awaited operation never updates the clock again.
      const finished = boundary.now();
      if (Number.isFinite(finished) && finished >= boundary.last) {
        result.elapsed_ms = Math.max(0, Math.round(finished - boundary.started));
      } else {
        result.elapsed_ms = null;
        result.reason = "invalid_clock";
        result.outcome = result.cleanup_ok ? "failed_closed" : "cleanup_failed";
      }
    }
    if (result.queue_attempts !== 0) {
      result.withdrawal_guaranteed = false;
      result.caveats.push("stopping_probe_cannot_retract_a_host_accepted_message_or_cancel_a_native_turn");
    }
  }
  return result;
}

function createCodexQueueWakeProbe(options = {}, dependencies = {}) {
  let running;
  return Object.freeze({ run() { running ??= execute(options, dependencies); return running; } });
}
function runCodexQueueWakeProbe(options = {}, dependencies = {}) {
  return createCodexQueueWakeProbe(options, dependencies).run();
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  if (!argv.includes("--live")) return runCodexQueueWakeProbe();
  const fields = {
    "--node-exe": "nodeExecutable", "--codex-exe": "codexExecutable", "--cwd": "cwd",
    "--connection-file": "connectionFile", "--thread": "threadId", "--trigger-seat": "triggerSeatId",
    "--probe-id": "probeId", "--wait-ms": "maxWaitMs", "--io-timeout-ms": "ioTimeoutMs",
    "--queue-timeout-ms": "queueTimeoutMs", "--poll-ms": "pollIntervalMs",
  };
  const options = { live: true };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (seen.has(flag) || (flag !== "--live" && fields[flag] === undefined)) {
      return runCodexQueueWakeProbe({ live: true, invalid: true }, dependencies);
    }
    seen.add(flag);
    if (flag === "--live") continue;
    const field = fields[flag];
    const value = argv[++index];
    options[field] = Object.hasOwn(LIMITS, field) ? Number(value) : value;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try { return await runCodexQueueWakeProbe({ ...options, signal: controller.signal }, dependencies); }
  finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}

if (require.main === module) {
  main(process.argv.slice(2), {
    onReady: (ready) => process.stdout.write(`${JSON.stringify(ready)}\n`),
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = ["disabled", "queued"].includes(result.outcome) && result.cleanup_ok ? 0 : 1;
  }, () => { process.stderr.write("b10_probe_failed\n"); process.exitCode = 1; });
}

module.exports = { LIMITS, buildQueueCommand, createCodexQueueWakeProbe, main, runCodexQueueWakeProbe };
