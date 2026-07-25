import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { TheoryDB, TheoryMove, Side, FeedbackStatus } from '../types'

export interface HintMove { from: string; to: string }

export interface MoveRecord {
  from: string
  to: string
  isUserMove: boolean
  isBest: boolean
  eval?: number       // centipawns of the resulting position (white's POV)
  bestFrom?: string
  bestTo?: string
}

interface TrainerCallbacks {
  onCorrect?: () => void
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
  const sessionWrongsRef = useRef(0)
  const appColor = side === 'white' ? 'b' : 'w'
  const userIsWhite = side === 'white'

  const { onCorrect, onWrong, onEndOfTheory } = callbacks

  const pushFen = useCallback((newFen: string) => {
    setFen(newFen)
    setFenHistory(h => [...h, newFen])
  }, [])

  const pushRecord = useCallback((rec: MoveRecord) => {
    setMoveHistory(h => [...h, rec])
  }, [])

  const playAppMove = useCallback(() => {
    const currentFen = chess.current.fen()
    const node = db[currentFen]
    if (!node || node.moves.length === 0) {
      setFeedback('end-of-theory')
      onEndOfTheory?.(sessionWrongsRef.current === 0, variationNameRef.current)
      return
    }

    const opponentIsWhite = !userIsWhite
    const bestEval = getBestEval(node.moves, opponentIsWhite)
    let candidates = node.moves
    if (bestEval !== undefined && isFinite(opponentThreshold)) {
      const filtered = node.moves.filter(m => {
        if (m.eval === undefined) return true
        return getEvalDrop(m.eval, bestEval, opponentIsWhite) <= opponentThreshold
      })
      if (filtered.length > 0) candidates = filtered
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)]
    const moveResult = chess.current.move(picked.move)
    if (!moveResult) return

    const newFen = chess.current.fen()
    pushFen(newFen)
    pushRecord({ from: moveResult.from, to: moveResult.to, isUserMove: false, isBest: false, eval: picked.eval })
    variationNameRef.current = picked.variation
    setVariationName(picked.variation)

    const nextNode = db[newFen]
    if (!nextNode || nextNode.moves.length === 0) {
      setHintMoves([])
      setFeedback('end-of-theory')
      onEndOfTheory?.(sessionWrongsRef.current === 0, picked.variation)
    } else {
      setHintMoves(getFinalMoveArrows(newFen, db))
    }
  }, [db, onEndOfTheory, pushFen, pushRecord, opponentThreshold, userIsWhite])

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

      if (bestEval !== undefined && matched.eval !== undefined) {
        const drop = getEvalDrop(matched.eval, bestEval, userIsWhite)
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
      pushRecord({ from: moveResult.from, to: moveResult.to, isUserMove: true, isBest, eval: matched.eval, bestFrom, bestTo })
      variationNameRef.current = matched.variation
      setVariationName(matched.variation)
      setFeedback(isBest ? 'correct-best' : 'correct')
      setHintMoves([])
      onCorrect?.()

      setTimeout(() => {
        setFeedback('idle')
        playAppMove()
      }, 600)

      return true
    },
    [appColor, db, playAppMove, pushFen, pushRecord, onCorrect, onWrong, ownThreshold, userIsWhite],
  )

  const revealAnswer = useCallback(() => {
    const currentFen = chess.current.fen()
    const node = db[currentFen]
    if (!node || node.moves.length === 0) return

    const picked = node.moves[Math.floor(Math.random() * node.moves.length)]
    const test = new Chess(currentFen)
    const previewResult = test.move(picked.move)
    if (!previewResult) return

    setHintMoves([{ from: previewResult.from, to: previewResult.to }])
    setFeedback('idle')

    setTimeout(() => {
      const moveResult = chess.current.move(picked.move)
      if (!moveResult) return
      const newFen = chess.current.fen()
      pushFen(newFen)
      pushRecord({ from: moveResult.from, to: moveResult.to, isUserMove: false, isBest: false, eval: picked.eval })
      setVariationName(picked.variation)
      setHintMoves([])
      setFeedback('idle')
      setTimeout(() => playAppMove(), 600)
    }, 1000)
  }, [db, playAppMove, pushFen, pushRecord])

  return { fen, fenHistory, moveHistory, feedback, variationName, hintMoves, onUserMove, revealAnswer }
}
