import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { TheoryDB, TheoryMove, Side, FeedbackStatus } from '../types'

export interface HintMove { from: string; to: string }

export interface MoveRecord {
  from: string
  to: string
  isUserMove: boolean
  isBest: boolean
  eval?: number       // centipawns of the resulting position (white's POV)
  variation?: string  // variation label this move belongs to
  bestFrom?: string
  bestTo?: string
}

// How good the user's move was, handed back on every correct move so callers
// (e.g. run-mode scoring) can grade it without re-deriving eval state.
export interface MoveQuality {
  isBest: boolean
  dropCp?: number // centipawns worse than the best move; undefined when no eval data
}

interface TrainerCallbacks {
  onCorrect?: (quality: MoveQuality) => void
  onWrong?: () => void
  onEndOfTheory?: (isPerfect: boolean, variation: string) => void
}

export interface TrainerConfig {
  ownThreshold?: number      // centipawns: max eval drop for user moves (Infinity = any)
  opponentThreshold?: number // centipawns: max eval drop for opponent candidates (Infinity = any)
}

function getBestEval(moves: TheoryMove[], whiteTurn: boolean): number | undefined {
  const evals = moves.map(m => m.eval).filter((e): e is number => e !== undefined)
  if (!evals.length) return undefined
  return whiteTurn ? Math.max(...evals) : Math.min(...evals)
}

function getEvalDrop(moveEval: number, bestEval: number, whiteTurn: boolean): number {
  return whiteTurn ? bestEval - moveEval : moveEval - bestEval
}

// Why a line stopped: no theory moves left at all, vs. moves exist but all
// exceed the configured eval-drop threshold.
export type EndReason = 'no-moves' | 'below-threshold'

// Moves that are acceptable to play given the eval threshold for this turn.
// Returns [] when moves exist but every one is below threshold.
function playableMoves(moves: TheoryMove[], whiteTurn: boolean, threshold: number): TheoryMove[] {
  if (!isFinite(threshold)) return moves
  const bestEval = getBestEval(moves, whiteTurn)
  if (bestEval === undefined) return moves
  return moves.filter(m => m.eval === undefined || getEvalDrop(m.eval, bestEval, whiteTurn) <= threshold)
}

// ── Debug info for eval-based training ────────────────────────────────────────

export interface DebugMoveInfo {
  san: string
  evalCp?: number       // white's-POV centipawns of the resulting position
  dropCp?: number       // eval drop vs. the best move for the side to move
  playable: boolean     // within the active threshold
  isBest: boolean
  pathPlies: number     // longest line reachable through the DB after this move
  pathLine: string[]    // SAN sequence of that longest line
}

export interface DebugInfo {
  fen: string
  whiteToMove: boolean
  sideToMoveIsUser: boolean
  threshold: number
  bestEvalCp?: number
  moves: DebugMoveInfo[]
}

// Longest chain of moves still contained in the DB, starting from `fen`.
// FEN keys carry move counters, so a line can never revisit a node — no cycles.
function longestPathFrom(
  fen: string,
  db: TheoryDB,
  memo: Map<string, { plies: number; line: string[] }>,
): { plies: number; line: string[] } {
  const cached = memo.get(fen)
  if (cached) return cached

  const node = db[fen]
  let best: { plies: number; line: string[] } = { plies: 0, line: [] }
  if (node && node.moves.length > 0) {
    for (const m of node.moves) {
      const c = new Chess(fen)
      try { c.move(m.move) } catch { continue }
      const sub = longestPathFrom(c.fen(), db, memo)
      if (sub.plies + 1 > best.plies) best = { plies: sub.plies + 1, line: [m.move, ...sub.line] }
    }
  }
  memo.set(fen, best)
  return best
}

// Weighted random pick: candidates leading to a longer remaining theory line
// are proportionally more likely to be chosen than ones leading to a short
// dead end, so the app doesn't cut training sessions short as often.
function pickWeighted<T>(items: T[], weight: (item: T) => number): T {
  const weights = items.map(weight)
  const total = weights.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return items[Math.floor(Math.random() * items.length)]
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function getBestSquares(moves: TheoryMove[], bestEval: number, whiteTurn: boolean, fen: string): { from: string; to: string } | undefined {
  const bestM = moves.find(m => m.eval !== undefined && Math.abs(getEvalDrop(m.eval, bestEval, whiteTurn)) < 0.5)
  if (!bestM) return undefined
  const test = new Chess(fen)
  try {
    const r = test.move(bestM.move)
    return r ? { from: r.from, to: r.to } : undefined
  } catch { return undefined }
}

function getFinalMoveArrows(fen: string, db: TheoryDB): HintMove[] {
  const node = db[fen]
  if (!node || node.moves.length < 2) return []

  const allLeaf = node.moves.every((m) => {
    const t = new Chess(fen)
    try {
      t.move(m.move)
      const child = db[t.fen()]
      return !child || child.moves.length === 0
    } catch {
      return false
    }
  })
  if (!allLeaf) return []

  return node.moves.flatMap((m) => {
    const t = new Chess(fen)
    const r = t.move(m.move)
    return r ? [{ from: r.from, to: r.to }] : []
  })
}

export function useTrainer(
  db: TheoryDB,
  side: Side,
  callbacks: TrainerCallbacks = {},
  config: TrainerConfig = {},
) {
  const { ownThreshold = Infinity, opponentThreshold = Infinity } = config
  const chess = useRef(new Chess())
  const [fen, setFen] = useState(chess.current.fen())
  const [fenHistory, setFenHistory] = useState<string[]>(() => [chess.current.fen()])
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([])
  const [feedback, setFeedback] = useState<FeedbackStatus>('idle')
  const [variationName, setVariationName] = useState('')
  const variationNameRef = useRef('')
  const [hintMoves, setHintMoves] = useState<HintMove[]>([])
  const [endReason, setEndReason] = useState<EndReason | null>(null)
  const sessionWrongsRef = useRef(0)
  const appColor = side === 'white' ? 'b' : 'w'
  const userIsWhite = side === 'white'

  const { onCorrect, onWrong, onEndOfTheory } = callbacks

  // Track pending timers (app reply, reveal animation) so an undo can cancel them.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id)
      fn()
    }, ms)
    timersRef.current.push(id)
  }, [])
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const pushFen = useCallback((newFen: string) => {
    setFen(newFen)
    setFenHistory(h => [...h, newFen])
  }, [])

  const pushRecord = useCallback((rec: MoveRecord) => {
    setMoveHistory(h => [...h, rec])
  }, [])

  const endLine = useCallback((hasMovesBelowThreshold: boolean, variation: string) => {
    setHintMoves([])
    setEndReason(hasMovesBelowThreshold ? 'below-threshold' : 'no-moves')
    setFeedback('end-of-theory')
    onEndOfTheory?.(sessionWrongsRef.current === 0, variation)
  }, [onEndOfTheory])

  const playAppMove = useCallback(() => {
    const currentFen = chess.current.fen()
    const node = db[currentFen]

    const candidates = node ? playableMoves(node.moves, !userIsWhite, opponentThreshold) : []
    if (candidates.length === 0) {
      endLine(!!node && node.moves.length > 0, variationNameRef.current)
      return
    }

    const pathMemo = new Map<string, { plies: number; line: string[] }>()
    const picked = pickWeighted(candidates, (m) => {
      const c = new Chess(currentFen)
      try { c.move(m.move) } catch { return 1 }
      return longestPathFrom(c.fen(), db, pathMemo).plies + 1
    })
    const moveResult = chess.current.move(picked.move)
    if (!moveResult) return

    const newFen = chess.current.fen()
    pushFen(newFen)
    pushRecord({ from: moveResult.from, to: moveResult.to, isUserMove: false, isBest: false, eval: picked.eval, variation: picked.variation })
    variationNameRef.current = picked.variation
    setVariationName(picked.variation)

    const nextNode = db[newFen]
    const userCandidates = nextNode ? playableMoves(nextNode.moves, userIsWhite, ownThreshold) : []
    if (userCandidates.length === 0) {
      endLine(!!nextNode && nextNode.moves.length > 0, picked.variation)
    } else {
      setHintMoves(getFinalMoveArrows(newFen, db))
    }
  }, [db, endLine, pushFen, pushRecord, opponentThreshold, ownThreshold, userIsWhite])

  useEffect(() => {
    if (chess.current.turn() !== appColor) return
    const timer = setTimeout(playAppMove, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appColor])

  const onUserMove = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (chess.current.turn() === appColor) return false

      const beforeFen = chess.current.fen()

      let moveResult: ReturnType<typeof chess.current.move>
      try {
        moveResult = chess.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
      } catch {
        return false
      }

      const afterFen = chess.current.fen()
      const node = db[beforeFen]

      if (!node) {
        chess.current.undo()
        setFeedback('out-of-theory')
        return false
      }

      const matched = node.moves.find((m) => {
        const test = new Chess(beforeFen)
        try { test.move(m.move); return test.fen() === afterFen } catch { return false }
      })

      if (!matched) {
        chess.current.undo()
        setFeedback('wrong')
        sessionWrongsRef.current += 1
        onWrong?.()
        return false
      }

      const bestEval = getBestEval(node.moves, userIsWhite)
      let isBest = false
      let dropCp: number | undefined

      if (bestEval !== undefined && matched.eval !== undefined) {
        const drop = getEvalDrop(matched.eval, bestEval, userIsWhite)
        dropCp = drop
        if (isFinite(ownThreshold) && drop > ownThreshold) {
          chess.current.undo()
          setFeedback('too-weak')
          sessionWrongsRef.current += 1
          onWrong?.()
          return false
        }
        isBest = drop < 0.5
      }

      let bestFrom: string | undefined
      let bestTo: string | undefined
      if (!isBest && bestEval !== undefined) {
        const bsq = getBestSquares(node.moves, bestEval, userIsWhite, beforeFen)
        bestFrom = bsq?.from
        bestTo = bsq?.to
      }

      pushFen(afterFen)
      pushRecord({ from: moveResult.from, to: moveResult.to, isUserMove: true, isBest, eval: matched.eval, variation: matched.variation, bestFrom, bestTo })
      variationNameRef.current = matched.variation
      setVariationName(matched.variation)
      setFeedback(isBest ? 'correct-best' : 'correct')
      setHintMoves([])
      onCorrect?.({ isBest, dropCp })

      schedule(() => {
        setFeedback('idle')
        playAppMove()
      }, 600)

      return true
    },
    [appColor, db, playAppMove, pushFen, pushRecord, onCorrect, onWrong, ownThreshold, userIsWhite, schedule],
  )

  const revealAnswer = useCallback(() => {
    const currentFen = chess.current.fen()
    const node = db[currentFen]
    if (!node || node.moves.length === 0) return

    // Reveal a move that satisfies the eval threshold when possible.
    const pool = playableMoves(node.moves, userIsWhite, ownThreshold)
    const choices = pool.length > 0 ? pool : node.moves
    const picked = choices[Math.floor(Math.random() * choices.length)]
    const test = new Chess(currentFen)
    const previewResult = test.move(picked.move)
    if (!previewResult) return

    setHintMoves([{ from: previewResult.from, to: previewResult.to }])
    setFeedback('idle')

    schedule(() => {
      const moveResult = chess.current.move(picked.move)
      if (!moveResult) return
      const newFen = chess.current.fen()
      pushFen(newFen)
      pushRecord({ from: moveResult.from, to: moveResult.to, isUserMove: false, isBest: false, eval: picked.eval, variation: picked.variation })
      variationNameRef.current = picked.variation
      setVariationName(picked.variation)
      setHintMoves([])
      setFeedback('idle')
      schedule(() => playAppMove(), 600)
    }, 1000)
  }, [db, playAppMove, pushFen, pushRecord, ownThreshold, userIsWhite, schedule])

  // Revert to the position just before the user's most recent move, so it can
  // be replayed. Removes that user move plus any app reply that followed it.
  const undoMove = useCallback(() => {
    let lastUserIdx = -1
    for (let i = moveHistory.length - 1; i >= 0; i--) {
      if (moveHistory[i].isUserMove) { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return

    clearTimers()
    const plies = moveHistory.length - lastUserIdx
    for (let i = 0; i < plies; i++) chess.current.undo()

    const newFen = chess.current.fen()
    const prevVar = lastUserIdx > 0 ? (moveHistory[lastUserIdx - 1].variation ?? '') : ''

    setFen(newFen)
    setFenHistory(h => h.slice(0, lastUserIdx + 1))
    setMoveHistory(h => h.slice(0, lastUserIdx))
    variationNameRef.current = prevVar
    setVariationName(prevVar)
    setFeedback('idle')
    setEndReason(null)
    setHintMoves(getFinalMoveArrows(newFen, db))
  }, [moveHistory, db, clearTimers])

  const debugInfo = useMemo<DebugInfo | null>(() => {
    const node = db[fen]
    if (!node || node.moves.length === 0) return null

    const whiteToMove = fen.split(' ')[1] === 'w'
    const userColor = userIsWhite ? 'w' : 'b'
    const sideToMoveIsUser = (whiteToMove ? 'w' : 'b') === userColor
    const threshold = sideToMoveIsUser ? ownThreshold : opponentThreshold

    const bestEvalCp = getBestEval(node.moves, whiteToMove)
    const playableSet = new Set(playableMoves(node.moves, whiteToMove, threshold))
    const memo = new Map<string, { plies: number; line: string[] }>()

    const moves: DebugMoveInfo[] = node.moves.map((m) => {
      const c = new Chess(fen)
      let san = m.move
      let moved = false
      try { san = c.move(m.move)?.san ?? m.move; moved = true } catch { /* keep raw */ }
      const dropCp = bestEvalCp !== undefined && m.eval !== undefined
        ? getEvalDrop(m.eval, bestEvalCp, whiteToMove)
        : undefined
      const path = moved ? longestPathFrom(c.fen(), db, memo) : { plies: 0, line: [] }
      return {
        san,
        evalCp: m.eval,
        dropCp,
        playable: playableSet.has(m),
        isBest: dropCp !== undefined && dropCp < 0.5,
        pathPlies: path.plies,
        pathLine: path.line,
      }
    })

    moves.sort((a, b) => {
      if (a.evalCp === undefined && b.evalCp === undefined) return b.pathPlies - a.pathPlies
      if (a.evalCp === undefined) return 1
      if (b.evalCp === undefined) return -1
      return whiteToMove ? b.evalCp - a.evalCp : a.evalCp - b.evalCp
    })

    return { fen, whiteToMove, sideToMoveIsUser, threshold, bestEvalCp, moves }
  }, [db, fen, ownThreshold, opponentThreshold, userIsWhite])

  return { fen, fenHistory, moveHistory, feedback, variationName, hintMoves, endReason, debugInfo, onUserMove, revealAnswer, undoMove }
}
