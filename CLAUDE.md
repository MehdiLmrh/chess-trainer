# Chess Theory Trainer - Project Architecture

## 1. Project Overview
The **Chess Theory Trainer** is a minimalist, focused application designed to build muscle memory for chess openings through active recall. Unlike general-purpose chess engines, this app acts as a digital flashcard system for theoretical variations.

### Core Concept
- **Select:** The user chooses an opening and a side (White/Black).
- **Interact:** The app plays a move according to theory; the user must respond with the correct theoretical move.
- **Branch:** The app randomly picks between theoretical responses, forcing the user to learn all main variations, not just one line.

---

## 2. Technical Stack
| Tool | Version | Role |
|------|---------|------|
| Vite | 6 | Build tool / dev server |
| React | 19 | UI framework |
| TypeScript | 5.8 | Type safety |
| chess.js | 1 | Chess rules, move validation, FEN |
| react-chessboard | 5 | Board rendering and drag-and-drop |

> **Note:** react-chessboard v5 changed `onPieceDrop` to receive a single object `{ piece, sourceSquare, targetSquare }` instead of positional arguments.

---

## 3. Project Structure

```
src/
├── types.ts                  # TheoryDB, TheoryNode, TheoryMove, Side, FeedbackStatus
├── data/
│   └── lichess.ts            # Lichess opening DB fetch + TheoryDB builder
├── hooks/
│   └── useTrainer.ts         # Core game loop (FEN lookup, validation, app replies)
├── App.tsx                   # Setup screen → board + feedback UI
└── App.css
```

---

## 4. System Architecture

### A. Data Layer (The Theory Tree)

Each node in the theory database is keyed by its **FEN string**. This naturally handles transpositions — if two move orders reach the same position, it's the same node.

**Type:**
```ts
type TheoryDB = Record<string, {
  opening: string
  moves: { move: string; variation: string }[]
}>
```

**Example:**
```json
{
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1": {
    "opening": "King's Pawn Opening",
    "moves": [
      { "move": "d5", "variation": "Scandinavian Defense" },
      { "move": "e5", "variation": "Open Game" }
    ]
  }
}
```

### B. Logic Controller (`useTrainer` hook)

1. **App turn:** look up current FEN in the DB, pick a random child move, play it after a short delay.
2. **User turn:** attempt the move; verify the resulting FEN matches one of the theoretical children of the previous FEN.
   - Match → `correct`, advance, trigger app reply.
   - No match → `wrong`, undo the move, let user retry.
   - FEN not in DB → `out-of-theory`.

---

## 5. Key Features
- **Branching mastery:** random app replies prevent memorizing a single line.
- **Transposition support:** FEN keys automatically unify positions reached via different move orders.
- **Minimalist feedback:** `Correct` / `Not in theory — try again` / `Position not in database`.

---

## 6. Development Roadmap

### Phase 1 — MVP (done)
- [x] Vite + React + TypeScript scaffold
- [x] chess.js + react-chessboard integration
- [x] FEN-keyed theory tree data structure
- [x] Core move-validation loop (`useTrainer`)
- [x] Hardcoded Scandinavian Defense variations
- [x] Side selector (play White or Black)

### Phase 2 — Data Integration
- [ ] Parser for the Lichess TSV/PGN opening database
- [ ] Opening search/filter UI (replace hardcoded data)

### Phase 3 — Polish & Progress
- [ ] Mastery tracking (% of correct attempts per variation)
- [ ] WASM Stockfish for out-of-theory evaluation
- [ ] Strategic tooltips explaining the "why" behind moves

---

## 7. Spaced Repetition (Deck Practice)

`src/srs.ts` schedules which deck entries get drawn again, biased away from
lines you've recently been acing — a Leitner-style scheduler.

### Key design decision: per-line, not per-opening

Big repertoire PGNs (hundreds to thousands of positions) make whole-opening
granularity dangerous: perfecting *one* line through a giant tree must not
quiet the whole entry — there could be thousands of other lines still
untouched. So review state is keyed by **the exact line played**, not the
opening as a whole:

```ts
type SrsDB = Record<string /* `${entryKey}\0${lineKey}` */, LineCard>

interface LineCard {
  box: number          // Leitner box (0 = needs practice again soon)
  dueAt: number         // epoch ms
  reps: number
  lastMistakes: number
}
```
- `entryKey` = the deck entry's `customId ?? rootName` (`srsEntryKey()` in `deck.ts`).
- `lineKey` = side + every square moved along that specific line (computed in
  `useTrainer.ts`'s `endLine`, from a `moveHistory` ref so it's available
  synchronously the instant the line ends).

### Grading (`recordReview`)
Boxes 0‑6 map to review gaps of `[0, 1, 3, 7, 16, 35, 75]` days.
- **0 mistakes** → promote a box (reviewed further out).
- **1–2 tiny mistakes** → hold steady (still a success, just not flawless).
- **3+ mistakes** → back to box 0 (needs review again soon).

### Sampling weight (`entryStatus` / `entryWeight`)
An entry's draw weight only trusts the average freshness of its *known*
lines once **≥ 12 distinct lines** are on record (`EXPLORATION_LINES`); below
that, weight stays close to 1 ("brand new") no matter how well those few
lines went. Weight never drops below a **0.12 floor** — nothing is ever fully
retired from rotation.

### Where it plugs in
- `deck.ts`'s `buildSessionQueue` rerolls each entry's **inclusion** in a lap
  against its weight (due/new entries always make the cut; well-drilled ones
  increasingly sit a lap out), then weighted-shuffles what's left. This is
  genuine frequency reduction, not just reordering.
- `App.tsx` persists the `SrsDB` to `localStorage`, tracks the active deck
  entry via a ref, and calls `recordReview` from `onEndOfTheory` — **only**
  during deck-mode sessions (single-opening training doesn't feed the
  scheduler).
- `components/Deck.tsx` shows a small `🔁 new` / `🔁 N due` / `🔁 resting`
  badge per entry.

---

## 8. References
- Lichess Openings dataset: https://github.com/lichess-org/chess-openings
- chess.js: https://github.com/jhlywa/chess.js
