'use client';

import { useState } from 'react';
import type { GameState, Seat } from '@/lib/mahjong/types';
import { TURN_ORDER } from '@/lib/mahjong/types';
import { SeatArea } from './SeatArea';
import { ActionBar } from './ActionBar';

interface TableProps {
  state: GameState;
  mySeat: Seat;
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

export function Table({ state, mySeat }: TableProps) {
  const layout = perspectiveLayout(mySeat);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  function onTileClick(tileId: string) {
    setSelectedTileId((prev) => (prev === tileId ? null : tileId));
  }

  const lastDiscardId = state.lastDiscard?.tile.id ?? null;

  return (
    <div className="w-full max-w-[1400px] grid grid-rows-[auto_1fr_auto] gap-4 p-6">
      {/* Top */}
      <div className="flex justify-center">
        <SeatArea
          player={state.seats[layout.top]}
          isMe={false}
          isActive={state.turn === layout.top}
          position="top"
          highlightLastDiscardId={lastDiscardId}
        />
      </div>

      {/* Middle row: left | center | right */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-6">
        <SeatArea
          player={state.seats[layout.left]}
          isMe={false}
          isActive={state.turn === layout.left}
          position="left"
          highlightLastDiscardId={lastDiscardId}
        />

        {/* Center: wall count + status banner */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div
            className={
              'text-xs uppercase tracking-[0.3em] ' +
              (state.wallCount < 10 ? 'text-red-400' : 'text-gray-500')
            }
          >
            牌墙剩余 {state.wallCount}
          </div>
          {state.phase === 'claim-window' && state.claimWindow && (
            <div className="text-sm text-[#d4af37]">
              {state.seats[state.claimWindow.fromSeat].assignment.kind === 'human'
                ? state.seats[state.claimWindow.fromSeat].assignment.human
                : state.seats[state.claimWindow.fromSeat].assignment.aiId}{' '}
              打了一张牌，等待响应...
            </div>
          )}
          {state.phase === 'settled' && state.huOrder.length > 0 && (
            <div className="text-sm text-[#d4af37]">
              本局结束 · 胡牌顺序: {state.huOrder.join(' → ')}
            </div>
          )}
          {state.phase === 'settled' && state.huOrder.length === 0 && (
            <div className="text-sm text-gray-400">流局</div>
          )}
        </div>

        <SeatArea
          player={state.seats[layout.right]}
          isMe={false}
          isActive={state.turn === layout.right}
          position="right"
          highlightLastDiscardId={lastDiscardId}
        />
      </div>

      {/* Bottom (me) */}
      <div className="flex flex-col items-center gap-3">
        <SeatArea
          player={state.seats[layout.bottom]}
          isMe={true}
          isActive={state.turn === layout.bottom}
          position="bottom"
          highlightLastDiscardId={lastDiscardId}
          selectedTileId={selectedTileId}
          onTileClick={onTileClick}
        />
        <ActionBar
          mySeat={mySeat}
          selectedTileId={selectedTileId}
          clearSelection={() => setSelectedTileId(null)}
        />
      </div>
    </div>
  );
}
