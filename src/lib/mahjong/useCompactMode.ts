'use client';

import { useEffect, useState } from 'react';

// Compact mode kicks in on small landscape screens (e.g., phones in landscape).
// Threshold roughly = "smaller than a typical small laptop landscape".
const COMPACT_WIDTH_THRESHOLD = 1024;
const COMPACT_HEIGHT_THRESHOLD = 600;

function evaluateCompact(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth < COMPACT_WIDTH_THRESHOLD ||
    window.innerHeight < COMPACT_HEIGHT_THRESHOLD
  );
}

export function useCompactMode(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    function check() {
      setCompact(evaluateCompact());
    }
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  return compact;
}
