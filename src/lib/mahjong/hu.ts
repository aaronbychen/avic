import type { Suit, Tile, TileValue } from './types';

export type TileKey = string;

export function tileKey(suit: Suit, value: TileValue): TileKey {
  return `${suit}-${value}`;
}

export function tileKeyOf(tile: Tile): TileKey {
  return tileKey(tile.suit, tile.value);
}

export function countTilesByKey(tiles: readonly Tile[]): Map<TileKey, number> {
  const counts = new Map<TileKey, number>();
  for (const tile of tiles) {
    const k = tileKeyOf(tile);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

// 七对: exactly 14 tiles, every count must be even (2 or 4).
export function isQiDui(hand: readonly Tile[]): boolean {
  if (hand.length !== 14) return false;
  const counts = countTilesByKey(hand);
  for (const count of counts.values()) {
    if (count % 2 !== 0) return false;
  }
  return true;
}
