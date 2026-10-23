import { describe, expect, it } from 'vitest';
import { applyAction, newMatch } from './engine';
import { mulberry32, type Rng } from './rng';
import { bestCard, betOf, decideWinner, HAND_LIMIT, MAX_HP, targetOf } from './rules';
import { toView } from './view';
import type { Action, GameState, PlayerName, Trump, TrumpId } from './types';

// Rng that never triggers the 25% draw bonus but is otherwise deterministic.
function noBonusRng(seed = 1): Rng {
  const base = mulberry32(seed);
  return () => 0.5 + base() * 0.49;
}

let uidCounter = 0;
function trump(id: TrumpId): Trump {
  return { uid: `test-${uidCounter++}`, id };
}

// A playing hand with fully controlled cards, deck, hands and tables.
function setup(opts: {
  aaron: number[];
  vicky: number[];
  deck?: number[];
  aaronHand?: TrumpId[];
  vickyHand?: TrumpId[];
  aaronTable?: TrumpId[];
  vickyTable?: TrumpId[];
  turn?: PlayerName;
}): GameState {
  const s = newMatch(mulberry32(42));
  const used = new Set([...opts.aaron, ...opts.vicky]);
  s.deck = opts.deck ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((v) => !used.has(v));
  s.players.Aaron.cards = opts.aaron.map((value, i) => ({ value, faceUp: i > 0 }));
  s.players.Vicky.cards = opts.vicky.map((value, i) => ({ value, faceUp: i > 0 }));
  s.players.Aaron.hand = (opts.aaronHand ?? []).map(trump);
  s.players.Vicky.hand = (opts.vickyHand ?? []).map(trump);
  s.players.Aaron.table = (opts.aaronTable ?? []).map(trump);
  s.players.Vicky.table = (opts.vickyTable ?? []).map(trump);
  s.turn = opts.turn ?? 'Aaron';
  s.consecutiveStays = 0;
  return s;
}

function act(s: GameState, actor: PlayerName, action: Action, rng: Rng = noBonusRng()): GameState {
  const r = applyAction(s, actor, action, rng);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function useFirst(s: GameState, actor: PlayerName, id: TrumpId, rng?: Rng): GameState {
  const t = s.players[actor].hand.find((h) => h.id === id);
  if (!t) throw new Error(`no ${id} in hand`);
  return act(s, actor, { type: 'use-trump', uid: t.uid }, rng);
}

function values(s: GameState, p: PlayerName): number[] {
  return s.players[p].cards.map((c) => c.value);
}

describe('newMatch', () => {
  it('deals 6 starting trumps plus 1 for the first hand, and two cards each', () => {
    const s = newMatch(mulberry32(7));
    for (const p of ['Aaron', 'Vicky'] as const) {
      expect(s.players[p].hand).toHaveLength(7);
      expect(s.players[p].cards).toHaveLength(2);
      expect(s.players[p].cards[0].faceUp).toBe(false);
      expect(s.players[p].cards[1].faceUp).toBe(true);
      expect(s.players[p].hp).toBe(MAX_HP);
    }
    expect(s.deck).toHaveLength(7);
    const all = [...s.deck, ...values(s, 'Aaron'), ...values(s, 'Vicky')].sort((a, b) => a - b);
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(s.turn).toBe(s.firstPlayer);
  });
});

describe('rules', () => {
  it('decides winners', () => {
    expect(decideWinner({ Aaron: 20, Vicky: 18 }, 21)).toBe('Aaron');
    expect(decideWinner({ Aaron: 22, Vicky: 18 }, 21)).toBe('Vicky');
    expect(decideWinner({ Aaron: 23, Vicky: 25 }, 21)).toBe('Aaron');
    expect(decideWinner({ Aaron: 19, Vicky: 19 }, 21)).toBeNull();
    expect(decideWinner({ Aaron: 23, Vicky: 21 }, 24)).toBe('Aaron');
  });

  it('computes bets with bet-ups and shields, never below 0', () => {
    expect(betOf([], [])).toBe(1);
    expect(betOf([], [trump(12), trump(47)])).toBe(8);
    expect(betOf([trump(15)], [trump(12)])).toBe(2);
    expect(betOf([trump(16), trump(15)], [])).toBe(0);
  });

  it('picks the best card', () => {
    expect(bestCard([2, 5, 9], 12, 21)).toBe(9);
    expect(bestCard([2, 5, 9], 17, 21)).toBe(2);
    expect(bestCard([5, 9], 18, 21)).toBe(5);
    expect(bestCard([], 10, 21)).toBeUndefined();
  });

  it('uses the go-for target from either table', () => {
    expect(targetOf([[], []])).toBe(21);
    expect(targetOf([[trump(15)], [trump(81)]])).toBe(27);
  });
});

describe('turn flow', () => {
  it('ends the hand after two consecutive stays and damages the loser', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6] });
    s = act(s, 'Aaron', { type: 'stay' });
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('Vicky');
    s = act(s, 'Vicky', { type: 'stay' });
    expect(s.phase).toBe('hand-result');
    expect(s.result?.winner).toBe('Aaron');
    expect(s.players.Vicky.hp).toBe(MAX_HP - 1);
  });

  it('a draw resets the stay count', () => {
    let s = setup({ aaron: [10, 9], vicky: [2, 3], deck: [4, 5] });
    s = act(s, 'Aaron', { type: 'stay' });
    s = act(s, 'Vicky', { type: 'draw' });
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('Aaron');
    s = act(s, 'Aaron', { type: 'stay' });
    expect(s.phase).toBe('playing');
    s = act(s, 'Vicky', { type: 'stay' });
    expect(s.phase).toBe('hand-result');
  });

  it('using a trump resets the stay count so the opponent can continue', () => {
    let s = setup({ aaron: [10, 9], vicky: [2, 3], vickyHand: [15] });
    s = act(s, 'Aaron', { type: 'stay' });
    s = useFirst(s, 'Vicky', 15);
    s = act(s, 'Vicky', { type: 'stay' });
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('Aaron');
  });

  it('rejects actions out of turn', () => {
    const s = setup({ aaron: [10, 9], vicky: [2, 3] });
    expect(applyAction(s, 'Vicky', { type: 'stay' }, noBonusRng()).ok).toBe(false);
  });

  it('blocks drawing once bust', () => {
    const s = setup({ aaron: [11, 10, 5], vicky: [2, 3] });
    const r = applyAction(s, 'Aaron', { type: 'draw' }, noBonusRng());
    expect(r.ok).toBe(false);
  });

  it('gives a bonus trump on a 25% roll when drawing', () => {
    const s = setup({ aaron: [2, 3], vicky: [4, 5], deck: [6] });
    const lucky = act(s, 'Aaron', { type: 'draw' }, () => 0.1);
    expect(lucky.players.Aaron.hand).toHaveLength(1);
    const unlucky = act(s, 'Aaron', { type: 'draw' }, () => 0.9);
    expect(unlucky.players.Aaron.hand).toHaveLength(0);
  });

  it('caps the trump hand at 20', () => {
    const s = setup({ aaron: [2, 3], vicky: [4, 5], deck: [6], aaronHand: Array(HAND_LIMIT).fill(15) });
    const next = act(s, 'Aaron', { type: 'draw' }, () => 0.1);
    expect(next.players.Aaron.hand).toHaveLength(HAND_LIMIT);
  });

  it('alternates the first player and starts a new round after a knockout', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6] });
    s.players.Vicky.hp = 1;
    const first = s.firstPlayer;
    s = act(s, 'Aaron', { type: 'stay' });
    s = act(s, 'Vicky', { type: 'stay' });
    expect(s.result?.roundWinner).toBe('Aaron');
    expect(s.players.Aaron.roundsWon).toBe(1);
    const handBefore = s.players.Aaron.hand.length;
    s = act(s, 'Vicky', { type: 'next-hand' });
    expect(s.round).toBe(2);
    expect(s.handNo).toBe(1);
    expect(s.players.Vicky.hp).toBe(MAX_HP);
    expect(s.firstPlayer).not.toBe(first);
    expect(s.players.Aaron.hand.length).toBe(handBefore + 1);
    expect(s.players.Aaron.table).toEqual([]);
  });

  it('ends the match at 3 rounds won', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6] });
    s.players.Aaron.roundsWon = 2;
    s.players.Vicky.hp = 1;
    s = act(s, 'Aaron', { type: 'stay' });
    s = act(s, 'Vicky', { type: 'stay' });
    expect(s.phase).toBe('match-over');
    expect(s.matchWinner).toBe('Aaron');
    s = act(s, 'Vicky', { type: 'new-match' });
    expect(s.phase).toBe('playing');
    expect(s.players.Aaron.roundsWon).toBe(0);
  });
});

describe('trumps', () => {
  it('N 牌 draws the card or is wasted when it is not in the deck', () => {
    let s = setup({ aaron: [10, 2], vicky: [5, 6], aaronHand: [33, 32] });
    s = useFirst(s, 'Aaron', 33);
    expect(values(s, 'Aaron')).toEqual([10, 2]);
    expect(s.players.Aaron.hand.map((t) => t.id)).toEqual([32]);
    s = useFirst(s, 'Aaron', 32);
    expect(values(s, 'Aaron')).toEqual([10, 2, 4]);
    expect(s.deck).not.toContain(4);
    expect(s.turn).toBe('Aaron');
  });

  it('撤除 returns the opponent last face-up card; face-down cards are untouchable', () => {
    let s = setup({ aaron: [10, 2], vicky: [5, 6, 9], aaronHand: [55, 55, 55] });
    s = useFirst(s, 'Aaron', 55);
    expect(values(s, 'Vicky')).toEqual([5, 6]);
    expect(s.deck).toContain(9);
    s = useFirst(s, 'Aaron', 55);
    expect(values(s, 'Vicky')).toEqual([5]);
    s = useFirst(s, 'Aaron', 55);
    expect(values(s, 'Vicky')).toEqual([5]);
    expect(s.players.Aaron.hand).toHaveLength(0);
  });

  it('退回 can un-bust yourself', () => {
    let s = setup({ aaron: [10, 4, 9], vicky: [5, 6], aaronHand: [54] });
    s = useFirst(s, 'Aaron', 54);
    expect(values(s, 'Aaron')).toEqual([10, 4]);
  });

  it('交换 swaps the last face-up cards', () => {
    let s = setup({ aaron: [10, 4, 9], vicky: [5, 6], aaronHand: [53] });
    s = useFirst(s, 'Aaron', 53);
    expect(values(s, 'Aaron')).toEqual([10, 4, 6]);
    expect(values(s, 'Vicky')).toEqual([5, 9]);
  });

  it('完美抽牌 takes the best fitting card', () => {
    let s = setup({ aaron: [10, 4], vicky: [5, 6], deck: [1, 7, 8, 11], aaronHand: [45] });
    s = useFirst(s, 'Aaron', 45);
    expect(values(s, 'Aaron')).toEqual([10, 4, 7]);
  });

  it('table cards change the bet; 增加二 also draws a trump', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6], aaronHand: [12] });
    s = useFirst(s, 'Aaron', 12);
    expect(s.players.Aaron.table.map((t) => t.id)).toEqual([12]);
    expect(s.players.Aaron.hand).toHaveLength(1);
    s = act(s, 'Aaron', { type: 'stay' });
    s = act(s, 'Vicky', { type: 'stay' });
    expect(s.result?.damage).toBe(3);
    expect(s.players.Vicky.hp).toBe(MAX_HP - 3);
  });

  it('破坏 removes the last placed opponent trump, 破坏+ removes all', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6], vickyTable: [15, 16], aaronHand: [56, 57] });
    s = useFirst(s, 'Aaron', 56);
    expect(s.players.Vicky.table.map((t) => t.id)).toEqual([15]);
    s.players.Vicky.table.push(trump(12));
    s = useFirst(s, 'Aaron', 57);
    expect(s.players.Vicky.table).toEqual([]);
  });

  it('破坏++ clears the opponent table and blocks their trumps', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6], vickyTable: [15], aaronHand: [58], vickyHand: [55] });
    s = useFirst(s, 'Aaron', 58);
    expect(s.players.Vicky.table).toEqual([]);
    s = act(s, 'Aaron', { type: 'stay' });
    const r = applyAction(s, 'Vicky', { type: 'use-trump', uid: s.players.Vicky.hand[0].uid }, noBonusRng());
    expect(r.ok).toBe(false);
  });

  it('挑战 replaces the other go-for card and moves the bust line', () => {
    let s = setup({ aaron: [11, 10, 2], vicky: [5, 6], vickyTable: [81], aaronHand: [80] });
    s = useFirst(s, 'Aaron', 80);
    expect(s.players.Vicky.table).toEqual([]);
    expect(targetOf([s.players.Aaron.table, s.players.Vicky.table])).toBe(24);
    s = act(s, 'Aaron', { type: 'draw' });
    expect(s.players.Aaron.cards).toHaveLength(4);
  });

  it('收割 gives a trump for each later trump use', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6], aaronHand: [59, 15] });
    s = useFirst(s, 'Aaron', 59);
    expect(s.players.Aaron.hand.map((t) => t.id)).toEqual([15]);
    s = useFirst(s, 'Aaron', 15);
    expect(s.players.Aaron.hand).toHaveLength(1);
  });

  it('王牌变换 discards 2 and draws 3', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6], aaronHand: [51, 15, 16, 54] });
    s = useFirst(s, 'Aaron', 51);
    expect(s.players.Aaron.hand).toHaveLength(4);
  });

  it('limits the table to 5 trumps but still allows instant ones', () => {
    const s = setup({
      aaron: [10, 9],
      vicky: [5, 6, 3],
      aaronTable: [15, 15, 15, 15, 15],
      aaronHand: [16, 55],
    });
    const t16 = s.players.Aaron.hand.find((t) => t.id === 16)!;
    expect(applyAction(s, 'Aaron', { type: 'use-trump', uid: t16.uid }, noBonusRng()).ok).toBe(false);
    expect(values(useFirst(s, 'Aaron', 55), 'Vicky')).toEqual([5, 6]);
  });

  it('rejects draw trumps once bust', () => {
    const s = setup({ aaron: [11, 10, 5], vicky: [2, 3], aaronHand: [45] });
    expect(applyAction(s, 'Aaron', { type: 'use-trump', uid: s.players.Aaron.hand[0].uid }, noBonusRng()).ok).toBe(false);
  });
});

describe('toView', () => {
  it('hides the opponent face-down card and trump hand until the hand ends', () => {
    let s = setup({ aaron: [10, 9], vicky: [5, 6], vickyHand: [15, 16] });
    let v = toView(s, 'Aaron');
    expect(v.players.Vicky.cards).toEqual([null, 6]);
    expect(v.players.Vicky.hand).toBeUndefined();
    expect(v.players.Vicky.handCount).toBe(2);
    expect(v.players.Aaron.cards).toEqual([10, 9]);
    expect(JSON.stringify(v)).not.toContain('"deck"');
    s = act(s, 'Aaron', { type: 'stay' });
    s = act(s, 'Vicky', { type: 'stay' });
    v = toView(s, 'Aaron');
    expect(v.players.Vicky.cards).toEqual([5, 6]);
  });

  it('shows trump names only to the player who received them', () => {
    const s = newMatch(mulberry32(3));
    const mine = toView(s, 'Aaron').log.find((e) => e.actor === 'Aaron' && e.text.includes('获得'));
    const theirs = toView(s, 'Vicky').log.find((e) => e.actor === 'Aaron' && e.text.includes('获得'));
    expect(mine?.text).toContain('获得王牌：');
    expect(theirs).toBeUndefined();
  });
});
