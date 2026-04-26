import { create } from 'zustand';
import { GameState, PlayerName } from './types';
import { getPusherClient } from './pusher-client';
import type { Channel } from 'pusher-js';

const STARTING_CHIPS = 1000;

interface EndResult {
  aaron: number;
  vicky: number;
}

interface GameStore {
  me: PlayerName | null;
  setMe: (name: PlayerName) => void;
  state: GameState;
  connected: boolean;
  gameEnded: EndResult | null;

  sendAction: (action: string, amount?: number) => Promise<void>;
  endGame: () => Promise<void>;
  fetchState: () => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

function emptyState(): GameState {
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
    raiseCount: 0,
    lastRaiseAmount: 0,
    actionsThisPhase: 0,
    gameOver: false,
  };
}

let channel: Channel | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  me: null,
  state: emptyState(),
  connected: false,
  gameEnded: null,

  setMe: (name) => set({ me: name }),

  sendAction: async (action, amount) => {
    const { me } = get();
    if (!me) return;
    await fetch('/api/game/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: me, action, amount }),
    });
  },

  endGame: async () => {
    const res = await fetch('/api/game/end', { method: 'POST' });
    if (res.ok) {
      const result = await res.json();
      set({ gameEnded: result });
    }
  },

  fetchState: async () => {
    const { me } = get();
    if (!me) return;
    const res = await fetch(`/api/game/state?player=${me}`);
    if (res.ok) {
      const state = await res.json();
      set({ state });
    }
  },

  subscribe: () => {
    const { me } = get();
    if (!me || channel) return;

    const pusher = getPusherClient();
    channel = pusher.subscribe('game-channel');

    const eventName = me === 'Aaron' ? 'state-aaron' : 'state-vicky';

    channel.bind(eventName, (data: GameState) => {
      set({ state: data, connected: true });
    });

    channel.bind('showdown', (data: Partial<GameState>) => {
      set((prev) => ({ state: { ...prev.state, ...data } }));
    });

    channel.bind('game-ended', (data: EndResult) => {
      set({ gameEnded: data });
    });

    channel.bind('pusher:subscription_succeeded', () => {
      set({ connected: true });
      get().fetchState();
    });
  },

  unsubscribe: () => {
    if (channel) {
      channel.unbind_all();
      channel.unsubscribe();
      channel = null;
    }
    set({ connected: false });
  },
}));
