'use client';

import { motion } from 'framer-motion';
import type { Suit } from '@/lib/mahjong/types';
import { useMahjongStore } from '@/lib/mahjong/store';
import { useCompactMode } from '@/lib/mahjong/useCompactMode';

const SUIT_LABEL: Record<Suit, string> = {
  wan: '万',
  tong: '筒',
  tiao: '条',
};

// Renders as an inline bar (intended to be slotted into Table.bottomSlot)
// so the player can see their hand while picking 缺.
export function ChooseMissing() {
  const { mySeat, state, sendAction } = useMahjongStore();
  const compact = useCompactMode();
  if (!mySeat) return null;

  const myMissing = state.seats[mySeat].missingSuit;
  const allChosen = (['east', 'south', 'west', 'north'] as const).every(
    (s) => state.seats[s].missingSuit !== null,
  );

  const buttonSize = compact ? 'w-16 h-16 text-2xl' : 'w-20 h-20 text-3xl';
  const titleClass = compact ? 'text-sm' : 'text-base';

  return (
    <div className={`flex flex-col items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <div className={`${titleClass} font-semibold text-[#d4af37] tracking-[0.3em]`}>
        定缺
      </div>
      {myMissing === null ? (
        <div className={`flex ${compact ? 'gap-2' : 'gap-3'}`}>
          {(['wan', 'tiao', 'tong'] as Suit[]).map((suit) => (
            <motion.button
              key={suit}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => sendAction({ type: 'choose-missing', seat: mySeat, suit })}
              className={
                `${buttonSize} rounded-xl border border-white/10 bg-white/[0.03] ` +
                'font-bold text-gray-200 hover:border-[#d4af37]/40 transition-colors'
              }
            >
              {SUIT_LABEL[suit]}
            </motion.button>
          ))}
        </div>
      ) : (
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-300`}>
          你定缺了 <span className="text-[#d4af37]">{SUIT_LABEL[myMissing]}</span>
          {!allChosen && (
            <span className="text-gray-500">，等待其他玩家定缺...</span>
          )}
        </p>
      )}
    </div>
  );
}
