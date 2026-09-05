import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MoveRecord } from '../hooks/useTrainer'

function deleteLine(db: TheoryDB, fenHistory: string[], moveHistory: MoveRecord[]): TheoryDB {
  const result = { ...db }
  for (let i = moveHistory.length - 1; i >= 0; i--) {
    const fen = fenHistory[i]
    const rec = moveHistory[i]
    const node = result[fen]
    if (!node) break
    const chess = new Chess(fen)
    let san: string | null = null
    try { san = chess.move({ from: rec.from, to: rec.to, promotion: 'q' })?.san ?? null } catch {}
    if (!san) break
    const remaining = node.moves.filter(m => m.move !== san)
    if (remaining.length === 0) {
      delete result[fen]
    } else {
      result[fen] = { ...node, moves: remaining }
      break
    }
  }
  return result
}

function fmtEval(cp: number): string {
  const p = cp / 100
  return (p > 0 ? '+' : '') + p.toFixed(2)
}

function evalColor(cp: number): string {
  if (cp > 30) return '#7ecda8'
  if (cp < -30) return '#e07878'
  return '#8888bb'
}
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { SquareHandlerArgs } from 'react-chessboard'
import { useTrainer } from '../hooks/useTrainer'
import { sound } from '../sound'
import type { TheoryDB, Side } from '../types'
import type { TrainerConfig, DebugInfo, MoveQuality } from '../hooks/useTrainer'

function DebugPanel({ info }: { info: DebugInfo }) {
  const turn = info.whiteToMove ? 'White' : 'Black'
  return (
    <div className="debug-panel">
      <div className="debug-panel-head">
        <span>{turn} to move · {info.sideToMoveIsUser ? 'you' : 'opponent'}</span>
        {info.bestEvalCp !== undefined && <span>best {fmtEval(info.bestEvalCp)}</span>}
        <span>threshold {isFinite(info.threshold) ? `${info.threshold}cp` : 'off'}</span>
        <span>{info.moves.length} move{info.moves.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="debug-cards">
        {info.moves.map((m, i) => (
          <div
            key={i}
            className={`debug-card${m.playable ? '' : ' debug-card-weak'}${m.isBest ? ' debug-card-best' : ''}`}
          >
            <div className="debug-card-san">
              <span>{m.san}</span>
              {m.isBest && <span className="debug-tag">best</span>}
              {!m.playable && <span className="debug-tag debug-tag-weak">below</span>}
            </div>
            <div className="debug-card-row">
              <span className="debug-k">eval</span>
              <span
                className="debug-v"
                style={{ color: m.evalCp !== undefined ? evalColor(m.evalCp) : '#666' }}
              >
                {m.evalCp !== undefined ? fmtEval(m.evalCp) : '—'}
              </span>
            </div>
            <div className="debug-card-row">
              <span className="debug-k">drop</span>
              <span className="debug-v">{m.dropCp !== undefined ? `${Math.round(m.dropCp)}cp` : '—'}</span>
            </div>
            <div className="debug-card-row">
              <span className="debug-k">path</span>
              <span className="debug-v">{m.pathPlies} plies</span>
            </div>
            {m.pathLine.length > 0 && (
              <div className="debug-card-line" title={m.pathLine.join(' ')}>
                {m.pathLine.join(' ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const FEEDBACK_LABELS: Record<string, string> = {
  idle: '',
  correct: 'Correct',
  'correct-best': 'Correct ★',
  'too-weak': 'Too weak — try a stronger move',
  wrong: 'Not in theory — try again',
  'out-of-theory': 'Position not in database',
  'end-of-theory': '',
}

const FEEDBACK_COLORS: Record<string, string> = {
  idle: 'transparent',
  correct: '#2ecc71',
  'correct-best': '#f5c518',
  'too-weak': '#e67e22',
  wrong: '#e74c3c',
  'out-of-theory': '#f39c12',
  'end-of-theory': 'transparent',
}

interface Props {
  db: TheoryDB
  side: Side
  selectedRoot: string
  deckProgress?: { index: number; total: number }
  evalConfig?: TrainerConfig
  onCorrect: (quality: MoveQuality) => void
  onWrong: () => void
  onEndOfTheory: (isPerfect: boolean, variation: string) => void
  onExclude: (variation: string) => void
  onReset: () => void
  onBack: () => void
  onNext?: () => void
  onDeleteLine?: (newDb: TheoryDB) => void
}

export function Trainer({
  db, side, selectedRoot, deckProgress, evalConfig,
  onCorrect, onWrong, onEndOfTheory,
  onExclude, onReset, onBack, onNext, onDeleteLine,
}: Props) {
  const [streak, setStreak] = useState(0)
  const [mistakes, setMistakes] = useState(0)

  const wrappedOnCorrect = useCallback((quality: MoveQuality) => {
    setStreak(s => s + 1)
    onCorrect(quality)
  }, [onCorrect])

  const wrappedOnWrong = useCallback(() => {
    setStreak(0)
    setMistakes(m => m + 1)
    onWrong()
  }, [onWrong])

  const { fen, fenHistory, moveHistory, feedback, variationName, hintMoves, endReason, debugInfo, onUserMove, revealAnswer, undoMove } = useTrainer(
    db, side, { onCorrect: wrappedOnCorrect, onWrong: wrappedOnWrong, onEndOfTheory }, evalConfig,
  )

  const canUndo = moveHistory.some(m => m.isUserMove)
  const [showDebug, setShowDebug] = useState(false)

  // Board glow ring flash
  const [boardFlash, setBoardFlash] = useState<'correct' | 'wrong' | 'end' | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (feedback === 'correct' || feedback === 'correct-best') {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      setBoardFlash('correct')
      flashTimerRef.current = setTimeout(() => setBoardFlash(null), 800)
      sound.play(feedback === 'correct-best' ? 'best' : 'correct')
    } else if (feedback === 'wrong' || feedback === 'too-weak') {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      setBoardFlash('wrong')
      flashTimerRef.current = setTimeout(() => setBoardFlash(null), 700)
      sound.play(feedback === 'wrong' ? 'wrong' : 'tooWeak')
    } else if (feedback === 'end-of-theory') {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      setBoardFlash('end')
      sound.play(mistakes === 0 ? 'completePerfect' : 'complete')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback])

  // Opponent's replies get their own, quieter tick.
  const moveCountRef = useRef(0)
  useEffect(() => {
    if (moveHistory.length > moveCountRef.current) {
      const last = moveHistory[moveHistory.length - 1]
      if (last && !last.isUserMove) sound.play('appMove')
    }
    moveCountRef.current = moveHistory.length
  }, [moveHistory])

  // Review navigation
  const [reviewIdx, setReviewIdx] = useState(0)
  const [isReviewing, setIsReviewing] = useState(false)

  useEffect(() => {
    if (!isReviewing) setReviewIdx(fenHistory.length - 1)
  }, [fenHistory.length, isReviewing])

  const displayFen = fenHistory[reviewIdx] ?? fen
  const isLive = reviewIdx === fenHistory.length - 1

  function goBack() {
    setIsReviewing(true)
    setReviewIdx(i => Math.max(0, i - 1))
  }

  function goForward() {
    setReviewIdx(i => {
      const next = Math.min(fenHistory.length - 1, i + 1)
      if (next === fenHistory.length - 1) setIsReviewing(false)
      return next
    })
  }

  const handleUndo = useCallback(() => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setBoardFlash(null)
    setIsReviewing(false)
    undoMove()
    sound.play('undo')
  }, [undoMove])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (canUndo) handleUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canUndo, handleUndo])

  // Move log — derive SAN notation from stored from/to
  const moveLogRef = useRef<HTMLDivElement>(null)

  const moveSans = useMemo(() =>
    moveHistory.map((rec, i) => {
      const startFen = fenHistory[i]
      if (!startFen) return null
      const chess = new Chess(startFen)
      try {
        const r = chess.move({ from: rec.from, to: rec.to, promotion: 'q' })
        if (!r) return null
        return { san: r.san, isUser: rec.isUserMove, isBest: rec.isBest, evalCp: rec.eval }
      } catch { return null }
    }).filter((x): x is { san: string; isUser: boolean; isBest: boolean; evalCp: number | undefined } => x !== null),
    [fenHistory, moveHistory],
  )

  // Eval of the position currently on the board (the move that led to it)
  const currentEval = reviewIdx > 0 ? moveHistory[reviewIdx - 1]?.eval : undefined

  useEffect(() => {
    if (isLive && moveLogRef.current) {
      moveLogRef.current.scrollLeft = moveLogRef.current.scrollWidth
    }
  }, [moveSans.length, isLive])

  // Square selection
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
      if (pieceColor === userColor) { selectSquare(square); return }
      clearSelection()
      return
    }
    if (pieceColor === userColor) selectSquare(square)
  }

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (selectedSquare) squareStyles[selectedSquare] = { background: 'rgba(124,131,253,0.35)' }
  for (const sq of moveTargets.empty)
    squareStyles[sq] = { background: 'radial-gradient(circle, rgba(124,131,253,0.45) 28%, transparent 29%)', cursor: 'pointer' }
  for (const sq of moveTargets.capture)
    squareStyles[sq] = { background: 'radial-gradient(circle, transparent 57%, rgba(124,131,253,0.5) 58%)', cursor: 'pointer' }

  // Review arrows
  const reviewArrows = (() => {
    if (isLive || reviewIdx >= fenHistory.length - 1) return []
    const rec = moveHistory[reviewIdx]
    if (!rec) return []
    if (rec.isUserMove) {
      const played = {
        startSquare: rec.from, endSquare: rec.to,
        color: rec.isBest ? 'rgba(46,204,113,0.85)' : 'rgba(124,131,253,0.75)',
      }
      if (rec.isBest || !rec.bestFrom || !rec.bestTo) return [played]
      return [played, { startSquare: rec.bestFrom, endSquare: rec.bestTo, color: 'rgba(46,204,113,0.85)' }]
    }
    return [{ startSquare: rec.from, endSquare: rec.to, color: 'rgba(160,160,160,0.55)' }]
  })()

  const showVariation = variationName && variationName !== selectedRoot
  const canExclude = showVariation && feedback !== 'wrong' && feedback !== 'out-of-theory'
  const isComplete = feedback === 'end-of-theory'

  return (
    <div className={`trainer${isComplete ? ' trainer-complete' : ''}`}>
      <div className="header">
        <div className="header-top-row">
          <h1>Chess Theory Trainer</h1>
          {streak >= 2 && (
            <div className="streak-badge" key={streak}>
              <span>🔥</span>
              <span className="streak-count">{streak}</span>
            </div>
          )}
        </div>
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

      <div className={`board-glow-ring${boardFlash ? ` ring-${boardFlash}` : ''}`}>
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
                ? hintMoves.map(h => ({ startSquare: h.from, endSquare: h.to, color: 'rgba(124,131,253,0.8)' }))
                : reviewArrows,
            }}
          />
        </div>
      </div>

      {moveSans.length > 0 && (
        <div className="move-log" ref={moveLogRef}>
          {moveSans.map((m, i) => (
            <span key={i} className="move-log-group">
              {i % 2 === 0 && (
                <span className="move-log-num">{Math.floor(i / 2) + 1}.</span>
              )}
              <span
                className={`move-log-san${m.isUser ? ' mls-user' : ' mls-app'}${i === reviewIdx - 1 ? ' mls-active' : ''}${m.isUser && m.isBest ? ' mls-best' : ''}`}
                onClick={() => {
                  const newIdx = i + 1
                  setReviewIdx(newIdx)
                  setIsReviewing(newIdx < fenHistory.length - 1)
                }}
              >
                {m.san}{m.isUser && m.isBest ? '★' : ''}
              </span>
            </span>
          ))}
        </div>
      )}

      {currentEval !== undefined && (
        <div className="eval-chip" key={reviewIdx}>
          <span className="eval-chip-label">eval</span>
          <span className="eval-chip-val" style={{ color: evalColor(currentEval) }}>
            {fmtEval(currentEval)}
          </span>
        </div>
      )}

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
        <button
          className={`history-nav-btn debug-toggle${showDebug ? ' active' : ''}`}
          onClick={() => setShowDebug(v => !v)}
          title="Debug: candidate evals & longest paths"
        >🐞</button>
      </div>

      {showDebug && isLive && debugInfo && <DebugPanel info={debugInfo} />}
      {showDebug && isLive && !debugInfo && (
        <div className="debug-panel debug-panel-empty">No candidate moves at this position.</div>
      )}

      {isComplete ? (
        <div className="completion-panel">
          <div className="completion-title">🏁 Line complete!</div>
          <div className={`completion-sub${mistakes === 0 ? ' completion-perfect' : ' completion-imperfect'}`}>
            {mistakes === 0 ? '★ Perfect — no mistakes' : `${mistakes} mistake${mistakes !== 1 ? 's' : ''}`}
          </div>
          <div className="completion-reason">
            {endReason === 'below-threshold'
              ? '⚖️ Stopped here — every remaining theory move is below your eval threshold'
              : '📖 End of the line — no further moves in theory'}
          </div>
        </div>
      ) : (
        <div
          key={feedback}
          className="feedback"
          style={{ color: FEEDBACK_COLORS[feedback] ?? 'transparent' }}
        >
          {isLive ? FEEDBACK_LABELS[feedback] : ''}
        </div>
      )}

      <div className="actions">
        {(feedback === 'wrong' || feedback === 'out-of-theory' || feedback === 'too-weak') && (
          <button className="reveal-btn" onClick={revealAnswer}>Reveal Answer</button>
        )}
        {isComplete && onNext && (
          <button className="next-btn" onClick={onNext}>Next Opening →</button>
        )}
        {isComplete && onDeleteLine && (
          <button
            className="delete-line-btn"
            title="Remove this line from your repertoire"
            onClick={() => onDeleteLine(deleteLine(db, fenHistory, moveHistory))}
          >
            Delete line
          </button>
        )}
        {canUndo && (
          <button
            className="undo-btn"
            title="Undo my last move (Ctrl+Z)"
            onClick={handleUndo}
          >
            ↶ Undo move
          </button>
        )}
        <button className="reset-btn" onClick={onReset}>Reset</button>
        <button className="back-btn" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}
