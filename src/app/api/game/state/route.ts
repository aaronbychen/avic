import { NextRequest } from 'next/server';
import { getStateForPlayer } from '@/lib/engine';
import { PlayerName } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get('player');

  if (player !== 'Aaron' && player !== 'Vicky') {
    return Response.json({ error: 'Invalid player' }, { status: 400 });
  }

  return Response.json(getStateForPlayer(player as PlayerName));
}
