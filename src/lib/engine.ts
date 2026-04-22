import { Redis } from '@upstash/redis';
import { GameState, PlayerName, Card } from './types';
import { createShuffledDeck } from './deck';
import { evaluateHand, compareHands } from './evaluator';

const STARTING_CHIPS = 1000;
const ANTE = 5;
const GAME_KEY = 'avic:game';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function opponent(name: PlayerName): PlayerName {
  return name === 'Aaron' ? 'Vicky' : 'Aaron';
}

function createInitialState(): GameState {
  return {
    phase: 'pre-flop',
    pot: 0,
    boardCards: [],
    turn: 'Aaron',
    players: {
      Aaron: { name: 'Aaron', chips: STARTING_CHIPS, currentBet: 0, status: 'playing', holeCards: [] },
      Vicky: { name: 'Vicky', chips: STARTING_CHIPS, currentBet: 0, status: 'playing', holeCards: [] },
    },
    deck: [],
    dealer: 'Aaron',
    winner: null,
    handRank: null,
    phaseRaised: false,
    actionsThisPhase: 0,
  };
}

async function loadState(): Promise<GameState> {
  const data = await redis.get<GameState>(GAME_KEY);
  return data ?? createInitialState();
}

async function saveState(state: GameState): Promise<void> {
  await redis.set(GAME_KEY, state);
}

export async function getState(): Promise<GameState> {
  return loadState();
}

export async function getStateForPlayer(player: PlayerName): Promise<GameState> {
  const gs = await loadState();
  const opp = opponent(player);
  const filtered = { ...gs, players: { ...gs.players }, deck: [] as Card[] };

  if (filtered.phase !== 'showdown') {
    filtered.players = {
      ...filtered.players,
      [opp]: { ...filtered.players[opp], holeCards: [] },
    };
  }
  return filtered;
}

export async function startHand(): Promise<GameState> {
  const gs = await loadState();
  const deck = createShuffledDeck();
  const newDealer = gs.winner !== null ? opponent(gs.dealer) : gs.dealer;

  const players = {
    Aaron: { ...gs.players.Aaron, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
    Vicky: { ...gs.players.Vicky, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
  };

  const aaronAnte = Math.min(ANTE, players.Aaron.chips);
  const vickyAnte = Math.min(ANTE, players.Vicky.chips);
  players.Aaron.chips -= aaronAnte;
  players.Vicky.chips -= vickyAnte;

  players.Aaron.holeCards = [deck.pop()!, deck.pop()!];
  players.Vicky.holeCards = [deck.pop()!, deck.pop()!];

  const newState: GameState = {
    ...gs,
    phase: 'pre-flop',
    pot: aaronAnte + vickyAnte,
    boardCards: [],
    turn: newDealer,
    players,
    deck,
    dealer: newDealer,
    winner: null,
    handRank: null,
    phaseRaised: false,
    actionsThisPhase: 0,
  };
  await saveState(newState);
  return newState;
}

export async function doAction(player: PlayerName, action: string, amount?: number): Promise<{ ok: boolean; error?: string }> {
  const gs = await loadState();

  if (gs.phase === 'showdown' && action !== 'start') {
    return { ok: false, error: 'Hand is over' };
  }
  if (action === 'start') {
    await startHand();
    return { ok: true };
  }
  if (gs.turn !== player) {
    return { ok: false, error: 'Not your turn' };
  }
  if (gs.players[player].status !== 'playing') {
    return { ok: false, error: 'Cannot act' };
  }

  let result: { ok: boolean; error?: string };
  switch (action) {
    case 'check': result = doCheck(gs, player); break;
    case 'call': result = doCall(gs, player); break;
    case 'fold': result = doFold(gs, player); break;
    case 'raise': result = doRaise(gs, player, amount ?? 10); break;
    default: return { ok: false, error: 'Unknown action' };
  }

  if (result.ok) await saveState(gs);
  return result;
}

function doCheck(gs: GameState, player: PlayerName): { ok: boolean; error?: string } {
  const opp = opponent(player);
  if (gs.players[opp].currentBet > gs.players[player].currentBet) {
    return { ok: false, error: 'Cannot check, must call or fold' };
  }
  gs.actionsThisPhase += 1;
  gs.turn = opp;
  if (gs.actionsThisPhase >= 2) advancePhase(gs);
  return { ok: true };
}

function doCall(gs: GameState, player: PlayerName): { ok: boolean; error?: string } {
  const opp = opponent(player);
  const toCall = Math.min(gs.players[opp].currentBet - gs.players[player].currentBet, gs.players[player].chips);
  gs.players[player] = { ...gs.players[player] };
  gs.players[player].chips -= toCall;
  gs.players[player].currentBet += toCall;
  if (gs.players[player].chips === 0) gs.players[player].status = 'all-in';
  gs.pot += toCall;
  gs.actionsThisPhase += 1;

  if (gs.players.Aaron.status === 'all-in' && gs.players.Vicky.status === 'all-in') {
    runOutBoard(gs);
  } else {
    advancePhase(gs);
  }
  return { ok: true };
}

function doFold(gs: GameState, player: PlayerName): { ok: boolean; error?: string } {
  gs.players[player] = { ...gs.players[player], status: 'folded' };
  const winnerName = opponent(player);
  gs.players[winnerName] = { ...gs.players[winnerName], chips: gs.players[winnerName].chips + gs.pot };
  gs.pot = 0;
  gs.winner = winnerName;
  gs.phase = 'showdown';
  return { ok: true };
}

function doRaise(gs: GameState, player: PlayerName, amount: number): { ok: boolean; error?: string } {
  if (gs.phaseRaised) return { ok: false, error: 'Already raised this phase' };
  const rounded = Math.round(amount / 5) * 5;
  const opp = opponent(player);
  const toMatch = gs.players[opp].currentBet - gs.players[player].currentBet;
  const total = Math.min(toMatch + rounded, gs.players[player].chips);
  gs.players[player] = { ...gs.players[player] };
  gs.players[player].chips -= total;
  gs.players[player].currentBet += total;
  if (gs.players[player].chips === 0) gs.players[player].status = 'all-in';
  gs.pot += total;
  gs.turn = opp;
  gs.phaseRaised = true;
  gs.actionsThisPhase += 1;
  return { ok: true };
}

function advancePhase(gs: GameState) {
  const newDeck = [...gs.deck];
  gs.players.Aaron = { ...gs.players.Aaron, currentBet: 0 };
  gs.players.Vicky = { ...gs.players.Vicky, currentBet: 0 };
  gs.turn = opponent(gs.dealer);
  gs.phaseRaised = false;
  gs.actionsThisPhase = 0;
  gs.deck = newDeck;

  if (gs.phase === 'pre-flop') {
    gs.phase = 'flop';
    gs.boardCards = [newDeck.pop()!, newDeck.pop()!, newDeck.pop()!];
  } else if (gs.phase === 'flop') {
    gs.phase = 'turn';
    gs.boardCards = [...gs.boardCards, newDeck.pop()!];
  } else if (gs.phase === 'turn') {
    gs.phase = 'river';
    gs.boardCards = [...gs.boardCards, newDeck.pop()!];
  } else if (gs.phase === 'river') {
    resolveShowdown(gs);
  }
}

function resolveShowdown(gs: GameState) {
  const hand1 = evaluateHand(gs.players.Aaron.holeCards, gs.boardCards);
  const hand2 = evaluateHand(gs.players.Vicky.holeCards, gs.boardCards);
  const result = compareHands(hand1, hand2);

  if (result > 0) {
    gs.winner = 'Aaron';
    gs.players.Aaron = { ...gs.players.Aaron, chips: gs.players.Aaron.chips + gs.pot };
  } else if (result < 0) {
    gs.winner = 'Vicky';
    gs.players.Vicky = { ...gs.players.Vicky, chips: gs.players.Vicky.chips + gs.pot };
  } else {
    gs.winner = 'split';
    gs.players.Aaron = { ...gs.players.Aaron, chips: gs.players.Aaron.chips + Math.floor(gs.pot / 2) };
    gs.players.Vicky = { ...gs.players.Vicky, chips: gs.players.Vicky.chips + Math.ceil(gs.pot / 2) };
  }
  gs.phase = 'showdown';
  gs.pot = 0;
  gs.handRank = { Aaron: hand1.rank, Vicky: hand2.rank };
}

function runOutBoard(gs: GameState) {
  const newDeck = [...gs.deck];
  while (gs.boardCards.length < 5) gs.boardCards.push(newDeck.pop()!);
  gs.deck = newDeck;
  gs.players.Aaron = { ...gs.players.Aaron, currentBet: 0 };
  gs.players.Vicky = { ...gs.players.Vicky, currentBet: 0 };
  resolveShowdown(gs);
}

export async function endGame(): Promise<{ aaron: number; vicky: number }> {
  const gs = await loadState();
  const result = { aaron: gs.players.Aaron.chips, vicky: gs.players.Vicky.chips };
  await redis.del(GAME_KEY);
  return result;
}

export async function resetGame(): Promise<GameState> {
  const state = createInitialState();
  await saveState(state);
  return state;
}

export { ANTE, STARTING_CHIPS };
