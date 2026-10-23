'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTwentyOneStore } from '@/lib/twentyone/store';
import type { GameView, TrumpId } from '@/lib/twentyone/types';
import { ActionBar } from './ActionBar';
import { PlayerArea } from './PlayerArea';
import { ResultPanel } from './ResultPanel';
import { TrumpDetail } from './TrumpDetail';
import { TrumpSheet } from './TrumpSheet';

export function Table({ view }: { view: GameView }) {
  const error = useTwentyOneStore((s) => s.error);
  const forceReset = useTwentyOneStore((s) => s.forceReset);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<TrumpId | null>(null);
  const me = view.players[view.me];
  const opp = view.players[view.opponent];
  const myTurn = view.phase === 'playing' && view.turn === view.me;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>21点</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('强制重置游戏？所有进度将丢失。')) forceReset();
          }}
          className="px-1 hover:text-red-400"
        >
          强制重置
        </button>
      </div>

      <PlayerArea player={opp} isMe={false} isTurn={view.turn === opp.name && view.phase === 'playing'} target={view.target} onTableTrump={setDetail} />

      <div className="flex flex-1 flex-col justify-center gap-2 py-1 text-center">
        <div className={'text-base font-semibold ' + (myTurn ? 'text-[#d4af37]' : 'text-gray-500')}>
          {view.phase !== 'playing' ? '本局结束' : myTurn ? '轮到你了' : `等待 ${view.opponent} 行动…`}
        </div>
        <div className="mx-auto flex w-full flex-col gap-0.5 text-xs text-gray-500">
          {view.log.slice(-3).map((e) => (
            <div key={e.seq} className="truncate">
              {e.text}
            </div>
          ))}
        </div>
        {error && <div className="mx-auto rounded-lg bg-red-950/80 px-3 py-1.5 text-sm text-red-200">{error}</div>}
      </div>

      <PlayerArea player={me} isMe isTurn={myTurn} target={view.target} onTableTrump={setDetail} />

      <ActionBar view={view} onOpenTrumps={() => setSheetOpen(true)} />

      <AnimatePresence>{sheetOpen && <TrumpSheet view={view} onClose={() => setSheetOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{detail !== null && <TrumpDetail id={detail} onClose={() => setDetail(null)} />}</AnimatePresence>
      {view.phase !== 'playing' && <ResultPanel view={view} />}
    </div>
  );
}
