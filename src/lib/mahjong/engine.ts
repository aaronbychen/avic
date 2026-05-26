import type {
  GameState,
  Seat,
  HumanName,
  PlayerState,
  Suit,
  TileId,
  TileValue,
  Tile,
  HuResult,
  WinType,
  ClaimOption,
  Meld,
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
  | { type: 'self-draw-hu'; seat: Seat }
  | { type: 'claim'; seat: Seat; choice: 'peng' | 'gang' | 'hu' | 'pass' }
  | { type: 'gang-an'; seat: Seat; suit: Suit; value: import('./types').TileValue }
  | { type: 'gang-bu'; seat: Seat; tileId: TileId }
  | { type: 'start-next-hand' }
  | { type: 'end-game' };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat':        return pickSeat(state, action.seat, action.human);
    case 'choose-missing':   return chooseMissing(state, action.seat, action.suit);
    case 'discard':          return discard(state, action.seat, action.tileId);
    case 'self-draw-hu':     return declareSelfDrawHu(state, action.seat);
    case 'claim':            return submitClaim(state, action.seat, action.choice);
    case 'gang-an':          return declareGangAn(state, action.seat, action.suit, action.value);
    case 'gang-bu':          return declareGangBu(state, action.seat, action.tileId);
    case 'start-next-hand':  return startNextHand(state);
    case 'end-game':         return endGame(state);
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

function countMatchingInHand(hand: readonly Tile[], suit: Suit, value: number): number {
  return hand.filter(t => t.suit === suit && t.value === value).length;
}

function computeClaimOptions(state: GameState, fromSeat: Seat, tile: Tile): ClaimOption[] {
  const options: ClaimOption[] = [];
  for (const seat of ALL_SEATS) {
    if (seat === fromSeat) continue;
    if (state.seats[seat].hasHu) continue;
    const player = state.seats[seat];
    const matching = countMatchingInHand(player.hand, tile.suit, tile.value);
    if (matching >= 3) {
      options.push({ seat, type: 'gang' });
    }
    if (matching >= 2) {
      options.push({ seat, type: 'peng' });
    }
    // Hu: hand + tile would form a hu shape, missing-suit OK.
    const tempHand = [...player.hand, tile];
    const huCheck = canHu(tempHand, player.melds, player.missingSuit);
    if (huCheck.canHu) {
      options.push({ seat, type: 'hu' });
    }
  }
  return options;
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

  const options = computeClaimOptions(next, seat, tile);
  if (options.length > 0) {
    next.phase = 'claim-window';
    // For hu claims, all seats with a hu option must decide (一炮多响).
    // For peng/gang only, only humans need to decide (AIs auto-pass).
    const huSeats = new Set(options.filter(o => o.type === 'hu').map(o => o.seat));
    next.claimWindow = {
      discardedTile: tile,
      fromSeat: seat,
      options,
      pending: ALL_SEATS.filter(s =>
        options.some(o => o.seat === s) &&
        (huSeats.has(s) || next.seats[s].assignment.kind === 'human'),
      ),
      decisions: [],
      expiresAt: Date.now() + 10_000,
    };
    return { ok: true, state: bumpVersion(next) };
  }

  const target = nextActiveSeat(next, seat);
  if (!target) {
    next.phase = 'settled';
    return { ok: true, state: bumpVersion(next) };
  }
  next.turn = target;
  if (!drawTileFor(next, target)) next.phase = 'settled';
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}

export function submitClaim(
  state: GameState,
  seat: Seat,
  choice: 'peng' | 'gang' | 'hu' | 'pass',
): ActionResult {
  if (state.phase !== 'claim-window' || !state.claimWindow) {
    return { ok: false, error: 'wrong-phase' };
  }
  const cw = state.claimWindow;
  if (choice !== 'pass') {
    if (!cw.options.some(o => o.seat === seat && o.type === choice)) {
      return { ok: false, error: 'no-such-claim' };
    }
  }
  if (cw.decisions.some(d => d.seat === seat)) {
    return { ok: false, error: 'already-decided' };
  }

  const next = clone(state);
  next.claimWindow!.decisions.push({ seat, choice });
  next.claimWindow!.pending = next.claimWindow!.pending.filter(s => s !== seat);

  if (next.claimWindow!.pending.length > 0) {
    return { ok: true, state: bumpVersion(next) };
  }

  return { ok: true, state: bumpVersion(resolveClaimWindow(next)) };
}

function resolveClaimWindow(state: GameState): GameState {
  const cw = state.claimWindow!;
  const next = clone(state);

  const huClaims = cw.decisions.filter(d => d.choice === 'hu');
  const gangClaim = cw.decisions.find(d => d.choice === 'gang');
  const pengClaim = cw.decisions.find(d => d.choice === 'peng');

  if (huClaims.length > 0) {
    return resolveHuClaims(next, huClaims.map(c => c.seat));
  }
  if (gangClaim) {
    return resolveGangMing(next, gangClaim.seat);
  }
  if (pengClaim) {
    return resolvePeng(next, pengClaim.seat);
  }
  return resolveAllPass(next);
}

function resolveHuClaims(state: GameState, winners: Seat[]): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  const tile = cw.discardedTile;
  const fromSeat = cw.fromSeat;

  // Remove the discarded tile from discarder's discards (it conceptually goes to the winner).
  const di = next.seats[fromSeat].discards.findIndex(t => t.id === tile.id);
  if (di !== -1) next.seats[fromSeat].discards.splice(di, 1);
  next.lastDiscard = null;

  for (const seat of winners) {
    const player = next.seats[seat];
    const tempHand = [...player.hand, tile];
    const result = canHu(tempHand, player.melds, player.missingSuit);
    if (!result.canHu) continue;
    const fan = computeFan(result.winTypes, false);
    const huResult: HuResult = {
      winTypes: result.winTypes,
      fan,
      selfDraw: false,
      winningTile: tile,
      fromSeat,
    };
    player.huResult = huResult;
    player.hasHu = true;
    next.huOrder.push(seat);
    applyHuPayout(next, seat);
  }

  next.claimWindow = null;
  checkTerminate(next);

  if (next.phase !== 'settled') {
    const target = nextActiveSeat(next, fromSeat);
    if (!target) {
      next.phase = 'settled';
    } else {
      next.phase = 'playing';
      next.turn = target;
      if (!drawTileFor(next, target)) {
        next.phase = 'settled';
      }
      checkTerminate(next);
    }
  }
  return next;
}

function resolvePeng(state: GameState, seat: Seat): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  const tile = cw.discardedTile;
  const fromSeat = cw.fromSeat;

  const di = next.seats[fromSeat].discards.findIndex(t => t.id === tile.id);
  if (di !== -1) next.seats[fromSeat].discards.splice(di, 1);
  next.lastDiscard = null;

  const claimerHand = next.seats[seat].hand;
  const taken: Tile[] = [];
  for (let i = claimerHand.length - 1; i >= 0 && taken.length < 2; i--) {
    if (claimerHand[i].suit === tile.suit && claimerHand[i].value === tile.value) {
      taken.push(...claimerHand.splice(i, 1));
    }
  }
  const meld: Meld = { type: 'peng', tiles: [tile, ...taken], fromSeat };
  next.seats[seat].melds.push(meld);
  next.phase = 'playing';
  next.turn = seat;
  next.claimWindow = null;
  return next;
}

function resolveGangMing(state: GameState, seat: Seat): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  const tile = cw.discardedTile;

  // Remove from discarder's discards
  const di = next.seats[cw.fromSeat].discards.findIndex(t => t.id === tile.id);
  if (di !== -1) next.seats[cw.fromSeat].discards.splice(di, 1);
  next.lastDiscard = null;

  // Take 3 matching tiles from claimer's hand
  const hand = next.seats[seat].hand;
  const taken: Tile[] = [];
  for (let i = hand.length - 1; i >= 0 && taken.length < 3; i--) {
    if (hand[i].suit === tile.suit && hand[i].value === tile.value) {
      taken.push(...hand.splice(i, 1));
    }
  }
  const meld: Meld = { type: 'gang-ming', tiles: [tile, ...taken], fromSeat: cw.fromSeat };
  next.seats[seat].melds.push(meld);

  next.phase = 'playing';
  next.turn = seat;
  next.claimWindow = null;
  if (!drawTileFor(next, seat)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return next;
}

export function declareGangAn(
  state: GameState,
  seat: Seat,
  suit: Suit,
  value: import('./types').TileValue,
): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const matches = state.seats[seat].hand.filter(t => t.suit === suit && t.value === value);
  if (matches.length !== 4) return { ok: false, error: 'cannot-gang-an' };

  const next = clone(state);
  next.seats[seat].hand = next.seats[seat].hand.filter(t => !(t.suit === suit && t.value === value));
  const meld: Meld = { type: 'gang-an', tiles: matches, fromSeat: null };
  next.seats[seat].melds.push(meld);

  if (!drawTileFor(next, seat)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}

export function declareGangBu(state: GameState, seat: Seat, tileId: TileId): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const handIdx = state.seats[seat].hand.findIndex(t => t.id === tileId);
  if (handIdx === -1) return { ok: false, error: 'tile-not-in-hand' };
  const tile = state.seats[seat].hand[handIdx];

  const pengIdx = state.seats[seat].melds.findIndex(
    m => m.type === 'peng' && m.tiles[0].suit === tile.suit && m.tiles[0].value === tile.value,
  );
  if (pengIdx === -1) return { ok: false, error: 'no-matching-peng' };

  const next = clone(state);
  const peng = next.seats[seat].melds[pengIdx];
  next.seats[seat].hand.splice(handIdx, 1);
  next.seats[seat].melds[pengIdx] = {
    type: 'gang-bu',
    tiles: [...peng.tiles, tile],
    fromSeat: peng.fromSeat,
  };

  if (!drawTileFor(next, seat)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}

function resolveAllPass(state: GameState): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  next.claimWindow = null;
  next.phase = 'playing';
  const target = nextActiveSeat(next, cw.fromSeat);
  if (!target) {
    next.phase = 'settled';
    return next;
  }
  next.turn = target;
  if (!drawTileFor(next, target)) next.phase = 'settled';
  checkTerminate(next);
  return next;
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

export function startNextHand(state: GameState): ActionResult {
  if (state.phase !== 'settled') return { ok: false, error: 'wrong-phase' };
  if (state.gameOver) return { ok: false, error: 'game-over' };
  const next = clone(state);
  next.wall = shuffle(buildWall());
  for (const seat of ALL_SEATS) {
    next.seats[seat].hand = next.wall.splice(next.wall.length - 13, 13);
    next.seats[seat].melds = [];
    next.seats[seat].discards = [];
    next.seats[seat].missingSuit = null;
    next.seats[seat].hasHu = false;
    next.seats[seat].huResult = null;
  }
  next.wallCount = next.wall.length;
  next.lastDiscard = null;
  next.claimWindow = null;
  next.huOrder = [];
  next.turn = next.dealer;
  next.handNumber += 1;
  next.phase = 'choose-missing';
  return { ok: true, state: bumpVersion(next) };
}

export function endGame(state: GameState): ActionResult {
  if (state.phase !== 'seat-selection' && state.phase !== 'settled') {
    return { ok: false, error: 'hand-in-progress' };
  }
  const next = clone(state);
  next.gameOver = true;
  return { ok: true, state: bumpVersion(next) };
}

export function totalTilesInPlay(state: GameState): number {
  let n = state.wall.length;
  for (const seat of ALL_SEATS) {
    n += state.seats[seat].hand.length;
    n += state.seats[seat].discards.length;
    for (const m of state.seats[seat].melds) n += m.tiles.length;
  }
  return n;
}

import { decideClaim, decideMissingSuit, decideDiscard } from './ai';

const MAX_DRIVE_AI_ITERATIONS = 50;

export function driveAI(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < MAX_DRIVE_AI_ITERATIONS; i++) {
    // 1. AI 定缺 fill-in
    if (s.phase === 'choose-missing') {
      let progressed = false;
      for (const seat of ALL_SEATS) {
        if (s.seats[seat].missingSuit !== null) continue;
        if (s.seats[seat].assignment.kind !== 'ai') continue;
        const suit = decideMissingSuit(s, seat);
        const r = chooseMissing(s, seat, suit);
        if (r.ok && r.state) {
          s = r.state;
          progressed = true;
          break;
        }
      }
      if (progressed) continue;
      break;
    }

    // 2. Resolve AI decisions in claim window.
    if (s.phase === 'claim-window' && s.claimWindow) {
      const cw = s.claimWindow;
      const aiSeatsWithOptions = ALL_SEATS.filter(seat =>
        s.seats[seat].assignment.kind === 'ai' &&
        cw.options.some(o => o.seat === seat) &&
        !cw.decisions.some(d => d.seat === seat),
      );
      if (aiSeatsWithOptions.length > 0) {
        const seat = aiSeatsWithOptions[0];
        const choice = decideClaim(s, seat, cw.options);
        const r = submitClaim(s, seat, choice);
        if (r.ok && r.state) {
          s = r.state;
          continue;
        }
        break;
      }
      if (cw.pending.length > 0) break;
    }

    // 3. Playing phase: if turn is AI, run their move.
    if (s.phase === 'playing' && s.seats[s.turn].assignment.kind === 'ai' && !s.seats[s.turn].hasHu) {
      const seat = s.turn;
      const player = s.seats[seat];

      // 自摸 hu (canHu enforces shape; works whether hand was 14 from draw
      // or some other size — canHu just checks the structure).
      const hu = canHu(player.hand, player.melds, player.missingSuit);
      if (hu.canHu) {
        const r = declareSelfDrawHu(s, seat);
        if (r.ok && r.state) { s = r.state; continue; }
      }

      // 暗杠 (4 of a kind in hand)
      const counts = new Map<string, number>();
      for (const tile of player.hand) {
        const k = `${tile.suit}-${tile.value}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      let gangAnTaken = false;
      for (const [k, c] of counts) {
        if (c === 4) {
          const [suit, valStr] = k.split('-');
          const r = declareGangAn(s, seat, suit as Suit, Number(valStr) as TileValue);
          if (r.ok && r.state) { s = r.state; gangAnTaken = true; break; }
        }
      }
      if (gangAnTaken) continue;

      // 补杠 (a tile in hand matching an existing peng)
      let gangBuTaken = false;
      for (const meld of player.melds) {
        if (meld.type !== 'peng') continue;
        const m0 = meld.tiles[0];
        const matchTile = player.hand.find(t => t.suit === m0.suit && t.value === m0.value);
        if (matchTile) {
          const r = declareGangBu(s, seat, matchTile.id);
          if (r.ok && r.state) { s = r.state; gangBuTaken = true; break; }
        }
      }
      if (gangBuTaken) continue;

      // Discard. Always attempt — it's how the AI's turn ends regardless of
      // whether they got here via fresh draw, gang replacement, or peng.
      if (player.hand.length > 0) {
        const tileId = decideDiscard(s, seat);
        const r = discard(s, seat, tileId);
        if (r.ok && r.state) { s = r.state; continue; }
      }
      break;
    }

    break;
  }
  return s;
}

export function applyActionWithAI(state: GameState, action: Action): ActionResult {
  const r = applyAction(state, action);
  if (!r.ok || !r.state) return r;
  return { ok: true, state: driveAI(r.state) };
}
