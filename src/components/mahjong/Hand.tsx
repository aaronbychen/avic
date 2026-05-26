'use client';

import { useMemo } from 'react';
import type { Suit, Tile as TileType } from '@/lib/mahjong/types';
import { Tile, type TileSize } from './Tile';

interface HandProps {
  tiles: TileType[];
  faceUp: boolean;
  size?: TileSize;
  selectedId?: string | null;
  missingSuit?: Suit | null;
  onTileClick?: (tile: TileType) => void;
}

const SUIT_ORDER: Record<Suit, number> = { wan: 0, tong: 1, tiao: 2 };

function sortTiles(tiles: TileType[]): TileType[] {
  return [...tiles].sort((a, b) => {
    if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) {
      return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    }
    if (a.value !== b.value) return a.value - b.value;
    return a.id.localeCompare(b.id);
  });
}

export function Hand({
  tiles,
  faceUp,
  size = 'lg',
  selectedId,
  missingSuit,
  onTileClick,
}: HandProps) {
  const sorted = useMemo(() => (faceUp ? sortTiles(tiles) : tiles), [tiles, faceUp]);
  const gapClass = size === 'xs' || size === 'sm' ? 'gap-1' : 'gap-1.5';
  return (
    <div className={`flex ${gapClass} flex-wrap justify-center`}>
      {sorted.map((tile) => (
        <Tile
          key={tile.id}
          tile={faceUp ? tile : undefined}
          size={size}
          selected={faceUp && selectedId === tile.id}
          dimmed={faceUp && missingSuit !== null && tile.suit === missingSuit}
          onClick={onTileClick ? () => onTileClick(tile) : undefined}
        />
      ))}
    </div>
  );
}
