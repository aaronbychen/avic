import { NextRequest, NextResponse } from 'next/server';
import {
  autoExpireClaimWindow,
  loadState,
  saveState,
} from '@/lib/mahjong/persistence';
import {
  applyActionWithAI,
  type Action,
} from '@/lib/mahjong/engine';
import {
  pushAllStates,
  pushClaimWindowOpened,
  pushHandSettled,
  seatOfHuman,
} from '@/lib/mahjong/pusher';
import type { GameState, HumanName, Seat } from '@/lib/mahjong/types';

interface ActionRequestBody {
  expectedVersion?: number;
  identity: { u: 'aaron' | 'vicky' };
  action: Action;
}

function humanFromIdentity(u: 'aaron' | 'vicky'): HumanName {
  return u === 'aaron' ? 'Aaron' : 'Vicky';
}

// Validate that the human submitting the action owns the seat it references (if any).
function actionSeatBelongsToHuman(state: GameState, action: Action, human: HumanName): boolean {
  // Actions that don't carry a seat are always allowed for any human.
  if (action.type === 'start-next-hand' || action.type === 'end-game') return true;

  // For pick-seat, the human field in the action must match identity.
  if (action.type === 'pick-seat') return action.human === human;

  // For all other actions, action.seat must be the seat assigned to this human.
  const seat = seatOfHuman(state, human);
  if (!seat) return false;
  return (action as { seat: Seat }).seat === seat;
}

export async function POST(req: NextRequest) {
  let body: ActionRequestBody;
  try {
    body = (await req.json()) as ActionRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  if (!body.identity?.u || !body.action) {
    return NextResponse.json({ ok: false, error: 'missing-fields' }, { status: 400 });
  }
  const human = humanFromIdentity(body.identity.u);

  // Load and auto-expire stale claim window before evaluating the action.
  let state = await loadState();
  const expired = autoExpireClaimWindow(state);
  if (expired !== state) {
    state = expired;
    await saveState(state);
    await pushAllStates(state);
    if (state.phase === 'settled') await pushHandSettled(state);
  }

  // Optimistic version check.
  if (
    typeof body.expectedVersion === 'number' &&
    body.expectedVersion !== state.version
  ) {
    return NextResponse.json(
      { ok: false, error: 'stale-state' },
      { status: 409 },
    );
  }

  // Authorize.
  if (!actionSeatBelongsToHuman(state, body.action, human)) {
    return NextResponse.json(
      { ok: false, error: 'forbidden-seat' },
      { status: 403 },
    );
  }

  const result = applyActionWithAI(state, body.action);
  if (!result.ok || !result.state) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'engine-error' },
      { status: 400 },
    );
  }
  const next = result.state;
  await saveState(next);
  await pushAllStates(next);
  if (next.phase === 'claim-window') {
    await pushClaimWindowOpened(next);
  }
  if (next.phase === 'settled' && state.phase !== 'settled') {
    await pushHandSettled(next);
  }
  return NextResponse.json({ ok: true, version: next.version });
}
