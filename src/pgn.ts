import { Chess } from 'chess.js'
import type { TheoryDB, TheoryMove } from './types'

/**
 * Parse a PGN (with recursive variations and `[%eval]` annotations) into a
 * FEN-keyed theory DB. Transpositions unify naturally since nodes are keyed by
 * FEN. Every move is tagged with `varName`.
 */
export function parsePgnToDb(pgn: string, varName: string): TheoryDB {
  // Strip PGN headers ([TagName "value"]) but NOT inline annotations like [%eval 0.23]
  let text = pgn.replace(/\[[A-Za-z]\w*\s+"[^"]*"\]\s*/g, '')
  // Keep {} comments for eval extraction — strip only ; line comments
  text = text.replace(/;[^\n]*/g, '')
  text = text.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\s*$/, '')

  // Include {…} comment blocks as tokens to extract [%eval] annotations
  const tokens = text.match(/\{[^}]*\}|[()]|\d+\.+|[A-Za-z][A-Za-z0-9+#=\-]*/g) ?? []
  const db: TheoryDB = {}

  let lastAddedMove: TheoryMove | null = null

  function addMove(fen: string, san: string) {
    if (!db[fen]) db[fen] = { opening: varName, moves: [] }
    const existing = db[fen].moves.find((m) => m.move === san)
    if (existing) { lastAddedMove = existing; return }
    const m: TheoryMove = { move: san, variation: varName }
    db[fen].moves.push(m)
    lastAddedMove = m
  }

  function walk(idx: number, chess: Chess, branchFen: string | null): number {
    let prevFen = branchFen
    while (idx < tokens.length) {
      const tok = tokens[idx]
      if (tok === ')') return idx + 1
      if (tok === '(') {
        const savedLast = lastAddedMove
        if (prevFen !== null) {
          idx = walk(idx + 1, new Chess(prevFen), null)
        } else {
          // No branch point yet — skip to matching ')'
          let depth = 1; idx++
          while (idx < tokens.length && depth > 0) {
            if (tokens[idx] === '(') depth++
            else if (tokens[idx] === ')') depth--
            idx++
          }
        }
        lastAddedMove = savedLast
        continue
      }
      if (tok.startsWith('{')) {
        // Extract Stockfish eval: [%eval N.NN] — skip mate scores like #3
        const m = tok.match(/\[%eval\s+([+\-]?\d+\.?\d*)\]/)
        if (m && lastAddedMove) {
          const val = parseFloat(m[1])
          if (!isNaN(val)) lastAddedMove.eval = Math.round(val * 100)
        }
        idx++
        continue
      }
      if (/^\d+\./.test(tok)) { idx++; continue }
      // SAN move
      const before = chess.fen()
      try {
        chess.move(tok)
        addMove(before, tok)
        prevFen = before
      } catch { /* skip invalid token */ }
      idx++
    }
    return idx
  }

  walk(0, new Chess(), null)
  return db
}

/** Pull a display name out of the PGN's Opening/Variation/Event header. */
export function extractPgnName(pgn: string): string {
  const m = pgn.match(/\[(?:Opening|Variation|Event)\s+"([^"]+)"\]/)
  return m ? m[1] : ''
}
