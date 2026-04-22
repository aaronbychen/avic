import { GameState, PlayerName, Card } from './types';
import { createShuffledDeck } from './deck';
import { evaluateHand, compareHands } from './evaluator';

const STARTING_CHIPS = 500;
const ANTE = 5;

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

// In-memory server state (single game, two players)
let gameState: GameState = createInitialState();

export function getState(): GameState {
  return gameState;
}

/** Return state filtered for a specific player — hide opponent's hole cards unless showdown */
export function getStateForPlayer(player: PlayerName): GameState {
  const s = { ...gameState, players: { ...gameState.players } };
  const opp = opponent(player);

  if (s.phase !== 'showdown') {
    s.players = {
      ...s.players,
      [opp]: { ...s.players[opp], holeCards: [] },
    };
  }
  // Never send deck to client
  return { ...s, deck: [] };
}

export function startHand(): GameState {
  const deck = createShuffledDeck();
  const newDealer = gameState.winner !== null ? opponent(gameState.dealer) : gameState.dealer;

  const players = {
    Aaron: { ...gameState.players.Aaron, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
    Vicky: { ...gameState.players.Vicky, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
  };

  const aaronAnte = Math.min(ANTE, players.Aaron.chips);
  const vickyAnte = Math.min(ANTE, players.Vicky.chips);
  players.Aaron.chips -= aaronAnte;
  players.Vicky.chips -= vickyAnte;

  players.Aaron.holeCards = [deck.pop()!, deck.pop()!];
  players.Vicky.holeCards = [deck.pop()!, deck.pop()!];

  gameState = {
    ...gameState,
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
  return gameState;
}

export function doAction(player: PlayerName, action: string, amount?: number): { ok: boolean; error?: string } {
  if (gameState.phase === 'showdown' && action !== 'start') {
    return { ok: false, error: 'Hand is over' };
  }
  if (action === 'start') {
    startHand();
    return { ok: true };
  }
  if (gameState.turn !== player) {
    return { ok: false, error: 'Not your turn' };
  }
  if (gameState.players[player].status !== 'playing') {
    return { ok: false, error: 'Cannot act' };
  }

  switch (action) {
    case 'check': return doCheck(player);
    case 'call': return doCall(player);
    case 'fold': return doFold(player);
    case 'raise': return doRaise(player, amount ?? 10);
    default: return { ok: false, error: 'Unknown action' };
  }
}

function doCheck(player: PlayerName): { ok: boolean; error?: string } {
  const opp = opponent(player);
  if (gameState.players[opp].currentBet > gameState.players[player].currentBet) {
    return { ok: false, error: 'Cannot check, must call or fold' };
  }

  const newActions = gameState.actionsThisPhase + 1;
  gameState = { ...gameState, turn: opp, actionsThisPhase: newActions };

  if (newActions >= 2) advancePhase();
  return { ok: true };
}

function doCall(player: PlayerName): { ok: boolean; error?: string } {
  const opp = opponent(player);
  const p = { ...gameState.players[player] };
  const toCall = Math.min(gameState.players[opp].currentBet - p.currentBet, p.chips);
  p.chips -= toCall;
  p.currentBet += toCall;
  if (p.chips === 0) p.status = 'all-in';

  gameState = {
    ...gameState,
    players: { ...gameState.players, [player]: p },
    pot: gameState.pot + toCall,
    actionsThisPhase: gameState.actionsThisPhase + 1,
  };

  if (gameState.players.Aaron.status === 'all-in' && gameState.players.Vicky.status === 'all-in') {
    runOutBoard();
  } else {
    advancePhase();
  }
  return { ok: true };
}

function doFold(player: PlayerName): { ok: boolean; error?: string } {
  const p = { ...gameState.players[player] };
  p.status = 'folded';
  const winnerName = opponent(player);
  const w = { ...gameState.players[winnerName] };
  w.chips += gameState.pot;

  gameState = {
    ...gameState,
    players: { ...gameState.players, [player]: p, [winnerName]: w },
    pot: 0,
    winner: winnerName,
    phase: 'showdown',
  };
  return { ok: true };
}

function doRaise(player: PlayerName, amount: number): { ok: boolean; error?: string } {
  if (gameState.phaseRaised) {
    return { ok: false, error: 'Already raised this phase' };
  }
  const rounded = Math.round(amount / 5) * 5;
  const p = { ...gameState.players[player] };
  const opp = opponent(player);
  const toMatch = gameState.players[opp].currentBet - p.currentBet;
  const total = Math.min(toMatch + rounded, p.chips);
  p.chips -= total;
  p.currentBet += total;
  if (p.chips === 0) p.status = 'all-in';

  gameState = {
    ...gameState,
    players: { ...gameState.players, [player]: p },
    pot: gameState.pot + total,
    turn: opp,
    phaseRaised: true,
    actionsThisPhase: gameState.actionsThisPhase + 1,
  };
  return { ok: true };
}

function advancePhase() {
  const { phase, deck, players, pot, dealer, boardCards } = gameState;
  const newDeck = [...deck];
  const newPlayers = {
    Aaron: { ...players.Aaron, currentBet: 0 },
    Vicky: { ...players.Vicky, currentBet: 0 },
  };
  const firstToAct = opponent(dealer);
  const common = { deck: newDeck, players: newPlayers, turn: firstToAct, phaseRaised: false, actionsThisPhase: 0 };

  if (phase === 'pre-flop') {
    gameState = { ...gameState, phase: 'flop', boardCards: [newDeck.pop()!, newDeck.pop()!, newDeck.pop()!], ...common };
  } else if (phase === 'flop') {
    gameState = { ...gameState, phase: 'turn', boardCards: [...boardCards, newDeck.pop()!], ...common };
  } else if (phase === 'turn') {
    gameState = { ...gameState, phase: 'river', boardCards: [...boardCards, newDeck.pop()!], ...common };
  } else if (phase === 'river') {
    resolveShowdown(pot, newPlayers);
  }
}

function resolveShowdown(pot: number, newPlayers: GameState['players']) {
  const hand1 = evaluateHand(gameState.players.Aaron.holeCards, gameState.boardCards);
  const hand2 = evaluateHand(gameState.players.Vicky.holeCards, gameState.boardCards);
  const result = compareHands(hand1, hand2);

  let winner: PlayerName | 'split';
  if (result > 0) {
    winner = 'Aaron';
    newPlayers = { ...newPlayers, Aaron: { ...newPlayers.Aaron, chips: newPlayers.Aaron.chips + pot } };
  } else if (result < 0) {
    winner = 'Vicky';
    newPlayers = { ...newPlayers, Vicky: { ...newPlayers.Vicky, chips: newPlayers.Vicky.chips + pot } };
  } else {
    winner = 'split';
    newPlayers = {
      ...newPlayers,
      Aaron: { ...newPlayers.Aaron, chips: newPlayers.Aaron.chips + Math.floor(pot / 2) },
      Vicky: { ...newPlayers.Vicky, chips: newPlayers.Vicky.chips + Math.ceil(pot / 2) },
    };
  }

  gameState = {
    ...gameState,
    phase: 'showdown',
    players: newPlayers,
    pot: 0,
    winner,
    handRank: { Aaron: hand1.rank, Vicky: hand2.rank },
  };
}

function runOutBoard() {
  const newDeck = [...gameState.deck];
  const board = [...gameState.boardCards];
  while (board.length < 5) board.push(newDeck.pop()!);

  const newPlayers = {
    Aaron: { ...gameState.players.Aaron, currentBet: 0 },
    Vicky: { ...gameState.players.Vicky, currentBet: 0 },
  };

  gameState = { ...gameState, boardCards: board, deck: newDeck };
  resolveShowdown(gameState.pot, newPlayers);
}

export function resetGame(): GameState {
  gameState = createInitialState();
  return gameState;
}

export { ANTE, STARTING_CHIPS };
