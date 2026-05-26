import type { ClaimOption, GameState, Seat, Suit, Tile, TileId } from './types';

export function decideClaim(
  state: GameState,
  seat: Seat,
  options: readonly ClaimOption[],
): 'peng' | 'gang' | 'hu' | 'pass' {
  const ours = options.filter(o => o.seat === seat);
  if (ours.length === 0) return 'pass';

  if (ours.find(o => o.type === 'hu')) return 'hu';

  if (ours.find(o => o.type === 'gang')) {
    if (estimateShanten(state.seats[seat].hand) >= 3) return 'gang';
    return 'pass';
  }

  if (ours.find(o => o.type === 'peng')) {
    const hand = state.seats[seat].hand;
    const missing = state.seats[seat].missingSuit;
    const tile = state.lastDiscard?.tile;
    if (tile && missing && tile.suit === missing) return 'peng';
    if (countPairsOrBetter(hand) >= 2) return 'peng';
    return 'pass';
  }

  return 'pass';
}

const SUIT_PRIORITY: Suit[] = ['wan', 'tiao', 'tong'];

export function decideMissingSuit(state: GameState, seat: Seat): Suit {
  const counts: Record<Suit, number> = { wan: 0, tong: 0, tiao: 0 };
  for (const tile of state.seats[seat].hand) counts[tile.suit]++;
  let best: Suit = 'wan';
  let bestCount = Infinity;
  for (const s of SUIT_PRIORITY) {
    if (counts[s] < bestCount) {
      best = s;
      bestCount = counts[s];
    }
  }
  return best;
}

export function decideDiscardStub(state: GameState, seat: Seat): TileId {
  const player = state.seats[seat];
  if (player.missingSuit) {
    const t = player.hand.find(x => x.suit === player.missingSuit);
    if (t) return t.id;
  }
  return player.hand[0].id;
}

function estimateShanten(hand: readonly Tile[]): number {
  if (hand.length === 0) return 8;
  const counts = new Map<string, number>();
  for (const tile of hand) {
    const k = `${tile.suit}-${tile.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let triplets = 0;
  let partialRuns = 0;
  for (const [, c] of counts) {
    if (c >= 3) triplets++;
  }
  const suits: Suit[] = ['wan', 'tong', 'tiao'];
  for (const suit of suits) {
    for (let v = 1; v <= 8; v++) {
      const a = counts.get(`${suit}-${v}`) ?? 0;
      const b = counts.get(`${suit}-${v + 1}`) ?? 0;
      if (a >= 1 && b >= 1) partialRuns++;
    }
  }
  let pairs = 0;
  for (const [, c] of counts) {
    const rem = c >= 3 ? c - 3 : c;
    if (rem >= 2) pairs++;
  }
  const setsPlusPartials = Math.min(triplets + Math.floor(partialRuns / 2), 4);
  return Math.max(0, 8 - 2 * setsPlusPartials - Math.min(pairs, 1));
}

function countPairsOrBetter(hand: readonly Tile[]): number {
  const counts = new Map<string, number>();
  for (const tile of hand) {
    const k = `${tile.suit}-${tile.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let n = 0;
  for (const [, c] of counts) {
    if (c >= 2) n++;
  }
  return n;
}


// Cost-to-discard. Higher = drop first.
const COST_MISSING_SUIT = 100;
const COST_PAIR_OR_TRIPLET = -10;
const COST_SEQUENCE_ADJACENT = -6;
const COST_EDGE_TILE = 2;
const COST_MIDDLE_TILE = -4;
const COST_PER_PUBLIC_COPY_DISCARDED = 1;

export function decideDiscard(state: GameState, seat: Seat): TileId {
  const player = state.seats[seat];
  if (player.hand.length === 0) {
    throw new Error('decideDiscard called with empty hand');
  }

  // Count tiles in hand by face for pair-detection.
  const handFaceCounts = new Map<string, number>();
  for (const tt of player.hand) {
    const k = `${tt.suit}-${tt.value}`;
    handFaceCounts.set(k, (handFaceCounts.get(k) ?? 0) + 1);
  }

  // Count discarded copies (across all seats) per face.
  const discardedFaceCounts = new Map<string, number>();
  for (const s of ALL_SEATS) {
    for (const tt of state.seats[s].discards) {
      const k = `${tt.suit}-${tt.value}`;
      discardedFaceCounts.set(k, (discardedFaceCounts.get(k) ?? 0) + 1);
    }
  }

  let bestId: TileId = player.hand[0].id;
  let bestCost = -Infinity;

  for (const tile of player.hand) {
    let cost = 0;

    if (player.missingSuit && tile.suit === player.missingSuit) {
      cost += COST_MISSING_SUIT;
    }

    const faceKey = `${tile.suit}-${tile.value}`;
    const faceCountInHand = handFaceCounts.get(faceKey) ?? 1;
    if (faceCountInHand >= 2) cost += COST_PAIR_OR_TRIPLET;

    // Sequence-adjacency: any neighbor in the same suit?
    const left = handFaceCounts.get(`${tile.suit}-${tile.value - 1}`) ?? 0;
    const right = handFaceCounts.get(`${tile.suit}-${tile.value + 1}`) ?? 0;
    if (left + right > 0) cost += COST_SEQUENCE_ADJACENT;

    if (tile.value === 1 || tile.value === 9) cost += COST_EDGE_TILE;
    if (tile.value >= 4 && tile.value <= 6) cost += COST_MIDDLE_TILE;

    const publicCopies = discardedFaceCounts.get(faceKey) ?? 0;
    cost += publicCopies * COST_PER_PUBLIC_COPY_DISCARDED;

    if (cost > bestCost) {
      bestCost = cost;
      bestId = tile.id;
    }
  }
  return bestId;
}

const ALL_SEATS: Seat[] = ['east', 'south', 'west', 'north'];
