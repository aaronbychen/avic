import { NextResponse } from 'next/server';
import { deleteState, loadState } from '@/lib/mahjong/persistence';
import { pushGameEnded } from '@/lib/mahjong/pusher';

export async function POST() {
  const state = await loadState();
  if (state.phase !== 'seat-selection' && state.phase !== 'settled') {
    return NextResponse.json(
      { ok: false, error: 'hand-in-progress' },
      { status: 400 },
    );
  }
  await pushGameEnded(state);
  await deleteState();
  return NextResponse.json({
    ok: true,
    finalScores: {
      east: state.seats.east.score,
      south: state.seats.south.score,
      west: state.seats.west.score,
      north: state.seats.north.score,
    },
  });
}
