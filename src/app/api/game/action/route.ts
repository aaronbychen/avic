import { NextRequest } from 'next/server';
import { doAction, getStateForPlayer, getState } from '@/lib/engine';
import { getPusherServer } from '@/lib/pusher-server';
import { PlayerName } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { player, action, amount } = body as { player: string; action: string; amount?: number };

  // Validate player name
  if (player !== 'Aaron' && player !== 'Vicky') {
    return Response.json({ ok: false, error: 'Invalid player' }, { status: 400 });
  }

  const result = doAction(player as PlayerName, action, amount);
  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }

  // Broadcast filtered state to each player
  const pusher = getPusherServer();
  const fullState = getState();

  await Promise.all([
    pusher.trigger('game-channel', 'state-aaron', getStateForPlayer('Aaron')),
    pusher.trigger('game-channel', 'state-vicky', getStateForPlayer('Vicky')),
    // If showdown, also send a combined event with both hands visible
    ...(fullState.phase === 'showdown'
      ? [pusher.trigger('game-channel', 'showdown', {
          players: fullState.players,
          winner: fullState.winner,
          handRank: fullState.handRank,
          boardCards: fullState.boardCards,
        })]
      : []),
  ]);

  return Response.json({ ok: true });
}
