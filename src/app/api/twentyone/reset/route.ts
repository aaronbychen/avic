import { NextResponse } from 'next/server';
import { getPusherServer } from '@/lib/pusher-server';
import { deleteState } from '@/lib/twentyone/persistence';
import { RESET_EVENT, TWENTYONE_CHANNEL } from '@/lib/twentyone/pusher';

// Escape hatch: wipes the match; the next state load deals a fresh one.
export async function POST() {
  await deleteState();
  await getPusherServer().trigger(TWENTYONE_CHANNEL, RESET_EVENT, {});
  return NextResponse.json({ ok: true });
}
