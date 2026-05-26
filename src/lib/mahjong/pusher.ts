import { getPusherServer } from '../pusher-server';
import type { GameState, HumanName, Seat } from './types';
import { getStateForSeat } from './persistence';

export const MAHJONG_CHANNEL = 'mahjong-channel';

export const SEAT_STATE_EVENT: Record<Seat, string> = {
  east: 'state-east',
  south: 'state-south',
  west: 'state-west',
  north: 'state-north',
};

// Push per-seat filtered state to all 4 seats.
export async function pushAllStates(state: GameState): Promise<void> {
  const pusher = getPusherServer();
  await Promise.all(
    (['east', 'south', 'west', 'north'] as Seat[]).map(seat =>
      pusher.trigger(MAHJONG_CHANNEL, SEAT_STATE_EVENT[seat], getStateForSeat(state, seat)),
    ),
  );
}

export async function pushClaimWindowOpened(state: GameState): Promise<void> {
  if (!state.claimWindow) return;
  const pusher = getPusherServer();
  const optionsBySeat: Partial<Record<Seat, string[]>> = {};
  for (const opt of state.claimWindow.options) {
    optionsBySeat[opt.seat] = [...(optionsBySeat[opt.seat] ?? []), opt.type];
  }
  await pusher.trigger(MAHJONG_CHANNEL, 'claim-window-opened', {
    discardedTile: state.claimWindow.discardedTile,
    fromSeat: state.claimWindow.fromSeat,
    expiresAt: state.claimWindow.expiresAt,
    optionsBySeat,
  });
}

export async function pushHandSettled(state: GameState): Promise<void> {
  const pusher = getPusherServer();
  const results: Record<Seat, GameState['seats']['east']['huResult']> = {
    east: state.seats.east.huResult,
    south: state.seats.south.huResult,
    west: state.seats.west.huResult,
    north: state.seats.north.huResult,
  };
  const scoreDeltas: Record<Seat, number> = {
    east: state.seats.east.score,
    south: state.seats.south.score,
    west: state.seats.west.score,
    north: state.seats.north.score,
  };
  await pusher.trigger(MAHJONG_CHANNEL, 'hand-settled', {
    huOrder: state.huOrder,
    results,
    scoreDeltas,
  });
}

export async function pushGameEnded(state: GameState): Promise<void> {
  const pusher = getPusherServer();
  const finalScores: Record<Seat, number> = {
    east: state.seats.east.score,
    south: state.seats.south.score,
    west: state.seats.west.score,
    north: state.seats.north.score,
  };
  await pusher.trigger(MAHJONG_CHANNEL, 'game-ended', { finalScores });
}

// Identify which seat a human (Aaron or Vicky) currently occupies, if any.
export function seatOfHuman(state: GameState, human: HumanName): Seat | null {
  for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
    const a = state.seats[seat].assignment;
    if (a.kind === 'human' && a.human === human) return seat;
  }
  return null;
}
