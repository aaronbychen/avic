import type { WinType } from './types';

export const FAN_PER_WIN_TYPE: Record<WinType, number> = {
  'ping-hu': 1,
  'dui-dui-hu': 2,
  'qi-dui': 2,
  'qing-yi-se': 4,
};

export function computeFan(winTypes: readonly WinType[], selfDraw: boolean): number {
  let fan = 0;
  for (const t of winTypes) fan += FAN_PER_WIN_TYPE[t];
  if (selfDraw) fan += 1;
  return fan;
}

export function chipsForFan(fan: number): number {
  return 2 ** fan;
}
