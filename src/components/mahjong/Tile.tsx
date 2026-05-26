'use client';

import type { Tile as TileType } from '@/lib/mahjong/types';

const SUIT_BASE: Record<TileType['suit'], number> = {
  wan: 0x1f007,   // 🀇
  tong: 0x1f019,  // 🀙
  tiao: 0x1f010,  // 🀐
};

const TILE_BACK_GLYPH = String.fromCodePoint(0x1f02b); // 🀫

export function tileGlyph(tile: TileType): string {
  return String.fromCodePoint(SUIT_BASE[tile.suit] + (tile.value - 1));
}

const SUIT_COLOR: Record<TileType['suit'], string> = {
  wan: '#c0392b',
  tong: '#f3e9d2',
  tiao: '#f3e9d2',
};

export type TileSize = 'xs' | 'sm' | 'md' | 'lg';

interface TileProps {
  tile?: TileType;
  size?: TileSize;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
}

const SIZE_CLASSES: Record<TileSize, string> = {
  xs: 'w-6 h-8 text-lg',
  sm: 'w-8 h-11 text-2xl',
  md: 'w-10 h-14 text-3xl',
  lg: 'w-14 h-20 text-5xl',
};

export function Tile({
  tile,
  size = 'md',
  selected,
  highlighted,
  dimmed,
  onClick,
  className,
}: TileProps) {
  const isBack = !tile;
  const glyph = isBack ? TILE_BACK_GLYPH : tileGlyph(tile);
  const color = isBack ? '#475569' : SUIT_COLOR[tile.suit];
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={
        'inline-flex items-center justify-center rounded-xl border transition-all duration-150 ' +
        'bg-white/[0.03] border-white/10 shadow-inner ' +
        SIZE_CLASSES[size] + ' ' +
        (selected ? 'ring-2 ring-[#d4af37] -translate-y-1 ' : '') +
        (highlighted ? 'animate-pulse ring-2 ring-[#d4af37] ' : '') +
        (dimmed ? 'opacity-50 ' : '') +
        (onClick ? 'cursor-pointer hover:border-[#d4af37]/40 ' : 'cursor-default ') +
        (className ?? '')
      }
      style={{ color }}
    >
      <span className="leading-none select-none">{glyph}</span>
    </button>
  );
}
