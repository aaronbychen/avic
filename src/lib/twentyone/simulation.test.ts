import { describe, expect, it } from 'vitest';
import { TRUMPS } from './cards';
import { applyAction, newMatch } from './engine';
import { mulberry32, randInt, type Rng } from './rng';
import { HAND_LIMIT, MAX_HP, TABLE_LIMIT, cardTotal, other, targetOf, trumpBlockReason } from './rules';
import { toView } from './view';
import type { Action, GameState } from './types';

function legalActions(s: GameState): Action[] {
  if (s.phase === 'hand-result') return [{ type: 'next-hand' }];
  if (s.phase === 'match-over') return [];
  const me = s.players[s.turn];
  const opp = s.players[other(s.turn)];
  const target = targetOf([me.table, opp.table]);
  const actions: Action[] = [{ type: 'stay' }];
  if (cardTotal(me.cards) <= target && s.deck.length > 0) actions.push({ type: 'draw' });
  for (const t of me.hand) {
    const blocked = trumpBlockReason({
      def: TRUMPS[t.id],
      ownTotal: cardTotal(me.cards),
      target,
      ownTable: me.table,
      oppTable: opp.table,
    });
    if (!blocked) actions.push({ type: 'use-trump', uid: t.uid });
  }
  return actions;
}

function checkInvariants(s: GameState) {
  const all = [...s.deck, ...s.players.Aaron.cards.map((c) => c.value), ...s.players.Vicky.cards.map((c) => c.value)];
  expect(all.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const p of ['Aaron', 'Vicky'] as const) {
    const ps = s.players[p];
    expect(ps.hp).toBeGreaterThanOrEqual(0);
    expect(ps.hp).toBeLessThanOrEqual(MAX_HP);
    expect(ps.hand.length).toBeLessThanOrEqual(HAND_LIMIT);
    expect(ps.table.length).toBeLessThanOrEqual(TABLE_LIMIT);
    expect(ps.cards[0]?.faceUp).toBe(false);
    if (s.phase === 'playing') {
      const view = toView(s, other(p));
      expect(view.players[p].cards[0]).toBeNull();
      expect(view.players[p].hand).toBeUndefined();
    }
  }
  const goFors = [...s.players.Aaron.table, ...s.players.Vicky.table].filter((t) => TRUMPS[t.id].goFor);
  expect(goFors.length).toBeLessThanOrEqual(1);
}

function playMatch(seed: number): GameState {
  const rng: Rng = mulberry32(seed);
  const chooser = mulberry32(seed * 7919 + 1);
  let s = newMatch(rng);
  for (let step = 0; step < 20000 && s.phase !== 'match-over'; step++) {
    const actions = legalActions(s);
    // Bias toward ending turns so hands don't stall on endless trump use.
    const pickEnd = chooser() < 0.5;
    const ends = actions.filter((a) => a.type !== 'use-trump');
    const pool = pickEnd ? ends : actions;
    const action = pool[randInt(chooser, pool.length)];
    const actor = s.phase === 'playing' ? s.turn : 'Aaron';
    const r = applyAction(s, actor, action, rng);
    if (!r.ok) throw new Error(`seed ${seed} step ${step}: ${action.type} rejected: ${r.error}`);
    expect(r.state.version).toBe(s.version + 1);
    s = r.state;
    checkInvariants(s);
  }
  return s;
}

describe('random full matches', () => {
  it('play to completion without breaking invariants', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = playMatch(seed);
      expect(s.phase).toBe('match-over');
      expect(s.matchWinner && s.players[s.matchWinner].roundsWon).toBe(3);
    }
  });
});
