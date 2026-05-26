import { NextRequest, NextResponse } from 'next/server';
import {
  autoExpireClaimWindow,
  getStateForSeat,
  loadState,
  saveState,
} from '@/lib/mahjong/persistence';
import { pushAllStates, pushHandSettled, seatOfHuman } from '@/lib/mahjong/pusher';
import type { HumanName } from '@/lib/mahjong/types';

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')?.toLowerCase();
  if (u !== 'aaron' && u !== 'vicky') {
    return NextResponse.json({ ok: false, error: 'missing-u' }, { status: 400 });
  }
  const human: HumanName = u === 'aaron' ? 'Aaron' : 'Vicky';

  let state = await loadState();
  const expired = autoExpireClaimWindow(state);
  if (expired !== state) {
    state = expired;
    await saveState(state);
    await pushAllStates(state);
    if (state.phase === 'settled') await pushHandSettled(state);
  }

  const seat = seatOfHuman(state, human);
  // If human hasn't picked a seat yet, return a viewer-style state with all hands hidden.
  if (seat === null) {
    const filtered = getStateForSeat(state, 'east');
    filtered.seats = {
      ...filtered.seats,
      east: {
        ...filtered.seats.east,
        hand: filtered.seats.east.hand.map((_, i) => ({
          id: `hidden-east-${i}`,
          suit: 'wan' as const,
          value: 1 as const,
        })),
      },
    };
    return NextResponse.json(filtered);
  }
  return NextResponse.json(getStateForSeat(state, seat));
}
