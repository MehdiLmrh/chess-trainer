import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { SquareHandlerArgs } from 'react-chessboard/dist/types'
import {
  loadCustomOpenings, saveCustomOpening, deleteCustomOpening,
  type CustomOpening,
} from '../customOpenings'
import type { Opening } from '../data/lichess'
import type { TheoryDB, Side } from '../types'

// ── helpers ───────────────────────────────────────────────────────────────────

const START_FEN = new Chess().fen()

interface PathStep { before: string; move: string; after: string }

function parsePgn(pgn: string): string[] {
  return pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/).filter(Boolean)
}

/** Re-tag every node in the DB with a new opening/variation name. */
function retag(db: TheoryDB, name: string): TheoryDB {
  const out: TheoryDB = {}
  for (const [fen, node] of Object.entries(db)) {
    out[fen] = { opening: name, moves: node.moves.map((m) => ({ ...m, variation: name })) }
  }
  return out
}

// ── props ─────────────────────────────────────────────────────────────────────

interface Props {
  side: Side
  onSetSide: (s: Side) => void
  onBack: () => void
  onTrain: (name: string, db: TheoryDB) => void
  initialOpening?: CustomOpening | null
  openings: Opening[]
}

// ── component ─────────────────────────────────────────────────────────────────

export function Editor({ side, onSetSide, onBack, onTrain, initialOpening, openings }: Props) {
  const [name, setName]           = useState(() => initialOpening?.name ?? 'My Opening')
  const [db, setDb]               = useState<TheoryDB>(() => initialOpening?.db ?? {})
  const [path, setPath]           = useState<PathStep[]>([])
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [saved, setSaved]         = useState<CustomOpening[]>(loadCustomOpenings)
  const [editingId, setEditingId] = useState<string | null>(() => initialOpening?.id ?? null)

  // Import panel
  const [importOpen, setImportOpen]   = useState(false)
  const [importSearch, setImportSearch] = useState('')

  // Click-to-move selection
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [moveTargets, setMoveTargets]       = useState<{ empty: string[]; capture: string[] }>({ empty: [], capture: [] })

  const currentFen = path.length > 0 ? path[path.length - 1].after : START_FEN

  // ── import search results ──────────────────────────────────────────────────

  const importQuery = importSearch.toLowerCase().trim()

  const importCustomResults = useMemo(
    () => importQuery.length < 2
      ? []
      : saved.filter((o) => o.name.toLowerCase().includes(importQuery)),
    [saved, importQuery],
  )

  const importLichessResults = useMemo(() => {
    if (importQuery.length < 2) return []
    // Deduplicate by name, keeping longest PGN
    const seen = new Map<string, Opening>()
    for (const o of openings) {
      if (!o.name.toLowerCase().includes(importQuery)) continue
      const ex = seen.get(o.name)
      if (!ex || o.pgn.length > ex.pgn.length) seen.set(o.name, o)
    }
    return Array.from(seen.values()).slice(0, 15)
  }, [openings, importQuery])

  // ── keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    const fen = path.length > 0 ? path[path.length - 1].after : START_FEN
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        setPath((p) => p.slice(0, -1))
        clearSel()
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        const moves = db[fen]?.moves ?? []
        if (moves.length > 0) navigateTo(fen, moves[0].move)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path, db])

  // ── selection helpers ──────────────────────────────────────────────────────

  function clearSel() {
    setSelectedSquare(null)
    setMoveTargets({ empty: [], capture: [] })
  }

  function selectSquare(square: string) {
    const chess = new Chess(currentFen)
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

  // ── move recording ─────────────────────────────────────────────────────────

  function recordMove(from: string, to: string): boolean {
    const chess = new Chess(currentFen)
    let result
    try { result = chess.move({ from, to, promotion: 'q' }) } catch { return false }
    if (!result) return false
    const nextFen = chess.fen()
    const san = result.san

    setDb((prev) => {
      const node = prev[currentFen] ?? { opening: name, moves: [] }
      const exists = node.moves.some((m) => {
        const c = new Chess(currentFen)
        try { c.move(m.move) } catch { return false }
        return c.fen() === nextFen
      })
      if (exists) return prev
      return { ...prev, [currentFen]: { ...node, moves: [...node.moves, { move: san, variation: name }] } }
    })

    setPath((p) => [...p, { before: currentFen, move: san, after: nextFen }])
    clearSel()
    return true
  }

  function navigateTo(fen: string, moveSan: string) {
    const chess = new Chess(fen)
    try { chess.move(moveSan) } catch { return }
    const nextFen = chess.fen()
    setPath((p) => [...p, { before: fen, move: moveSan, after: nextFen }])
    clearSel()
  }

  // ── board handlers ─────────────────────────────────────────────────────────

  function handleDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) {
    return recordMove(sourceSquare, targetSquare)
  }

  function handleSquareClick({ square, piece }: SquareHandlerArgs) {
    const allTargets = [...moveTargets.empty, ...moveTargets.capture]

    if (selectedSquare) {
      if (allTargets.includes(square)) {
        recordMove(selectedSquare, square)
        return
      }
      if (piece) { selectSquare(square); return }
      clearSel()
      return
    }

    if (piece) selectSquare(square)
  }

  // ── delete a recorded continuation ────────────────────────────────────────

  function deleteMove(fen: string, moveSan: string) {
    setDb((prev) => {
      const node = prev[fen]
      if (!node) return prev
      const moves = node.moves.filter((m) => m.move !== moveSan)
      if (moves.length === 0) {
        const next = { ...prev }
        delete next[fen]
        return next
      }
      return { ...prev, [fen]: { ...node, moves } }
    })
    const stepIdx = path.findIndex((s) => s.before === fen && s.move === moveSan)
    if (stepIdx >= 0) setPath((p) => p.slice(0, stepIdx))
  }

  // ── import helpers ─────────────────────────────────────────────────────────

  function loadFromPgn(varName: string, pgn: string) {
    const moves = parsePgn(pgn)
    const chess = new Chess()
    const newDb: TheoryDB = {}
    const newPath: PathStep[] = []
    for (const san of moves) {
      const before = chess.fen()
      if (!newDb[before]) newDb[before] = { opening: varName, moves: [] }
      try { chess.move(san) } catch { break }
      const after = chess.fen()
      if (!newDb[before].moves.some((m) => m.move === san))
        newDb[before].moves.push({ move: san, variation: varName })
      newPath.push({ before, move: san, after })
    }
    // Strip "Root: " prefix for the editor name
    const displayName = varName.includes(':') ? varName.split(':').slice(1).join(':').trim() : varName
    setName(displayName)
    setDb(newDb)
    setPath(newPath)
    setEditingId(null)
    clearSel()
    setImportOpen(false)
    setImportSearch('')
  }

  function loadFromCustom(o: CustomOpening) {
    setName(o.name)
    setDb(o.db)
    setPath([])
    setEditingId(null)
    clearSel()
    setImportOpen(false)
    setImportSearch('')
  }

  // ── save / load / new ─────────────────────────────────────────────────────

  function handleSave() {
    const id  = editingId ?? crypto.randomUUID()
    const tagged = retag(db, name.trim() || 'My Opening')
    const o: CustomOpening = { id, name: name.trim() || 'My Opening', createdAt: Date.now(), db: tagged }
    setSaved(saveCustomOpening(o))
    setDb(tagged)
    setEditingId(id)
  }

  function handleNew() {
    setName('My Opening')
    setDb({})
    setPath([])
    setEditingId(null)
    clearSel()
  }

  function handleEdit(o: CustomOpening) {
    setName(o.name)
    setDb(o.db)
    setPath([])
    setEditingId(o.id)
    clearSel()
  }

  function handleDelete(id: string) {
    setSaved(deleteCustomOpening(id))
    if (editingId === id) handleNew()
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const continuations  = db[currentFen]?.moves ?? []
  const positionCount  = Object.keys(db).length
  const pathMoves      = path.map((s) => s.move)

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (selectedSquare)
    squareStyles[selectedSquare] = { background: 'rgba(124,131,253,0.35)' }
  for (const sq of moveTargets.empty)
    squareStyles[sq] = { background: 'radial-gradient(circle, rgba(124,131,253,0.45) 28%, transparent 29%)', cursor: 'pointer' }
  for (const sq of moveTargets.capture)
    squareStyles[sq] = { background: 'radial-gradient(circle, transparent 57%, rgba(124,131,253,0.5) 58%)', cursor: 'pointer' }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="editor">
      <div className="editor-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1>Opening Editor</h1>
      </div>

      {/* Name row */}
      <div className="editor-name-row">
        <input
          className="editor-name-input"
          type="text"
          placeholder="Opening name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className={`editor-icon-btn${importOpen ? ' active' : ''}`}
          title="Import from existing opening"
          onClick={() => { setImportOpen((v) => !v); setImportSearch('') }}
        >⤵ Import</button>
        <button
          className="editor-icon-btn"
          title="Flip board"
          onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
        >⇅ Flip</button>
      </div>

      {/* Import panel */}
      {importOpen && (
        <div className="editor-import">
          <input
            className="editor-import-search"
            type="text"
            placeholder="Search opening or variation…"
            value={importSearch}
            onChange={(e) => setImportSearch(e.target.value)}
            autoFocus
          />
          {importQuery.length >= 2 && (
            <ul className="editor-import-results">
              {importCustomResults.map((o) => (
                <li key={o.id} className="editor-import-item" onClick={() => loadFromCustom(o)}>
                  <span className="editor-import-name">{o.name}</span>
                  <span className="editor-import-tag">custom</span>
                </li>
              ))}
              {importLichessResults.map((o) => (
                <li key={o.eco + o.name} className="editor-import-item" onClick={() => loadFromPgn(o.name, o.pgn)}>
                  <span className="editor-import-name">{o.name}</span>
                  <span className="editor-import-tag">{o.eco}</span>
                </li>
              ))}
              {importCustomResults.length === 0 && importLichessResults.length === 0 && (
                <li className="editor-import-empty">No results</li>
              )}
            </ul>
          )}
          {importQuery.length < 2 && (
            <p className="editor-import-hint">Type at least 2 characters to search</p>
          )}
        </div>
      )}

      {/* Board + panel */}
      <div className="editor-body">
        <div className="editor-board-wrap">
          <Chessboard
            options={{
              position: currentFen,
              boardOrientation: orientation,
              animationDurationInMs: 100,
              onPieceDrop: handleDrop,
              onSquareClick: handleSquareClick,
              squareStyles,
            }}
          />
        </div>

        <div className="editor-panel">
          {/* Current path */}
          <div className="editor-section-label">Current line</div>
          <div className="editor-movelist">
            {pathMoves.length === 0
              ? <span className="editor-hint">Drag or click a piece to record moves…</span>
              : Array.from({ length: Math.ceil(pathMoves.length / 2) }, (_, i) => {
                  const wi = i * 2
                  const bi = i * 2 + 1
                  return (
                    <span key={i} className="var-move-pair">
                      <span className="var-move-num">{i + 1}.</span>
                      <span
                        className={`var-move${path.length === wi + 1 ? ' active' : ''}`}
                        onClick={() => { setPath((p) => p.slice(0, wi + 1)); clearSel() }}
                      >{pathMoves[wi]}</span>
                      {pathMoves[bi] && (
                        <span
                          className={`var-move${path.length === bi + 1 ? ' active' : ''}`}
                          onClick={() => { setPath((p) => p.slice(0, bi + 1)); clearSel() }}
                        >{pathMoves[bi]}</span>
                      )}
                    </span>
                  )
                })
            }
          </div>

          {/* Continuations at current position */}
          <div className="editor-section-label">
            {continuations.length === 0 ? 'No continuations recorded' : 'Continuations'}
          </div>
          {continuations.length > 0 && (
            <div className="editor-cont-list">
              {continuations.map((m) => (
                <span key={m.move} className="editor-cont-item">
                  <button
                    className="editor-cont-btn"
                    onClick={() => navigateTo(currentFen, m.move)}
                  >{m.move}</button>
                  <button
                    className="editor-cont-delete"
                    title="Remove this move"
                    onClick={() => deleteMove(currentFen, m.move)}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* Nav */}
          <div className="editor-nav">
            <button className="var-nav-btn" disabled={path.length === 0}
              onClick={() => { setPath([]); clearSel() }} title="Start">⏮</button>
            <button className="var-nav-btn" disabled={path.length === 0}
              onClick={() => { setPath((p) => p.slice(0, -1)); clearSel() }} title="Back (←)">←</button>
            <button className="var-nav-btn" disabled={continuations.length === 0}
              onClick={() => continuations.length > 0 && navigateTo(currentFen, continuations[0].move)}
              title="Forward (→)">→</button>
          </div>

          <div className="editor-stats">
            {positionCount} position{positionCount !== 1 ? 's' : ''} recorded
          </div>
        </div>
      </div>

      {/* Side + actions */}
      <div className="editor-actions">
        <div className="side-picker">
          <button className={side === 'white' ? 'active' : ''} onClick={() => onSetSide('white')}>White</button>
          <button className={side === 'black' ? 'active' : ''} onClick={() => onSetSide('black')}>Black</button>
        </div>
        <button
          className="start-btn editor-train-action"
          disabled={positionCount === 0}
          onClick={() => onTrain(name.trim() || 'My Opening', db)}
        >Train this</button>
        <button
          className="editor-save-btn"
          disabled={positionCount === 0 || !name.trim()}
          onClick={handleSave}
        >{editingId ? 'Update' : 'Save'}</button>
        <button className="editor-new-btn" onClick={handleNew}>New</button>
      </div>

      {/* Saved openings */}
      {saved.length > 0 && (
        <div className="editor-saved">
          <div className="editor-section-label" style={{ marginBottom: '0.5rem' }}>Saved openings</div>
          <ul className="editor-saved-list">
            {saved.map((o) => (
              <li key={o.id} className={`editor-saved-item${editingId === o.id ? ' editing' : ''}`}>
                <span className="editor-saved-name">{o.name}</span>
                <span className="editor-saved-count">{Object.keys(o.db).length} pos</span>
                <button className="editor-saved-btn" onClick={() => onTrain(o.name, o.db)}>Train</button>
                <button className="editor-saved-btn" onClick={() => handleEdit(o)}>Edit</button>
                <button className="editor-saved-btn editor-saved-delete" onClick={() => handleDelete(o.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
