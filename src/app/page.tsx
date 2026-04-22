'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { CardFace } from '@/components/Card';
import { PlayerArea } from '@/components/PlayerArea';
import { ActionBar } from '@/components/ActionBar';

export default function Home() {
  const state = useGameStore();
  const { phase, pot, boardCards, turn, players, dealer, winner, handRank, startHand } = state;
  const isPlaying = phase !== 'showdown' && players.Aaron.holeCards.length > 0;
  const isShowdown = phase === 'showdown';

  return (
    <div className="flex flex-col flex-1 items-center justify-between min-h-screen py-8 px-4">
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-sm font-semibold tracking-[0.3em] uppercase text-gray-500">AVIC</h1>
        {isPlaying && (
          <p className="text-xs text-gray-600 mt-1 uppercase tracking-wider">{phase}</p>
        )}
      </div>

      {/* Vicky's Area (Top) */}
      <PlayerArea
        player={players.Vicky}
        isActive={isPlaying && turn === 'Vicky'}
        showCards={isShowdown && players.Vicky.status !== 'folded'}
        isDealer={dealer === 'Vicky'}
      />

      {/* Board Center */}
      <div className="flex flex-col items-center gap-6 my-6">
        {/* Pot */}
        {(pot > 0 || isPlaying) && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <span className="text-xs text-gray-500 uppercase tracking-wider">Pot</span>
            <p className="text-3xl font-bold tabular-nums text-[#d4af37]">{pot}</p>
          </motion.div>
        )}

        {/* Community Cards */}
        <div className="flex gap-3 min-h-[96px] items-center">
          <AnimatePresence>
            {boardCards.map((card, i) => (
              <motion.div
                key={`${card.rank}-${card.suit}`}
                initial={{ opacity: 0, y: -20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <CardFace card={card} />
              </motion.div>
            ))}
          </AnimatePresence>
          {boardCards.length === 0 && isPlaying && (
            <span className="text-gray-600 text-sm">Waiting for flop...</span>
          )}
        </div>

        {/* Showdown Result */}
        <AnimatePresence>
          {isShowdown && winner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <p className="text-xl font-bold text-[#d4af37]">
                {winner === 'split' ? 'Split Pot!' : `${winner} Wins!`}
              </p>
              {handRank && (
                <div className="flex gap-6 mt-2 text-xs text-gray-400">
                  <span>Aaron: {handRank.Aaron}</span>
                  <span>Vicky: {handRank.Vicky}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Aaron's Area (Bottom) */}
      <div className="flex flex-col items-center gap-4 w-full max-w-lg">
        <PlayerArea
          player={players.Aaron}
          isActive={isPlaying && turn === 'Aaron'}
          showCards={players.Aaron.holeCards.length > 0}
          isDealer={dealer === 'Aaron'}
        />

        {/* Actions */}
        {isPlaying && <ActionBar />}

        {/* Turn indicator */}
        {isPlaying && (
          <p className="text-xs text-gray-500">
            {turn}&apos;s turn
          </p>
        )}

        {/* Start / Next Hand */}
        {(!isPlaying || isShowdown) && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={startHand}
            className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b] transition-colors"
          >
            {isShowdown ? 'Next Hand' : 'Deal'}
          </motion.button>
        )}
      </div>
    </div>
  );
}
