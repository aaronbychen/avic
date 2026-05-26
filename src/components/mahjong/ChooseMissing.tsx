'use client';

import { motion } from 'framer-motion';
import type { Suit } from '@/lib/mahjong/types';
import { useMahjongStore } from '@/lib/mahjong/store';

const SUIT_LABEL: Record<Suit, string> = {
  wan: '万',
  tong: '筒',
  tiao: '条',
};

export function ChooseMissing() {
  const { mySeat, state, sendAction } = useMahjongStore();
  if (!mySeat) return null;

  const myMissing = state.seats[mySeat].missingSuit;
  const allChosen = (['east', 'south', 'west', 'north'] as const).every(
    (s) => state.seats[s].missingSuit !== null,
  );

  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8 fixed inset-0 bg-[#0a0a0a]/85 backdrop-blur-sm z-30">
      <h2 className="text-2xl font-bold text-[#d4af37] tracking-wider">定缺</h2>
      {myMissing === null ? (
        <div className="flex gap-4">
          {(['wan', 'tiao', 'tong'] as Suit[]).map((suit) => (
            <motion.button
              key={suit}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => sendAction({ type: 'choose-missing', seat: mySeat, suit })}
              className="w-32 h-40 rounded-2xl border border-white/10 bg-white/[0.03] text-4xl font-bold text-gray-200 hover:border-[#d4af37]/40 transition-colors"
            >
              {SUIT_LABEL[suit]}
            </motion.button>
          ))}
        </div>
      ) : (
        <p className="text-lg text-gray-300">
          你定缺了{SUIT_LABEL[myMissing]}
          {!allChosen && <span className="text-gray-500">，等待其他玩家定缺...</span>}
        </p>
      )}
    </div>
  );
}
