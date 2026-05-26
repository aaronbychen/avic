import { describe, it, expect } from 'vitest';
import { decideClaim, decideMissingSuit, decideDiscardStub } from './ai';
import type { ClaimOption, GameState, Seat, Tile } from './types';
import { initialState } from './engine';

function t(suit: 'wan'|'tong'|'tiao', value: number, copy = 1): Tile {
  return { id: `${suit}-${value}-${copy}`, suit, value: value as Tile['value'] };
}

function baseState(): GameState {
  const s = initialState();
  s.phase = 'playing';
  return s;
}

describe('decideClaim', () => {
  it('always claims hu when offered', () => {
    const s = baseState();
    const opts: ClaimOption[] = [
      { seat: 'south', type: 'hu' },
      { seat: 'south', type: 'peng' },
    ];
    expect(decideClaim(s, 'south', opts)).toBe('hu');
  });

  it('passes peng when hand has no pair-shape signal', () => {
    const s = baseState();
    s.seats.south.hand = [
      t('wan', 1, 1), t('wan', 3, 1), t('wan', 5, 1),
      t('tong', 2, 1), t('tong', 4, 1), t('tong', 6, 1),
      t('tong', 8, 1), t('tiao', 2, 1), t('tiao', 5, 1),
      t('tiao', 7, 1), t('tiao', 9, 1),
    ];
    s.seats.south.missingSuit = 'wan';
    const opts: ClaimOption[] = [{ seat: 'south', type: 'peng' }];
    expect(decideClaim(s, 'south', opts)).toBe('pass');
  });

  it('claims peng when ≥2 melds-or-pairs of same suit exist (toward 对对胡)', () => {
    const s = baseState();
    s.seats.south.hand = [
      t('wan', 3, 1), t('wan', 3, 2),
      t('wan', 6, 1), t('wan', 6, 2),
      t('tong', 4, 1), t('tong', 4, 2),
      t('tiao', 8, 1), t('tiao', 9, 1),
    ];
    s.seats.south.missingSuit = 'tong';
    const opts: ClaimOption[] = [{ seat: 'south', type: 'peng' }];
    expect(decideClaim(s, 'south', opts)).toBe('peng');
  });

  it('claims gang when shanten ≥ 3 (rough proxy: hand has many uncoordinated tiles)', () => {
    const s = baseState();
    s.seats.south.hand = [
      t('wan', 1, 1), t('wan', 4, 1), t('wan', 9, 1),
      t('tong', 2, 1), t('tong', 5, 1), t('tong', 7, 1),
      t('tiao', 1, 1), t('tiao', 4, 1), t('tiao', 7, 1),
      t('tiao', 9, 1), t('tiao', 9, 2),
    ];
    s.seats.south.missingSuit = 'wan';
    const opts: ClaimOption[] = [{ seat: 'south', type: 'gang' }];
    expect(decideClaim(s, 'south', opts)).toBe('gang');
  });
});

describe('decideMissingSuit', () => {
  it('picks the suit with fewest tiles in hand', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('wan', 2, 1), t('wan', 3, 1),
      t('wan', 4, 1), t('wan', 5, 1), t('wan', 6, 1),
      t('tiao', 1, 1), t('tiao', 2, 1), t('tiao', 3, 1),
      t('tiao', 4, 1), t('tiao', 5, 1),
      t('tong', 1, 1), t('tong', 2, 1),
    ];
    expect(decideMissingSuit(s, 'east')).toBe('tong');
  });

  it('breaks ties in order wan > tiao > tong', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('wan', 2, 1), t('wan', 3, 1), t('wan', 4, 1),
      t('tong', 1, 1), t('tong', 2, 1), t('tong', 3, 1), t('tong', 4, 1),
      t('tiao', 1, 1), t('tiao', 2, 1), t('tiao', 3, 1), t('tiao', 4, 1),
      t('tong', 5, 1),
    ];
    expect(decideMissingSuit(s, 'east')).toBe('wan');
  });
});

describe('decideDiscardStub (Task 13 placeholder)', () => {
  it('discards a missing-suit tile if any exist', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('tong', 5, 1), t('tiao', 9, 1),
    ];
    s.seats.east.missingSuit = 'tong';
    expect(decideDiscardStub(s, 'east')).toBe('tong-5-1');
  });

  it('falls back to the first tile when no missing-suit tile present', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('tiao', 9, 1),
    ];
    s.seats.east.missingSuit = 'tong';
    expect(decideDiscardStub(s, 'east')).toBe('wan-1-1');
  });
});
