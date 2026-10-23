'use client';

import { motion } from 'framer-motion';
import { useTwentyOneStore } from '@/lib/twentyone/store';
import type { GameView } from '@/lib/twentyone/types';

export function ResultPanel({ view }: { view: GameView }) {
  const { sendAction, pending } = useTwentyOneStore();
  const r = view.result;
  if (!r) return null;
  const matchOver = view.phase === 'match-over';

  let headline = '平局';
  if (matchOver && view.matchWinner) headline = view.matchWinner === view.me ? '你赢得了整场！' : `${view.matchWinner} 赢得了整场`;
  else if (r.roundWinner) headline = r.roundWinner === view.me ? `你赢下了第 ${view.round} 轮` : `${r.roundWinner} 赢下了第 ${view.round} 轮`;
  else if (r.winner) headline = r.winner === view.me ? '这一局你赢了' : '这一局你输了';

  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 px-4 pb-6 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
      >
        <h2 className="text-center text-xl font-bold text-[#d4af37]">{headline}</h2>
        <p className="mt-1 text-center text-xs text-gray-500">目标 {r.target} 点</p>
        <div className="mt-4 space-y-2">
          {([view.me, view.opponent] as const).map((p) => (
            <div key={p} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
              <span className={'text-sm ' + (r.winner === p ? 'text-[#d4af37] font-semibold' : 'text-gray-300')}>
                {p}
              </span>
              <span className="text-sm text-gray-400 tabular-nums">{r.cards[p].join(' + ')}</span>
              <span
                className={
                  'w-12 text-right text-lg font-bold tabular-nums ' + (r.totals[p] > r.target ? 'text-red-400' : 'text-gray-100')
                }
              >
                {r.totals[p]}
              </span>
            </div>
          ))}
        </div>
        {r.winner && (
          <p className="mt-3 text-center text-sm text-gray-300">
            {r.winner === view.me ? view.opponent : view.me} 失去 {r.damage} 滴血
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => sendAction({ type: matchOver ? 'new-match' : 'next-hand' })}
          className="mt-5 w-full rounded-xl bg-[#d4af37] py-3 font-semibold text-black disabled:opacity-50"
        >
          {matchOver ? '再来一场' : r.roundWinner ? '下一轮' : '下一局'}
        </button>
      </motion.div>
    </motion.div>
  );
}
