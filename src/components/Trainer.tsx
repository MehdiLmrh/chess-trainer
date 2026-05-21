import { useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { SquareHandlerArgs } from 'react-chessboard/dist/types'
import { useTrainer } from '../hooks/useTrainer'
import type { TheoryDB, Side } from '../types'

const FEEDBACK_LABELS = {
  idle: '',
  correct: 'Correct',
  wrong: 'Not in theory — try again',
  'out-of-theory': 'Position not in database',
  'end-of-theory': 'End of line — theory complete',
}

const FEEDBACK_COLORS = {
  idle: 'transparent',
  correct: '#2ecc71',
  wrong: '#e74c3c',
  'out-of-theory': '#f39c12',
  'end-of-theory': '#7c83fd',
}

interface Props {
  db: TheoryDB
  side: Side
  selectedRoot: string
  deckProgress?: { index: number; total: number }
  onCorrect: () => void
  onWrong: () => void
  onEndOfTheory: (isPerfect: boolean, variation: string) => void
  onExclude: (variation: string) => void
  onReset: () => void
  onBack: () => void
  onNext?: () => void
}

export function Trainer({
  db, side, selectedRoot, deckProgress,
  onCorrect, onWrong, onEndOfTheory,
  onExclude, onReset, onBack, onNext,
}: Props) {
  const { fen, feedback, variationName, hintMoves, onUserMove, revealAnswer } = useTrainer(
    db, side, { onCorrect, onWrong, onEndOfTheory },
  )

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
    if (feedback === 'end-of-theory') return

    const pieceColor = piece?.pieceType[0]  // 'w' or 'b'
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

  // Build squareStyles: selected square highlight + dots/rings for targets
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
            position: fen,
            boardOrientation: side,
            animationDurationInMs: 200,
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              clearSelection()
              return targetSquare ? onUserMove(sourceSquare, targetSquare) : false
            },
            onSquareClick: handleSquareClick,
            squareStyles,
            arrows: hintMoves.map((h) => ({
              startSquare: h.from,
              endSquare: h.to,
              color: 'rgba(124,131,253,0.8)',
            })),
          }}
        />
      </div>

      <div className="feedback" style={{ color: FEEDBACK_COLORS[feedback] }}>
        {FEEDBACK_LABELS[feedback]}
      </div>

      <div className="actions">
        {(feedback === 'wrong' || feedback === 'out-of-theory') && (
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
