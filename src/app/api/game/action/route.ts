import { NextRequest } from 'next/server';
import { doAction, getStateForPlayer, getState } from '@/lib/engine';
import { getPusherServer } from '@/lib/pusher-server';
import { PlayerName } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { player, action, amount } = body as { player: string; action: string; amount?: number };

  if (player !== 'Aaron' && player !== 'Vicky') {
    return Response.json({ ok: false, error: 'Invalid player' }, { status: 400 });
  }

  const result = await doAction(player as PlayerName, action, amount);
  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }

  const pusher = getPusherServer();
  const fullState = await getState();

  await Promise.all([
    pusher.trigger('game-channel', 'state-aaron', await getStateForPlayer('Aaron')),
    pusher.trigger('game-channel', 'state-vicky', await getStateForPlayer('Vicky')),
    ...(fullState.phase === 'showdown' &&
        fullState.players.Aaron.status !== 'folded' &&
        fullState.players.Vicky.status !== 'folded'
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
