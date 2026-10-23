'use client';

import { TRUMPS, type TrumpCategory } from '@/lib/twentyone/cards';
import type { TrumpId } from '@/lib/twentyone/types';

export const CATEGORY_STYLE: Record<TrumpCategory, string> = {
  attack: 'border-red-500/60 bg-red-950/60 text-red-200',
  defense: 'border-sky-500/60 bg-sky-950/60 text-sky-200',
  draw: 'border-emerald-500/60 bg-emerald-950/60 text-emerald-200',
  control: 'border-violet-500/60 bg-violet-950/60 text-violet-200',
  special: 'border-amber-500/60 bg-amber-950/60 text-amber-200',
};

interface TrumpChipProps {
  id: TrumpId;
  onClick?: () => void;
  dimmed?: boolean;
  size?: 'sm' | 'md';
}

export function TrumpChip({ id, onClick, dimmed, size = 'sm' }: TrumpChipProps) {
  const def = TRUMPS[id];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={
        'rounded-md border font-semibold whitespace-nowrap transition-opacity ' +
        (size === 'sm' ? 'px-2 py-1 text-[11px] ' : 'px-2 py-3 text-sm w-full ') +
        CATEGORY_STYLE[def.category] +
        (dimmed ? ' opacity-40' : '')
      }
    >
      {def.name}
    </button>
  );
}
