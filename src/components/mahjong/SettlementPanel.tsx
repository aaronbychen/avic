'use client';

import { motion } from 'framer-motion';
import type { GameState, Seat, WinType } from '@/lib/mahjong/types';
import { Tile } from './Tile';

interface SettlementPanelProps {
  state: GameState;
  onNextHand: () => void;
  onEndGame: () => void;
}

const WIN_TYPE_LABEL: Record<WinType, string> = {
  'ping-hu': '平胡',
  'dui-dui-hu': '对对胡',
  'qing-yi-se': '清一色',
  'qi-dui': '七对',
};

const SEAT_CN: Record<Seat, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
};

export function SettlementPanel({ state, onNextHand, onEndGame }: SettlementPanelProps) {
  if (state.phase !== 'settled') return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0a0a0a]/85 backdrop-blur-sm p-8"
    >
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 max-w-2xl w-full">
        <h2 className="text-2xl font-bold text-[#d4af37] mb-6 text-center tracking-wider">
          {state.huOrder.length === 0 ? '流局' : '本局结束'}
        </h2>
        <div className="flex flex-col gap-4 mb-8">
          {(['east', 'south', 'west', 'north'] as Seat[]).map((seat) => {
            const p = state.seats[seat];
            const ord = state.huOrder.indexOf(seat);
            return (
              <div
                key={seat}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-white/[0.03]"
              >
                <div className="flex flex-col">
                  <div className="text-sm font-semibold">
                    {p.assignment.kind === 'human' ? p.assignment.human : p.assignment.aiId}
                    <span className="text-xs text-gray-500 ml-1">· {SEAT_CN[seat]}</span>
                  </div>
                  {p.huResult && (
                    <div className="text-xs text-gray-400 mt-1">
                      {p.huResult.selfDraw ? '自摸' : '点炮'}
                      {' · '}
                      {p.huResult.winTypes.map((t) => WIN_TYPE_LABEL[t]).join(' + ')}
                      {' · '}
                      {p.huResult.fan} 番
                    </div>
                  )}
                  {p.huResult && (
                    <div className="flex gap-1 mt-2">
                      <Tile tile={p.huResult.winningTile} size="sm" highlighted />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {ord >= 0 && (
                    <span className="text-xs text-[#d4af37]">第{ord + 1}个胡</span>
                  )}
                  <span className="text-2xl tabular-nums font-bold">
                    {p.score >= 0 ? '+' : ''}
                    {p.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onNextHand}
            className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b]"
          >
            下一局
          </button>
          <button
            onClick={onEndGame}
            className="px-8 py-3 rounded-xl bg-white/[0.04] text-gray-300 font-semibold tracking-wide hover:bg-white/10"
          >
            结束游戏
          </button>
        </div>
      </div>
    </motion.div>
  );
}
