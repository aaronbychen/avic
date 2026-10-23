import { NextRequest, NextResponse } from 'next/server';
import { loadState } from '@/lib/twentyone/persistence';
import { parsePlayer } from '@/lib/twentyone/pusher';
import { toView } from '@/lib/twentyone/view';

export async function GET(req: NextRequest) {
  const me = parsePlayer(req.nextUrl.searchParams.get('u'));
  if (!me) {
    return NextResponse.json({ ok: false, error: 'missing-u' }, { status: 400 });
  }
  const state = await loadState();
  return NextResponse.json(toView(state, me));
}
