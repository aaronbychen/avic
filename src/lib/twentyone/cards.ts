import type { TrumpId } from './types';

export type TrumpKind = 'table' | 'instant';
export type TrumpCategory = 'attack' | 'defense' | 'draw' | 'control' | 'special';

export interface TrumpDef {
  id: TrumpId;
  name: string;
  desc: string;
  kind: TrumpKind;
  category: TrumpCategory;
  // Pool weight in 1/80 units (see docs/specs/2026-10-22-twentyone-design.md §3).
  weight: number;
  // While on the owner's table: opponent's bet +N.
  oppBetUp?: number;
  // While on the owner's table: owner's bet −N.
  shield?: number;
  // Puts a number card into the owner's hand, so useless once bust.
  drawsNumber?: boolean;
  // Replaces the target total while on the table.
  goFor?: number;
}

// Names and descriptions are the official Simplified Chinese text from RE7.
export const TRUMPS: Record<TrumpId, TrumpDef> = {
  12: { id: 12, name: '增加二', desc: '抽一张王牌。另外，当这张牌在牌桌上时，对手的赌注会增加 2。', kind: 'table', category: 'attack', weight: 18, oppBetUp: 2 },
  13: { id: 13, name: '增加二+', desc: '将对手上一张面朝上的牌退回牌组。当这张牌在牌桌上时，对手的赌注会增加 2。', kind: 'table', category: 'attack', weight: 2, oppBetUp: 2 },
  15: { id: 15, name: '护盾', desc: '当这张牌在牌桌上时，你的赌注会减少 1。', kind: 'table', category: 'defense', weight: 3, shield: 1 },
  16: { id: 16, name: '护盾+', desc: '当这张牌在牌桌上时，你的赌注会减少 2。', kind: 'table', category: 'defense', weight: 3, shield: 2 },
  30: { id: 30, name: '2 牌', desc: '抽出 2 的牌。如果它不在牌组中，什么事都不会发生。', kind: 'instant', category: 'draw', weight: 2, drawsNumber: true },
  31: { id: 31, name: '3 牌', desc: '抽出 3 的牌。如果它不在牌组中，什么事都不会发生。', kind: 'instant', category: 'draw', weight: 2, drawsNumber: true },
  32: { id: 32, name: '4 牌', desc: '抽出 4 的牌。如果它不在牌组中，什么事都不会发生。', kind: 'instant', category: 'draw', weight: 2, drawsNumber: true },
  33: { id: 33, name: '5 牌', desc: '抽出 5 的牌。如果它不在牌组中，什么事都不会发生。', kind: 'instant', category: 'draw', weight: 3, drawsNumber: true },
  34: { id: 34, name: '6 牌', desc: '抽出 6 的牌。如果它不在牌组中，什么事都不会发生。', kind: 'instant', category: 'draw', weight: 3, drawsNumber: true },
  35: { id: 35, name: '7 牌', desc: '抽出 7 的牌。如果它不在牌组中，什么事都不会发生。', kind: 'instant', category: 'draw', weight: 2, drawsNumber: true },
  45: { id: 45, name: '完美抽牌', desc: '从牌组中抽出最有利的牌。', kind: 'instant', category: 'draw', weight: 2, drawsNumber: true },
  46: { id: 46, name: '终极抽牌', desc: '从牌组中抽出最有利的牌。另外，抽两张王牌。', kind: 'instant', category: 'draw', weight: 2, drawsNumber: true },
  47: { id: 47, name: '完美抽牌+', desc: '从牌组中抽出最有利的牌。另外，当这张牌在牌桌上时，对手的赌注会增加 5。', kind: 'table', category: 'attack', weight: 2, oppBetUp: 5, drawsNumber: true },
  51: { id: 51, name: '王牌变换', desc: '随机放弃两张王牌，然后再抽三张王牌。', kind: 'instant', category: 'special', weight: 3 },
  52: { id: 52, name: '王牌变换+', desc: '随机放弃一张王牌，然后再抽四张王牌。', kind: 'instant', category: 'special', weight: 3 },
  53: { id: 53, name: '交换', desc: '将你和对手抽中的上一张牌互换。（面朝下的牌不能互换。）', kind: 'instant', category: 'control', weight: 4 },
  54: { id: 54, name: '退回', desc: '将上一张抽中的面朝上的牌退回牌组。', kind: 'instant', category: 'control', weight: 6 },
  55: { id: 55, name: '撤除', desc: '将对手上一张抽中的面朝上的牌退回牌组。', kind: 'instant', category: 'control', weight: 4 },
  56: { id: 56, name: '破坏', desc: '撤除对手上一张放在牌桌上的王牌。', kind: 'instant', category: 'control', weight: 4 },
  57: { id: 57, name: '破坏+', desc: '撤除对手放在牌桌上的所有王牌。', kind: 'instant', category: 'control', weight: 3 },
  58: { id: 58, name: '破坏++', desc: '撤除牌桌上所有对手的王牌。当这张牌在牌桌上时，对手无法使用王牌。', kind: 'table', category: 'control', weight: 1 },
  59: { id: 59, name: '收割', desc: '当这张牌在牌桌上时，每次你使用一张王牌，便抽一张新的王牌。', kind: 'table', category: 'special', weight: 2 },
  80: { id: 80, name: '挑战 24 点', desc: '当这张牌在牌桌上时，最靠近 24 点的胜。取代牌桌上其他已有的“挑战”牌。', kind: 'table', category: 'special', weight: 2, goFor: 24 },
  81: { id: 81, name: '挑战 27 点', desc: '当这张牌在牌桌上时，最靠近 27 点的胜。取代牌桌上其他已有的“挑战”牌。', kind: 'table', category: 'special', weight: 2, goFor: 27 },
};

export const TRUMP_LIST: readonly TrumpDef[] = Object.values(TRUMPS);

// Number value drawn by the "N 牌" trumps.
export const SPECIFIC_DRAW: Partial<Record<TrumpId, number>> = { 30: 2, 31: 3, 32: 4, 33: 5, 34: 6, 35: 7 };
