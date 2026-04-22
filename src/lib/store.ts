import { create } from 'zustand';
import { GameState, PlayerName, Card } from './types';
import { createShuffledDeck } from './deck';
import { evaluateHand, compareHands } from './evaluator';

const STARTING_CHIPS = 500;
const ANTE = 5;

function createInitialPlayers() {
  return {
    Aaron: { name: 'Aaron' as PlayerName, chips: STARTING_CHIPS, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
    Vicky: { name: 'Vicky' as PlayerName, chips: STARTING_CHIPS, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
  };
}

function opponent(name: PlayerName): PlayerName {
  return name === 'Aaron' ? 'Vicky' : 'Aaron';
}

interface GameStore extends GameState {
  startHand: () => void;
  raise: (amount: number) => void;
  call: () => void;
  check: () => void;
  fold: () => void;
  nextPhase: () => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'pre-flop',
  pot: 0,
  boardCards: [],
  turn: 'Aaron',
  players: createInitialPlayers(),
  deck: [],
  dealer: 'Aaron',
  winner: null,
  handRank: null,
  phaseRaised: false,
  actionsThisPhase: 0,

  startHand: () => {
    const state = get();
    const deck = createShuffledDeck();
    const newDealer = state.winner !== null ? opponent(state.dealer) : state.dealer;

    const players = {
      Aaron: { ...state.players.Aaron, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
      Vicky: { ...state.players.Vicky, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
    };

    // Post antes
    const aaronAnte = Math.min(ANTE, players.Aaron.chips);
    const vickyAnte = Math.min(ANTE, players.Vicky.chips);
    players.Aaron.chips -= aaronAnte;
    players.Vicky.chips -= vickyAnte;

    // Deal hole cards
    players.Aaron.holeCards = [deck.pop()!, deck.pop()!];
    players.Vicky.holeCards = [deck.pop()!, deck.pop()!];

    set({
      phase: 'pre-flop',
      pot: aaronAnte + vickyAnte,
      boardCards: [],
      turn: newDealer, // dealer acts first pre-flop in heads-up
      players,
      deck,
      dealer: newDealer,
      winner: null,
      handRank: null,
      phaseRaised: false,
      actionsThisPhase: 0,
    });
  },

  raise: (amount: number) => {
    const { turn, players, pot, actionsThisPhase } = get();
    // Enforce multiples of 5
    const rounded = Math.round(amount / 5) * 5;
    const player = { ...players[turn] };
    const opp = players[opponent(turn)];
    const toMatch = opp.currentBet - player.currentBet;
    const total = Math.min(toMatch + rounded, player.chips);
    player.chips -= total;
    player.currentBet += total;
    if (player.chips === 0) player.status = 'all-in';

    set({
      players: { ...players, [turn]: player },
      pot: pot + total,
      turn: opponent(turn),
      phaseRaised: true,
      actionsThisPhase: actionsThisPhase + 1,
    });
  },

  call: () => {
    const { turn, players, pot, actionsThisPhase } = get();
    const player = { ...players[turn] };
    const opp = players[opponent(turn)];
    const toCall = Math.min(opp.currentBet - player.currentBet, player.chips);
    player.chips -= toCall;
    player.currentBet += toCall;
    if (player.chips === 0) player.status = 'all-in';

    set({
      players: { ...players, [turn]: player },
      pot: pot + toCall,
      actionsThisPhase: actionsThisPhase + 1,
    });

    // Both all-in → run out all boards then showdown
    const s = get();
    if (s.players.Aaron.status === 'all-in' && s.players.Vicky.status === 'all-in') {
      runOutBoard(get, set);
    } else {
      get().nextPhase();
    }
  },

  check: () => {
    const { turn, actionsThisPhase } = get();
    const newActions = actionsThisPhase + 1;
    set({ turn: opponent(turn), actionsThisPhase: newActions });

    // Both players have acted (2 checks) → advance
    if (newActions >= 2) {
      get().nextPhase();
    }
  },

  fold: () => {
    const { turn, players, pot } = get();
    const player = { ...players[turn] };
    player.status = 'folded';
    const winnerName = opponent(turn);
    const winnerPlayer = { ...players[winnerName] };
    winnerPlayer.chips += pot;

    set({
      players: { ...players, [turn]: player, [winnerName]: winnerPlayer },
      pot: 0,
      winner: winnerName,
      phase: 'showdown',
    });
  },

  nextPhase: () => {
    const state = get();
    const { phase, deck, players, pot, dealer, boardCards } = state;
    const newDeck = [...deck];
    const newPlayers = {
      Aaron: { ...players.Aaron, currentBet: 0 },
      Vicky: { ...players.Vicky, currentBet: 0 },
    };
    const firstToAct = opponent(dealer);

    const common = { deck: newDeck, players: newPlayers, turn: firstToAct, phaseRaised: false, actionsThisPhase: 0 };

    if (phase === 'pre-flop') {
      set({ phase: 'flop', boardCards: [newDeck.pop()!, newDeck.pop()!, newDeck.pop()!], ...common });
    } else if (phase === 'flop') {
      set({ phase: 'turn', boardCards: [...boardCards, newDeck.pop()!], ...common });
    } else if (phase === 'turn') {
      set({ phase: 'river', boardCards: [...boardCards, newDeck.pop()!], ...common });
    } else if (phase === 'river') {
      resolveShowdown(players, boardCards, pot, newPlayers, dealer, set);
    }
  },

  resetGame: () => {
    set({
      phase: 'pre-flop',
      pot: 0,
      boardCards: [],
      turn: 'Aaron',
      players: createInitialPlayers(),
      deck: [],
      dealer: 'Aaron',
      winner: null,
      handRank: null,
      phaseRaised: false,
      actionsThisPhase: 0,
    });
  },
}));

function resolveShowdown(
  players: GameState['players'],
  boardCards: Card[],
  pot: number,
  newPlayers: GameState['players'],
  dealer: PlayerName,
  set: (s: Partial<GameStore>) => void,
) {
  const hand1 = evaluateHand(players.Aaron.holeCards, boardCards);
  const hand2 = evaluateHand(players.Vicky.holeCards, boardCards);
  const result = compareHands(hand1, hand2);

  let winner: PlayerName | 'split';
  if (result > 0) {
    winner = 'Aaron';
    newPlayers.Aaron = { ...newPlayers.Aaron, chips: newPlayers.Aaron.chips + pot };
  } else if (result < 0) {
    winner = 'Vicky';
    newPlayers.Vicky = { ...newPlayers.Vicky, chips: newPlayers.Vicky.chips + pot };
  } else {
    winner = 'split';
    newPlayers.Aaron = { ...newPlayers.Aaron, chips: newPlayers.Aaron.chips + Math.floor(pot / 2) };
    newPlayers.Vicky = { ...newPlayers.Vicky, chips: newPlayers.Vicky.chips + Math.ceil(pot / 2) };
  }

  set({
    phase: 'showdown',
    players: newPlayers,
    pot: 0,
    winner,
    handRank: { Aaron: hand1.rank, Vicky: hand2.rank },
  });
}

function runOutBoard(
  get: () => GameStore,
  set: (s: Partial<GameStore>) => void,
) {
  const state = get();
  const newDeck = [...state.deck];
  let board = [...state.boardCards];

  // Deal remaining community cards
  while (board.length < 5) {
    board.push(newDeck.pop()!);
  }

  const newPlayers = {
    Aaron: { ...state.players.Aaron, currentBet: 0 },
    Vicky: { ...state.players.Vicky, currentBet: 0 },
  };

  set({ boardCards: board, deck: newDeck });
  resolveShowdown(state.players, board, state.pot, newPlayers, state.dealer, set);
}

export { ANTE, STARTING_CHIPS };
