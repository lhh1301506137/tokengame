"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  connectionOrigin,
  parseModelConnection,
} = require("../src/shared/model-connection-file.cjs");

const TOKEN = "remote-seat-model-token-000000000000000000000001";

test("模型连接 origin 接受规范 HTTPS 公网根地址，并保留回环 HTTP 兼容", () => {
  assert.equal(connectionOrigin("https://Friends.Example:443/"), "https://friends.example");
  assert.equal(connectionOrigin("https://friends.example:8443"), "https://friends.example:8443");
  assert.equal(connectionOrigin("http://127.0.0.1:7802/"), "http://127.0.0.1:7802");
  assert.equal(connectionOrigin("http://localhost:7802"), "http://localhost:7802");
  assert.equal(connectionOrigin("http://[::1]:7802"), "http://[::1]:7802");
});

test("模型连接 origin 拒绝远程明文 HTTP、非根路径和可搬运凭据的 URL 部件", () => {
  const invalid = [
    "http://friends.example",
    "ws://friends.example",
    "ftp://friends.example",
    "https://user:password@friends.example",
    "https://friends.example/table",
    "https://friends.example/?room=secret",
    "https://friends.example/#fragment",
    "https://friends.example//",
    "https://friends.example/private/..",
    "https://friends.example/%2e",
    "https://friends.example\\",
    "https:friends.example",
    "https:///friends.example",
    "https://@friends.example",
    "https://friends.exa\tmple",
    "not-a-url",
    "",
  ];
  for (const value of invalid) {
    assert.throws(() => connectionOrigin(value), { code: "model_connection_invalid" }, value);
  }
});

test("远程 HTTPS 连接文件仍使用精确字段、令牌和显式 origin 冲突校验", () => {
  const raw = JSON.stringify({
    schema: "tokengame.model-connection.v1",
    table_origin: "https://Friends.Example:443/",
    model_token: TOKEN,
  });
  const parsed = parseModelConnection(raw, { explicitOrigin: "https://friends.example" });
  assert.equal(parsed.origin, "https://friends.example");
  assert.deepEqual(JSON.parse(parsed.serialized), {
    schema: "tokengame.model-connection.v1",
    table_origin: "https://friends.example",
    model_token: TOKEN,
  });
  assert.throws(
    () => parseModelConnection(raw, { explicitOrigin: "https://other.example" }),
    { code: "model_connection_origin_conflict" },
  );
  assert.throws(
    () => parseModelConnection(JSON.stringify({
      schema: "tokengame.model-connection.v1",
      table_origin: "https://friends.example",
      model_token: TOKEN,
      forwarded_host: "attacker.invalid",
    })),
    { code: "model_connection_invalid" },
  );
});
