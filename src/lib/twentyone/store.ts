'use client';

import { create } from 'zustand';
import type { Channel } from 'pusher-js';
import { getPusherClient } from '../pusher-client';
import { RESET_EVENT, TWENTYONE_CHANNEL, UPDATED_EVENT } from './pusher';
import type { Action, GameView, PlayerName } from './types';

interface TwentyOneStore {
  me: PlayerName | null;
  setMe: (name: PlayerName) => void;
  view: GameView | null;
  pending: boolean;
  error: string | null;

  sendAction: (action: Action) => Promise<void>;
  fetchState: () => Promise<void>;
  forceReset: () => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

let channel: Channel | null = null;
let errorTimer: number | null = null;

export const useTwentyOneStore = create<TwentyOneStore>((set, get) => {
  const showError = (error: string) => {
    if (errorTimer !== null) window.clearTimeout(errorTimer);
    set({ error });
    errorTimer = window.setTimeout(() => set({ error: null }), 2500);
  };

  return {
    me: null,
    view: null,
    pending: false,
    error: null,

    setMe: (name) => set({ me: name }),

    sendAction: async (action) => {
      const { me, view, pending } = get();
      if (!me || !view || pending) return;
      set({ pending: true });
      try {
        const res = await fetch('/api/twentyone/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ u: me, expectedVersion: view.version, action }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          showError(data.error ?? '操作失败');
        }
        // Refresh right away rather than waiting for the Pusher round trip.
        await get().fetchState();
      } finally {
        set({ pending: false });
      }
    },

    fetchState: async () => {
      const { me } = get();
      if (!me) return;
      const res = await fetch(`/api/twentyone/state?u=${me}`, { cache: 'no-store' });
      if (!res.ok) return;
      const view = (await res.json()) as GameView;
      // Responses can arrive out of order; never step back to an older version
      // of the same match.
      const current = get().view;
      if (current && current.matchId === view.matchId && view.version < current.version) return;
      set({ view });
    },

    forceReset: async () => {
      const res = await fetch('/api/twentyone/reset', { method: 'POST' });
      if (res.ok) await get().fetchState();
    },

    subscribe: () => {
      if (!get().me || channel) return;
      channel = getPusherClient().subscribe(TWENTYONE_CHANNEL);
      channel.bind(UPDATED_EVENT, (data: { version: number }) => {
        const current = get().view;
        if (!current || data.version > current.version) get().fetchState();
      });
      channel.bind(RESET_EVENT, () => get().fetchState());
      channel.bind('pusher:subscription_succeeded', () => get().fetchState());
    },

    unsubscribe: () => {
      if (channel) {
        channel.unbind_all();
        channel.unsubscribe();
        channel = null;
      }
    },
  };
});
