"use strict";

const http = require("node:http");
const { closeServer, listen, readJson, sendJson } = require("../shared/http.cjs");
const { DEFAULT_AUTHORITY_TOKEN } = require("../authority/server.cjs");

const DEFAULT_PLUGIN_TOKEN = "local-probe-only-plugin-token";

function createBridgeServer({
  authorityUrl = process.env.TOKENGAME_AUTHORITY_URL || "http://127.0.0.1:43110",
  authorityToken = process.env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN,
  pluginToken = process.env.TOKENGAME_PLUGIN_TOKEN || DEFAULT_PLUGIN_TOKEN,
  timeoutMs = 2_500,
} = {}) {
  const stats = {
    received: 0,
    forward_attempts: 0,
    upstream_failures: 0,
    by_route: {},
  };

  const routeMap = {
    "GET /v1/status": ["GET", "/api/state"],
    "POST /v1/prompts": ["POST", "/internal/ai-requests"],
    "POST /v1/answers": ["POST", "/internal/ai-answers"],
    "POST /v1/windows/open": ["POST", "/api/windows/open"],
    "POST /v1/windows/close": ["POST", "/api/windows/close"],
    "POST /v1/probe/reset": ["POST", "/api/probe/reset"],
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "tokengame-local-bridge" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/debug/stats") {
        sendJson(response, 200, stats);
        return;
      }

      const routeKey = `${request.method} ${url.pathname}`;
      const upstream = routeMap[routeKey];
      if (!upstream) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      if (request.headers["x-tokengame-plugin-token"] !== pluginToken) {
        sendJson(response, 403, { error: "plugin_token_rejected" });
        return;
      }

      stats.received += 1;
      stats.by_route[routeKey] = (stats.by_route[routeKey] || 0) + 1;
      const body = request.method === "POST" ? await readJson(request) : undefined;
      const [upstreamMethod, upstreamPath] = upstream;
      stats.forward_attempts += 1;

      let upstreamResponse;
      try {
        upstreamResponse = await fetch(`${authorityUrl}${upstreamPath}`, {
          method: upstreamMethod,
          headers: {
            "content-type": "application/json",
            "x-tokengame-authority-token": authorityToken,
          },
          body: upstreamMethod === "POST" ? JSON.stringify(body || {}) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        stats.upstream_failures += 1;
        sendJson(response, 503, {
          error: "authority_unreachable",
          detail: error.name,
        });
        return;
      }

      const text = await upstreamResponse.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { error: "invalid_authority_response" };
      }
      sendJson(response, upstreamResponse.status, payload);
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message || "internal_error" });
    }
  });

  return {
    server,
    stats,
    async start({ host = "127.0.0.1", port = 43111 } = {}) {
      const address = await listen(server, { host, port });
      return `http://${address.address}:${address.port}`;
    },
    stop: () => closeServer(server),
  };
}

if (require.main === module) {
  const port = Number(process.env.TOKENGAME_BRIDGE_PORT || 43111);
  const service = createBridgeServer();
  service
    .start({ port })
    .then((origin) => console.log(`TokenGame local bridge: ${origin}`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { createBridgeServer, DEFAULT_PLUGIN_TOKEN };

