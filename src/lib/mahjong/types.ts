// Core tile types
export type Suit = 'wan' | 'tong' | 'tiao';
export type TileValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type TileId = string; // "wan-5-2" = the 2nd copy of 5万

export interface Tile {
  id: TileId;
  suit: Suit;
  value: TileValue;
}

// Seats and player identity
export type Seat = 'east' | 'south' | 'west' | 'north';
export type PlayerKind = 'human' | 'ai';
export type HumanName = 'Aaron' | 'Vicky';

export interface SeatAssignment {
  seat: Seat;
  kind: PlayerKind;
  human?: HumanName;
  aiId?: string; // 'AI-1' | 'AI-2'
}

// Melds (公开副露)
export type MeldType = 'peng' | 'gang-ming' | 'gang-an' | 'gang-bu';

export interface Meld {
  type: MeldType;
  tiles: Tile[]; // 3 for peng, 4 for any gang
  fromSeat: Seat | null; // null for 暗杠
}

// Win types and results
export type WinType = 'ping-hu' | 'dui-dui-hu' | 'qing-yi-se' | 'qi-dui';

export interface HuResult {
  winTypes: WinType[];
  fan: number;
  selfDraw: boolean;
  winningTile: Tile;
  fromSeat: Seat | null; // null on 自摸
}

// Player state
export interface PlayerState {
  seat: Seat;
  assignment: SeatAssignment;
  hand: Tile[]; // 13 normally, 14 after draw/claim
  melds: Meld[];
  discards: Tile[];
  missingSuit: Suit | null;
  hasHu: boolean;
  huResult: HuResult | null;
  score: number;
}

// Phases
export type Phase =
  | 'seat-selection'
  | 'choose-missing'
  | 'playing'
  | 'claim-window'
  | 'settled';

// Claim window
export interface ClaimOption {
  seat: Seat;
  type: 'peng' | 'gang' | 'hu';
}

export interface PendingClaim {
  seat: Seat;
  choice: 'peng' | 'gang' | 'hu' | 'pass';
}

export interface ClaimWindow {
  discardedTile: Tile;
  fromSeat: Seat;
  options: ClaimOption[];
  pending: Seat[]; // humans whose decision we're waiting on
  decisions: PendingClaim[];
  expiresAt: number; // epoch ms
}

// Game state
export interface GameState {
  version: number;
  phase: Phase;
  wall: Tile[]; // server-only; filtered out for clients
  wallCount: number;
  seats: Record<Seat, PlayerState>;
  turn: Seat;
  dealer: Seat;
  lastDiscard: { seat: Seat; tile: Tile } | null;
  claimWindow: ClaimWindow | null;
  huOrder: Seat[];
  gameOver: boolean;
  handNumber: number;
}

// Turn order: counter-clockwise. east → north → west → south → east
export const TURN_ORDER: Seat[] = ['east', 'north', 'west', 'south'];

export function nextSeat(seat: Seat): Seat {
  const idx = TURN_ORDER.indexOf(seat);
  return TURN_ORDER[(idx + 1) % 4];
}
