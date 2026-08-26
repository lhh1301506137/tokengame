"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAuthorityServer } = require("../src/authority/server.cjs");
const { createBridgeServer } = require("../src/bridge/server.cjs");

const pluginRoot = path.resolve(__dirname, "../plugins/tokengame");

async function startStack() {
  const authority = createAuthorityServer({ bootstrap: true });
  const authorityUrl = await authority.start({ port: 0 });
  const bridge = createBridgeServer({ authorityUrl, timeoutMs: 500 });
  const bridgeUrl = await bridge.start({ port: 0 });
  return { authority, authorityUrl, bridge, bridgeUrl };
}

function runHook(fileName, input, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(pluginRoot, "hooks", fileName)], {
      env: { ...process.env, ...environment },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Hook ${fileName} exited ${code}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr, json: stdout ? JSON.parse(stdout) : null });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

test("普通 Prompt/Stop 不触发桥请求；公开 Prompt 在 Hook 返回前入流并由 Stop 发布回答", async () => {
  const stack = await startStack();
  const pluginData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tokengame-hook-test-"));
  const environment = {
    PLUGIN_DATA: pluginData,
    TOKENGAME_BRIDGE_URL: stack.bridgeUrl,
    TOKENGAME_HOOK_TIMEOUT_MS: "1000",
  };

  try {
    const ordinary = await runHook("user_prompt_submit.cjs", {
      session_id: "session-private",
      turn_id: "turn-private",
      prompt: "请帮我检查项目代码",
    }, environment);
    assert.equal(ordinary.stdout, "");
    assert.equal(stack.bridge.stats.received, 0);

    const ordinaryStop = await runHook("stop.cjs", {
      session_id: "session-private",
      turn_id: "turn-private",
      last_assistant_message: "普通回答",
    }, environment);
    assert.deepEqual(ordinaryStop.json, {});
    assert.equal(stack.bridge.stats.received, 0);

    const publicPrompt = await runHook("user_prompt_submit.cjs", {
      session_id: "session-public",
      turn_id: "turn-public",
      prompt: "$tokengame public D check，我要不要 all in？",
    }, environment);
    assert.equal(publicPrompt.json.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(publicPrompt.json.hookSpecificOutput.additionalContext, /公开回合合同/);
    assert.equal(stack.bridge.stats.received, 1);

    const stateBeforeAnswer = stack.authority.store.publicState();
    const promptEvents = stateBeforeAnswer.events.filter((event) => event.type === "AI_PROMPT_PUBLISHED");
    assert.equal(promptEvents.length, 1);
    assert.equal(promptEvents[0].payload.prompt, "D check，我要不要 all in？");
    assert.equal(stateBeforeAnswer.action_window.ai_request.status, "awaiting_answer");

    const deniedTool = await runHook("pre_tool_use.cjs", {
      session_id: "session-public",
      turn_id: "turn-public",
      tool_name: "exec_command",
    }, environment);
    assert.equal(deniedTool.json.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(stack.bridge.stats.received, 1);

    const tokenGameTool = await runHook("pre_tool_use.cjs", {
      session_id: "session-public",
      turn_id: "turn-public",
      tool_name: "mcp__tokengame__tokengame_probe_status",
    }, environment);
    assert.deepEqual(tokenGameTool.json, {});
    assert.equal(stack.bridge.stats.received, 1);

    const stop = await runHook("stop.cjs", {
      session_id: "session-public",
      turn_id: "turn-public",
      stop_hook_active: false,
      last_assistant_message: "可以考虑施压，但这只是公开建议，不代表下注动作。",
    }, environment);
    assert.deepEqual(stop.json, {});
    assert.equal(stack.bridge.stats.received, 2);

    const stateAfterAnswer = stack.authority.store.publicState();
    const answerEvents = stateAfterAnswer.events.filter((event) => event.type === "AI_ANSWER_PUBLISHED");
    assert.equal(answerEvents.length, 1);
    assert.match(answerEvents[0].payload.message, /不代表下注动作/);
    const pendingFiles = await fs.promises.readdir(path.join(pluginData, "pending"));
    assert.equal(pendingFiles.length, 0);
    const terminalFiles = await fs.promises.readdir(path.join(pluginData, "terminal"));
    assert.equal(terminalFiles.length, 1);
  } finally {
    await stack.bridge.stop();
    await stack.authority.stop();
    await fs.promises.rm(pluginData, { recursive: true, force: true });
  }
});

test("公开提示在桥不可达或权威窗口关闭时失败关闭", async () => {
  const stack = await startStack();
  const pluginData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tokengame-fail-test-"));
  const environment = {
    PLUGIN_DATA: pluginData,
    TOKENGAME_BRIDGE_URL: stack.bridgeUrl,
    TOKENGAME_HOOK_TIMEOUT_MS: "500",
  };

  try {
    stack.authority.store.closeActionWindow({ reason: "test_rejection" });
    const rejected = await runHook("user_prompt_submit.cjs", {
      session_id: "session-rejected",
      turn_id: "turn-rejected",
      prompt: "@tokengame public 应当被窗口拒绝",
    }, environment);
    assert.equal(rejected.json.decision, "block");
    assert.match(rejected.json.reason, /权威服务拒绝/);
    assert.equal(stack.authority.store.publicState().events.some((event) => event.type === "AI_PROMPT_PUBLISHED"), false);

    await stack.bridge.stop();
    const unreachable = await runHook("user_prompt_submit.cjs", {
      session_id: "session-unreachable",
      turn_id: "turn-unreachable",
      prompt: "[tokengame:public] 桥断开时不能生成",
    }, environment);
    assert.equal(unreachable.json.decision, "block");
    assert.match(unreachable.json.reason, /本地桥不可达/);
  } finally {
    await stack.bridge.stop();
    await stack.authority.stop();
    await fs.promises.rm(pluginData, { recursive: true, force: true });
  }
});

test("Stop 重入不覆盖桥故障时保留的原回答", async () => {
  const stack = await startStack();
  const pluginData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tokengame-stop-reentry-test-"));
  const environment = {
    PLUGIN_DATA: pluginData,
    TOKENGAME_BRIDGE_URL: stack.bridgeUrl,
    TOKENGAME_HOOK_TIMEOUT_MS: "500",
  };

  try {
    await runHook("user_prompt_submit.cjs", {
      session_id: "session-stop-reentry",
      turn_id: "turn-stop-reentry",
      prompt: "$tokengame public 保留原回答",
    }, environment);
    await stack.bridge.stop();

    const firstStop = await runHook("stop.cjs", {
      session_id: "session-stop-reentry",
      turn_id: "turn-stop-reentry",
      stop_hook_active: false,
      last_assistant_message: "这是必须在恢复后补交的原回答。",
    }, environment);
    assert.equal(firstStop.json.decision, "block");

    const pendingDirectory = path.join(pluginData, "pending");
    const [pendingFile] = await fs.promises.readdir(pendingDirectory);
    const beforeReentry = JSON.parse(await fs.promises.readFile(path.join(pendingDirectory, pendingFile), "utf8"));
    assert.equal(beforeReentry.last_attempted_message, "这是必须在恢复后补交的原回答。");

    const secondStop = await runHook("stop.cjs", {
      session_id: "session-stop-reentry",
      turn_id: "turn-stop-reentry",
      stop_hook_active: true,
      last_assistant_message: "这只是 Codex 生成的阻断说明。",
    }, environment);
    assert.deepEqual(secondStop.json, {});

    const afterReentry = JSON.parse(await fs.promises.readFile(path.join(pendingDirectory, pendingFile), "utf8"));
    assert.equal(afterReentry.last_attempted_message, "这是必须在恢复后补交的原回答。");
    assert.equal(afterReentry.last_attempt_failed_at, beforeReentry.last_attempt_failed_at);
  } finally {
    await stack.bridge.stop();
    await stack.authority.stop();
    await fs.promises.rm(pluginData, { recursive: true, force: true });
  }
});
