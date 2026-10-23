import type { PlayerName } from './types';

export const TWENTYONE_CHANNEL = 'twentyone-channel';

// Payload is only { version }: the channel is public, so clients fetch their own
// filtered view from /api/twentyone/state instead of receiving state here.
export const UPDATED_EVENT = 'updated';
export const RESET_EVENT = 'reset';

export function parsePlayer(u: string | null | undefined): PlayerName | null {
  const v = u?.toLowerCase();
  if (v === 'aaron') return 'Aaron';
  if (v === 'vicky') return 'Vicky';
  return null;
}
