import { endGame } from '@/lib/engine';
import { getPusherServer } from '@/lib/pusher-server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await endGame();
  const pusher = getPusherServer();
  await pusher.trigger('game-channel', 'game-ended', result);
  return Response.json(result);
}
