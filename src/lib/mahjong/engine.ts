import type {
  GameState,
  Seat,
  HumanName,
  PlayerState,
  Suit,
} from './types';
import { buildWall, shuffle } from './tiles';

const ALL_SEATS: Seat[] = ['east', 'south', 'west', 'north'];

export interface ActionResult {
  ok: boolean;
  state?: GameState;
  error?: string;
}

function emptyPlayer(seat: Seat): PlayerState {
  return {
    seat,
    assignment: { seat, kind: 'ai', aiId: `AI-${seat}` },
    hand: [],
    melds: [],
    discards: [],
    missingSuit: null,
    hasHu: false,
    huResult: null,
    score: 0,
  };
}

export function initialState(): GameState {
  return {
    version: 0,
    phase: 'seat-selection',
    wall: [],
    wallCount: 0,
    seats: {
      east: emptyPlayer('east'),
      south: emptyPlayer('south'),
      west: emptyPlayer('west'),
      north: emptyPlayer('north'),
    },
    turn: 'east',
    dealer: 'east',
    lastDiscard: null,
    claimWindow: null,
    huOrder: [],
    gameOver: false,
    handNumber: 0,
  };
}

function bumpVersion(s: GameState): GameState {
  return { ...s, version: s.version + 1 };
}

function clone(s: GameState): GameState {
  return {
    ...s,
    wall: [...s.wall],
    huOrder: [...s.huOrder],
    seats: {
      east:  { ...s.seats.east,  hand: [...s.seats.east.hand],  melds: s.seats.east.melds.map(m => ({ ...m, tiles: [...m.tiles] })),  discards: [...s.seats.east.discards]  },
      south: { ...s.seats.south, hand: [...s.seats.south.hand], melds: s.seats.south.melds.map(m => ({ ...m, tiles: [...m.tiles] })), discards: [...s.seats.south.discards] },
      west:  { ...s.seats.west,  hand: [...s.seats.west.hand],  melds: s.seats.west.melds.map(m => ({ ...m, tiles: [...m.tiles] })),  discards: [...s.seats.west.discards]  },
      north: { ...s.seats.north, hand: [...s.seats.north.hand], melds: s.seats.north.melds.map(m => ({ ...m, tiles: [...m.tiles] })), discards: [...s.seats.north.discards] },
    },
  };
}

function fillAISeats(s: GameState): GameState {
  const out = clone(s);
  let aiCounter = 1;
  for (const seat of ALL_SEATS) {
    if (out.seats[seat].assignment.kind !== 'human') {
      out.seats[seat].assignment = { seat, kind: 'ai', aiId: `AI-${aiCounter}` };
      aiCounter++;
    }
  }
  return out;
}

function dealHand(s: GameState): GameState {
  const out = clone(s);
  out.wall = shuffle(buildWall());
  for (const seat of ALL_SEATS) {
    out.seats[seat].hand = out.wall.splice(out.wall.length - 13, 13);
    out.seats[seat].melds = [];
    out.seats[seat].discards = [];
    out.seats[seat].missingSuit = null;
    out.seats[seat].hasHu = false;
    out.seats[seat].huResult = null;
  }
  out.wallCount = out.wall.length;
  out.lastDiscard = null;
  out.claimWindow = null;
  out.huOrder = [];
  out.handNumber += 1;
  out.phase = 'choose-missing';
  return out;
}

export function pickSeat(state: GameState, seat: Seat, human: HumanName): ActionResult {
  if (state.phase !== 'seat-selection') {
    return { ok: false, error: 'wrong-phase' };
  }
  for (const s of ALL_SEATS) {
    const a = state.seats[s].assignment;
    if (a.kind === 'human' && a.human === human) {
      return { ok: false, error: 'already-assigned' };
    }
  }
  if (state.seats[seat].assignment.kind === 'human') {
    return { ok: false, error: 'seat-taken' };
  }

  let next = clone(state);
  next.seats[seat].assignment = { seat, kind: 'human', human };

  const humansSeated = ALL_SEATS.filter(s => next.seats[s].assignment.kind === 'human').length;
  if (humansSeated === 2) {
    next = fillAISeats(next);
    next = dealHand(next);
  }

  return { ok: true, state: bumpVersion(next) };
}

export function chooseMissing(state: GameState, seat: Seat, suit: Suit): ActionResult {
  if (state.phase !== 'choose-missing') {
    return { ok: false, error: 'wrong-phase' };
  }
  if (state.seats[seat].missingSuit !== null) {
    return { ok: false, error: 'already-chosen' };
  }

  let next = clone(state);
  next.seats[seat].missingSuit = suit;

  const allChosen = ALL_SEATS.every(s => next.seats[s].missingSuit !== null);
  if (allChosen) {
    next.phase = 'playing';
    next.turn = next.dealer;
    const drawn = next.wall.pop();
    if (!drawn) {
      return { ok: false, error: 'internal' };
    }
    next.seats[next.dealer].hand.push(drawn);
    next.wallCount = next.wall.length;
  }

  return { ok: true, state: bumpVersion(next) };
}

export type Action =
  | { type: 'pick-seat'; seat: Seat; human: HumanName }
  | { type: 'choose-missing'; seat: Seat; suit: Suit };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat':      return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}
