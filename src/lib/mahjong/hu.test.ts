import { describe, it, expect } from 'vitest';
import { isQiDui, countTilesByKey, tileKey } from './hu';
import type { Tile } from './types';

function t(suit: 'wan'|'tong'|'tiao', value: number, copy = 1): Tile {
  return { id: `${suit}-${value}-${copy}`, suit, value: value as Tile['value'] };
}

describe('tileKey / countTilesByKey', () => {
  it('groups tiles by suit+value ignoring copy index', () => {
    const tiles = [t('wan', 1, 1), t('wan', 1, 2), t('tong', 5, 1)];
    const counts = countTilesByKey(tiles);
    expect(counts.get(tileKey('wan', 1))).toBe(2);
    expect(counts.get(tileKey('tong', 5))).toBe(1);
    expect(counts.get(tileKey('tiao', 9))).toBeUndefined();
  });
});

describe('isQiDui', () => {
  it('accepts 7 distinct pairs (14 tiles)', () => {
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2),
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
      t('tiao', 9, 1), t('tiao', 9, 2),
    ];
    expect(isQiDui(hand)).toBe(true);
  });

  it('accepts 4-of-a-kind as two pairs (qi dui allows duplicates)', () => {
    // 6 distinct pairs + one 4-of-a-kind = 7 pair-equivalents
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2), t('wan', 1, 3), t('wan', 1, 4),
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
    ];
    expect(isQiDui(hand)).toBe(true);
  });

  it('rejects hand with a triple', () => {
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2), t('wan', 1, 3), // triple, not pair
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
      t('tiao', 9, 1),
    ];
    expect(isQiDui(hand)).toBe(false);
  });

  it('rejects wrong tile count', () => {
    const hand = [t('wan', 1, 1), t('wan', 1, 2)];
    expect(isQiDui(hand)).toBe(false);
  });

  it('rejects 13 tiles', () => {
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2),
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
      t('tiao', 9, 1),
    ];
    expect(isQiDui(hand)).toBe(false);
  });
});


import { canFormSetsAndPair, isPingHu } from './hu';

function tiles(...specs: string[]): Tile[] {
  const seen = new Map<string, number>();
  const suitMap: Record<string, 'wan'|'tong'|'tiao'> = { w: 'wan', p: 'tong', t: 'tiao' };
  return specs.map(s => {
    const suit = suitMap[s[0]];
    const value = Number(s[1]);
    const key = `${suit}-${value}`;
    const copy = (seen.get(key) ?? 0) + 1;
    seen.set(key, copy);
    return { id: `${suit}-${value}-${copy}`, suit, value: value as Tile['value'] };
  });
}

describe('canFormSetsAndPair', () => {
  it('accepts pure pong+pair (4 triplets + 1 pair)', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w3','w3','w3','w4','w4','w4','w5','w5');
    expect(canFormSetsAndPair(hand, 4)).toBe(true);
  });

  it('accepts 4 runs + 1 pair', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5','t5');
    expect(canFormSetsAndPair(hand, 4)).toBe(true);
  });

  it('accepts mixed pongs and runs', () => {
    const hand = tiles('w1','w1','w1','p2','p3','p4','t5','t5','t5','t6','t7','t8','w9','w9');
    expect(canFormSetsAndPair(hand, 4)).toBe(true);
  });

  it('rejects hand missing a pair', () => {
    // 4 runs, no pair possible: w1-2-3, w4-5-6, p1-2-3, t1-2-3 + t4,t5 (different tiles, not a pair)
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t1','t2','t3','t4','t5');
    expect(canFormSetsAndPair(hand, 4)).toBe(false);
  });

  it('rejects hand with leftover tiles', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w3','w3','w3','w4','w4','w5','w5','w7');
    expect(canFormSetsAndPair(hand, 4)).toBe(false);
  });

  it('handles existing melds (need fewer sets from hand)', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','p4','p5','p6','t7','t7');
    expect(canFormSetsAndPair(hand, 3)).toBe(true);
  });
});

describe('isPingHu', () => {
  it('accepts a standard 4-meld + pair hand with no existing melds', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5','t5');
    expect(isPingHu(hand, [])).toBe(true);
  });

  it('rejects 七对 shape (no triplets/runs structure)', () => {
    const hand = tiles('w1','w1','w3','w3','p2','p2','p5','p5','t4','t4','t7','t7','t9','t9');
    expect(isPingHu(hand, [])).toBe(false);
  });

  it('rejects 13-tile hand', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5');
    expect(isPingHu(hand, [])).toBe(false);
  });
});
