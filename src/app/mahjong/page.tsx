'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMahjongStore } from '@/lib/mahjong/store';
import { RotatePrompt } from '@/components/mahjong/RotatePrompt';
import { SeatPicker } from '@/components/mahjong/SeatPicker';
import { ChooseMissing } from '@/components/mahjong/ChooseMissing';
import { Table } from '@/components/mahjong/Table';

export default function MahjongPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center min-h-screen text-gray-500">
          Loading...
        </div>
      }
    >
      <MahjongShell />
    </Suspense>
  );
}

function MahjongShell() {
  const searchParams = useSearchParams();
  const { me, setMe, state, mySeat, gameEnded, subscribe, unsubscribe, fetchState } =
    useMahjongStore();

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

  if (!me) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen gap-6">
        <h1 className="text-2xl font-bold text-[#d4af37]">麻将 · 血战到底</h1>
        <p className="text-gray-400">
          请用 <code className="text-gray-300">?u=aaron</code> 或{' '}
          <code className="text-gray-300">?u=vicky</code> 进入
        </p>
      </div>
    );
  }

  if (gameEnded) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen gap-8 text-gray-200">
        <h1 className="text-2xl font-bold text-[#d4af37]">游戏结束</h1>
        <div className="grid grid-cols-4 gap-6 text-center">
          {(['east', 'south', 'west', 'north'] as const).map((seat) => (
            <div key={seat}>
              <div className="text-xs uppercase text-gray-500 tracking-[0.2em]">{seat}</div>
              <div className="text-3xl font-bold tabular-nums">{gameEnded[seat]}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b]"
        >
          新游戏
        </button>
      </div>
    );
  }

  return (
    <>
      <RotatePrompt />
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-gray-200">
        {state.phase === 'seat-selection' && <SeatPicker />}
        {state.phase === 'choose-missing' && <ChooseMissing />}
        {(state.phase === 'playing' ||
          state.phase === 'claim-window' ||
          state.phase === 'settled') && mySeat && (
          <Table state={state} mySeat={mySeat} />
        )}
      </div>
    </>
  );
}
