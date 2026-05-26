'use client';

import { useMahjongStore } from '@/lib/mahjong/store';

// Tiny escape-hatch button for when the game state gets wedged
// (e.g., AI driver stuck, stale-state deadlock). Confirms before nuking.
export function ForceResetButton() {
  const forceReset = useMahjongStore((s) => s.forceReset);
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm('强制重置游戏？所有进度将丢失。')) {
          forceReset();
        }
      }}
      className="fixed top-2 right-2 z-40 px-2 py-1 text-[10px] tracking-widest uppercase text-gray-600 hover:text-red-400 transition-colors"
      title="紧急重置：清空 Redis 中的游戏状态"
    >
      强制重置
    </button>
  );
}
