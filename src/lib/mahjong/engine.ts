import type {
  GameState,
  Seat,
  HumanName,
  PlayerState,
  Suit,
  TileId,
  HuResult,
  WinType,
} from './types';
import { TURN_ORDER } from './types';
import { buildWall, shuffle } from './tiles';
import { canHu } from './hu';
import { computeFan, chipsForFan } from './scoring';

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
  | { type: 'choose-missing'; seat: Seat; suit: Suit }
  | { type: 'discard'; seat: Seat; tileId: TileId }
  | { type: 'self-draw-hu'; seat: Seat };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat':      return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    case 'discard':        return discard(state, action.seat, action.tileId);
    case 'self-draw-hu':   return declareSelfDrawHu(state, action.seat);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}


// Find next seat in turn order that hasn't hu'd yet.
function nextActiveSeat(state: GameState, from: Seat): Seat | null {
  let cur = from;
  for (let i = 0; i < 4; i++) {
    const idx = TURN_ORDER.indexOf(cur);
    cur = TURN_ORDER[(idx + 1) % 4];
    if (!state.seats[cur].hasHu) return cur;
  }
  return null;
}

function activeSeatCount(state: GameState): number {
  return ALL_SEATS.filter(s => !state.seats[s].hasHu).length;
}

// Pull next tile off the wall (top = end of array). Mutates state.
function drawTileFor(state: GameState, seat: Seat): boolean {
  const tile = state.wall.pop();
  if (!tile) return false;
  state.seats[seat].hand.push(tile);
  state.wallCount = state.wall.length;
  return true;
}

// Apply scoring deltas. Mutates state.
function applyHuPayout(state: GameState, winnerSeat: Seat): void {
  const winner = state.seats[winnerSeat];
  const huResult = winner.huResult;
  if (!huResult) return;
  const chips = chipsForFan(huResult.fan);
  if (huResult.selfDraw) {
    for (const seat of ALL_SEATS) {
      if (seat === winnerSeat) continue;
      if (state.seats[seat].hasHu) continue;
      state.seats[seat].score -= chips;
      winner.score += chips;
    }
  } else if (huResult.fromSeat) {
    state.seats[huResult.fromSeat].score -= chips;
    winner.score += chips;
  }
}

// Check whether the hand should terminate (≥3 hu OR ≤1 active seat OR wall empty).
function checkTerminate(state: GameState): void {
  if (state.huOrder.length >= 3 || activeSeatCount(state) <= 1) {
    state.phase = 'settled';
    return;
  }
  if (state.wallCount === 0 && state.phase === 'playing') {
    state.phase = 'settled'; // 流局
  }
}

export function discard(state: GameState, seat: Seat, tileId: TileId): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const idx = state.seats[seat].hand.findIndex(t => t.id === tileId);
  if (idx === -1) return { ok: false, error: 'tile-not-in-hand' };

  const next = clone(state);
  const [tile] = next.seats[seat].hand.splice(idx, 1);
  next.seats[seat].discards.push(tile);
  next.lastDiscard = { seat, tile };

  // Task 8: no claim window yet — Task 9 will add it.
  const target = nextActiveSeat(next, seat);
  if (!target) {
    next.phase = 'settled';
    return { ok: true, state: bumpVersion(next) };
  }
  next.turn = target;
  if (!drawTileFor(next, target)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}

export function declareSelfDrawHu(state: GameState, seat: Seat): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const player = state.seats[seat];
  if (player.hand.length !== 14) return { ok: false, error: 'wrong-hand-size' };

  const result = canHu(player.hand, player.melds, player.missingSuit);
  if (!result.canHu) return { ok: false, error: 'cannot-hu' };

  const next = clone(state);
  const winningTile = next.seats[seat].hand[next.seats[seat].hand.length - 1];
  const winTypes: WinType[] = result.winTypes;
  const fan = computeFan(winTypes, true);
  const huResult: HuResult = { winTypes, fan, selfDraw: true, winningTile, fromSeat: null };
  next.seats[seat].hasHu = true;
  next.seats[seat].huResult = huResult;
  next.huOrder.push(seat);
  applyHuPayout(next, seat);
  checkTerminate(next);

  if (next.phase !== 'settled') {
    const target = nextActiveSeat(next, seat);
    if (!target) {
      next.phase = 'settled';
    } else {
      next.turn = target;
      if (!drawTileFor(next, target)) next.phase = 'settled';
      checkTerminate(next);
    }
  }
  return { ok: true, state: bumpVersion(next) };
}
