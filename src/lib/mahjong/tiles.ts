import type { Suit, Tile, TileId, TileValue } from './types';

const SUITS: Suit[] = ['wan', 'tong', 'tiao'];
const VALUES: TileValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const COPIES_PER_TILE = 4;

export function formatTileId(suit: Suit, value: TileValue, copyIndex: number): TileId {
  return `${suit}-${value}-${copyIndex}`;
}

export interface ParsedTileId {
  suit: Suit;
  value: TileValue;
  copyIndex: number;
}

export function parseTileId(id: TileId): ParsedTileId {
  const parts = id.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid tile id: ${id}`);
  }
  const [suitStr, valueStr, copyStr] = parts;
  if (!SUITS.includes(suitStr as Suit)) {
    throw new Error(`Invalid suit in tile id: ${id}`);
  }
  const valueNum = Number.parseInt(valueStr, 10);
  if (!VALUES.includes(valueNum as TileValue)) {
    throw new Error(`Invalid value in tile id: ${id}`);
  }
  const copyNum = Number.parseInt(copyStr, 10);
  if (!Number.isInteger(copyNum) || copyNum < 1 || copyNum > COPIES_PER_TILE) {
    throw new Error(`Invalid copy index in tile id: ${id}`);
  }
  return {
    suit: suitStr as Suit,
    value: valueNum as TileValue,
    copyIndex: copyNum,
  };
}

export function buildWall(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      for (let copy = 1; copy <= COPIES_PER_TILE; copy++) {
        tiles.push({ id: formatTileId(suit, value, copy), suit, value });
      }
    }
  }
  return tiles;
}

// Mulberry32: tiny seeded PRNG, deterministic across runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
