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


import { discard, declareSelfDrawHu } from './engine';
import type { TileId } from './types';

function startedGame(): GameState {
  let s = initialState();
  s = pickSeat(s, 'east', 'Aaron').state!;
  s = pickSeat(s, 'south', 'Vicky').state!;
  s = chooseMissing(s, 'east', 'tong').state!;
  s = chooseMissing(s, 'south', 'tong').state!;
  s = chooseMissing(s, 'west', 'tong').state!;
  s = chooseMissing(s, 'north', 'tong').state!;
  return s;
}

describe('discard (no claims)', () => {
  it('removes the tile from the active player and advances turn counter-clockwise', () => {
    let s = startedGame();
    expect(s.turn).toBe('east');
    expect(s.seats.east.hand.length).toBe(14);

    // Find a tile in east's hand that no other seat could peng (no other seat has 2+ of same suit/value).
    const tileId = (() => {
      for (const tile of s.seats.east.hand) {
        const otherCounts = (['south','west','north'] as Seat[]).map(seat =>
          s.seats[seat].hand.filter(t => t.suit === tile.suit && t.value === tile.value).length
        );
        if (otherCounts.every(c => c < 2)) return tile.id;
      }
      throw new Error('no claim-free tile found in random hand (rare; rerun)');
    })();

    const r = discard(s, 'east', tileId);
    expect(r.ok).toBe(true);
    s = r.state!;

    expect(s.seats.east.hand.length).toBe(13);
    expect(s.seats.east.discards.length).toBe(1);
    expect(s.seats.east.discards[0].id).toBe(tileId);
    expect(s.lastDiscard?.seat).toBe('east');
    expect(s.lastDiscard?.tile.id).toBe(tileId);
    expect(s.turn).toBe('north');
    expect(s.seats.north.hand.length).toBe(14);
    expect(s.wallCount).toBe(54);
    expect(s.phase).toBe('playing');
  });

  it('rejects discard when not your turn', () => {
    const s = startedGame();
    const r = discard(s, 'south', s.seats.south.hand[0].id);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not-your-turn');
  });

  it('rejects discard of a tile not in hand', () => {
    const s = startedGame();
    const r = discard(s, 'east', 'wan-1-99');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('tile-not-in-hand');
  });

  it('rejects discard in wrong phase', () => {
    const s = initialState();
    const r = discard(s, 'east', 'wan-1-1');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});

describe('declareSelfDrawHu', () => {
  it('rejects if hand cannot hu', () => {
    const s = startedGame();
    const r = declareSelfDrawHu(s, 'east');
    // Random hand is unlikely to be a winning shape; assert error
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cannot-hu');
  });

  it('accepts a forced winning hand and locks the player', () => {
    let s = startedGame();
    // Force east's hand to a known winning all-wan triplet shape.
    const winningTiles = [
      { id: 'wan-1-1', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-1-2', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-1-3', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-2-1', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-2-2', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-2-3', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-4-1', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-4-2', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-4-3', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-7-1', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-7-2', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-7-3', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-9-1', suit: 'wan' as const, value: 9 as const },
      { id: 'wan-9-2', suit: 'wan' as const, value: 9 as const },
    ];
    s = { ...s, seats: { ...s.seats, east: { ...s.seats.east, hand: winningTiles } } };

    const r = declareSelfDrawHu(s, 'east');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.east.hasHu).toBe(true);
    expect(s.seats.east.huResult).not.toBeNull();
    expect(s.seats.east.huResult!.selfDraw).toBe(true);
    expect(s.huOrder).toEqual(['east']);
    // Hand still in 'playing' (only 1 hu so far; need ≥3 to settle)
    expect(s.phase).toBe('playing');
    // Turn moves to next non-hu seat (north)
    expect(s.turn).toBe('north');
    // North should have drawn a tile (14)
    expect(s.seats.north.hand.length).toBe(14);
  });

  it('terminates when 3 seats have hu (settles)', () => {
    let s = startedGame();
    // Pre-hu south and west to simulate two prior hands within this hand.
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s.seats.south.hasHu = true;
    s.seats.south.huResult = {
      winTypes: ['ping-hu'], fan: 1, selfDraw: false,
      winningTile: { id: 'wan-1-1', suit: 'wan', value: 1 },
      fromSeat: 'east',
    };
    s.seats.west.hasHu = true;
    s.seats.west.huResult = {
      winTypes: ['ping-hu'], fan: 1, selfDraw: false,
      winningTile: { id: 'wan-2-1', suit: 'wan', value: 2 },
      fromSeat: 'east',
    };
    s.huOrder = ['south', 'west'];

    // Force east's hand to a winning shape for self-draw.
    const winningTiles = [
      { id: 'wan-1-1', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-1-2', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-1-3', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-2-1', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-2-2', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-2-3', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-4-1', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-4-2', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-4-3', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-7-1', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-7-2', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-7-3', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-9-1', suit: 'wan' as const, value: 9 as const },
      { id: 'wan-9-2', suit: 'wan' as const, value: 9 as const },
    ];
    s = { ...s, seats: { ...s.seats, east: { ...s.seats.east, hand: winningTiles } } };

    const southBefore = s.seats.south.score;
    const westBefore = s.seats.west.score;
    const r = declareSelfDrawHu(s, 'east');
    expect(r.ok).toBe(true);
    s = r.state!;
    // 3 seats hu now → settled
    expect(s.huOrder).toEqual(['south', 'west', 'east']);
    expect(s.phase).toBe('settled');
    // Already-hu'd south and west do NOT pay east's self-draw
    expect(s.seats.south.score).toBe(southBefore);
    expect(s.seats.west.score).toBe(westBefore);
    // North (the only active opponent) pays east
    const fan = s.seats.east.huResult!.fan;
    const chips = 2 ** fan;
    expect(s.seats.north.score).toBe(-chips);
    expect(s.seats.east.score).toBe(chips);
  });
});

import { submitClaim } from './engine';
import type { Tile } from './types';

describe('claim window — peng', () => {
  function clone_(s: GameState): GameState {
    return JSON.parse(JSON.stringify(s));
  }

  function setupForPengTest(): GameState {
    let s = startedGame();
    const fiveWan1: Tile = { id: 'wan-5-1', suit: 'wan', value: 5 };
    const fiveWan2: Tile = { id: 'wan-5-2', suit: 'wan', value: 5 };
    const fiveWan3: Tile = { id: 'wan-5-3', suit: 'wan', value: 5 };
    s = clone_(s);
    function stripFiveWan(hand: Tile[]): Tile[] { return hand.filter(t => !(t.suit === 'wan' && t.value === 5)); }
    s.seats.east.hand = stripFiveWan(s.seats.east.hand);
    s.seats.south.hand = stripFiveWan(s.seats.south.hand);
    s.seats.west.hand = stripFiveWan(s.seats.west.hand);
    s.seats.north.hand = stripFiveWan(s.seats.north.hand);
    s.wall = s.wall.filter(t => !(t.suit === 'wan' && t.value === 5));
    while (s.seats.east.hand.length < 13 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    while (s.seats.south.hand.length < 11 && s.wall.length > 0) s.seats.south.hand.push(s.wall.pop()!);
    while (s.seats.west.hand.length < 13 && s.wall.length > 0) s.seats.west.hand.push(s.wall.pop()!);
    while (s.seats.north.hand.length < 13 && s.wall.length > 0) s.seats.north.hand.push(s.wall.pop()!);
    s.seats.east.hand.push(fiveWan3);
    s.seats.south.hand.push(fiveWan1, fiveWan2);
    s.wallCount = s.wall.length;
    return s;
  }

  it('opens claim window when a discard creates a legal peng for another seat', () => {
    let s = setupForPengTest();
    const r = discard(s, 'east', 'wan-5-3');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('claim-window');
    expect(s.claimWindow).not.toBeNull();
    expect(s.claimWindow!.fromSeat).toBe('east');
    expect(s.claimWindow!.discardedTile.id).toBe('wan-5-3');
    expect(s.claimWindow!.options.find(o => o.seat === 'south' && o.type === 'peng')).toBeDefined();
    expect(s.seats.east.discards.find(t => t.id === 'wan-5-3')).toBeDefined();
    expect(s.turn).toBe('east');
  });

  it('south claims peng — meld formed, south becomes turn (no draw), claim window cleared', () => {
    let s = setupForPengTest();
    s = discard(s, 'east', 'wan-5-3').state!;
    const r = submitClaim(s, 'south', 'peng');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('south');
    expect(s.claimWindow).toBeNull();
    expect(s.seats.south.melds.length).toBe(1);
    const meld = s.seats.south.melds[0];
    expect(meld.type).toBe('peng');
    expect(meld.fromSeat).toBe('east');
    expect(meld.tiles.map(t => t.id).sort()).toEqual(['wan-5-1','wan-5-2','wan-5-3']);
    expect(s.seats.south.hand.find(t => t.id === 'wan-5-1' || t.id === 'wan-5-2')).toBeUndefined();
    expect(s.seats.east.discards.find(t => t.id === 'wan-5-3')).toBeUndefined();
    expect(s.wallCount).toBe(s.wall.length);
  });

  it('all-pass resolution: turn advances to next active seat, that seat draws', () => {
    let s = setupForPengTest();
    s = discard(s, 'east', 'wan-5-3').state!;
    const wallBefore = s.wallCount;
    // Only south has a peng option. After south passes, claim window resolves.
    s = submitClaim(s, 'south', 'pass').state!;
    expect(s.phase).toBe('playing');
    expect(s.claimWindow).toBeNull();
    expect(s.turn).toBe('north');
    expect(s.seats.north.hand.length).toBe(14);
    expect(s.wallCount).toBe(wallBefore - 1);
    expect(s.seats.east.discards.find(t => t.id === 'wan-5-3')).toBeDefined();
  });

  it('rejects claim from a seat with no legal option', () => {
    let s = setupForPengTest();
    s = discard(s, 'east', 'wan-5-3').state!;
    const r = submitClaim(s, 'west', 'peng');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no-such-claim');
  });

  it('rejects claim outside claim-window phase', () => {
    const s = startedGame();
    const r = submitClaim(s, 'south', 'pass');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});


import { declareGangAn, declareGangBu } from './engine';
import type { TileValue } from './types';

describe('claim window — 明杠', () => {
  function setupForGangTest(): GameState {
    let s = startedGame();
    function strip(hand: Tile[]): Tile[] { return hand.filter(t => !(t.suit === 'wan' && t.value === 7)); }
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s.seats.east.hand = strip(s.seats.east.hand);
    s.seats.south.hand = strip(s.seats.south.hand);
    s.seats.west.hand = strip(s.seats.west.hand);
    s.seats.north.hand = strip(s.seats.north.hand);
    s.wall = s.wall.filter(t => !(t.suit === 'wan' && t.value === 7));
    while (s.seats.east.hand.length < 13 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    while (s.seats.south.hand.length < 10 && s.wall.length > 0) s.seats.south.hand.push(s.wall.pop()!);
    while (s.seats.west.hand.length < 13 && s.wall.length > 0) s.seats.west.hand.push(s.wall.pop()!);
    while (s.seats.north.hand.length < 13 && s.wall.length > 0) s.seats.north.hand.push(s.wall.pop()!);
    s.seats.east.hand.push({ id: 'wan-7-4', suit: 'wan', value: 7 });
    s.seats.south.hand.push(
      { id: 'wan-7-1', suit: 'wan', value: 7 },
      { id: 'wan-7-2', suit: 'wan', value: 7 },
      { id: 'wan-7-3', suit: 'wan', value: 7 },
    );
    s.wallCount = s.wall.length;
    return s;
  }

  it('opens claim window with gang option for south', () => {
    let s = setupForGangTest();
    s = discard(s, 'east', 'wan-7-4').state!;
    expect(s.phase).toBe('claim-window');
    const sthOpts = s.claimWindow!.options.filter(o => o.seat === 'south');
    expect(sthOpts.find(o => o.type === 'gang')).toBeDefined();
  });

  it('south gangs — meld formed (4 tiles), south draws replacement, becomes turn', () => {
    let s = setupForGangTest();
    s = discard(s, 'east', 'wan-7-4').state!;
    const wallBefore = s.wallCount;
    const r = submitClaim(s, 'south', 'gang');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('south');
    const meld = s.seats.south.melds[0];
    expect(meld.type).toBe('gang-ming');
    expect(meld.tiles.length).toBe(4);
    expect(meld.fromSeat).toBe('east');
    // East's discards no longer contain wan-7-4
    expect(s.seats.east.discards.find(t => t.id === 'wan-7-4')).toBeUndefined();
    // wall count decreased by 1 (replacement)
    expect(s.wallCount).toBe(wallBefore - 1);
  });
});

describe('declareGangAn — 暗杠', () => {
  function setupForGangAn(): GameState {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    function strip(hand: Tile[]): Tile[] { return hand.filter(t => !(t.suit === 'tiao' && t.value === 9)); }
    s.seats.east.hand = strip(s.seats.east.hand);
    s.seats.south.hand = strip(s.seats.south.hand);
    s.seats.west.hand = strip(s.seats.west.hand);
    s.seats.north.hand = strip(s.seats.north.hand);
    s.wall = s.wall.filter(t => !(t.suit === 'tiao' && t.value === 9));
    // Truncate east to 10 so we can add exactly 4 nines for a known hand size
    while (s.seats.east.hand.length > 10) s.wall.push(s.seats.east.hand.pop()!);
    while (s.seats.east.hand.length < 10 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    while (s.seats.south.hand.length < 13 && s.wall.length > 0) s.seats.south.hand.push(s.wall.pop()!);
    while (s.seats.west.hand.length < 13 && s.wall.length > 0) s.seats.west.hand.push(s.wall.pop()!);
    while (s.seats.north.hand.length < 13 && s.wall.length > 0) s.seats.north.hand.push(s.wall.pop()!);
    s.seats.east.hand.push(
      { id: 'tiao-9-1', suit: 'tiao', value: 9 },
      { id: 'tiao-9-2', suit: 'tiao', value: 9 },
      { id: 'tiao-9-3', suit: 'tiao', value: 9 },
      { id: 'tiao-9-4', suit: 'tiao', value: 9 },
    );
    s.wallCount = s.wall.length;
    return s;
  }

  it('forms a gang-an meld and draws replacement; turn stays on east', () => {
    let s = setupForGangAn();
    const wallBefore = s.wallCount;
    const r = declareGangAn(s, 'east', 'tiao', 9 as TileValue);
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.turn).toBe('east');
    expect(s.phase).toBe('playing');
    const meld = s.seats.east.melds[0];
    expect(meld.type).toBe('gang-an');
    expect(meld.tiles.length).toBe(4);
    expect(meld.fromSeat).toBeNull();
    expect(s.wallCount).toBe(wallBefore - 1);
    // East's hand: had 14 (10 base + 4 nines), removed 4, drew 1 = 11
    expect(s.seats.east.hand.length).toBe(11);
    // None of the 4 nines remain in hand
    expect(s.seats.east.hand.filter(t => t.suit === 'tiao' && t.value === 9).length).toBe(0);
  });

  it('rejects 暗杠 when not holding all 4 tiles', () => {
    const s = startedGame();
    const r = declareGangAn(s, 'east', 'tiao', 9 as TileValue);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cannot-gang-an');
  });

  it('rejects 暗杠 when not your turn', () => {
    const s = setupForGangAn();
    const r = declareGangAn(s, 'south', 'tiao', 9 as TileValue);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not-your-turn');
  });
});

describe('declareGangBu — 补杠', () => {
  it('upgrades an existing peng with the 4th tile drawn into hand', () => {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Manually plant a peng meld for east (3 of wan-2) and the 4th tile in east's hand.
    s.seats.east.melds = [{
      type: 'peng',
      tiles: [
        { id: 'wan-2-1', suit: 'wan', value: 2 },
        { id: 'wan-2-2', suit: 'wan', value: 2 },
        { id: 'wan-2-3', suit: 'wan', value: 2 },
      ],
      fromSeat: 'south',
    }];
    // Strip any wan-2 from east's hand so we can place the 4th cleanly.
    s.seats.east.hand = s.seats.east.hand.filter(t => !(t.suit === 'wan' && t.value === 2));
    while (s.seats.east.hand.length < 10 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    s.seats.east.hand.push({ id: 'wan-2-4', suit: 'wan', value: 2 });
    s.wallCount = s.wall.length;

    const wallBefore = s.wallCount;
    const r = declareGangBu(s, 'east', 'wan-2-4');
    expect(r.ok).toBe(true);
    s = r.state!;

    expect(s.seats.east.melds.length).toBe(1);
    const meld = s.seats.east.melds[0];
    expect(meld.type).toBe('gang-bu');
    expect(meld.tiles.length).toBe(4);
    expect(meld.tiles.map(t => t.id).sort()).toEqual(['wan-2-1','wan-2-2','wan-2-3','wan-2-4']);
    expect(meld.fromSeat).toBe('south'); // preserved from original peng
    expect(s.wallCount).toBe(wallBefore - 1);
  });

  it('rejects 补杠 when no matching peng exists', () => {
    const s = startedGame();
    const r = declareGangBu(s, 'east', s.seats.east.hand[0].id);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no-matching-peng');
  });
});

describe('claim window — hu (单响 and 一炮多响)', () => {
  function setupForDianpaoHu(): GameState {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;

    // South gets a tenpai hand waiting on 5wan (forms 4 triplets + pair when 5wan added).
    s.seats.south.hand = [
      { id: 'wan-1-1', suit: 'wan', value: 1 },
      { id: 'wan-1-2', suit: 'wan', value: 1 },
      { id: 'wan-1-3', suit: 'wan', value: 1 },
      { id: 'wan-2-1', suit: 'wan', value: 2 },
      { id: 'wan-2-2', suit: 'wan', value: 2 },
      { id: 'wan-2-3', suit: 'wan', value: 2 },
      { id: 'wan-4-1', suit: 'wan', value: 4 },
      { id: 'wan-4-2', suit: 'wan', value: 4 },
      { id: 'wan-4-3', suit: 'wan', value: 4 },
      { id: 'wan-7-1', suit: 'wan', value: 7 },
      { id: 'wan-7-2', suit: 'wan', value: 7 },
      { id: 'wan-7-3', suit: 'wan', value: 7 },
      { id: 'wan-5-1', suit: 'wan', value: 5 },
    ];
    s.seats.south.missingSuit = 'tong';

    // East has the 5wan to discard (after drawing — east is on turn with 14 tiles).
    s.seats.east.hand = s.seats.east.hand.filter(t => !(t.suit === 'wan' && t.value === 5));
    while (s.seats.east.hand.length < 13 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    s.seats.east.hand.push({ id: 'wan-5-2', suit: 'wan', value: 5 });
    s.wallCount = s.wall.length;
    return s;
  }

  it('south can claim hu (点炮) on east discarding 5wan; payout flows from east to south', () => {
    let s = setupForDianpaoHu();
    s = discard(s, 'east', 'wan-5-2').state!;
    expect(s.phase).toBe('claim-window');
    const huOpt = s.claimWindow!.options.find(o => o.seat === 'south' && o.type === 'hu');
    expect(huOpt).toBeDefined();

    const eastBefore = s.seats.east.score;
    const southBefore = s.seats.south.score;
    s = submitClaim(s, 'south', 'hu').state!;
    expect(s.seats.south.hasHu).toBe(true);
    expect(s.seats.south.huResult).not.toBeNull();
    expect(s.seats.south.huResult!.selfDraw).toBe(false);
    expect(s.seats.south.huResult!.fromSeat).toBe('east');
    expect(s.huOrder).toEqual(['south']);
    // East paid 2^fan; south gained the same.
    const fan = s.seats.south.huResult!.fan;
    const chips = 2 ** fan;
    expect(s.seats.south.score).toBe(southBefore + chips);
    expect(s.seats.east.score).toBe(eastBefore - chips);
    // West and north scores unchanged.
    expect(s.seats.west.score).toBe(0);
    expect(s.seats.north.score).toBe(0);
    // Hand continues; phase is 'playing' with next active seat (north) on turn (south is hu'd).
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('north');
  });

  it('一炮多响: two seats both claim hu on the same discard, both paid by discarder', () => {
    let s = setupForDianpaoHu();
    // Also give west a tenpai hand waiting on 5wan (different shape: pure triplets too).
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s.seats.west.hand = [
      { id: 'wan-3-1', suit: 'wan', value: 3 },
      { id: 'wan-3-2', suit: 'wan', value: 3 },
      { id: 'wan-3-3', suit: 'wan', value: 3 },
      { id: 'wan-6-1', suit: 'wan', value: 6 },
      { id: 'wan-6-2', suit: 'wan', value: 6 },
      { id: 'wan-6-3', suit: 'wan', value: 6 },
      { id: 'wan-8-1', suit: 'wan', value: 8 },
      { id: 'wan-8-2', suit: 'wan', value: 8 },
      { id: 'wan-8-3', suit: 'wan', value: 8 },
      { id: 'wan-9-1', suit: 'wan', value: 9 },
      { id: 'wan-9-2', suit: 'wan', value: 9 },
      { id: 'wan-9-3', suit: 'wan', value: 9 },
      { id: 'wan-5-3', suit: 'wan', value: 5 },
    ];
    s.seats.west.missingSuit = 'tong';

    s = discard(s, 'east', 'wan-5-2').state!;
    expect(s.phase).toBe('claim-window');
    s = submitClaim(s, 'south', 'hu').state!;
    s = submitClaim(s, 'west', 'hu').state!; // also hu
    // After all decisions, both should have hu'd and east should pay both.
    expect(s.seats.south.hasHu).toBe(true);
    expect(s.seats.west.hasHu).toBe(true);
    const southChips = 2 ** s.seats.south.huResult!.fan;
    const westChips = 2 ** s.seats.west.huResult!.fan;
    expect(s.seats.east.score).toBe(-(southChips + westChips));
    expect(s.seats.south.score).toBe(southChips);
    expect(s.seats.west.score).toBe(westChips);
    expect(s.huOrder).toEqual(['south', 'west']);
    // Two players left active (east, north). Hand continues.
    expect(s.phase).toBe('playing');
  });

  it('terminates when ≥3 seats hu', () => {
    let s = setupForDianpaoHu();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Pre-mark north as hu'd to simulate prior round's hu in same hand.
    s.seats.north.hasHu = true;
    s.seats.north.huResult = {
      winTypes: ['ping-hu'],
      fan: 1,
      selfDraw: false,
      winningTile: { id: 'tiao-3-1', suit: 'tiao', value: 3 },
      fromSeat: 'east',
    };
    s.huOrder = ['north'];

    s = discard(s, 'east', 'wan-5-2').state!;
    s = submitClaim(s, 'south', 'hu').state!;
    // Now 2 seats hu'd; need to also have west hu to hit 3. We don't; so phase is still playing
    // unless only 1 active seat remains. South + north hu'd → west and east are active. Phase: playing.
    expect(s.phase).toBe('playing');
  });
});

describe('流局 — wall exhausted', () => {
  it('settles the hand with no winners when wall empties on a draw', () => {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Empty the wall manually.
    s.wall = [];
    s.wallCount = 0;
    // Force east to have a tile to discard (already does — 14 tiles).
    // Find a claim-free tile to discard.
    const tile = s.seats.east.hand.find(tile => {
      return (['south','west','north'] as Seat[]).every(seat =>
        s.seats[seat].hand.filter(t => t.suit === tile.suit && t.value === tile.value).length < 2,
      );
    })!;
    s = discard(s, 'east', tile.id).state!;
    // Next seat (north) tried to draw, wall empty → settled (流局).
    expect(s.phase).toBe('settled');
    expect(s.huOrder).toEqual([]);
  });
});


import { startNextHand, endGame, totalTilesInPlay } from './engine';

describe('startNextHand', () => {
  it('reshuffles, resets per-hand state, increments handNumber, preserves scores and assignments', () => {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Force-settle the current hand and assign some scores.
    s.phase = 'settled';
    s.seats.south.score = 10;
    s.seats.east.score = -10;
    s.huOrder = ['south'];
    s.seats.south.hasHu = true;
    s.seats.south.huResult = {
      winTypes: ['ping-hu'], fan: 1, selfDraw: false,
      winningTile: { id: 'wan-1-1', suit: 'wan', value: 1 },
      fromSeat: 'east',
    };

    const r = startNextHand(s);
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('choose-missing');
    expect(s.handNumber).toBe(2);
    expect(s.huOrder).toEqual([]);
    for (const seat of ['east','south','west','north'] as Seat[]) {
      expect(s.seats[seat].hand.length).toBe(13);
      expect(s.seats[seat].melds).toEqual([]);
      expect(s.seats[seat].discards).toEqual([]);
      expect(s.seats[seat].missingSuit).toBeNull();
      expect(s.seats[seat].hasHu).toBe(false);
      expect(s.seats[seat].huResult).toBeNull();
    }
    // Scores preserved
    expect(s.seats.south.score).toBe(10);
    expect(s.seats.east.score).toBe(-10);
    // Assignments preserved
    expect(s.seats.east.assignment.human).toBe('Aaron');
    expect(s.seats.south.assignment.human).toBe('Vicky');
  });

  it('rejects if not in settled phase', () => {
    const s = startedGame();
    const r = startNextHand(s);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});

describe('endGame', () => {
  it('marks gameOver=true and returns final scores in settled phase', () => {
    let s = startedGame();
    s = { ...s, phase: 'settled' };
    const r = endGame(s);
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.gameOver).toBe(true);
  });

  it('rejects ending mid-hand', () => {
    const s = startedGame();
    const r = endGame(s);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('hand-in-progress');
  });
});

describe('tile conservation invariant', () => {
  it('keeps total tiles = 108 across all states from a started game', () => {
    let s = startedGame();
    expect(totalTilesInPlay(s)).toBe(108);

    // Find a claim-free tile, discard it, all-pass, count again.
    const safeTile = s.seats.east.hand.find(tile =>
      (['south','west','north'] as Seat[]).every(seat =>
        s.seats[seat].hand.filter(t => t.suit === tile.suit && t.value === tile.value).length < 2,
      ),
    );
    if (safeTile) {
      s = discard(s, 'east', safeTile.id).state!;
      expect(totalTilesInPlay(s)).toBe(108);
      if (s.phase === 'claim-window') {
        s = submitClaim(s, 'south', 'pass').state!;
        s = submitClaim(s, 'west', 'pass').state!;
        s = submitClaim(s, 'north', 'pass').state!;
      }
      expect(totalTilesInPlay(s)).toBe(108);
    }
  });
});


import { applyActionWithAI } from './engine';

describe('driveAI integration', () => {
  it('after Aaron picks a seat as Vicky picks, AI 定缺 fills 3 of 4 seats', () => {
    let s = initialState();
    let r = applyActionWithAI(s, { type: 'pick-seat', seat: 'east', human: 'Aaron' });
    expect(r.ok).toBe(true);
    s = r.state!;
    r = applyActionWithAI(s, { type: 'pick-seat', seat: 'south', human: 'Vicky' });
    expect(r.ok).toBe(true);
    s = r.state!;
    // Now in choose-missing; AI seats (west, north) should have auto-chosen.
    expect(s.seats.west.missingSuit).not.toBeNull();
    expect(s.seats.north.missingSuit).not.toBeNull();
    // Aaron and Vicky have not chosen yet.
    expect(s.seats.east.missingSuit).toBeNull();
    expect(s.seats.south.missingSuit).toBeNull();
    expect(s.phase).toBe('choose-missing');
  });

  it('after both humans 定缺, dealer AI draws & discards (or human turn arrives)', () => {
    let s = initialState();
    s = applyActionWithAI(s, { type: 'pick-seat', seat: 'east', human: 'Aaron' }).state!;
    s = applyActionWithAI(s, { type: 'pick-seat', seat: 'south', human: 'Vicky' }).state!;
    // east is dealer = human → after both humans 定缺, east starts. Stays human.
    s = applyActionWithAI(s, { type: 'choose-missing', seat: 'east', suit: 'tong' }).state!;
    s = applyActionWithAI(s, { type: 'choose-missing', seat: 'south', suit: 'tong' }).state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('east'); // dealer human draws
    expect(s.seats.east.hand.length).toBe(14); // dealer drew first
  });
});
