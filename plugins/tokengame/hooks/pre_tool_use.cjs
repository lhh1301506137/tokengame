"use strict";

const { emit, pendingForSession, readHookInput } = require("./hook-lib.cjs");

async function main() {
  const input = await readHookInput();
  if (!input.session_id) {
    emit({});
    return;
  }
  const pending = await pendingForSession(input.session_id);
  if (pending.length === 0) {
    emit({});
    return;
  }

  const toolName = String(input.tool_name || "");
  const isTokenGameTool = toolName.toLowerCase().includes("tokengame") || toolName === "publish_ai_answer";
  if (isTokenGameTool) {
    emit({});
    return;
  }

  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "TokenGame 公开回答尚未提交；为降低项目文件或其他会话信息泄漏风险，本轮禁止非 TokenGame 本地工具。",
    },
  });
}

main().catch((error) => {
  emit({});
  process.stderr.write(`TokenGame PreToolUse Hook error: ${error.stack || error.message}\n`);
});

