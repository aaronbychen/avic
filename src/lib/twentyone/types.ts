export type PlayerName = 'Aaron' | 'Vicky';

export const PLAYERS: readonly PlayerName[] = ['Aaron', 'Vicky'];

// IDs match CardGameItemTypeData in the RE7 "21" DLC data.
export type TrumpId =
  | 12 | 13 | 15 | 16
  | 30 | 31 | 32 | 33 | 34 | 35
  | 45 | 46 | 47
  | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59
  | 80 | 81;

export interface Trump {
  uid: string;
  id: TrumpId;
}

export interface NumberCard {
  value: number;
  faceUp: boolean;
}

export interface PlayerState {
  hp: number;
  roundsWon: number;
  // cards[0] is the face-down card; every later card is face-up.
  cards: NumberCard[];
  // Table trumps in placement order (last = most recently placed).
  table: Trump[];
  hand: Trump[];
}

export type Phase = 'playing' | 'hand-result' | 'match-over';

export interface HandResult {
  winner: PlayerName | null;
  totals: Record<PlayerName, number>;
  cards: Record<PlayerName, number[]>;
  target: number;
  damage: number;
  roundWinner: PlayerName | null;
}

export interface LogEntry {
  seq: number;
  actor: PlayerName | null;
  // Shown to everyone except the actor.
  publicText: string;
  // Shown to the actor; falls back to publicText.
  privateText?: string;
  // Hidden from everyone except the actor.
  selfOnly?: boolean;
}

export interface GameState {
  // New for every match, so clients can tell a reset apart from a stale response.
  matchId: string;
  version: number;
  phase: Phase;
  round: number;
  handNo: number;
  // Total hands dealt this match; drives first-player alternation.
  handsPlayed: number;
  firstPlayer: PlayerName;
  turn: PlayerName;
  deck: number[];
  players: Record<PlayerName, PlayerState>;
  // Stays since the last draw or trump use; the hand ends at 2.
  consecutiveStays: number;
  result: HandResult | null;
  matchWinner: PlayerName | null;
  log: LogEntry[];
  nextSeq: number;
}

export type Action =
  | { type: 'use-trump'; uid: string }
  | { type: 'stay' }
  | { type: 'draw' }
  | { type: 'next-hand' }
  | { type: 'new-match' };

export interface PlayerView {
  name: PlayerName;
  hp: number;
  roundsWon: number;
  bet: number;
  // null = hidden face-down card.
  cards: (number | null)[];
  // Sum of the cards this viewer can see.
  visibleTotal: number;
  hasHiddenCard: boolean;
  table: Trump[];
  handCount: number;
  // Only present for the viewer's own player.
  hand?: Trump[];
}

export interface GameView {
  matchId: string;
  version: number;
  me: PlayerName;
  opponent: PlayerName;
  phase: Phase;
  round: number;
  handNo: number;
  turn: PlayerName;
  deckCount: number;
  target: number;
  players: Record<PlayerName, PlayerView>;
  result: HandResult | null;
  matchWinner: PlayerName | null;
  log: { seq: number; text: string; actor: PlayerName | null }[];
}
