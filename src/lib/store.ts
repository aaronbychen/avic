import { create } from 'zustand';
import { GameState, PlayerName } from './types';
import { getPusherClient } from './pusher-client';
import type { Channel } from 'pusher-js';

const STARTING_CHIPS = 500;

interface GameStore {
  // Identity
  me: PlayerName | null;
  setMe: (name: PlayerName) => void;

  // Game state (from server)
  state: GameState;
  connected: boolean;

  // Actions (call API)
  sendAction: (action: string, amount?: number) => Promise<void>;
  fetchState: () => Promise<void>;

  // Pusher
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
    actionsThisPhase: 0,
  };
}

let channel: Channel | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  me: null,
  state: emptyState(),
  connected: false,

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

    // On showdown, update with full player data (both hands visible)
    channel.bind('showdown', (data: Partial<GameState>) => {
      set((prev) => ({
        state: { ...prev.state, ...data },
      }));
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
