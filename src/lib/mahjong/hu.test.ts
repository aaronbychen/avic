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
