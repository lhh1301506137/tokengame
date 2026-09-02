"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { acceptanceOutcome, cleanupWithEvidence } = require("../test-support/model-binding-result.cjs");

const success = { completed: true, failure: null, checks: [{ passed: true }], errors: [] };

test("B8 验收通过要求全部实际检查完成且没有错误", () => {
  assert.deepEqual(acceptanceOutcome(success), { passed: true, exitCode: 0 });
  for (const change of [
    { completed: false }, { failure: "interrupted" }, { checks: [] },
    { checks: [{ passed: false }] }, { checks: [{ passed: true }, {}] },
    { errors: ["cleanup failed"] },
  ]) {
    assert.deepEqual(acceptanceOutcome({ ...success, ...change }), { passed: false, exitCode: 1 });
  }
});

test("B8 清理失败也继续清理其余资源，证据与退出码同为失败", async () => {
  const errors = [];
  const completed = [];
  await cleanupWithEvidence([
    ["mcp", () => { throw new Error("secret-test-token"); }],
    ["browser", async () => { completed.push("browser"); }],
    ["private-files", async () => { throw new Error("permission denied"); }],
    ["tail", () => { completed.push("tail"); }],
  ], errors, (message) => String(message).replace("secret-test-token", "[REDACTED]"));
  assert.deepEqual(completed, ["browser", "tail"]);
  assert.deepEqual(errors, ["cleanup-mcp:[REDACTED]", "cleanup-private-files:permission denied"]);
  assert.deepEqual(acceptanceOutcome({ ...success, errors }), { passed: false, exitCode: 1 });
});
