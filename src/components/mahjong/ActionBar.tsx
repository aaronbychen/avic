'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMahjongStore } from '@/lib/mahjong/store';
import { useCompactMode } from '@/lib/mahjong/useCompactMode';
import type { Seat, Tile, TileValue } from '@/lib/mahjong/types';
import { canHu } from '@/lib/mahjong/hu';

interface ActionBarProps {
  mySeat: Seat;
  selectedTileId: string | null;
  clearSelection: () => void;
}

export function ActionBar({ mySeat, selectedTileId, clearSelection }: ActionBarProps) {
  const { state, sendAction } = useMahjongStore();
  const me = state.seats[mySeat];

  if (state.phase === 'claim-window' && state.claimWindow) {
    const options = state.claimWindow.options.filter((o) => o.seat === mySeat);
    if (options.length === 0) {
      return <div className="text-xs text-gray-500 tracking-wider">等待响应...</div>;
    }
    return (
      <ClaimBar
        mySeat={mySeat}
        expiresAt={state.claimWindow.expiresAt}
        options={options.map((o) => o.type)}
      />
    );
  }

  if (state.phase === 'playing' && state.turn === mySeat && !me.hasHu) {
    return (
      <PlayingTurnBar
        mySeat={mySeat}
        selectedTileId={selectedTileId}
        clearSelection={clearSelection}
        just_drew={me.hand.length === 14}
      />
    );
  }

  if (state.phase === 'playing') {
    const a = state.seats[state.turn].assignment;
    const name = a.kind === 'human' ? a.human : a.aiId;
    return <div className="text-sm text-gray-500 tracking-wider">等待 {name} 出牌...</div>;
  }

  if (state.phase === 'settled') {
    return (
      <ActionButton
        label="下一局"
        variant="gold"
        onClick={() => sendAction({ type: 'start-next-hand' })}
      />
    );
  }

  return null;
}

function PlayingTurnBar({
  mySeat,
  selectedTileId,
  clearSelection,
  just_drew,
}: {
  mySeat: Seat;
  selectedTileId: string | null;
  clearSelection: () => void;
  just_drew: boolean;
}) {
  const { state, sendAction } = useMahjongStore();
  const me = state.seats[mySeat];

  const huReady = useMemo(
    () => (me.hand.length === 14 ? canHu(me.hand, me.melds, me.missingSuit).canHu : false),
    [me.hand, me.melds, me.missingSuit],
  );
  const gangAnFace = useMemo(() => findGangAnFace(me.hand), [me.hand]);
  const gangBuTile = useMemo(() => findGangBuTile(me), [me]);

  return (
    <div className="flex gap-3">
      {just_drew && huReady && (
        <ActionButton
          label="自摸"
          variant="gold"
          onClick={() => sendAction({ type: 'self-draw-hu', seat: mySeat })}
        />
      )}
      {just_drew && gangAnFace && (
        <ActionButton
          label="暗杠"
          variant="default"
          onClick={() =>
            sendAction({ type: 'gang-an', seat: mySeat, suit: gangAnFace.suit, value: gangAnFace.value })
          }
        />
      )}
      {just_drew && gangBuTile && (
        <ActionButton
          label="补杠"
          variant="default"
          onClick={() => sendAction({ type: 'gang-bu', seat: mySeat, tileId: gangBuTile.id })}
        />
      )}
      <ActionButton
        label={selectedTileId ? '出牌' : '选牌出牌'}
        variant={selectedTileId ? 'gold' : 'disabled'}
        onClick={() => {
          if (!selectedTileId) return;
          sendAction({ type: 'discard', seat: mySeat, tileId: selectedTileId });
          clearSelection();
        }}
      />
    </div>
  );
}

function ClaimBar({
  mySeat,
  expiresAt,
  options,
}: {
  mySeat: Seat;
  expiresAt: number;
  options: ('peng' | 'gang' | 'hu')[];
}) {
  const { sendAction } = useMahjongStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(
      () => sendAction({ type: 'claim', seat: mySeat, choice: 'pass' }),
      Math.max(0, expiresAt - Date.now() + 1000),
    );
    return () => window.clearTimeout(id);
  }, [expiresAt, mySeat, sendAction]);

  const remainingMs = Math.max(0, expiresAt - now);
  const remainingPct = Math.max(0, Math.min(100, (remainingMs / 10_000) * 100));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-48 h-1 rounded bg-white/10 overflow-hidden">
        <div
          className="h-full bg-[#d4af37]"
          style={{ width: `${remainingPct}%`, transition: 'width 200ms linear' }}
        />
      </div>
      <div className="text-[10px] text-gray-500">{Math.ceil(remainingMs / 1000)}s</div>
      <div className="flex gap-3">
        {options.includes('peng') && (
          <ActionButton
            label="碰"
            variant="default"
            onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'peng' })}
          />
        )}
        {options.includes('gang') && (
          <ActionButton
            label="杠 (明杠)"
            variant="default"
            onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'gang' })}
          />
        )}
        {options.includes('hu') && (
          <ActionButton
            label="胡"
            variant="gold"
            onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'hu' })}
          />
        )}
        <ActionButton
          label="过"
          variant="muted"
          onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'pass' })}
        />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: 'default' | 'gold' | 'muted' | 'disabled';
  onClick: () => void;
}) {
  const compact = useCompactMode();
  const styles: Record<typeof variant, string> = {
    default: 'bg-white/10 hover:bg-white/20 text-gray-200',
    gold: 'bg-[#d4af37] text-black hover:bg-[#e5c04b]',
    muted: 'bg-white/[0.04] text-gray-400 hover:bg-white/10',
    disabled: 'bg-white/[0.02] text-gray-600 cursor-not-allowed',
  };
  const sizing = compact ? 'px-3 py-1.5 text-xs' : 'px-5 py-2 text-sm';
  return (
    <motion.button
      whileHover={{ scale: variant === 'disabled' ? 1 : 1.04 }}
      whileTap={{ scale: variant === 'disabled' ? 1 : 0.96 }}
      onClick={variant === 'disabled' ? undefined : onClick}
      className={
        `${sizing} rounded-xl font-semibold tracking-wider transition-colors ` +
        styles[variant]
      }
    >
      {label}
    </motion.button>
  );
}

function findGangAnFace(hand: readonly Tile[]): { suit: Tile['suit']; value: TileValue } | null {
  const counts = new Map<string, number>();
  for (const t of hand) {
    const k = `${t.suit}-${t.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, c] of counts) {
    if (c === 4) {
      const [suit, valStr] = k.split('-');
      return { suit: suit as Tile['suit'], value: Number(valStr) as TileValue };
    }
  }
  return null;
}

function findGangBuTile(player: { hand: Tile[]; melds: { type: string; tiles: Tile[] }[] }): Tile | null {
  for (const meld of player.melds) {
    if (meld.type !== 'peng') continue;
    const head = meld.tiles[0];
    const match = player.hand.find((t) => t.suit === head.suit && t.value === head.value);
    if (match) return match;
  }
  return null;
}
