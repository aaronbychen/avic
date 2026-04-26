'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/store';

export function ActionBar() {
  const { me, state, sendAction } = useGameStore();
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(10);

  if (!me) return null;

  const current = state.players[me];
  const oppName = me === 'Aaron' ? 'Vicky' : 'Aaron';
  const opp = state.players[oppName];
  const toCall = opp.currentBet - current.currentBet;
  const canCheck = toCall === 0;
  const halfChips = Math.round(current.chips / 2 / 5) * 5 || 5;

  const handleRaise = (amount: number) => {
    sendAction('raise', amount);
    setShowRaise(false);
    setRaiseAmount(10);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-3">
        {canCheck ? (
          <ActionButton onClick={() => sendAction('check')} label="Check" variant="default" />
        ) : (
          <ActionButton onClick={() => sendAction('call')} label={`Call ${toCall}`} variant="default" />
        )}
        {!state.phaseRaised && (
          <ActionButton onClick={() => setShowRaise(!showRaise)} label="Raise" variant="accent" />
        )}
        <ActionButton onClick={() => sendAction('fold')} label="Fold" variant="danger" />
      </div>

      <AnimatePresence>
        {showRaise && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center gap-3"
          >
            {/* Presets */}
            <div className="flex gap-2">
              <button
                onClick={() => setRaiseAmount(halfChips)}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-semibold text-gray-300 hover:bg-white/20 transition-colors"
              >
                Half ({halfChips})
              </button>
              <button
                onClick={() => setRaiseAmount(current.chips)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
              >
                All In ({current.chips})
              </button>
            </div>
            {/* Fine-grained stepper */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRaiseAmount(Math.max(5, raiseAmount - 5))}
                className="w-8 h-8 rounded-full bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
                aria-label="Decrease raise"
              >
                −
              </button>
              <span className="text-xl font-bold tabular-nums text-[#d4af37] w-16 text-center">
                {raiseAmount}
              </span>
              <button
                onClick={() => setRaiseAmount(Math.min(current.chips, raiseAmount + 5))}
                className="w-8 h-8 rounded-full bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
                aria-label="Increase raise"
              >
                +
              </button>
              <button
                onClick={() => handleRaise(raiseAmount)}
                className="px-4 py-1.5 rounded-lg bg-[#d4af37] text-black text-sm font-semibold hover:bg-[#e5c04b] transition-colors"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({ onClick, label, variant }: { onClick: () => void; label: string; variant: 'default' | 'danger' | 'accent' }) {
  const styles = {
    default: 'bg-white/10 hover:bg-white/20 text-gray-200',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400',
    accent: 'bg-[#d4af37]/10 hover:bg-[#d4af37]/20 text-[#d4af37]',
  };

  return (
    <button
      onClick={onClick}
      className={`px-6 py-2.5 rounded-xl text-sm font-semibold tracking-wide uppercase transition-all duration-200 ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
