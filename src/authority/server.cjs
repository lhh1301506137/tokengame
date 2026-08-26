"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { EventStore, ProbeError } = require("./event-store.cjs");
const { TableStore } = require("./table-store.cjs");
const { closeServer, listen, readJson, sendJson } = require("../shared/http.cjs");

const DEFAULT_AUTHORITY_TOKEN = "local-probe-only-authority-token";

function createAuthorityServer({
  store = new EventStore(),
  tableStore = new TableStore(),
  internalToken = process.env.TOKENGAME_AUTHORITY_TOKEN || DEFAULT_AUTHORITY_TOKEN,
  webRoot = path.resolve(__dirname, "../../web"),
  bootstrap = false,
} = {}) {
  const sseClients = new Set();
  if (bootstrap) {
    store.reset({ auto_open: true, duration_ms: 120_000 });
  }

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,x-tokengame-authority-token",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  function tableState(url) {
    const state = tableStore.publicState({
      playerId: url.searchParams.get("player_id"),
      playerToken: url.searchParams.get("player_token"),
    });
    const aiState = store.publicState();
    return {
      ...state,
      ai_channel: {
        contract: aiState.contract,
        action_window: aiState.action_window,
        events: aiState.events.filter((event) => event.type.startsWith("AI_")),
      },
    };
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders);
        response.end();
        return;
      }

      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "tokengame-fake-authority" }, corsHeaders);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, store.publicState(), corsHeaders);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        const after = Number(url.searchParams.get("after") || 0);
        const events = store.publicState().events.filter((event) => event.seq > after);
        sendJson(response, 200, { events }, corsHeaders);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/events/stream") {
        response.writeHead(200, {
          ...corsHeaders,
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });
        response.write(`data: ${JSON.stringify({ type: "SNAPSHOT", state: store.publicState() })}\n\n`);
        const unsubscribe = store.onEvent((event) => {
          response.write(`id: ${event.seq}\ndata: ${JSON.stringify({ type: "EVENT", event })}\n\n`);
        });
        const keepAlive = setInterval(() => response.write(": keepalive\n\n"), 15_000);
        const client = { response, unsubscribe, keepAlive };
        sseClients.add(client);
        request.on("close", () => {
          clearInterval(keepAlive);
          unsubscribe();
          sseClients.delete(client);
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/table/state") {
        sendJson(response, 200, tableState(url), corsHeaders);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/table/events") {
        const after = Number(url.searchParams.get("after") || 0);
        const state = tableState(url);
        sendJson(response, 200, {
          events: state.events.filter((event) => event.seq > after),
          ai_events: state.ai_channel.events.filter((event) => event.seq > after),
        }, corsHeaders);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/table/events/stream") {
        const playerId = url.searchParams.get("player_id");
        const playerToken = url.searchParams.get("player_token");
        tableStore.resolveViewer(playerId, playerToken);
        response.writeHead(200, {
          ...corsHeaders,
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });
        response.write(`data: ${JSON.stringify({ type: "SNAPSHOT", state: tableState(url) })}\n\n`);
        const writeEvent = (channel) => (event) => {
          response.write(`data: ${JSON.stringify({ type: "EVENT", channel, event })}\n\n`);
        };
        const unsubscribeTable = tableStore.onEvent(writeEvent("table"));
        const unsubscribeAi = store.onEvent(writeEvent("ai"));
        const keepAlive = setInterval(() => response.write(": keepalive\n\n"), 15_000);
        const client = {
          response,
          unsubscribe() {
            unsubscribeTable();
            unsubscribeAi();
          },
          keepAlive,
        };
        sseClients.add(client);
        request.on("close", () => {
          clearInterval(keepAlive);
          client.unsubscribe();
          sseClients.delete(client);
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/probe/reset") {
        const body = await readJson(request);
        const result = store.reset({
          auto_open: body.auto_open !== false,
          duration_ms: body.duration_ms ?? 120_000,
        });
        sendJson(response, 200, result, corsHeaders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/windows/open") {
        const body = await readJson(request);
        const actionWindow = store.openActionWindow(body);
        sendJson(response, 201, { opened: true, action_window: actionWindow }, corsHeaders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/windows/close") {
        const body = await readJson(request);
        const result = store.closeActionWindow(body);
        sendJson(response, 200, result, corsHeaders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/table/actions") {
        const result = tableStore.submitAction(await readJson(request));
        sendJson(response, result.replay ? 200 : 201, result, corsHeaders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/table/reveal") {
        const result = tableStore.revealCards(await readJson(request));
        sendJson(response, result.replay ? 200 : 201, result, corsHeaders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/table/reset") {
        const result = tableStore.resetTable(await readJson(request));
        sendJson(response, result.replay ? 200 : 201, result, corsHeaders);
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/ai-requests") {
        requireInternalToken(request, internalToken);
        const result = store.submitPrompt(await readJson(request));
        sendJson(response, result.replay ? 200 : 201, result, corsHeaders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/internal/ai-answers") {
        requireInternalToken(request, internalToken);
        const result = store.submitAnswer(await readJson(request));
        sendJson(response, result.replay ? 200 : 201, result, corsHeaders);
        return;
      }

      if (request.method === "GET") {
        const staticFiles = {
          "/": ["index.html", "text/html; charset=utf-8"],
          "/index.html": ["index.html", "text/html; charset=utf-8"],
          "/app.js": ["app.js", "text/javascript; charset=utf-8"],
          "/styles.css": ["styles.css", "text/css; charset=utf-8"],
        };
        const staticEntry = staticFiles[url.pathname];
        if (staticEntry) {
          const [fileName, contentType] = staticEntry;
          const contents = await fs.promises.readFile(path.join(webRoot, fileName));
          response.writeHead(200, {
            "content-type": contentType,
            "cache-control": "no-store",
          });
          response.end(contents);
          return;
        }
      }

      sendJson(response, 404, { error: "not_found" }, corsHeaders);
    } catch (error) {
      const status = error instanceof ProbeError ? error.status : error.status || 500;
      const code = error instanceof ProbeError ? error.code : error.code || error.message || "internal_error";
      sendJson(
        response,
        status,
        { error: code, details: error.details },
        corsHeaders,
      );
    }
  });

  const actionTimer = setInterval(() => {
    try {
      tableStore.settleExpiredAction();
    } catch {
      // A read or action will surface deterministic failures; the scheduler must stay alive.
    }
  }, 250);
  actionTimer.unref?.();

  return {
    server,
    store,
    tableStore,
    playerCredentials() {
      return tableStore.playerCredentials();
    },
    playerUrls(origin) {
      return tableStore.playerCredentials().map((credential) => {
        const url = new URL(origin);
        url.searchParams.set("player", credential.player_id);
        url.searchParams.set("token", credential.player_token);
        return { player_id: credential.player_id, url: url.toString() };
      });
    },
    async start({ host = "127.0.0.1", port = 43110 } = {}) {
      const address = await listen(server, { host, port });
      return `http://${address.address}:${address.port}`;
    },
    async stop() {
      clearInterval(actionTimer);
      for (const client of sseClients) {
        clearInterval(client.keepAlive);
        client.unsubscribe();
        client.response.end();
      }
      sseClients.clear();
      await closeServer(server);
    },
  };
}

function requireInternalToken(request, expectedToken) {
  if (request.headers["x-tokengame-authority-token"] !== expectedToken) {
    throw new ProbeError("authority_token_rejected", 403);
  }
}

if (require.main === module) {
  const port = Number(process.env.TOKENGAME_AUTHORITY_PORT || 43110);
  const service = createAuthorityServer({ bootstrap: true });
  service
    .start({ port })
    .then((origin) => console.log(`TokenGame fake authority: ${origin}`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { createAuthorityServer, DEFAULT_AUTHORITY_TOKEN };
