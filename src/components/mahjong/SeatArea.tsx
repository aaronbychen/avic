'use client';

import type { PlayerState, Seat } from '@/lib/mahjong/types';
import { Hand } from './Hand';
import { Meld } from './Meld';
import { Discards } from './Discards';
import type { TileSize } from './Tile';

interface SeatAreaProps {
  player: PlayerState;
  isMe: boolean;
  isActive: boolean;
  position: 'top' | 'left' | 'right' | 'bottom';
  highlightLastDiscardId?: string | null;
  selectedTileId?: string | null;
  onTileClick?: (tileId: string) => void;
  compact?: boolean;
}

const SEAT_LABEL_CN: Record<Seat, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
};

export function SeatArea({
  player,
  isMe,
  isActive,
  position,
  highlightLastDiscardId,
  selectedTileId,
  onTileClick,
  compact = false,
}: SeatAreaProps) {
  const a = player.assignment;
  const displayName =
    a.kind === 'human' ? a.human ?? '玩家' : (a.aiId ?? 'AI');
  const aiBadge = a.kind === 'ai' ? ' 🤖' : '';
  const indicatorColor = isActive ? 'text-[#d4af37]' : 'text-gray-400';
  const isVertical = position === 'left' || position === 'right';

  // Tile sizes shrink one notch in compact mode.
  const myHandSize: TileSize = compact ? 'md' : 'lg';
  const theirHandSize: TileSize = compact ? 'xs' : 'sm';
  const meldSize: TileSize = compact ? 'xs' : 'sm';
  const discardSize: TileSize = compact ? 'xs' : 'sm';

  const gapClass = compact ? 'gap-2' : 'gap-3';
  const minWidthClass = isVertical ? (compact ? 'min-w-16' : 'min-w-24') : '';

  return (
    <div
      className={
        `flex ${gapClass} ` +
        (position === 'top' ? 'flex-col-reverse items-center ' : '') +
        (position === 'bottom' ? 'flex-col items-center ' : '') +
        (position === 'left' ? 'flex-row-reverse items-center ' : '') +
        (position === 'right' ? 'flex-row items-center ' : '')
      }
    >
      {/* Identity row */}
      <div className={`flex flex-col gap-1 ${minWidthClass}`}>
        <div className={'text-xs sm:text-sm font-semibold ' + indicatorColor}>
          {displayName}
          <span className="text-[10px] sm:text-xs text-gray-500 ml-1">
            · {SEAT_LABEL_CN[player.seat]}
            {aiBadge}
          </span>
        </div>
        <div className="text-[10px] sm:text-xs text-gray-500 tabular-nums">
          分: <span className="text-gray-300">{player.score}</span>
        </div>
        {player.missingSuit && (
          <div className="text-[10px] text-gray-500">
            缺{player.missingSuit === 'wan' ? '万' : player.missingSuit === 'tong' ? '筒' : '条'}
          </div>
        )}
        {player.hasHu && (
          <div className="text-[10px] text-[#d4af37] uppercase tracking-widest">已胡</div>
        )}
      </div>

      {/* Melds */}
      {player.melds.length > 0 && (
        <div className={`flex ${compact ? 'gap-1' : 'gap-2'} flex-wrap`}>
          {player.melds.map((meld, i) => (
            <Meld key={i} meld={meld} size={meldSize} />
          ))}
        </div>
      )}

      {/* Hand: face-up only for me */}
      <Hand
        tiles={player.hand}
        faceUp={isMe}
        size={isMe ? myHandSize : theirHandSize}
        selectedId={selectedTileId}
        missingSuit={isMe ? player.missingSuit : null}
        onTileClick={
          isMe && onTileClick ? (tile) => onTileClick(tile.id) : undefined
        }
      />

      {/* Discards */}
      <Discards
        tiles={player.discards}
        highlightLastId={highlightLastDiscardId}
        size={discardSize}
      />
    </div>
  );
}
