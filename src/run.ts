// "Run" mode: an arcade-style session that cycles through the deck with a
// limited number of lives, tracking a quality-weighted score along the way.

export const RUN_MAX_LIVES = 3

export interface RunStats {
  lives: number
  score: number
  correctMoves: number
  openingsCleared: number
  combo: number
  bestCombo: number
}

export function initialRunStats(): RunStats {
  return {
    lives: RUN_MAX_LIVES,
    score: 0,
    correctMoves: 0,
    openingsCleared: 0,
    combo: 0,
    bestCombo: 0,
  }
}

// Points for one correct move. When eval data is available, the best move is
// worth ~100 and points decay with the centipawn drop down to a floor of 10;
// without eval data (plain theory) every correct move earns that same floor.
export function pointsForMove(info: { dropCp?: number }): number {
  if (info.dropCp === undefined) return 10
  return Math.max(10, Math.round(100 - info.dropCp))
}
