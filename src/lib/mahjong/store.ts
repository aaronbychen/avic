'use client';

import { create } from 'zustand';
import type { Channel } from 'pusher-js';
import { getPusherClient } from '../pusher-client';
import type { GameState, HumanName, Seat } from './types';
import { initialState } from './engine';
import {
  MAHJONG_CHANNEL,
  SEAT_STATE_EVENT,
} from './pusher';
import type { Action } from './engine';

interface FinalScores {
  east: number;
  south: number;
  west: number;
  north: number;
}

interface MahjongStore {
  me: HumanName | null;
  setMe: (name: HumanName) => void;

  // The seat the current human occupies (null until they pick a seat).
  mySeat: Seat | null;

  state: GameState;
  connected: boolean;
  gameEnded: FinalScores | null;

  // Last server-known version we successfully synced. Used as expectedVersion in writes.
  syncedVersion: number;

  sendAction: (action: Action) => Promise<void>;
  fetchState: () => Promise<void>;
  endGame: () => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

let channel: Channel | null = null;

const AI_FRAME_DELAY_MS = 600;

let stateQueue: GameState[] = [];
let pumping = false;

function pumpQueue(
  set: (partial: Partial<MahjongStore>) => void,
  getMe: () => HumanName | null,
) {
  if (pumping) return;
  pumping = true;
  function step() {
    const next = stateQueue.shift();
    if (!next) { pumping = false; return; }
    const myActualSeat = deriveMySeat(next, getMe());
    set({
      state: next,
      mySeat: myActualSeat,
      connected: true,
      syncedVersion: next.version,
    });
    if (stateQueue.length === 0) { pumping = false; return; }
    window.setTimeout(step, AI_FRAME_DELAY_MS);
  }
  step();
}

function deriveMySeat(state: GameState, me: HumanName | null): Seat | null {
  if (!me) return null;
  for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
    const a = state.seats[seat].assignment;
    if (a.kind === 'human' && a.human === me) return seat;
  }
  return null;
}

export const useMahjongStore = create<MahjongStore>((set, get) => ({
  me: null,
  mySeat: null,
  state: initialState(),
  connected: false,
  gameEnded: null,
  syncedVersion: 0,

  setMe: (name) => set({ me: name }),

  sendAction: async (action) => {
    const { me, state } = get();
    if (!me) return;
    const u = me === 'Aaron' ? 'aaron' : 'vicky';
    const res = await fetch('/api/mahjong/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: { u },
        expectedVersion: state.version,
        action,
      }),
    });
    if (res.status === 409) {
      // Stale state — wait for next Pusher push to refresh.
      return;
    }
    // Server pushes the new state via Pusher; nothing else to do.
  },

  endGame: async () => {
    const res = await fetch('/api/mahjong/end', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { finalScores: FinalScores };
      set({ gameEnded: data.finalScores });
    }
  },

  fetchState: async () => {
    const { me } = get();
    if (!me) return;
    const u = me === 'Aaron' ? 'aaron' : 'vicky';
    const res = await fetch(`/api/mahjong/state?u=${u}`);
    if (!res.ok) return;
    const state = (await res.json()) as GameState;
    set({
      state,
      mySeat: deriveMySeat(state, get().me),
      syncedVersion: state.version,
    });
  },

  subscribe: () => {
    const { me } = get();
    if (!me || channel) return;

    const pusher = getPusherClient();
    channel = pusher.subscribe(MAHJONG_CHANNEL);

    for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
      channel.bind(SEAT_STATE_EVENT[seat], (incoming: GameState) => {
        const myActualSeat = deriveMySeat(incoming, get().me);
        if (myActualSeat === null || myActualSeat === seat) {
          // If incoming state advances us to a 'my-turn' or 'claim-window' state, flush
          // the queue and apply immediately so UI is always responsive to the human.
          const myTurn =
            incoming.phase === 'playing' && myActualSeat !== null && incoming.turn === myActualSeat;
          const myClaim =
            incoming.phase === 'claim-window' &&
            incoming.claimWindow?.options.some((o) => o.seat === myActualSeat);
          if (myTurn || myClaim) {
            stateQueue = [];
            set({
              state: incoming,
              mySeat: myActualSeat,
              connected: true,
              syncedVersion: incoming.version,
            });
            return;
          }
          stateQueue.push(incoming);
          pumpQueue((p) => set(p as MahjongStore), () => get().me);
        }
      });
    }

    channel.bind('game-ended', (data: { finalScores: FinalScores }) => {
      set({ gameEnded: data.finalScores });
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
