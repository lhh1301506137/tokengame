"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");
const test = require("node:test");
const { createAuthorityServer } = require("../src/authority/server.cjs");
const { createBridgeServer } = require("../src/bridge/server.cjs");

const mcpServerPath = path.resolve(__dirname, "../plugins/tokengame/mcp/server.cjs");

async function startStack() {
  const authority = createAuthorityServer({ bootstrap: true });
  const authorityUrl = await authority.start({ port: 0 });
  const bridge = createBridgeServer({ authorityUrl });
  const bridgeUrl = await bridge.start({ port: 0 });
  return { authority, authorityUrl, bridge, bridgeUrl };
}

function startMcp(bridgeUrl) {
  const child = spawn(process.execPath, [mcpServerPath, "--stdio"], {
    env: { ...process.env, TOKENGAME_BRIDGE_URL: bridgeUrl },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const pending = new Map();
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter.resolve(message);
    }
  });
  child.on("error", (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });

  let nextId = 1;
  return {
    child,
    request(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    async stop() {
      lines.close();
      child.stdin.end();
      if (child.exitCode === null) child.kill();
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once("exit", resolve);
      });
    },
  };
}

test("MCP stdio 握手、工具清单与状态调用可通过本地桥工作", async () => {
  const stack = await startStack();
  const mcp = startMcp(stack.bridgeUrl);
  try {
    const initialized = await mcp.request("initialize", { protocolVersion: "2025-06-18" });
    assert.equal(initialized.result.serverInfo.name, "tokengame-local-probe");

    const listed = await mcp.request("tools/list");
    const names = listed.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("tokengame_probe_status"));
    assert.ok(names.includes("publish_ai_answer"));

    const status = await mcp.request("tools/call", {
      name: "tokengame_probe_status",
      arguments: {},
    });
    assert.equal(status.result.isError, false);
    const state = JSON.parse(status.result.content[0].text);
    assert.equal(state.contract, "tokengame.local-probe.v1");
    assert.equal(state.action_window.status, "open");
  } finally {
    await mcp.stop();
    await stack.bridge.stop();
    await stack.authority.stop();
  }
});

test("MCP 显式补交把已登记公开提示的回答送入权威事件流", async () => {
  const stack = await startStack();
  const sessionId = "session-mcp-fallback";
  const turnId = "turn-mcp-fallback";
  const message = "这是桥恢复后必须原样补交的回答。";
  const promptResponse = await fetch(`${stack.bridgeUrl}/v1/prompts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tokengame-plugin-token": "local-probe-only-plugin-token",
    },
    body: JSON.stringify({
      session_id: sessionId,
      turn_id: turnId,
      prompt: "测试显式补交",
      idempotency_key: `prompt:${sessionId}:${turnId}`,
    }),
  });
  const promptResult = await promptResponse.json();
  assert.equal(promptResult.accepted, true);

  const mcp = startMcp(stack.bridgeUrl);
  try {
    const published = await mcp.request("tools/call", {
      name: "publish_ai_answer",
      arguments: { session_id: sessionId, turn_id: turnId, message },
    });
    assert.equal(published.result.isError, false);
    const result = JSON.parse(published.result.content[0].text);
    assert.equal(result.accepted, true);
    const state = stack.authority.store.publicState();
    assert.equal(state.action_window.answer.message, message);
  } finally {
    await mcp.stop();
    await stack.bridge.stop();
    await stack.authority.stop();
  }
});

test("权威服务同时提供可观察 UI 与机器可读状态", async () => {
  const authority = createAuthorityServer({ bootstrap: true });
  const origin = await authority.start({ port: 0 });
  try {
    const index = await (await fetch(`${origin}/`)).text();
    const app = await (await fetch(`${origin}/app.js`)).text();
    const state = await (await fetch(`${origin}/api/state`)).json();
    assert.match(index, /TokenGame \/ Codex Poker Table/);
    assert.match(index, /Codex 无限注德州扑克/);
    assert.match(index, /PLAYER ACTION/);
    assert.match(app, /render_game_to_text/);
    assert.match(app, /advanceTime/);
    assert.equal(state.mode, "local-probe-only");
    assert.equal(state.events[0].type, "PROBE_RESET");
  } finally {
    await authority.stop();
  }
});

test("四个 HTTP 玩家身份只能读取自己的底牌，并通过版本化接口提交动作", async () => {
  const authority = createAuthorityServer({ bootstrap: true });
  const origin = await authority.start({ port: 0 });
  const credentials = Object.fromEntries(
    authority.playerCredentials().map((entry) => [entry.player_id, entry.player_token]),
  );
  const stateUrl = (playerId, token) => {
    const url = new URL("/api/table/state", origin);
    if (playerId) url.searchParams.set("player_id", playerId);
    if (token) url.searchParams.set("player_token", token);
    return url;
  };

  try {
    const observer = await (await fetch(stateUrl())).json();
    assert.equal(observer.viewer.role, "observer");
    assert.ok(observer.hand.seats.every((seat) => seat.hole_cards === null));

    const aResponse = await fetch(stateUrl("a", credentials.a));
    assert.equal(aResponse.status, 200);
    const aState = await aResponse.json();
    assert.equal(aState.viewer.player_id, "a");
    assert.equal(aState.hand.seats.find((seat) => seat.id === "a").hole_cards.length, 2);
    assert.ok(aState.hand.seats.filter((seat) => seat.id !== "a").every((seat) => seat.hole_cards === null));

    const internal = authority.tableStore.hand;
    const serializedAState = JSON.stringify(aState);
    for (const seat of internal.seats.filter((seat) => seat.id !== "a")) {
      for (const card of seat.hole_cards) assert.equal(serializedAState.includes(`\"${card}\"`), false);
    }

    const rejected = await fetch(stateUrl("b", credentials.a));
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error, "player_token_rejected");

    const actionInput = {
      player_id: "d",
      player_token: credentials.d,
      action: "call",
      expected_revision: 1,
      idempotency_key: "http-d-call-1",
    };
    const accepted = await fetch(`${origin}/api/table/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actionInput),
    });
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).revision, 2);

    const replay = await fetch(`${origin}/api/table/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actionInput),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replay, true);

    const aAfter = await (await fetch(stateUrl("a", credentials.a))).json();
    assert.equal(aAfter.hand.actor_player_id, "a");
    assert.equal(aAfter.hand.revision, 2);
  } finally {
    await authority.stop();
  }
});

test("个性化牌桌 SSE 首帧只包含连接身份有权看到的投影", async () => {
  const authority = createAuthorityServer({ bootstrap: true });
  const origin = await authority.start({ port: 0 });
  const credential = authority.playerCredentials().find((entry) => entry.player_id === "b");
  const url = new URL("/api/table/events/stream", origin);
  url.searchParams.set("player_id", credential.player_id);
  url.searchParams.set("player_token", credential.player_token);

  try {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const firstChunk = await reader.read();
    const text = new TextDecoder().decode(firstChunk.value);
    const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data: "));
    const message = JSON.parse(dataLine.slice(6));
    assert.equal(message.type, "SNAPSHOT");
    assert.equal(message.state.viewer.player_id, "b");
    assert.equal(message.state.hand.seats.find((seat) => seat.id === "b").hole_cards.length, 2);
    assert.ok(message.state.hand.seats.filter((seat) => seat.id !== "b").every((seat) => seat.hole_cards === null));
    await reader.cancel();
  } finally {
    await authority.stop();
  }
});
