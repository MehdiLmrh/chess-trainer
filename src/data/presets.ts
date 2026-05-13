import { Chess } from 'chess.js'
import type { TheoryDB } from '../types'

function buildLineDB(moves: string[], name: string): TheoryDB {
  const db: TheoryDB = {}
  const chess = new Chess()
  for (const san of moves) {
    const fen = chess.fen()
    db[fen] = { opening: name, moves: [{ move: san, variation: name }] }
    try {
      chess.move(san)
    } catch {
      break
    }
  }
  return db
}

export const PRESETS: { label: string; db: TheoryDB }[] = [
  {
    label: 'Scandinavian: Main Line',
    db: buildLineDB(
      ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3', 'Bf5', 'Bc4', 'e6', 'Bd2', 'c6'],
      'Scandinavian Defense: Main Line (Qa5)',
    ),
  },
]
