'use client';

import { motion } from 'framer-motion';
import { Card as CardType } from '@/lib/types';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: 'text-red-500', diamonds: 'text-red-500',
  clubs: 'text-gray-200', spades: 'text-gray-200',
};

export function CardFace({ card }: { card: CardType }) {
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-16 h-24 rounded-lg border border-[#2a2a3e] bg-[#1a1a2e] flex flex-col items-center justify-center gap-0.5 shadow-lg"
    >
      <span className={`text-lg font-bold leading-none ${SUIT_COLORS[card.suit]}`}>
        {card.rank}
      </span>
      <span className={`text-xl leading-none ${SUIT_COLORS[card.suit]}`}>
        {SUIT_SYMBOLS[card.suit]}
      </span>
    </motion.div>
  );
}

export function CardBack() {
  return (
    <div className="w-16 h-24 rounded-lg border border-[#2a2a3e] bg-gradient-to-br from-[#1a1a3e] to-[#0a0a1e] flex items-center justify-center shadow-lg">
      <div className="w-10 h-16 rounded border border-[#d4af37]/30 bg-[#d4af37]/5" />
    </div>
  );
}
