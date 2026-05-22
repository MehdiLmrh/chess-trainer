import { Chess } from 'chess.js'
import type { TheoryDB } from '../types'

export interface Opening {
  eco: string
  name: string
  pgn: string
}

export interface CleanupStats {
  totalBefore: number
  totalAfter: number
  prefixRemoved: number
  finalMoveGroups: number
}

const FILES = ['a', 'b', 'c', 'd', 'e']
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'

// Bump this when cleanOpenings logic changes to force a re-download.
const CACHE_KEY = 'chess-trainer-openings-v1'

interface CachedData { openings: Opening[]; stats: CleanupStats }

let cached: Opening[] | null = null
let _cleanupStats: CleanupStats | null = null

export function getCleanupStats(): CleanupStats | null {
  return _cleanupStats
}

function parsePGN(pgn: string): string[] {
  return pgn
    .replace(/\d+\.\s*/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function cleanOpenings(openings: Opening[]): Opening[] {
  const byName: Record<string, Opening[]> = {}
  for (const o of openings) {
    if (!byName[o.name]) byName[o.name] = []
    byName[o.name].push(o)
  }

  let prefixRemoved = 0
  let finalMoveGroups = 0
  const result: Opening[] = []

  for (const group of Object.values(byName)) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }

    const parsed = group.map((o) => ({ ...o, moves: parsePGN(o.pgn) }))
    parsed.sort((a, b) => b.moves.length - a.moves.length)

    // Mark entries whose PGN is a strict prefix of any longer same-name entry
    const skip = new Set<number>()
    for (let i = 0; i < parsed.length; i++) {
      for (let j = 0; j < parsed.length; j++) {
        if (i === j || skip.has(j)) continue
        const s = parsed[i].moves
        const l = parsed[j].moves
        if (s.length < l.length && s.every((m, k) => m === l[k])) {
          skip.add(i)
          break
        }
      }
    }
    prefixRemoved += skip.size
    const survivors = parsed.filter((_, i) => !skip.has(i))

    // Count groups of survivors that share the same prefix but differ only in last move
    const prefixCounts: Record<string, number> = {}
    for (const { moves } of survivors) {
      const key = moves.slice(0, -1).join('\0')
      prefixCounts[key] = (prefixCounts[key] ?? 0) + 1
    }
    for (const count of Object.values(prefixCounts)) {
      if (count > 1) finalMoveGroups++
    }

    for (const { eco, name, pgn } of survivors) result.push({ eco, name, pgn })
  }

  _cleanupStats = {
    totalBefore: openings.length,
    totalAfter: result.length,
    prefixRemoved,
    finalMoveGroups,
  }

  return result
}

export async function fetchOpenings(): Promise<Opening[]> {
  if (cached) return cached

  // Try localStorage first
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const { openings, stats } = JSON.parse(stored) as CachedData
      cached = openings
      _cleanupStats = stats
      return cached
    }
  } catch { /* ignore parse errors */ }

  // Download and clean
  const results = await Promise.all(
    FILES.map((f) => fetch(`${BASE}/${f}.tsv`).then((r) => r.text())),
  )

  const raw: Opening[] = []
  for (const text of results) {
    const lines = text.trim().split('\n').slice(1) // skip header
    for (const line of lines) {
      const [eco, name, pgn] = line.split('\t')
      if (eco && name && pgn) raw.push({ eco, name, pgn })
    }
  }

  cached = cleanOpenings(raw)

  // Persist to localStorage
  try {
    const data: CachedData = { openings: cached, stats: _cleanupStats! }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded or private browsing */ }

  return cached
}

export function pgnLength(pgn: string): number {
  return parsePGN(pgn).length
}

export function getRootNames(openings: Opening[], minMoves = 0): string[] {
  const roots = new Set(
    openings
      .filter((o) => pgnLength(o.pgn) >= minMoves)
      .map((o) => o.name.split(':')[0].trim()),
  )
  return Array.from(roots).sort()
}

export function getVariations(openings: Opening[], rootName: string, minMoves = 0): string[] {
  const seen = new Set<string>()
  for (const o of openings) {
    if (
      (o.name === rootName || o.name.startsWith(rootName + ':')) &&
      pgnLength(o.pgn) >= minMoves
    ) {
      seen.add(o.name)
    }
  }
  return Array.from(seen).sort()
}

export function filterDB(db: TheoryDB, excluded: string[]): TheoryDB {
  if (excluded.length === 0) return db
  const set = new Set(excluded)
  const result: TheoryDB = {}
  for (const [fen, node] of Object.entries(db)) {
    const moves = node.moves.filter((m) => !set.has(m.variation))
    if (moves.length > 0) result[fen] = { ...node, moves }
  }
  return result
}

export function buildTheoryDB(
  openings: Opening[],
  rootName: string,
  minMoves = 0,
  mainLineOnly = false,
  allowedVariations?: Set<string>,
): TheoryDB {
  const relevant = openings.filter(
    (o) =>
      (o.name === rootName || o.name.startsWith(rootName + ':')) &&
      pgnLength(o.pgn) >= minMoves &&
      (!mainLineOnly || o.name.toLowerCase().includes('main line')) &&
      (!allowedVariations || allowedVariations.has(o.name)),
  )

  const db: TheoryDB = {}

  for (const opening of relevant) {
    const moves = parsePGN(opening.pgn)
    const chess = new Chess()

    for (const san of moves) {
      const fen = chess.fen()
      if (!db[fen]) db[fen] = { opening: opening.name, moves: [] }

      const targetFen = (() => {
        const t = new Chess(fen)
        try { t.move(san); return t.fen() } catch { return null }
      })()

      if (!targetFen) break

      const alreadyListed = db[fen].moves.some((m) => {
        const t = new Chess(fen)
        try { t.move(m.move); return t.fen() === targetFen } catch { return false }
      })

      if (!alreadyListed) {
        db[fen].moves.push({ move: san, variation: opening.name })
      }

      try {
        chess.move(san)
      } catch {
        break
      }
    }
  }

  return db
}
