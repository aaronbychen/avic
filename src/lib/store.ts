import { create } from 'zustand';
import { GameState, PlayerName, Card } from './types';
import { createShuffledDeck } from './deck';
import { evaluateHand, compareHands } from './evaluator';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

function createInitialPlayers() {
  return {
    Aaron: { name: 'Aaron' as PlayerName, chips: STARTING_CHIPS, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
    Vicky: { name: 'Vicky' as PlayerName, chips: STARTING_CHIPS, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
  };
}

interface GameStore extends GameState {
  startHand: () => void;
  bet: (amount: number) => void;
  call: () => void;
  check: () => void;
  fold: () => void;
  allIn: () => void;
  nextPhase: () => void;
  resetGame: () => void;
}

function opponent(name: PlayerName): PlayerName {
  return name === 'Aaron' ? 'Vicky' : 'Aaron';
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

  startHand: () => {
    const state = get();
    const deck = createShuffledDeck();
    const dealer = state.dealer;
    const sb = dealer; // heads-up: dealer posts small blind
    const bb = opponent(dealer);

    const players = {
      Aaron: { ...state.players.Aaron, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
      Vicky: { ...state.players.Vicky, currentBet: 0, status: 'playing' as const, holeCards: [] as Card[] },
    };

    // Post blinds
    const sbAmount = Math.min(SMALL_BLIND, players[sb].chips);
    const bbAmount = Math.min(BIG_BLIND, players[bb].chips);
    players[sb].chips -= sbAmount;
    players[sb].currentBet = sbAmount;
    players[bb].chips -= bbAmount;
    players[bb].currentBet = bbAmount;

    // Deal hole cards
    players.Aaron.holeCards = [deck.pop()!, deck.pop()!];
    players.Vicky.holeCards = [deck.pop()!, deck.pop()!];

    set({
      phase: 'pre-flop',
      pot: sbAmount + bbAmount,
      boardCards: [],
      turn: sb, // heads-up: SB/dealer acts first pre-flop
      players,
      deck,
      winner: null,
      handRank: null,
    });
  },

  bet: (amount: number) => {
    const { turn, players, pot } = get();
    const player = { ...players[turn] };
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.currentBet += actual;
    if (player.chips === 0) player.status = 'all-in';

    set({
      players: { ...players, [turn]: player },
      pot: pot + actual,
      turn: opponent(turn),
    });
  },

  call: () => {
    const { turn, players, pot } = get();
    const player = { ...players[turn] };
    const opp = players[opponent(turn)];
    const toCall = Math.min(opp.currentBet - player.currentBet, player.chips);
    player.chips -= toCall;
    player.currentBet += toCall;
    if (player.chips === 0) player.status = 'all-in';

    const newState: Partial<GameStore> = {
      players: { ...players, [turn]: player },
      pot: pot + toCall,
    };

    set(newState);
    // After call, advance phase
    get().nextPhase();
  },

  check: () => {
    const { turn, players, phase } = get();
    const opp = players[opponent(turn)];

    // If both checked (or BB checks pre-flop), advance
    if (phase === 'pre-flop' && turn === opponent(get().dealer)) {
      // BB checking pre-flop advances
      set({ turn: opponent(turn) });
      get().nextPhase();
    } else if (opp.currentBet === players[turn].currentBet) {
      set({ turn: opponent(turn) });
      // If we just switched and the previous player also checked, nextPhase will be called on their check
    } else {
      set({ turn: opponent(turn) });
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

  allIn: () => {
    const { turn, players, pot } = get();
    const player = { ...players[turn] };
    const amount = player.chips;
    player.chips = 0;
    player.currentBet += amount;
    player.status = 'all-in';

    set({
      players: { ...players, [turn]: player },
      pot: pot + amount,
      turn: opponent(turn),
    });
  },

  nextPhase: () => {
    const state = get();
    const { phase, deck, players, pot, dealer } = state;
    const newDeck = [...deck];

    // Reset bets for new street
    const newPlayers = {
      Aaron: { ...players.Aaron, currentBet: 0 },
      Vicky: { ...players.Vicky, currentBet: 0 },
    };

    // Post-flop: non-dealer acts first
    const firstToAct = opponent(dealer);

    if (phase === 'pre-flop') {
      const flop = [newDeck.pop()!, newDeck.pop()!, newDeck.pop()!];
      set({ phase: 'flop', boardCards: flop, deck: newDeck, players: newPlayers, turn: firstToAct });
    } else if (phase === 'flop') {
      const turnCard = newDeck.pop()!;
      set({ phase: 'turn', boardCards: [...state.boardCards, turnCard], deck: newDeck, players: newPlayers, turn: firstToAct });
    } else if (phase === 'turn') {
      const riverCard = newDeck.pop()!;
      set({ phase: 'river', boardCards: [...state.boardCards, riverCard], deck: newDeck, players: newPlayers, turn: firstToAct });
    } else if (phase === 'river') {
      // Showdown
      const hand1 = evaluateHand(players.Aaron.holeCards, state.boardCards);
      const hand2 = evaluateHand(players.Vicky.holeCards, state.boardCards);
      const result = compareHands(hand1, hand2);

      let winner: PlayerName | 'split';
      if (result > 0) {
        winner = 'Aaron';
        newPlayers.Aaron.chips += pot;
      } else if (result < 0) {
        winner = 'Vicky';
        newPlayers.Vicky.chips += pot;
      } else {
        winner = 'split';
        newPlayers.Aaron.chips += Math.floor(pot / 2);
        newPlayers.Vicky.chips += Math.ceil(pot / 2);
      }

      set({
        phase: 'showdown',
        players: newPlayers,
        pot: 0,
        winner,
        handRank: { Aaron: hand1.rank, Vicky: hand2.rank },
        dealer: opponent(dealer),
      });
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
    });
  },
}));
