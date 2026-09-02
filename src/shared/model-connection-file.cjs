"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { MODEL_CONNECTION_SCHEMA } = require("./endpoints.cjs");

const MODEL_CONNECTION_MAX_BYTES = 16 * 1024;
const MODEL_CONNECTION_KEYS = Object.freeze(["schema", "table_origin", "model_token"]);

function connectionError(code) {
  return Object.assign(new Error(code), { code, modelConnectionError: true });
}

const LOOPBACK_HOSTNAMES = Object.freeze(["127.0.0.1", "localhost", "[::1]"]);

// 连接文件是授权配置，不是网络发现结果。HTTP 只允许回环；远程地址必须是 HTTPS。
// Host / Forwarded 等请求头不经过这里，调用方只能传真人显式配置或服务自己铸造的值。
function connectionOrigin(value) {
  if (typeof value !== "string" || value === "" || value.trim() !== value
    // 先检查原始形状，不能让 WHATWG URL 的点段/反斜杠/控制字符归一化掩盖非根地址。
    || !/^https?:\/\/[^/?#\\\s@]+\/?$/i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) {
    throw connectionError("model_connection_invalid");
  }
  let url;
  try { url = new URL(value); } catch { throw connectionError("model_connection_invalid"); }
  const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTNAMES.includes(url.hostname);
  if ((!loopbackHttp && url.protocol !== "https:")
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw connectionError("model_connection_invalid");
  }
  return url.origin;
}

// 兼容既有导入名；语义已扩展为「安全连接 origin」，新代码使用 connectionOrigin。
const localOrigin = connectionOrigin;

function parseModelConnection(raw, { explicitOrigin = "" } = {}) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MODEL_CONNECTION_MAX_BYTES) {
    throw connectionError("model_connection_invalid");
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw connectionError("model_connection_invalid"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.schema !== MODEL_CONNECTION_SCHEMA
    || Object.keys(value).length !== MODEL_CONNECTION_KEYS.length
    || Object.keys(value).some((key) => !MODEL_CONNECTION_KEYS.includes(key))
    || typeof value.model_token !== "string"
    || !/^[A-Za-z0-9_-]{32,256}$/.test(value.model_token)) {
    throw connectionError("model_connection_invalid");
  }
  const origin = connectionOrigin(value.table_origin);
  if (explicitOrigin && connectionOrigin(explicitOrigin) !== origin) {
    throw connectionError("model_connection_origin_conflict");
  }
  return {
    origin,
    token: value.model_token,
    serialized: `${JSON.stringify({
      schema: MODEL_CONNECTION_SCHEMA,
      table_origin: origin,
      model_token: value.model_token,
    }, null, 2)}\n`,
  };
}

function readModelConnectionFile(file, options = {}) {
  if (typeof file !== "string" || !path.isAbsolute(file)) {
    throw connectionError("model_connection_invalid");
  }
  let raw;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MODEL_CONNECTION_MAX_BYTES) {
      throw connectionError("model_connection_invalid");
    }
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.modelConnectionError) throw error;
    // 不附带系统错误、路径或内容；它们可能包含用户名或令牌。
    throw connectionError("model_connection_unavailable");
  }
  return parseModelConnection(raw, options);
}

module.exports = {
  MODEL_CONNECTION_KEYS,
  MODEL_CONNECTION_MAX_BYTES,
  connectionOrigin,
  connectionError,
  localOrigin,
  parseModelConnection,
  readModelConnectionFile,
};
