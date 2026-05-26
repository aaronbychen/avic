'use client';

import type { Tile as TileType } from '@/lib/mahjong/types';
import { Tile, type TileSize } from './Tile';

interface DiscardsProps {
  tiles: TileType[];
  highlightLastId?: string | null;
  size?: TileSize;
}

const ROW_LENGTH = 8;

export function Discards({ tiles, highlightLastId, size = 'sm' }: DiscardsProps) {
  const rows: TileType[][] = [];
  for (let i = 0; i < tiles.length; i += ROW_LENGTH) {
    rows.push(tiles.slice(i, i + ROW_LENGTH));
  }
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-0.5">
          {row.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              size={size}
              highlighted={highlightLastId === tile.id}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
