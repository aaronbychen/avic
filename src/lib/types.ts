export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type PlayerName = 'Aaron' | 'Vicky';
export type Phase = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerStatus = 'playing' | 'folded' | 'all-in';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  name: PlayerName;
  chips: number;
  currentBet: number;
  status: PlayerStatus;
  holeCards: Card[];
}

export interface GameState {
  phase: Phase;
  pot: number;
  boardCards: Card[];
  turn: PlayerName;
  players: Record<PlayerName, Player>;
  deck: Card[];
  dealer: PlayerName;
  winner: PlayerName | 'split' | null;
  handRank: Record<PlayerName, string> | null;
  phaseRaised: boolean;
  raiseCount: number;
  lastRaiseAmount: number;
  actionsThisPhase: number;
}

export type HandRank =
  | 'Royal Flush'
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'One Pair'
  | 'High Card';

export interface EvaluatedHand {
  rank: HandRank;
  value: number;
  cards: Card[];
}
