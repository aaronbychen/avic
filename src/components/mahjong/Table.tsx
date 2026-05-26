'use client';

import { useState } from 'react';
import type { GameState, Seat } from '@/lib/mahjong/types';
import { TURN_ORDER } from '@/lib/mahjong/types';
import { SeatArea } from './SeatArea';
import { ActionBar } from './ActionBar';
import { useCompactMode } from '@/lib/mahjong/useCompactMode';

interface TableProps {
  state: GameState;
  mySeat: Seat;
  bottomSlot?: React.ReactNode; // overrides ActionBar when set (e.g., ChooseMissing strip)
}

// bottom = me, right = 下家, top = 对家, left = 上家
function perspectiveLayout(mySeat: Seat) {
  const idx = TURN_ORDER.indexOf(mySeat);
  return {
    bottom: TURN_ORDER[(idx + 0) % 4],
    right: TURN_ORDER[(idx + 1) % 4],
    top: TURN_ORDER[(idx + 2) % 4],
    left: TURN_ORDER[(idx + 3) % 4],
  };
}

export function Table({ state, mySeat, bottomSlot }: TableProps) {
  const layout = perspectiveLayout(mySeat);
  const compact = useCompactMode();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  function onTileClick(tileId: string) {
    setSelectedTileId((prev) => (prev === tileId ? null : tileId));
  }

  const lastDiscardId = state.lastDiscard?.tile.id ?? null;

  const containerPadding = compact ? 'p-2' : 'p-6';
  const rowGap = compact ? 'gap-2' : 'gap-4';
  const middleGap = compact ? 'gap-3' : 'gap-6';
  const bottomGap = compact ? 'gap-2' : 'gap-3';

  return (
    <div
      className={`w-full max-w-[1400px] grid grid-rows-[auto_1fr_auto] ${rowGap} ${containerPadding}`}
    >
      {/* Top */}
      <div className="flex justify-center">
        <SeatArea
          player={state.seats[layout.top]}
          isMe={false}
          isActive={state.turn === layout.top}
          position="top"
          highlightLastDiscardId={lastDiscardId}
          compact={compact}
        />
      </div>

      {/* Middle row: left | center | right */}
      <div className={`grid grid-cols-[auto_1fr_auto] items-center ${middleGap}`}>
        <SeatArea
          player={state.seats[layout.left]}
          isMe={false}
          isActive={state.turn === layout.left}
          position="left"
          highlightLastDiscardId={lastDiscardId}
          compact={compact}
        />

        {/* Center: wall count + status banner */}
        <div className={`flex flex-col items-center justify-center ${compact ? 'gap-1' : 'gap-3'}`}>
          <div
            className={
              `${compact ? 'text-[10px]' : 'text-xs'} uppercase tracking-[0.3em] ` +
              (state.wallCount < 10 ? 'text-red-400' : 'text-gray-500')
            }
          >
            牌墙剩余 {state.wallCount}
          </div>
          {state.phase === 'claim-window' && state.claimWindow && (
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-[#d4af37] text-center`}>
              {state.seats[state.claimWindow.fromSeat].assignment.kind === 'human'
                ? state.seats[state.claimWindow.fromSeat].assignment.human
                : state.seats[state.claimWindow.fromSeat].assignment.aiId}{' '}
              打了一张牌，等待响应...
            </div>
          )}
          {state.phase === 'settled' && state.huOrder.length > 0 && (
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-[#d4af37] text-center`}>
              本局结束 · 胡牌顺序: {state.huOrder.join(' → ')}
            </div>
          )}
          {state.phase === 'settled' && state.huOrder.length === 0 && (
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400`}>流局</div>
          )}
        </div>

        <SeatArea
          player={state.seats[layout.right]}
          isMe={false}
          isActive={state.turn === layout.right}
          position="right"
          highlightLastDiscardId={lastDiscardId}
          compact={compact}
        />
      </div>

      {/* Bottom (me) */}
      <div className={`flex flex-col items-center ${bottomGap}`}>
        <SeatArea
          player={state.seats[layout.bottom]}
          isMe={true}
          isActive={state.turn === layout.bottom}
          position="bottom"
          highlightLastDiscardId={lastDiscardId}
          selectedTileId={selectedTileId}
          onTileClick={onTileClick}
          compact={compact}
        />
        {bottomSlot ?? (
          <ActionBar
            mySeat={mySeat}
            selectedTileId={selectedTileId}
            clearSelection={() => setSelectedTileId(null)}
          />
        )}
      </div>
    </div>
  );
}
