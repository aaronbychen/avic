import { describe, it, expect } from 'vitest';
import { computeFan, FAN_PER_WIN_TYPE, chipsForFan } from './scoring';
import type { WinType } from './types';

describe('computeFan', () => {
  it('returns base 1 for ping-hu only, no self-draw', () => {
    expect(computeFan(['ping-hu'], false)).toBe(1);
  });

  it('adds +1 for self-draw', () => {
    expect(computeFan(['ping-hu'], true)).toBe(2);
  });

  it('stacks 清一色 + 对对胡 (4 + 2 = 6)', () => {
    const types: WinType[] = ['ping-hu', 'dui-dui-hu', 'qing-yi-se'];
    // ping-hu (1) + dui-dui-hu (2) + qing-yi-se (4) = 7
    expect(computeFan(types, false)).toBe(7);
  });

  it('stacks self-draw with multiple types', () => {
    const types: WinType[] = ['ping-hu', 'qing-yi-se'];
    // 1 + 4 + 1 (selfDraw) = 6
    expect(computeFan(types, true)).toBe(6);
  });

  it('七对 base 2', () => {
    expect(computeFan(['qi-dui'], false)).toBe(2);
  });
});

describe('FAN_PER_WIN_TYPE', () => {
  it('matches spec base values', () => {
    expect(FAN_PER_WIN_TYPE['ping-hu']).toBe(1);
    expect(FAN_PER_WIN_TYPE['dui-dui-hu']).toBe(2);
    expect(FAN_PER_WIN_TYPE['qi-dui']).toBe(2);
    expect(FAN_PER_WIN_TYPE['qing-yi-se']).toBe(4);
  });
});

describe('chipsForFan', () => {
  it('returns 2^fan', () => {
    expect(chipsForFan(0)).toBe(1);
    expect(chipsForFan(1)).toBe(2);
    expect(chipsForFan(3)).toBe(8);
    expect(chipsForFan(7)).toBe(128);
  });
});
