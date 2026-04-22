import { endGame } from '@/lib/engine';
import { getPusherServer } from '@/lib/pusher-server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await endGame();
  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }
  const pusher = getPusherServer();
  await pusher.trigger('game-channel', 'game-ended', { aaron: result.aaron, vicky: result.vicky });
  return Response.json(result);
}
