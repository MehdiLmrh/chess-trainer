import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { SquareHandlerArgs } from 'react-chessboard'
import { useTrainer } from '../hooks/useTrainer'
import type { TheoryDB, Side } from '../types'
import type { TrainerConfig } from '../hooks/useTrainer'

const FEEDBACK_LABELS: Record<string, string> = {
  idle: '',
  correct: 'Correct',
  'correct-best': 'Correct ★',
  'too-weak': 'Move found but too weak — try a stronger move',
  wrong: 'Not in theory — try again',
  'out-of-theory': 'Position not in database',
  'end-of-theory': 'End of line — theory complete',
}

const FEEDBACK_COLORS: Record<string, string> = {
  idle: 'transparent',
  correct: '#2ecc71',
  'correct-best': '#2ecc71',
  'too-weak': '#e67e22',
  wrong: '#e74c3c',
  'out-of-theory': '#f39c12',
  'end-of-theory': '#7c83fd',
}

interface Props {
  db: TheoryDB
  side: Side
  selectedRoot: string
  deckProgress?: { index: number; total: number }
  evalConfig?: TrainerConfig
  onCorrect: () => void
  onWrong: () => void
  onEndOfTheory: (isPerfect: boolean, variation: string) => void
  onExclude: (variation: string) => void
  onReset: () => void
  onBack: () => void
  onNext?: () => void
}

export function Trainer({
  db, side, selectedRoot, deckProgress, evalConfig,
  onCorrect, onWrong, onEndOfTheory,
  onExclude, onReset, onBack, onNext,
}: Props) {
  const { fen, fenHistory, moveHistory, feedback, variationName, hintMoves, onUserMove, revealAnswer } = useTrainer(
    db, side, { onCorrect, onWrong, onEndOfTheory }, evalConfig,
  )

  const [reviewIdx, setReviewIdx] = useState(0)
  const [isReviewing, setIsReviewing] = useState(false)

  useEffect(() => {
    if (!isReviewing) setReviewIdx(fenHistory.length - 1)
  }, [fenHistory.length, isReviewing])

  const displayFen = fenHistory[reviewIdx] ?? fen
  const isLive = reviewIdx === fenHistory.length - 1

  function goBack() {
    setIsReviewing(true)
    setReviewIdx((i) => Math.max(0, i - 1))
  }

  function goForward() {
    setReviewIdx((i) => {
      const next = Math.min(fenHistory.length - 1, i + 1)
      if (next === fenHistory.length - 1) setIsReviewing(false)
      return next
    })
  }

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [moveTargets, setMoveTargets] = useState<{ empty: string[]; capture: string[] }>({ empty: [], capture: [] })

  const userColor = side === 'white' ? 'w' : 'b'

  function selectSquare(square: string) {
    const chess = new Chess(fen)
    const moves = chess.moves({ square: square as Parameters<typeof chess.moves>[0]['square'], verbose: true })
    const empty: string[] = []
    const capture: string[] = []
    for (const m of moves) {
      if (m.flags.includes('c') || m.flags.includes('e')) capture.push(m.to)
      else empty.push(m.to)
    }
    setSelectedSquare(square)
    setMoveTargets({ empty, capture })
  }

  function clearSelection() {
    setSelectedSquare(null)
    setMoveTargets({ empty: [], capture: [] })
  }

  function handleSquareClick({ square, piece }: SquareHandlerArgs) {
    if (!isLive || feedback === 'end-of-theory') return

    const pieceColor = piece?.pieceType[0]
    const allTargets = [...moveTargets.empty, ...moveTargets.capture]

    if (selectedSquare) {
      if (allTargets.includes(square)) {
        onUserMove(selectedSquare, square)
        clearSelection()
        return
      }
      if (pieceColor === userColor) {
        selectSquare(square)
        return
      }
      clearSelection()
      return
    }

    if (pieceColor === userColor) {
      selectSquare(square)
    }
  }

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (selectedSquare) {
    squareStyles[selectedSquare] = { background: 'rgba(124,131,253,0.35)' }
  }
  for (const sq of moveTargets.empty) {
    squareStyles[sq] = {
      background: 'radial-gradient(circle, rgba(124,131,253,0.45) 28%, transparent 29%)',
      cursor: 'pointer',
    }
  }
  for (const sq of moveTargets.capture) {
    squareStyles[sq] = {
      background: 'radial-gradient(circle, transparent 57%, rgba(124,131,253,0.5) 58%)',
      cursor: 'pointer',
    }
  }

  // In review mode: show arrows for the move made FROM the displayed position
  const reviewArrows = (() => {
    if (isLive || reviewIdx >= fenHistory.length - 1) return []
    const rec = moveHistory[reviewIdx]
    if (!rec) return []
    if (rec.isUserMove) {
      const played = {
        startSquare: rec.from,
        endSquare: rec.to,
        color: rec.isBest ? 'rgba(46,204,113,0.85)' : 'rgba(124,131,253,0.75)',
      }
      if (rec.isBest || !rec.bestFrom || !rec.bestTo) return [played]
      return [
        played,
        { startSquare: rec.bestFrom, endSquare: rec.bestTo, color: 'rgba(46,204,113,0.85)' },
      ]
    }
    return [{ startSquare: rec.from, endSquare: rec.to, color: 'rgba(160,160,160,0.55)' }]
  })()

  const showVariation = variationName && variationName !== selectedRoot
  const canExclude = showVariation && feedback !== 'wrong' && feedback !== 'out-of-theory'

  return (
    <div className="trainer">
      <div className="header">
        <h1>Chess Theory Trainer</h1>
        <div className="opening-row">
          <p className="selected-opening">{selectedRoot}</p>
          {deckProgress && (
            <span className="deck-progress">{deckProgress.index} / {deckProgress.total}</span>
          )}
        </div>
        {showVariation && (
          <div className="variation-row">
            <span className="variation">{variationName}</span>
            {canExclude && (
              <button
                className="exclude-btn"
                title="Exclude this variation"
                onClick={() => onExclude(variationName)}
              >
                Exclude
              </button>
            )}
          </div>
        )}
      </div>

      <div className="board-wrap">
        <Chessboard
          options={{
            position: displayFen,
            boardOrientation: side,
            animationDurationInMs: 200,
            onPieceDrop: isLive
              ? ({ sourceSquare, targetSquare }) => {
                  clearSelection()
                  return targetSquare ? onUserMove(sourceSquare, targetSquare) : false
                }
              : () => false,
            onSquareClick: handleSquareClick,
            squareStyles: isLive ? squareStyles : {},
            arrows: isLive
              ? hintMoves.map((h) => ({
                  startSquare: h.from,
                  endSquare: h.to,
                  color: 'rgba(124,131,253,0.8)',
                }))
              : reviewArrows,
          }}
        />
      </div>

      <div className="history-nav">
        <button
          className="history-nav-btn"
          disabled={reviewIdx === 0}
          onClick={goBack}
          title="Previous move (←)"
        >←</button>
        {!isLive && (
          <span className="history-nav-label">Move {reviewIdx} / {fenHistory.length - 1}</span>
        )}
        <button
          className="history-nav-btn"
          disabled={isLive}
          onClick={goForward}
          title="Next move (→)"
        >→</button>
      </div>

      <div className="feedback" style={{ color: FEEDBACK_COLORS[feedback] ?? 'transparent' }}>
        {isLive ? FEEDBACK_LABELS[feedback] : ''}
      </div>

      <div className="actions">
        {(feedback === 'wrong' || feedback === 'out-of-theory' || feedback === 'too-weak') && (
          <button className="reveal-btn" onClick={revealAnswer}>Reveal Answer</button>
        )}
        {feedback === 'end-of-theory' && onNext && (
          <button className="next-btn" onClick={onNext}>Next Opening →</button>
        )}
        <button className="reset-btn" onClick={onReset}>Reset</button>
        <button className="back-btn" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}
