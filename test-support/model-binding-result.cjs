"use strict";

// 证据文件与进程退出码使用同一判定；清理错误不能绕过最终结果写入。
function acceptanceOutcome({ completed, failure, checks, errors }) {
  const passed = completed === true && failure === null && errors.length === 0
    && checks.length > 0 && checks.every((check) => check.passed === true);
  return { passed, exitCode: passed ? 0 : 1 };
}

async function cleanupWithEvidence(steps, errors, sanitize) {
  for (const [name, cleanup] of steps) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(`cleanup-${name}:${sanitize(error?.message ?? String(error))}`);
    }
  }
}

module.exports = { acceptanceOutcome, cleanupWithEvidence };
