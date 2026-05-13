import type { TheoryDB } from '../types'

export const scandinavianDB: TheoryDB = {
  // Starting position — White plays 1.e4
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': {
    opening: "King's Pawn Opening",
    moves: [{ move: 'e4', variation: "King's Pawn Opening" }],
  },
  // After 1.e4 — Black plays 1...d5
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1': {
    opening: "King's Pawn Opening",
    moves: [{ move: 'd5', variation: 'Scandinavian Defense' }],
  },
  // After 1.e4 d5 — White plays 2.exd5
  'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': {
    opening: 'Scandinavian Defense',
    moves: [{ move: 'exd5', variation: 'Scandinavian Defense: 2.exd5' }],
  },
  // After 1.e4 d5 2.exd5 — Black plays 2...Qxd5
  'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2': {
    opening: 'Scandinavian Defense',
    moves: [{ move: 'Qxd5', variation: 'Scandinavian: Main Line' }],
  },
  // After 1.e4 d5 2.exd5 Qxd5 — White plays 3.Nc3
  'rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3': {
    opening: 'Scandinavian Defense: Main Line',
    moves: [{ move: 'Nc3', variation: 'Scandinavian: 3.Nc3' }],
  },
  // After 1.e4 d5 2.exd5 Qxd5 3.Nc3 — Black plays 3...Qa5
  'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3': {
    opening: 'Scandinavian Defense: 3.Nc3',
    moves: [{ move: 'Qa5', variation: 'Scandinavian: Qa5 Variation' }],
  },
}
