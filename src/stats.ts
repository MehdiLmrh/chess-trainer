export interface OpeningStats {
  played: number
  completed: number
  perfect: number
  corrects: number
  wrongs: number
}

export type StatsDB = Record<string, OpeningStats>

const KEY = 'chess-trainer-stats'

export function loadStats(): StatsDB {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

function save(db: StatsDB): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

function blank(): OpeningStats {
  return { played: 0, completed: 0, perfect: 0, corrects: 0, wrongs: 0 }
}

function patch(
  db: StatsDB,
  opening: string,
  fn: (s: OpeningStats) => OpeningStats,
): StatsDB {
  const next = { ...db, [opening]: fn(db[opening] ?? blank()) }
  save(next)
  return next
}

export function recordStart(db: StatsDB, opening: string): StatsDB {
  return patch(db, opening, (s) => ({ ...s, played: s.played + 1 }))
}

export function recordCorrect(db: StatsDB, opening: string): StatsDB {
  return patch(db, opening, (s) => ({ ...s, corrects: s.corrects + 1 }))
}

export function recordWrong(db: StatsDB, opening: string): StatsDB {
  return patch(db, opening, (s) => ({ ...s, wrongs: s.wrongs + 1 }))
}

export function recordComplete(db: StatsDB, opening: string, isPerfect: boolean): StatsDB {
  return patch(db, opening, (s) => ({
    ...s,
    completed: s.completed + 1,
    perfect: s.perfect + (isPerfect ? 1 : 0),
  }))
}

export type StarLevel = 'none' | 'empty' | 'gold1' | 'gold2' | 'gold3'

export function starLevel(s: OpeningStats | undefined): StarLevel {
  if (!s || s.completed === 0) return 'none'
  if (s.perfect >= 10) return 'gold3'
  if (s.perfect >= 5)  return 'gold2'
  if (s.perfect >= 1)  return 'gold1'
  return 'empty'
}

export function accuracy(s: OpeningStats): string {
  const total = s.corrects + s.wrongs
  if (total === 0) return '—'
  return `${Math.round((s.corrects / total) * 100)}%`
}
