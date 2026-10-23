'use client';

import { MAX_HP, ROUNDS_TO_WIN } from '@/lib/twentyone/rules';
import type { PlayerView, TrumpId } from '@/lib/twentyone/types';
import { NumberCard } from './NumberCard';
import { TrumpChip } from './TrumpChip';

interface PlayerAreaProps {
  player: PlayerView;
  isMe: boolean;
  isTurn: boolean;
  target: number;
  onTableTrump: (id: TrumpId) => void;
}

export function PlayerArea({ player, isMe, isTurn, target, onTableTrump }: PlayerAreaProps) {
  const bust = !player.hasHiddenCard && player.visibleTotal > target;
  const totalText = player.hasHiddenCard ? `? + ${player.visibleTotal}` : String(player.visibleTotal);

  const header = (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={'font-semibold ' + (isTurn ? 'text-[#d4af37]' : 'text-gray-300')}>
          {player.name}
          {isTurn && ' ●'}
        </span>
        <span className="text-[#d4af37] tracking-tight">
          {'★'.repeat(player.roundsWon)}
          <span className="text-gray-700">{'★'.repeat(ROUNDS_TO_WIN - player.roundsWon)}</span>
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {!isMe && <span>王牌 ×{player.handCount}</span>}
        <span>
          赌注 <span className="text-base font-bold text-red-300 tabular-nums">{player.bet}</span>
        </span>
      </div>
    </div>
  );

  const hp = (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-0.5">
        {Array.from({ length: MAX_HP }, (_, i) => (
          <div key={i} className={'h-1.5 flex-1 rounded-full ' + (i < player.hp ? 'bg-red-500' : 'bg-white/10')} />
        ))}
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-gray-400">
        {player.hp}/{MAX_HP}
      </span>
    </div>
  );

  const cards = (
    <div className="flex items-end justify-between gap-2">
      <div className="flex flex-wrap gap-1.5">
        {player.cards.map((v, i) => (
          <NumberCard key={i} value={v} secret={isMe && i === 0} />
        ))}
      </div>
      <div className={'text-2xl font-bold tabular-nums ' + (bust ? 'text-red-400' : 'text-gray-100')}>
        {totalText}
        {bust && <span className="ml-1 text-xs">爆</span>}
      </div>
    </div>
  );

  const table = (
    <div className="flex min-h-7 flex-wrap gap-1">
      {player.table.length === 0 ? (
        <span className="text-[11px] text-gray-600">牌桌上没有王牌</span>
      ) : (
        player.table.map((t) => <TrumpChip key={t.uid} id={t.id} onClick={() => onTableTrump(t.id)} />)
      )}
    </div>
  );

  // Mirror the layout so both tables sit toward the middle of the screen.
  return (
    <div
      className={
        'flex flex-col gap-2 rounded-2xl border p-3 ' +
        (isTurn ? 'border-[#d4af37]/50 bg-white/[0.04]' : 'border-white/5 bg-white/[0.02]')
      }
    >
      {isMe ? (
        <>
          {table}
          {cards}
          {hp}
          {header}
        </>
      ) : (
        <>
          {header}
          {hp}
          {cards}
          {table}
        </>
      )}
    </div>
  );
}
