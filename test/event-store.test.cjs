"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { EventStore, ProbeError } = require("../src/authority/event-store.cjs");

function deterministicStore() {
  let now = 1_000;
  let id = 0;
  const store = new EventStore({
    now: () => now,
    idFactory: () => `id-${++id}`,
  });
  return {
    store,
    setNow(value) { now = value; },
  };
}

test("每个行动窗口只接受一次 AI 请求，并对相同提交进行幂等重放", () => {
  const { store } = deterministicStore();
  store.reset({ auto_open: true, duration_ms: 5_000 });

  const input = {
    session_id: "session-1",
    turn_id: "turn-1",
    prompt: "D check，我要不要 all in？",
    idempotency_key: "prompt-key-1",
  };
  const first = store.submitPrompt(input);
  const eventCountAfterFirst = store.publicState().events.length;
  const replay = store.submitPrompt(input);

  assert.equal(first.accepted, true);
  assert.equal(first.replay, false);
  assert.equal(replay.replay, true);
  assert.equal(replay.request_id, first.request_id);
  assert.equal(store.publicState().events.length, eventCountAfterFirst);
  assert.throws(
    () => store.submitPrompt({ ...input, turn_id: "turn-2", idempotency_key: "prompt-key-2" }),
    (error) => error instanceof ProbeError && error.code === "ai_request_quota_used",
  );
});

test("回答提交幂等；同一幂等键携带不同内容会被拒绝", () => {
  const { store } = deterministicStore();
  store.reset({ auto_open: true, duration_ms: 5_000 });
  store.submitPrompt({
    session_id: "session-1",
    turn_id: "turn-1",
    prompt: "公开提示",
    idempotency_key: "prompt-key",
  });

  const answer = {
    session_id: "session-1",
    turn_id: "turn-1",
    message: "建议只是公开分析，不代表官方动作。",
    idempotency_key: "answer-key",
  };
  const first = store.submitAnswer(answer);
  const eventCountAfterFirst = store.publicState().events.length;
  const replay = store.submitAnswer(answer);

  assert.equal(first.accepted, true);
  assert.equal(replay.replay, true);
  assert.equal(store.publicState().events.length, eventCountAfterFirst);
  assert.throws(
    () => store.submitAnswer({ ...answer, message: "篡改后的不同回答" }),
    (error) => error instanceof ProbeError && error.code === "idempotency_key_conflict",
  );
});

test("截止时刻及之后拒绝回答，但已公开提示保留在事件流", () => {
  const clock = deterministicStore();
  const { store } = clock;
  store.reset({ auto_open: true, duration_ms: 100 });
  store.submitPrompt({
    session_id: "session-late",
    turn_id: "turn-late",
    prompt: "这条提示必须继续可见",
    idempotency_key: "prompt-late",
  });

  clock.setNow(1_100);
  assert.throws(
    () => store.submitAnswer({
      session_id: "session-late",
      turn_id: "turn-late",
      message: "迟到回答",
      idempotency_key: "answer-late",
    }),
    (error) => error instanceof ProbeError && error.code === "action_window_expired",
  );

  const state = store.publicState();
  assert.equal(state.action_window.status, "closed");
  assert.equal(state.action_window.close_reason, "deadline_elapsed");
  assert.equal(state.events.filter((event) => event.type === "AI_PROMPT_PUBLISHED").length, 1);
  assert.equal(state.events.filter((event) => event.type === "AI_ANSWER_PUBLISHED").length, 0);
});

test("手动关闭窗口后拒绝尚未提交的回答", () => {
  const { store } = deterministicStore();
  store.reset({ auto_open: true, duration_ms: 5_000 });
  store.submitPrompt({
    session_id: "session-close",
    turn_id: "turn-close",
    prompt: "公开但未回答",
    idempotency_key: "prompt-close",
  });
  store.closeActionWindow({ reason: "test_close" });

  assert.throws(
    () => store.submitAnswer({
      session_id: "session-close",
      turn_id: "turn-close",
      message: "关闭后的回答",
      idempotency_key: "answer-close",
    }),
    (error) => error instanceof ProbeError && error.code === "action_window_closed",
  );
});

test("只读状态查询也会结算已到期窗口，避免 UI 与权威状态分叉", () => {
  const clock = deterministicStore();
  clock.store.reset({ auto_open: true, duration_ms: 50 });
  clock.setNow(1_050);

  const firstRead = clock.store.publicState();
  const secondRead = clock.store.publicState();
  assert.equal(firstRead.action_window.status, "closed");
  assert.equal(firstRead.action_window.close_reason, "deadline_elapsed");
  assert.equal(firstRead.events.filter((event) => event.type === "ACTION_WINDOW_CLOSED").length, 1);
  assert.equal(secondRead.events.filter((event) => event.type === "ACTION_WINDOW_CLOSED").length, 1);
});
