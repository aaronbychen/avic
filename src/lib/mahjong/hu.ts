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


import type { Meld } from './types';

type SuitCounts = Record<Suit, number[]>;

function toSuitCounts(hand: readonly Tile[]): SuitCounts {
  const counts: SuitCounts = {
    wan: new Array(10).fill(0),
    tong: new Array(10).fill(0),
    tiao: new Array(10).fill(0),
  };
  for (const tile of hand) {
    counts[tile.suit][tile.value]++;
  }
  return counts;
}

function canFormSetsInSuit(counts: number[], setsNeeded: number): boolean {
  if (setsNeeded === 0) return counts.every(c => c === 0);
  let i = 1;
  while (i <= 9 && counts[i] === 0) i++;
  if (i > 9) return setsNeeded === 0;

  if (counts[i] >= 3) {
    counts[i] -= 3;
    if (canFormSetsInSuit(counts, setsNeeded - 1)) { counts[i] += 3; return true; }
    counts[i] += 3;
  }

  if (i <= 7 && counts[i] >= 1 && counts[i + 1] >= 1 && counts[i + 2] >= 1) {
    counts[i]--; counts[i + 1]--; counts[i + 2]--;
    if (canFormSetsInSuit(counts, setsNeeded - 1)) { counts[i]++; counts[i + 1]++; counts[i + 2]++; return true; }
    counts[i]++; counts[i + 1]++; counts[i + 2]++;
  }

  return false;
}

export function canFormSetsAndPair(hand: readonly Tile[], totalSetsNeeded: number): boolean {
  if (hand.length !== totalSetsNeeded * 3 + 2) return false;
  const counts = toSuitCounts(hand);
  const suits: Suit[] = ['wan', 'tong', 'tiao'];

  for (const suit of suits) {
    for (let v = 1; v <= 9; v++) {
      if (counts[suit][v] >= 2) {
        counts[suit][v] -= 2;
        let ok = true;
        let setsFormed = 0;
        for (const s of suits) {
          const total = counts[s].reduce((a, b) => a + b, 0);
          if (total % 3 !== 0) { ok = false; break; }
          const need = total / 3;
          setsFormed += need;
          if (!canFormSetsInSuit(counts[s], need)) { ok = false; break; }
        }
        counts[suit][v] += 2;
        if (ok && setsFormed === totalSetsNeeded) return true;
      }
    }
  }
  return false;
}

export function isPingHu(hand: readonly Tile[], melds: readonly Meld[]): boolean {
  const setsNeeded = 4 - melds.length;
  if (setsNeeded < 0) return false;
  return canFormSetsAndPair(hand, setsNeeded);
}


import type { WinType } from './types';

function canFormTripletsOnly(counts: number[], setsNeeded: number): boolean {
  if (setsNeeded === 0) return counts.every(c => c === 0);
  let i = 1;
  while (i <= 9 && counts[i] === 0) i++;
  if (i > 9) return setsNeeded === 0;
  if (counts[i] >= 3) {
    counts[i] -= 3;
    if (canFormTripletsOnly(counts, setsNeeded - 1)) { counts[i] += 3; return true; }
    counts[i] += 3;
  }
  return false;
}

export function isDuiDuiHu(hand: readonly Tile[], melds: readonly Meld[]): boolean {
  for (const meld of melds) {
    if (meld.type !== 'peng' && meld.type !== 'gang-ming' && meld.type !== 'gang-an' && meld.type !== 'gang-bu') return false;
  }
  const setsNeeded = 4 - melds.length;
  if (setsNeeded < 0 || hand.length !== setsNeeded * 3 + 2) return false;

  const counts = toSuitCounts(hand);
  const suits: Suit[] = ['wan', 'tong', 'tiao'];

  for (const suit of suits) {
    for (let v = 1; v <= 9; v++) {
      if (counts[suit][v] >= 2) {
        counts[suit][v] -= 2;
        let ok = true;
        let setsFormed = 0;
        for (const s of suits) {
          const total = counts[s].reduce((a, b) => a + b, 0);
          if (total % 3 !== 0) { ok = false; break; }
          const need = total / 3;
          setsFormed += need;
          if (!canFormTripletsOnly(counts[s], need)) { ok = false; break; }
        }
        counts[suit][v] += 2;
        if (ok && setsFormed === setsNeeded) return true;
      }
    }
  }
  return false;
}

export function isQingYiSe(hand: readonly Tile[], melds: readonly Meld[]): boolean {
  const allTiles: Tile[] = [...hand, ...melds.flatMap(m => m.tiles)];
  if (allTiles.length === 0) return false;
  const firstSuit = allTiles[0].suit;
  return allTiles.every(t => t.suit === firstSuit);
}

export interface CanHuResult {
  canHu: boolean;
  winTypes: WinType[];
}

function violatesMissingSuit(hand: readonly Tile[], melds: readonly Meld[], missingSuit: Suit | null): boolean {
  if (missingSuit === null) return false;
  if (hand.some(t => t.suit === missingSuit)) return true;
  return melds.some(m => m.tiles.some(t => t.suit === missingSuit));
}

export function canHu(hand: readonly Tile[], melds: readonly Meld[], missingSuit: Suit | null): CanHuResult {
  if (violatesMissingSuit(hand, melds, missingSuit)) return { canHu: false, winTypes: [] };

  const winTypes: WinType[] = [];

  const qiDui = isQiDui(hand) && melds.length === 0;
  if (qiDui) winTypes.push('qi-dui');

  const pingHu = isPingHu(hand, melds);
  if (pingHu) winTypes.push('ping-hu');

  if (pingHu && isDuiDuiHu(hand, melds)) winTypes.push('dui-dui-hu');
  if ((pingHu || qiDui) && isQingYiSe(hand, melds)) winTypes.push('qing-yi-se');

  return { canHu: winTypes.length > 0, winTypes };
}