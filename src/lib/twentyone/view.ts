import { betOf, other, targetOf } from './rules';
import type { GameState, GameView, PlayerName, PlayerView } from './types';

const VIEW_LOG_LIMIT = 12;

export function toView(s: GameState, viewer: PlayerName): GameView {
  const reveal = s.phase !== 'playing';
  const players = {} as Record<PlayerName, PlayerView>;
  for (const name of ['Aaron', 'Vicky'] as const) {
    const p = s.players[name];
    const self = name === viewer;
    const cards = p.cards.map((c) => (self || reveal || c.faceUp ? c.value : null));
    players[name] = {
      name,
      hp: p.hp,
      roundsWon: p.roundsWon,
      bet: betOf(p.table, s.players[other(name)].table),
      cards,
      visibleTotal: cards.reduce<number>((sum, v) => sum + (v ?? 0), 0),
      hasHiddenCard: cards.includes(null),
      table: p.table,
      handCount: p.hand.length,
      ...(self ? { hand: p.hand } : {}),
    };
  }
  return {
    matchId: s.matchId,
    version: s.version,
    me: viewer,
    opponent: other(viewer),
    phase: s.phase,
    round: s.round,
    handNo: s.handNo,
    turn: s.turn,
    deckCount: s.deck.length,
    target: targetOf([s.players.Aaron.table, s.players.Vicky.table]),
    players,
    result: s.result,
    matchWinner: s.matchWinner,
    log: s.log.slice(-VIEW_LOG_LIMIT).map((e) => {
      const mine = e.actor === viewer;
      const text = mine ? (e.privateText ?? e.publicText) : e.publicText;
      const who = e.actor === null ? '' : mine ? '你' : `${e.actor} `;
      return { seq: e.seq, actor: e.actor, text: who + text };
    }),
  };
}
