import { Chessboard } from 'react-chessboard'
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
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? onUserMove(sourceSquare, targetSquare) : false,
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
