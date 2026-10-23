'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TRUMPS } from '@/lib/twentyone/cards';
import { trumpBlockReason } from '@/lib/twentyone/rules';
import { useTwentyOneStore } from '@/lib/twentyone/store';
import type { GameView, Trump } from '@/lib/twentyone/types';
import { TrumpChip } from './TrumpChip';
import { TrumpDetail } from './TrumpDetail';

export function blockReasonFor(view: GameView, trump: Trump): string | null {
  if (view.phase !== 'playing') return '这一局已经结束';
  if (view.turn !== view.me) return '还没轮到你';
  const me = view.players[view.me];
  return trumpBlockReason({
    def: TRUMPS[trump.id],
    ownTotal: me.visibleTotal,
    target: view.target,
    ownTable: me.table,
    oppTable: view.players[view.opponent].table,
  });
}

export function TrumpSheet({ view, onClose }: { view: GameView; onClose: () => void }) {
  const sendAction = useTwentyOneStore((s) => s.sendAction);
  const [selected, setSelected] = useState<Trump | null>(null);
  const hand = view.players[view.me].hand ?? [];

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#141414] p-4 pb-8"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-200">我的王牌（{hand.length}）</h2>
          <button type="button" onClick={onClose} className="px-2 text-sm text-gray-400">
            收起
          </button>
        </div>
        {hand.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">没有王牌</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {hand.map((t) => (
              <TrumpChip
                key={t.uid}
                id={t.id}
                size="md"
                dimmed={!!blockReasonFor(view, t)}
                onClick={() => setSelected(t)}
              />
            ))}
          </div>
        )}
      </motion.div>
      <AnimatePresence>
        {selected && (
          <TrumpDetail
            id={selected.id}
            blockReason={blockReasonFor(view, selected)}
            onClose={() => setSelected(null)}
            onUse={() => {
              sendAction({ type: 'use-trump', uid: selected.uid });
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
