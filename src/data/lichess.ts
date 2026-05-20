import { Chess } from 'chess.js'
import type { TheoryDB } from '../types'

export interface Opening {
  eco: string
  name: string
  pgn: string
}

const FILES = ['a', 'b', 'c', 'd', 'e']
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'

let cached: Opening[] | null = null

export async function fetchOpenings(): Promise<Opening[]> {
  if (cached) return cached

  const results = await Promise.all(
    FILES.map((f) => fetch(`${BASE}/${f}.tsv`).then((r) => r.text())),
  )

  const openings: Opening[] = []
  for (const text of results) {
    const lines = text.trim().split('\n').slice(1) // skip header
    for (const line of lines) {
      const [eco, name, pgn] = line.split('\t')
      if (eco && name && pgn) openings.push({ eco, name, pgn })
    }
  }

  cached = openings
  return openings
}

function parsePGN(pgn: string): string[] {
  return pgn
    .replace(/\d+\.\s*/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
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

export function filterToMainLines(db: TheoryDB): TheoryDB {
  const result: TheoryDB = {}
  for (const [fen, node] of Object.entries(db)) {
    const moves = node.moves.filter((m) => m.variation.toLowerCase().includes('main line'))
    if (moves.length > 0) result[fen] = { ...node, moves }
  }
  return result
}

export function buildTheoryDB(openings: Opening[], rootName: string, minMoves = 0): TheoryDB {
  const relevant = openings.filter(
    (o) =>
      (o.name === rootName || o.name.startsWith(rootName + ':')) &&
      pgnLength(o.pgn) >= minMoves,
  )

  const db: TheoryDB = {}

  for (const opening of relevant) {
    const moves = parsePGN(opening.pgn)
    const chess = new Chess()

    for (const san of moves) {
      const fen = chess.fen()
      if (!db[fen]) db[fen] = { opening: opening.name, moves: [] }

      // Deduplicate: check if this SAN already resolves to a known move
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
