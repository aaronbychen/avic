'use client';

import { motion } from 'framer-motion';
import type { Seat } from '@/lib/mahjong/types';
import { useMahjongStore } from '@/lib/mahjong/store';

const SEAT_LABEL: Record<Seat, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
};

const SEAT_GRID: Seat[][] = [
  ['east', 'south'],
  ['west', 'north'],
];

export function SeatPicker() {
  const { me, state, sendAction } = useMahjongStore();

  if (!me) return null;

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <h2 className="text-2xl font-bold text-[#d4af37] tracking-wider">选择座位</h2>
      <div className="grid grid-cols-2 gap-4">
        {SEAT_GRID.flat().map((seat) => {
          const a = state.seats[seat].assignment;
          const taken = a.kind === 'human';
          const takenBy = taken ? a.human : null;
          const isMine = takenBy === me;
          return (
            <motion.button
              key={seat}
              whileHover={{ scale: taken ? 1 : 1.05 }}
              whileTap={{ scale: taken ? 1 : 0.97 }}
              disabled={taken}
              onClick={() => sendAction({ type: 'pick-seat', seat, human: me })}
              className={
                'w-40 h-40 rounded-2xl border text-3xl font-bold transition-colors ' +
                (isMine
                  ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]'
                  : taken
                    ? 'border-white/10 bg-white/[0.02] text-gray-500 cursor-not-allowed'
                    : 'border-white/10 bg-white/[0.03] text-gray-200 hover:border-[#d4af37]/40')
              }
            >
              <div>{SEAT_LABEL[seat]}</div>
              {takenBy && (
                <div className="text-xs font-normal mt-2 tracking-wider">{takenBy}</div>
              )}
            </motion.button>
          );
        })}
      </div>
      <p className="text-sm text-gray-500">
        {humansSeated(state) === 1
          ? '等待另一位玩家选择座位...'
          : '请选择你的座位'}
      </p>
    </div>
  );
}

function humansSeated(state: ReturnType<typeof useMahjongStore.getState>['state']): number {
  return (['east', 'south', 'west', 'north'] as Seat[]).filter(
    (s) => state.seats[s].assignment.kind === 'human',
  ).length;
}
