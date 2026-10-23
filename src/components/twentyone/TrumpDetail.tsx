'use client';

import { motion } from 'framer-motion';
import { TRUMPS } from '@/lib/twentyone/cards';
import type { TrumpId } from '@/lib/twentyone/types';
import { CATEGORY_STYLE } from './TrumpChip';

interface TrumpDetailProps {
  id: TrumpId;
  onClose: () => void;
  // Shown only for cards in my hand.
  onUse?: () => void;
  blockReason?: string | null;
}

export function TrumpDetail({ id, onClose, onUse, blockReason }: TrumpDetailProps) {
  const def = TRUMPS[id];
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={'w-full max-w-xs rounded-2xl border-2 p-5 shadow-2xl ' + CATEGORY_STYLE[def.category]}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">{def.name}</h2>
          <span className="text-[11px] opacity-70">{def.kind === 'table' ? '牌桌持续' : '即时'}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-gray-100">{def.desc}</p>
        {onUse && (
          <div className="mt-5">
            {blockReason && <p className="mb-2 text-xs text-gray-300">{blockReason}</p>}
            <button
              type="button"
              disabled={!!blockReason}
              onClick={onUse}
              className="w-full rounded-xl bg-[#d4af37] py-3 font-semibold text-black disabled:bg-white/10 disabled:text-gray-500"
            >
              使用
            </button>
          </div>
        )}
        <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-sm text-gray-300">
          关闭
        </button>
      </motion.div>
    </motion.div>
  );
}
