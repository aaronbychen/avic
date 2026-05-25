# 川麻血战到底（4人，2真人 + 2 AI）— Design Spec

- Date: 2026-05-25
- Status: Approved (brainstorming complete)
- Authors: Aaron + Kiro
- Scope: MVP — Blood-battle minimal rule set, runs alongside the existing AVIC poker game in the same Next.js project.

## 1. Overview

Build a 4-seat 川麻 (Sichuan mahjong, blood-battle) game playable by Aaron and Vicky as humans, with the remaining 2 seats filled by rule-based AI bots. The game lives in the existing AVIC Next.js 16 project, deployed to the same Vercel project, sharing the existing Pusher app and Upstash Redis. Existing poker code is not modified.

## 2. Goals and non-goals

### Goals

- Two humans (Aaron, Vicky) and two AI (AI-1, AI-2) play a full 4-seat 血战到底 hand from start to settlement.
- All UI text in 中文.
- Real-time sync via Pusher; persistence via Upstash Redis.
- Reuse existing deployment infrastructure (Vercel, Pusher, Upstash) without new env vars or external services.
- Engine is server-authoritative and unit-tested. Production shuffles use `Math.random()`; tests use a seedable RNG for deterministic reproduction.
- Landscape-only UI; portrait viewports show a rotate-device prompt.

### Non-goals (explicit out-of-scope, tracked as `TODO(v2)`)

- 换三张 (swap-three at start)
- 抢杠胡 (rob-the-kong)
- 杠上花 / 海底捞月 bonuses
- 龙七对 / 清七对 / 双暗刻 / 根 multipliers
- 查叫 penalty for non-listening losers at hand end
- Full 血战到底 hu'd-players-keep-playing (MVP locks them after their hu)
- 庄家 rotation across 风圈
- Multi-room support
- Reconnect-while-claim-window-open client recovery
- Spectator mode, sound effects
- Mobile portrait layout

## 3. Rule scope (MVP — Blood-battle minimal)

- 108 tiles only: 万 (1–9 ×4), 筒 (1–9 ×4), 条 (1–9 ×4). No characters, no flowers.
- 定缺 (choose-missing): each seat picks one suit at start. Cannot 胡 while holding any tile of the missing suit.
- 碰 (peng), 杠 (gang: 明杠 / 暗杠 / 补杠), 胡 (hu) — **no 吃**.
- 血战到底: a hand continues after a 胡; players who have already 胡 are locked (cannot act further). Hand ends when ≥3 seats have 胡 OR the wall is exhausted (流局).
- Win types and base 番:
  - 平胡 = 1 番
  - 对对胡 = 2 番
  - 七对 = 2 番
  - 清一色 = 4 番
- Self-draw bonus: `selfDraw ? 1 : 0` added to total 番.
- Win types stack additively (e.g., 清一色 + 对对胡 = 6 番).
- Payout: each 胡 earns `2^fan` chips. 自摸 collects from all 3 other seats; 点炮 collects only from the discarder (other 2 seats unaffected). Multi-胡 (一炮多响) allowed; each winner is paid by the discarder independently.
- Score is cumulative across hands within a single game.
- 庄家 stays at `east` for every hand in MVP.

## 4. Architecture

### 4.1 File layout

The mahjong game is fully namespaced under `src/lib/mahjong/` and `src/components/mahjong/`. Existing poker code (`src/lib/{engine,evaluator,deck,store,types}.ts`, `src/app/page.tsx`, `src/app/api/game/*`, `src/components/{Card,PlayerArea,ActionBar}.tsx`) is untouched.

```
src/
├── app/
│   ├── page.tsx                         (existing: poker — unchanged)
│   ├── mahjong/
│   │   └── page.tsx                     (entry: ?u=aaron|vicky)
│   └── api/mahjong/
│       ├── action/route.ts              (POST: all player actions)
│       ├── state/route.ts               (GET: per-player filtered state)
│       └── end/route.ts                 (POST: end and reset)
├── lib/
│   ├── pusher-server.ts                 (existing — shared, unchanged)
│   ├── pusher-client.ts                 (existing — shared, unchanged)
│   └── mahjong/
│       ├── types.ts
│       ├── tiles.ts                     (build/shuffle 108-tile wall, tile-id helpers)
│       ├── hu.ts                        (向听 calc, 胡 detection, 番型 classifier)
│       ├── engine.ts                    (state machine + Redis I/O + Pusher push)
│       ├── ai.ts                        (rule-based decideDiscard / decideClaim)
│       ├── store.ts                     (zustand client store)
│       ├── pusher.ts                    (channel/event-name constants)
│       └── *.test.ts                    (vitest tests, colocated)
└── components/mahjong/
    ├── Tile.tsx
    ├── Hand.tsx
    ├── Meld.tsx
    ├── Discards.tsx
    ├── SeatArea.tsx
    ├── Table.tsx
    ├── ActionBar.tsx
    ├── ChooseMissing.tsx
    ├── SeatPicker.tsx
    └── RotatePrompt.tsx                 (landscape-only enforcement)
```

### 4.2 Reuse vs. new

- **Reused unchanged:** Vercel deploy, Pusher app, Upstash Redis instance, `pusher-server.ts` / `pusher-client.ts` singletons, Tailwind v4, framer-motion, zustand, dark theme + `#d4af37` accent, env vars in `.env.local.example`.
- **New, scoped to mahjong:** Pusher channel `mahjong-channel`, Redis key `mahjong:game`, all files in the layout above.
- **No new env vars, no new infrastructure.**

### 4.3 Server authority and per-player state filtering

Following the existing poker pattern (`getStateForPlayer`):

- Engine holds full state in Redis under `mahjong:game`.
- Before sending state to a client, server filters: hide `wall` contents (only expose `wallCount`), hide other seats' `hand` (expose only length).
- Pusher events are seat-scoped: `state-east`, `state-south`, `state-west`, `state-north`. Each client subscribes only to its own seat event.
- Public events: `claim-window-opened`, `claim-window-closed`, `hand-settled`, `game-ended`.

## 5. Data model

```ts
// src/lib/mahjong/types.ts

export type Suit = 'wan' | 'tong' | 'tiao';
export type TileValue = 1|2|3|4|5|6|7|8|9;
export type TileId = string;                       // "wan-5-2" = the 2nd copy of 5万

export interface Tile {
  id: TileId;
  suit: Suit;
  value: TileValue;
}

export type Seat = 'east' | 'south' | 'west' | 'north';
export type PlayerKind = 'human' | 'ai';
export type HumanName = 'Aaron' | 'Vicky';

export interface SeatAssignment {
  seat: Seat;
  kind: PlayerKind;
  human?: HumanName;
  aiId?: string;                                   // 'AI-1' | 'AI-2'
}

export type MeldType = 'peng' | 'gang-ming' | 'gang-an' | 'gang-bu';

export interface Meld {
  type: MeldType;
  tiles: Tile[];                                   // 3 for peng, 4 for any gang
  fromSeat: Seat | null;                           // null for 暗杠
}

export type WinType = 'ping-hu' | 'dui-dui-hu' | 'qing-yi-se' | 'qi-dui';

export interface HuResult {
  winTypes: WinType[];
  fan: number;
  selfDraw: boolean;
  winningTile: Tile;
  fromSeat: Seat | null;                           // null on 自摸
}

export interface PlayerState {
  seat: Seat;
  assignment: SeatAssignment;
  hand: Tile[];                                    // 13 normally, 14 after draw/claim
  melds: Meld[];
  discards: Tile[];
  missingSuit: Suit | null;
  hasHu: boolean;
  huResult: HuResult | null;
  score: number;
}

export type Phase =
  | 'seat-selection'
  | 'choose-missing'
  | 'playing'
  | 'claim-window'
  | 'settled';

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
  pending: Seat[];                                 // humans whose decision we're waiting on
  decisions: PendingClaim[];                       // resolved decisions (AI + already-clicked humans)
  expiresAt: number;                               // epoch ms; 10s after discard
}

export interface GameState {
  version: number;                                 // monotonically increases on every save (optimistic concurrency)
  phase: Phase;
  wall: Tile[];                                    // server-only; filtered out for clients
  wallCount: number;                               // public count for UI
  seats: Record<Seat, PlayerState>;
  turn: Seat;
  dealer: Seat;
  lastDiscard: { seat: Seat; tile: Tile } | null;
  claimWindow: ClaimWindow | null;
  huOrder: Seat[];
  gameOver: boolean;
  handNumber: number;
}
```

## 6. State machine

### 6.1 Phase transitions

```
seat-selection ──(all 4 seats assigned)─────→ choose-missing
choose-missing ──(all 4 missingSuit set)────→ playing            (turn = dealer; dealer draws)
playing        ──(player discards, no claims)→ playing            (turn = next non-hu seat, that seat draws)
playing        ──(player discards, claims)──→ claim-window
claim-window   ──(all decisions resolved)───→ playing OR settled
playing        ──(self-draw 自摸 hu, ≥3 hu now)──→ settled
playing        ──(self-draw 自摸 hu, <3 hu)──────→ playing (winner is locked, turn advances to next non-hu seat)
playing        ──(wall exhausted)────────────→ settled (流局)
settled        ──(start-next-hand action)───→ choose-missing     (preserves seats and scores)
```

### 6.2 Action types

All actions hit `POST /api/mahjong/action`:

```ts
type Action =
  | { type: 'pick-seat'; seat: Seat; expectedVersion?: number }
  | { type: 'choose-missing'; suit: Suit; expectedVersion?: number }
  | { type: 'discard'; tileId: TileId; expectedVersion?: number }
  | { type: 'claim'; choice: 'peng'|'gang'|'hu'|'pass'; expectedVersion?: number }
  | { type: 'gang-an'; suit: Suit; value: TileValue; expectedVersion?: number }
  | { type: 'gang-bu'; tileId: TileId; expectedVersion?: number }
  | { type: 'start-next-hand'; expectedVersion?: number }
  | { type: 'start-game' };                        // resets everything to seat-selection
```

The route handler identifies the acting seat from the request (header or body) and validates that the action is legal for that seat in the current phase before applying.

### 6.3 Server-driven AI chain

After every state mutation triggered by a human action, the engine calls `driveAI(state)`:

```
loop:
  if phase === 'claim-window':
    for each AI seat in claimWindow.pending:
      decide via ai.decideClaim → record in claimWindow.decisions, drop from pending
    if pending is empty (no humans left waiting):
      resolve claims by priority → either:
        - settled (≥3 hu, or only 1 active player left)
        - playing (claimer becomes turn; or if all passed, next-of-discarder draws)
    else: break (waiting on humans)

  if phase === 'playing' AND seats[turn].kind === 'ai':
    a. if AI just claimed (peng/gang resolved them onto this turn): skip step b's draw
       else: AI draws next wall tile
    b. check 自摸 hu → if so, settle this AI's hu, check terminate
    c. check 暗杠/补杠 opportunity → if AI declares: take meld, draw replacement, loop step b
    d. AI picks discard via ai.decideDiscard
    e. apply discard → may set phase = 'claim-window'; loop from top

  otherwise: break
```

The loop runs synchronously inside one HTTP request. Worst-case latency is dominated by Redis writes (we batch — one write at end of request) and Pusher pushes (~50ms each). Estimated worst case: ~500-800ms; typical case: <200ms.

### 6.4 Claim-window resolution

When all decisions are in (no pending humans, all AI resolved):

1. Collect all `hu` claims. If any: each is settled as 点炮 from `claimWindow.fromSeat`. Multiple winners allowed (一炮多响). Each winner's payout collected from the discarder. Add winners to `huOrder`, set `hasHu = true`. Then check terminate.
2. Else, the highest-priority single non-hu claim wins. Note: gang and peng options on a single discarded tile are mutually exclusive across seats — at most one seat can hold the 3 matching tiles needed for either, since there are only 4 copies and the discarder just released one. So priority across seats is moot; only priority across types (gang > peng) matters within the single eligible claimer.
   - any `gang` (明杠) → claimer takes 4 tiles (3 from hand + the discarded), draws a replacement from the **end of the wall** (杠上摸). The engine then resumes the AI-driver / playing loop with `turn = claimer`: if the claimer is AI, the loop checks 自摸 hu on the replacement (杠上花 not scored as bonus in MVP, but a hu still counts), considers another 暗杠/补杠, then picks a discard. If the claimer is human, control returns to that human's UI (with 14 tiles, ready to discard).
   - else any `peng` → claimer takes 3 tiles (2 from hand + the discarded). Engine sets `turn = claimer`. Same flow: AI claimer continues the loop (no draw — they already have 14 effective tiles via the meld); human claimer's UI shows them 14 tiles ready to discard.
3. If all passed: the discarded tile stays in the discarder's `discards`; turn advances to the next non-hu seat (counter-clockwise: east → north → west → south → east) and that seat draws.

### 6.5 Terminate conditions

After any hu, the engine checks:

- `huOrder.length >= 3` → phase = `settled`. The remaining seat's hand is shown but not scored (no 查叫 penalty in MVP).
- Wall empty AND no replacement-draws pending → phase = `settled` (流局, no winners scored).

When `settled` is entered, the engine emits `hand-settled` with `huOrder` and per-seat `HuResult` and score deltas.

### 6.6 Scoring

```
base 番 per winType:
  ping-hu        = 1
  dui-dui-hu     = 2
  qi-dui         = 2
  qing-yi-se     = 4

selfDraw ? +1 : +0  (added to fan total)
chips per hu       = 2^fan
```

- 自摸 winner collects `2^fan` from each of the 3 other seats.
- 点炮 winner collects `2^fan` from the discarder only.
- Multi-胡: each winner is paid independently by the discarder (could be expensive — that's correct).
- Hu'd seats' `score` increases; payers' `score` decreases by the same total.

## 7. AI behavior

Two pure functions in `src/lib/mahjong/ai.ts`. No persistent AI state; decisions are functions of `GameState` + `seat`.

### 7.1 `decideDiscard(state, seat) → TileId`

Called when AI has 14 tiles and must drop one:

1. **Hu check:** if hand can hu without discarding, return signal to declare 自摸 (always hu in MVP).
2. **Score each tile by cost-to-discard, drop the highest:**
   - +100 if tile suit equals `seats[seat].missingSuit`
   - −10 if tile pairs with another in hand
   - −6 if tile completes a 2-tile sequence (e.g., 4 + 5 → 6 valuable)
   - +2 for edge tiles (1 or 9), −4 for middle tiles (4–6) — middle tiles are more flexible
   - +1 × (count of this suit+value already in any seat's `discards`) — safer to drop seen tiles

These weights are constants in `ai.ts` and are tuned via play-testing.

### 7.2 `decideClaim(state, seat, options) → 'peng'|'gang'|'hu'|'pass'`

- `hu` offered → always claim (MVP never declines 胡).
- `gang` offered (明杠) → claim if shanten ≥ 3 (low risk of disrupting near-tenpai shape); else pass. 暗杠/补杠 are decided in `decideDiscard` flow on own turn.
- `peng` offered → claim only if hand already has ≥ 2 melds-or-pairs of same suit (moves toward 对对胡), OR if the offered tile shares the missing suit with a tile in hand and pengging it removes 2 of that suit at once. Otherwise pass.

### 7.3 AI as 定缺 picker

In `choose-missing` phase, AI picks the suit with the **fewest tiles** in its initial 13-tile hand. Ties broken in order: 万 > 条 > 筒 (arbitrary stable choice).

## 8. Concurrency, idempotency, and timing

### 8.1 Optimistic version control

`GameState.version` increments on every save. Action requests include `expectedVersion`. Engine rejects with `{ ok: false, error: 'stale-state' }` if mismatch. Client ignores stale-state errors and waits for the next Pusher push to correct its UI.

### 8.2 Claim-window 10s timer (lazy expiration)

There is no background job; serverless can't run one. Strategy:

- `claimWindow.expiresAt = Date.now() + 10_000` when a discard creates the window.
- **Server-side:** every API handler's first action is to check `state.claimWindow?.expiresAt`. If past, run `autoExpireClaimWindow(state)` — auto-passes all still-pending humans, runs `driveAI`, saves and pushes — then handles the actual incoming request normally.
- **Client-side fallback:** when a client receives `claim-window-opened`, it sets `setTimeout(11_000)`. On fire, if its UI still shows pending claim, it POSTs a `pass` action. 11s ensures the server-side expiration triggers first (server wall-clock is the source of truth).

### 8.3 Race scenarios

| Scenario | Defense |
|---|---|
| Two humans click claim simultaneously | Each request writes with version check; one succeeds, the other gets stale-state and re-syncs from Pusher. Engine's `applyClaim` is idempotent on the same seat's decision. |
| AI loop and human action interleave | Cannot happen: AI loop runs synchronously inside a single request; Upstash REST writes are sequential per key. Subsequent human actions read post-AI state or fail version check. |
| Two requests trigger expiry simultaneously | `autoExpireClaimWindow` is idempotent (no-op if `claimWindow === null` or `pending` already empty). One write wins, the other fails version check and retries with current state. |

## 9. API surface

### `POST /api/mahjong/action`

Request body: an `Action` plus `{ seat: Seat, identity: { u: 'aaron'|'vicky' } | { aiId: string } }` (the route validates that the identity matches the seat).

Response:

```json
{ "ok": true, "version": 42 }
{ "ok": false, "error": "stale-state" | "illegal-action" | "wrong-phase" | "not-your-turn" | "internal" }
```

### `GET /api/mahjong/state?u=aaron`

Returns the per-seat-filtered current `GameState` (wall hidden, other seats' hands hidden) for the seat that human occupies. Used by clients on initial load and on stale-state recovery.

### `POST /api/mahjong/end`

Deletes the `mahjong:game` Redis key, emits `game-ended` event with final scores. Refuses if a hand is mid-play (phase ∉ `seat-selection` ∪ `settled`).

## 10. Pusher events

| Event | Channel | Payload | Trigger |
|---|---|---|---|
| `state-east` / `state-south` / `state-west` / `state-north` | `mahjong-channel` | per-seat filtered `GameState` | every state change |
| `claim-window-opened` | `mahjong-channel` | `{ discardedTile, fromSeat, expiresAt, optionsBySeat }` | discard creates a claim window |
| `claim-window-closed` | `mahjong-channel` | `{ resolution: 'hu' \| 'gang' \| 'peng' \| 'pass', winners?: Seat[] }` | claim window resolves |
| `hand-settled` | `mahjong-channel` | `{ huOrder, results: Record<Seat, HuResult \| null>, scoreDeltas: Record<Seat, number> }` | phase enters `settled` |
| `game-ended` | `mahjong-channel` | `{ finalScores: Record<Seat, number> }` | `/api/mahjong/end` invoked |

Per-seat `state-*` events are the primary sync mechanism. Public events drive UI animations (highlight discard, claim banner, settlement modal, game-over screen).

## 11. UI / UX

### 11.1 Orientation policy

The mahjong page is **landscape-only**. A `RotatePrompt` overlay covers the entire page when:

- `window.matchMedia('(orientation: portrait)').matches`, OR
- `window.innerWidth < 1024 || window.innerHeight < 600`.

Overlay text: 中文 "请将设备旋转至横屏" (or "屏幕太小，请使用更大的设备" for the size variant) with a rotation icon. The overlay re-evaluates on `resize` and `orientationchange`.

### 11.2 Entry flow

- `/mahjong?u=aaron` or `/mahjong?u=vicky` — identifies the human.
- `/mahjong` (no `?u=`) — prompt: "请用 ?u=aaron 或 ?u=vicky 进入" (matches the existing poker page behavior).

### 11.3 Screens

1. **SeatPicker** (phase = `seat-selection`) — 2×2 grid of 东南西北. Aaron picks first, then Vicky. AI fills the remaining two seats. Status text: "等待 Vicky 选择座位..." while waiting.
2. **ChooseMissing** (phase = `choose-missing`) — modal with three buttons 万/筒/条. AI auto-picks instantly. Modal stays open showing "等待其他玩家定缺..." until all 4 have chosen.
3. **Game table** (phase = `playing` or `claim-window`) — main play surface (see 11.4).
4. **Settlement panel** (phase = `settled`) — overlay showing 胡牌顺序 with winning hands, 番型, 番数, 收分; "下一局" button.
5. **Game-over screen** — final 4-seat scores, "新游戏" button. Visual style mirrors the existing poker game-over screen.

### 11.4 Table layout (rotated to human's perspective)

The acting human is always at the bottom; counter-clockwise from there: 下家 (right), 对家 (top), 上家 (left).

```
                ┌────────────────────┐
                │   [对家 SeatArea]  │
                └────────────────────┘
   ┌────────┐                          ┌────────┐
   │ [上家] │   牌河 + 牌墙剩余张数    │ [下家] │
   │SeatArea│                          │SeatArea│
   └────────┘                          └────────┘
                ┌────────────────────┐
                │   [我 SeatArea]    │
                │   Hand + ActionBar │
                └────────────────────┘
```

Each `SeatArea` shows: name + 座位 in 中文 (e.g., "Aaron · 东"), tile count for hand (back-faced for non-me seats), face-up melds, mini discard pile. AI seats display a 🤖 indicator.

### 11.5 Tile rendering (Unicode glyphs)

```
万 1–9: U+1F007 + (value-1)   →  🀇 🀈 🀉 🀊 🀋 🀌 🀍 🀎 🀏
筒 1–9: U+1F019 + (value-1)   →  🀙 🀚 🀛 🀜 🀝 🀞 🀟 🀠 🀡
条 1–9: U+1F010 + (value-1)   →  🀐 🀑 🀒 🀓 🀔 🀕 🀖 🀗 🀘
back:    U+1F02B              →  🀫
```

`<Tile>` renders a glyph at 56px (desktop) / 40px (smaller landscape) on a rounded card-like surface (`bg-white/[0.03]`, rounded-xl, inner shadow). Selected/hover state: gold outline (`#d4af37`). Last-discarded tile: pulsing gold ring. Glyph color: warm white for 条/筒, traditional red `#c0392b` for 万.

### 11.6 Hand interaction

- My hand sorts ascending by suit (万 → 筒 → 条) then value.
- Discard flow: click tile → tile gets gold ring (selected); click same tile again OR click 出牌 button → confirms and POSTs `discard`. Click a different tile to change selection.
- During 定缺: ChooseMissing modal is full-screen modal; hand display dimmed.
- Visual hints during play:
  - Tiles in own missing suit: faint red tint (must be discarded before hu).
  - Pairs/triplets in own hand: thin underline grouping.

### 11.7 ActionBar (context-aware)

- `playing` and my turn (just drew):
  - `[出牌]` (active when a tile is selected, shows preview)
  - `[暗杠]` (visible if I hold 4 of a kind)
  - `[补杠]` (visible if I have a peng matching a hand tile)
  - `[自摸]` (highlighted bright gold if hand can hu)
- `claim-window` and I'm in `pending`:
  - `[碰] [杠] [胡] [过]` — only buttons matching my legal options shown. The `[杠]` button here is always 明杠 (claiming the discarded tile to form the 4th); 暗杠 / 补杠 are own-turn actions and live in the `playing`-turn ActionBar above.
  - 10s countdown bar above buttons; auto-pass on expiry
- `playing` and not my turn: status text "等待 Vicky 出牌..." with the active seat highlighted.
- `settled`: `[下一局]`.
- `seat-selection` / `choose-missing`: handled by their modals, ActionBar hidden.

### 11.8 Animations (framer-motion)

- **Discard:** tile slides from player's hand to the central 牌河 in that seat's lane.
- **Claim:** discarded tile flies to claimer's meld area; 2 (peng) or 3 (gang) tiles slide from claimer's hand to join.
- **Hu:** screen briefly dims; winning hand glows gold; "胡!" 中文 text scales up from center; transitions into settlement panel.
- **Wall depletion:** central 牌墙剩余 counter updates each draw; turns red below 10.
- **AI move pacing:** state updates may arrive batched (multiple AI moves resolved server-side in one request). Client gates the visual reveal at ~600ms per AI move so play feels human, by queueing incoming Pusher events into a per-seat playback queue with a min-interval delay.

### 11.9 Visual language

- Background: same dark base as poker (`#0a0a0a`-ish) with a subtle radial gradient suggesting a felt table.
- Accent gold: `#d4af37` (matches existing poker).
- Tiles: dark slate surface, rounded-xl corners, inner shadow, glyph color per suit.
- All UI text 中文.

## 12. Testing

### 12.1 Setup

- **Vitest** as the test runner. Add as devDependency. Single `vitest.config.ts` at repo root.
- Tests colocated as `*.test.ts` next to source files in `src/lib/mahjong/`.
- Existing poker code has no tests and gets none in this project (untouched).
- Scripts added to `package.json`:
  - `"test": "vitest run"`
  - `"test:watch": "vitest"`

### 12.2 Test coverage

| Module | Tests |
|---|---|
| `tiles.ts` | wall has exactly 108 tiles with correct suit/value distribution; deterministic shuffle given a seed; tile-id parsing/formatting round-trips |
| `hu.ts` | 平胡 / 对对胡 / 清一色 / 七对 detection on canonical winning hands; non-winning hands rejected; missing-suit constraint enforced; stacking (清一色 + 对对胡); various winning-tile shapes (边 / 钳 / 单) |
| `engine.ts` | full hand walkthroughs (deal → 定缺 → discards → claims → hu); state-machine invariants (turn always belongs to non-hu seat in `playing`; `claimWindow` only present in `claim-window`; tile conservation: wall + hands + discards + melds = 108); multi-hu (一炮多响); 流局; auto-expire claim window; optimistic version conflict rejected; AI driver does not infinite-loop |
| `ai.ts` | `decideDiscard` never picks a missing-suit tile when one is available; `decideClaim` always claims hu; passes peng when hand isn't pair-shape |

Target: ~30–50 tests total.

### 12.3 No browser/UI tests in MVP

UI verification is manual. Tracked as `TODO(v2)`.

## 13. Environment, deployment, performance

### 13.1 Environment

No new variables. Reuses existing `.env.local`:

```
PUSHER_APP_ID, PUSHER_SECRET
NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER
KV_REST_API_URL, KV_REST_API_TOKEN
```

### 13.2 Deployment

- Same Vercel project; `vercel deploy` redeploys both poker and mahjong.
- Free Pusher tier (100 connections, 200k msgs/day): comfortably fits — at most 4 active connections, ~30 messages per discard worst case.
- Free Upstash tier (10k commands/day): comfortably fits — ~10 reads + 10 writes per game minute.

### 13.3 Performance budget

- Typical action: <200ms wall-clock.
- Worst case (3 AI seats, multiple 暗杠 then discards then claims in one request): ~500–800ms. Well under Vercel's 10s function timeout (60s on Pro).
- Pusher push per state change: ~50ms. Engine batches all state changes within a single request into a single final write, but emits per-step Pusher events so the UI can animate intermediate states.

## 14. Cross-cutting concerns

- **Logging:** `console.log` for engine state transitions when `process.env.NODE_ENV !== 'production'`. `console.error` always.
- **Error responses:** `{ ok: false, error: string }` (HTTP 400 for validation/state, 500 for engine throws). Same shape as poker.
- **Reset:** `POST /api/mahjong/end` deletes `mahjong:game` and emits `game-ended`.

## 15. Open questions (resolved during brainstorming)

- ✅ Code isolation: same project, separate routes (`/mahjong`, `/api/mahjong/*`).
- ✅ Rule scope: blood-battle minimal (no 换三张, no 抢杠胡, no 杠上花, no 龙七对).
- ✅ Room model: single global room with seat selection (东南西北).
- ✅ AI scheduling: server-driven AI chain in same HTTP request.
- ✅ UI style: dark theme with traditional Unicode mahjong glyphs, 中文 text.
- ✅ Claim-window mechanics: single phase with explicit pass; multi-hu allowed.
- ✅ 血战到底 hu'd-players behavior: locked after hu (MVP simplification).
- ✅ 查叫 penalty: skipped for MVP.
- ✅ Scoring formula: `2^fan` chips per hu.
- ✅ Claim-window timer: 10 seconds, lazy expiration.
- ✅ AI strength: rule-based, "beginning human" level.
- ✅ AI pacing: ~600ms client-side delay per AI move.
- ✅ Tile-tap-to-discard: click once selects, click again confirms.
- ✅ Orientation: landscape-only.
