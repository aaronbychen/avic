import { describe, it, expect } from 'vitest';
import { buildWall, shuffleWithSeed, parseTileId, formatTileId } from './tiles';
import type { Suit, TileValue } from './types';

describe('buildWall', () => {
  it('produces exactly 108 tiles', () => {
    const wall = buildWall();
    expect(wall).toHaveLength(108);
  });

  it('has exactly 4 copies of each suit/value combination', () => {
    const wall = buildWall();
    const suits: Suit[] = ['wan', 'tong', 'tiao'];
    const values: TileValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const suit of suits) {
      for (const value of values) {
        const count = wall.filter(t => t.suit === suit && t.value === value).length;
        expect(count, `${suit} ${value}`).toBe(4);
      }
    }
  });

  it('every tile has a unique id', () => {
    const wall = buildWall();
    const ids = new Set(wall.map(t => t.id));
    expect(ids.size).toBe(108);
  });

  it('tile ids match their suit/value', () => {
    const wall = buildWall();
    for (const tile of wall) {
      const parsed = parseTileId(tile.id);
      expect(parsed.suit).toBe(tile.suit);
      expect(parsed.value).toBe(tile.value);
    }
  });
});

describe('shuffleWithSeed', () => {
  it('is deterministic for a given seed', () => {
    const wall1 = buildWall();
    const wall2 = buildWall();
    const shuffled1 = shuffleWithSeed(wall1, 12345);
    const shuffled2 = shuffleWithSeed(wall2, 12345);
    expect(shuffled1.map(t => t.id)).toEqual(shuffled2.map(t => t.id));
  });

  it('produces different orderings for different seeds', () => {
    const wall = buildWall();
    const a = shuffleWithSeed([...wall], 1);
    const b = shuffleWithSeed([...wall], 2);
    expect(a.map(t => t.id)).not.toEqual(b.map(t => t.id));
  });

  it('preserves tile set (same 108 tiles)', () => {
    const wall = buildWall();
    const shuffled = shuffleWithSeed([...wall], 99);
    const beforeIds = wall.map(t => t.id).sort();
    const afterIds = shuffled.map(t => t.id).sort();
    expect(afterIds).toEqual(beforeIds);
  });

  it('does not mutate the input array', () => {
    const wall = buildWall();
    const original = wall.map(t => t.id);
    shuffleWithSeed(wall, 7);
    expect(wall.map(t => t.id)).toEqual(original);
  });
});

describe('parseTileId / formatTileId', () => {
  it('round-trips', () => {
    const id = formatTileId('wan', 5, 2);
    expect(id).toBe('wan-5-2');
    const parsed = parseTileId(id);
    expect(parsed).toEqual({ suit: 'wan', value: 5, copyIndex: 2 });
  });

  it('throws on malformed id', () => {
    expect(() => parseTileId('bad')).toThrow();
    expect(() => parseTileId('wan-10-1')).toThrow(); // value out of range
    expect(() => parseTileId('moon-5-1')).toThrow(); // bad suit
  });
});
