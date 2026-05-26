import { describe, it, expect } from 'vitest';
import {
  initialState,
  pickSeat,
  chooseMissing,
  applyAction,
  type ActionResult,
} from './engine';
import type { GameState, Seat } from './types';

describe('initialState', () => {
  it('starts in seat-selection phase with no assignments', () => {
    const s = initialState();
    expect(s.phase).toBe('seat-selection');
    expect(s.version).toBe(0);
    expect(s.handNumber).toBe(0);
    expect(s.gameOver).toBe(false);
    expect(s.dealer).toBe('east');
    expect(s.huOrder).toEqual([]);
    expect(s.claimWindow).toBeNull();
    expect(s.lastDiscard).toBeNull();
    for (const seat of ['east','south','west','north'] as Seat[]) {
      const p = s.seats[seat];
      expect(p.hand).toEqual([]);
      expect(p.melds).toEqual([]);
      expect(p.discards).toEqual([]);
      expect(p.missingSuit).toBeNull();
      expect(p.hasHu).toBe(false);
      expect(p.score).toBe(0);
      expect(p.assignment.kind).toBe('ai'); // default; humans claim via pickSeat
    }
  });
});

describe('pickSeat (Aaron / Vicky)', () => {
  it('assigns Aaron to chosen seat, fills others as AI', () => {
    let s = initialState();
    const r = pickSeat(s, 'east', 'Aaron');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.east.assignment.kind).toBe('human');
    expect(s.seats.east.assignment.human).toBe('Aaron');
    expect(s.seats.south.assignment.kind).toBe('ai');
    expect(s.phase).toBe('seat-selection'); // still waiting on Vicky
  });

  it('assigning the second human transitions to choose-missing and deals', () => {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    const r = pickSeat(s, 'south', 'Vicky');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.south.assignment.human).toBe('Vicky');
    expect(s.phase).toBe('choose-missing');
    expect(s.handNumber).toBe(1);
    // each seat has 13 tiles dealt
    for (const seat of ['east','south','west','north'] as Seat[]) {
      expect(s.seats[seat].hand.length).toBe(13);
    }
    // wall has 108 - 4*13 = 56 tiles
    expect(s.wallCount).toBe(56);
    expect(s.wall.length).toBe(56);
  });

  it('rejects assigning the same human twice', () => {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    const r = pickSeat(s, 'south', 'Aaron');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already-assigned');
  });

  it('rejects an already-occupied seat', () => {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    const r = pickSeat(s, 'east', 'Vicky');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('seat-taken');
  });
});

describe('chooseMissing', () => {
  function readyToChoose(): GameState {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    s = pickSeat(s, 'south', 'Vicky').state!;
    return s;
  }

  it('records the chosen suit for one seat', () => {
    let s = readyToChoose();
    const r = chooseMissing(s, 'east', 'tong');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.east.missingSuit).toBe('tong');
    expect(s.phase).toBe('choose-missing');
  });

  it('once all 4 seats have chosen, transitions to playing with dealer to draw', () => {
    let s = readyToChoose();
    s = chooseMissing(s, 'east', 'tong').state!;
    s = chooseMissing(s, 'south', 'tong').state!;
    s = chooseMissing(s, 'west', 'tong').state!;
    s = chooseMissing(s, 'north', 'tong').state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('east'); // dealer is east, dealer draws first
    // dealer has been given a draw — 14 tiles
    expect(s.seats.east.hand.length).toBe(14);
    expect(s.seats.south.hand.length).toBe(13);
    expect(s.wallCount).toBe(55);
  });

  it('rejects choosing twice', () => {
    let s = readyToChoose();
    s = chooseMissing(s, 'east', 'tong').state!;
    const r = chooseMissing(s, 'east', 'wan');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already-chosen');
  });

  it('rejects choosing in wrong phase', () => {
    const s = initialState();
    const r = chooseMissing(s, 'east', 'tong');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});
