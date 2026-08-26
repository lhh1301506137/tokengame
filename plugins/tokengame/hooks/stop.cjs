"use strict";

const {
  archivePending,
  bridgeRequest,
  emit,
  readHookInput,
  readPending,
  writePending,
} = require("./hook-lib.cjs");

async function main() {
  const input = await readHookInput();
  if (!input.session_id || !input.turn_id) {
    emit({});
    return;
  }
  const marker = await readPending(input.session_id, input.turn_id);
  if (!marker) {
    // Privacy invariant: an ordinary Stop event performs no bridge request.
    emit({});
    return;
  }

  if (input.stop_hook_active) {
    // Codex invokes Stop again after a blocking Stop response. The follow-up
    // assistant message explains the block; it must not replace or republish
    // the original answer retained in the pending marker.
    emit({});
    return;
  }

  const message = typeof input.last_assistant_message === "string"
    ? input.last_assistant_message.trim()
    : "";
  if (!message) {
    emit({});
    return;
  }

  let result;
  try {
    result = await bridgeRequest("/v1/answers", {
      method: "POST",
      body: {
        session_id: input.session_id,
        turn_id: input.turn_id,
        message,
        idempotency_key: `answer:${input.session_id}:${input.turn_id}`,
      },
    });
  } catch (error) {
    await writePending({
      ...marker,
      last_attempted_message: message,
      last_attempt_failed_at: Date.now(),
      last_attempt_error: error.name,
    });
    emit({
      decision: "block",
      reason: "TokenGame 回答尚未公开：本地桥不可达。请保留原答复；桥恢复后可用 publish_ai_answer 显式补交。",
    });
    return;
  }

  if (result.ok) {
    await archivePending(marker, { status: "published", result: result.body });
    emit({});
    return;
  }

  await archivePending(marker, {
    status: "rejected",
    http_status: result.status,
    result: result.body,
    attempted_message: message,
  });
  emit({
    decision: "block",
    reason: `TokenGame 权威服务拒绝回答（${result.body.error || result.status}）；该回答未公开。`,
  });
}

main().catch((error) => {
  emit({});
  process.stderr.write(`TokenGame Stop Hook error: ${error.stack || error.message}\n`);
});
