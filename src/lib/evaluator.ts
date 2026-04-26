import { Card, Rank, EvaluatedHand, HandRank } from './types';

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const HAND_RANKINGS: HandRank[] = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
];

function rankValue(card: Card): number {
  return RANK_VALUES[card.rank];
}

function getCombinations(cards: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (cards.length < k) return [];
  const [first, ...rest] = cards;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Encode hand tier + up to 5 kickers into a single comparable integer.
 * Uses base-15 positional encoding: tier gets the highest digit.
 * Max value: 9*15^5 + 14*15^4 + ... ≈ 7.5M — safe for integer math.
 */
function score(tier: number, kickers: number[]): number {
  let s = tier * 759375; // 15^5
  const weights = [50625, 3375, 225, 15, 1]; // 15^4, 15^3, 15^2, 15^1, 15^0
  for (let i = 0; i < kickers.length && i < 5; i++) {
    s += kickers[i] * weights[i];
  }
  return s;
}

function evaluateFive(cards: Card[]): { rank: HandRank; value: number } {
  const sorted = [...cards].sort((a, b) => rankValue(b) - rankValue(a));
  const values = sorted.map(rankValue);

  const suits = sorted.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = values[0];

  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
  } else if (
    values[0] === 14 && values[1] === 5 && values[2] === 4 &&
    values[3] === 3 && values[4] === 2
  ) {
    isStraight = true;
    straightHigh = 5; // wheel: 5-high straight
  }

  // Count ranks, sort by count desc then value desc
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const pattern = groups.map(g => g.count).join('');

  // Royal Flush / Straight Flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 'Royal Flush', value: score(9, [14]) };
    return { rank: 'Straight Flush', value: score(8, [straightHigh]) };
  }

  // Four of a Kind: [quads, kicker]
  if (pattern === '41') {
    return { rank: 'Four of a Kind', value: score(7, [groups[0].value, groups[1].value]) };
  }

  // Full House: [trips, pair]
  if (pattern === '32') {
    return { rank: 'Full House', value: score(6, [groups[0].value, groups[1].value]) };
  }

  // Flush: compare all 5 cards high to low
  if (isFlush) {
    return { rank: 'Flush', value: score(5, values) };
  }

  // Straight: compare by high card only
  if (isStraight) {
    return { rank: 'Straight', value: score(4, [straightHigh]) };
  }

  // Three of a Kind: [trips, kicker1, kicker2]
  if (pattern === '311') {
    return { rank: 'Three of a Kind', value: score(3, [groups[0].value, groups[1].value, groups[2].value]) };
  }

  // Two Pair: [highPair, lowPair, kicker]
  if (pattern === '221') {
    return { rank: 'Two Pair', value: score(2, [groups[0].value, groups[1].value, groups[2].value]) };
  }

  // One Pair: [pair, kicker1, kicker2, kicker3]
  if (pattern === '2111') {
    return { rank: 'One Pair', value: score(1, [groups[0].value, groups[1].value, groups[2].value, groups[3].value]) };
  }

  // High Card: all 5 cards
  return { rank: 'High Card', value: score(0, values) };
}

/** Evaluate the best 5-card hand from hole cards + board */
export function evaluateHand(holeCards: Card[], boardCards: Card[]): EvaluatedHand {
  const allCards = [...holeCards, ...boardCards];
  const combos = getCombinations(allCards, 5);

  let best: EvaluatedHand | null = null;
  for (const combo of combos) {
    const result = evaluateFive(combo);
    if (!best || result.value > best.value) {
      best = { rank: result.rank, value: result.value, cards: combo };
    }
  }

  return best!;
}

/** Compare two players' hands. Returns 1 if hand1 wins, -1 if hand2 wins, 0 for split. */
export function compareHands(hand1: EvaluatedHand, hand2: EvaluatedHand): number {
  if (hand1.value > hand2.value) return 1;
  if (hand1.value < hand2.value) return -1;
  return 0;
}

export { HAND_RANKINGS, RANK_VALUES };
