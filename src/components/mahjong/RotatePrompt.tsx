'use client';

import { useEffect, useState } from 'react';

// Mahjong is landscape-only. We only block portrait, and as a last-resort
// block extremely tiny landscape viewports. iPhone 17 Pro landscape is ~874x402,
// iPhone 17 Pro Max is ~956x440 — both must pass.
const MIN_LANDSCAPE_HEIGHT = 360;

export function RotatePrompt() {
  const [show, setShow] = useState(false);
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    function check() {
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      const small = !portrait && window.innerHeight < MIN_LANDSCAPE_HEIGHT;
      setShow(portrait || small);
      setTooSmall(small);
    }
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a] text-gray-200">
      <div className="text-6xl mb-6 select-none">📱↻</div>
      <p className="text-xl font-semibold tracking-wide">
        {tooSmall ? '屏幕太小，请使用更大的设备' : '请将设备旋转至横屏'}
      </p>
      <p className="text-xs text-gray-500 mt-3 uppercase tracking-[0.3em]">麻将 · Mahjong</p>
    </div>
  );
}
