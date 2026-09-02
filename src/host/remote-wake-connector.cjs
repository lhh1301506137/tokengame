"use strict";

// 玩家本机的出站连接器。只读本人活动连接文件，只调用远端 poll/ack，通知正文由已固定
// 目标任务的本机 sender 构造。这里不读取牌局投影，不领取/启动/结算模型回合，也不下注。
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { CONTRACT_VERSION } = require("../shared/contract-version.cjs");
const { connectionOrigin, readModelConnectionFile } = require("../shared/model-connection-file.cjs");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const intentId = (value) => typeof value === "string" && value.startsWith("intent-") && UUID.test(value.slice(7));

const CONNECTOR_LIMITS = Object.freeze({
  maxDurationMs: 3_600_000,
  maxNotifications: 128,
  pollMs: 25_000,
  retryMs: 1_000,
  maxNetworkRetries: 5,
  responseBytes: 16 * 1024,
});
const TOKEN_HEADER = "x-tokengame-model-token";
const STOP_CODES = new Set([
  "model_command_token_rejected", "model_binding_required", "model_binding_changed", "model_scope_rejected",
  "model_command_route_disabled", "wake_connector_disabled", "wake_disabled", "wake_connector_in_use",
  "wake_connector_changed", "wake_notification_unknown", "wake_ack_conflict", "wake_connector_capacity",
  "contract_version_missing", "contract_version_mismatch", "invalid_field",
]);

class ConnectorError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}

// 远端只需稳定相等性来拒绝把同一模型上下文借给另一席，不需要宿主原生任务 ID。
// 固定命名空间 + 规范化 UUID 派生 UUIDv8 别名；进程重启/大小写变化仍得到同一别名。
// 输入有 UUID 的随机熵；本函数不是登录凭据或对宿主身份的密码学证明。
function deriveWakeTargetId(threadId) {
  if (typeof threadId !== "string" || !UUID.test(threadId)) {
    throw new ConnectorError("wake_connector_configuration_invalid");
  }
  const bytes = createHash("sha256").update("tokengame.remote-wake-target.v1\0").update(threadId.toLowerCase()).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function positive(value, fallback) {
  const selected = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > fallback) {
    throw new ConnectorError("wake_connector_configuration_invalid");
  }
  return selected;
}

function receipt(value) {
  if (!object(value) || typeof value.queued !== "boolean" || typeof value.attempted !== "boolean"
    || typeof value.cleanup_ok !== "boolean" || (value.queued && !value.attempted)
    || !(value.reason === null || (typeof value.reason === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value.reason)))) {
    throw new ConnectorError("wake_connector_queue_unknown");
  }
  return { queued: value.queued, attempted: value.attempted, cleanup_ok: value.cleanup_ok, reason: value.reason };
}

async function readJson(response, limit) {
  let bytes = 0;
  const chunks = [];
  if (response.body === null) throw new ConnectorError("wake_connector_protocol_invalid");
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new ConnectorError("wake_connector_protocol_invalid");
      }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
    throw new ConnectorError("wake_connector_protocol_invalid");
  }
}

function pollPayload(value) {
  if (!object(value) || value.ok !== true || value.connected !== true
    || !Number.isSafeInteger(value.lease_ms) || value.lease_ms < 1 || value.lease_ms > 60_000) {
    throw new ConnectorError("wake_connector_protocol_invalid");
  }
  if (value.notification === null) return null;
  const item = value.notification;
  if (!object(item) || Object.keys(item).length !== 2
    || typeof item.notification_id !== "string" || !UUID.test(item.notification_id)
    || !intentId(item.intent_id)) throw new ConnectorError("wake_connector_protocol_invalid");
  return { notificationId: item.notification_id.toLowerCase(), intentId: item.intent_id };
}

class RemoteWakeConnector {
  constructor(options = {}, dependencies = {}) {
    if (!object(options) || typeof options.connectionFile !== "string" || !path.isAbsolute(options.connectionFile)
      || /[\0\r\n]/.test(options.connectionFile)
      || typeof options.threadId !== "string" || !UUID.test(options.threadId)) {
      throw new ConnectorError("wake_connector_configuration_invalid");
    }
    this.#config = {
      connectionFile: options.connectionFile,
      threadId: options.threadId.toLowerCase(),
      targetId: deriveWakeTargetId(options.threadId),
      connectorId: options.connectorId ?? randomUUID(),
      ...Object.fromEntries(Object.entries(CONNECTOR_LIMITS).map(([key, value]) => [key, positive(options[key], value)])),
    };
    if (typeof this.#config.connectorId !== "string" || !UUID.test(this.#config.connectorId)) {
      throw new ConnectorError("wake_connector_configuration_invalid");
    }
    this.#config.connectorId = this.#config.connectorId.toLowerCase();
    this.#readConnection = dependencies.readConnection ?? readModelConnectionFile;
    this.#fetch = dependencies.fetchImpl ?? fetch;
    this.#sleep = dependencies.sleep ?? ((ms, signal) => delay(ms, undefined, { signal }));
    this.#onEvent = dependencies.onEvent ?? (() => {});
    this.#queue = dependencies.wakeQueue;
    if ([this.#readConnection, this.#fetch, this.#sleep, this.#onEvent, this.#queue].some((entry) => typeof entry !== "function")) {
      throw new ConnectorError("wake_connector_configuration_invalid");
    }
  }

  #config;
  #readConnection;
  #fetch;
  #sleep;
  #onEvent;
  #queue;
  #initial = null;
  #started = false;
  #counts = { notifications_received: 0, queue_attempted: 0, queue_accepted: 0, acks_confirmed: 0, reconnects: 0 };
  #cleanupOk = true;

  #emit(type, reason = null) {
    try { this.#onEvent({ type, reason, ...this.#counts }); } catch { /* 诊断输出不是通知权威。 */ }
  }

  #connection() {
    let value;
    try { value = this.#readConnection(this.#config.connectionFile); } catch (error) {
      throw new ConnectorError(error?.modelConnectionError === true ? error.code : "model_connection_unavailable");
    }
    if (!object(value) || typeof value.token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(value.token)) {
      throw new ConnectorError("model_connection_invalid");
    }
    let origin;
    try { origin = connectionOrigin(value.origin); } catch { throw new ConnectorError("model_connection_invalid"); }
    const connection = { origin, token: value.token };
    if (this.#initial === null) this.#initial = connection;
    else if (this.#initial.origin !== origin || this.#initial.token !== value.token) {
      throw new ConnectorError("model_connection_changed");
    }
    return connection;
  }

  async #request(route, body, signal) {
    if (signal.aborted) throw new ConnectorError("cancelled");
    const connection = this.#connection();
    let response;
    try {
      response = await this.#fetch(`${connection.origin}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", [TOKEN_HEADER]: connection.token },
        body: JSON.stringify({ contract_version: CONTRACT_VERSION, ...body }),
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.#config.pollMs + 5_000)]),
      });
    } catch {
      if (signal.aborted) throw new ConnectorError("cancelled");
      throw new ConnectorError("wake_connector_network_unavailable", true);
    }
    if (response.status >= 300 && response.status < 400) throw new ConnectorError("wake_connector_protocol_invalid");
    let payload;
    try { payload = await readJson(response, this.#config.responseBytes); } catch (error) {
      if (signal.aborted) throw new ConnectorError("cancelled");
      // fetch 已有响应头不代表响应体读完。断流和读超时可重试同一次 poll/ACK；
      // 确定的坏 JSON/超限仍是协议失败，绝不重试本地 queue。
      if (response.status >= 500 || !(error instanceof ConnectorError)) {
        throw new ConnectorError("wake_connector_network_unavailable", true);
      }
      throw error;
    }
    if (!response.ok || !object(payload) || payload.ok !== true) {
      if (object(payload) && STOP_CODES.has(payload.code)) throw new ConnectorError(payload.code);
      if (response.status >= 500) throw new ConnectorError("wake_connector_network_unavailable", true);
      throw new ConnectorError("wake_connector_protocol_invalid");
    }
    return payload;
  }

  async #retryRequest(route, body, signal) {
    for (let retry = 0; ; retry += 1) {
      try { return await this.#request(route, body, signal); } catch (error) {
        if (!error.retryable || retry >= this.#config.maxNetworkRetries || signal.aborted) throw error;
        this.#counts.reconnects += 1;
        this.#emit("reconnecting", "wake_connector_network_unavailable");
        await this.#sleep(this.#config.retryMs * Math.min(retry + 1, 5), signal);
      }
    }
  }

  async run({ signal } = {}) {
    if (this.#started || (signal !== undefined && !(signal instanceof AbortSignal))) {
      throw new ConnectorError("wake_connector_configuration_invalid");
    }
    this.#started = true;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    let expired = false;
    const timer = setTimeout(() => { expired = true; controller.abort(); }, this.#config.maxDurationMs);
    const history = new Map();
    let reason = "cancelled";
    let first = true;
    try {
      this.#connection();
      while (!controller.signal.aborted) {
        const payload = await this.#retryRequest("/api/model/wake/connector/poll", {
          connector_id: this.#config.connectorId,
          target_id: this.#config.targetId,
          // 首次用极短 poll 建立注册并让 launcher 确认就绪；之后才进入有界长轮询。
          wait_ms: first ? 1 : this.#config.pollMs,
        }, controller.signal);
        const item = pollPayload(payload);
        if (controller.signal.aborted) break;
        this.#connection(); // 等待网络期间换发/清除活动文件，旧通知不能再进入原任务。
        if (first) { first = false; this.#emit("connected"); }
        if (controller.signal.aborted) break;
        if (item === null) continue;
        let entry = history.get(item.notificationId);
        if (entry !== undefined && entry.intentId !== item.intentId) {
          throw new ConnectorError("wake_connector_protocol_invalid");
        }
        if (entry === undefined) {
          this.#counts.notifications_received += 1;
          let localReceipt;
          try {
            localReceipt = receipt(await this.#queue({ threadId: this.#config.threadId,
              intentId: item.intentId, notificationId: item.notificationId, signal: controller.signal }));
          } catch {
            this.#cleanupOk = false;
            throw new ConnectorError("wake_connector_queue_unknown");
          }
          this.#counts.queue_attempted += localReceipt.attempted ? 1 : 0;
          this.#counts.queue_accepted += localReceipt.queued ? 1 : 0;
          this.#cleanupOk = this.#cleanupOk && localReceipt.cleanup_ok;
          entry = { intentId: item.intentId, receipt: localReceipt, acked: false };
          history.set(item.notificationId, entry);
          this.#emit("queue_receipt", localReceipt.reason);
        }
        if (controller.signal.aborted) break;
        const ack = await this.#retryRequest("/api/model/wake/connector/ack", {
          connector_id: this.#config.connectorId,
          notification_id: item.notificationId,
          receipt: entry.receipt,
        }, controller.signal);
        if (ack.acked !== true || typeof ack.replayed !== "boolean") throw new ConnectorError("wake_connector_protocol_invalid");
        if (!entry.acked) { entry.acked = true; this.#counts.acks_confirmed += 1; }
        this.#emit("acknowledged");
        if (!entry.receipt.cleanup_ok) { reason = "wake_connector_cleanup_failed"; break; }
        if (!entry.receipt.queued) { reason = "wake_connector_queue_failed"; break; }
        if (this.#counts.notifications_received >= this.#config.maxNotifications) { reason = "max_notifications"; break; }
      }
    } catch (error) {
      reason = controller.signal.aborted ? "cancelled"
        : error instanceof ConnectorError ? error.code : "wake_connector_failed";
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      controller.abort();
      if (expired) reason = "max_duration";
    }
    this.#emit("stopped", reason);
    return { status: "stopped", reason, ...this.#counts, cleanup_ok: this.#cleanupOk,
      accepted_notifications_retracted: false };
  }
}

module.exports = { RemoteWakeConnector, CONNECTOR_LIMITS, ConnectorError, deriveWakeTargetId };
