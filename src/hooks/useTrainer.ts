import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { TheoryDB, Side, FeedbackStatus } from '../types'

interface TrainerCallbacks {
  onCorrect?: () => void
  onWrong?: () => void
  onEndOfTheory?: (isPerfect: boolean, variation: string) => void
}

export function useTrainer(db: TheoryDB, side: Side, callbacks: TrainerCallbacks = {}) {
  const chess = useRef(new Chess())
  const [fen, setFen] = useState(chess.current.fen())
  const [feedback, setFeedback] = useState<FeedbackStatus>('idle')
  const [variationName, setVariationName] = useState('')
  const variationNameRef = useRef('')
  const [hintSquares, setHintSquares] = useState<{ from: string; to: string } | null>(null)
  const sessionWrongsRef = useRef(0)
  const appColor = side === 'white' ? 'b' : 'w'

  const { onCorrect, onWrong, onEndOfTheory } = callbacks

  const playAppMove = useCallback(() => {
    const currentFen = chess.current.fen()
    const node = db[currentFen]
    if (!node || node.moves.length === 0) {
      setFeedback('end-of-theory')
      onEndOfTheory?.(sessionWrongsRef.current === 0, variationNameRef.current)
      return
    }

    const picked = node.moves[Math.floor(Math.random() * node.moves.length)]
    chess.current.move(picked.move)
    const newFen = chess.current.fen()
    setFen(newFen)
    variationNameRef.current = picked.variation
    setVariationName(picked.variation)
    setHintSquares(null)

    const nextNode = db[newFen]
    if (!nextNode || nextNode.moves.length === 0) {
      setFeedback('end-of-theory')
      onEndOfTheory?.(sessionWrongsRef.current === 0, picked.variation)
    }
  }, [db, onEndOfTheory])

  // Play the app's opening move once on mount.
  // The parent remounts this component (via key) for each new session,
  // so this always fires exactly once per session.
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
      try {
        chess.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
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

      variationNameRef.current = matched.variation
      setVariationName(matched.variation)
      setFen(afterFen)
      setFeedback('correct')
      setHintSquares(null)
      onCorrect?.()

      setTimeout(() => {
        setFeedback('idle')
        playAppMove()
      }, 600)

      return true
    },
    [appColor, db, playAppMove, onCorrect, onWrong],
  )

  const revealAnswer = useCallback(() => {
    const currentFen = chess.current.fen()
    const node = db[currentFen]
    if (!node || node.moves.length === 0) return

    const picked = node.moves[Math.floor(Math.random() * node.moves.length)]
    const test = new Chess(currentFen)
    const moveResult = test.move(picked.move)
    if (!moveResult) return

    setHintSquares({ from: moveResult.from, to: moveResult.to })
    setFeedback('idle')

    setTimeout(() => {
      chess.current.move(picked.move)
      const newFen = chess.current.fen()
      setFen(newFen)
      setVariationName(picked.variation)
      setHintSquares(null)
      setFeedback('idle')
      setTimeout(() => playAppMove(), 600)
    }, 1000)
  }, [db, playAppMove])

  return { fen, feedback, variationName, hintSquares, onUserMove, revealAnswer }
}
