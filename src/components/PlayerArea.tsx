'use client';

import { motion } from 'framer-motion';
import { Player, PlayerName } from '@/lib/types';
import { CardFace, CardBack } from './Card';

interface Props {
  player: Player;
  isActive: boolean;
  showCards: boolean;
  isDealer: boolean;
}

export function PlayerArea({ player, isActive, showCards, isDealer }: Props) {
  return (
    <motion.div
      className={`flex items-center gap-6 rounded-2xl px-6 py-4 transition-all duration-300 ${
        isActive ? 'active-glow border border-[#d4af37]/40 bg-white/[0.03]' : 'border border-transparent bg-white/[0.01]'
      }`}
    >
      {/* Avatar */}
      <div className="flex flex-col items-center gap-1">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
          player.name === 'Aaron' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'
        }`}>
          {player.name[0]}
        </div>
        <span className="text-xs font-medium text-gray-400">
          {player.name}
          {isDealer && <span className="ml-1 text-[#d4af37]">D</span>}
        </span>
      </div>

      {/* Hole Cards */}
      <div className="flex gap-2">
        {player.holeCards.length > 0 ? (
          showCards ? (
            player.holeCards.map((card, i) => <CardFace key={i} card={card} />)
          ) : (
            <>
              <CardBack />
              <CardBack />
            </>
          )
        ) : (
          <div className="w-[136px] h-24 flex items-center justify-center text-gray-600 text-sm">
            No cards
          </div>
        )}
      </div>

      {/* Chips + Status */}
      <div className="flex flex-col items-end gap-1 ml-auto">
        <span className="text-2xl font-bold tabular-nums text-[#d4af37]">
          {player.chips}
        </span>
        <span className="text-xs text-gray-500 uppercase tracking-wider">chips</span>
        {player.status === 'folded' && (
          <span className="text-xs text-red-400 font-medium">Folded</span>
        )}
        {player.status === 'all-in' && (
          <span className="text-xs text-amber-400 font-medium">All In</span>
        )}
        {player.currentBet > 0 && (
          <span className="text-xs text-gray-400">Bet: {player.currentBet}</span>
        )}
      </div>
    </motion.div>
  );
}
