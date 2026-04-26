'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { CardFace } from '@/components/Card';
import { PlayerArea } from '@/components/PlayerArea';
import { ActionBar } from '@/components/ActionBar';
import { PlayerName } from '@/lib/types';

export default function Home() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center min-h-screen text-gray-500">Loading...</div>}>
      <Game />
    </Suspense>
  );
}

function Game() {
  const searchParams = useSearchParams();
  const { me, setMe, state, sendAction, endGame, gameEnded, subscribe, unsubscribe, fetchState } = useGameStore();

  useEffect(() => {
    const u = searchParams.get('u')?.toLowerCase();
    if (u === 'aaron') setMe('Aaron');
    else if (u === 'vicky') setMe('Vicky');
  }, [searchParams, setMe]);

  useEffect(() => {
    if (!me) return;
    subscribe();
    fetchState();
    return () => unsubscribe();
  }, [me, subscribe, unsubscribe, fetchState]);

  const { phase, pot, boardCards, turn, players, dealer, winner, handRank } = state;

  if (!me) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen gap-6">
        <h1 className="text-2xl font-bold text-[#d4af37]">AVIC</h1>
        <p className="text-gray-400">Add <code className="text-gray-300">?u=aaron</code> or <code className="text-gray-300">?u=vicky</code> to the URL</p>
      </div>
    );
  }

  // Game ended — show final results
  if (gameEnded) {
    const aaronWon = gameEnded.aaron > gameEnded.vicky;
    const vickyWon = gameEnded.vicky > gameEnded.aaron;
    const tie = gameEnded.aaron === gameEnded.vicky;
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen gap-8 px-4">
        <h1 className="text-sm font-semibold tracking-[0.3em] uppercase text-gray-500">AVIC</h1>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
        >
          <h2 className="text-2xl font-bold text-[#d4af37]">
            {tie ? 'Tie Game!' : `${aaronWon ? 'Aaron' : 'Vicky'} Wins!`}
          </h2>
          <div className="flex gap-12">
            <div className="text-center">
              <div className={`text-3xl font-bold tabular-nums ${aaronWon ? 'text-[#d4af37]' : 'text-gray-400'}`}>
                {gameEnded.aaron}
              </div>
              <div className="text-xs text-gray-500 mt-1">Aaron</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold tabular-nums ${vickyWon ? 'text-[#d4af37]' : 'text-gray-400'}`}>
                {gameEnded.vicky}
              </div>
              <div className="text-xs text-gray-500 mt-1">Vicky</div>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b] transition-colors"
          >
            New Game
          </button>
        </motion.div>
      </div>
    );
  }

  // Auto game-over when a player is busted
  if (state.gameOver) {
    const a = state.players.Aaron.chips;
    const v = state.players.Vicky.chips;
    const busiedPlayer = a <= 0 ? 'Aaron' : 'Vicky';
    const champion = a <= 0 ? 'Vicky' : 'Aaron';
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen gap-8 px-4">
        <h1 className="text-sm font-semibold tracking-[0.3em] uppercase text-gray-500">AVIC</h1>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
        >
          <h2 className="text-2xl font-bold text-[#d4af37]">{champion} Wins!</h2>
          <p className="text-sm text-gray-400">{busiedPlayer} is out of chips</p>
          <div className="flex gap-12">
            <div className="text-center">
              <div className={`text-3xl font-bold tabular-nums ${a > v ? 'text-[#d4af37]' : 'text-gray-400'}`}>{a}</div>
              <div className="text-xs text-gray-500 mt-1">Aaron</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold tabular-nums ${v > a ? 'text-[#d4af37]' : 'text-gray-400'}`}>{v}</div>
              <div className="text-xs text-gray-500 mt-1">Vicky</div>
            </div>
          </div>
          <button
            onClick={async () => { await endGame(); window.location.reload(); }}
            className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b] transition-colors"
          >
            New Game
          </button>
        </motion.div>
      </div>
    );
  }

  const isShowdown = phase === 'showdown';
  const isPlaying = !isShowdown && players[me].holeCards.length > 0;
  const isMyTurn = turn === me;
  const opponentName = me === 'Aaron' ? 'Vicky' : 'Aaron';
  const topPlayer: PlayerName = me === 'Aaron' ? 'Vicky' : 'Aaron';
  const bottomPlayer: PlayerName = me;

  return (
    <div className="flex flex-col flex-1 items-center justify-between min-h-screen py-8 px-4 relative">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-4">
          <h1 className="text-sm font-semibold tracking-[0.3em] uppercase text-gray-500">AVIC</h1>
          {!isPlaying && (
            <button
              onClick={endGame}
              className="text-[10px] uppercase tracking-wider text-gray-600 hover:text-red-400 transition-colors"
            >
              End Game
            </button>
          )}
        </div>
        {isPlaying && (
          <p className="text-xs text-gray-600 mt-1 uppercase tracking-wider">{phase}</p>
        )}
      </div>

      {/* Opponent Area (Top) */}
      <PlayerArea
        player={players[topPlayer]}
        isActive={isPlaying && turn === topPlayer}
        showCards={isShowdown && players[topPlayer].status !== 'folded'}
        isDealer={dealer === topPlayer}
      />

      {/* Board Center */}
      <div className="flex flex-col items-center gap-6 my-6">
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

      {/* My Area (Bottom) */}
      <div className="flex flex-col items-center gap-4 w-full max-w-lg">
        <PlayerArea
          player={players[bottomPlayer]}
          isActive={isPlaying && turn === bottomPlayer}
          showCards={players[bottomPlayer].holeCards.length > 0}
          isDealer={dealer === bottomPlayer}
        />

        {isPlaying && isMyTurn && <ActionBar />}

        {isPlaying && !isMyTurn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-3 px-6 rounded-xl bg-white/[0.03] border border-white/[0.06]"
          >
            <div className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
            <span className="text-sm text-gray-400">Waiting for {opponentName}...</span>
          </motion.div>
        )}

        {(!isPlaying || isShowdown) && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => sendAction('start')}
            className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b] transition-colors"
          >
            {isShowdown ? 'Next Hand' : 'Deal'}
          </motion.button>
        )}
      </div>
    </div>
  );
}
