import { TRUMPS, type TrumpDef } from './cards';
import type { NumberCard, PlayerName, Trump } from './types';

export const MAX_HP = 10;
export const ROUNDS_TO_WIN = 2;
export const START_TRUMPS = 6;
export const HAND_LIMIT = 10;
export const TABLE_LIMIT = 5;
export const DRAW_BONUS_CHANCE = 0.25;
export const DEFAULT_TARGET = 21;

export function other(p: PlayerName): PlayerName {
  return p === 'Aaron' ? 'Vicky' : 'Aaron';
}

export function cardTotal(cards: readonly NumberCard[]): number {
  return cards.reduce((sum, c) => sum + c.value, 0);
}

// Only one "挑战" card can be on the table at a time (placing one removes the others).
export function targetOf(tables: readonly (readonly Trump[])[]): number {
  for (const table of tables) {
    for (const t of table) {
      const goFor = TRUMPS[t.id].goFor;
      if (goFor) return goFor;
    }
  }
  return DEFAULT_TARGET;
}

export function betOf(ownTable: readonly Trump[], oppTable: readonly Trump[]): number {
  const up = oppTable.reduce((sum, t) => sum + (TRUMPS[t.id].oppBetUp ?? 0), 0);
  const down = ownTable.reduce((sum, t) => sum + (TRUMPS[t.id].shield ?? 0), 0);
  return Math.max(0, 1 + up - down);
}

// Closest to target without going over wins; if both bust, the lower total wins.
export function decideWinner(
  totals: Record<PlayerName, number>,
  target: number,
): PlayerName | null {
  const a = totals.Aaron;
  const v = totals.Vicky;
  if (a === v) return null;
  const aBust = a > target;
  const vBust = v > target;
  if (aBust && vBust) return a < v ? 'Aaron' : 'Vicky';
  if (aBust) return 'Vicky';
  if (vBust) return 'Aaron';
  return a > v ? 'Aaron' : 'Vicky';
}

// Largest card that keeps the total within target; otherwise the smallest card left.
export function bestCard(deck: readonly number[], total: number, target: number): number | undefined {
  if (deck.length === 0) return undefined;
  const fitting = deck.filter((v) => total + v <= target);
  return fitting.length > 0 ? Math.max(...fitting) : Math.min(...deck);
}

export interface UsabilityInput {
  def: TrumpDef;
  ownTotal: number;
  target: number;
  ownTable: readonly Trump[];
  oppTable: readonly Trump[];
}

// Reason a trump can't be played right now, or null if it can.
export function trumpBlockReason({ def, ownTotal, target, ownTable, oppTable }: UsabilityInput): string | null {
  if (oppTable.some((t) => t.id === 58)) return '「破坏++」生效中，无法使用王牌';
  if (def.kind === 'table' && ownTable.length >= TABLE_LIMIT) return `牌桌上最多只能摆 ${TABLE_LIMIT} 张王牌`;
  if (def.drawsNumber && ownTotal > target) return '点数爆掉之后就不能抽牌了';
  return null;
}
