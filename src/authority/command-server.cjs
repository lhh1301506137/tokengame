"use strict";

// 宿主中立传输面：把 CommandSurface 暴露成一个进程外可达的端点。
//
// 存在的理由是 L0 根合同的那句话——「不同宿主的玩家最终可以进入同一场中立权威对局」，
// 且「不由任一玩家宿主掌握牌堆、对手底牌或结算权」。只要权威只能进程内调用，先落地的
// 那个适配器就必然把核心嵌进自己进程，于是房间身份与隐藏信息边界变成该宿主专属——
// 正是 L0 的 plausible_but_wrong 写的失败形态。有了这一层，两个适配器都只是客户端。
//
// 三条自我约束：
//   1. 不新增产品语义。这一层只做 HTTP <-> dispatch 的搬运与错误码映射。
//   2. 不发明桥接鉴权方案。U-TG-LOCAL-BRIDGE-AUTH 是 professional_design_unknown、
//      status: open、blocking_boundary: release，归 Codex 与专业设计裁定，不归我。
//      这里沿用 server.cjs 既有的 x-tokengame-authority-token 约定，不另造一套。
//   3. 不放宽 STATUS.md 的发布门禁。「本地桥接鉴权与隐私金丝雀通过后才允许连接真实远端
//      环境」——所以非回环地址在代码里直接拒绝，而不是写在文档里靠人记住。
//
// 席位授权仍然在 CommandSurface 里（requireSeatCredential）。这一层的令牌是外层传输门，
// 两者不可互相替代：传输令牌证明「这个进程可以说话」，席位凭据证明「你拥有这个席位」。

const http = require("node:http");

const { closeServer, listen, readJson, sendJson } = require("../shared/http.cjs");
const { ProbeError } = require("./event-store.cjs");
const { CommandSurface } = require("./command-surface.cjs");

// 与 server.cjs 同名同默认值。改名要两处一起改，否则适配器会对着两个头发请求。
const AUTHORITY_TOKEN_HEADER = "x-tokengame-authority-token";
const DEFAULT_AUTHORITY_TOKEN = "local-probe-only-authority-token";

const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "::1", "localhost"]);

// 与 readJson 的默认值一致。命令参数里最大的是 140 字素的发言，64 KiB 绰绰有余。
const MAX_BODY_BYTES = 64 * 1024;

function isLoopback(host) {
  return LOOPBACK_HOSTS.includes(host);
}

// 定长比较。令牌长度不同直接判否，避免把长度差异变成可测信道。
function sameToken(provided, expected) {
  if (typeof provided !== "string" || provided.length !== expected.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function createCommandServer(options = {}) {
  const internalToken = options.internalToken
    || process.env.TOKENGAME_AUTHORITY_TOKEN
    || DEFAULT_AUTHORITY_TOKEN;

  const surface = options.surface instanceof CommandSurface
    ? options.surface
    : new CommandSurface(options);

  const server = http.createServer((request, response) => {
    handle(request, response, surface, internalToken).catch((error) => {
      fail(response, error);
    });
  });

  return {
    surface,
    server,
    async start({ host = "127.0.0.1", port = 0 } = {}) {
      if (!isLoopback(host)) {
        // 这不是保守，是 STATUS.md 里那条门禁的机器化。要放开得先关掉那个 unknown。
        throw new ProbeError("local_bridge_auth_unresolved", 403, {
          requested_host: host,
          blocking_unknown: "U-TG-LOCAL-BRIDGE-AUTH",
          blocking_boundary: "release",
        });
      }
      const address = await listen(server, { host, port });
      return `http://${host === "::1" ? "[::1]" : host}:${address.port}`;
    },
    stop() {
      return closeServer(server);
    },
  };
}

async function handle(request, response, surface, internalToken) {
  const url = new URL(request.url, "http://127.0.0.1");

  // 刻意不设任何 Access-Control-Allow-Origin。server.cjs 为探针 UI 开了 CORS，
  // 但这一层能改牌局状态：放开跨源等于任何网页都能打本机权威。适配器是进程内客户端，
  // 不需要浏览器跨源许可。
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "tokengame-command-server",
      command_count: surface.commandNames().length,
    });
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/command") {
    sendJson(response, 404, { ok: false, code: "unknown_route" });
    return;
  }

  // 传输门在读 body 之前。未授权的调用者不该有机会让我们解析它的 JSON。
  if (!sameToken(request.headers[AUTHORITY_TOKEN_HEADER], internalToken)) {
    sendJson(response, 403, { ok: false, code: "authority_token_rejected" });
    return;
  }

  // 先看 content-length。readJson 超限时会 reject 并 destroy 套接字，客户端只能观察到
  // 「连接被对方关掉」——适配器拿不到可判定的错误码。这里提前回一个干净的 413，
  // readJson 自身的上限仍然是兜底（用来对付谎报 content-length 的请求）。
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    sendJson(response, 413, {
      ok: false,
      code: "request_body_too_large",
      details: { max_bytes: MAX_BODY_BYTES },
    });
    return;
  }

  const body = await readJson(request, MAX_BODY_BYTES);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    sendJson(response, 400, { ok: false, code: "invalid_field", details: { field: "body" } });
    return;
  }

  const result = surface.dispatch(body.command, body.params === undefined ? {} : body.params);
  sendJson(response, 200, { ok: true, result });
}

function fail(response, error) {
  if (error instanceof ProbeError) {
    sendJson(response, error.status || 400, {
      ok: false,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  // readJson 用的是普通 Error 带 status（invalid_json / request_body_too_large）。
  if (typeof error.status === "number") {
    sendJson(response, error.status, { ok: false, code: error.message });
    return;
  }
  // 兜底不回显 stack 或 message：请求体里可能带着凭据。
  sendJson(response, 500, { ok: false, code: "internal_error" });
}

module.exports = {
  createCommandServer,
  AUTHORITY_TOKEN_HEADER,
  DEFAULT_AUTHORITY_TOKEN,
};
