"use strict";

const crypto = require("node:crypto");

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["c", "d", "h", "s"];
const CATEGORY_NAMES = [
  "high_card",
  "one_pair",
  "two_pair",
  "three_of_a_kind",
  "straight",
  "flush",
  "full_house",
  "four_of_a_kind",
  "straight_flush",
];

class HoldemRuleError extends Error {
  constructor(code, status = 409, details = undefined) {
    super(code);
    this.name = "HoldemRuleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function standardDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push(`${rank}${suit}`);
  }
  return cards;
}

function validateCard(card) {
  if (typeof card !== "string" || card.length !== 2) {
    throw new HoldemRuleError("invalid_card", 500, { card });
  }
  if (!RANKS.includes(card[0]) || !SUITS.includes(card[1])) {
    throw new HoldemRuleError("invalid_card", 500, { card });
  }
  return card;
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 52) {
    throw new HoldemRuleError("invalid_deck_size", 500, { expected: 52, actual: deck?.length });
  }
  const checked = deck.map(validateCard);
  if (new Set(checked).size !== checked.length) {
    throw new HoldemRuleError("duplicate_card_in_deck", 500);
  }
  return [...checked];
}

function shuffledDeck(randomInt = (maximum) => crypto.randomInt(maximum)) {
  const deck = standardDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function stackedDeck(topCards) {
  if (!Array.isArray(topCards)) throw new HoldemRuleError("invalid_stacked_deck", 500);
  const top = topCards.map(validateCard);
  if (new Set(top).size !== top.length) throw new HoldemRuleError("duplicate_card_in_deck", 500);
  const used = new Set(top);
  return [...top, ...standardDeck().filter((card) => !used.has(card))];
}

function combinations(items, choose) {
  const result = [];
  function visit(start, selected) {
    if (selected.length === choose) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= items.length - (choose - selected.length); index += 1) {
      visit(index + 1, [...selected, items[index]]);
    }
  }
  visit(0, []);
  return result;
}

function straightHigh(uniqueRanksDescending) {
  const ranks = [...uniqueRanksDescending];
  if (ranks.includes(14)) ranks.push(1);
  let run = 1;
  for (let index = 1; index < ranks.length; index += 1) {
    if (ranks[index - 1] - 1 === ranks[index]) run += 1;
    else if (ranks[index - 1] !== ranks[index]) run = 1;
    if (run >= 5) return ranks[index - 4];
  }
  return null;
}

function evaluateFive(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) {
    throw new HoldemRuleError("five_cards_required", 500);
  }
  const checked = cards.map(validateCard);
  const ranks = checked.map((card) => RANKS.indexOf(card[0]) + 2).sort((a, b) => b - a);
  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
  const groups = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return right[0] - left[0];
  });
  const flush = checked.every((card) => card[1] === checked[0][1]);
  const straight = straightHigh([...new Set(ranks)]);

  let category;
  let tiebreak;
  if (flush && straight) {
    category = 8;
    tiebreak = [straight];
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 5;
    tiebreak = ranks;
  } else if (straight) {
    category = 4;
    tiebreak = [straight];
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups.find(([, count]) => count === 1)[0];
    tiebreak = [...pairs, kicker];
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)];
  } else {
    category = 0;
    tiebreak = ranks;
  }

  return {
    category,
    category_name: CATEGORY_NAMES[category],
    tiebreak,
    best_five: [...checked],
  };
}

function compareEvaluations(left, right) {
  if (left.category !== right.category) return left.category - right.category;
  const length = Math.max(left.tiebreak.length, right.tiebreak.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.tiebreak[index] || 0) - (right.tiebreak[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function evaluateBest(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
    throw new HoldemRuleError("five_to_seven_cards_required", 500);
  }
  let best = null;
  for (const candidate of combinations(cards, 5)) {
    const evaluation = evaluateFive(candidate);
    if (!best || compareEvaluations(evaluation, best) > 0) best = evaluation;
  }
  return clone(best);
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new HoldemRuleError(`invalid_${field}`, 400);
  }
  return number;
}

class HoldemHand {
  constructor({
    id = "hand-1",
    tableId = "fixed-table-1",
    seats,
    dealerIndex = 0,
    smallBlind = 1,
    bigBlind = 2,
    actionTimeoutMs = 30_000,
    deck = shuffledDeck(),
    now = () => Date.now(),
  } = {}) {
    if (!Array.isArray(seats) || seats.length < 2 || seats.length > 10) {
      throw new HoldemRuleError("invalid_seat_count", 500);
    }
    const ids = seats.map((seat) => seat.id);
    if (ids.some((id) => typeof id !== "string" || id === "") || new Set(ids).size !== ids.length) {
      throw new HoldemRuleError("invalid_seat_ids", 500);
    }
    this.id = String(id);
    this.tableId = String(tableId);
    this.now = now;
    this.smallBlind = positiveInteger(smallBlind, "small_blind");
    this.bigBlind = positiveInteger(bigBlind, "big_blind");
    if (this.smallBlind >= this.bigBlind) {
      throw new HoldemRuleError("small_blind_must_be_lower", 500);
    }
    this.actionTimeoutMs = positiveInteger(actionTimeoutMs, "action_timeout_ms");
    this.deck = validateDeck(deck);
    this.deckCursor = 0;
    this.board = [];
    this.burned = [];
    this.domainEvents = [];
    this.revision = 1;
    this.status = "active";
    this.street = "preflop";
    this.finishReason = null;
    this.completedAt = null;
    this.settlement = null;
    this.voluntaryReveals = new Set();
    this.dealerIndex = ((Number(dealerIndex) % seats.length) + seats.length) % seats.length;
    this.seats = seats.map((seat, index) => ({
      id: seat.id,
      label: seat.label || seat.id.toUpperCase(),
      index,
      stack: positiveInteger(seat.stack, "starting_stack"),
      starting_stack: positiveInteger(seat.stack, "starting_stack"),
      hole_cards: [],
      round_commitment: 0,
      total_commitment: 0,
      folded: false,
      all_in: false,
      last_acted_bet: null,
    }));
    this.initialChipTotal = this.seats.reduce((sum, seat) => sum + seat.stack, 0);
    this.smallBlindIndex = this.seats.length === 2
      ? this.dealerIndex
      : this.nextSeatIndex(this.dealerIndex);
    this.bigBlindIndex = this.nextSeatIndex(this.smallBlindIndex);
    this.actorIndex = null;
    this.actionDeadlineAt = null;
    this.currentBet = 0;
    this.lastFullRaise = this.bigBlind;
    this.pending = new Set();
    this.startHand();
  }

  emit(type, payload) {
    this.domainEvents.push({ type, payload: clone(payload) });
  }

  drainEvents() {
    const events = this.domainEvents.map(clone);
    this.domainEvents = [];
    return events;
  }

  draw() {
    const card = this.deck[this.deckCursor];
    if (!card) throw new HoldemRuleError("deck_exhausted", 500);
    this.deckCursor += 1;
    return card;
  }

  nextSeatIndex(index) {
    return (index + 1) % this.seats.length;
  }

  clockwiseIndexesAfter(index) {
    const result = [];
    for (let offset = 1; offset <= this.seats.length; offset += 1) {
      result.push((index + offset) % this.seats.length);
    }
    return result;
  }

  startHand() {
    this.emit("HAND_STARTED", {
      table_id: this.tableId,
      hand_id: this.id,
      dealer_player_id: this.seats[this.dealerIndex].id,
      small_blind: this.smallBlind,
      big_blind: this.bigBlind,
    });

    for (let round = 0; round < 2; round += 1) {
      for (const index of this.clockwiseIndexesAfter(this.dealerIndex)) {
        this.seats[index].hole_cards.push(this.draw());
      }
    }
    this.emit("HOLE_CARDS_DEALT", {
      hand_id: this.id,
      player_ids: this.seats.map((seat) => seat.id),
      cards_each: 2,
    });

    this.postBlind(this.smallBlindIndex, this.smallBlind, "small_blind");
    this.postBlind(this.bigBlindIndex, this.bigBlind, "big_blind");
    this.currentBet = Math.max(...this.seats.map((seat) => seat.round_commitment));
    this.lastFullRaise = this.bigBlind;
    this.pending = new Set(this.actionableSeats().map((seat) => seat.id));
    const firstPreflop = this.seats.length === 2
      ? this.smallBlindIndex
      : this.nextSeatIndex(this.bigBlindIndex);
    this.setNextActorBefore(firstPreflop);
  }

  postBlind(index, amount, blindType) {
    const seat = this.seats[index];
    const paid = this.commitChips(seat, Math.min(amount, seat.stack));
    this.emit("BLIND_POSTED", {
      hand_id: this.id,
      player_id: seat.id,
      blind_type: blindType,
      amount: paid,
      all_in: seat.all_in,
    });
  }

  commitChips(seat, amount) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > seat.stack) {
      throw new HoldemRuleError("invalid_chip_commitment", 500);
    }
    seat.stack -= amount;
    seat.round_commitment += amount;
    seat.total_commitment += amount;
    if (seat.stack === 0) seat.all_in = true;
    return amount;
  }

  activeSeats() {
    return this.seats.filter((seat) => !seat.folded);
  }

  actionableSeats() {
    return this.seats.filter((seat) => !seat.folded && !seat.all_in);
  }

  seatById(playerId) {
    const seat = this.seats.find((candidate) => candidate.id === playerId);
    if (!seat) throw new HoldemRuleError("unknown_player", 404);
    return seat;
  }

  canRaise(seat) {
    return seat.last_acted_bet === null
      || this.currentBet - seat.last_acted_bet >= this.lastFullRaise;
  }

  legalActions(playerId) {
    if (this.status !== "active" || this.actorIndex === null) return [];
    const seat = this.seatById(playerId);
    if (seat.index !== this.actorIndex || seat.folded || seat.all_in) return [];

    const toCall = Math.max(0, this.currentBet - seat.round_commitment);
    const maxTo = seat.round_commitment + seat.stack;
    const actions = [{ type: "fold" }];
    if (toCall === 0) actions.push({ type: "check" });
    if (toCall > 0) {
      actions.push({
        type: "call",
        amount: Math.min(toCall, seat.stack),
        to: seat.round_commitment + Math.min(toCall, seat.stack),
        all_in: seat.stack <= toCall,
      });
    }

    if (seat.stack > 0 && this.currentBet === 0) {
      const minTo = this.bigBlind;
      if (maxTo >= minTo) actions.push({ type: "bet", min_to: minTo, max_to: maxTo });
    }
    if (seat.stack > toCall && this.currentBet > 0 && this.canRaise(seat)) {
      const minTo = this.currentBet + this.lastFullRaise;
      if (maxTo >= minTo) actions.push({ type: "raise", min_to: minTo, max_to: maxTo });
    }

    const allInRaises = maxTo > this.currentBet;
    if (seat.stack > 0 && (!allInRaises || this.canRaise(seat))) {
      actions.push({
        type: "all_in",
        to: maxTo,
        raises: allInRaises,
        full_raise: allInRaises && maxTo - this.currentBet >= this.lastFullRaise,
      });
    }
    return actions;
  }

  requireLegalAction(playerId, type, amount) {
    if (this.status !== "active") throw new HoldemRuleError("hand_not_active", 409);
    const seat = this.seatById(playerId);
    if (this.actorIndex === null || seat.index !== this.actorIndex) {
      throw new HoldemRuleError("not_players_turn", 409, {
        actor_player_id: this.actorIndex === null ? null : this.seats[this.actorIndex].id,
      });
    }
    const legal = this.legalActions(playerId);
    const candidate = legal.find((entry) => entry.type === type);
    if (!candidate) throw new HoldemRuleError("illegal_action", 409, { action: type, legal_actions: legal });
    if (type === "bet" || type === "raise") {
      const target = Number(amount);
      if (!Number.isSafeInteger(target) || target < candidate.min_to || target > candidate.max_to) {
        throw new HoldemRuleError("invalid_action_amount", 409, {
          action: type,
          min_to: candidate.min_to,
          max_to: candidate.max_to,
        });
      }
      return { seat, legal: candidate, amount: target };
    }
    return { seat, legal: candidate, amount: null };
  }

  act({ playerId, type, amount = undefined, automatic = false, reason = null } = {}) {
    // 行动时限过了之后，这一席自己的行动不再被接受：规则 2 说到期由权威代为 check 或
    // fold，那么到期之后本人的行动就已经不属于他了。判定必须在这里做，不能只靠
    // settleExpiredAction 被调用——那一步由到期驱动按 tick 触发，间隔 dueWorkIntervalMs
    // 是宿主选项。少了这一句，迟到 10 毫秒的行动抢在 tick 前到达就照常生效，等于让宿主
    // 配置决定「30 秒」实际是多少秒。
    //
    // automatic 必须排除：settleExpiredAction 正是在到期之后调 act 来完成自动行动的，
    // 不排除的话自动行动会拒掉自己，规则 2 从此不再发生。
    if (
      automatic !== true &&
      this.actionDeadlineAt !== null &&
      this.now() >= this.actionDeadlineAt
    ) {
      throw new HoldemRuleError("action_deadline_expired", 409);
    }
    const actionType = typeof type === "string" ? type : "";
    const { seat, amount: targetAmount } = this.requireLegalAction(playerId, actionType, amount);
    const currentBetBefore = this.currentBet;
    const toCallBefore = Math.max(0, currentBetBefore - seat.round_commitment);
    let paid = 0;
    let target = seat.round_commitment;
    let increasedBet = false;
    let fullRaise = false;

    if (actionType === "fold") {
      seat.folded = true;
    } else if (actionType === "check") {
      // No chips move.
    } else if (actionType === "call") {
      paid = this.commitChips(seat, Math.min(toCallBefore, seat.stack));
      target = seat.round_commitment;
    } else if (actionType === "bet" || actionType === "raise") {
      target = targetAmount;
      paid = this.commitChips(seat, target - seat.round_commitment);
      const increase = target - currentBetBefore;
      this.currentBet = target;
      this.lastFullRaise = increase;
      increasedBet = true;
      fullRaise = true;
    } else if (actionType === "all_in") {
      target = seat.round_commitment + seat.stack;
      paid = this.commitChips(seat, seat.stack);
      if (target > currentBetBefore) {
        const increase = target - currentBetBefore;
        increasedBet = true;
        fullRaise = increase >= this.lastFullRaise;
        this.currentBet = target;
        if (fullRaise) this.lastFullRaise = increase;
      }
    }

    seat.last_acted_bet = this.currentBet;
    this.revision += 1;
    this.emit("PLAYER_ACTION", {
      hand_id: this.id,
      player_id: seat.id,
      action: actionType,
      paid,
      to: target,
      to_call_before: toCallBefore,
      automatic: Boolean(automatic),
      reason: reason || null,
      all_in: seat.all_in,
      full_raise: fullRaise,
    });

    if (this.activeSeats().length === 1) {
      this.finishUncontested(this.activeSeats()[0]);
      return this.resultSummary();
    }

    this.pending.delete(seat.id);
    if (increasedBet && fullRaise) {
      this.pending = new Set(this.actionableSeats()
        .filter((candidate) => candidate.id !== seat.id)
        .map((candidate) => candidate.id));
    } else if (increasedBet) {
      for (const candidate of this.actionableSeats()) {
        if (candidate.id !== seat.id && candidate.round_commitment < this.currentBet) {
          this.pending.add(candidate.id);
        }
      }
    }
    this.cleanPending();

    if (this.pending.size === 0) this.finishBettingRound();
    else this.setNextActorAfter(seat.index);
    return this.resultSummary();
  }

  cleanPending() {
    for (const playerId of [...this.pending]) {
      const seat = this.seatById(playerId);
      if (seat.folded || seat.all_in) this.pending.delete(playerId);
    }
  }

  setNextActorBefore(index) {
    const before = (index - 1 + this.seats.length) % this.seats.length;
    this.setNextActorAfter(before);
  }

  setNextActorAfter(index) {
    this.cleanPending();
    for (const candidateIndex of this.clockwiseIndexesAfter(index)) {
      const candidate = this.seats[candidateIndex];
      if (this.pending.has(candidate.id) && !candidate.folded && !candidate.all_in) {
        this.actorIndex = candidateIndex;
        this.actionDeadlineAt = this.now() + this.actionTimeoutMs;
        this.emit("ACTION_REQUIRED", {
          hand_id: this.id,
          player_id: candidate.id,
          street: this.street,
          deadline_at: this.actionDeadlineAt,
          legal_actions: this.legalActions(candidate.id),
        });
        return;
      }
    }
    this.actorIndex = null;
    this.actionDeadlineAt = null;
  }

  finishBettingRound() {
    this.actorIndex = null;
    this.actionDeadlineAt = null;
    for (const seat of this.seats) {
      seat.round_commitment = 0;
      seat.last_acted_bet = null;
    }
    this.currentBet = 0;
    this.lastFullRaise = this.bigBlind;
    if (this.street === "river") {
      this.finishShowdown();
      return;
    }

    if (this.actionableSeats().length <= 1) {
      while (this.street !== "river") this.dealNextStreet();
      this.finishShowdown();
      return;
    }

    this.dealNextStreet();
    this.pending = new Set(this.actionableSeats().map((seat) => seat.id));
    const firstPostflop = this.clockwiseIndexesAfter(this.dealerIndex)
      .find((index) => this.pending.has(this.seats[index].id));
    this.setNextActorBefore(firstPostflop);
  }

  dealNextStreet() {
    this.burned.push(this.draw());
    if (this.street === "preflop") {
      this.board.push(this.draw(), this.draw(), this.draw());
      this.street = "flop";
    } else if (this.street === "flop") {
      this.board.push(this.draw());
      this.street = "turn";
    } else if (this.street === "turn") {
      this.board.push(this.draw());
      this.street = "river";
    } else {
      throw new HoldemRuleError("cannot_deal_after_river", 500);
    }
    this.emit("STREET_DEALT", {
      hand_id: this.id,
      street: this.street,
      board: [...this.board],
    });
  }

  buildPotLayers() {
    const levels = [...new Set(this.seats.map((seat) => seat.total_commitment).filter((value) => value > 0))]
      .sort((a, b) => a - b);
    const pots = [];
    const refunds = [];
    let previous = 0;
    for (const level of levels) {
      const contributors = this.seats.filter((seat) => seat.total_commitment >= level);
      const amount = (level - previous) * contributors.length;
      if (contributors.length === 1) {
        refunds.push({ player_id: contributors[0].id, amount });
      } else {
        pots.push({
          amount,
          cap: level,
          contributor_ids: contributors.map((seat) => seat.id),
          eligible_player_ids: contributors.filter((seat) => !seat.folded).map((seat) => seat.id),
        });
      }
      previous = level;
    }
    return { pots, refunds };
  }

  winnerOrder(playerIds) {
    const allowed = new Set(playerIds);
    return this.clockwiseIndexesAfter(this.dealerIndex)
      .map((index) => this.seats[index].id)
      .filter((playerId) => allowed.has(playerId));
  }

  awardPot(pot, evaluations) {
    const eligible = pot.eligible_player_ids.map((playerId) => this.seatById(playerId));
    if (eligible.length === 0) throw new HoldemRuleError("pot_has_no_eligible_player", 500);
    let winners = [eligible[0]];
    for (const candidate of eligible.slice(1)) {
      const comparison = compareEvaluations(evaluations[candidate.id], evaluations[winners[0].id]);
      if (comparison > 0) winners = [candidate];
      else if (comparison === 0) winners.push(candidate);
    }
    const ordered = this.winnerOrder(winners.map((seat) => seat.id));
    const share = Math.floor(pot.amount / ordered.length);
    let remainder = pot.amount % ordered.length;
    const awards = [];
    for (const playerId of ordered) {
      const oddChip = remainder > 0 ? 1 : 0;
      remainder -= oddChip;
      const amount = share + oddChip;
      this.seatById(playerId).stack += amount;
      awards.push({ player_id: playerId, amount, odd_chip: Boolean(oddChip) });
    }
    return {
      ...clone(pot),
      winner_ids: ordered,
      awards,
      winning_hand: clone(evaluations[ordered[0]]),
    };
  }

  finishShowdown() {
    const { pots, refunds } = this.buildPotLayers();
    const evaluations = {};
    for (const seat of this.activeSeats()) {
      evaluations[seat.id] = evaluateBest([...seat.hole_cards, ...this.board]);
    }
    for (const refund of refunds) this.seatById(refund.player_id).stack += refund.amount;
    const awardedPots = pots.map((pot) => this.awardPot(pot, evaluations));
    const winnerIds = [...new Set(awardedPots.flatMap((pot) => pot.winner_ids))];
    this.status = "complete";
    this.finishReason = "showdown";
    this.completedAt = this.now();
    this.actorIndex = null;
    this.actionDeadlineAt = null;
    this.pending.clear();
    this.settlement = {
      reason: this.finishReason,
      total_pot: this.seats.reduce((sum, seat) => sum + seat.total_commitment, 0),
      winner_ids: winnerIds,
      pots: awardedPots,
      refunds,
      evaluations,
    };
    this.assertChipConservation();
    this.emit("HAND_COMPLETED", {
      hand_id: this.id,
      reason: this.finishReason,
      board: [...this.board],
      winner_ids: winnerIds,
      pots: awardedPots,
      refunds,
      revealed_hands: this.activeSeats().map((seat) => ({
        player_id: seat.id,
        hole_cards: [...seat.hole_cards],
        evaluation: clone(evaluations[seat.id]),
      })),
    });
  }

  finishUncontested(winner) {
    const { pots, refunds } = this.buildPotLayers();
    const totalPot = this.seats.reduce((sum, seat) => sum + seat.total_commitment, 0);
    for (const refund of refunds) this.seatById(refund.player_id).stack += refund.amount;
    const contestedAmount = pots.reduce((sum, pot) => sum + pot.amount, 0);
    winner.stack += contestedAmount;
    this.status = "complete";
    this.finishReason = "all_others_folded";
    this.completedAt = this.now();
    this.actorIndex = null;
    this.actionDeadlineAt = null;
    this.pending.clear();
    this.settlement = {
      reason: this.finishReason,
      total_pot: totalPot,
      winner_ids: [winner.id],
      pots: pots.map((pot) => ({
        ...pot,
        winner_ids: [winner.id],
        awards: [{ player_id: winner.id, amount: pot.amount, odd_chip: false }],
        winning_hand: null,
      })),
      refunds,
      evaluations: {},
    };
    this.assertChipConservation();
    this.emit("HAND_COMPLETED", {
      hand_id: this.id,
      reason: this.finishReason,
      winner_ids: [winner.id],
      total_pot: totalPot,
      cards_revealed: false,
      pots: clone(this.settlement.pots),
      refunds,
    });
  }

  assertChipConservation() {
    const finalTotal = this.seats.reduce((sum, seat) => sum + seat.stack, 0);
    if (finalTotal !== this.initialChipTotal) {
      throw new HoldemRuleError("chip_conservation_failed", 500, {
        initial: this.initialChipTotal,
        final: finalTotal,
      });
    }
  }

  revealCards(playerId) {
    const seat = this.seatById(playerId);
    if (this.status !== "complete" || this.finishReason !== "all_others_folded") {
      throw new HoldemRuleError("voluntary_reveal_not_available", 409);
    }
    if (!this.settlement.winner_ids.includes(playerId)) {
      throw new HoldemRuleError("only_winner_may_reveal", 403);
    }
    if (this.voluntaryReveals.has(playerId)) {
      return { revealed: true, replay: true, player_id: playerId, hole_cards: [...seat.hole_cards] };
    }
    this.voluntaryReveals.add(playerId);
    this.revision += 1;
    this.emit("CARDS_VOLUNTARILY_REVEALED", {
      hand_id: this.id,
      player_id: playerId,
      hole_cards: [...seat.hole_cards],
    });
    return { revealed: true, replay: false, player_id: playerId, hole_cards: [...seat.hole_cards] };
  }

  settleExpiredAction() {
    if (this.status !== "active" || this.actorIndex === null || this.actionDeadlineAt === null) return null;
    if (this.now() < this.actionDeadlineAt) return null;
    const actor = this.seats[this.actorIndex];
    const legal = this.legalActions(actor.id);
    const type = legal.some((action) => action.type === "check") ? "check" : "fold";
    return this.act({ playerId: actor.id, type, automatic: true, reason: "action_timeout" });
  }

  visibleHoleCards(seat, viewerId) {
    if (seat.id === viewerId) return [...seat.hole_cards];
    if (this.status === "complete" && this.finishReason === "showdown" && !seat.folded) {
      return [...seat.hole_cards];
    }
    if (this.voluntaryReveals.has(seat.id)) return [...seat.hole_cards];
    return null;
  }

  publicProjection(viewerId = null) {
    const potTotal = this.status === "active"
      ? this.seats.reduce((sum, seat) => sum + seat.total_commitment, 0)
      : this.settlement.total_pot;
    return {
      contract: "tokengame.holdem-hand.v1",
      table_id: this.tableId,
      hand_id: this.id,
      revision: this.revision,
      status: this.status,
      street: this.street,
      finish_reason: this.finishReason,
      completed_at: this.completedAt,
      dealer_player_id: this.seats[this.dealerIndex].id,
      small_blind_player_id: this.seats[this.smallBlindIndex].id,
      big_blind_player_id: this.seats[this.bigBlindIndex].id,
      blinds: { small: this.smallBlind, big: this.bigBlind },
      board: [...this.board],
      pot_total: potTotal,
      current_bet: this.currentBet,
      min_raise_increment: this.lastFullRaise,
      actor_player_id: this.actorIndex === null ? null : this.seats[this.actorIndex].id,
      action_deadline_at: this.actionDeadlineAt,
      seats: this.seats.map((seat) => ({
        id: seat.id,
        label: seat.label,
        seat_index: seat.index,
        stack: seat.stack,
        starting_stack: seat.starting_stack,
        round_commitment: seat.round_commitment,
        total_commitment: seat.total_commitment,
        status: seat.folded ? "folded" : seat.all_in ? "all_in" : "active",
        hole_cards: this.visibleHoleCards(seat, viewerId),
      })),
      legal_actions: viewerId ? this.legalActions(viewerId) : [],
      settlement: this.settlement ? clone(this.settlement) : null,
    };
  }

  resultSummary() {
    return {
      accepted: true,
      hand_id: this.id,
      revision: this.revision,
      status: this.status,
      street: this.street,
      actor_player_id: this.actorIndex === null ? null : this.seats[this.actorIndex].id,
    };
  }
}

module.exports = {
  CATEGORY_NAMES,
  HoldemHand,
  HoldemRuleError,
  compareEvaluations,
  evaluateBest,
  evaluateFive,
  shuffledDeck,
  stackedDeck,
  standardDeck,
};
