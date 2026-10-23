'use client';

import { motion } from 'framer-motion';

interface NumberCardProps {
  // null = opponent's hidden face-down card.
  value: number | null;
  // Own face-down card: visible to me, marked so I remember the opponent can't see it.
  secret?: boolean;
}

export function NumberCard({ value, secret }: NumberCardProps) {
  const hidden = value === null;
  return (
    <motion.div
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={
        'relative flex items-center justify-center w-12 h-[4.5rem] sm:w-14 sm:h-20 rounded-lg border text-2xl sm:text-3xl font-bold tabular-nums select-none ' +
        (hidden
          ? 'bg-[repeating-linear-gradient(45deg,#1f2937_0,#1f2937_6px,#111827_6px,#111827_12px)] border-white/10 text-gray-500'
          : secret
            ? 'bg-[#f3e9d2]/90 border-dashed border-[#d4af37] text-[#1a1a2e]'
            : 'bg-[#f3e9d2] border-white/20 text-[#1a1a2e]')
      }
    >
      {hidden ? '?' : value}
      {secret && (
        <span className="absolute -top-2 -right-2 px-1 rounded bg-[#d4af37] text-[9px] leading-4 text-black font-semibold">
          暗
        </span>
      )}
    </motion.div>
  );
}
