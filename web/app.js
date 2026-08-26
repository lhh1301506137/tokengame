"use strict";

const search = new URLSearchParams(window.location.search);
const identity = {
  playerId: (search.get("player") || "").toLowerCase(),
  playerToken: search.get("token") || "",
};

const ui = {
  state: null,
  connected: false,
  busy: false,
  nowOffset: 0,
  eventSource: null,
};

const elements = {
  canvas: document.querySelector("#tableCanvas"),
  connectionBadge: document.querySelector("#connectionBadge"),
  connectionLabel: document.querySelector("#connectionLabel"),
  viewerBadge: document.querySelector("#viewerBadge"),
  viewerAvatar: document.querySelector("#viewerAvatar"),
  viewerLabel: document.querySelector("#viewerLabel"),
  handLabel: document.querySelector("#handLabel"),
  streetLabel: document.querySelector("#streetLabel"),
  potLabel: document.querySelector("#potLabel"),
  actorLabel: document.querySelector("#actorLabel"),
  timerMetric: document.querySelector("#timerMetric"),
  actionTimer: document.querySelector("#actionTimer"),
  sequenceLabel: document.querySelector("#sequenceLabel"),
  revisionLabel: document.querySelector("#revisionLabel"),
  currentBetLabel: document.querySelector("#currentBetLabel"),
  privacyNote: document.querySelector("#privacyNote"),
  actionStatus: document.querySelector("#actionStatus"),
  legalHint: document.querySelector("#legalHint"),
  foldButton: document.querySelector("#foldButton"),
  checkButton: document.querySelector("#checkButton"),
  callButton: document.querySelector("#callButton"),
  betAmount: document.querySelector("#betAmount"),
  betButton: document.querySelector("#betButton"),
  allInButton: document.querySelector("#allInButton"),
  revealButton: document.querySelector("#revealButton"),
  resetTableButton: document.querySelector("#resetTableButton"),
  controlNote: document.querySelector("#controlNote"),
  phasePrompt: document.querySelector("#phasePrompt"),
  phaseModel: document.querySelector("#phaseModel"),
  phaseAnswer: document.querySelector("#phaseAnswer"),
  eventList: document.querySelector("#eventList"),
  eventCount: document.querySelector("#eventCount"),
  emptyEvents: document.querySelector("#emptyEvents"),
  seatAi: Object.fromEntries(["a", "b", "c", "d"].map(function cacheSeatAi(seatId) {
    const root = document.querySelector('.seat-ai[data-seat="' + seatId + '"]');
    return [seatId, {
      root,
      status: root.querySelector('[data-role="status"]'),
      conversation: root.querySelector('[data-role="conversation"]'),
      prompt: root.querySelector('[data-role="prompt"]'),
      answerBubble: root.querySelector('[data-role="answer-bubble"]'),
      answer: root.querySelector('[data-role="answer"]'),
    }];
  })),
};

const SEAT_IDS = ["a", "b", "c", "d"];

const STREET_LABELS = {
  preflop: "翻牌前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
};

const ACTION_LABELS = {
  fold: "弃牌",
  check: "过牌",
  call: "跟注",
  bet: "下注",
  raise: "加注",
  all_in: "全押",
};

function effectiveNow() {
  return Date.now() + ui.nowOffset;
}

function credentialUrl(path) {
  const url = new URL(path, window.location.origin);
  if (identity.playerId) url.searchParams.set("player_id", identity.playerId);
  if (identity.playerToken) url.searchParams.set("player_token", identity.playerToken);
  return url.pathname + url.search;
}

async function api(path, options) {
  const response = await fetch(path, Object.assign({}, options || {}, {
    headers: Object.assign({ "content-type": "application/json" }, options?.headers || {}),
  }));
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("服务返回了无效 JSON");
  }
  if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
  return body;
}

async function refreshState() {
  ui.state = await api(credentialUrl("/api/table/state"));
  ui.connected = true;
  render();
}

function connectEvents() {
  if (ui.eventSource) ui.eventSource.close();
  const source = new EventSource(credentialUrl("/api/table/events/stream"));
  ui.eventSource = source;
  source.onopen = function onOpen() {
    ui.connected = true;
    renderConnection();
  };
  source.onmessage = async function onMessage(event) {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "SNAPSHOT") {
        ui.state = message.state;
        render();
      } else if (message.type === "EVENT") {
        await refreshState();
      }
    } catch (error) {
      showNote("事件同步失败：" + error.message, "error");
    }
  };
  source.onerror = function onError() {
    ui.connected = false;
    renderConnection();
  };
}

function handState() {
  return ui.state?.hand || null;
}

function viewerState() {
  return ui.state?.viewer || { role: "observer", player_id: null };
}

function showNote(message, state) {
  elements.controlNote.textContent = message;
  elements.controlNote.dataset.state = state || "neutral";
}

function formatTokens(amount) {
  return Number.isFinite(Number(amount)) ? Number(amount).toLocaleString("zh-CN") : "—";
}

function formatTime(timestamp) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatRemaining(deadline) {
  const remaining = deadline ? Math.max(0, deadline - effectiveNow()) : 0;
  const seconds = Math.ceil(remaining / 1_000);
  return "00:" + String(seconds).padStart(2, "0");
}

function renderConnection() {
  elements.connectionBadge.dataset.state = ui.connected ? "online" : "offline";
  elements.connectionLabel.textContent = ui.connected ? "权威流在线" : "权威流断开";
}

function renderIdentity() {
  const viewer = viewerState();
  const hand = handState();
  const isPlayer = viewer.role === "player";
  const visiblePlayers = (hand?.seats || [])
    .filter(function hasVisibleCards(seat) { return Array.isArray(seat.hole_cards); })
    .map(function playerId(seat) { return seat.id; });
  const publiclyVisible = visiblePlayers.filter(function isOther(playerId) {
    return playerId !== viewer.player_id;
  });
  elements.viewerBadge.dataset.role = viewer.role;
  elements.viewerAvatar.textContent = isPlayer ? viewer.player_id.toUpperCase() : "·";
  elements.viewerLabel.textContent = isPlayer ? ("玩家 " + viewer.player_id.toUpperCase()) : "公共观察";
  if (isPlayer && publiclyVisible.length > 0) {
    elements.privacyNote.textContent = "当前响应包含你的底牌，以及已按规则公开的玩家 "
      + publiclyVisible.map(function upper(id) { return id.toUpperCase(); }).join("、") + "；其余隐藏牌为 null。";
  } else if (isPlayer) {
    elements.privacyNote.textContent = "当前响应只包含 " + viewer.player_id.toUpperCase() + " 的底牌；其他隐藏牌为 null。";
  } else if (visiblePlayers.length > 0) {
    elements.privacyNote.textContent = "公共观察仅显示已按规则公开的玩家 "
      + visiblePlayers.map(function upper(id) { return id.toUpperCase(); }).join("、") + " 的底牌。";
  } else {
    elements.privacyNote.textContent = "公共观察不包含任何隐藏底牌，也不能提交动作。";
  }
}

function renderHeading() {
  const hand = handState();
  if (!hand) return;
  elements.handLabel.textContent = hand.hand_id + " · REV " + hand.revision;
  elements.streetLabel.textContent = hand.status === "complete"
    ? (hand.finish_reason === "showdown" ? "摊牌完成" : "弃牌结束")
    : (STREET_LABELS[hand.street] || hand.street);
  elements.potLabel.textContent = formatTokens(hand.pot_total);
  elements.actorLabel.textContent = hand.actor_player_id ? hand.actor_player_id.toUpperCase() : "—";
  elements.revisionLabel.textContent = String(hand.revision);
  elements.currentBetLabel.textContent = formatTokens(hand.current_bet);
  const activeTimer = hand.status === "active" && Boolean(hand.actor_player_id);
  elements.timerMetric.dataset.state = activeTimer ? "active" : "idle";
  elements.actionTimer.textContent = activeTimer ? formatRemaining(hand.action_deadline_at) : "--:--";
}

function legalAction(type) {
  return (handState()?.legal_actions || []).find(function findAction(action) {
    return action.type === type;
  });
}

function setActionButton(button, available) {
  button.disabled = ui.busy || !available;
  button.dataset.available = String(Boolean(available));
}

function renderActions() {
  const hand = handState();
  const viewer = viewerState();
  const isPlayer = viewer.role === "player";
  const isTurn = isPlayer && hand?.status === "active" && hand.actor_player_id === viewer.player_id;
  const fold = isTurn && legalAction("fold");
  const check = isTurn && legalAction("check");
  const call = isTurn && legalAction("call");
  const bet = isTurn && (legalAction("bet") || legalAction("raise"));
  const allIn = isTurn && legalAction("all_in");

  setActionButton(elements.foldButton, fold);
  setActionButton(elements.checkButton, check);
  setActionButton(elements.callButton, call);
  setActionButton(elements.betButton, bet);
  setActionButton(elements.allInButton, allIn);
  elements.betAmount.disabled = ui.busy || !bet;

  elements.callButton.textContent = call
    ? ("跟注 · " + formatTokens(call.amount))
    : "跟注";
  elements.betButton.textContent = bet?.type === "raise" ? "加注" : "下注";
  elements.allInButton.textContent = allIn
    ? ("ALL IN · " + formatTokens(allIn.to))
    : "ALL IN";
  if (bet) {
    elements.betAmount.min = String(bet.min_to);
    elements.betAmount.max = String(bet.max_to);
    if (document.activeElement !== elements.betAmount) {
      const current = Number(elements.betAmount.value);
      if (!Number.isSafeInteger(current) || current < bet.min_to || current > bet.max_to) {
        elements.betAmount.value = String(bet.min_to);
      }
    }
  } else {
    elements.betAmount.removeAttribute("min");
    elements.betAmount.removeAttribute("max");
    elements.betAmount.value = "";
  }

  if (!isPlayer) {
    elements.actionStatus.textContent = "观察模式不能提交牌局动作";
    elements.legalHint.textContent = "请使用服务启动时输出的 A/B/C/D 专属链接。";
  } else if (hand?.status === "complete") {
    const winners = hand.settlement?.winner_ids?.map(function upper(id) { return id.toUpperCase(); }).join("、") || "—";
    elements.actionStatus.textContent = hand.finish_reason === "showdown" ? "本手牌已完成摊牌" : "本手牌因弃牌结束";
    elements.legalHint.textContent = "赢家：" + winners + " · 结算由服务端完成";
  } else if (isTurn) {
    elements.actionStatus.textContent = "轮到你行动";
    elements.legalHint.textContent = "服务端给出的合法动作已启用；状态版本 " + hand.revision;
  } else {
    elements.actionStatus.textContent = "等待玩家 " + (hand?.actor_player_id?.toUpperCase() || "—") + " 行动";
    elements.legalHint.textContent = "客户端不会预测或提前应用其他玩家动作。";
  }

  const alreadyRevealed = (ui.state?.events || []).some(function wasRevealed(event) {
    return event.type === "CARDS_VOLUNTARILY_REVEALED"
      && event.payload?.player_id === viewer.player_id
      && event.payload?.hand_id === hand?.hand_id;
  });
  const canReveal = isPlayer
    && hand?.status === "complete"
    && hand.finish_reason === "all_others_folded"
    && hand.settlement?.winner_ids?.includes(viewer.player_id)
    && !alreadyRevealed;
  elements.revealButton.hidden = !canReveal;
  elements.revealButton.disabled = ui.busy || !canReveal;
  elements.resetTableButton.hidden = viewer.player_id !== "a";
  elements.resetTableButton.disabled = ui.busy || viewer.player_id !== "a" || hand?.status !== "complete";
}

function aiEvents() {
  return ui.state?.ai_channel?.events || [];
}

function seatIdFromPlayerActor(actor) {
  return typeof actor === "string" && SEAT_IDS.includes(actor) ? actor : null;
}

function seatIdFromAiActor(actor) {
  if (typeof actor !== "string" || !actor.startsWith("ai:")) return null;
  const seatId = actor.slice(3);
  return SEAT_IDS.includes(seatId) ? seatId : null;
}

function seatAiConversations() {
  const requests = new Map();
  const latestBySeat = new Map();

  for (const event of aiEvents()) {
    const payload = event?.payload || {};
    const requestId = typeof payload.request_id === "string" && payload.request_id.trim()
      ? payload.request_id
      : null;
    if (!requestId) continue;

    if (event.type === "AI_PROMPT_PUBLISHED") {
      const seatId = seatIdFromPlayerActor(payload.actor);
      const prompt = typeof payload.prompt === "string" && payload.prompt.trim()
        ? payload.prompt
        : null;
      if (!seatId || !prompt) continue;
      const key = seatId + "\u0000" + requestId;
      if (requests.has(key)) continue;
      const conversation = {
        seat_id: seatId,
        companion: "Codex AI",
        request_id: requestId,
        status: "generating",
        prompt,
        answer: null,
        prompt_seq: Number.isSafeInteger(event.seq) ? event.seq : null,
        answer_seq: null,
      };
      requests.set(key, conversation);
      const previous = latestBySeat.get(seatId);
      const eventSequence = conversation.prompt_seq ?? Number.MAX_SAFE_INTEGER;
      const previousSequence = previous?.prompt_seq ?? -1;
      if (!previous || eventSequence >= previousSequence) latestBySeat.set(seatId, conversation);
      continue;
    }

    if (event.type === "AI_ANSWER_PUBLISHED") {
      const seatId = seatIdFromAiActor(payload.actor);
      const message = typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : null;
      if (!seatId || !message) continue;
      const conversation = requests.get(seatId + "\u0000" + requestId);
      if (!conversation || conversation.answer !== null) continue;
      conversation.answer = message;
      conversation.status = "answered";
      conversation.answer_seq = Number.isSafeInteger(event.seq) ? event.seq : null;
    }
  }

  return SEAT_IDS.map(function projectSeat(seatId) {
    return {
      seat_id: seatId,
      companion: "Codex AI",
      latest_conversation: latestBySeat.get(seatId) || null,
    };
  });
}

function renderSeatAiConversations() {
  for (const seatState of seatAiConversations()) {
    const seatElements = elements.seatAi[seatState.seat_id];
    const latest = seatState.latest_conversation;
    const state = latest?.status || "idle";
    seatElements.root.dataset.state = state;
    seatElements.status.textContent = state === "generating"
      ? "生成中"
      : state === "answered" ? "已公开" : "就绪";
    seatElements.conversation.hidden = !latest;
    seatElements.conversation.setAttribute("aria-busy", String(state === "generating"));
    seatElements.prompt.textContent = latest?.prompt || "";
    seatElements.answerBubble.dataset.state = state;
    seatElements.answer.textContent = state === "generating"
      ? "正在生成公开回答…"
      : (latest?.answer || "");
  }
}

function renderAiPhases() {
  const latest = seatAiConversations()
    .map(function latestConversation(seat) { return seat.latest_conversation; })
    .filter(Boolean)
    .sort(function newestPrompt(left, right) {
      return (left.prompt_seq ?? -1) - (right.prompt_seq ?? -1);
    })
    .at(-1) || null;
  const hasPrompt = Boolean(latest);
  const hasAnswer = latest?.status === "answered";
  elements.phasePrompt.dataset.state = hasPrompt ? "done" : "active";
  elements.phaseModel.dataset.state = hasAnswer ? "done" : hasPrompt ? "active" : "idle";
  elements.phaseAnswer.dataset.state = hasAnswer ? "done" : "idle";
}

function cardText(card) {
  if (!card) return "??";
  const suits = { c: "♣", d: "♦", h: "♥", s: "♠" };
  const rank = card[0] === "T" ? "10" : card[0];
  return rank + suits[card[1]];
}

function formatCardList(cards) {
  return Array.isArray(cards) ? cards.map(cardText).join(" ") : "";
}

function eventDetail(entry) {
  const event = entry.event;
  const payload = event.payload || {};
  if (event.type === "HAND_STARTED") return "新手牌 · 庄位 " + payload.dealer_player_id.toUpperCase();
  if (event.type === "HOLE_CARDS_DEALT") return "已向四个隔离玩家投影发放底牌";
  if (event.type === "BLIND_POSTED") return payload.player_id.toUpperCase() + " · " + payload.blind_type + " · " + payload.amount;
  if (event.type === "ACTION_REQUIRED") return "轮到 " + payload.player_id.toUpperCase() + " · " + (STREET_LABELS[payload.street] || payload.street);
  if (event.type === "PLAYER_ACTION") {
    const prefix = payload.automatic ? "超时自动 · " : "";
    const paid = payload.paid ? (" · 投入 " + payload.paid) : "";
    return prefix + payload.player_id.toUpperCase() + " · " + (ACTION_LABELS[payload.action] || payload.action) + paid;
  }
  if (event.type === "STREET_DEALT") return (STREET_LABELS[payload.street] || payload.street) + " · " + formatCardList(payload.board);
  if (event.type === "HAND_COMPLETED") return "结算完成 · 赢家 " + (payload.winner_ids || []).map(function upper(id) { return id.toUpperCase(); }).join("、");
  if (event.type === "CARDS_VOLUNTARILY_REVEALED") return payload.player_id.toUpperCase() + " 自愿亮牌 · " + formatCardList(payload.hole_cards);
  if (event.type === "TABLE_RESET") return "测试桌开始下一手牌";
  if (event.type === "AI_PROMPT_PUBLISHED") {
    const seatId = seatIdFromPlayerActor(payload.actor);
    const source = seatId ? ("玩家 " + seatId.toUpperCase()) : (payload.actor || "未知来源");
    return source + " 公开提问 · “" + payload.prompt + "”";
  }
  if (event.type === "AI_ANSWER_PUBLISHED") {
    const seatId = seatIdFromAiActor(payload.actor);
    const source = seatId ? (seatId.toUpperCase() + " 的 Codex AI") : (payload.actor || "未知来源");
    return source + " 回答 · “" + payload.message + "”";
  }
  return JSON.stringify(payload);
}

function eventKind(entry) {
  const type = entry.event.type;
  if (entry.channel === "ai") return "ai";
  if (type === "PLAYER_ACTION") return "action";
  if (type === "HAND_COMPLETED") return "complete";
  if (type === "STREET_DEALT") return "street";
  return "system";
}

function mergedEvents() {
  const table = (ui.state?.events || []).map(function mapTable(event) {
    return { channel: "table", event };
  });
  const ai = aiEvents().map(function mapAi(event) {
    return { channel: "ai", event };
  });
  return table.concat(ai).sort(function sortEvents(left, right) {
    if (left.event.server_time !== right.event.server_time) {
      return left.event.server_time - right.event.server_time;
    }
    if (left.channel !== right.channel) return left.channel.localeCompare(right.channel);
    return left.event.seq - right.event.seq;
  });
}

function renderEvents() {
  const events = mergedEvents();
  const fragment = document.createDocumentFragment();
  for (const entry of events.slice().reverse()) {
    const item = document.createElement("li");
    item.className = "event-item";
    item.dataset.kind = eventKind(entry);

    const sequence = document.createElement("span");
    sequence.className = "event-seq";
    sequence.textContent = entry.channel === "ai"
      ? ("AI·" + String(entry.event.seq).padStart(2, "0"))
      : ("#" + String(entry.event.seq).padStart(3, "0"));

    const content = document.createElement("div");
    const type = document.createElement("strong");
    type.className = "event-type";
    type.textContent = entry.event.type;
    const detail = document.createElement("p");
    detail.className = "event-detail";
    detail.textContent = eventDetail(entry);
    const time = document.createElement("time");
    time.className = "event-time";
    time.textContent = formatTime(entry.event.server_time);
    content.append(type, detail, time);
    item.append(sequence, content);
    fragment.append(item);
  }
  elements.eventList.replaceChildren(fragment);
  elements.eventCount.textContent = String(events.length);
  elements.emptyEvents.dataset.visible = String(events.length === 0);
  elements.sequenceLabel.textContent = "SEQ " + String(ui.state?.events?.at(-1)?.seq || 0);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawCard(context, x, y, width, height, card, hidden, dimmed) {
  roundedRect(context, x, y, width, height, Math.max(5, width * 0.12));
  if (hidden) {
    context.fillStyle = dimmed ? "#c9cec8" : "#173e34";
    context.fill();
    context.strokeStyle = dimmed ? "#afb5af" : "#376a5c";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = dimmed ? "#8b928b" : "#bfe2d7";
    context.font = "700 " + Math.max(8, width * 0.2) + "px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("TG", x + width / 2, y + height / 2);
    return;
  }
  context.fillStyle = dimmed ? "#ecece8" : "#fffefa";
  context.fill();
  context.strokeStyle = dimmed ? "#d6d6d0" : "#c7c9c2";
  context.lineWidth = 1;
  context.stroke();
  const isRed = card?.[1] === "d" || card?.[1] === "h";
  context.fillStyle = dimmed ? "#8d8e88" : (isRed ? "#cf4138" : "#171b18");
  context.font = "750 " + Math.max(11, width * 0.31) + "px Segoe UI, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  const label = cardText(card);
  context.fillText(label, x + width * 0.14, y + height * 0.09);
  context.font = "650 " + Math.max(10, width * 0.25) + "px Segoe UI, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText(label.slice(-1), x + width * 0.86, y + height * 0.91);
}

function drawBoardSlot(context, x, y, width, height, card) {
  if (card) {
    drawCard(context, x, y, width, height, card, false, false);
    return;
  }
  roundedRect(context, x, y, width, height, Math.max(5, width * 0.12));
  context.fillStyle = "rgba(255, 255, 252, 0.34)";
  context.fill();
  context.save();
  context.setLineDash([4, 4]);
  context.strokeStyle = "rgba(42, 82, 67, 0.22)";
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function drawSeat(context, seat, x, y, width, height) {
  const hand = handState();
  const viewer = viewerState();
  const isViewer = viewer.player_id === seat.id;
  const isActor = hand.actor_player_id === seat.id && hand.status === "active";
  const isFolded = seat.status === "folded";
  roundedRect(context, x - width / 2, y - height / 2, width, height, 14);
  context.fillStyle = isViewer ? "#f2f7f3" : "#fdfcf8";
  context.fill();
  context.strokeStyle = isActor ? "#e95f43" : (isViewer ? "#32705d" : "#d8d9d2");
  context.lineWidth = isActor ? 2.5 : 1;
  context.stroke();

  context.beginPath();
  context.arc(x - width / 2 + 25, y, 16, 0, Math.PI * 2);
  context.fillStyle = isFolded ? "#d5d7d2" : (isViewer ? "#174f40" : "#272c28");
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "750 12px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(seat.id.toUpperCase(), x - width / 2 + 25, y);

  context.textAlign = "left";
  context.fillStyle = isFolded ? "#90948f" : "#1d211e";
  context.font = "700 11px Segoe UI, sans-serif";
  context.fillText("玩家 " + seat.id.toUpperCase(), x - width / 2 + 49, y - 10);
  context.fillStyle = "#697069";
  context.font = "600 10px Segoe UI, sans-serif";
  const status = seat.status === "all_in" ? "ALL IN" : (isFolded ? "已弃牌" : ("筹码 " + formatTokens(seat.stack)));
  context.fillText(status, x - width / 2 + 49, y + 9);

  const badges = [];
  if (hand.dealer_player_id === seat.id) badges.push("D");
  if (hand.small_blind_player_id === seat.id) badges.push("SB");
  if (hand.big_blind_player_id === seat.id) badges.push("BB");
  if (badges.length) {
    context.textAlign = "right";
    context.fillStyle = "#8a6b25";
    context.font = "750 8px Segoe UI, sans-serif";
    context.fillText(badges.join(" · "), x + width / 2 - 8, y - height / 2 + 12);
  }

  if (seat.round_commitment > 0) {
    context.textAlign = "center";
    context.fillStyle = "#7e5424";
    context.font = "700 9px Segoe UI, sans-serif";
    context.fillText("下注 " + seat.round_commitment, x, y + height / 2 + 13);
  }
}

function drawTable() {
  const canvas = elements.canvas;
  const frame = canvas.parentElement;
  const width = Math.max(320, frame.clientWidth);
  const height = Math.max(390, frame.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f3f1ea";
  context.fillRect(0, 0, width, height);

  const tableWidth = Math.min(width * 0.75, width - 190);
  const tableHeight = Math.min(height * 0.58, tableWidth * 0.55);
  const centerX = width / 2;
  const centerY = height / 2;
  const gradient = context.createLinearGradient(centerX - tableWidth / 2, centerY, centerX + tableWidth / 2, centerY);
  gradient.addColorStop(0, "#dce9e1");
  gradient.addColorStop(0.5, "#e8f0e9");
  gradient.addColorStop(1, "#d6e4dc");
  context.beginPath();
  context.ellipse(centerX, centerY, tableWidth / 2, tableHeight / 2, 0, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = "#b2c6ba";
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.ellipse(centerX, centerY, tableWidth / 2 - 10, tableHeight / 2 - 10, 0, 0, Math.PI * 2);
  context.strokeStyle = "rgba(45, 93, 75, 0.15)";
  context.lineWidth = 1;
  context.stroke();

  const hand = handState();
  if (!hand) {
    context.fillStyle = "#667069";
    context.font = "650 13px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.fillText("正在读取权威牌局", centerX, centerY);
    return;
  }

  context.fillStyle = "#4b5c53";
  context.font = "650 10px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.fillText("底池", centerX, centerY - 53);
  context.fillStyle = "#173e34";
  context.font = "750 18px Segoe UI, sans-serif";
  context.fillText(formatTokens(hand.pot_total) + " TOKENS", centerX, centerY - 32);

  const cardWidth = Math.max(34, Math.min(52, width * 0.055));
  const cardHeight = cardWidth * 1.38;
  const gap = Math.max(5, cardWidth * 0.12);
  const boardWidth = cardWidth * 5 + gap * 4;
  const startX = centerX - boardWidth / 2;
  for (let index = 0; index < 5; index += 1) {
    const card = hand.board[index] || null;
    drawBoardSlot(context, startX + index * (cardWidth + gap), centerY - cardHeight / 2 + 12, cardWidth, cardHeight, card);
  }

  const seatWidth = Math.max(108, Math.min(144, width * 0.16));
  const seatHeight = 62;
  const positions = {
    a: { x: centerX, y: height - 48, cardsX: centerX - cardWidth - 3, cardsY: height - 48 - seatHeight / 2 - cardHeight - 10 },
    b: { x: width - seatWidth / 2 - 10, y: centerY, cardsX: width - seatWidth - cardWidth * 2 - 28, cardsY: centerY - cardHeight / 2 },
    c: { x: centerX, y: 48, cardsX: centerX - cardWidth - 3, cardsY: 48 + seatHeight / 2 + 9 },
    d: { x: seatWidth / 2 + 10, y: centerY, cardsX: seatWidth + 18, cardsY: centerY - cardHeight / 2 },
  };
  for (const seat of hand.seats) {
    const position = positions[seat.id];
    drawSeat(context, seat, position.x, position.y, seatWidth, seatHeight);
    const cards = seat.hole_cards;
    const shouldDrawBacks = cards === null && seat.status !== "folded";
    if (Array.isArray(cards) || shouldDrawBacks) {
      for (let index = 0; index < 2; index += 1) {
        drawCard(
          context,
          position.cardsX + index * (cardWidth + 6),
          position.cardsY,
          cardWidth,
          cardHeight,
          Array.isArray(cards) ? cards[index] : null,
          !Array.isArray(cards),
          seat.status === "folded",
        );
      }
    }
  }
}

function render() {
  renderConnection();
  renderIdentity();
  renderHeading();
  renderActions();
  renderAiPhases();
  renderSeatAiConversations();
  renderEvents();
  drawTable();
}

function nextId(prefix) {
  const suffix = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : (Date.now() + "-" + Math.random().toString(16).slice(2));
  return prefix + ":" + suffix;
}

async function postPlayer(path, body, successMessage) {
  if (viewerState().role !== "player" || !identity.playerId || !identity.playerToken) {
    showNote("当前不是可认证的玩家视图。", "error");
    return;
  }
  ui.busy = true;
  renderActions();
  try {
    await api(path, {
      method: "POST",
      body: JSON.stringify(Object.assign({}, body, {
        player_id: identity.playerId,
        player_token: identity.playerToken,
      })),
    });
    await refreshState();
    showNote(successMessage, "ok");
  } catch (error) {
    showNote("动作被拒绝：" + error.message, "error");
    await refreshState().catch(function ignoreRefresh() {});
  } finally {
    ui.busy = false;
    renderActions();
  }
}

function submitAction(type, amount) {
  const hand = handState();
  if (!hand) return;
  postPlayer("/api/table/actions", {
    action: type,
    amount: amount === undefined ? null : amount,
    expected_revision: hand.revision,
    idempotency_key: nextId("ui-action"),
  }, (ACTION_LABELS[type] || type) + "已由权威服务接受。");
}

elements.foldButton.addEventListener("click", function onFold() { submitAction("fold"); });
elements.checkButton.addEventListener("click", function onCheck() { submitAction("check"); });
elements.callButton.addEventListener("click", function onCall() { submitAction("call"); });
elements.betButton.addEventListener("click", function onBet() {
  const action = legalAction("bet") || legalAction("raise");
  const amount = Number(elements.betAmount.value);
  if (!action || !Number.isSafeInteger(amount) || amount < action.min_to || amount > action.max_to) {
    showNote("请输入 " + (action?.min_to || "—") + " 到 " + (action?.max_to || "—") + " 之间的整数。", "error");
    return;
  }
  submitAction(action.type, amount);
});
elements.allInButton.addEventListener("click", function onAllIn() { submitAction("all_in"); });
elements.revealButton.addEventListener("click", function onReveal() {
  postPlayer("/api/table/reveal", {
    idempotency_key: nextId("ui-reveal"),
  }, "你的底牌已作为自愿亮牌事件公开。");
});
elements.resetTableButton.addEventListener("click", function onReset() {
  postPlayer("/api/table/reset", {
    idempotency_key: nextId("ui-reset"),
  }, "新的固定测试手牌已开始。");
});

window.addEventListener("resize", drawTable);
window.addEventListener("keydown", async function onKey(event) {
  if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }
});

window.render_game_to_text = function renderGameToText() {
  const hand = handState();
  return JSON.stringify({
    contract: ui.state?.contract || null,
    coordinate_system: "Canvas origin is top-left; x increases right, y increases down. Seats: A bottom, B right, C top, D left.",
    connection: ui.connected ? "online" : "offline",
    viewer: viewerState(),
    table: ui.state?.table || null,
    hand,
    seat_ai_companions: seatAiConversations(),
    public_ai_events: aiEvents().slice(-5),
    recent_table_events: (ui.state?.events || []).slice(-12),
    controls: {
      fold: !elements.foldButton.disabled,
      check: !elements.checkButton.disabled,
      call: !elements.callButton.disabled,
      bet_or_raise: !elements.betButton.disabled,
      all_in: !elements.allInButton.disabled,
      reveal: !elements.revealButton.hidden && !elements.revealButton.disabled,
      reset_table: !elements.resetTableButton.hidden && !elements.resetTableButton.disabled,
      fullscreen_key: "f",
    },
  });
};

window.advanceTime = function advanceTime(milliseconds) {
  ui.nowOffset += Number(milliseconds) || 0;
  renderHeading();
  drawTable();
  return window.render_game_to_text();
};

setInterval(function updateClock() {
  renderHeading();
  drawTable();
}, 250);

render();
refreshState()
  .then(connectEvents)
  .catch(function onInitialError(error) {
    ui.connected = false;
    renderConnection();
    showNote("无法读取权威牌局：" + error.message, "error");
    connectEvents();
  });
