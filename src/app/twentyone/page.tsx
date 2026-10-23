'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Table } from '@/components/twentyone/Table';
import { parsePlayer } from '@/lib/twentyone/pusher';
import { useTwentyOneStore } from '@/lib/twentyone/store';

export default function TwentyOnePage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-dvh flex-1 items-center justify-center text-gray-500">Loading...</div>}
    >
      <TwentyOneShell />
    </Suspense>
  );
}

function TwentyOneShell() {
  const searchParams = useSearchParams();
  const { me, setMe, view, subscribe, unsubscribe, fetchState } = useTwentyOneStore();

  useEffect(() => {
    const name = parsePlayer(searchParams.get('u'));
    if (name) setMe(name);
  }, [searchParams, setMe]);

  useEffect(() => {
    if (!me) return;
    subscribe();
    fetchState();
    return () => unsubscribe();
  }, [me, subscribe, unsubscribe, fetchState]);

  if (!me) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-2xl font-bold text-[#d4af37]">21点</h1>
        <p className="text-gray-400">
          请用 <code className="text-gray-300">?u=aaron</code> 或 <code className="text-gray-300">?u=vicky</code> 进入
        </p>
      </div>
    );
  }

  if (!view) {
    return <div className="flex min-h-dvh flex-1 items-center justify-center text-gray-500">连接中…</div>;
  }

  return <Table view={view} />;
}
