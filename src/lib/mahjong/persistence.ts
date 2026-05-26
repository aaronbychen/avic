import { Redis } from '@upstash/redis';
import type { GameState, Seat } from './types';
import { initialState, driveAI } from './engine';

export const MAHJONG_KEY = 'mahjong:game';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function loadState(): Promise<GameState> {
  const data = await redis.get<GameState>(MAHJONG_KEY);
  return data ?? initialState();
}

export async function saveState(state: GameState): Promise<void> {
  await redis.set(MAHJONG_KEY, state);
}

export async function deleteState(): Promise<void> {
  await redis.del(MAHJONG_KEY);
}

// Auto-expire claim window if past expiresAt. Returns possibly-mutated state.
// Called at the start of every request.
export function autoExpireClaimWindow(state: GameState): GameState {
  if (state.phase !== 'claim-window' || !state.claimWindow) return state;
  if (Date.now() < state.claimWindow.expiresAt) return state;

  // Auto-pass all still-pending humans, then run driveAI to resolve.
  const next: GameState = {
    ...state,
    claimWindow: {
      ...state.claimWindow,
      decisions: [
        ...state.claimWindow.decisions,
        ...state.claimWindow.pending.map(seat => ({ seat, choice: 'pass' as const })),
      ],
      pending: [],
    },
  };
  return driveAI(next);
}

// Strip server-only fields and other seats' private data for a particular viewer seat.
export function getStateForSeat(state: GameState, viewer: Seat): GameState {
  const filtered: GameState = {
    ...state,
    wall: [], // hide wall contents; clients use wallCount
    seats: { ...state.seats },
  };
  for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
    if (seat === viewer) continue;
    // Hide opponents' hand tiles. Replace with a same-length array of placeholders to preserve count.
    filtered.seats[seat] = {
      ...state.seats[seat],
      hand: state.seats[seat].hand.map((_, i) => ({
        id: `hidden-${seat}-${i}`,
        suit: 'wan',
        value: 1,
      })),
    };
  }
  return filtered;
}
