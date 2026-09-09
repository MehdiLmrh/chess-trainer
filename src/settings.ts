// User-adjustable preferences, persisted to localStorage.

export interface EvalSettings {
  /** Max centipawn drop from the best move for the user's own moves to count as correct. */
  ownThresholdCp: number
  /** Max centipawn drop for a move to be eligible as an opponent reply. */
  opponentThresholdCp: number
}

export const DEFAULT_EVAL_SETTINGS: EvalSettings = {
  ownThresholdCp: 30,
  opponentThresholdCp: 50,
}

export const OWN_THRESHOLD_MAX = 100
export const OPPONENT_THRESHOLD_MAX = 200

const KEY = 'chess-trainer-eval-settings'

function clamp(v: unknown, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.min(max, Math.max(0, n))
}

export function loadEvalSettings(): EvalSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      ownThresholdCp: clamp(raw.ownThresholdCp, OWN_THRESHOLD_MAX, DEFAULT_EVAL_SETTINGS.ownThresholdCp),
      opponentThresholdCp: clamp(raw.opponentThresholdCp, OPPONENT_THRESHOLD_MAX, DEFAULT_EVAL_SETTINGS.opponentThresholdCp),
    }
  } catch {
    return { ...DEFAULT_EVAL_SETTINGS }
  }
}

export function saveEvalSettings(s: EvalSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* private browsing / quota — settings just won't persist */ }
}
