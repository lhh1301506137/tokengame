"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const mcp = require("../plugins/tokengame/mcp/server.cjs");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-seat-model-token-00000000000000000000000001";
const ENV_KEYS = ["TOKENGAME_MODEL_CONNECTION_FILE", "TOKENGAME_MODEL_TOKEN", "TOKENGAME_TABLE_ORIGIN"];

async function fixture(t, responder) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-connection-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({ url: request.url, headers: request.headers, body: JSON.parse(Buffer.concat(chunks)) });
      if (responder) responder(request, response);
      else {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, result: { marker: "model-route-reached" } }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const file = path.join(dir, "connection.json");
  const write = (overrides = {}) => fs.writeFileSync(file, JSON.stringify({
    schema: "tokengame.model-connection.v1", table_origin: origin, model_token: SECRET, ...overrides,
  }));
  write();
  process.env.TOKENGAME_MODEL_CONNECTION_FILE = file;
  return { requests, origin, file, write, dir };
}

async function readTable() {
  const result = await mcp.callTool("tokengame_table", { command: "view.projection" });
  return { ...result, body: JSON.parse(result.content[0].text), text: JSON.stringify(result) };
}

test("MCP 从本人连接文件读取令牌，线上真实发送且工具结果不含令牌", async (t) => {
  const f = await fixture(t);
  const out = await readTable();
  assert.equal(out.isError, false, out.text);
  assert.equal(out.body.result.marker, "model-route-reached");
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].headers["x-tokengame-model-token"], SECRET);
  assert.equal(f.requests[0].url, "/api/model/command");
  assert.equal(f.requests[0].body.command, "view.projection");
  assert.equal(out.text.includes(SECRET), false);
  assert.equal(out.text.includes(f.file), false);

  const replacement = `${SECRET}-replacement`;
  f.write({ model_token: replacement });
  assert.equal((await readTable()).isError, false);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].headers["x-tokengame-model-token"], replacement,
    "换发文件后必须读新凭据，不要求重新打开宿主进程");
});

test("连接文件错误时失败关闭，不退回环境里的其他席位令牌", async (t) => {
  const f = await fixture(t);
  process.env.TOKENGAME_MODEL_TOKEN = "fallback-must-not-be-used";
  process.env.TOKENGAME_TABLE_ORIGIN = f.origin;
  fs.writeFileSync(f.file, `{ broken ${SECRET}`);
  const out = await readTable();
  assert.equal(out.isError, true);
  assert.equal(out.body.code, "model_connection_invalid");
  assert.equal(f.requests.length, 0);
  assert.equal(out.text.includes(SECRET), false);
  assert.equal(out.text.includes(f.file), false);
});

test("连接文件缺失与超限都有可理解错误，且不发网络请求", async (t) => {
  const f = await fixture(t);
  process.env.TOKENGAME_MODEL_CONNECTION_FILE = path.join(f.dir, "missing.json");
  const missing = await readTable();
  assert.equal(missing.body.code, "model_connection_unavailable");
  assert.equal(missing.isError, true);
  process.env.TOKENGAME_MODEL_CONNECTION_FILE = f.file;
  fs.writeFileSync(f.file, "x".repeat(16 * 1024 + 1));
  const large = await readTable();
  assert.equal(large.body.code, "model_connection_invalid");
  assert.equal(f.requests.length, 0);
  assert.ok(missing.body.hint.length > 10);
});

test("连接文件必须是本地服务的精确形状，不能把凭据转送远端或URL附带参数", async (t) => {
  const f = await fixture(t);
  const invalid = [
    { schema: "another-app.v1" },
    { model_token: "" },
    { model_token: "too-short" },
    { table_origin: "https://example.invalid" },
    { table_origin: `${f.origin}/extra-path` },
    { table_origin: `${f.origin}?leak=yes` },
    { table_origin: `${f.origin}#fragment` },
    { table_origin: f.origin.replace("http://", "http://user:password@") },
    { recovery_credential: "must-never-import-seat-secret" },
  ];
  for (const input of invalid) {
    f.write(input);
    const out = await readTable();
    assert.equal(out.isError, true, `未拒绝 ${JSON.stringify(input)}`);
    assert.equal(out.body.code, "model_connection_invalid");
    assert.equal(out.text.includes("must-never-import-seat-secret"), false);
  }
  assert.equal(f.requests.length, 0);
});

test("文件来源与显式环境origin不一致时，不猜应该连哪桌", async (t) => {
  const f = await fixture(t);
  process.env.TOKENGAME_TABLE_ORIGIN = "http://127.0.0.1:1";
  const out = await readTable();
  assert.equal(out.body.code, "model_connection_origin_conflict");
  assert.equal(out.isError, true);
  assert.equal(f.requests.length, 0);
});

test("协调器若回显模型令牌，MCP按原文扣下，而非把传输权限发回模型", async (t) => {
  await fixture(t, (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, result: { note: SECRET } }));
  });
  const out = await readTable();
  assert.equal(out.isError, true);
  assert.equal(out.body.code, "response_withheld_secret_detected");
  assert.equal(out.text.includes(SECRET), false);
});

test("模型请求不跟随重定向，否则自定义令牌头可能被转送其他服务", async (t) => {
  const target = await fixture(t);
  const redirector = await fixture(t, (_request, response) => {
    response.writeHead(307, { location: `${target.origin}/stolen` });
    response.end();
  });
  const out = await readTable();
  assert.equal(out.isError, true);
  assert.equal(out.body.code, "table_unavailable");
  assert.equal(redirector.requests.length, 1);
  assert.equal(target.requests.length, 0, "必须在转送凭据之前拦截重定向");
  assert.equal(out.text.includes(SECRET), false);
});

test("HTTP200但非JSON的协调器响应必须失败，不能把错误或陈旧端口当作接入成功", async (t) => {
  await fixture(t, (_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<html>wrong-service ${SECRET}</html>`);
  });
  const out = await readTable();
  assert.equal(out.isError, true);
  assert.equal(out.body.code, "invalid_core_response");
  assert.equal(out.text.includes(SECRET), false);
  assert.equal(out.text.includes("wrong-service"), false);
});

test("JSON可解析不等于模型信封有效，缺ok/result或非对象时明确失败", async (t) => {
  let payload = null;
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  const invalid = [null, [], "string", 1, {}, { code: "wrong-service" }, { ok: true }, { ok: true, result: null }, { ok: true, result: [] }];
  for (const value of invalid) {
    payload = value;
    const out = await readTable();
    assert.equal(out.isError, true);
    assert.equal(out.body.code, "invalid_core_response");
  }
  assert.equal(f.requests.length, invalid.length, "必须实际打到每份坏响应，而非提前配置失败");
});
