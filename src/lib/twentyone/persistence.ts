import { Redis } from '@upstash/redis';
import { newMatch } from './engine';
import { defaultRng } from './rng';
import type { GameState } from './types';

export const TWENTYONE_KEY = 'twentyone:game';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Creates the match on first load. NX keeps two simultaneous first loads from
// each saving a different freshly-dealt match.
export async function loadState(): Promise<GameState> {
  const data = await redis.get<GameState>(TWENTYONE_KEY);
  if (data) return data;
  await redis.set(TWENTYONE_KEY, newMatch(defaultRng), { nx: true });
  return (await redis.get<GameState>(TWENTYONE_KEY))!;
}

export async function saveState(state: GameState): Promise<void> {
  await redis.set(TWENTYONE_KEY, state);
}

export async function deleteState(): Promise<void> {
  await redis.del(TWENTYONE_KEY);
}
