import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { createAuthorityServer, DEFAULT_AUTHORITY_TOKEN } = require("../src/authority/server.cjs");
const { TableStore } = require("../src/authority/table-store.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");

const outputDirectory = path.resolve(process.argv[2] || "artifacts/four-player-smoke");
fs.mkdirSync(outputDirectory, { recursive: true });

const playerIds = ["a", "b", "c", "d"];
const playerTokens = Object.fromEntries(playerIds.map((id) => [id, `browser-token-${id}`]));
let nextId = 0;
const tableStore = new TableStore({
  idFactory: () => `browser-id-${++nextId}`,
  playerTokens,
  actionTimeoutMs: 120_000,
  deckFactory: () => stackedDeck([]),
});
const authority = createAuthorityServer({ bootstrap: true, tableStore });
const origin = await authority.start({ port: 0 });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const pages = new Map();
const contexts = [];
const errors = [];
const publicPrompt = "上家 D check，我要不要 all in 诈唬后面的 B、C、D？这是公开发送给 A 的 Codex AI 的长提示；所有玩家都应立即看到同一段文字，但它不能遮挡公共牌、关键座位状态或行动控件。";
const publicAnswer = "当前公开牌局信息不足以替你决定真实动作。可以讨论范围、底池赔率和诈唬风险，但最终行动仍由玩家 A 提交；这条较长回答用于验证所有四个视图中的公开 AI 气泡、文本截断和可访问完整内容保持一致。";

function playerUrl(playerId) {
  const url = new URL(origin);
  url.searchParams.set("player", playerId);
  url.searchParams.set("token", playerTokens[playerId]);
  return url.toString();
}

async function pageState(playerId) {
  return pages.get(playerId).evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function allStates() {
  return Promise.all(playerIds.map(pageState));
}

async function waitForAll(predicateSource, argument) {
  await Promise.all([...pages.values()].map((page) => page.waitForFunction(
    new Function("argument", `return (${predicateSource})(JSON.parse(window.render_game_to_text()), argument);`),
    argument,
  )));
}

async function waitForRevision(revision) {
  await waitForAll("(state, expected) => state.hand.revision >= expected", revision);
}

async function waitForNewHand(previousHandId) {
  await waitForAll("(state, previous) => state.hand.hand_id !== previous", previousHandId);
}

async function postInternal(pathname, body) {
  const response = await fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tokengame-authority-token": DEFAULT_AUTHORITY_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.ok(response.ok, `${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

function publicDigest(state) {
  return {
    hand_id: state.hand.hand_id,
    revision: state.hand.revision,
    status: state.hand.status,
    street: state.hand.street,
    finish_reason: state.hand.finish_reason,
    board: state.hand.board,
    pot_total: state.hand.pot_total,
    actor_player_id: state.hand.actor_player_id,
    seats: state.hand.seats.map((seat) => ({
      id: seat.id,
      stack: seat.stack,
      round_commitment: seat.round_commitment,
      total_commitment: seat.total_commitment,
      status: seat.status,
    })),
    settlement: state.hand.settlement,
  };
}

async function assertPublicStateParity() {
  const states = await allStates();
  const expected = publicDigest(states[0]);
  for (const state of states.slice(1)) assert.deepEqual(publicDigest(state), expected);
}

async function assertPrivateIsolation() {
  const states = await allStates();
  for (const state of states) {
    const own = state.hand.seats.find((seat) => seat.id === state.viewer.player_id);
    assert.equal(own.hole_cards.length, 2);
    assert.ok(state.hand.seats
      .filter((seat) => seat.id !== state.viewer.player_id)
      .every((seat) => seat.hole_cards === null));
  }
}

async function assertSeatAiCompanionsVisible() {
  const states = await allStates();
  for (const state of states) {
    assert.deepEqual(state.seat_ai_companions.map((seat) => seat.seat_id), playerIds);
    assert.ok(state.seat_ai_companions.every((seat) => seat.companion === "Codex AI"));
  }
  for (const page of pages.values()) {
    for (const playerId of playerIds) {
      const companion = page.locator(`.seat-ai[data-seat="${playerId}"] .seat-ai-identity`);
      assert.equal(await companion.isVisible(), true, `seat ${playerId} AI companion must be visible`);
    }
  }
}

async function assertFullEventFeedRendered() {
  const counts = await Promise.all([...pages.values()].map((page) => page.evaluate(() => ({
    announced: Number(document.querySelector("#eventCount").textContent),
    rendered: document.querySelector("#eventList").children.length,
  }))));
  for (const count of counts) {
    assert.ok(count.announced > 80, "smoke must exceed the former 80-event display cap");
    assert.equal(count.rendered, count.announced, "the public event feed must render its full history");
  }
  assert.ok(counts.every((count) => count.announced === counts[0].announced));
  return counts[0].announced;
}

async function assertDesktopAiLayoutClear() {
  const layout = await pages.get("a").evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      };
    };
    const stage = rect(document.querySelector(".table-stage"));
    const controls = rect(document.querySelector(".action-console"));
    const cardWidth = Math.max(34, Math.min(52, stage.width * 0.055));
    const cardHeight = cardWidth * 1.38;
    const gap = Math.max(5, cardWidth * 0.12);
    const boardWidth = cardWidth * 5 + gap * 4;
    const centerX = stage.left + stage.width / 2;
    const centerY = stage.top + stage.height / 2;
    const seatWidth = Math.max(108, Math.min(144, stage.width * 0.16));
    const seatHeight = 62;
    const seatCenters = {
      a: { x: centerX, y: stage.bottom - 48 },
      b: { x: stage.right - seatWidth / 2 - 10, y: centerY },
      c: { x: centerX, y: stage.top + 48 },
      d: { x: stage.left + seatWidth / 2 + 10, y: centerY },
    };
    const seatBoxes = Object.fromEntries(Object.entries(seatCenters).map(([seatId, center]) => [seatId, {
      left: center.x - seatWidth / 2,
      right: center.x + seatWidth / 2,
      top: center.y - seatHeight / 2,
      bottom: center.y + seatHeight / 2,
    }]));
    return {
      stage,
      controls,
      board: {
        left: centerX - boardWidth / 2,
        right: centerX + boardWidth / 2,
        top: centerY - cardHeight / 2 + 12,
        bottom: centerY + cardHeight / 2 + 12,
      },
      seat_boxes: seatBoxes,
      ai_boxes: [...document.querySelectorAll(".seat-ai")].map((element) => ({
        seat_id: element.dataset.seat,
        ...rect(element),
      })),
    };
  });
  const overlaps = (left, right) => left.left < right.right - 1
    && left.right > right.left + 1
    && left.top < right.bottom - 1
    && left.bottom > right.top + 1;
  for (const aiBox of layout.ai_boxes) {
    assert.equal(overlaps(aiBox, layout.board), false, `seat ${aiBox.seat_id} AI must not cover the board`);
    assert.equal(overlaps(aiBox, layout.controls), false, `seat ${aiBox.seat_id} AI must not cover actions`);
    for (const [seatId, seatBox] of Object.entries(layout.seat_boxes)) {
      assert.equal(overlaps(aiBox, seatBox), false, `seat ${aiBox.seat_id} AI must not cover seat ${seatId}`);
    }
  }
}

async function verifyPublicAiConversation() {
  const unknownRequestId = "unknown-seat-request";
  const ordinaryRequestId = "ordinary-message-request";
  const orphanAnswerRequestId = "orphan-answer-request";
  const unknownAnswerRequestId = "unknown-answer-request";
  authority.store.record("AI_PROMPT_PUBLISHED", {
    request_id: unknownRequestId,
    actor: "spectator-x",
    prompt: "未知来源不应生成任何座位气泡",
  });
  authority.store.record("AI_MESSAGE_PUBLISHED", {
    request_id: ordinaryRequestId,
    actor: "a",
    message: "普通事件即使声称来自 A 也不能进入座位气泡",
  });
  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: orphanAnswerRequestId,
    actor: "ai:a",
    message: "没有对应公开 prompt 的 answer 不应生成座位气泡",
  });
  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: unknownAnswerRequestId,
    actor: "ai:spectator-x",
    message: "未知 AI 来源不应生成座位气泡",
  });
  await waitForAll(
    "(state, requestId) => state.public_ai_events.some((event) => event.payload?.request_id === requestId)",
    unknownAnswerRequestId,
  );
  for (const state of await allStates()) {
    assert.ok(state.public_ai_events.some((event) => event.payload?.request_id === unknownRequestId));
    assert.ok(state.public_ai_events.some((event) => event.payload?.request_id === ordinaryRequestId));
    assert.ok(state.public_ai_events.some((event) => event.payload?.request_id === orphanAnswerRequestId));
    assert.ok(state.public_ai_events.some((event) => event.payload?.request_id === unknownAnswerRequestId));
    assert.ok(state.seat_ai_companions.every((seat) => seat.latest_conversation === null));
  }
  for (const page of pages.values()) {
    assert.equal(await page.locator(".seat-conversation:not([hidden])").count(), 0);
  }

  const sessionId = "browser-public-ai-session-a";
  const turnId = "browser-public-ai-turn-a";
  const promptResult = await postInternal("/internal/ai-requests", {
    session_id: sessionId,
    turn_id: turnId,
    prompt: publicPrompt,
    idempotency_key: "browser-public-ai-prompt-a",
  });
  await waitForAll(
    `(state, expected) => {
      const seat = state.seat_ai_companions.find((entry) => entry.seat_id === "a");
      const conversation = seat?.latest_conversation;
      return conversation?.request_id === expected.request_id
        && conversation.status === "generating"
        && conversation.prompt === expected.prompt
        && conversation.answer === null;
    }`,
    { request_id: promptResult.request_id, prompt: publicPrompt },
  );
  for (const page of pages.values()) {
    const seat = page.locator('.seat-ai[data-seat="a"]');
    assert.equal(await seat.getAttribute("data-state"), "generating");
    assert.equal(await seat.locator('[data-role="prompt"]').textContent(), publicPrompt);
    assert.match(await seat.locator('[data-role="answer"]').textContent(), /正在生成公开回答/);
    assert.equal(await seat.locator('[data-role="conversation"]').getAttribute("aria-busy"), "true");
    assert.equal(await page.locator("#phasePrompt").getAttribute("data-state"), "done");
    assert.equal(await page.locator("#phaseModel").getAttribute("data-state"), "active");
    assert.equal(await page.locator("#phaseAnswer").getAttribute("data-state"), "idle");
  }
  await pages.get("a").screenshot({ path: path.join(outputDirectory, "ai-prompt-pending.png"), fullPage: true });

  const answerResult = await postInternal("/internal/ai-answers", {
    session_id: sessionId,
    turn_id: turnId,
    message: publicAnswer,
    idempotency_key: "browser-public-ai-answer-a",
  });
  assert.equal(answerResult.request_id, promptResult.request_id);
  await waitForAll(
    `(state, expected) => {
      const seat = state.seat_ai_companions.find((entry) => entry.seat_id === "a");
      const conversation = seat?.latest_conversation;
      return conversation?.request_id === expected.request_id
        && conversation.status === "answered"
        && conversation.prompt === expected.prompt
        && conversation.answer === expected.answer;
    }`,
    { request_id: promptResult.request_id, prompt: publicPrompt, answer: publicAnswer },
  );
  for (const page of pages.values()) {
    const seat = page.locator('.seat-ai[data-seat="a"]');
    assert.equal(await seat.getAttribute("data-state"), "answered");
    assert.equal(await seat.locator('[data-role="prompt"]').textContent(), publicPrompt);
    assert.equal(await seat.locator('[data-role="answer"]').textContent(), publicAnswer);
    assert.equal(await seat.locator('[data-role="conversation"]').getAttribute("aria-busy"), "false");
    assert.equal(await page.locator("#phasePrompt").getAttribute("data-state"), "done");
    assert.equal(await page.locator("#phaseModel").getAttribute("data-state"), "done");
    assert.equal(await page.locator("#phaseAnswer").getAttribute("data-state"), "done");
  }
  await pages.get("a").screenshot({ path: path.join(outputDirectory, "ai-answer-published.png"), fullPage: true });
  await assertDesktopAiLayoutClear();

  const narrowPage = pages.get("a");
  await narrowPage.setViewportSize({ width: 560, height: 900 });
  await narrowPage.waitForFunction(() => window.innerWidth === 560);
  const narrowLayout = await narrowPage.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const stage = rect(document.querySelector(".table-stage"));
    const layer = rect(document.querySelector(".seat-ai-layer"));
    const controls = rect(document.querySelector(".action-console"));
    const companions = [...document.querySelectorAll(".seat-ai-identity")].map(rect);
    const conversations = [...document.querySelectorAll(".seat-conversation:not([hidden])")].map(rect);
    return {
      stage,
      layer,
      controls,
      companions,
      conversations,
      viewport_width: document.documentElement.clientWidth,
      content_width: document.documentElement.scrollWidth,
    };
  });
  assert.ok(narrowLayout.layer.top >= narrowLayout.stage.bottom - 1, "narrow AI rail must follow the table stage");
  assert.ok(narrowLayout.controls.top >= narrowLayout.layer.bottom - 1, "AI rail must not cover action controls");
  assert.equal(narrowLayout.companions.length, 4);
  assert.ok(narrowLayout.companions.every((box) => box.width > 0 && box.height > 0));
  assert.ok(narrowLayout.conversations.every((box) => box.top >= narrowLayout.stage.bottom - 1));
  assert.ok(narrowLayout.content_width <= narrowLayout.viewport_width + 1, "narrow layout must not overflow horizontally");
  await narrowPage.screenshot({ path: path.join(outputDirectory, "ai-answer-narrow.png"), fullPage: true });
  await narrowPage.setViewportSize({ width: 1360, height: 900 });

  const staleRequestId = "seat-a-stale-request";
  const latestRequestId = "seat-a-latest-request";
  const latestPrompt = '<img src=x onerror="window.__seatAiInjected=true"> 这段文本必须原样显示，不能成为 HTML';
  const latestAnswer = '<strong>仍然只是公开文本</strong>，不是可执行 HTML';
  const wrongSeatAnswer = "B 的 AI 不能回答 A 的请求";
  authority.store.record("AI_PROMPT_PUBLISHED", {
    request_id: staleRequestId,
    actor: "a",
    prompt: "A 的较旧公开问题",
  });
  authority.store.record("AI_PROMPT_PUBLISHED", {
    request_id: latestRequestId,
    actor: "a",
    prompt: latestPrompt,
  });
  authority.store.record("AI_PROMPT_PUBLISHED", {
    request_id: latestRequestId,
    actor: "a",
    prompt: "重复 request_id 不得替换首次接纳的 prompt",
  });
  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: staleRequestId,
    actor: "ai:a",
    message: "较旧请求的迟到回答不得取代较新的会话",
  });
  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: latestRequestId,
    actor: "ai:b",
    message: wrongSeatAnswer,
  });
  await waitForAll(
    `(state, expected) => {
      const latest = state.seat_ai_companions.find((entry) => entry.seat_id === "a")?.latest_conversation;
      return state.public_ai_events.some((event) => event.payload?.message === expected.marker)
        && latest?.request_id === expected.request_id
        && latest.status === "generating"
        && latest.prompt === expected.prompt
        && latest.answer === null;
    }`,
    { marker: wrongSeatAnswer, request_id: latestRequestId, prompt: latestPrompt },
  );
  for (const page of pages.values()) {
    const seat = page.locator('.seat-ai[data-seat="a"]');
    assert.equal(await seat.getAttribute("data-state"), "generating");
    assert.equal(await seat.locator('[data-role="prompt"]').textContent(), latestPrompt);
    assert.equal(await seat.locator("img").count(), 0, "prompt markup must remain text");
    assert.equal(await page.evaluate(() => window.__seatAiInjected === true), false);
  }

  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: latestRequestId,
    actor: "ai:a",
    message: latestAnswer,
  });
  await waitForAll(
    `(state, expected) => {
      const latest = state.seat_ai_companions.find((entry) => entry.seat_id === "a")?.latest_conversation;
      return latest?.request_id === expected.request_id
        && latest.status === "answered"
        && latest.prompt === expected.prompt
        && latest.answer === expected.answer;
    }`,
    { request_id: latestRequestId, prompt: latestPrompt, answer: latestAnswer },
  );
  for (const page of pages.values()) {
    const seat = page.locator('.seat-ai[data-seat="a"]');
    assert.equal(await seat.locator('[data-role="answer"]').textContent(), latestAnswer);
    assert.equal(await seat.locator("strong").count(), 1, "only the static AI name may be a strong element");
    assert.equal(await page.evaluate(() => window.__seatAiInjected === true), false);
  }

  const seatBRequestId = "seat-b-request";
  const seatBPrompt = "B 的公开问题必须只更新 B 的最近会话";
  const seatBAnswer = "B 的 Codex AI 公开回答";
  authority.store.record("AI_PROMPT_PUBLISHED", {
    request_id: seatBRequestId,
    actor: "b",
    prompt: seatBPrompt,
  });
  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: seatBRequestId,
    actor: "ai:a",
    message: "错席回答不能完成 B 的会话",
  });
  await waitForAll(
    `(state, expected) => {
      const latest = state.seat_ai_companions.find((entry) => entry.seat_id === "b")?.latest_conversation;
      return state.public_ai_events.some((event) => event.payload?.message === expected.marker)
        && latest?.request_id === expected.request_id
        && latest.status === "generating";
    }`,
    { marker: "错席回答不能完成 B 的会话", request_id: seatBRequestId },
  );
  authority.store.record("AI_ANSWER_PUBLISHED", {
    request_id: seatBRequestId,
    actor: "ai:b",
    message: seatBAnswer,
  });
  await waitForAll(
    `(state, expected) => {
      const latest = state.seat_ai_companions.find((entry) => entry.seat_id === "b")?.latest_conversation;
      return latest?.request_id === expected.request_id
        && latest.status === "answered"
        && latest.prompt === expected.prompt
        && latest.answer === expected.answer;
    }`,
    { request_id: seatBRequestId, prompt: seatBPrompt, answer: seatBAnswer },
  );
  await assertDesktopAiLayoutClear();

  return {
    seat_id: "a",
    request_id: promptResult.request_id,
    prompt_state_verified: "generating",
    answer_state_verified: "answered",
    unknown_actor_ignored: true,
    ordinary_event_ignored: true,
    orphan_answer_ignored: true,
    mismatched_answer_ignored: true,
    latest_request_preserved: true,
    duplicate_request_ignored: true,
    markup_rendered_as_text: true,
    second_seat_pairing_verified: "b",
    desktop_layout_clear: true,
  };
}

async function clickCurrentActor(selector) {
  const sample = await pageState("a");
  const actorId = sample.hand.actor_player_id;
  assert.ok(actorId, "active hand must have an actor");
  const actorPage = pages.get(actorId);
  const beforeRevision = sample.hand.revision;
  await actorPage.click(selector);
  await waitForRevision(beforeRevision + 1);
  await assertPublicStateParity();
}

async function resetFromA() {
  const before = await pageState("a");
  await pages.get("a").click("#resetTableButton");
  await waitForNewHand(before.hand.hand_id);
  await assertPrivateIsolation();
  await assertPublicStateParity();
}

async function completeCheckdown() {
  let steps = 0;
  while (true) {
    const state = await pageState("a");
    if (state.hand.status === "complete") break;
    assert.ok(steps++ < 24, "checkdown exceeded expected action count");
    const actorState = await pageState(state.hand.actor_player_id);
    if (actorState.controls.check) await clickCurrentActor("#checkButton");
    else if (actorState.controls.call) await clickCurrentActor("#callButton");
    else throw new Error("checkdown actor had neither check nor call");
  }
  const states = await allStates();
  for (const state of states) {
    assert.equal(state.hand.finish_reason, "showdown");
    assert.equal(state.hand.board.length, 5);
    assert.ok(state.hand.seats.every((seat) => Array.isArray(seat.hole_cards)));
    assert.equal(state.hand.seats.reduce((sum, seat) => sum + seat.stack, 0), 800);
  }
  await pages.get("a").screenshot({ path: path.join(outputDirectory, "checkdown-a.png"), fullPage: true });
  return { actions: steps, winner_ids: states[0].hand.settlement.winner_ids };
}

async function completeAllInShowdown() {
  const before = await pageState("a");
  const opener = before.hand.actor_player_id;
  const openerState = await pageState(opener);
  assert.equal(openerState.controls.all_in, true);
  await clickCurrentActor("#allInButton");
  let calls = 0;
  while (true) {
    const state = await pageState("a");
    if (state.hand.status === "complete") break;
    assert.ok(calls++ < 4, "all-in scenario exceeded expected call count");
    const actorState = await pageState(state.hand.actor_player_id);
    assert.equal(actorState.controls.call, true);
    await clickCurrentActor("#callButton");
  }
  const final = await pageState("a");
  assert.equal(final.hand.finish_reason, "showdown");
  assert.ok(final.hand.seats.every((seat) => seat.status === "all_in"));
  await pages.get(opener).screenshot({ path: path.join(outputDirectory, "all-in-showdown.png"), fullPage: true });
  return { opener, calls, winner_ids: final.hand.settlement.winner_ids };
}

async function completeRaiseFoldReveal() {
  const before = await pageState("a");
  const raiser = before.hand.actor_player_id;
  const raiserPage = pages.get(raiser);
  const raiserState = await pageState(raiser);
  const raiseAction = raiserState.hand.legal_actions.find((action) => action.type === "raise");
  assert.ok(raiseAction);
  await raiserPage.fill("#betAmount", String(raiseAction.min_to));
  await raiserPage.click("#betButton");
  await waitForRevision(before.hand.revision + 1);
  await assertPublicStateParity();

  let folds = 0;
  while (true) {
    const state = await pageState("a");
    if (state.hand.status === "complete") break;
    assert.ok(folds++ < 4, "raise/fold scenario exceeded expected folds");
    await clickCurrentActor("#foldButton");
  }
  const concealedStates = await allStates();
  const winnerId = concealedStates[0].hand.settlement.winner_ids[0];
  assert.equal(winnerId, raiser);
  for (const state of concealedStates.filter((entry) => entry.viewer.player_id !== winnerId)) {
    assert.equal(state.hand.seats.find((seat) => seat.id === winnerId).hole_cards, null);
  }

  const winnerPage = pages.get(winnerId);
  await winnerPage.waitForSelector("#revealButton:not([hidden])");
  const revisionBeforeReveal = concealedStates[0].hand.revision;
  await winnerPage.click("#revealButton");
  await waitForRevision(revisionBeforeReveal + 1);
  const revealedStates = await allStates();
  for (const state of revealedStates) {
    assert.equal(state.hand.seats.find((seat) => seat.id === winnerId).hole_cards.length, 2);
  }
  await winnerPage.screenshot({ path: path.join(outputDirectory, "raise-fold-reveal.png"), fullPage: true });
  return { raiser, folds, winner_id: winnerId };
}

try {
  for (const playerId of playerIds) {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push({ player_id: playerId, type: "console", text: message.text() });
    });
    page.on("pageerror", (error) => errors.push({ player_id: playerId, type: "page", text: String(error) }));
    await page.goto(playerUrl(playerId), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      if (typeof window.render_game_to_text !== "function") return false;
      return JSON.parse(window.render_game_to_text()).connection === "online";
    });
    pages.set(playerId, page);
  }

  await assertPrivateIsolation();
  await assertPublicStateParity();
  await assertSeatAiCompanionsVisible();
  const publicAi = await verifyPublicAiConversation();
  const checkdown = await completeCheckdown();
  await resetFromA();
  const allIn = await completeAllInShowdown();
  await resetFromA();
  const reveal = await completeRaiseFoldReveal();
  const renderedEventCount = await assertFullEventFeedRendered();
  assert.deepEqual(errors, []);

  const result = {
    origin,
    players: playerIds,
    public_ai: publicAi,
    checkdown,
    all_in: allIn,
    raise_fold_reveal: reveal,
    event_feed: {
      rendered_events: renderedEventCount,
      uncapped_history_verified: true,
    },
    console_errors: errors,
  };
  fs.writeFileSync(path.join(outputDirectory, "result.json"), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await authority.stop();
}
