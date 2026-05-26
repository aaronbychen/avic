'use client';

import type { Meld as MeldType } from '@/lib/mahjong/types';
import { Tile } from './Tile';

interface MeldProps {
  meld: MeldType;
  size?: 'sm' | 'md';
}

const TYPE_LABEL: Record<MeldType['type'], string> = {
  peng: '碰',
  'gang-ming': '明杠',
  'gang-an': '暗杠',
  'gang-bu': '补杠',
};

export function Meld({ meld, size = 'sm' }: MeldProps) {
  const isHidden = meld.type === 'gang-an';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1">
        {meld.tiles.map((tile, i) => (
          <Tile
            key={tile.id}
            tile={isHidden && i > 0 && i < 3 ? undefined : tile}
            size={size}
          />
        ))}
      </div>
      <span className="text-[10px] tracking-widest text-gray-500 uppercase">
        {TYPE_LABEL[meld.type]}
      </span>
    </div>
  );
}
