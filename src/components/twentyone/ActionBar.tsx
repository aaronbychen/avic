'use client';

import { motion } from 'framer-motion';
import { useTwentyOneStore } from '@/lib/twentyone/store';
import type { GameView } from '@/lib/twentyone/types';

export function ActionBar({ view, onOpenTrumps }: { view: GameView; onOpenTrumps: () => void }) {
  const { sendAction, pending } = useTwentyOneStore();
  const me = view.players[view.me];
  const myTurn = view.phase === 'playing' && view.turn === view.me && !pending;
  const canDraw = myTurn && me.visibleTotal <= view.target && view.deckCount > 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <BarButton label={`王牌 (${me.handCount})`} enabled={view.phase === 'playing'} onClick={onOpenTrumps} />
      <BarButton label="停牌" enabled={myTurn} onClick={() => sendAction({ type: 'stay' })} />
      <BarButton label="抽牌" enabled={canDraw} gold onClick={() => sendAction({ type: 'draw' })} />
    </div>
  );
}

function BarButton({
  label,
  enabled,
  gold,
  onClick,
}: {
  label: string;
  enabled: boolean;
  gold?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={enabled ? { scale: 0.95 } : undefined}
      disabled={!enabled}
      onClick={onClick}
      className={
        'rounded-xl py-4 text-base font-semibold tracking-wider transition-colors ' +
        (!enabled
          ? 'bg-white/[0.03] text-gray-600'
          : gold
            ? 'bg-[#d4af37] text-black'
            : 'bg-white/10 text-gray-100')
      }
    >
      {label}
    </motion.button>
  );
}
