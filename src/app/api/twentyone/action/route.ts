import { NextRequest, NextResponse } from 'next/server';
import { getPusherServer } from '@/lib/pusher-server';
import { applyAction } from '@/lib/twentyone/engine';
import { loadState, saveState } from '@/lib/twentyone/persistence';
import { TWENTYONE_CHANNEL, UPDATED_EVENT, parsePlayer } from '@/lib/twentyone/pusher';
import { defaultRng } from '@/lib/twentyone/rng';
import type { Action } from '@/lib/twentyone/types';

interface ActionRequestBody {
  u?: string;
  expectedVersion?: number;
  action?: Action;
}

export async function POST(req: NextRequest) {
  let body: ActionRequestBody;
  try {
    body = (await req.json()) as ActionRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  const me = parsePlayer(body.u);
  if (!me || !body.action) {
    return NextResponse.json({ ok: false, error: 'missing-fields' }, { status: 400 });
  }

  const state = await loadState();
  if (typeof body.expectedVersion === 'number' && body.expectedVersion !== state.version) {
    return NextResponse.json({ ok: false, error: '状态已更新，请重试' }, { status: 409 });
  }

  const result = applyAction(state, me, body.action, defaultRng);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  await saveState(result.state);
  await getPusherServer().trigger(TWENTYONE_CHANNEL, UPDATED_EVENT, { version: result.state.version });
  return NextResponse.json({ ok: true, version: result.state.version });
}
