"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:43111";
const DEFAULT_PLUGIN_TOKEN = "local-probe-only-plugin-token";

async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

function emit(value) {
  process.stdout.write(JSON.stringify(value));
}

function parsePublicPrompt(prompt) {
  if (typeof prompt !== "string") return { matched: false, content: "" };
  const prefixes = ["$tokengame public", "@tokengame public", "[tokengame:public]"];
  const lower = prompt.toLowerCase();
  for (const prefix of prefixes) {
    if (lower === prefix) {
      return { matched: true, content: "" };
    }
    if (lower.startsWith(`${prefix} `) || lower.startsWith(`${prefix}\t`) || lower.startsWith(`${prefix}\n`) || lower.startsWith(`${prefix}\r\n`)) {
      return { matched: true, content: prompt.slice(prefix.length).trim() };
    }
  }
  return { matched: false, content: "" };
}

async function bridgeRequest(route, { method = "GET", body } = {}) {
  const bridgeUrl = process.env.TOKENGAME_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const pluginToken = process.env.TOKENGAME_PLUGIN_TOKEN || DEFAULT_PLUGIN_TOKEN;
  const response = await fetch(`${bridgeUrl}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tokengame-plugin-token": pluginToken,
    },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    signal: AbortSignal.timeout(Number(process.env.TOKENGAME_HOOK_TIMEOUT_MS || 3_000)),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: "invalid_bridge_response" };
  }
  return { ok: response.ok, status: response.status, body: payload };
}

function pluginDataRoot() {
  return process.env.PLUGIN_DATA || path.join(os.tmpdir(), "tokengame-local-probe-plugin-data");
}

function markerId(sessionId, turnId) {
  return crypto.createHash("sha256").update(`${sessionId}\u0000${turnId}`).digest("hex");
}

function pendingPath(sessionId, turnId) {
  return path.join(pluginDataRoot(), "pending", `${markerId(sessionId, turnId)}.json`);
}

async function writePending(marker) {
  const target = pendingPath(marker.session_id, marker.turn_id);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  return target;
}

async function readPending(sessionId, turnId) {
  try {
    const text = await fs.promises.readFile(pendingPath(sessionId, turnId), "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function archivePending(marker, terminal) {
  const source = pendingPath(marker.session_id, marker.turn_id);
  const directory = path.join(pluginDataRoot(), "terminal");
  await fs.promises.mkdir(directory, { recursive: true });
  const target = path.join(directory, `${markerId(marker.session_id, marker.turn_id)}-${Date.now()}.json`);
  await fs.promises.writeFile(
    target,
    `${JSON.stringify({ ...marker, terminal }, null, 2)}\n`,
    "utf8",
  );
  await fs.promises.unlink(source).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  return target;
}

async function pendingForSession(sessionId) {
  const directory = path.join(pluginDataRoot(), "pending");
  let files;
  try {
    files = await fs.promises.readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const pending = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const marker = JSON.parse(await fs.promises.readFile(path.join(directory, file), "utf8"));
      if (marker.session_id === sessionId) pending.push(marker);
    } catch {
      // A malformed marker cannot grant tool access; ignore it here and leave it for inspection.
    }
  }
  return pending;
}

module.exports = {
  archivePending,
  bridgeRequest,
  emit,
  parsePublicPrompt,
  pendingForSession,
  readHookInput,
  readPending,
  writePending,
};

