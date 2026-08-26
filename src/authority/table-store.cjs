"use strict";

const crypto = require("node:crypto");
const { ProbeError } = require("./event-store.cjs");
const { HoldemHand, shuffledDeck } = require("../game/holdem.cjs");

const DEFAULT_SEATS = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
  { id: "d", label: "D" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requiredString(value, field, maxLength = 512) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProbeError(`missing_${field}`, 400);
  }
  if (value.length > maxLength) {
    throw new ProbeError(`${field}_too_long`, 400, { max_length: maxLength });
  }
  return value;
}

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

class TableStore {
  constructor({
    now = () => Date.now(),
    idFactory = () => crypto.randomUUID(),
    tokenFactory = () => crypto.randomBytes(24).toString("base64url"),
    deckFactory = () => shuffledDeck(),
    playerTokens = undefined,
    startingStack = 200,
    smallBlind = 1,
    bigBlind = 2,
    actionTimeoutMs = 30_000,
    dealerIndex = 0,
  } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.deckFactory = deckFactory;
    this.startingStack = Number(startingStack);
    this.smallBlind = Number(smallBlind);
    this.bigBlind = Number(bigBlind);
    this.actionTimeoutMs = Number(actionTimeoutMs);
    this.nextDealerIndex = Number(dealerIndex);
    this.listeners = new Set();
    this.idempotency = new Map();
    this.events = [];
    this.nextSequence = 1;
    this.handCounter = 0;
    this.playerTokens = new Map(DEFAULT_SEATS.map((seat) => [
      seat.id,
      playerTokens?.[seat.id] || tokenFactory(),
    ]));
    this.startHand();
  }

  startHand() {
    this.handCounter += 1;
    this.hand = new HoldemHand({
      id: `hand-${this.handCounter}-${this.idFactory()}`,
      tableId: "fixed-table-1",
      seats: DEFAULT_SEATS.map((seat) => ({ ...seat, stack: this.startingStack })),
      dealerIndex: this.nextDealerIndex,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      actionTimeoutMs: this.actionTimeoutMs,
      deck: this.deckFactory(),
      now: this.now,
    });
    this.nextDealerIndex = (this.nextDealerIndex + 1) % DEFAULT_SEATS.length;
    this.flushDomainEvents();
    return this.hand;
  }

  resetTable(input = {}) {
    const playerId = this.requirePlayer(input.player_id, input.player_token);
    if (playerId !== "a") throw new ProbeError("table_reset_not_allowed", 403);
    const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key");
    // A successful reset changes the current hand id. Keep the fingerprint tied
    // to the logical request so a network retry can still replay that success.
    const fingerprint = JSON.stringify({ playerId, operation: "reset_table" });
    const replay = this.lookupIdempotency(`reset:${idempotencyKey}`, fingerprint);
    if (replay) return { ...clone(replay), replay: true };
    if (this.hand.status !== "complete") throw new ProbeError("hand_not_complete", 409);

    const previousHandId = this.hand.id;
    this.record("TABLE_RESET", { previous_hand_id: previousHandId, requested_by: playerId });
    this.startHand();
    const result = {
      accepted: true,
      replay: false,
      previous_hand_id: previousHandId,
      hand_id: this.hand.id,
      revision: this.hand.revision,
    };
    this.storeIdempotency(`reset:${idempotencyKey}`, fingerprint, result);
    return clone(result);
  }

  requirePlayer(playerIdValue, tokenValue) {
    const playerId = requiredString(playerIdValue, "player_id", 32).toLowerCase();
    const playerToken = requiredString(tokenValue, "player_token", 256);
    const expected = this.playerTokens.get(playerId);
    if (!expected || !sameSecret(playerToken, expected)) {
      throw new ProbeError("player_token_rejected", 403);
    }
    return playerId;
  }

  resolveViewer(playerIdValue, tokenValue) {
    const hasPlayer = typeof playerIdValue === "string" && playerIdValue !== "";
    const hasToken = typeof tokenValue === "string" && tokenValue !== "";
    if (!hasPlayer && !hasToken) return { role: "observer", player_id: null };
    if (!hasPlayer || !hasToken) throw new ProbeError("player_credentials_incomplete", 403);
    const playerId = this.requirePlayer(playerIdValue, tokenValue);
    return { role: "player", player_id: playerId };
  }

  playerCredentials() {
    return DEFAULT_SEATS.map((seat) => ({
      player_id: seat.id,
      player_token: this.playerTokens.get(seat.id),
    }));
  }

  submitAction(input = {}) {
    const playerId = this.requirePlayer(input.player_id, input.player_token);
    const action = requiredString(input.action, "action", 32).toLowerCase();
    const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key");
    const expectedRevision = Number(input.expected_revision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new ProbeError("invalid_expected_revision", 400);
    }
    const normalizedAmount = input.amount === undefined || input.amount === null
      ? null
      : Number(input.amount);
    const fingerprint = JSON.stringify({
      playerId,
      action,
      amount: normalizedAmount,
      expectedRevision,
      handId: this.hand.id,
    });
    const replay = this.lookupIdempotency(`action:${idempotencyKey}`, fingerprint);
    if (replay) return { ...clone(replay), replay: true };

    this.settleExpiredAction();
    if (expectedRevision !== this.hand.revision) {
      throw new ProbeError("stale_hand_revision", 409, {
        expected_revision: expectedRevision,
        current_revision: this.hand.revision,
      });
    }
    const firstSequence = this.nextSequence;
    const result = this.hand.act({ playerId, type: action, amount: normalizedAmount });
    this.flushDomainEvents();
    const response = {
      ...result,
      replay: false,
      first_event_seq: firstSequence,
      last_event_seq: this.nextSequence - 1,
    };
    this.storeIdempotency(`action:${idempotencyKey}`, fingerprint, response);
    return clone(response);
  }

  revealCards(input = {}) {
    const playerId = this.requirePlayer(input.player_id, input.player_token);
    const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key");
    const fingerprint = JSON.stringify({ playerId, operation: "reveal_cards", handId: this.hand.id });
    const replay = this.lookupIdempotency(`reveal:${idempotencyKey}`, fingerprint);
    if (replay) return { ...clone(replay), replay: true };
    const result = this.hand.revealCards(playerId);
    this.flushDomainEvents();
    this.storeIdempotency(`reveal:${idempotencyKey}`, fingerprint, result);
    return clone(result);
  }

  settleExpiredAction() {
    const result = this.hand.settleExpiredAction();
    if (result) this.flushDomainEvents();
    return result;
  }

  publicState({ playerId = null, playerToken = null } = {}) {
    this.settleExpiredAction();
    const viewer = this.resolveViewer(playerId, playerToken);
    return {
      contract: "tokengame.fixed-table.v1",
      mode: "fixed-four-seat-local-slice",
      server_time: this.now(),
      viewer,
      table: {
        id: "fixed-table-1",
        name: "Codex 无限注德州扑克测试桌",
        max_seats: 4,
        currency: "test_token",
        redeemable: false,
      },
      hand: this.hand.publicProjection(viewer.player_id),
      events: clone(this.events),
    };
  }

  flushDomainEvents() {
    for (const event of this.hand.drainEvents()) this.record(event.type, event.payload);
  }

  record(type, payload) {
    const event = {
      seq: this.nextSequence,
      type,
      server_time: this.now(),
      payload: clone(payload),
    };
    this.nextSequence += 1;
    this.events.push(event);
    for (const listener of this.listeners) listener(clone(event));
    return clone(event);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  lookupIdempotency(key, fingerprint) {
    const entry = this.idempotency.get(key);
    if (!entry) return null;
    if (entry.fingerprint !== fingerprint) throw new ProbeError("idempotency_key_conflict", 409);
    return entry.result;
  }

  storeIdempotency(key, fingerprint, result) {
    this.idempotency.set(key, { fingerprint, result: clone(result) });
  }
}

module.exports = { DEFAULT_SEATS, TableStore };
