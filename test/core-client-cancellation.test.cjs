"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const { HttpCoreClient, InProcessCoreClient } = require("../src/host/core-client.cjs");

for (const transport of ["http", "in_process"]) {
  test(`${transport}: 已取消的请求不进入传输或核心，取消信号不是协议参数`, async () => {
    let calls = 0;
    const core = transport === "http"
      ? new HttpCoreClient({ origin: "http://127.0.0.1", fetchImpl: async () => { calls += 1; } })
      : new InProcessCoreClient({ surface: { dispatch: () => { calls += 1; } } });
    await assert.rejects(core.dispatch("view.projection", {}, { signal: AbortSignal.abort() }), { code: "core_request_cancelled" });
    await assert.rejects(core.dispatch("view.projection", {}, { signal: {} }), { code: "invalid_field" });
    assert.equal(calls, 0);
  });
}

test("HTTP取消同时覆盖响应头前与响应体期间，不回显Abort原因", { timeout: 5000 }, async (t) => {
  for (const stage of ["headers", "body"]) {
    await t.test(stage, async (t) => {
      const controller = new AbortController();
      let release;
      const arrived = new Promise((resolve) => { release = resolve; });
      let socketClosed;
      const closed = new Promise((resolve) => { socketClosed = resolve; });
      let requests = 0;
      const server = http.createServer((request, response) => {
        requests += 1;
        request.socket.once("close", socketClosed);
        if (stage === "body") {
          response.writeHead(200, { "content-type": "application/json" });
          response.write('{"ok":true,"result":');
        }
        if (stage === "headers") release();
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      t.after(async () => { controller.abort(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
      const core = new HttpCoreClient({ origin: `http://127.0.0.1:${server.address().port}`, token: "local-fixture-only",
        fetchImpl: async (...args) => {
          const response = await fetch(...args);
          return { ok: response.ok, status: response.status, json: () => { if (stage === "body") release(); return response.json(); } };
        },
      });
      const pending = core.dispatch("view.projection", {}, { signal: controller.signal });
      const rejected = assert.rejects(pending, (error) => {
        assert.equal(error.code, "core_request_cancelled"); assert.doesNotMatch(JSON.stringify(error), /PRIVATE/); return true;
      });
      await arrived;
      controller.abort(new Error("PRIVATE cancellation reason"));
      await rejected;
      await closed;
      assert.equal(requests, 1);
    });
  }
});

test("取消信号只在fetch选项中传递；正文读取后的取消也扣下结果", async () => {
  const controller = new AbortController();
  let calls = 0;
  const core = new HttpCoreClient({ origin: "http://127.0.0.1", fetchImpl: async (_url, options) => {
    calls += 1; assert.equal(options.signal, controller.signal);
    assert.equal(JSON.parse(options.body).params.signal, undefined);
    return { ok: true, json: async () => { controller.abort(); return { ok: true, result: "withheld" }; } };
  } });
  await assert.rejects(core.dispatch("view.projection", {}, { signal: controller.signal }), { code: "core_request_cancelled" });
  assert.equal(calls, 1);
});

test("进程内await返回后取消不交付结果；不冒充已经撤销权威效果", async () => {
  const controller = new AbortController();
  let dispatched = 0;
  const core = new InProcessCoreClient({ surface: { dispatch: async () => { dispatched += 1; controller.abort(); return "withheld"; } } });
  await assert.rejects(core.dispatch("view.projection", {}, { signal: controller.signal }), { code: "core_request_cancelled" });
  assert.equal(dispatched, 1);
});

test("携权威令牌的 HTTP 客户端拒绝跨 origin 重定向且不把令牌送到目标", async (t) => {
  let targetRequests = 0;
  let sourceRequests = 0;
  const target = http.createServer((_request, response) => {
    targetRequests += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, result: {} }));
  });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => target.close(resolve)));

  const source = http.createServer((_request, response) => {
    sourceRequests += 1;
    response.writeHead(307, { location: `http://127.0.0.1:${target.address().port}/stolen` });
    response.end();
  });
  await new Promise((resolve) => source.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => source.close(resolve)));

  const core = new HttpCoreClient({
    origin: `http://127.0.0.1:${source.address().port}`,
    token: "authority-token-must-not-cross-origin",
  });
  await assert.rejects(core.dispatch("view.projection"), { code: "core_unreachable" });
  assert.equal(sourceRequests, 1);
  assert.equal(targetRequests, 0);
});
