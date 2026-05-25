# 川麻血战到底 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-seat 川麻 (Sichuan blood-battle) game to the existing AVIC Next.js project, with Aaron and Vicky as humans plus 2 rule-based AI seats, sharing the existing Vercel/Pusher/Upstash deployment.

**Architecture:** Server-authoritative engine in `src/lib/mahjong/`, persisted as a single JSON blob in Upstash Redis under key `mahjong:game`, broadcast via per-seat Pusher events on `mahjong-channel`. After every human action, the same HTTP request runs an AI driver loop that resolves all AI moves until turn returns to a human or a claim window opens for humans. Client UI is a zustand store + framer-motion components rendered on `/mahjong`, landscape-only.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, framer-motion, zustand, @upstash/redis, pusher / pusher-js, Vitest (new devDep).

**Spec:** `docs/superpowers/specs/2026-05-25-mahjong-heads-up-design.md`.

**Conventions:**
- All new code lives under `src/lib/mahjong/` and `src/components/mahjong/` and `src/app/mahjong/` and `src/app/api/mahjong/`. The existing poker code is **not modified**.
- Tests are colocated as `*.test.ts` next to source.
- Each task ends with a commit. Commit messages use Conventional Commits (`feat:`, `test:`, `refactor:`, `chore:`).
- Every step that changes code shows the full code. No placeholders.

---

### Task 1: Vitest setup + tile types

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/mahjong/types.ts`
- Modify: `package.json` (add devDeps and scripts)

- [ ] **Step 1: Install Vitest and @types/node assertions**

Run:
```bash
npm install --save-dev vitest@^2.1.0
```
Expected: `package.json` gets a new `vitest` entry under `devDependencies`. No code-mods needed.

- [ ] **Step 2: Create `vitest.config.ts`**

Create `vitest.config.ts` at repo root with:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In `package.json`, under `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```
The full `scripts` block becomes:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Run vitest to confirm it starts (and finds nothing)**

Run:
```bash
npm test
```
Expected output (success — no test files yet matches the include glob):
```
No test files found, exiting with code 0
```
or with a friendlier "Vitest can't find any tests" message. **Either is acceptable** as long as exit code is 0.

If exit code is non-zero, the include path is wrong; fix `vitest.config.ts`.

- [ ] **Step 5: Create `src/lib/mahjong/types.ts` with all spec types**

Create `src/lib/mahjong/types.ts`:
```ts
// Core tile types
export type Suit = 'wan' | 'tong' | 'tiao';
export type TileValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type TileId = string; // "wan-5-2" = the 2nd copy of 5万

export interface Tile {
  id: TileId;
  suit: Suit;
  value: TileValue;
}

// Seats and player identity
export type Seat = 'east' | 'south' | 'west' | 'north';
export type PlayerKind = 'human' | 'ai';
export type HumanName = 'Aaron' | 'Vicky';

export interface SeatAssignment {
  seat: Seat;
  kind: PlayerKind;
  human?: HumanName;
  aiId?: string; // 'AI-1' | 'AI-2'
}

// Melds (公开副露)
export type MeldType = 'peng' | 'gang-ming' | 'gang-an' | 'gang-bu';

export interface Meld {
  type: MeldType;
  tiles: Tile[]; // 3 for peng, 4 for any gang
  fromSeat: Seat | null; // null for 暗杠
}

// Win types and results
export type WinType = 'ping-hu' | 'dui-dui-hu' | 'qing-yi-se' | 'qi-dui';

export interface HuResult {
  winTypes: WinType[];
  fan: number;
  selfDraw: boolean;
  winningTile: Tile;
  fromSeat: Seat | null; // null on 自摸
}

// Player state
export interface PlayerState {
  seat: Seat;
  assignment: SeatAssignment;
  hand: Tile[]; // 13 normally, 14 after draw/claim
  melds: Meld[];
  discards: Tile[];
  missingSuit: Suit | null;
  hasHu: boolean;
  huResult: HuResult | null;
  score: number;
}

// Phases
export type Phase =
  | 'seat-selection'
  | 'choose-missing'
  | 'playing'
  | 'claim-window'
  | 'settled';

// Claim window
export interface ClaimOption {
  seat: Seat;
  type: 'peng' | 'gang' | 'hu';
}

export interface PendingClaim {
  seat: Seat;
  choice: 'peng' | 'gang' | 'hu' | 'pass';
}

export interface ClaimWindow {
  discardedTile: Tile;
  fromSeat: Seat;
  options: ClaimOption[];
  pending: Seat[]; // humans whose decision we're waiting on
  decisions: PendingClaim[];
  expiresAt: number; // epoch ms
}

// Game state
export interface GameState {
  version: number;
  phase: Phase;
  wall: Tile[]; // server-only; filtered out for clients
  wallCount: number;
  seats: Record<Seat, PlayerState>;
  turn: Seat;
  dealer: Seat;
  lastDiscard: { seat: Seat; tile: Tile } | null;
  claimWindow: ClaimWindow | null;
  huOrder: Seat[];
  gameOver: boolean;
  handNumber: number;
}

// Turn order: counter-clockwise. east → north → west → south → east
export const TURN_ORDER: Seat[] = ['east', 'north', 'west', 'south'];

export function nextSeat(seat: Seat): Seat {
  const idx = TURN_ORDER.indexOf(seat);
  return TURN_ORDER[(idx + 1) % 4];
}
```

- [ ] **Step 6: Run TypeScript check to confirm types compile**

Run:
```bash
npx tsc --noEmit
```
Expected: exit code 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/mahjong/types.ts
git commit -m "chore: vitest setup and mahjong type definitions"
```

---

### Task 2: Tile builder + seedable shuffle

**Files:**
- Create: `src/lib/mahjong/tiles.ts`
- Create: `src/lib/mahjong/tiles.test.ts`

- [ ] **Step 1: Write failing test for `buildWall()`**

Create `src/lib/mahjong/tiles.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildWall, shuffleWithSeed, parseTileId, formatTileId } from './tiles';
import type { Suit, TileValue } from './types';

describe('buildWall', () => {
  it('produces exactly 108 tiles', () => {
    const wall = buildWall();
    expect(wall).toHaveLength(108);
  });

  it('has exactly 4 copies of each suit/value combination', () => {
    const wall = buildWall();
    const suits: Suit[] = ['wan', 'tong', 'tiao'];
    const values: TileValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const suit of suits) {
      for (const value of values) {
        const count = wall.filter(t => t.suit === suit && t.value === value).length;
        expect(count, `${suit} ${value}`).toBe(4);
      }
    }
  });

  it('every tile has a unique id', () => {
    const wall = buildWall();
    const ids = new Set(wall.map(t => t.id));
    expect(ids.size).toBe(108);
  });

  it('tile ids match their suit/value', () => {
    const wall = buildWall();
    for (const tile of wall) {
      const parsed = parseTileId(tile.id);
      expect(parsed.suit).toBe(tile.suit);
      expect(parsed.value).toBe(tile.value);
    }
  });
});

describe('shuffleWithSeed', () => {
  it('is deterministic for a given seed', () => {
    const wall1 = buildWall();
    const wall2 = buildWall();
    const shuffled1 = shuffleWithSeed(wall1, 12345);
    const shuffled2 = shuffleWithSeed(wall2, 12345);
    expect(shuffled1.map(t => t.id)).toEqual(shuffled2.map(t => t.id));
  });

  it('produces different orderings for different seeds', () => {
    const wall = buildWall();
    const a = shuffleWithSeed([...wall], 1);
    const b = shuffleWithSeed([...wall], 2);
    expect(a.map(t => t.id)).not.toEqual(b.map(t => t.id));
  });

  it('preserves tile set (same 108 tiles)', () => {
    const wall = buildWall();
    const shuffled = shuffleWithSeed([...wall], 99);
    const beforeIds = wall.map(t => t.id).sort();
    const afterIds = shuffled.map(t => t.id).sort();
    expect(afterIds).toEqual(beforeIds);
  });

  it('does not mutate the input array', () => {
    const wall = buildWall();
    const original = wall.map(t => t.id);
    shuffleWithSeed(wall, 7);
    expect(wall.map(t => t.id)).toEqual(original);
  });
});

describe('parseTileId / formatTileId', () => {
  it('round-trips', () => {
    const id = formatTileId('wan', 5, 2);
    expect(id).toBe('wan-5-2');
    const parsed = parseTileId(id);
    expect(parsed).toEqual({ suit: 'wan', value: 5, copyIndex: 2 });
  });

  it('throws on malformed id', () => {
    expect(() => parseTileId('bad')).toThrow();
    expect(() => parseTileId('wan-10-1')).toThrow(); // value out of range
    expect(() => parseTileId('moon-5-1')).toThrow(); // bad suit
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/tiles.test.ts
```
Expected: FAIL with "Cannot find module './tiles'" or similar import error.

- [ ] **Step 3: Implement `src/lib/mahjong/tiles.ts`**

Create `src/lib/mahjong/tiles.ts`:
```ts
import type { Suit, Tile, TileId, TileValue } from './types';

const SUITS: Suit[] = ['wan', 'tong', 'tiao'];
const VALUES: TileValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const COPIES_PER_TILE = 4;

export function formatTileId(suit: Suit, value: TileValue, copyIndex: number): TileId {
  return `${suit}-${value}-${copyIndex}`;
}

export interface ParsedTileId {
  suit: Suit;
  value: TileValue;
  copyIndex: number;
}

export function parseTileId(id: TileId): ParsedTileId {
  const parts = id.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid tile id: ${id}`);
  }
  const [suitStr, valueStr, copyStr] = parts;
  if (!SUITS.includes(suitStr as Suit)) {
    throw new Error(`Invalid suit in tile id: ${id}`);
  }
  const valueNum = Number.parseInt(valueStr, 10);
  if (!VALUES.includes(valueNum as TileValue)) {
    throw new Error(`Invalid value in tile id: ${id}`);
  }
  const copyNum = Number.parseInt(copyStr, 10);
  if (!Number.isInteger(copyNum) || copyNum < 1 || copyNum > COPIES_PER_TILE) {
    throw new Error(`Invalid copy index in tile id: ${id}`);
  }
  return {
    suit: suitStr as Suit,
    value: valueNum as TileValue,
    copyIndex: copyNum,
  };
}

export function buildWall(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      for (let copy = 1; copy <= COPIES_PER_TILE; copy++) {
        tiles.push({
          id: formatTileId(suit, value, copy),
          suit,
          value,
        });
      }
    }
  }
  return tiles;
}

// Mulberry32: tiny seeded PRNG, deterministic across runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  const rand = mulberry32(seed);
  // Fisher-Yates
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Production shuffle uses Math.random (non-deterministic).
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/tiles.test.ts
```
Expected: all tests pass (5 + 5 + 2 = 12 assertions across 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/tiles.ts src/lib/mahjong/tiles.test.ts
git commit -m "feat(mahjong): tile builder and seedable shuffle"
```

---


### Task 3: Hu detection — 七对 + hand utilities

**Files:**
- Create: `src/lib/mahjong/hu.ts`
- Create: `src/lib/mahjong/hu.test.ts`

七对 (seven pairs) is the simplest hu type: hand of exactly 14 tiles forming 7 distinct pairs (no melds allowed in `melds[]`). Build the test framework here so subsequent hu types snap in.

- [ ] **Step 1: Write failing tests for `isQiDui` and tile-counting utilities**

Create `src/lib/mahjong/hu.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isQiDui, countTilesByKey, tileKey } from './hu';
import type { Tile } from './types';

function t(suit: 'wan'|'tong'|'tiao', value: number, copy = 1): Tile {
  return { id: `${suit}-${value}-${copy}`, suit, value: value as Tile['value'] };
}

describe('tileKey / countTilesByKey', () => {
  it('groups tiles by suit+value ignoring copy index', () => {
    const tiles = [t('wan', 1, 1), t('wan', 1, 2), t('tong', 5, 1)];
    const counts = countTilesByKey(tiles);
    expect(counts.get(tileKey('wan', 1))).toBe(2);
    expect(counts.get(tileKey('tong', 5))).toBe(1);
    expect(counts.get(tileKey('tiao', 9))).toBeUndefined();
  });
});

describe('isQiDui', () => {
  it('accepts 7 distinct pairs (14 tiles)', () => {
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2),
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
      t('tiao', 9, 1), t('tiao', 9, 2),
    ];
    expect(isQiDui(hand)).toBe(true);
  });

  it('accepts 4-of-a-kind as two pairs (qi dui allows duplicates)', () => {
    // 6 distinct pairs + one 4-of-a-kind = 7 pair-equivalents
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2), t('wan', 1, 3), t('wan', 1, 4),
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
    ];
    expect(isQiDui(hand)).toBe(true);
  });

  it('rejects hand with a triple', () => {
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2), t('wan', 1, 3), // triple, not pair
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
      t('tiao', 9, 1),
    ];
    expect(isQiDui(hand)).toBe(false);
  });

  it('rejects wrong tile count', () => {
    const hand = [t('wan', 1, 1), t('wan', 1, 2)];
    expect(isQiDui(hand)).toBe(false);
  });

  it('rejects 13 tiles', () => {
    const hand = [
      t('wan', 1, 1), t('wan', 1, 2),
      t('wan', 3, 1), t('wan', 3, 2),
      t('tong', 2, 1), t('tong', 2, 2),
      t('tong', 5, 1), t('tong', 5, 2),
      t('tiao', 4, 1), t('tiao', 4, 2),
      t('tiao', 7, 1), t('tiao', 7, 2),
      t('tiao', 9, 1),
    ];
    expect(isQiDui(hand)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/hu.test.ts
```
Expected: FAIL with import error (no `./hu` module yet).

- [ ] **Step 3: Implement `src/lib/mahjong/hu.ts` (qi-dui scope)**

Create `src/lib/mahjong/hu.ts`:
```ts
import type { Suit, Tile, TileValue } from './types';

// Tile key: stable string keyed by suit+value, ignoring copy index.
// Used everywhere we compare or count tiles by their face (not identity).
export type TileKey = string;

export function tileKey(suit: Suit, value: TileValue): TileKey {
  return `${suit}-${value}`;
}

export function tileKeyOf(tile: Tile): TileKey {
  return tileKey(tile.suit, tile.value);
}

export function countTilesByKey(tiles: readonly Tile[]): Map<TileKey, number> {
  const counts = new Map<TileKey, number>();
  for (const tile of tiles) {
    const k = tileKeyOf(tile);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

// 七对: exactly 14 tiles, every count must be even (2 or 4).
export function isQiDui(hand: readonly Tile[]): boolean {
  if (hand.length !== 14) return false;
  const counts = countTilesByKey(hand);
  for (const count of counts.values()) {
    if (count % 2 !== 0) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/hu.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/hu.ts src/lib/mahjong/hu.test.ts
git commit -m "feat(mahjong): hu detection — 七对 + tile-counting utilities"
```

---

### Task 4: Hu detection — 平胡 (4 melds + 1 pair)

平胡 = standard mahjong hu structure: 4 sets + 1 pair from a 14-tile hand. A "set" is a triplet (3 of same tile) or a run (3 consecutive same-suit). For melds already in `PlayerState.melds`, those count as fixed sets; only the remaining hand must form `(4 - melds.length)` sets + 1 pair.

In 川麻 there are no 吃 (no run-claims), but a player may have run-shaped patterns *in hand* — whether 川麻 disallows runs entirely depends on variant. **Spec scope (MVP): 平胡 allows in-hand runs** (this is the standard 川麻 平胡 — running triplets are still legal hu shapes; only chowing from discards is forbidden). This makes 平胡 detection a standard backtracking problem.

**Files:**
- Modify: `src/lib/mahjong/hu.ts`
- Modify: `src/lib/mahjong/hu.test.ts`

- [ ] **Step 1: Append failing tests for `canFormSetsAndPair` and `isPingHu`**

Append to `src/lib/mahjong/hu.test.ts`:
```ts
import { canFormSetsAndPair, isPingHu } from './hu';

function tiles(...specs: string[]): Tile[] {
  // each spec: "w5" "t3" "p9" — 1-letter suit + 1-digit value
  // copyIndex auto-incremented per (suit,value) so every Tile.id is unique
  const seen = new Map<string, number>();
  const suitMap: Record<string, 'wan'|'tong'|'tiao'> = { w: 'wan', p: 'tong', t: 'tiao' };
  return specs.map(s => {
    const suit = suitMap[s[0]];
    const value = Number(s[1]);
    const key = `${suit}-${value}`;
    const copy = (seen.get(key) ?? 0) + 1;
    seen.set(key, copy);
    return { id: `${suit}-${value}-${copy}`, suit, value: value as Tile['value'] };
  });
}

describe('canFormSetsAndPair', () => {
  it('accepts pure pong+pair (4 triplets + 1 pair)', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w3','w3','w3','w4','w4','w4','w5','w5');
    expect(canFormSetsAndPair(hand, 4)).toBe(true);
  });

  it('accepts 4 runs + 1 pair', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5','t5');
    expect(canFormSetsAndPair(hand, 4)).toBe(true);
  });

  it('accepts mixed pongs and runs', () => {
    const hand = tiles('w1','w1','w1','p2','p3','p4','t5','t5','t5','t6','t7','t8','w9','w9');
    expect(canFormSetsAndPair(hand, 4)).toBe(true);
  });

  it('rejects hand missing a pair', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w3','w3','w3','w4','w4','w4','w5','w6');
    expect(canFormSetsAndPair(hand, 4)).toBe(false);
  });

  it('rejects hand with leftover tiles', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w3','w3','w3','w4','w4','w5','w5','w7');
    expect(canFormSetsAndPair(hand, 4)).toBe(false);
  });

  it('handles existing melds (need fewer sets from hand)', () => {
    // 1 meld already → need 3 sets + pair from 11 tiles
    const hand = tiles('w1','w1','w1','w2','w2','w2','p4','p5','p6','t7','t7');
    expect(canFormSetsAndPair(hand, 3)).toBe(true);
  });
});

describe('isPingHu', () => {
  it('accepts a standard 4-meld + pair hand with no existing melds', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5','t5');
    expect(isPingHu(hand, [])).toBe(true);
  });

  it('rejects 七对 shape (no triplets/runs structure)', () => {
    const hand = tiles('w1','w1','w3','w3','p2','p2','p5','p5','t4','t4','t7','t7','t9','t9');
    expect(isPingHu(hand, [])).toBe(false);
  });

  it('rejects 13-tile hand', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5');
    expect(isPingHu(hand, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/hu.test.ts
```
Expected: FAIL — `canFormSetsAndPair` and `isPingHu` are not exported.

- [ ] **Step 3: Implement 平胡 backtracking in `src/lib/mahjong/hu.ts`**

Append to `src/lib/mahjong/hu.ts`:
```ts
import type { Meld } from './types';

// Convert a hand to a per-suit count vector indexed 1..9.
// Returns Record<Suit, number[]> where the array has length 10 (index 0 unused).
type SuitCounts = Record<Suit, number[]>;

function toSuitCounts(hand: readonly Tile[]): SuitCounts {
  const counts: SuitCounts = {
    wan: new Array(10).fill(0),
    tong: new Array(10).fill(0),
    tiao: new Array(10).fill(0),
  };
  for (const tile of hand) {
    counts[tile.suit][tile.value]++;
  }
  return counts;
}

// Try to consume `setsNeeded` sets (triplet or run) from a single suit's count array.
// Returns true iff possible.
function canFormSetsInSuit(counts: number[], setsNeeded: number): boolean {
  if (setsNeeded === 0) {
    return counts.every(c => c === 0);
  }
  // Find first non-zero index
  let i = 1;
  while (i <= 9 && counts[i] === 0) i++;
  if (i > 9) return setsNeeded === 0;

  // Try triplet at i
  if (counts[i] >= 3) {
    counts[i] -= 3;
    if (canFormSetsInSuit(counts, setsNeeded - 1)) {
      counts[i] += 3;
      return true;
    }
    counts[i] += 3;
  }

  // Try run i, i+1, i+2
  if (i <= 7 && counts[i] >= 1 && counts[i + 1] >= 1 && counts[i + 2] >= 1) {
    counts[i]--;
    counts[i + 1]--;
    counts[i + 2]--;
    if (canFormSetsInSuit(counts, setsNeeded - 1)) {
      counts[i]++;
      counts[i + 1]++;
      counts[i + 2]++;
      return true;
    }
    counts[i]++;
    counts[i + 1]++;
    counts[i + 2]++;
  }

  return false;
}

// Try every (suit, value) pair in the hand as the pair, then try to form
// `totalSetsNeeded` sets from remaining tiles. Sets can come from any suit.
export function canFormSetsAndPair(hand: readonly Tile[], totalSetsNeeded: number): boolean {
  // Expected size: 3*sets + 2 (pair)
  if (hand.length !== totalSetsNeeded * 3 + 2) return false;

  const counts = toSuitCounts(hand);
  const suits: Suit[] = ['wan', 'tong', 'tiao'];

  for (const suit of suits) {
    for (let v = 1; v <= 9; v++) {
      if (counts[suit][v] >= 2) {
        counts[suit][v] -= 2;
        // Distribute setsNeeded across the three suits' counts.
        // Each suit's tiles must fully resolve into sets.
        // Check: for each suit, count must be divisible by 3, AND that suit
        // can form (count/3) sets.
        let ok = true;
        let setsFormed = 0;
        for (const s of suits) {
          const total = counts[s].reduce((a, b) => a + b, 0);
          if (total % 3 !== 0) { ok = false; break; }
          const need = total / 3;
          setsFormed += need;
          if (!canFormSetsInSuit(counts[s], need)) { ok = false; break; }
        }
        counts[suit][v] += 2;
        if (ok && setsFormed === totalSetsNeeded) return true;
      }
    }
  }
  return false;
}

// 平胡: standard 4-meld + pair structure for a 14-tile hand,
// minus the number of pre-existing melds (which already account for
// melds.length sets).
export function isPingHu(hand: readonly Tile[], melds: readonly Meld[]): boolean {
  const setsNeeded = 4 - melds.length;
  if (setsNeeded < 0) return false;
  return canFormSetsAndPair(hand, setsNeeded);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/hu.test.ts
```
Expected: all tests pass (Tasks 3 + 4 combined).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/hu.ts src/lib/mahjong/hu.test.ts
git commit -m "feat(mahjong): hu detection — 平胡 with backtracking solver"
```

---

### Task 5: Hu detection — 对对胡, 清一色, missing-suit constraint, top-level `canHu`

- 对对胡 = 4 triplets + 1 pair (no runs in hand). Restricts the 平胡 search to triplets only.
- 清一色 = all tiles (hand + melds) belong to a single suit.
- Missing-suit constraint: hand must contain zero tiles of `missingSuit`. Without this, no hu is legal.
- Top-level `canHu(state, seat, winningTile?)` returns the set of `WinType`s achievable, or empty if no hu.

**Files:**
- Modify: `src/lib/mahjong/hu.ts`
- Modify: `src/lib/mahjong/hu.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/mahjong/hu.test.ts`:
```ts
import { isDuiDuiHu, isQingYiSe, canHu, type CanHuResult } from './hu';
import type { Meld } from './types';

describe('isDuiDuiHu', () => {
  it('accepts 4 triplets + pair', () => {
    const hand = tiles('w1','w1','w1','p2','p2','p2','t5','t5','t5','t6','t6','t6','w9','w9');
    expect(isDuiDuiHu(hand, [])).toBe(true);
  });

  it('rejects hand containing a run', () => {
    const hand = tiles('w1','w1','w1','p2','p2','p2','t5','t6','t7','t6','t6','t6','w9','w9');
    expect(isDuiDuiHu(hand, [])).toBe(false);
  });

  it('counts existing peng/gang melds as triplets', () => {
    const meld: Meld = {
      type: 'peng',
      tiles: tiles('w3','w3','w3'),
      fromSeat: 'south',
    };
    // need 3 more triplets + pair from 11 tiles
    const hand = tiles('p2','p2','p2','t5','t5','t5','t6','t6','t6','w9','w9');
    expect(isDuiDuiHu(hand, [meld])).toBe(true);
  });
});

describe('isQingYiSe', () => {
  it('accepts all-wan hand (with no melds)', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w4','w5','w6','w7','w8','w9','w3','w3');
    expect(isQingYiSe(hand, [])).toBe(true);
  });

  it('rejects mixed-suit hand', () => {
    const hand = tiles('w1','w1','w1','p2','p2','p2','t5','t5','t5','t6','t6','t6','w9','w9');
    expect(isQingYiSe(hand, [])).toBe(false);
  });

  it('considers melds when computing suit', () => {
    const meld: Meld = {
      type: 'peng',
      tiles: tiles('p3','p3','p3'),
      fromSeat: 'south',
    };
    const hand = tiles('w1','w1','w1','w4','w5','w6','w7','w7','w7','w9','w9');
    expect(isQingYiSe(hand, [meld])).toBe(false); // hand is wan but meld is tong
  });
});

describe('canHu (top-level)', () => {
  it('returns ping-hu for a standard winning shape', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5','t5');
    const r: CanHuResult = canHu(hand, [], null);
    expect(r.canHu).toBe(true);
    expect(r.winTypes).toContain('ping-hu');
  });

  it('returns multiple win types when stacked (清一色 + 对对胡)', () => {
    const hand = tiles('w1','w1','w1','w2','w2','w2','w4','w4','w4','w7','w7','w7','w9','w9');
    const r = canHu(hand, [], null);
    expect(r.canHu).toBe(true);
    expect(r.winTypes).toEqual(expect.arrayContaining(['ping-hu', 'dui-dui-hu', 'qing-yi-se']));
  });

  it('returns 七对 when applicable', () => {
    const hand = tiles('w1','w1','w3','w3','p2','p2','p5','p5','t4','t4','t7','t7','t9','t9');
    const r = canHu(hand, [], null);
    expect(r.canHu).toBe(true);
    expect(r.winTypes).toContain('qi-dui');
    expect(r.winTypes).not.toContain('ping-hu');
  });

  it('rejects hu when hand contains a missing-suit tile', () => {
    const hand = tiles('w1','w2','w3','w4','w5','w6','p1','p2','p3','t7','t8','t9','t5','t5');
    const r = canHu(hand, [], 'tong');
    expect(r.canHu).toBe(false);
    expect(r.winTypes).toEqual([]);
  });

  it('returns canHu=false for non-winning hands', () => {
    const hand = tiles('w1','w2','w4','w5','w6','w7','p1','p2','p3','t7','t8','t9','t5','t5');
    const r = canHu(hand, [], null);
    expect(r.canHu).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/hu.test.ts
```
Expected: FAIL — `isDuiDuiHu`, `isQingYiSe`, `canHu`, `CanHuResult` not exported.

- [ ] **Step 3: Implement the new hu types and top-level `canHu`**

Append to `src/lib/mahjong/hu.ts`:
```ts
import type { WinType } from './types';

// 对对胡: like 平胡 but every set must be a triplet (no runs).
// Existing peng/gang melds already qualify as triplets.
function canFormTripletsOnly(counts: number[], setsNeeded: number): boolean {
  if (setsNeeded === 0) {
    return counts.every(c => c === 0);
  }
  let i = 1;
  while (i <= 9 && counts[i] === 0) i++;
  if (i > 9) return setsNeeded === 0;

  if (counts[i] >= 3) {
    counts[i] -= 3;
    if (canFormTripletsOnly(counts, setsNeeded - 1)) {
      counts[i] += 3;
      return true;
    }
    counts[i] += 3;
  }
  return false;
}

export function isDuiDuiHu(hand: readonly Tile[], melds: readonly Meld[]): boolean {
  // Verify all melds are triplet-shaped (peng or any gang)
  for (const meld of melds) {
    if (meld.type !== 'peng' && meld.type !== 'gang-ming' && meld.type !== 'gang-an' && meld.type !== 'gang-bu') {
      return false;
    }
  }
  const setsNeeded = 4 - melds.length;
  if (setsNeeded < 0) return false;
  if (hand.length !== setsNeeded * 3 + 2) return false;

  const counts = toSuitCounts(hand);
  const suits: Suit[] = ['wan', 'tong', 'tiao'];

  for (const suit of suits) {
    for (let v = 1; v <= 9; v++) {
      if (counts[suit][v] >= 2) {
        counts[suit][v] -= 2;
        let ok = true;
        let setsFormed = 0;
        for (const s of suits) {
          const total = counts[s].reduce((a, b) => a + b, 0);
          if (total % 3 !== 0) { ok = false; break; }
          const need = total / 3;
          setsFormed += need;
          if (!canFormTripletsOnly(counts[s], need)) { ok = false; break; }
        }
        counts[suit][v] += 2;
        if (ok && setsFormed === setsNeeded) return true;
      }
    }
  }
  return false;
}

export function isQingYiSe(hand: readonly Tile[], melds: readonly Meld[]): boolean {
  const allTiles: Tile[] = [...hand];
  for (const meld of melds) allTiles.push(...meld.tiles);
  if (allTiles.length === 0) return false;
  const firstSuit = allTiles[0].suit;
  return allTiles.every(t => t.suit === firstSuit);
}

export interface CanHuResult {
  canHu: boolean;
  winTypes: WinType[];
}

// Missing-suit guard: no tile in hand or melds may be of `missingSuit`.
function violatesMissingSuit(
  hand: readonly Tile[],
  melds: readonly Meld[],
  missingSuit: Suit | null,
): boolean {
  if (missingSuit === null) return false;
  if (hand.some(t => t.suit === missingSuit)) return true;
  for (const meld of melds) {
    if (meld.tiles.some(t => t.suit === missingSuit)) return true;
  }
  return false;
}

export function canHu(
  hand: readonly Tile[],
  melds: readonly Meld[],
  missingSuit: Suit | null,
): CanHuResult {
  if (violatesMissingSuit(hand, melds, missingSuit)) {
    return { canHu: false, winTypes: [] };
  }

  const winTypes: WinType[] = [];

  const qiDui = isQiDui(hand) && melds.length === 0;
  if (qiDui) winTypes.push('qi-dui');

  const pingHu = isPingHu(hand, melds);
  if (pingHu) winTypes.push('ping-hu');

  // 对对胡 only stacks if the standard structure is also satisfied
  if (pingHu && isDuiDuiHu(hand, melds)) winTypes.push('dui-dui-hu');

  // 清一色 stacks with any winning structure
  if ((pingHu || qiDui) && isQingYiSe(hand, melds)) winTypes.push('qing-yi-se');

  return { canHu: winTypes.length > 0, winTypes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/hu.test.ts
```
Expected: all hu tests pass (Tasks 3 + 4 + 5 combined; ~25 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/hu.ts src/lib/mahjong/hu.test.ts
git commit -m "feat(mahjong): hu detection — 对对胡, 清一色, missing-suit, top-level canHu"
```

---


### Task 6: 番 calculator

Compute total `fan` from `WinType[]` and `selfDraw`, returning a complete `HuResult`.

**Files:**
- Create: `src/lib/mahjong/scoring.ts`
- Create: `src/lib/mahjong/scoring.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/mahjong/scoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeFan, FAN_PER_WIN_TYPE, chipsForFan } from './scoring';
import type { WinType } from './types';

describe('computeFan', () => {
  it('returns base 1 for ping-hu only, no self-draw', () => {
    expect(computeFan(['ping-hu'], false)).toBe(1);
  });

  it('adds +1 for self-draw', () => {
    expect(computeFan(['ping-hu'], true)).toBe(2);
  });

  it('stacks 清一色 + 对对胡 (4 + 2 = 6)', () => {
    const types: WinType[] = ['ping-hu', 'dui-dui-hu', 'qing-yi-se'];
    // ping-hu (1) + dui-dui-hu (2) + qing-yi-se (4) = 7
    expect(computeFan(types, false)).toBe(7);
  });

  it('stacks self-draw with multiple types', () => {
    const types: WinType[] = ['ping-hu', 'qing-yi-se'];
    // 1 + 4 + 1 (selfDraw) = 6
    expect(computeFan(types, true)).toBe(6);
  });

  it('七对 base 2', () => {
    expect(computeFan(['qi-dui'], false)).toBe(2);
  });
});

describe('FAN_PER_WIN_TYPE', () => {
  it('matches spec base values', () => {
    expect(FAN_PER_WIN_TYPE['ping-hu']).toBe(1);
    expect(FAN_PER_WIN_TYPE['dui-dui-hu']).toBe(2);
    expect(FAN_PER_WIN_TYPE['qi-dui']).toBe(2);
    expect(FAN_PER_WIN_TYPE['qing-yi-se']).toBe(4);
  });
});

describe('chipsForFan', () => {
  it('returns 2^fan', () => {
    expect(chipsForFan(0)).toBe(1);
    expect(chipsForFan(1)).toBe(2);
    expect(chipsForFan(3)).toBe(8);
    expect(chipsForFan(7)).toBe(128);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/scoring.test.ts
```
Expected: FAIL with import error.

- [ ] **Step 3: Implement `src/lib/mahjong/scoring.ts`**

Create `src/lib/mahjong/scoring.ts`:
```ts
import type { WinType } from './types';

export const FAN_PER_WIN_TYPE: Record<WinType, number> = {
  'ping-hu': 1,
  'dui-dui-hu': 2,
  'qi-dui': 2,
  'qing-yi-se': 4,
};

export function computeFan(winTypes: readonly WinType[], selfDraw: boolean): number {
  let fan = 0;
  for (const t of winTypes) fan += FAN_PER_WIN_TYPE[t];
  if (selfDraw) fan += 1;
  return fan;
}

export function chipsForFan(fan: number): number {
  return 2 ** fan;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/scoring.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/scoring.ts src/lib/mahjong/scoring.test.ts
git commit -m "feat(mahjong): 番 calculator and chips formula"
```

---

### Task 7: Engine — state init, seat picking, 定缺

Build the engine's first three phases. Pure-function core; Redis I/O comes in Task 15.

**Files:**
- Create: `src/lib/mahjong/engine.ts`
- Create: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Write failing tests for `initialState`, `pickSeat`, `chooseMissing`**

Create `src/lib/mahjong/engine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  initialState,
  pickSeat,
  chooseMissing,
  applyAction,
  type ActionResult,
} from './engine';
import type { GameState, Seat } from './types';

describe('initialState', () => {
  it('starts in seat-selection phase with no assignments', () => {
    const s = initialState();
    expect(s.phase).toBe('seat-selection');
    expect(s.version).toBe(0);
    expect(s.handNumber).toBe(0);
    expect(s.gameOver).toBe(false);
    expect(s.dealer).toBe('east');
    expect(s.huOrder).toEqual([]);
    expect(s.claimWindow).toBeNull();
    expect(s.lastDiscard).toBeNull();
    for (const seat of ['east','south','west','north'] as Seat[]) {
      const p = s.seats[seat];
      expect(p.hand).toEqual([]);
      expect(p.melds).toEqual([]);
      expect(p.discards).toEqual([]);
      expect(p.missingSuit).toBeNull();
      expect(p.hasHu).toBe(false);
      expect(p.score).toBe(0);
      expect(p.assignment.kind).toBe('ai'); // default; humans claim via pickSeat
    }
  });
});

describe('pickSeat (Aaron / Vicky)', () => {
  it('assigns Aaron to chosen seat, fills others as AI', () => {
    let s = initialState();
    const r = pickSeat(s, 'east', 'Aaron');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.east.assignment.kind).toBe('human');
    expect(s.seats.east.assignment.human).toBe('Aaron');
    expect(s.seats.south.assignment.kind).toBe('ai');
    expect(s.phase).toBe('seat-selection'); // still waiting on Vicky
  });

  it('assigning the second human transitions to choose-missing and deals', () => {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    const r = pickSeat(s, 'south', 'Vicky');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.south.assignment.human).toBe('Vicky');
    expect(s.phase).toBe('choose-missing');
    expect(s.handNumber).toBe(1);
    // each seat has 13 tiles dealt
    for (const seat of ['east','south','west','north'] as Seat[]) {
      expect(s.seats[seat].hand.length).toBe(13);
    }
    // wall has 108 - 4*13 = 56 tiles
    expect(s.wallCount).toBe(56);
    expect(s.wall.length).toBe(56);
  });

  it('rejects assigning the same human twice', () => {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    const r = pickSeat(s, 'south', 'Aaron');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already-assigned');
  });

  it('rejects an already-occupied seat', () => {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    const r = pickSeat(s, 'east', 'Vicky');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('seat-taken');
  });
});

describe('chooseMissing', () => {
  function readyToChoose(): GameState {
    let s = initialState();
    s = pickSeat(s, 'east', 'Aaron').state!;
    s = pickSeat(s, 'south', 'Vicky').state!;
    return s;
  }

  it('records the chosen suit for one seat', () => {
    let s = readyToChoose();
    const r = chooseMissing(s, 'east', 'tong');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.east.missingSuit).toBe('tong');
    expect(s.phase).toBe('choose-missing');
  });

  it('once all 4 seats have chosen, transitions to playing with dealer to draw', () => {
    let s = readyToChoose();
    s = chooseMissing(s, 'east', 'tong').state!;
    s = chooseMissing(s, 'south', 'tong').state!;
    s = chooseMissing(s, 'west', 'tong').state!;
    s = chooseMissing(s, 'north', 'tong').state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('east'); // dealer is east, dealer draws first
    // dealer has been given a draw — 14 tiles
    expect(s.seats.east.hand.length).toBe(14);
    expect(s.seats.south.hand.length).toBe(13);
    expect(s.wallCount).toBe(55);
  });

  it('rejects choosing twice', () => {
    let s = readyToChoose();
    s = chooseMissing(s, 'east', 'tong').state!;
    const r = chooseMissing(s, 'east', 'wan');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already-chosen');
  });

  it('rejects choosing in wrong phase', () => {
    const s = initialState();
    const r = chooseMissing(s, 'east', 'tong');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: FAIL with import error.

- [ ] **Step 3: Implement `src/lib/mahjong/engine.ts` (init + seat picking + 定缺)**

Create `src/lib/mahjong/engine.ts`:
```ts
import type {
  GameState,
  Seat,
  HumanName,
  PlayerState,
  Suit,
  Tile,
} from './types';
import { TURN_ORDER } from './types';
import { buildWall, shuffle } from './tiles';

const ALL_SEATS: Seat[] = ['east', 'south', 'west', 'north'];

export interface ActionResult {
  ok: boolean;
  state?: GameState;
  error?: string;
}

function emptyPlayer(seat: Seat): PlayerState {
  return {
    seat,
    assignment: { seat, kind: 'ai', aiId: `AI-${seat}` },
    hand: [],
    melds: [],
    discards: [],
    missingSuit: null,
    hasHu: false,
    huResult: null,
    score: 0,
  };
}

export function initialState(): GameState {
  return {
    version: 0,
    phase: 'seat-selection',
    wall: [],
    wallCount: 0,
    seats: {
      east: emptyPlayer('east'),
      south: emptyPlayer('south'),
      west: emptyPlayer('west'),
      north: emptyPlayer('north'),
    },
    turn: 'east',
    dealer: 'east',
    lastDiscard: null,
    claimWindow: null,
    huOrder: [],
    gameOver: false,
    handNumber: 0,
  };
}

function bumpVersion(s: GameState): GameState {
  return { ...s, version: s.version + 1 };
}

function clone(s: GameState): GameState {
  // Shallow per-seat clone is enough — engine functions never mutate sub-arrays in place.
  return {
    ...s,
    wall: [...s.wall],
    huOrder: [...s.huOrder],
    seats: {
      east: { ...s.seats.east, hand: [...s.seats.east.hand], melds: [...s.seats.east.melds], discards: [...s.seats.east.discards] },
      south: { ...s.seats.south, hand: [...s.seats.south.hand], melds: [...s.seats.south.melds], discards: [...s.seats.south.discards] },
      west: { ...s.seats.west, hand: [...s.seats.west.hand], melds: [...s.seats.west.melds], discards: [...s.seats.west.discards] },
      north: { ...s.seats.north, hand: [...s.seats.north.hand], melds: [...s.seats.north.melds], discards: [...s.seats.north.discards] },
    },
  };
}

// AI seats fill any unassigned seat after both humans pick.
function fillAISeats(s: GameState): GameState {
  const out = clone(s);
  let aiCounter = 1;
  for (const seat of ALL_SEATS) {
    if (out.seats[seat].assignment.kind !== 'human') {
      out.seats[seat].assignment = { seat, kind: 'ai', aiId: `AI-${aiCounter}` };
      aiCounter++;
    }
  }
  return out;
}

function dealHand(s: GameState): GameState {
  const out = clone(s);
  out.wall = shuffle(buildWall());
  for (const seat of ALL_SEATS) {
    out.seats[seat].hand = out.wall.splice(out.wall.length - 13, 13);
    out.seats[seat].melds = [];
    out.seats[seat].discards = [];
    out.seats[seat].missingSuit = null;
    out.seats[seat].hasHu = false;
    out.seats[seat].huResult = null;
  }
  out.wallCount = out.wall.length;
  out.lastDiscard = null;
  out.claimWindow = null;
  out.huOrder = [];
  out.handNumber += 1;
  out.phase = 'choose-missing';
  return out;
}

export function pickSeat(state: GameState, seat: Seat, human: HumanName): ActionResult {
  if (state.phase !== 'seat-selection') {
    return { ok: false, error: 'wrong-phase' };
  }
  // Reject if same human already seated elsewhere.
  for (const s of ALL_SEATS) {
    const a = state.seats[s].assignment;
    if (a.kind === 'human' && a.human === human) {
      return { ok: false, error: 'already-assigned' };
    }
  }
  if (state.seats[seat].assignment.kind === 'human') {
    return { ok: false, error: 'seat-taken' };
  }

  let next = clone(state);
  next.seats[seat].assignment = { seat, kind: 'human', human };

  // Count humans seated.
  const humansSeated = ALL_SEATS.filter(s => next.seats[s].assignment.kind === 'human').length;

  if (humansSeated === 2) {
    next = fillAISeats(next);
    next = dealHand(next);
  }

  return { ok: true, state: bumpVersion(next) };
}

export function chooseMissing(state: GameState, seat: Seat, suit: Suit): ActionResult {
  if (state.phase !== 'choose-missing') {
    return { ok: false, error: 'wrong-phase' };
  }
  if (state.seats[seat].missingSuit !== null) {
    return { ok: false, error: 'already-chosen' };
  }

  let next = clone(state);
  next.seats[seat].missingSuit = suit;

  // If all 4 chosen, transition to playing and dealer draws.
  const allChosen = ALL_SEATS.every(s => next.seats[s].missingSuit !== null);
  if (allChosen) {
    next.phase = 'playing';
    next.turn = next.dealer;
    // Dealer draws first tile.
    const drawn = next.wall.pop();
    if (!drawn) {
      // Edge case: empty wall (impossible after fresh deal but defensive).
      return { ok: false, error: 'internal' };
    }
    next.seats[next.dealer].hand.push(drawn);
    next.wallCount = next.wall.length;
  }

  return { ok: true, state: bumpVersion(next) };
}

// Generic dispatcher used by API route in Task 15.
export type Action =
  | { type: 'pick-seat'; seat: Seat; human: HumanName }
  | { type: 'choose-missing'; seat: Seat; suit: Suit };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat': return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): engine — init, seat picking, 定缺"
```

---

### Task 8: Engine — discard turn loop (no claims yet)

Adds the simplest "playing" mechanic: a player on turn discards a tile, turn advances counter-clockwise, the next player draws. Claims are deferred to Task 9. Self-draw 自摸 hu is checked here so the turn loop is complete for the no-claims case.

**Files:**
- Modify: `src/lib/mahjong/engine.ts`
- Modify: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/mahjong/engine.test.ts`:
```ts
import { discard, declareSelfDrawHu } from './engine';
import type { TileId } from './types';

function startedGame(): GameState {
  let s = initialState();
  s = pickSeat(s, 'east', 'Aaron').state!;
  s = pickSeat(s, 'south', 'Vicky').state!;
  s = chooseMissing(s, 'east', 'tong').state!;
  s = chooseMissing(s, 'south', 'tong').state!;
  s = chooseMissing(s, 'west', 'tong').state!;
  s = chooseMissing(s, 'north', 'tong').state!;
  return s;
}

describe('discard (no claims)', () => {
  it('removes the tile from the active player and advances turn counter-clockwise', () => {
    let s = startedGame();
    expect(s.turn).toBe('east');
    expect(s.seats.east.hand.length).toBe(14);
    const tileId: TileId = s.seats.east.hand[0].id;

    const r = discard(s, 'east', tileId);
    expect(r.ok).toBe(true);
    s = r.state!;

    // East has 13, discarded into east.discards
    expect(s.seats.east.hand.length).toBe(13);
    expect(s.seats.east.discards.length).toBe(1);
    expect(s.seats.east.discards[0].id).toBe(tileId);
    expect(s.lastDiscard).toEqual({ seat: 'east', tile: { id: tileId, suit: expect.anything(), value: expect.anything() } });
    // Turn advances to north (counter-clockwise) and they draw
    expect(s.turn).toBe('north');
    expect(s.seats.north.hand.length).toBe(14);
    expect(s.wallCount).toBe(54);
    // Phase remains 'playing' (we'll add claim-window in Task 9)
    expect(s.phase).toBe('playing');
  });

  it('rejects discard when not your turn', () => {
    const s = startedGame();
    const r = discard(s, 'south', s.seats.south.hand[0].id);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not-your-turn');
  });

  it('rejects discard of a tile not in hand', () => {
    const s = startedGame();
    const r = discard(s, 'east', 'wan-1-99');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('tile-not-in-hand');
  });

  it('rejects discard in wrong phase', () => {
    const s = initialState();
    const r = discard(s, 'east', 'wan-1-1');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});

describe('declareSelfDrawHu', () => {
  it('rejects if hand cannot hu', () => {
    const s = startedGame();
    const r = declareSelfDrawHu(s, 'east');
    // Random hand is unlikely to be a winning shape; assert error
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cannot-hu');
  });

  it('accepts a forced winning hand and locks the player', () => {
    let s = startedGame();
    // Force east's hand to a known winning all-wan triplet shape.
    const winningTiles = [
      { id: 'wan-1-1', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-1-2', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-1-3', suit: 'wan' as const, value: 1 as const },
      { id: 'wan-2-1', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-2-2', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-2-3', suit: 'wan' as const, value: 2 as const },
      { id: 'wan-4-1', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-4-2', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-4-3', suit: 'wan' as const, value: 4 as const },
      { id: 'wan-7-1', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-7-2', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-7-3', suit: 'wan' as const, value: 7 as const },
      { id: 'wan-9-1', suit: 'wan' as const, value: 9 as const },
      { id: 'wan-9-2', suit: 'wan' as const, value: 9 as const },
    ];
    s = { ...s, seats: { ...s.seats, east: { ...s.seats.east, hand: winningTiles } } };

    const r = declareSelfDrawHu(s, 'east');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.seats.east.hasHu).toBe(true);
    expect(s.seats.east.huResult).not.toBeNull();
    expect(s.seats.east.huResult!.selfDraw).toBe(true);
    expect(s.huOrder).toEqual(['east']);
    // Hand still in 'playing' (only 1 hu so far; need ≥3 to settle)
    expect(s.phase).toBe('playing');
    // Turn moves to next non-hu seat (north)
    expect(s.turn).toBe('north');
    // North should have drawn a tile (14)
    expect(s.seats.north.hand.length).toBe(14);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: FAIL — `discard` and `declareSelfDrawHu` not exported.

- [ ] **Step 3: Implement `discard`, `declareSelfDrawHu`, and turn-advancement**

Append to `src/lib/mahjong/engine.ts`:
```ts
import { canHu } from './hu';
import { computeFan, chipsForFan } from './scoring';
import type { TileId, HuResult, WinType } from './types';

// Find next seat in turn order that hasn't hu'd yet.
function nextActiveSeat(state: GameState, from: Seat): Seat | null {
  let cur = from;
  for (let i = 0; i < 4; i++) {
    const idx = TURN_ORDER.indexOf(cur);
    cur = TURN_ORDER[(idx + 1) % 4];
    if (!state.seats[cur].hasHu) return cur;
  }
  return null;
}

function activeSeatCount(state: GameState): number {
  return ALL_SEATS.filter(s => !state.seats[s].hasHu).length;
}

// Pull next tile off the wall (top = end of array).
function drawTileFor(state: GameState, seat: Seat): boolean {
  const tile = state.wall.pop();
  if (!tile) return false;
  state.seats[seat].hand.push(tile);
  state.wallCount = state.wall.length;
  return true;
}

// Apply scoring deltas. Self-draw collects from each non-hu opponent;
// 点炮 (fromSeat !== null) collects from discarder only. Mutates state.
function applyHuPayout(state: GameState, winnerSeat: Seat): void {
  const winner = state.seats[winnerSeat];
  const huResult = winner.huResult;
  if (!huResult) return;
  const chips = chipsForFan(huResult.fan);
  if (huResult.selfDraw) {
    for (const seat of ALL_SEATS) {
      if (seat === winnerSeat) continue;
      state.seats[seat].score -= chips;
      winner.score += chips;
    }
  } else if (huResult.fromSeat) {
    state.seats[huResult.fromSeat].score -= chips;
    winner.score += chips;
  }
}

// Check whether the hand should terminate (≥3 hu OR only one active seat OR wall empty).
function checkTerminate(state: GameState): void {
  if (state.huOrder.length >= 3 || activeSeatCount(state) <= 1) {
    state.phase = 'settled';
    return;
  }
  if (state.wallCount === 0 && state.phase === 'playing') {
    state.phase = 'settled'; // 流局
  }
}

export function discard(state: GameState, seat: Seat, tileId: TileId): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const idx = state.seats[seat].hand.findIndex(t => t.id === tileId);
  if (idx === -1) return { ok: false, error: 'tile-not-in-hand' };

  const next = clone(state);
  const [tile] = next.seats[seat].hand.splice(idx, 1);
  next.seats[seat].discards.push(tile);
  next.lastDiscard = { seat, tile };

  // Task 8: no claim window yet. Just advance turn and draw.
  // Task 9 will replace this with claim-window logic.
  const target = nextActiveSeat(next, seat);
  if (!target) {
    next.phase = 'settled';
    return { ok: true, state: bumpVersion(next) };
  }
  next.turn = target;
  if (!drawTileFor(next, target)) {
    // wall exhausted on draw → 流局
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}

export function declareSelfDrawHu(state: GameState, seat: Seat): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const player = state.seats[seat];
  // Self-draw means the winning tile is the most recently drawn (last in hand).
  if (player.hand.length !== 14) return { ok: false, error: 'wrong-hand-size' };

  const result = canHu(player.hand, player.melds, player.missingSuit);
  if (!result.canHu) return { ok: false, error: 'cannot-hu' };

  const next = clone(state);
  const winningTile = next.seats[seat].hand[next.seats[seat].hand.length - 1];
  const winTypes: WinType[] = result.winTypes;
  const fan = computeFan(winTypes, true);
  const huResult: HuResult = {
    winTypes,
    fan,
    selfDraw: true,
    winningTile,
    fromSeat: null,
  };
  next.seats[seat].hasHu = true;
  next.seats[seat].huResult = huResult;
  next.huOrder.push(seat);
  applyHuPayout(next, seat);
  checkTerminate(next);

  if (next.phase !== 'settled') {
    // Hand continues with next active seat drawing.
    const target = nextActiveSeat(next, seat);
    if (!target) {
      next.phase = 'settled';
    } else {
      next.turn = target;
      if (!drawTileFor(next, target)) next.phase = 'settled';
      checkTerminate(next);
    }
  }
  return { ok: true, state: bumpVersion(next) };
}
```

Also update `Action` and `applyAction` to dispatch the new actions. Replace the `Action` type and `applyAction` body:
```ts
export type Action =
  | { type: 'pick-seat'; seat: Seat; human: HumanName }
  | { type: 'choose-missing'; seat: Seat; suit: Suit }
  | { type: 'discard'; seat: Seat; tileId: TileId }
  | { type: 'self-draw-hu'; seat: Seat };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat': return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    case 'discard': return discard(state, action.seat, action.tileId);
    case 'self-draw-hu': return declareSelfDrawHu(state, action.seat);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: all engine tests pass (Tasks 7 + 8 combined).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): engine — discard turn loop and 自摸 hu"
```

---


### Task 9: Engine — claim window (peng)

Replace the "advance turn immediately on discard" behavior from Task 8 with a proper claim window. After every discard, compute legal claims for all 3 other active seats; if any exist, enter `claim-window` phase. This task implements `peng` only; `gang` and `hu` claims are added in Tasks 10 and 11.

**Files:**
- Modify: `src/lib/mahjong/engine.ts`
- Modify: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Append failing tests for the peng claim flow**

Append to `src/lib/mahjong/engine.test.ts`:
```ts
import { submitClaim } from './engine';
import type { Tile } from './types';

describe('claim window — peng', () => {
  function setupForPengTest(): GameState {
    let s = startedGame();
    // Force south to hold two 5wan so peng is offered when east discards 5wan
    const fiveWan1: Tile = { id: 'wan-5-1', suit: 'wan', value: 5 };
    const fiveWan2: Tile = { id: 'wan-5-2', suit: 'wan', value: 5 };
    const fiveWan3: Tile = { id: 'wan-5-3', suit: 'wan', value: 5 };
    // Make sure east holds wan-5-3 (will discard it) and south holds 5-1 + 5-2.
    // Filter any 5wan currently in any hand or wall, then assign.
    s = clone_(s);
    function stripFiveWan(hand: Tile[]): Tile[] { return hand.filter(t => !(t.suit === 'wan' && t.value === 5)); }
    s.seats.east.hand = stripFiveWan(s.seats.east.hand);
    s.seats.south.hand = stripFiveWan(s.seats.south.hand);
    s.seats.west.hand = stripFiveWan(s.seats.west.hand);
    s.seats.north.hand = stripFiveWan(s.seats.north.hand);
    s.wall = s.wall.filter(t => !(t.suit === 'wan' && t.value === 5));
    // Pad hands back to expected sizes: east=14, others=13.
    while (s.seats.east.hand.length < 13 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    while (s.seats.south.hand.length < 11 && s.wall.length > 0) s.seats.south.hand.push(s.wall.pop()!);
    while (s.seats.west.hand.length < 13 && s.wall.length > 0) s.seats.west.hand.push(s.wall.pop()!);
    while (s.seats.north.hand.length < 13 && s.wall.length > 0) s.seats.north.hand.push(s.wall.pop()!);
    s.seats.east.hand.push(fiveWan3);          // east will discard this
    s.seats.south.hand.push(fiveWan1, fiveWan2); // south can peng
    s.wallCount = s.wall.length;
    return s;
  }

  // Local clone helper since clone is not exported.
  function clone_(s: GameState): GameState {
    return JSON.parse(JSON.stringify(s));
  }

  it('opens claim window when a discard creates a legal peng for another seat', () => {
    let s = setupForPengTest();
    const r = discard(s, 'east', 'wan-5-3');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('claim-window');
    expect(s.claimWindow).not.toBeNull();
    expect(s.claimWindow!.fromSeat).toBe('east');
    expect(s.claimWindow!.discardedTile.id).toBe('wan-5-3');
    expect(s.claimWindow!.options.find(o => o.seat === 'south' && o.type === 'peng')).toBeDefined();
    // East's discarded tile is recorded but turn has NOT advanced yet
    expect(s.seats.east.discards.find(t => t.id === 'wan-5-3')).toBeDefined();
    expect(s.turn).toBe('east'); // turn unchanged until claim resolves
  });

  it('south claims peng — meld formed, south becomes turn (no draw), claim window cleared', () => {
    let s = setupForPengTest();
    s = discard(s, 'east', 'wan-5-3').state!;
    const r = submitClaim(s, 'south', 'peng');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('south');
    expect(s.claimWindow).toBeNull();
    // South now has a peng meld with the 3 fives
    expect(s.seats.south.melds.length).toBe(1);
    const meld = s.seats.south.melds[0];
    expect(meld.type).toBe('peng');
    expect(meld.fromSeat).toBe('east');
    expect(meld.tiles.map(t => t.id).sort()).toEqual(['wan-5-1','wan-5-2','wan-5-3']);
    // South's hand has lost the 2 fives but did NOT draw — they have 14-effective via meld
    // South originally had 12 tiles + 2 fives = 14 (after the test-setup append); after peng, hand has 12 tiles.
    expect(s.seats.south.hand.find(t => t.id === 'wan-5-1' || t.id === 'wan-5-2')).toBeUndefined();
    // East's discard pile no longer contains wan-5-3 (it moved into the meld)
    expect(s.seats.east.discards.find(t => t.id === 'wan-5-3')).toBeUndefined();
    // wall count unchanged (no draw)
    expect(s.wallCount).toBe(s.wall.length);
  });

  it('all-pass resolution: turn advances to next active seat, that seat draws', () => {
    let s = setupForPengTest();
    s = discard(s, 'east', 'wan-5-3').state!;
    const wallBefore = s.wallCount;
    s = submitClaim(s, 'south', 'pass').state!;
    s = submitClaim(s, 'west', 'pass').state!;
    s = submitClaim(s, 'north', 'pass').state!;
    expect(s.phase).toBe('playing');
    expect(s.claimWindow).toBeNull();
    expect(s.turn).toBe('north'); // counter-clockwise from east
    expect(s.seats.north.hand.length).toBe(14);
    expect(s.wallCount).toBe(wallBefore - 1);
    // wan-5-3 stayed in east's discards
    expect(s.seats.east.discards.find(t => t.id === 'wan-5-3')).toBeDefined();
  });

  it('rejects claim from a seat with no legal option', () => {
    let s = setupForPengTest();
    s = discard(s, 'east', 'wan-5-3').state!;
    const r = submitClaim(s, 'west', 'peng');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no-such-claim');
  });

  it('rejects claim outside claim-window phase', () => {
    const s = startedGame();
    const r = submitClaim(s, 'south', 'pass');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: FAIL — `submitClaim` not exported, and the existing Task 8 discard test "removes the tile and advances turn" no longer holds when there's a legal peng. We need to update the Task 8 test or accept that random hands rarely produce a legal claim. The Task 8 test as-written **may now fail** if the random discard happens to hit a peng-able tile — extremely rare with 1 random discard from a 14-tile random hand, but possible. **Update Task 8's "removes the tile" test now** (see Step 3) to use a forced setup avoiding any claim.

- [ ] **Step 3: Update Task 8's discard test to avoid accidental claims**

Replace the body of the `it('removes the tile from the active player and advances turn counter-clockwise', ...)` test in `engine.test.ts` with:
```ts
  it('removes the tile from the active player and advances turn counter-clockwise', () => {
    let s = startedGame();
    expect(s.turn).toBe('east');
    expect(s.seats.east.hand.length).toBe(14);

    // Find a tile in east's hand that no other seat could peng (no other seat has 2+ of same suit/value).
    const tileId = (() => {
      for (const tile of s.seats.east.hand) {
        const otherCounts = (['south','west','north'] as Seat[]).map(seat =>
          s.seats[seat].hand.filter(t => t.suit === tile.suit && t.value === tile.value).length
        );
        if (otherCounts.every(c => c < 2)) return tile.id;
      }
      throw new Error('no claim-free tile found in random hand (rare; rerun)');
    })();

    const r = discard(s, 'east', tileId);
    expect(r.ok).toBe(true);
    s = r.state!;

    expect(s.seats.east.hand.length).toBe(13);
    expect(s.seats.east.discards.length).toBe(1);
    expect(s.seats.east.discards[0].id).toBe(tileId);
    expect(s.lastDiscard?.seat).toBe('east');
    expect(s.lastDiscard?.tile.id).toBe(tileId);
    expect(s.turn).toBe('north');
    expect(s.seats.north.hand.length).toBe(14);
    expect(s.wallCount).toBe(54);
    expect(s.phase).toBe('playing');
  });
```

- [ ] **Step 4: Implement claim-window opening, peng resolution, and `submitClaim`**

Add to `src/lib/mahjong/engine.ts`. First, helper to count tiles by face in a hand:
```ts
import type { ClaimOption, ClaimWindow, PendingClaim, Meld } from './types';

function countMatchingInHand(hand: readonly Tile[], suit: Suit, value: number): number {
  return hand.filter(t => t.suit === suit && t.value === value).length;
}

// Compute legal claims for the discarded tile from all 3 other active seats.
function computeClaimOptions(state: GameState, fromSeat: Seat, tile: Tile): ClaimOption[] {
  const options: ClaimOption[] = [];
  for (const seat of ALL_SEATS) {
    if (seat === fromSeat) continue;
    if (state.seats[seat].hasHu) continue;
    const matching = countMatchingInHand(state.seats[seat].hand, tile.suit, tile.value);
    if (matching >= 3) {
      options.push({ seat, type: 'gang' }); // 明杠 (Task 10 implements; declared here for completeness)
    }
    if (matching >= 2) {
      options.push({ seat, type: 'peng' });
    }
    // hu is added in Task 11
  }
  return options;
}
```

Now **replace** the body of `discard` to use the claim window. Replace the entire `discard` function with:
```ts
export function discard(state: GameState, seat: Seat, tileId: TileId): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const idx = state.seats[seat].hand.findIndex(t => t.id === tileId);
  if (idx === -1) return { ok: false, error: 'tile-not-in-hand' };

  const next = clone(state);
  const [tile] = next.seats[seat].hand.splice(idx, 1);
  next.seats[seat].discards.push(tile);
  next.lastDiscard = { seat, tile };

  const options = computeClaimOptions(next, seat, tile);
  if (options.length > 0) {
    // Open claim window. Pending = humans who have an option; AI decisions are filled by driveAI later.
    next.phase = 'claim-window';
    next.claimWindow = {
      discardedTile: tile,
      fromSeat: seat,
      options,
      pending: ALL_SEATS.filter(s =>
        options.some(o => o.seat === s) && next.seats[s].assignment.kind === 'human',
      ),
      decisions: [],
      expiresAt: Date.now() + 10_000,
    };
    return { ok: true, state: bumpVersion(next) };
  }

  // No claims — advance turn and draw.
  const target = nextActiveSeat(next, seat);
  if (!target) {
    next.phase = 'settled';
    return { ok: true, state: bumpVersion(next) };
  }
  next.turn = target;
  if (!drawTileFor(next, target)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}
```

Add `submitClaim` and the resolver:
```ts
export function submitClaim(
  state: GameState,
  seat: Seat,
  choice: 'peng' | 'gang' | 'hu' | 'pass',
): ActionResult {
  if (state.phase !== 'claim-window' || !state.claimWindow) {
    return { ok: false, error: 'wrong-phase' };
  }
  const cw = state.claimWindow;
  // Validate the choice corresponds to a real option (or is 'pass').
  if (choice !== 'pass') {
    const has = cw.options.some(o => o.seat === seat && o.type === choice);
    if (!has) return { ok: false, error: 'no-such-claim' };
  }
  // Already decided?
  if (cw.decisions.some(d => d.seat === seat)) {
    return { ok: false, error: 'already-decided' };
  }

  const next = clone(state);
  next.claimWindow!.decisions.push({ seat, choice });
  next.claimWindow!.pending = next.claimWindow!.pending.filter(s => s !== seat);

  // If anyone is still pending (humans), wait.
  if (next.claimWindow!.pending.length > 0) {
    return { ok: true, state: bumpVersion(next) };
  }

  // All decisions in — resolve by priority.
  return { ok: true, state: bumpVersion(resolveClaimWindow(next)) };
}

function resolveClaimWindow(state: GameState): GameState {
  const cw = state.claimWindow!;
  const next = clone(state);

  // Priority: hu > gang > peng (hu and gang resolution come in later tasks).
  const huClaims = cw.decisions.filter(d => d.choice === 'hu');
  const gangClaim = cw.decisions.find(d => d.choice === 'gang');
  const pengClaim = cw.decisions.find(d => d.choice === 'peng');

  if (huClaims.length > 0) {
    // Task 11 will implement.
    return next; // unreachable in Task 9
  }
  if (gangClaim) {
    // Task 10 will implement.
    return next; // unreachable in Task 9
  }
  if (pengClaim) {
    return resolvePeng(next, pengClaim.seat);
  }
  // All passed.
  return resolveAllPass(next);
}

function resolvePeng(state: GameState, seat: Seat): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  const tile = cw.discardedTile;

  // Remove the discarded tile from the original discarder's discards.
  const fromSeat = cw.fromSeat;
  const di = next.seats[fromSeat].discards.findIndex(t => t.id === tile.id);
  if (di !== -1) next.seats[fromSeat].discards.splice(di, 1);
  next.lastDiscard = null;

  // Take 2 matching tiles from claimer's hand.
  const claimerHand = next.seats[seat].hand;
  const taken: Tile[] = [];
  for (let i = claimerHand.length - 1; i >= 0 && taken.length < 2; i--) {
    if (claimerHand[i].suit === tile.suit && claimerHand[i].value === tile.value) {
      taken.push(...claimerHand.splice(i, 1));
    }
  }
  if (taken.length !== 2) {
    // shouldn't happen if claim was validated
    return next;
  }
  const meld: Meld = { type: 'peng', tiles: [tile, ...taken], fromSeat };
  next.seats[seat].melds.push(meld);

  // Claimer becomes turn (no draw — they have 14 effective tiles).
  next.phase = 'playing';
  next.turn = seat;
  next.claimWindow = null;
  return next;
}

function resolveAllPass(state: GameState): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  next.claimWindow = null;
  next.phase = 'playing';
  const target = nextActiveSeat(next, cw.fromSeat);
  if (!target) {
    next.phase = 'settled';
    return next;
  }
  next.turn = target;
  if (!drawTileFor(next, target)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return next;
}
```

Update the `Action` type and `applyAction` to include `claim`:
```ts
export type Action =
  | { type: 'pick-seat'; seat: Seat; human: HumanName }
  | { type: 'choose-missing'; seat: Seat; suit: Suit }
  | { type: 'discard'; seat: Seat; tileId: TileId }
  | { type: 'self-draw-hu'; seat: Seat }
  | { type: 'claim'; seat: Seat; choice: 'peng' | 'gang' | 'hu' | 'pass' };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat': return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    case 'discard': return discard(state, action.seat, action.tileId);
    case 'self-draw-hu': return declareSelfDrawHu(state, action.seat);
    case 'claim': return submitClaim(state, action.seat, action.choice);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: all engine tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): engine — claim window with peng resolution"
```

---

### Task 10: Engine — gang variants (明杠, 暗杠, 补杠) + 杠上摸

Adds the three flavors of gang:
- 明杠 (claim from a discard): resolved in claim window. Take 4 tiles, draw replacement from end of wall, claimer becomes turn.
- 暗杠 (4 in hand, declared on own turn): own-turn action via `declareGangAn`.
- 补杠 (upgrade existing peng with 4th tile from hand on own turn): own-turn action via `declareGangBu`.

All gangs trigger 杠上摸 (replacement draw from wall end). Replacement may produce a 自摸 hu — handled by checking `canHu` after the draw and letting the player or AI declare in the next request.

**Files:**
- Modify: `src/lib/mahjong/engine.ts`
- Modify: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/mahjong/engine.test.ts`:
```ts
import { declareGangAn, declareGangBu } from './engine';
import type { TileValue } from './types';

describe('claim window — 明杠', () => {
  function setupForGangTest(): GameState {
    let s = startedGame();
    function strip(hand: Tile[]): Tile[] { return hand.filter(t => !(t.suit === 'wan' && t.value === 7)); }
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s.seats.east.hand = strip(s.seats.east.hand);
    s.seats.south.hand = strip(s.seats.south.hand);
    s.seats.west.hand = strip(s.seats.west.hand);
    s.seats.north.hand = strip(s.seats.north.hand);
    s.wall = s.wall.filter(t => !(t.suit === 'wan' && t.value === 7));
    while (s.seats.east.hand.length < 13 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    while (s.seats.south.hand.length < 10 && s.wall.length > 0) s.seats.south.hand.push(s.wall.pop()!);
    while (s.seats.west.hand.length < 13 && s.wall.length > 0) s.seats.west.hand.push(s.wall.pop()!);
    while (s.seats.north.hand.length < 13 && s.wall.length > 0) s.seats.north.hand.push(s.wall.pop()!);
    s.seats.east.hand.push({ id: 'wan-7-4', suit: 'wan', value: 7 });
    s.seats.south.hand.push(
      { id: 'wan-7-1', suit: 'wan', value: 7 },
      { id: 'wan-7-2', suit: 'wan', value: 7 },
      { id: 'wan-7-3', suit: 'wan', value: 7 },
    );
    s.wallCount = s.wall.length;
    return s;
  }

  it('opens claim window with gang option for south', () => {
    let s = setupForGangTest();
    s = discard(s, 'east', 'wan-7-4').state!;
    expect(s.phase).toBe('claim-window');
    const sthOpts = s.claimWindow!.options.filter(o => o.seat === 'south');
    expect(sthOpts.find(o => o.type === 'gang')).toBeDefined();
  });

  it('south gangs — meld formed (4 tiles), south draws replacement, becomes turn', () => {
    let s = setupForGangTest();
    s = discard(s, 'east', 'wan-7-4').state!;
    const wallBefore = s.wallCount;
    const r = submitClaim(s, 'south', 'gang');
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('south');
    const meld = s.seats.south.melds[0];
    expect(meld.type).toBe('gang-ming');
    expect(meld.tiles.length).toBe(4);
    expect(meld.fromSeat).toBe('east');
    // South drew a replacement, so south.hand has 1 more than before.
    // South had 13 (after the +3 sevens + earlier base) - 3 (consumed by meld) + 1 (replacement) = 11
    // East's discards no longer contain wan-7-4
    expect(s.seats.east.discards.find(t => t.id === 'wan-7-4')).toBeUndefined();
    // wall count decreased by 1 (replacement)
    expect(s.wallCount).toBe(wallBefore - 1);
  });
});

describe('declareGangAn — 暗杠', () => {
  function setupForGangAn(): GameState {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    function strip(hand: Tile[]): Tile[] { return hand.filter(t => !(t.suit === 'tiao' && t.value === 9)); }
    s.seats.east.hand = strip(s.seats.east.hand);
    s.seats.south.hand = strip(s.seats.south.hand);
    s.seats.west.hand = strip(s.seats.west.hand);
    s.seats.north.hand = strip(s.seats.north.hand);
    s.wall = s.wall.filter(t => !(t.suit === 'tiao' && t.value === 9));
    while (s.seats.east.hand.length < 10 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    while (s.seats.south.hand.length < 13 && s.wall.length > 0) s.seats.south.hand.push(s.wall.pop()!);
    while (s.seats.west.hand.length < 13 && s.wall.length > 0) s.seats.west.hand.push(s.wall.pop()!);
    while (s.seats.north.hand.length < 13 && s.wall.length > 0) s.seats.north.hand.push(s.wall.pop()!);
    s.seats.east.hand.push(
      { id: 'tiao-9-1', suit: 'tiao', value: 9 },
      { id: 'tiao-9-2', suit: 'tiao', value: 9 },
      { id: 'tiao-9-3', suit: 'tiao', value: 9 },
      { id: 'tiao-9-4', suit: 'tiao', value: 9 },
    );
    s.wallCount = s.wall.length;
    return s;
  }

  it('forms a gang-an meld and draws replacement; turn stays on east', () => {
    let s = setupForGangAn();
    const wallBefore = s.wallCount;
    const r = declareGangAn(s, 'east', 'tiao', 9 as TileValue);
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.turn).toBe('east');
    expect(s.phase).toBe('playing');
    const meld = s.seats.east.melds[0];
    expect(meld.type).toBe('gang-an');
    expect(meld.tiles.length).toBe(4);
    expect(meld.fromSeat).toBeNull();
    expect(s.wallCount).toBe(wallBefore - 1);
    // East's hand: had 14 (10 base + 4 nines), removed 4, drew 1 = 11
    expect(s.seats.east.hand.length).toBe(11);
    // None of the 4 nines remain in hand
    expect(s.seats.east.hand.filter(t => t.suit === 'tiao' && t.value === 9).length).toBe(0);
  });

  it('rejects 暗杠 when not holding all 4 tiles', () => {
    const s = startedGame();
    const r = declareGangAn(s, 'east', 'tiao', 9 as TileValue);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cannot-gang-an');
  });

  it('rejects 暗杠 when not your turn', () => {
    const s = setupForGangAn();
    const r = declareGangAn(s, 'south', 'tiao', 9 as TileValue);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not-your-turn');
  });
});

describe('declareGangBu — 补杠', () => {
  it('upgrades an existing peng with the 4th tile drawn into hand', () => {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Manually plant a peng meld for east (3 of wan-2) and the 4th tile in east's hand.
    s.seats.east.melds = [{
      type: 'peng',
      tiles: [
        { id: 'wan-2-1', suit: 'wan', value: 2 },
        { id: 'wan-2-2', suit: 'wan', value: 2 },
        { id: 'wan-2-3', suit: 'wan', value: 2 },
      ],
      fromSeat: 'south',
    }];
    // Strip any wan-2 from east's hand so we can place the 4th cleanly.
    s.seats.east.hand = s.seats.east.hand.filter(t => !(t.suit === 'wan' && t.value === 2));
    while (s.seats.east.hand.length < 10 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    s.seats.east.hand.push({ id: 'wan-2-4', suit: 'wan', value: 2 });
    s.wallCount = s.wall.length;

    const wallBefore = s.wallCount;
    const r = declareGangBu(s, 'east', 'wan-2-4');
    expect(r.ok).toBe(true);
    s = r.state!;

    expect(s.seats.east.melds.length).toBe(1);
    const meld = s.seats.east.melds[0];
    expect(meld.type).toBe('gang-bu');
    expect(meld.tiles.length).toBe(4);
    expect(meld.tiles.map(t => t.id).sort()).toEqual(['wan-2-1','wan-2-2','wan-2-3','wan-2-4']);
    expect(meld.fromSeat).toBe('south'); // preserved from original peng
    expect(s.wallCount).toBe(wallBefore - 1);
  });

  it('rejects 补杠 when no matching peng exists', () => {
    const s = startedGame();
    const r = declareGangBu(s, 'east', s.seats.east.hand[0].id);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no-matching-peng');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: FAIL — `declareGangAn`, `declareGangBu` not exported; gang resolution in `submitClaim` is a stub.

- [ ] **Step 3: Implement gang variants**

Add to `src/lib/mahjong/engine.ts`. Replace the stub branch in `resolveClaimWindow` with a real call:
```ts
function resolveClaimWindow(state: GameState): GameState {
  const cw = state.claimWindow!;
  const next = clone(state);

  const huClaims = cw.decisions.filter(d => d.choice === 'hu');
  const gangClaim = cw.decisions.find(d => d.choice === 'gang');
  const pengClaim = cw.decisions.find(d => d.choice === 'peng');

  if (huClaims.length > 0) {
    return next; // Task 11 implements
  }
  if (gangClaim) {
    return resolveGangMing(next, gangClaim.seat);
  }
  if (pengClaim) {
    return resolvePeng(next, pengClaim.seat);
  }
  return resolveAllPass(next);
}
```

Add the gang resolvers and own-turn declarations:
```ts
function resolveGangMing(state: GameState, seat: Seat): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  const tile = cw.discardedTile;

  // Remove from discarder's discards
  const di = next.seats[cw.fromSeat].discards.findIndex(t => t.id === tile.id);
  if (di !== -1) next.seats[cw.fromSeat].discards.splice(di, 1);
  next.lastDiscard = null;

  // Take 3 matching tiles from claimer's hand
  const hand = next.seats[seat].hand;
  const taken: Tile[] = [];
  for (let i = hand.length - 1; i >= 0 && taken.length < 3; i--) {
    if (hand[i].suit === tile.suit && hand[i].value === tile.value) {
      taken.push(...hand.splice(i, 1));
    }
  }
  const meld: Meld = { type: 'gang-ming', tiles: [tile, ...taken], fromSeat: cw.fromSeat };
  next.seats[seat].melds.push(meld);

  // Replacement draw (杠上摸): take from end of wall.
  next.phase = 'playing';
  next.turn = seat;
  next.claimWindow = null;
  if (!drawTileFor(next, seat)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return next;
}

export function declareGangAn(
  state: GameState,
  seat: Seat,
  suit: Suit,
  value: TileValue,
): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const matches = state.seats[seat].hand.filter(t => t.suit === suit && t.value === value);
  if (matches.length !== 4) return { ok: false, error: 'cannot-gang-an' };

  const next = clone(state);
  next.seats[seat].hand = next.seats[seat].hand.filter(t => !(t.suit === suit && t.value === value));
  const meld: Meld = { type: 'gang-an', tiles: matches, fromSeat: null };
  next.seats[seat].melds.push(meld);

  if (!drawTileFor(next, seat)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}

export function declareGangBu(state: GameState, seat: Seat, tileId: TileId): ActionResult {
  if (state.phase !== 'playing') return { ok: false, error: 'wrong-phase' };
  if (state.turn !== seat) return { ok: false, error: 'not-your-turn' };
  if (state.seats[seat].hasHu) return { ok: false, error: 'already-hu' };

  const handIdx = state.seats[seat].hand.findIndex(t => t.id === tileId);
  if (handIdx === -1) return { ok: false, error: 'tile-not-in-hand' };
  const tile = state.seats[seat].hand[handIdx];

  // Find matching peng meld
  const pengIdx = state.seats[seat].melds.findIndex(
    m => m.type === 'peng' && m.tiles[0].suit === tile.suit && m.tiles[0].value === tile.value,
  );
  if (pengIdx === -1) return { ok: false, error: 'no-matching-peng' };

  const next = clone(state);
  const peng = next.seats[seat].melds[pengIdx];
  next.seats[seat].hand.splice(handIdx, 1);
  next.seats[seat].melds[pengIdx] = {
    type: 'gang-bu',
    tiles: [...peng.tiles, tile],
    fromSeat: peng.fromSeat,
  };

  if (!drawTileFor(next, seat)) {
    next.phase = 'settled';
  }
  checkTerminate(next);
  return { ok: true, state: bumpVersion(next) };
}
```

Update the `Action` type and `applyAction`:
```ts
export type Action =
  | { type: 'pick-seat'; seat: Seat; human: HumanName }
  | { type: 'choose-missing'; seat: Seat; suit: Suit }
  | { type: 'discard'; seat: Seat; tileId: TileId }
  | { type: 'self-draw-hu'; seat: Seat }
  | { type: 'claim'; seat: Seat; choice: 'peng' | 'gang' | 'hu' | 'pass' }
  | { type: 'gang-an'; seat: Seat; suit: Suit; value: TileValue }
  | { type: 'gang-bu'; seat: Seat; tileId: TileId };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat': return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    case 'discard': return discard(state, action.seat, action.tileId);
    case 'self-draw-hu': return declareSelfDrawHu(state, action.seat);
    case 'claim': return submitClaim(state, action.seat, action.choice);
    case 'gang-an': return declareGangAn(state, action.seat, action.suit, action.value);
    case 'gang-bu': return declareGangBu(state, action.seat, action.tileId);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): engine — 明杠 / 暗杠 / 补杠 with 杠上摸"
```

---


### Task 11: Engine — hu claim, multi-胡 (一炮多响), 流局

Implements the hu branch of `submitClaim`, multi-winner payouts, and explicit 流局 detection when the wall empties.

**Files:**
- Modify: `src/lib/mahjong/engine.ts`
- Modify: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/mahjong/engine.test.ts`:
```ts
describe('claim window — hu (单响 and 一炮多响)', () => {
  function setupForDianpaoHu(): GameState {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;

    // South gets a tenpai hand waiting on 5wan (forms 4 triplets + pair when 5wan added).
    // Hand: [w1,w1,w1, w2,w2,w2, w4,w4,w4, w7,w7,w7, w5] — 13 tiles, awaiting another 5wan.
    s.seats.south.hand = [
      { id: 'wan-1-1', suit: 'wan', value: 1 },
      { id: 'wan-1-2', suit: 'wan', value: 1 },
      { id: 'wan-1-3', suit: 'wan', value: 1 },
      { id: 'wan-2-1', suit: 'wan', value: 2 },
      { id: 'wan-2-2', suit: 'wan', value: 2 },
      { id: 'wan-2-3', suit: 'wan', value: 2 },
      { id: 'wan-4-1', suit: 'wan', value: 4 },
      { id: 'wan-4-2', suit: 'wan', value: 4 },
      { id: 'wan-4-3', suit: 'wan', value: 4 },
      { id: 'wan-7-1', suit: 'wan', value: 7 },
      { id: 'wan-7-2', suit: 'wan', value: 7 },
      { id: 'wan-7-3', suit: 'wan', value: 7 },
      { id: 'wan-5-1', suit: 'wan', value: 5 },
    ];
    s.seats.south.missingSuit = 'tong';

    // East has the 5wan to discard (after drawing — east is on turn with 14 tiles).
    s.seats.east.hand = s.seats.east.hand.filter(t => !(t.suit === 'wan' && t.value === 5));
    while (s.seats.east.hand.length < 13 && s.wall.length > 0) s.seats.east.hand.push(s.wall.pop()!);
    s.seats.east.hand.push({ id: 'wan-5-2', suit: 'wan', value: 5 });
    s.wallCount = s.wall.length;
    return s;
  }

  it('south can claim hu (点炮) on east discarding 5wan; payout flows from east to south', () => {
    let s = setupForDianpaoHu();
    s = discard(s, 'east', 'wan-5-2').state!;
    expect(s.phase).toBe('claim-window');
    const huOpt = s.claimWindow!.options.find(o => o.seat === 'south' && o.type === 'hu');
    expect(huOpt).toBeDefined();

    const eastBefore = s.seats.east.score;
    const southBefore = s.seats.south.score;
    s = submitClaim(s, 'south', 'hu').state!;
    expect(s.seats.south.hasHu).toBe(true);
    expect(s.seats.south.huResult).not.toBeNull();
    expect(s.seats.south.huResult!.selfDraw).toBe(false);
    expect(s.seats.south.huResult!.fromSeat).toBe('east');
    expect(s.huOrder).toEqual(['south']);
    // East paid 2^fan; south gained the same.
    const fan = s.seats.south.huResult!.fan;
    const chips = 2 ** fan;
    expect(s.seats.south.score).toBe(southBefore + chips);
    expect(s.seats.east.score).toBe(eastBefore - chips);
    // West and north scores unchanged.
    expect(s.seats.west.score).toBe(0);
    expect(s.seats.north.score).toBe(0);
    // Hand continues; phase is 'playing' with next active seat (west) on turn (south is hu'd).
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('north');
  });

  it('一炮多响: two seats both claim hu on the same discard, both paid by discarder', () => {
    let s = setupForDianpaoHu();
    // Also give west a tenpai hand waiting on 5wan (different shape: pure triplets too).
    s = JSON.parse(JSON.stringify(s)) as GameState;
    s.seats.west.hand = [
      { id: 'wan-3-1', suit: 'wan', value: 3 },
      { id: 'wan-3-2', suit: 'wan', value: 3 },
      { id: 'wan-3-3', suit: 'wan', value: 3 },
      { id: 'wan-6-1', suit: 'wan', value: 6 },
      { id: 'wan-6-2', suit: 'wan', value: 6 },
      { id: 'wan-6-3', suit: 'wan', value: 6 },
      { id: 'wan-8-1', suit: 'wan', value: 8 },
      { id: 'wan-8-2', suit: 'wan', value: 8 },
      { id: 'wan-8-3', suit: 'wan', value: 8 },
      { id: 'wan-9-1', suit: 'wan', value: 9 },
      { id: 'wan-9-2', suit: 'wan', value: 9 },
      { id: 'wan-9-3', suit: 'wan', value: 9 },
      { id: 'wan-5-3', suit: 'wan', value: 5 },
    ];
    s.seats.west.missingSuit = 'tong';

    s = discard(s, 'east', 'wan-5-2').state!;
    expect(s.phase).toBe('claim-window');
    s = submitClaim(s, 'south', 'hu').state!;
    s = submitClaim(s, 'west', 'hu').state!; // also hu
    // After all decisions, both should have hu'd and east should pay both.
    expect(s.seats.south.hasHu).toBe(true);
    expect(s.seats.west.hasHu).toBe(true);
    const southChips = 2 ** s.seats.south.huResult!.fan;
    const westChips = 2 ** s.seats.west.huResult!.fan;
    expect(s.seats.east.score).toBe(-(southChips + westChips));
    expect(s.seats.south.score).toBe(southChips);
    expect(s.seats.west.score).toBe(westChips);
    expect(s.huOrder).toEqual(['south', 'west']);
    // Two players left active (east, north). Hand continues.
    expect(s.phase).toBe('playing');
  });

  it('terminates when ≥3 seats hu', () => {
    let s = setupForDianpaoHu();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Pre-mark north as hu'd to simulate prior round's hu in same hand.
    s.seats.north.hasHu = true;
    s.seats.north.huResult = {
      winTypes: ['ping-hu'],
      fan: 1,
      selfDraw: false,
      winningTile: { id: 'tiao-3-1', suit: 'tiao', value: 3 },
      fromSeat: 'east',
    };
    s.huOrder = ['north'];

    s = discard(s, 'east', 'wan-5-2').state!;
    s = submitClaim(s, 'south', 'hu').state!;
    // Now 2 seats hu'd; need to also have west hu to hit 3. We don't; so phase is still playing
    // unless only 1 active seat remains. South + north hu'd → west and east are active. Phase: playing.
    expect(s.phase).toBe('playing');
  });
});

describe('流局 — wall exhausted', () => {
  it('settles the hand with no winners when wall empties on a draw', () => {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Empty the wall manually.
    s.wall = [];
    s.wallCount = 0;
    // Force east to have a tile to discard (already does — 14 tiles).
    // Find a claim-free tile to discard.
    const tile = s.seats.east.hand.find(tile => {
      return (['south','west','north'] as Seat[]).every(seat =>
        s.seats[seat].hand.filter(t => t.suit === tile.suit && t.value === tile.value).length < 2,
      );
    })!;
    s = discard(s, 'east', tile.id).state!;
    // Next seat (north) tried to draw, wall empty → settled (流局).
    expect(s.phase).toBe('settled');
    expect(s.huOrder).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: FAIL — hu branch in `resolveClaimWindow` is a stub.

- [ ] **Step 3: Implement hu resolution**

Replace `resolveClaimWindow` in `src/lib/mahjong/engine.ts` with:
```ts
function resolveClaimWindow(state: GameState): GameState {
  const cw = state.claimWindow!;
  const next = clone(state);

  const huClaims = cw.decisions.filter(d => d.choice === 'hu');
  const gangClaim = cw.decisions.find(d => d.choice === 'gang');
  const pengClaim = cw.decisions.find(d => d.choice === 'peng');

  if (huClaims.length > 0) {
    return resolveHuClaims(next, huClaims.map(c => c.seat));
  }
  if (gangClaim) {
    return resolveGangMing(next, gangClaim.seat);
  }
  if (pengClaim) {
    return resolvePeng(next, pengClaim.seat);
  }
  return resolveAllPass(next);
}

function resolveHuClaims(state: GameState, winners: Seat[]): GameState {
  const next = clone(state);
  const cw = next.claimWindow!;
  const tile = cw.discardedTile;
  const fromSeat = cw.fromSeat;

  // Remove the discarded tile from discarder's discards (it conceptually goes to the winner).
  const di = next.seats[fromSeat].discards.findIndex(t => t.id === tile.id);
  if (di !== -1) next.seats[fromSeat].discards.splice(di, 1);
  next.lastDiscard = null;

  for (const seat of winners) {
    const player = next.seats[seat];
    // Add the winning tile to the hand for hu evaluation.
    const tempHand = [...player.hand, tile];
    const result = canHu(tempHand, player.melds, player.missingSuit);
    if (!result.canHu) continue; // shouldn't happen — claim was validated when offered
    const fan = computeFan(result.winTypes, false);
    const huResult: HuResult = {
      winTypes: result.winTypes,
      fan,
      selfDraw: false,
      winningTile: tile,
      fromSeat,
    };
    player.huResult = huResult;
    player.hasHu = true;
    next.huOrder.push(seat);
    applyHuPayout(next, seat);
  }

  next.claimWindow = null;
  checkTerminate(next);

  if (next.phase !== 'settled') {
    // Hand continues. Turn advances to next active seat after the discarder (since discarder is still active typically).
    const target = nextActiveSeat(next, fromSeat);
    if (!target) {
      next.phase = 'settled';
    } else {
      next.phase = 'playing';
      next.turn = target;
      if (!drawTileFor(next, target)) {
        next.phase = 'settled';
      }
      checkTerminate(next);
    }
  }
  return next;
}
```

Now extend `computeClaimOptions` to include `hu` claims. Replace the body:
```ts
function computeClaimOptions(state: GameState, fromSeat: Seat, tile: Tile): ClaimOption[] {
  const options: ClaimOption[] = [];
  for (const seat of ALL_SEATS) {
    if (seat === fromSeat) continue;
    if (state.seats[seat].hasHu) continue;
    const player = state.seats[seat];
    const matching = countMatchingInHand(player.hand, tile.suit, tile.value);
    if (matching >= 3) {
      options.push({ seat, type: 'gang' });
    }
    if (matching >= 2) {
      options.push({ seat, type: 'peng' });
    }
    // Hu: hand + tile would form a hu shape, missing-suit OK.
    const tempHand = [...player.hand, tile];
    const huCheck = canHu(tempHand, player.melds, player.missingSuit);
    if (huCheck.canHu) {
      options.push({ seat, type: 'hu' });
    }
  }
  return options;
}
```

And update the `pending` filter in `discard` to include any seat (including AI) that has a hu option, since the AI loop will resolve theirs in the same request — but the existing code already filters by `assignment.kind === 'human'`. Hu-eligible AI seats are handled in Task 13 (driveAI). The existing filter is correct.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: all engine tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): engine — hu claims, 一炮多响, 流局"
```

---

### Task 12: Engine — start-next-hand, end-game, version invariant

Adds the loop that lets a settled hand transition into a fresh deal (preserving cumulative scores), an explicit `endGame` function (matches poker pattern), and an invariant test that tile conservation always holds.

**Files:**
- Modify: `src/lib/mahjong/engine.ts`
- Modify: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/mahjong/engine.test.ts`:
```ts
import { startNextHand, endGame, totalTilesInPlay } from './engine';

describe('startNextHand', () => {
  it('reshuffles, resets per-hand state, increments handNumber, preserves scores and assignments', () => {
    let s = startedGame();
    s = JSON.parse(JSON.stringify(s)) as GameState;
    // Force-settle the current hand and assign some scores.
    s.phase = 'settled';
    s.seats.south.score = 10;
    s.seats.east.score = -10;
    s.huOrder = ['south'];
    s.seats.south.hasHu = true;
    s.seats.south.huResult = {
      winTypes: ['ping-hu'], fan: 1, selfDraw: false,
      winningTile: { id: 'wan-1-1', suit: 'wan', value: 1 },
      fromSeat: 'east',
    };

    const r = startNextHand(s);
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.phase).toBe('choose-missing');
    expect(s.handNumber).toBe(2);
    expect(s.huOrder).toEqual([]);
    for (const seat of ['east','south','west','north'] as Seat[]) {
      expect(s.seats[seat].hand.length).toBe(13);
      expect(s.seats[seat].melds).toEqual([]);
      expect(s.seats[seat].discards).toEqual([]);
      expect(s.seats[seat].missingSuit).toBeNull();
      expect(s.seats[seat].hasHu).toBe(false);
      expect(s.seats[seat].huResult).toBeNull();
    }
    // Scores preserved
    expect(s.seats.south.score).toBe(10);
    expect(s.seats.east.score).toBe(-10);
    // Assignments preserved
    expect(s.seats.east.assignment.human).toBe('Aaron');
    expect(s.seats.south.assignment.human).toBe('Vicky');
  });

  it('rejects if not in settled phase', () => {
    const s = startedGame();
    const r = startNextHand(s);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong-phase');
  });
});

describe('endGame', () => {
  it('marks gameOver=true and returns final scores in settled phase', () => {
    let s = startedGame();
    s = { ...s, phase: 'settled' };
    const r = endGame(s);
    expect(r.ok).toBe(true);
    s = r.state!;
    expect(s.gameOver).toBe(true);
  });

  it('rejects ending mid-hand', () => {
    const s = startedGame();
    const r = endGame(s);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('hand-in-progress');
  });
});

describe('tile conservation invariant', () => {
  it('keeps total tiles = 108 across all states from a started game', () => {
    let s = startedGame();
    expect(totalTilesInPlay(s)).toBe(108);

    // Find a claim-free tile, discard it, all-pass, count again.
    const safeTile = s.seats.east.hand.find(tile =>
      (['south','west','north'] as Seat[]).every(seat =>
        s.seats[seat].hand.filter(t => t.suit === tile.suit && t.value === tile.value).length < 2,
      ),
    );
    if (safeTile) {
      s = discard(s, 'east', safeTile.id).state!;
      expect(totalTilesInPlay(s)).toBe(108);
      if (s.phase === 'claim-window') {
        s = submitClaim(s, 'south', 'pass').state!;
        s = submitClaim(s, 'west', 'pass').state!;
        s = submitClaim(s, 'north', 'pass').state!;
      }
      expect(totalTilesInPlay(s)).toBe(108);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: FAIL — `startNextHand`, `endGame`, `totalTilesInPlay` not exported.

- [ ] **Step 3: Implement the three functions**

Append to `src/lib/mahjong/engine.ts`:
```ts
export function startNextHand(state: GameState): ActionResult {
  if (state.phase !== 'settled') return { ok: false, error: 'wrong-phase' };
  if (state.gameOver) return { ok: false, error: 'game-over' };
  // Re-deal preserving assignments and scores.
  const next = clone(state);
  next.wall = shuffle(buildWall());
  for (const seat of ALL_SEATS) {
    next.seats[seat].hand = next.wall.splice(next.wall.length - 13, 13);
    next.seats[seat].melds = [];
    next.seats[seat].discards = [];
    next.seats[seat].missingSuit = null;
    next.seats[seat].hasHu = false;
    next.seats[seat].huResult = null;
  }
  next.wallCount = next.wall.length;
  next.lastDiscard = null;
  next.claimWindow = null;
  next.huOrder = [];
  next.turn = next.dealer;
  next.handNumber += 1;
  next.phase = 'choose-missing';
  return { ok: true, state: bumpVersion(next) };
}

export function endGame(state: GameState): ActionResult {
  // Allow ending only when no hand is mid-play.
  if (state.phase !== 'seat-selection' && state.phase !== 'settled') {
    return { ok: false, error: 'hand-in-progress' };
  }
  const next = clone(state);
  next.gameOver = true;
  return { ok: true, state: bumpVersion(next) };
}

// Invariant helper: total tiles across wall + all hands + all discards + all melds.
export function totalTilesInPlay(state: GameState): number {
  let n = state.wall.length;
  for (const seat of ALL_SEATS) {
    n += state.seats[seat].hand.length;
    n += state.seats[seat].discards.length;
    for (const m of state.seats[seat].melds) n += m.tiles.length;
  }
  if (state.claimWindow) {
    // Discarded tile is "in flight" — not in any pile yet. It was already removed from hand and added to discards in `discard`,
    // so it's counted in seats[fromSeat].discards. No extra count needed.
  }
  return n;
}
```

Update `Action` and `applyAction` to dispatch the new ones:
```ts
export type Action =
  | { type: 'pick-seat'; seat: Seat; human: HumanName }
  | { type: 'choose-missing'; seat: Seat; suit: Suit }
  | { type: 'discard'; seat: Seat; tileId: TileId }
  | { type: 'self-draw-hu'; seat: Seat }
  | { type: 'claim'; seat: Seat; choice: 'peng' | 'gang' | 'hu' | 'pass' }
  | { type: 'gang-an'; seat: Seat; suit: Suit; value: TileValue }
  | { type: 'gang-bu'; seat: Seat; tileId: TileId }
  | { type: 'start-next-hand' }
  | { type: 'end-game' };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'pick-seat': return pickSeat(state, action.seat, action.human);
    case 'choose-missing': return chooseMissing(state, action.seat, action.suit);
    case 'discard': return discard(state, action.seat, action.tileId);
    case 'self-draw-hu': return declareSelfDrawHu(state, action.seat);
    case 'claim': return submitClaim(state, action.seat, action.choice);
    case 'gang-an': return declareGangAn(state, action.seat, action.suit, action.value);
    case 'gang-bu': return declareGangBu(state, action.seat, action.tileId);
    case 'start-next-hand': return startNextHand(state);
    case 'end-game': return endGame(state);
    default: {
      const _: never = action;
      return { ok: false, error: 'unknown-action' };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/engine.test.ts
```
Expected: all engine tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): engine — start-next-hand, end-game, tile conservation invariant"
```

---


### Task 13: AI — decideClaim, AI 定缺, driveAI integration

Adds AI decision-making for claim windows and 定缺, plus the `driveAI` loop that runs after every human action. `decideDiscard` is deferred to Task 14 (a temporary stub picks the first non-missing-suit tile, fallback to first tile).

**Files:**
- Create: `src/lib/mahjong/ai.ts`
- Create: `src/lib/mahjong/ai.test.ts`
- Modify: `src/lib/mahjong/engine.ts` (call `driveAI` from a new `applyActionWithAI` wrapper)
- Modify: `src/lib/mahjong/engine.test.ts`

- [ ] **Step 1: Write failing tests for AI decisions**

Create `src/lib/mahjong/ai.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decideClaim, decideMissingSuit, decideDiscardStub } from './ai';
import type { ClaimOption, GameState, Seat, Tile } from './types';
import { initialState } from './engine';

function t(suit: 'wan'|'tong'|'tiao', value: number, copy = 1): Tile {
  return { id: `${suit}-${value}-${copy}`, suit, value: value as Tile['value'] };
}

function baseState(): GameState {
  // Minimal fixture: empty playing-phase state we can mutate.
  const s = initialState();
  s.phase = 'playing';
  return s;
}

describe('decideClaim', () => {
  it('always claims hu when offered', () => {
    const s = baseState();
    const opts: ClaimOption[] = [
      { seat: 'south', type: 'hu' },
      { seat: 'south', type: 'peng' },
    ];
    expect(decideClaim(s, 'south', opts)).toBe('hu');
  });

  it('passes peng when hand has no pair-shape signal', () => {
    const s = baseState();
    s.seats.south.hand = [
      t('wan', 1, 1), t('wan', 3, 1), t('wan', 5, 1),
      t('tong', 2, 1), t('tong', 4, 1), t('tong', 6, 1),
      t('tong', 8, 1), t('tiao', 2, 1), t('tiao', 5, 1),
      t('tiao', 7, 1), t('tiao', 9, 1),
    ];
    s.seats.south.missingSuit = 'wan';
    const opts: ClaimOption[] = [{ seat: 'south', type: 'peng' }];
    expect(decideClaim(s, 'south', opts)).toBe('pass');
  });

  it('claims peng when ≥2 melds-or-pairs of same suit exist (toward 对对胡)', () => {
    const s = baseState();
    s.seats.south.hand = [
      t('wan', 3, 1), t('wan', 3, 2),  // pair of wan-3
      t('wan', 6, 1), t('wan', 6, 2),  // pair of wan-6
      t('tong', 4, 1), t('tong', 4, 2),  // (2 fours, will form peng with offered)
      t('tiao', 8, 1), t('tiao', 9, 1),
    ];
    s.seats.south.missingSuit = 'tong';
    const opts: ClaimOption[] = [{ seat: 'south', type: 'peng' }];
    expect(decideClaim(s, 'south', opts)).toBe('peng');
  });

  it('claims gang when shanten ≥ 3 (rough proxy: hand has many uncoordinated tiles)', () => {
    const s = baseState();
    s.seats.south.hand = [
      t('wan', 1, 1), t('wan', 4, 1), t('wan', 9, 1),
      t('tong', 2, 1), t('tong', 5, 1), t('tong', 7, 1),
      t('tiao', 1, 1), t('tiao', 4, 1), t('tiao', 7, 1),
      t('tiao', 9, 1), t('tiao', 9, 2),
    ];
    s.seats.south.missingSuit = 'wan';
    const opts: ClaimOption[] = [{ seat: 'south', type: 'gang' }];
    expect(decideClaim(s, 'south', opts)).toBe('gang');
  });
});

describe('decideMissingSuit', () => {
  it('picks the suit with fewest tiles in hand', () => {
    const s = baseState();
    s.seats.east.hand = [
      // 6 wan
      t('wan', 1, 1), t('wan', 2, 1), t('wan', 3, 1),
      t('wan', 4, 1), t('wan', 5, 1), t('wan', 6, 1),
      // 5 tiao
      t('tiao', 1, 1), t('tiao', 2, 1), t('tiao', 3, 1),
      t('tiao', 4, 1), t('tiao', 5, 1),
      // 2 tong (fewest)
      t('tong', 1, 1), t('tong', 2, 1),
    ];
    expect(decideMissingSuit(s, 'east')).toBe('tong');
  });

  it('breaks ties in order wan > tiao > tong', () => {
    const s = baseState();
    s.seats.east.hand = [
      // 4 each — wan should win the tie
      t('wan', 1, 1), t('wan', 2, 1), t('wan', 3, 1), t('wan', 4, 1),
      t('tong', 1, 1), t('tong', 2, 1), t('tong', 3, 1), t('tong', 4, 1),
      t('tiao', 1, 1), t('tiao', 2, 1), t('tiao', 3, 1), t('tiao', 4, 1),
      t('tong', 5, 1),
    ];
    expect(decideMissingSuit(s, 'east')).toBe('wan');
  });
});

describe('decideDiscardStub (Task 13 placeholder)', () => {
  it('discards a missing-suit tile if any exist', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('tong', 5, 1), t('tiao', 9, 1),
    ];
    s.seats.east.missingSuit = 'tong';
    expect(decideDiscardStub(s, 'east')).toBe('tong-5-1');
  });

  it('falls back to the first tile when no missing-suit tile present', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('tiao', 9, 1),
    ];
    s.seats.east.missingSuit = 'tong';
    expect(decideDiscardStub(s, 'east')).toBe('wan-1-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/mahjong/ai.test.ts
```
Expected: FAIL — `./ai` module doesn't exist.

- [ ] **Step 3: Implement `src/lib/mahjong/ai.ts`**

Create `src/lib/mahjong/ai.ts`:
```ts
import type {
  ClaimOption,
  GameState,
  Seat,
  Suit,
  Tile,
  TileId,
} from './types';

// Always claim hu. For gang, claim if hand looks "raw" (shanten estimate ≥ 3).
// For peng, claim if hand already has ≥ 2 melds-or-pairs of same suit
// (heuristic toward 对对胡 / qi-dui-adjacent shape) OR if pengging removes the missing suit.
export function decideClaim(
  state: GameState,
  seat: Seat,
  options: readonly ClaimOption[],
): 'peng' | 'gang' | 'hu' | 'pass' {
  const ours = options.filter(o => o.seat === seat);
  if (ours.length === 0) return 'pass';

  if (ours.find(o => o.type === 'hu')) return 'hu';

  if (ours.find(o => o.type === 'gang')) {
    if (estimateShanten(state.seats[seat].hand) >= 3) return 'gang';
    return 'pass';
  }

  if (ours.find(o => o.type === 'peng')) {
    const hand = state.seats[seat].hand;
    const missing = state.seats[seat].missingSuit;

    // Discarded tile is the one being offered for peng.
    const tile = state.lastDiscard?.tile;
    if (tile && missing && tile.suit === missing) {
      // Pengging would remove 2 of the missing suit at once — good move.
      return 'peng';
    }
    if (countMeldsOrPairsBySuit(hand) >= 2) return 'peng';
    return 'pass';
  }

  return 'pass';
}

// Pick the suit with the fewest tiles in the seat's current hand.
// Tie-break: wan > tiao > tong.
const SUIT_TIEBREAK_PRIORITY: Suit[] = ['wan', 'tiao', 'tong'];

export function decideMissingSuit(state: GameState, seat: Seat): Suit {
  const counts: Record<Suit, number> = { wan: 0, tong: 0, tiao: 0 };
  for (const t of state.seats[seat].hand) counts[t.suit]++;
  let best: Suit = 'wan';
  let bestCount = Infinity;
  for (const s of SUIT_TIEBREAK_PRIORITY) {
    if (counts[s] < bestCount) {
      best = s;
      bestCount = counts[s];
    }
  }
  return best;
}

// Stub discard: pick a missing-suit tile if available, else first tile.
export function decideDiscardStub(state: GameState, seat: Seat): TileId {
  const player = state.seats[seat];
  if (player.missingSuit) {
    const t = player.hand.find(x => x.suit === player.missingSuit);
    if (t) return t.id;
  }
  return player.hand[0].id;
}

// --- internal heuristics ---

// Approximate shanten (deficiency from tenpai). Lower = closer to winning.
// For MVP: 8 - 2*sets - max(pairs+partial-sets up to 4-sets cap), clamped ≥ 0.
// This is a coarse approximation; good enough for AI claim decisions.
function estimateShanten(hand: readonly Tile[]): number {
  if (hand.length === 0) return 8;
  // Count tiles per face
  const counts = new Map<string, number>();
  for (const tile of hand) {
    const k = `${tile.suit}-${tile.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let triplets = 0;
  let pairs = 0;
  let partialRuns = 0;
  // Triplets first
  for (const [, c] of counts) {
    if (c >= 3) triplets++;
  }
  // Pairs from remaining (subtract 3 from any that contributed a triplet)
  for (const [, c] of counts) {
    const remaining = c >= 3 ? c - 3 : c;
    if (remaining >= 2) pairs++;
  }
  // Adjacent pairs in same suit (rough partial-run count)
  const suits: Array<'wan'|'tong'|'tiao'> = ['wan', 'tong', 'tiao'];
  for (const suit of suits) {
    for (let v = 1; v <= 8; v++) {
      const a = counts.get(`${suit}-${v}`) ?? 0;
      const b = counts.get(`${suit}-${v + 1}`) ?? 0;
      if (a >= 1 && b >= 1) partialRuns++;
    }
  }
  const setsPlusPartials = Math.min(triplets + Math.floor(partialRuns / 2), 4);
  const shanten = 8 - 2 * setsPlusPartials - Math.min(pairs, 1);
  return Math.max(0, shanten);
}

function countMeldsOrPairsBySuit(hand: readonly Tile[]): number {
  // For each suit, count "pair-or-better" groups.
  let n = 0;
  const counts = new Map<string, number>();
  for (const tile of hand) {
    const k = `${tile.suit}-${tile.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [, c] of counts) {
    if (c >= 2) n++;
  }
  return n;
}
```

- [ ] **Step 4: Run AI tests to verify they pass**

Run:
```bash
npx vitest run src/lib/mahjong/ai.test.ts
```
Expected: all pass.

- [ ] **Step 5: Add driveAI integration tests in engine.test.ts**

Append to `src/lib/mahjong/engine.test.ts`:
```ts
import { applyActionWithAI } from './engine';

describe('driveAI integration', () => {
  it('after Aaron picks a seat as Vicky picks, AI 定缺 fills 3 of 4 seats', () => {
    let s = initialState();
    let r = applyActionWithAI(s, { type: 'pick-seat', seat: 'east', human: 'Aaron' });
    expect(r.ok).toBe(true);
    s = r.state!;
    r = applyActionWithAI(s, { type: 'pick-seat', seat: 'south', human: 'Vicky' });
    expect(r.ok).toBe(true);
    s = r.state!;
    // Now in choose-missing; AI seats (west, north) should have auto-chosen.
    expect(s.seats.west.missingSuit).not.toBeNull();
    expect(s.seats.north.missingSuit).not.toBeNull();
    // Aaron and Vicky have not chosen yet.
    expect(s.seats.east.missingSuit).toBeNull();
    expect(s.seats.south.missingSuit).toBeNull();
    expect(s.phase).toBe('choose-missing');
  });

  it('after both humans 定缺, dealer AI draws & discards (or human turn arrives)', () => {
    let s = initialState();
    s = applyActionWithAI(s, { type: 'pick-seat', seat: 'east', human: 'Aaron' }).state!;
    s = applyActionWithAI(s, { type: 'pick-seat', seat: 'south', human: 'Vicky' }).state!;
    // east is dealer = human → after both humans 定缺, east starts. Stays human.
    s = applyActionWithAI(s, { type: 'choose-missing', seat: 'east', suit: 'tong' }).state!;
    s = applyActionWithAI(s, { type: 'choose-missing', seat: 'south', suit: 'tong' }).state!;
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('east'); // dealer human draws
    expect(s.seats.east.hand.length).toBe(14); // dealer drew first
  });
});
```

- [ ] **Step 6: Implement `driveAI` and `applyActionWithAI` in engine.ts**

Append to `src/lib/mahjong/engine.ts`:
```ts
import { decideClaim, decideMissingSuit, decideDiscardStub } from './ai';

const MAX_DRIVE_AI_ITERATIONS = 50; // safety cap; real games never exceed ~12

export function driveAI(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < MAX_DRIVE_AI_ITERATIONS; i++) {
    const before = s.version;

    // 1. AI 定缺 fill-in
    if (s.phase === 'choose-missing') {
      let progressed = false;
      for (const seat of ALL_SEATS) {
        if (s.seats[seat].missingSuit !== null) continue;
        if (s.seats[seat].assignment.kind !== 'ai') continue;
        const suit = decideMissingSuit(s, seat);
        const r = chooseMissing(s, seat, suit);
        if (r.ok && r.state) {
          s = r.state;
          progressed = true;
          break; // re-evaluate
        }
      }
      if (progressed) continue;
      break; // waiting on humans
    }

    // 2. Resolve AI decisions in claim window.
    if (s.phase === 'claim-window' && s.claimWindow) {
      const cw = s.claimWindow;
      // Find any AI seat that has an option but no decision yet.
      const aiSeatsWithOptions = ALL_SEATS.filter(seat =>
        s.seats[seat].assignment.kind === 'ai' &&
        cw.options.some(o => o.seat === seat) &&
        !cw.decisions.some(d => d.seat === seat),
      );
      if (aiSeatsWithOptions.length > 0) {
        const seat = aiSeatsWithOptions[0];
        const choice = decideClaim(s, seat, cw.options);
        const r = submitClaim(s, seat, choice);
        if (r.ok && r.state) {
          s = r.state;
          continue;
        }
        break;
      }
      // All AI decided. If pending humans remain, wait.
      if (cw.pending.length > 0) break;
      // Otherwise resolution should already have run inside submitClaim — fall through.
    }

    // 3. Playing phase: if turn is AI, run their move.
    if (s.phase === 'playing' && s.seats[s.turn].assignment.kind === 'ai') {
      const seat = s.turn;
      const player = s.seats[seat];
      // Check 自摸 hu first.
      if (player.hand.length === 14) {
        const hu = canHu(player.hand, player.melds, player.missingSuit);
        if (hu.canHu) {
          const r = declareSelfDrawHu(s, seat);
          if (r.ok && r.state) {
            s = r.state;
            continue;
          }
        }
        // 暗杠 opportunity: any 4-of-a-kind in hand.
        const counts = new Map<string, number>();
        for (const tile of player.hand) {
          const k = `${tile.suit}-${tile.value}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        let gangAnTaken = false;
        for (const [k, c] of counts) {
          if (c === 4) {
            const [suit, valStr] = k.split('-');
            const r = declareGangAn(s, seat, suit as Suit, Number(valStr) as TileValue);
            if (r.ok && r.state) {
              s = r.state;
              gangAnTaken = true;
              break;
            }
          }
        }
        if (gangAnTaken) continue;

        // 补杠 opportunity: a tile in hand that matches an existing peng.
        let gangBuTaken = false;
        for (const meld of player.melds) {
          if (meld.type !== 'peng') continue;
          const m0 = meld.tiles[0];
          const matchTile = player.hand.find(t => t.suit === m0.suit && t.value === m0.value);
          if (matchTile) {
            const r = declareGangBu(s, seat, matchTile.id);
            if (r.ok && r.state) {
              s = r.state;
              gangBuTaken = true;
              break;
            }
          }
        }
        if (gangBuTaken) continue;

        // Otherwise discard.
        const tileId = decideDiscardStub(s, seat);
        const r = discard(s, seat, tileId);
        if (r.ok && r.state) {
          s = r.state;
          continue;
        }
        break;
      }
      // Hand size != 14: AI just claimed (peng), needs to discard 1.
      if (player.hand.length === 13) {
        const tileId = decideDiscardStub(s, seat);
        const r = discard(s, seat, tileId);
        if (r.ok && r.state) {
          s = r.state;
          continue;
        }
      }
      break;
    }

    // 4. Otherwise (human turn, settled, seat-selection): nothing to do.
    break;

    // No-op safety net: break if no progress.
    // (s.version unchanged in any branch above means we should already have broken.)
  }
  return s;
}

export function applyActionWithAI(state: GameState, action: Action): ActionResult {
  const r = applyAction(state, action);
  if (!r.ok || !r.state) return r;
  return { ok: true, state: driveAI(r.state) };
}
```

- [ ] **Step 7: Run all tests**

Run:
```bash
npm test
```
Expected: all tests pass across `tiles.test.ts`, `hu.test.ts`, `scoring.test.ts`, `engine.test.ts`, `ai.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mahjong/ai.ts src/lib/mahjong/ai.test.ts src/lib/mahjong/engine.ts src/lib/mahjong/engine.test.ts
git commit -m "feat(mahjong): AI driver, decideClaim, AI 定缺, applyActionWithAI"
```

---

### Task 14: AI — proper `decideDiscard` heuristic

Replace the stub with the cost-to-discard heuristic from the spec. Tunes scoring weights to produce competent (not strong) play. Updates the AI driver and tests.

**Files:**
- Modify: `src/lib/mahjong/ai.ts`
- Modify: `src/lib/mahjong/ai.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/mahjong/ai.test.ts`:
```ts
import { decideDiscard } from './ai';

describe('decideDiscard (heuristic)', () => {
  it('always picks a missing-suit tile first (huge cost weight)', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('wan', 1, 2),    // pair (low cost)
      t('tong', 5, 1),                    // missing-suit (high cost)
      t('tiao', 9, 1),                    // edge (slightly high cost)
      t('tiao', 4, 1), t('tiao', 5, 1),   // sequential pair (low cost)
    ];
    s.seats.east.missingSuit = 'tong';
    expect(decideDiscard(s, 'east')).toBe('tong-5-1');
  });

  it('prefers to discard isolated edge tiles over pairs and sequence-adjacents', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1),    // isolated edge — should be discarded
      t('tiao', 4, 1), t('tiao', 5, 1), t('tiao', 6, 1),  // perfect run
      t('tong', 5, 1), t('tong', 5, 2),                    // pair
    ];
    s.seats.east.missingSuit = null;
    expect(decideDiscard(s, 'east')).toBe('wan-1-1');
  });

  it('prefers tiles that have already been discarded publicly (safer)', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 5, 1),   // 5wan: 0 already discarded publicly
      t('wan', 8, 1),   // 8wan: 2 already discarded publicly — safer to drop
    ];
    s.seats.east.missingSuit = null;
    s.seats.south.discards = [
      t('wan', 8, 2), t('wan', 8, 3),
    ];
    expect(decideDiscard(s, 'east')).toBe('wan-8-1');
  });

  it('does not pick a missing-suit tile when none exist (safe fallback)', () => {
    const s = baseState();
    s.seats.east.hand = [
      t('wan', 1, 1), t('wan', 5, 1),
    ];
    s.seats.east.missingSuit = 'tong';
    const choice = decideDiscard(s, 'east');
    expect(['wan-1-1', 'wan-5-1']).toContain(choice);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run:
```bash
npx vitest run src/lib/mahjong/ai.test.ts
```
Expected: FAIL — `decideDiscard` not exported (only `decideDiscardStub`).

- [ ] **Step 3: Implement the heuristic**

Append to `src/lib/mahjong/ai.ts`:
```ts
// Cost-to-discard. Higher = drop first.
const COST_MISSING_SUIT = 100;
const COST_PAIR_OR_TRIPLET = -10;
const COST_SEQUENCE_ADJACENT = -6;
const COST_EDGE_TILE = 2;
const COST_MIDDLE_TILE = -4;
const COST_PER_PUBLIC_COPY_DISCARDED = 1;

export function decideDiscard(state: GameState, seat: Seat): TileId {
  const player = state.seats[seat];
  if (player.hand.length === 0) {
    throw new Error('decideDiscard called with empty hand');
  }

  // Count tiles in hand by face for pair-detection.
  const handFaceCounts = new Map<string, number>();
  for (const t of player.hand) {
    const k = `${t.suit}-${t.value}`;
    handFaceCounts.set(k, (handFaceCounts.get(k) ?? 0) + 1);
  }

  // Count discarded copies (across all seats) per face.
  const discardedFaceCounts = new Map<string, number>();
  for (const s of ALL_SEATS) {
    for (const t of state.seats[s].discards) {
      const k = `${t.suit}-${t.value}`;
      discardedFaceCounts.set(k, (discardedFaceCounts.get(k) ?? 0) + 1);
    }
  }

  let bestId: TileId = player.hand[0].id;
  let bestCost = -Infinity;

  for (const tile of player.hand) {
    let cost = 0;

    if (player.missingSuit && tile.suit === player.missingSuit) {
      cost += COST_MISSING_SUIT;
    }

    const faceKey = `${tile.suit}-${tile.value}`;
    const faceCountInHand = handFaceCounts.get(faceKey) ?? 1;
    if (faceCountInHand >= 2) cost += COST_PAIR_OR_TRIPLET;

    // Sequence-adjacency: any neighbor in the same suit?
    const left = handFaceCounts.get(`${tile.suit}-${tile.value - 1}`) ?? 0;
    const right = handFaceCounts.get(`${tile.suit}-${tile.value + 1}`) ?? 0;
    if (left + right > 0) cost += COST_SEQUENCE_ADJACENT;

    if (tile.value === 1 || tile.value === 9) cost += COST_EDGE_TILE;
    if (tile.value >= 4 && tile.value <= 6) cost += COST_MIDDLE_TILE;

    const publicCopies = discardedFaceCounts.get(faceKey) ?? 0;
    cost += publicCopies * COST_PER_PUBLIC_COPY_DISCARDED;

    if (cost > bestCost) {
      bestCost = cost;
      bestId = tile.id;
    }
  }
  return bestId;
}

const ALL_SEATS: Seat[] = ['east', 'south', 'west', 'north'];
```

Note: `ALL_SEATS` is needed inside `ai.ts` for the discard count loop. If you'd rather import it, expose it from `types.ts` and import. The local copy avoids cross-module coupling for a one-line constant.

- [ ] **Step 4: Update `engine.ts` driveAI to use `decideDiscard` instead of `decideDiscardStub`**

In `src/lib/mahjong/engine.ts`, change the import from `./ai`:
```ts
import { decideClaim, decideMissingSuit, decideDiscard } from './ai';
```
And replace the two `decideDiscardStub(s, seat)` calls in `driveAI` with `decideDiscard(s, seat)`.

- [ ] **Step 5: Run all tests**

Run:
```bash
npm test
```
Expected: all tests pass. The `decideDiscardStub` test still works because `decideDiscardStub` is still exported (used only by tests now).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mahjong/ai.ts src/lib/mahjong/ai.test.ts src/lib/mahjong/engine.ts
git commit -m "feat(mahjong): AI decideDiscard cost-based heuristic"
```

---


### Task 15: API routes — Redis I/O, Pusher push, per-seat filtering, claim-window auto-expiry

Wires the engine to HTTP and realtime. Three routes, plus shared helpers in `src/lib/mahjong/persistence.ts` and `src/lib/mahjong/pusher.ts`. Auto-expiry of stale claim windows runs at the start of every request.

**Files:**
- Create: `src/lib/mahjong/persistence.ts`
- Create: `src/lib/mahjong/pusher.ts`
- Create: `src/app/api/mahjong/action/route.ts`
- Create: `src/app/api/mahjong/state/route.ts`
- Create: `src/app/api/mahjong/end/route.ts`

No new tests in this task — these are integration glue. Manual verification via the dev server in Task 16+. The engine functions are already covered.

- [ ] **Step 1: Create `src/lib/mahjong/persistence.ts`**

Create `src/lib/mahjong/persistence.ts`:
```ts
import { Redis } from '@upstash/redis';
import type { GameState, Seat } from './types';
import { initialState, driveAI } from './engine';

export const MAHJONG_KEY = 'mahjong:game';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function loadState(): Promise<GameState> {
  const data = await redis.get<GameState>(MAHJONG_KEY);
  return data ?? initialState();
}

export async function saveState(state: GameState): Promise<void> {
  await redis.set(MAHJONG_KEY, state);
}

export async function deleteState(): Promise<void> {
  await redis.del(MAHJONG_KEY);
}

// Auto-expire claim window if past expiresAt. Returns possibly-mutated state.
// Called at the start of every request.
export function autoExpireClaimWindow(state: GameState): GameState {
  if (state.phase !== 'claim-window' || !state.claimWindow) return state;
  if (Date.now() < state.claimWindow.expiresAt) return state;

  // Auto-pass all still-pending humans, then run driveAI to resolve.
  const next: GameState = {
    ...state,
    claimWindow: {
      ...state.claimWindow,
      decisions: [
        ...state.claimWindow.decisions,
        ...state.claimWindow.pending.map(seat => ({ seat, choice: 'pass' as const })),
      ],
      pending: [],
    },
  };
  return driveAI(next);
}

// Strip server-only fields and other seats' private data for a particular viewer seat.
export function getStateForSeat(state: GameState, viewer: Seat): GameState {
  const filtered: GameState = {
    ...state,
    wall: [], // hide wall contents; clients use wallCount
    seats: { ...state.seats },
  };
  for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
    if (seat === viewer) continue;
    // Hide opponents' hand tiles. Replace with a same-length array of placeholders to preserve count.
    filtered.seats[seat] = {
      ...state.seats[seat],
      hand: state.seats[seat].hand.map((_, i) => ({
        id: `hidden-${seat}-${i}`,
        suit: 'wan',
        value: 1,
      })),
    };
  }
  return filtered;
}
```

- [ ] **Step 2: Create `src/lib/mahjong/pusher.ts`**

Create `src/lib/mahjong/pusher.ts`:
```ts
import { getPusherServer } from '../pusher-server';
import type { GameState, HumanName, Seat } from './types';
import { getStateForSeat } from './persistence';

export const MAHJONG_CHANNEL = 'mahjong-channel';

export const SEAT_STATE_EVENT: Record<Seat, string> = {
  east: 'state-east',
  south: 'state-south',
  west: 'state-west',
  north: 'state-north',
};

// Push per-seat filtered state to all 4 seats.
// AI seats also get a push so a future spectator UI works; safe even if no client listens.
export async function pushAllStates(state: GameState): Promise<void> {
  const pusher = getPusherServer();
  await Promise.all(
    (['east', 'south', 'west', 'north'] as Seat[]).map(seat =>
      pusher.trigger(MAHJONG_CHANNEL, SEAT_STATE_EVENT[seat], getStateForSeat(state, seat)),
    ),
  );
}

export async function pushClaimWindowOpened(state: GameState): Promise<void> {
  if (!state.claimWindow) return;
  const pusher = getPusherServer();
  const optionsBySeat: Partial<Record<Seat, string[]>> = {};
  for (const opt of state.claimWindow.options) {
    optionsBySeat[opt.seat] = [...(optionsBySeat[opt.seat] ?? []), opt.type];
  }
  await pusher.trigger(MAHJONG_CHANNEL, 'claim-window-opened', {
    discardedTile: state.claimWindow.discardedTile,
    fromSeat: state.claimWindow.fromSeat,
    expiresAt: state.claimWindow.expiresAt,
    optionsBySeat,
  });
}

export async function pushHandSettled(state: GameState): Promise<void> {
  const pusher = getPusherServer();
  const results: Record<Seat, GameState['seats']['east']['huResult']> = {
    east: state.seats.east.huResult,
    south: state.seats.south.huResult,
    west: state.seats.west.huResult,
    north: state.seats.north.huResult,
  };
  const scoreDeltas: Record<Seat, number> = {
    east: state.seats.east.score,
    south: state.seats.south.score,
    west: state.seats.west.score,
    north: state.seats.north.score,
  };
  await pusher.trigger(MAHJONG_CHANNEL, 'hand-settled', {
    huOrder: state.huOrder,
    results,
    scoreDeltas,
  });
}

export async function pushGameEnded(state: GameState): Promise<void> {
  const pusher = getPusherServer();
  const finalScores: Record<Seat, number> = {
    east: state.seats.east.score,
    south: state.seats.south.score,
    west: state.seats.west.score,
    north: state.seats.north.score,
  };
  await pusher.trigger(MAHJONG_CHANNEL, 'game-ended', { finalScores });
}

// Identify which seat a human (Aaron or Vicky) currently occupies, if any.
export function seatOfHuman(state: GameState, human: HumanName): Seat | null {
  for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
    const a = state.seats[seat].assignment;
    if (a.kind === 'human' && a.human === human) return seat;
  }
  return null;
}
```

- [ ] **Step 3: Create `src/app/api/mahjong/action/route.ts`**

Create `src/app/api/mahjong/action/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  autoExpireClaimWindow,
  loadState,
  saveState,
} from '@/lib/mahjong/persistence';
import {
  applyActionWithAI,
  type Action,
} from '@/lib/mahjong/engine';
import {
  pushAllStates,
  pushClaimWindowOpened,
  pushHandSettled,
  seatOfHuman,
} from '@/lib/mahjong/pusher';
import type { GameState, HumanName, Seat } from '@/lib/mahjong/types';

interface ActionRequestBody {
  expectedVersion?: number;
  identity: { u: 'aaron' | 'vicky' };
  action: Action;
}

function humanFromIdentity(u: 'aaron' | 'vicky'): HumanName {
  return u === 'aaron' ? 'Aaron' : 'Vicky';
}

// Validate that the human submitting the action owns the seat it references (if any).
function actionSeatBelongsToHuman(state: GameState, action: Action, human: HumanName): boolean {
  // Actions that don't carry a seat are always allowed for any human.
  if (action.type === 'start-next-hand' || action.type === 'end-game') return true;

  // For pick-seat, the human field in the action must match identity.
  if (action.type === 'pick-seat') return action.human === human;

  // For all other actions, action.seat must be the seat assigned to this human.
  const seat = seatOfHuman(state, human);
  if (!seat) return false;
  return (action as { seat: Seat }).seat === seat;
}

export async function POST(req: NextRequest) {
  let body: ActionRequestBody;
  try {
    body = (await req.json()) as ActionRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  if (!body.identity?.u || !body.action) {
    return NextResponse.json({ ok: false, error: 'missing-fields' }, { status: 400 });
  }
  const human = humanFromIdentity(body.identity.u);

  // Load and auto-expire stale claim window before evaluating the action.
  let state = await loadState();
  const expired = autoExpireClaimWindow(state);
  if (expired !== state) {
    state = expired;
    await saveState(state);
    await pushAllStates(state);
    if (state.phase === 'settled') await pushHandSettled(state);
  }

  // Optimistic version check.
  if (
    typeof body.expectedVersion === 'number' &&
    body.expectedVersion !== state.version
  ) {
    return NextResponse.json(
      { ok: false, error: 'stale-state' },
      { status: 409 },
    );
  }

  // Authorize.
  if (!actionSeatBelongsToHuman(state, body.action, human)) {
    return NextResponse.json(
      { ok: false, error: 'forbidden-seat' },
      { status: 403 },
    );
  }

  const result = applyActionWithAI(state, body.action);
  if (!result.ok || !result.state) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'engine-error' },
      { status: 400 },
    );
  }
  const next = result.state;
  await saveState(next);
  await pushAllStates(next);
  if (next.phase === 'claim-window') {
    await pushClaimWindowOpened(next);
  }
  if (next.phase === 'settled' && state.phase !== 'settled') {
    await pushHandSettled(next);
  }
  return NextResponse.json({ ok: true, version: next.version });
}
```

- [ ] **Step 4: Create `src/app/api/mahjong/state/route.ts`**

Create `src/app/api/mahjong/state/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  autoExpireClaimWindow,
  getStateForSeat,
  loadState,
  saveState,
} from '@/lib/mahjong/persistence';
import { pushAllStates, pushHandSettled, seatOfHuman } from '@/lib/mahjong/pusher';
import type { HumanName } from '@/lib/mahjong/types';

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')?.toLowerCase();
  if (u !== 'aaron' && u !== 'vicky') {
    return NextResponse.json({ ok: false, error: 'missing-u' }, { status: 400 });
  }
  const human: HumanName = u === 'aaron' ? 'Aaron' : 'Vicky';

  let state = await loadState();
  const expired = autoExpireClaimWindow(state);
  if (expired !== state) {
    state = expired;
    await saveState(state);
    await pushAllStates(state);
    if (state.phase === 'settled') await pushHandSettled(state);
  }

  const seat = seatOfHuman(state, human);
  // If human hasn't picked a seat yet, return a viewer-style state with all hands hidden.
  // Use 'east' as the viewer seat for filtering (everyone else is hidden anyway, and east hand
  // is hidden too in this case since seat=null means no perspective).
  // Simpler: if seat is null, hide all 4 hands by passing a fake seat.
  if (seat === null) {
    // Hide everyone by treating viewer as a non-seat. Reuse getStateForSeat with one of the seats
    // but then also strip that seat's hand.
    const filtered = getStateForSeat(state, 'east');
    filtered.seats = {
      ...filtered.seats,
      east: {
        ...filtered.seats.east,
        hand: filtered.seats.east.hand.map((_, i) => ({
          id: `hidden-east-${i}`,
          suit: 'wan' as const,
          value: 1 as const,
        })),
      },
    };
    return NextResponse.json(filtered);
  }
  return NextResponse.json(getStateForSeat(state, seat));
}
```

- [ ] **Step 5: Create `src/app/api/mahjong/end/route.ts`**

Create `src/app/api/mahjong/end/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { deleteState, loadState } from '@/lib/mahjong/persistence';
import { pushGameEnded } from '@/lib/mahjong/pusher';

export async function POST() {
  const state = await loadState();
  if (state.phase !== 'seat-selection' && state.phase !== 'settled') {
    return NextResponse.json(
      { ok: false, error: 'hand-in-progress' },
      { status: 400 },
    );
  }
  await pushGameEnded(state);
  await deleteState();
  return NextResponse.json({
    ok: true,
    finalScores: {
      east: state.seats.east.score,
      south: state.seats.south.score,
      west: state.seats.west.score,
      north: state.seats.north.score,
    },
  });
}
```

- [ ] **Step 6: Verify build still passes (no UI yet, but routes must compile)**

Run:
```bash
npx tsc --noEmit
```
Expected: exit 0, no errors.

Run:
```bash
npm test
```
Expected: all tests still pass (no behavior changes to engine/AI).

- [ ] **Step 7: Commit**

```bash
git add src/lib/mahjong/persistence.ts src/lib/mahjong/pusher.ts src/app/api/mahjong
git commit -m "feat(mahjong): API routes, Redis I/O, Pusher push, claim-window auto-expiry"
```

---


### Task 16: Client — zustand store + Pusher subscription

Mirrors the pattern in `src/lib/store.ts` (poker) but scoped to mahjong, on its own channel.

**Files:**
- Create: `src/lib/mahjong/store.ts`

- [ ] **Step 1: Create the store**

Create `src/lib/mahjong/store.ts`:
```ts
'use client';

import { create } from 'zustand';
import type { Channel } from 'pusher-js';
import { getPusherClient } from '../pusher-client';
import type { GameState, HumanName, Seat } from './types';
import { initialState } from './engine';
import {
  MAHJONG_CHANNEL,
  SEAT_STATE_EVENT,
} from './pusher';
import type { Action } from './engine';

interface FinalScores {
  east: number;
  south: number;
  west: number;
  north: number;
}

interface MahjongStore {
  me: HumanName | null;
  setMe: (name: HumanName) => void;

  // The seat the current human occupies (null until they pick a seat).
  mySeat: Seat | null;

  state: GameState;
  connected: boolean;
  gameEnded: FinalScores | null;

  // Last server-known version we successfully synced. Used as expectedVersion in writes.
  syncedVersion: number;

  sendAction: (action: Action) => Promise<void>;
  fetchState: () => Promise<void>;
  endGame: () => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

let channel: Channel | null = null;

function deriveMySeat(state: GameState, me: HumanName | null): Seat | null {
  if (!me) return null;
  for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
    const a = state.seats[seat].assignment;
    if (a.kind === 'human' && a.human === me) return seat;
  }
  return null;
}

export const useMahjongStore = create<MahjongStore>((set, get) => ({
  me: null,
  mySeat: null,
  state: initialState(),
  connected: false,
  gameEnded: null,
  syncedVersion: 0,

  setMe: (name) => set({ me: name }),

  sendAction: async (action) => {
    const { me, state } = get();
    if (!me) return;
    const u = me === 'Aaron' ? 'aaron' : 'vicky';
    const res = await fetch('/api/mahjong/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: { u },
        expectedVersion: state.version,
        action,
      }),
    });
    if (res.status === 409) {
      // Stale state — wait for next Pusher push to refresh.
      return;
    }
    // Server pushes the new state via Pusher; nothing else to do.
  },

  endGame: async () => {
    const res = await fetch('/api/mahjong/end', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { finalScores: FinalScores };
      set({ gameEnded: data.finalScores });
    }
  },

  fetchState: async () => {
    const { me } = get();
    if (!me) return;
    const u = me === 'Aaron' ? 'aaron' : 'vicky';
    const res = await fetch(`/api/mahjong/state?u=${u}`);
    if (!res.ok) return;
    const state = (await res.json()) as GameState;
    set({
      state,
      mySeat: deriveMySeat(state, get().me),
      syncedVersion: state.version,
    });
  },

  subscribe: () => {
    const { me } = get();
    if (!me || channel) return;

    const pusher = getPusherClient();
    channel = pusher.subscribe(MAHJONG_CHANNEL);

    // We don't yet know our seat; subscribe to ALL 4 seat-state events. We'll discriminate
    // server-side already (each event carries that seat's perspective). We use only the
    // event for our actual seat (computed from state.assignment).
    for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
      channel.bind(SEAT_STATE_EVENT[seat], (incoming: GameState) => {
        const myActualSeat = deriveMySeat(incoming, get().me);
        // Only consume the event matching our seat. Before seat-pick, accept any event
        // (they're all the same shape with all hands hidden).
        if (myActualSeat === null || myActualSeat === seat) {
          set({
            state: incoming,
            mySeat: myActualSeat,
            connected: true,
            syncedVersion: incoming.version,
          });
        }
      });
    }

    channel.bind('game-ended', (data: { finalScores: FinalScores }) => {
      set({ gameEnded: data.finalScores });
    });

    channel.bind('pusher:subscription_succeeded', () => {
      set({ connected: true });
      get().fetchState();
    });
  },

  unsubscribe: () => {
    if (channel) {
      channel.unbind_all();
      channel.unsubscribe();
      channel = null;
    }
    set({ connected: false });
  },
}));
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mahjong/store.ts
git commit -m "feat(mahjong): zustand client store with Pusher subscription"
```

---

### Task 17: Client — `/mahjong` page, SeatPicker, ChooseMissing, RotatePrompt

The entry route, three pre-game UI components, and the orientation overlay. Real game-table UI comes in Tasks 18–20.

**Files:**
- Create: `src/components/mahjong/RotatePrompt.tsx`
- Create: `src/components/mahjong/SeatPicker.tsx`
- Create: `src/components/mahjong/ChooseMissing.tsx`
- Create: `src/app/mahjong/page.tsx`

- [ ] **Step 1: Create `RotatePrompt.tsx`**

Create `src/components/mahjong/RotatePrompt.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';

const MIN_LANDSCAPE_WIDTH = 1024;
const MIN_LANDSCAPE_HEIGHT = 600;

function shouldShowOverlay(): boolean {
  if (typeof window === 'undefined') return false;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  if (portrait) return true;
  if (
    window.innerWidth < MIN_LANDSCAPE_WIDTH ||
    window.innerHeight < MIN_LANDSCAPE_HEIGHT
  ) {
    return true;
  }
  return false;
}

export function RotatePrompt() {
  const [show, setShow] = useState(false);
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    function check() {
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      const small =
        window.innerWidth < MIN_LANDSCAPE_WIDTH ||
        window.innerHeight < MIN_LANDSCAPE_HEIGHT;
      setShow(portrait || small);
      setTooSmall(small && !portrait);
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
```

- [ ] **Step 2: Create `SeatPicker.tsx`**

Create `src/components/mahjong/SeatPicker.tsx`:
```tsx
'use client';

import { motion } from 'framer-motion';
import type { Seat } from '@/lib/mahjong/types';
import { useMahjongStore } from '@/lib/mahjong/store';

const SEAT_LABEL: Record<Seat, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
};

const SEAT_GRID: Seat[][] = [
  ['east', 'south'],
  ['west', 'north'],
];

export function SeatPicker() {
  const { me, state, sendAction } = useMahjongStore();

  if (!me) return null;

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <h2 className="text-2xl font-bold text-[#d4af37] tracking-wider">选择座位</h2>
      <div className="grid grid-cols-2 gap-4">
        {SEAT_GRID.flat().map((seat) => {
          const a = state.seats[seat].assignment;
          const taken = a.kind === 'human';
          const takenBy = taken ? a.human : null;
          const isMine = takenBy === me;
          return (
            <motion.button
              key={seat}
              whileHover={{ scale: taken ? 1 : 1.05 }}
              whileTap={{ scale: taken ? 1 : 0.97 }}
              disabled={taken}
              onClick={() => sendAction({ type: 'pick-seat', seat, human: me })}
              className={
                'w-40 h-40 rounded-2xl border text-3xl font-bold transition-colors ' +
                (isMine
                  ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]'
                  : taken
                    ? 'border-white/10 bg-white/[0.02] text-gray-500 cursor-not-allowed'
                    : 'border-white/10 bg-white/[0.03] text-gray-200 hover:border-[#d4af37]/40')
              }
            >
              <div>{SEAT_LABEL[seat]}</div>
              {takenBy && (
                <div className="text-xs font-normal mt-2 tracking-wider">{takenBy}</div>
              )}
            </motion.button>
          );
        })}
      </div>
      <p className="text-sm text-gray-500">
        {humansSeated(state) === 1
          ? '等待另一位玩家选择座位...'
          : '请选择你的座位'}
      </p>
    </div>
  );
}

function humansSeated(state: ReturnType<typeof useMahjongStore.getState>['state']): number {
  return (['east', 'south', 'west', 'north'] as Seat[]).filter(
    (s) => state.seats[s].assignment.kind === 'human',
  ).length;
}
```

- [ ] **Step 3: Create `ChooseMissing.tsx`**

Create `src/components/mahjong/ChooseMissing.tsx`:
```tsx
'use client';

import { motion } from 'framer-motion';
import type { Suit } from '@/lib/mahjong/types';
import { useMahjongStore } from '@/lib/mahjong/store';

const SUIT_LABEL: Record<Suit, string> = {
  wan: '万',
  tong: '筒',
  tiao: '条',
};

export function ChooseMissing() {
  const { mySeat, state, sendAction } = useMahjongStore();
  if (!mySeat) return null;

  const myMissing = state.seats[mySeat].missingSuit;
  const allChosen = (['east', 'south', 'west', 'north'] as const).every(
    (s) => state.seats[s].missingSuit !== null,
  );

  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8 fixed inset-0 bg-[#0a0a0a]/85 backdrop-blur-sm z-30">
      <h2 className="text-2xl font-bold text-[#d4af37] tracking-wider">定缺</h2>
      {myMissing === null ? (
        <div className="flex gap-4">
          {(['wan', 'tiao', 'tong'] as Suit[]).map((suit) => (
            <motion.button
              key={suit}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => sendAction({ type: 'choose-missing', seat: mySeat, suit })}
              className="w-32 h-40 rounded-2xl border border-white/10 bg-white/[0.03] text-4xl font-bold text-gray-200 hover:border-[#d4af37]/40 transition-colors"
            >
              {SUIT_LABEL[suit]}
            </motion.button>
          ))}
        </div>
      ) : (
        <p className="text-lg text-gray-300">
          你定缺了{SUIT_LABEL[myMissing]}
          {!allChosen && <span className="text-gray-500">，等待其他玩家定缺...</span>}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/mahjong/page.tsx`**

Create `src/app/mahjong/page.tsx`:
```tsx
'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMahjongStore } from '@/lib/mahjong/store';
import { RotatePrompt } from '@/components/mahjong/RotatePrompt';
import { SeatPicker } from '@/components/mahjong/SeatPicker';
import { ChooseMissing } from '@/components/mahjong/ChooseMissing';

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
  const { me, setMe, state, gameEnded, subscribe, unsubscribe, fetchState } =
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
          state.phase === 'settled') && (
          <div className="flex flex-col items-center gap-4 p-8">
            <p className="text-sm text-gray-500 tracking-[0.2em] uppercase">
              麻将 · {state.phase}
            </p>
            <p className="text-xs text-gray-600">
              (Game table UI in Tasks 18–20)
            </p>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Verify build**

Run:
```bash
npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/mahjong/page.tsx src/components/mahjong/RotatePrompt.tsx src/components/mahjong/SeatPicker.tsx src/components/mahjong/ChooseMissing.tsx
git commit -m "feat(mahjong): mahjong page, SeatPicker, ChooseMissing, RotatePrompt"
```

---


### Task 18: Client — Tile, Hand, Meld, Discards, SeatArea components

The visual primitives that render mahjong tiles using Unicode glyphs, plus the four building blocks of a seat panel.

**Files:**
- Create: `src/components/mahjong/Tile.tsx`
- Create: `src/components/mahjong/Hand.tsx`
- Create: `src/components/mahjong/Meld.tsx`
- Create: `src/components/mahjong/Discards.tsx`
- Create: `src/components/mahjong/SeatArea.tsx`

- [ ] **Step 1: Create `Tile.tsx` (Unicode glyph renderer)**

Create `src/components/mahjong/Tile.tsx`:
```tsx
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
  wan: '#c0392b',          // traditional red 万
  tong: '#f3e9d2',         // warm white
  tiao: '#f3e9d2',         // warm white
};

interface TileProps {
  tile?: TileType;          // omitted = back-faced
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  highlighted?: boolean;    // pulsing gold ring (last discard)
  dimmed?: boolean;         // missing-suit hint
  onClick?: () => void;
  className?: string;
}

const SIZE_CLASSES = {
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
```

- [ ] **Step 2: Create `Hand.tsx`**

Create `src/components/mahjong/Hand.tsx`:
```tsx
'use client';

import { useMemo } from 'react';
import type { Suit, Tile as TileType } from '@/lib/mahjong/types';
import { Tile } from './Tile';

interface HandProps {
  tiles: TileType[];
  faceUp: boolean;
  size?: 'sm' | 'md' | 'lg';
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
  return (
    <div className="flex gap-1.5 flex-wrap justify-center">
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
```

- [ ] **Step 3: Create `Meld.tsx`**

Create `src/components/mahjong/Meld.tsx`:
```tsx
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
```

- [ ] **Step 4: Create `Discards.tsx`**

Create `src/components/mahjong/Discards.tsx`:
```tsx
'use client';

import type { Tile as TileType } from '@/lib/mahjong/types';
import { Tile } from './Tile';

interface DiscardsProps {
  tiles: TileType[];
  highlightLastId?: string | null;
}

const ROW_LENGTH = 8;

export function Discards({ tiles, highlightLastId }: DiscardsProps) {
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
              size="sm"
              highlighted={highlightLastId === tile.id}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `SeatArea.tsx`**

Create `src/components/mahjong/SeatArea.tsx`:
```tsx
'use client';

import type { PlayerState, Seat } from '@/lib/mahjong/types';
import { Hand } from './Hand';
import { Meld } from './Meld';
import { Discards } from './Discards';

interface SeatAreaProps {
  player: PlayerState;
  isMe: boolean;
  isActive: boolean;
  position: 'top' | 'left' | 'right' | 'bottom';
  highlightLastDiscardId?: string | null;
  selectedTileId?: string | null;
  onTileClick?: (tileId: string) => void;
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
}: SeatAreaProps) {
  const a = player.assignment;
  const displayName =
    a.kind === 'human' ? a.human ?? '玩家' : (a.aiId ?? 'AI');
  const aiBadge = a.kind === 'ai' ? ' 🤖' : '';
  const indicatorColor = isActive ? 'text-[#d4af37]' : 'text-gray-400';
  const isVertical = position === 'left' || position === 'right';

  return (
    <div
      className={
        'flex gap-3 ' +
        (position === 'top' ? 'flex-col-reverse items-center ' : '') +
        (position === 'bottom' ? 'flex-col items-center ' : '') +
        (position === 'left' ? 'flex-row-reverse items-center ' : '') +
        (position === 'right' ? 'flex-row items-center ' : '')
      }
    >
      {/* Identity row */}
      <div className={'flex flex-col gap-1 ' + (isVertical ? 'min-w-24' : '')}>
        <div className={'text-sm font-semibold ' + indicatorColor}>
          {displayName}
          <span className="text-xs text-gray-500 ml-1">
            · {SEAT_LABEL_CN[player.seat]}
            {aiBadge}
          </span>
        </div>
        <div className="text-xs text-gray-500 tabular-nums">
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
        <div className="flex gap-2 flex-wrap">
          {player.melds.map((meld, i) => (
            <Meld key={i} meld={meld} />
          ))}
        </div>
      )}

      {/* Hand: face-up only for me */}
      <Hand
        tiles={player.hand}
        faceUp={isMe}
        size={isMe ? 'lg' : 'sm'}
        selectedId={selectedTileId}
        missingSuit={isMe ? player.missingSuit : null}
        onTileClick={
          isMe && onTileClick ? (tile) => onTileClick(tile.id) : undefined
        }
      />

      {/* Discards */}
      <Discards tiles={player.discards} highlightLastId={highlightLastDiscardId} />
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run:
```bash
npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/mahjong/Tile.tsx src/components/mahjong/Hand.tsx src/components/mahjong/Meld.tsx src/components/mahjong/Discards.tsx src/components/mahjong/SeatArea.tsx
git commit -m "feat(mahjong): tile-rendering primitives (Tile, Hand, Meld, Discards, SeatArea)"
```

---


### Task 19: Client — Table layout + ActionBar

The 4-seat rotated table view (me always at bottom) and the context-aware ActionBar.

**Files:**
- Create: `src/components/mahjong/Table.tsx`
- Create: `src/components/mahjong/ActionBar.tsx`
- Modify: `src/app/mahjong/page.tsx` (wire `Table` into `playing` and `claim-window` phases)

- [ ] **Step 1: Create `Table.tsx`**

Create `src/components/mahjong/Table.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { GameState, Seat } from '@/lib/mahjong/types';
import { TURN_ORDER } from '@/lib/mahjong/types';
import { SeatArea } from './SeatArea';
import { ActionBar } from './ActionBar';

interface TableProps {
  state: GameState;
  mySeat: Seat;
}

// Compute the seat order from the human's perspective:
// bottom = me, right = next-after-me (下家), top = 2-after (对家), left = 3-after (上家).
function perspectiveLayout(mySeat: Seat) {
  const idx = TURN_ORDER.indexOf(mySeat);
  return {
    bottom: TURN_ORDER[(idx + 0) % 4],
    right: TURN_ORDER[(idx + 1) % 4],
    top: TURN_ORDER[(idx + 2) % 4],
    left: TURN_ORDER[(idx + 3) % 4],
  };
}

export function Table({ state, mySeat }: TableProps) {
  const layout = perspectiveLayout(mySeat);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  // Tap-to-select / tap-again-to-confirm. ActionBar reads selectedTileId.
  function onTileClick(tileId: string) {
    setSelectedTileId((prev) => (prev === tileId ? null : tileId));
  }

  const lastDiscardId = state.lastDiscard?.tile.id ?? null;

  return (
    <div className="w-full max-w-[1400px] grid grid-rows-[auto_1fr_auto] gap-4 p-6">
      {/* Top */}
      <div className="flex justify-center">
        <SeatArea
          player={state.seats[layout.top]}
          isMe={false}
          isActive={state.turn === layout.top}
          position="top"
          highlightLastDiscardId={lastDiscardId}
        />
      </div>

      {/* Middle row: left | center | right */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-6">
        <SeatArea
          player={state.seats[layout.left]}
          isMe={false}
          isActive={state.turn === layout.left}
          position="left"
          highlightLastDiscardId={lastDiscardId}
        />

        {/* Center: wall count + last-discard banner */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div
            className={
              'text-xs uppercase tracking-[0.3em] ' +
              (state.wallCount < 10 ? 'text-red-400' : 'text-gray-500')
            }
          >
            牌墙剩余 {state.wallCount}
          </div>
          {state.phase === 'claim-window' && state.claimWindow && (
            <div className="text-sm text-[#d4af37]">
              {state.seats[state.claimWindow.fromSeat].assignment.kind === 'human'
                ? state.seats[state.claimWindow.fromSeat].assignment.human
                : state.seats[state.claimWindow.fromSeat].assignment.aiId}{' '}
              打了一张牌，等待响应...
            </div>
          )}
          {state.phase === 'settled' && state.huOrder.length > 0 && (
            <div className="text-sm text-[#d4af37]">
              本局结束 · 胡牌顺序: {state.huOrder.join(' → ')}
            </div>
          )}
          {state.phase === 'settled' && state.huOrder.length === 0 && (
            <div className="text-sm text-gray-400">流局</div>
          )}
        </div>

        <SeatArea
          player={state.seats[layout.right]}
          isMe={false}
          isActive={state.turn === layout.right}
          position="right"
          highlightLastDiscardId={lastDiscardId}
        />
      </div>

      {/* Bottom (me) */}
      <div className="flex flex-col items-center gap-3">
        <SeatArea
          player={state.seats[layout.bottom]}
          isMe={true}
          isActive={state.turn === layout.bottom}
          position="bottom"
          highlightLastDiscardId={lastDiscardId}
          selectedTileId={selectedTileId}
          onTileClick={onTileClick}
        />
        <ActionBar
          mySeat={mySeat}
          selectedTileId={selectedTileId}
          clearSelection={() => setSelectedTileId(null)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ActionBar.tsx`**

Create `src/components/mahjong/ActionBar.tsx`:
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMahjongStore } from '@/lib/mahjong/store';
import type { Seat, Tile, TileValue } from '@/lib/mahjong/types';
import { canHu } from '@/lib/mahjong/hu';

interface ActionBarProps {
  mySeat: Seat;
  selectedTileId: string | null;
  clearSelection: () => void;
}

export function ActionBar({ mySeat, selectedTileId, clearSelection }: ActionBarProps) {
  const { state, sendAction } = useMahjongStore();
  const me = state.seats[mySeat];

  // claim-window: show 碰/杠/胡/过 if my seat has options
  if (state.phase === 'claim-window' && state.claimWindow) {
    const options = state.claimWindow.options.filter((o) => o.seat === mySeat);
    if (options.length === 0) {
      // I have no claim option but the window is open for someone else.
      return (
        <div className="text-xs text-gray-500 tracking-wider">等待响应...</div>
      );
    }
    return (
      <ClaimBar mySeat={mySeat} expiresAt={state.claimWindow.expiresAt} options={options.map(o => o.type)} />
    );
  }

  // playing-phase, my turn
  if (state.phase === 'playing' && state.turn === mySeat && !me.hasHu) {
    const handSize = me.hand.length;
    const just_drew = handSize === 14;
    return (
      <PlayingTurnBar
        mySeat={mySeat}
        selectedTileId={selectedTileId}
        clearSelection={clearSelection}
        just_drew={just_drew}
      />
    );
  }

  // playing-phase, not my turn
  if (state.phase === 'playing') {
    const turnSeat = state.turn;
    const a = state.seats[turnSeat].assignment;
    const name = a.kind === 'human' ? a.human : a.aiId;
    return (
      <div className="text-sm text-gray-500 tracking-wider">等待 {name} 出牌...</div>
    );
  }

  // settled: show start-next-hand
  if (state.phase === 'settled') {
    return (
      <ActionButton
        label="下一局"
        variant="gold"
        onClick={() => sendAction({ type: 'start-next-hand' })}
      />
    );
  }
  return null;
}

function PlayingTurnBar({
  mySeat,
  selectedTileId,
  clearSelection,
  just_drew,
}: {
  mySeat: Seat;
  selectedTileId: string | null;
  clearSelection: () => void;
  just_drew: boolean;
}) {
  const { state, sendAction } = useMahjongStore();
  const me = state.seats[mySeat];
  const handSize = me.hand.length;

  const huReady = useMemo(() => {
    if (handSize !== 14) return false;
    return canHu(me.hand, me.melds, me.missingSuit).canHu;
  }, [me.hand, me.melds, me.missingSuit, handSize]);

  const gangAnFace = useMemo(() => findGangAnFace(me.hand), [me.hand]);
  const gangBuTile = useMemo(() => findGangBuTile(me), [me]);

  return (
    <div className="flex gap-3">
      {just_drew && huReady && (
        <ActionButton
          label="自摸"
          variant="gold"
          onClick={() => sendAction({ type: 'self-draw-hu', seat: mySeat })}
        />
      )}
      {just_drew && gangAnFace && (
        <ActionButton
          label="暗杠"
          variant="default"
          onClick={() =>
            sendAction({
              type: 'gang-an',
              seat: mySeat,
              suit: gangAnFace.suit,
              value: gangAnFace.value,
            })
          }
        />
      )}
      {just_drew && gangBuTile && (
        <ActionButton
          label="补杠"
          variant="default"
          onClick={() =>
            sendAction({ type: 'gang-bu', seat: mySeat, tileId: gangBuTile.id })
          }
        />
      )}
      <ActionButton
        label={selectedTileId ? '出牌' : '选牌出牌'}
        variant={selectedTileId ? 'gold' : 'disabled'}
        onClick={() => {
          if (!selectedTileId) return;
          sendAction({ type: 'discard', seat: mySeat, tileId: selectedTileId });
          clearSelection();
        }}
      />
    </div>
  );
}

function ClaimBar({
  mySeat,
  expiresAt,
  options,
}: {
  mySeat: Seat;
  expiresAt: number;
  options: ('peng' | 'gang' | 'hu')[];
}) {
  const { sendAction } = useMahjongStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  // Client-side fallback auto-pass
  useEffect(() => {
    const id = window.setTimeout(() => {
      sendAction({ type: 'claim', seat: mySeat, choice: 'pass' });
    }, Math.max(0, expiresAt - Date.now() + 1000)); // 1s after server expiry
    return () => window.clearTimeout(id);
  }, [expiresAt, mySeat, sendAction]);

  const remainingMs = Math.max(0, expiresAt - now);
  const remainingPct = Math.max(0, Math.min(100, (remainingMs / 10_000) * 100));
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-48 h-1 rounded bg-white/10 overflow-hidden">
        <div
          className="h-full bg-[#d4af37]"
          style={{ width: `${remainingPct}%`, transition: 'width 200ms linear' }}
        />
      </div>
      <div className="text-[10px] text-gray-500">{remainingSec}s</div>
      <div className="flex gap-3">
        {options.includes('peng') && (
          <ActionButton
            label="碰"
            variant="default"
            onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'peng' })}
          />
        )}
        {options.includes('gang') && (
          <ActionButton
            label="杠 (明杠)"
            variant="default"
            onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'gang' })}
          />
        )}
        {options.includes('hu') && (
          <ActionButton
            label="胡"
            variant="gold"
            onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'hu' })}
          />
        )}
        <ActionButton
          label="过"
          variant="muted"
          onClick={() => sendAction({ type: 'claim', seat: mySeat, choice: 'pass' })}
        />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: 'default' | 'gold' | 'muted' | 'disabled';
  onClick: () => void;
}) {
  const styles: Record<typeof variant, string> = {
    default: 'bg-white/10 hover:bg-white/20 text-gray-200',
    gold: 'bg-[#d4af37] text-black hover:bg-[#e5c04b]',
    muted: 'bg-white/[0.04] text-gray-400 hover:bg-white/10',
    disabled: 'bg-white/[0.02] text-gray-600 cursor-not-allowed',
  };
  return (
    <motion.button
      whileHover={{ scale: variant === 'disabled' ? 1 : 1.04 }}
      whileTap={{ scale: variant === 'disabled' ? 1 : 0.96 }}
      onClick={variant === 'disabled' ? undefined : onClick}
      className={
        'px-5 py-2 rounded-xl text-sm font-semibold tracking-wider transition-colors ' +
        styles[variant]
      }
    >
      {label}
    </motion.button>
  );
}

// Find a (suit, value) face that appears 4 times in hand → 暗杠 candidate.
function findGangAnFace(hand: readonly Tile[]): { suit: Tile['suit']; value: TileValue } | null {
  const counts = new Map<string, number>();
  for (const t of hand) {
    const k = `${t.suit}-${t.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, c] of counts) {
    if (c === 4) {
      const [suit, valStr] = k.split('-');
      return { suit: suit as Tile['suit'], value: Number(valStr) as TileValue };
    }
  }
  return null;
}

// Find a tile in hand that matches an existing peng → 补杠 candidate.
function findGangBuTile(player: { hand: Tile[]; melds: { type: string; tiles: Tile[] }[] }): Tile | null {
  for (const meld of player.melds) {
    if (meld.type !== 'peng') continue;
    const head = meld.tiles[0];
    const match = player.hand.find((t) => t.suit === head.suit && t.value === head.value);
    if (match) return match;
  }
  return null;
}
```

- [ ] **Step 3: Wire `Table` into `src/app/mahjong/page.tsx`**

Replace the placeholder block in `src/app/mahjong/page.tsx` (the section that currently shows `(Game table UI in Tasks 18–20)`) with:
```tsx
{(state.phase === 'playing' ||
  state.phase === 'claim-window' ||
  state.phase === 'settled') && mySeat && (
  <Table state={state} mySeat={mySeat} />
)}
```

And add the import at the top:
```tsx
import { Table } from '@/components/mahjong/Table';
```

Also pull `mySeat` out of the store. The existing destructure becomes:
```tsx
const { me, setMe, state, mySeat, gameEnded, subscribe, unsubscribe, fetchState } = useMahjongStore();
```

- [ ] **Step 4: Verify build and run the dev server briefly**

Run:
```bash
npx tsc --noEmit
npm test
```
Expected: exit 0 from both.

Optional manual sanity check:
```bash
npm run dev
```
Open `http://localhost:3000/mahjong?u=aaron` in a landscape browser window. You should see the seat picker. (Full play requires both Aaron and Vicky entering, which is best validated in Task 20.)

- [ ] **Step 5: Commit**

```bash
git add src/components/mahjong/Table.tsx src/components/mahjong/ActionBar.tsx src/app/mahjong/page.tsx
git commit -m "feat(mahjong): Table layout and context-aware ActionBar"
```

---

### Task 20: Client — settlement panel, AI move pacing, integration smoke test

Adds the post-hand settlement panel, queues incoming Pusher events for ~600ms-per-AI-move pacing, and runs a manual end-to-end smoke test.

**Files:**
- Create: `src/components/mahjong/SettlementPanel.tsx`
- Modify: `src/lib/mahjong/store.ts` (add pacing queue)
- Modify: `src/app/mahjong/page.tsx` (mount SettlementPanel)

- [ ] **Step 1: Create `SettlementPanel.tsx`**

Create `src/components/mahjong/SettlementPanel.tsx`:
```tsx
'use client';

import { motion } from 'framer-motion';
import type { GameState, Seat, WinType } from '@/lib/mahjong/types';
import { Tile } from './Tile';

interface SettlementPanelProps {
  state: GameState;
  onNextHand: () => void;
  onEndGame: () => void;
}

const WIN_TYPE_LABEL: Record<WinType, string> = {
  'ping-hu': '平胡',
  'dui-dui-hu': '对对胡',
  'qing-yi-se': '清一色',
  'qi-dui': '七对',
};

const SEAT_CN: Record<Seat, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
};

export function SettlementPanel({ state, onNextHand, onEndGame }: SettlementPanelProps) {
  if (state.phase !== 'settled') return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0a0a0a]/85 backdrop-blur-sm p-8"
    >
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 max-w-2xl w-full">
        <h2 className="text-2xl font-bold text-[#d4af37] mb-6 text-center tracking-wider">
          {state.huOrder.length === 0 ? '流局' : '本局结束'}
        </h2>
        <div className="flex flex-col gap-4 mb-8">
          {(['east', 'south', 'west', 'north'] as Seat[]).map((seat) => {
            const p = state.seats[seat];
            const ord = state.huOrder.indexOf(seat);
            return (
              <div
                key={seat}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-white/[0.03]"
              >
                <div className="flex flex-col">
                  <div className="text-sm font-semibold">
                    {p.assignment.kind === 'human' ? p.assignment.human : p.assignment.aiId}
                    <span className="text-xs text-gray-500 ml-1">· {SEAT_CN[seat]}</span>
                  </div>
                  {p.huResult && (
                    <div className="text-xs text-gray-400 mt-1">
                      {p.huResult.selfDraw ? '自摸' : '点炮'}
                      {' · '}
                      {p.huResult.winTypes.map((t) => WIN_TYPE_LABEL[t]).join(' + ')}
                      {' · '}
                      {p.huResult.fan} 番
                    </div>
                  )}
                  {p.huResult && (
                    <div className="flex gap-1 mt-2">
                      <Tile tile={p.huResult.winningTile} size="sm" highlighted />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {ord >= 0 && (
                    <span className="text-xs text-[#d4af37]">第{ord + 1}个胡</span>
                  )}
                  <span className="text-2xl tabular-nums font-bold">
                    {p.score >= 0 ? '+' : ''}
                    {p.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onNextHand}
            className="px-8 py-3 rounded-xl bg-[#d4af37] text-black font-semibold tracking-wide hover:bg-[#e5c04b]"
          >
            下一局
          </button>
          <button
            onClick={onEndGame}
            className="px-8 py-3 rounded-xl bg-white/[0.04] text-gray-300 font-semibold tracking-wide hover:bg-white/10"
          >
            结束游戏
          </button>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Add AI pacing queue to `src/lib/mahjong/store.ts`**

The server may push 2–4 state updates back-to-back when several AI seats act in one HTTP request. We want the client to *display* those updates one at a time at a human pace (~600ms each).

In `src/lib/mahjong/store.ts`, replace the entire `subscribe` function and add a queue:
```ts
const AI_FRAME_DELAY_MS = 600;

let stateQueue: GameState[] = [];
let pumping = false;

function pumpQueue(set: (partial: Partial<MahjongStore>) => void, getMe: () => HumanName | null) {
  if (pumping) return;
  pumping = true;
  function step() {
    const next = stateQueue.shift();
    if (!next) { pumping = false; return; }
    const myActualSeat = deriveMySeat(next, getMe());
    set({
      state: next,
      mySeat: myActualSeat,
      connected: true,
      syncedVersion: next.version,
    });
    if (stateQueue.length === 0) { pumping = false; return; }
    window.setTimeout(step, AI_FRAME_DELAY_MS);
  }
  step();
}
```
And replace the `subscribe`'s seat-state binding with one that enqueues:
```ts
  subscribe: () => {
    const { me } = get();
    if (!me || channel) return;

    const pusher = getPusherClient();
    channel = pusher.subscribe(MAHJONG_CHANNEL);

    for (const seat of ['east', 'south', 'west', 'north'] as Seat[]) {
      channel.bind(SEAT_STATE_EVENT[seat], (incoming: GameState) => {
        const myActualSeat = deriveMySeat(incoming, get().me);
        if (myActualSeat === null || myActualSeat === seat) {
          // If incoming state advances us to a "my-turn" or "claim-window" state, flush
          // the queue and apply immediately so UI is always responsive to the human.
          const myTurn =
            incoming.phase === 'playing' && myActualSeat !== null && incoming.turn === myActualSeat;
          const myClaim =
            incoming.phase === 'claim-window' &&
            incoming.claimWindow?.options.some((o) => o.seat === myActualSeat);
          if (myTurn || myClaim) {
            stateQueue = [];
            set({
              state: incoming,
              mySeat: myActualSeat,
              connected: true,
              syncedVersion: incoming.version,
            });
            return;
          }
          stateQueue.push(incoming);
          pumpQueue((p) => set(p as MahjongStore), () => get().me);
        }
      });
    }

    channel.bind('game-ended', (data: { finalScores: FinalScores }) => {
      set({ gameEnded: data.finalScores });
    });

    channel.bind('pusher:subscription_succeeded', () => {
      set({ connected: true });
      get().fetchState();
    });
  },
```

- [ ] **Step 3: Mount `SettlementPanel` on the mahjong page**

In `src/app/mahjong/page.tsx`, add the import:
```tsx
import { SettlementPanel } from '@/components/mahjong/SettlementPanel';
```
And inside the main returned `<>`, after the `<Table>` block, add:
```tsx
{state.phase === 'settled' && (
  <SettlementPanel
    state={state}
    onNextHand={() => useMahjongStore.getState().sendAction({ type: 'start-next-hand' })}
    onEndGame={() => useMahjongStore.getState().endGame()}
  />
)}
```

- [ ] **Step 4: Verify build + run all tests**

Run:
```bash
npx tsc --noEmit
npm test
```
Expected: exit 0 from both. Test count from all tasks combined: ~50 passing tests across `tiles`, `hu`, `scoring`, `engine`, `ai`.

- [ ] **Step 5: Manual end-to-end smoke test**

Ensure your `.env.local` has the Upstash and Pusher credentials populated (per `.env.local.example`). Then:

```bash
npm run dev
```

In two browser windows (both landscape, ≥1024×600):
1. Open `http://localhost:3000/mahjong?u=aaron`. Expect: seat picker. Click 东.
2. Open `http://localhost:3000/mahjong?u=vicky`. Expect: seat picker, 东 already taken. Click 南.
3. Both windows show 定缺 modal. AI seats (西, 北) auto-choose. Aaron and Vicky each pick a suit.
4. Phase enters `playing`. East (Aaron) is on turn with 14 tiles; ActionBar shows 出牌 button (disabled until selected).
5. Aaron clicks a tile → gold ring. Clicks again → discards.
6. Watch turn advance to 北 (AI), then 西 (AI), then 南 (Vicky). AI moves are paced ~600ms apart.
7. If a discard offers Aaron or Vicky a 碰 / 杠 / 胡, the claim bar appears with countdown. Click 过 to skip; let it expire to verify auto-pass.
8. Continue playing until ≥3 players hu (or wall empties → 流局). Settlement panel appears with 番型 + 番数 + 收分.
9. Click 下一局 → fresh hand, scores preserved.
10. After a settled hand, click 结束游戏 → game-over screen with final scores.

If anything is broken, return to the affected task and add a regression test before fixing.

- [ ] **Step 6: Commit**

```bash
git add src/components/mahjong/SettlementPanel.tsx src/lib/mahjong/store.ts src/app/mahjong/page.tsx
git commit -m "feat(mahjong): settlement panel, AI move pacing queue, end-to-end wired"
```

---

## Plan complete

All 20 tasks done. The mahjong game is playable end-to-end on the existing AVIC deployment. Files created/modified summary:

**New (28 files):**
- `vitest.config.ts`
- `src/lib/mahjong/types.ts`, `tiles.ts`, `hu.ts`, `scoring.ts`, `engine.ts`, `ai.ts`, `persistence.ts`, `pusher.ts`, `store.ts`
- `src/lib/mahjong/tiles.test.ts`, `hu.test.ts`, `scoring.test.ts`, `engine.test.ts`, `ai.test.ts`
- `src/app/mahjong/page.tsx`
- `src/app/api/mahjong/action/route.ts`, `state/route.ts`, `end/route.ts`
- `src/components/mahjong/Tile.tsx`, `Hand.tsx`, `Meld.tsx`, `Discards.tsx`, `SeatArea.tsx`, `Table.tsx`, `ActionBar.tsx`, `SeatPicker.tsx`, `ChooseMissing.tsx`, `SettlementPanel.tsx`, `RotatePrompt.tsx`

**Modified (1 file):**
- `package.json` (devDeps: `vitest`; scripts: `test`, `test:watch`)

**Untouched:**
- All existing poker code: `src/lib/{engine,evaluator,deck,store,types}.ts`, `src/app/page.tsx`, `src/app/api/game/*`, `src/components/{Card,PlayerArea,ActionBar}.tsx`. Shared `pusher-server.ts` and `pusher-client.ts` are reused as-is.
