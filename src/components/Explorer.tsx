import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { pgnLength, type Opening, type CleanupStats } from '../data/lichess'
import { starLevel, type StatsDB } from '../stats'
import { Stars } from './Stars'
import type { Deck } from '../deck'
import type { CustomOpening } from '../customOpenings'
import type { TheoryDB } from '../types'

// ── Tree data (Lichess) ───────────────────────────────────────────────────────

interface VarItem {
  eco: string
  name: string
  pgn: string
  moveCount: number
  statsKey: string
}

interface RootItem {
  name: string
  eco: string
  variations: VarItem[]
}

function flatLabel(pgn: string): string {
  const moves = pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/).filter(Boolean)
  return '…' + moves.slice(-2).join(' ')
}

function buildTree(openings: Opening[]): RootItem[] {
  const map = new Map<string, RootItem>()
  // longest: statsKey → best VarItem seen so far (by moveCount)
  const longest = new Map<string, VarItem>()

  for (const o of openings) {
    const ci = o.name.indexOf(':')
    const rootName = ci >= 0 ? o.name.slice(0, ci).trim() : o.name.trim()
    const varName  = ci >= 0 ? o.name.slice(ci + 1).trim() : null
    if (!map.has(rootName)) map.set(rootName, { name: rootName, eco: '', variations: [] })
    const node = map.get(rootName)!
    const mc = pgnLength(o.pgn)
    if (!varName) {
      node.eco = o.eco
      const sk = rootName
      const item: VarItem = { eco: o.eco, name: flatLabel(o.pgn), pgn: o.pgn, moveCount: mc, statsKey: sk }
      const prev = longest.get(sk)
      if (!prev || mc > prev.moveCount) longest.set(sk, item)
    } else {
      const sk = rootName + ': ' + varName
      const item: VarItem = { eco: o.eco, name: varName, pgn: o.pgn, moveCount: mc, statsKey: sk }
      const prev = longest.get(sk)
      if (!prev || mc > prev.moveCount) longest.set(sk, item)
    }
  }

  // Populate variations from the deduplicated map
  for (const [sk, item] of longest) {
    const ci = sk.indexOf(':')
    const rootName = ci >= 0 ? sk.slice(0, ci).trim() : sk.trim()
    const node = map.get(rootName)
    if (node) node.variations.push(item)
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Custom opening helpers ────────────────────────────────────────────────────

interface CustomLine { moves: string[]; pgn: string; label: string }

function movesToPgn(moves: string[]): string {
  return moves.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m)).join(' ')
}

function extractLines(db: TheoryDB): string[][] {
  const START_FEN = new Chess().fen()
  const result: string[][] = []
  function dfs(fen: string, moves: string[], seen: Set<string>) {
    if (seen.has(fen)) return
    const node = db[fen]
    if (!node || node.moves.length === 0) {
      if (moves.length > 0) result.push(moves)
      return
    }
    seen.add(fen)
    for (const m of node.moves) {
      try {
        const c = new Chess(fen); c.move(m.move)
        dfs(c.fen(), [...moves, m.move], new Set(seen))
      } catch { /* skip */ }
    }
  }
  dfs(START_FEN, [], new Set())
  return result
}

function buildCustomLines(o: CustomOpening): CustomLine[] {
  const lines = extractLines(o.db)
  return lines.map((moves) => ({
    moves,
    pgn: movesToPgn(moves),
    label: lines.length === 1 ? 'Main line' : '…' + moves.slice(-2).join(' '),
  }))
}

// ── FEN helpers ───────────────────────────────────────────────────────────────

const BOARD_PX = 210

function parseMoves(pgn: string): string[] {
  return pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/).filter(Boolean)
}

function computeFens(moves: string[]): string[] {
  const chess = new Chess()
  const fens = [chess.fen()]
  for (const m of moves) {
    try { chess.move(m) } catch { break }
    fens.push(chess.fen())
  }
  return fens
}

function pgnToFen(pgn: string): string {
  const fens = computeFens(parseMoves(pgn))
  return fens[fens.length - 1]
}

interface Preview { fen: string; top: number; left: number }

// ── Viewer state ──────────────────────────────────────────────────────────────

interface ViewState { key: string; moves: string[]; fens: string[]; pos: number }

// ── Shared inline viewer component ───────────────────────────────────────────

function VariationViewer({ vs, set }: {
  vs: ViewState
  set: React.Dispatch<React.SetStateAction<ViewState | null>>
}) {
  return (
    <div className="var-viewer" onClick={(e) => e.stopPropagation()}>
      <div className="var-viewer-board">
        <Chessboard options={{ position: vs.fens[vs.pos], boardOrientation: 'white', animationDurationInMs: 100 }} />
      </div>
      <div className="var-viewer-right">
        <div className="var-viewer-movelist">
          {Array.from({ length: Math.ceil(vs.moves.length / 2) }, (_, i) => {
            const wi = i * 2, bi = i * 2 + 1
            return (
              <span key={i} className="var-move-pair">
                <span className="var-move-num">{i + 1}.</span>
                <span className={`var-move${vs.pos === wi + 1 ? ' active' : ''}`}
                  onClick={() => set((s) => s && { ...s, pos: wi + 1 })}>{vs.moves[wi]}</span>
                {vs.moves[bi] && (
                  <span className={`var-move${vs.pos === bi + 1 ? ' active' : ''}`}
                    onClick={() => set((s) => s && { ...s, pos: bi + 1 })}>{vs.moves[bi]}</span>
                )}
              </span>
            )
          })}
        </div>
        <div className="var-viewer-nav">
          <button className="var-nav-btn" disabled={vs.pos === 0}
            onClick={() => set((s) => s && { ...s, pos: 0 })} title="Start (Home)">⏮</button>
          <button className="var-nav-btn" disabled={vs.pos === 0}
            onClick={() => set((s) => s && { ...s, pos: Math.max(0, s.pos - 1) })} title="Previous (←)">←</button>
          <button className="var-nav-btn" disabled={vs.pos === vs.moves.length}
            onClick={() => set((s) => s && { ...s, pos: Math.min(s.moves.length, s.pos + 1) })} title="Next (→)">→</button>
          <button className="var-nav-btn" disabled={vs.pos === vs.moves.length}
            onClick={() => set((s) => s && { ...s, pos: s.moves.length })} title="End (End)">⏭</button>
        </div>
      </div>
    </div>
  )
}

// ── Star aggregation ──────────────────────────────────────────────────────────

import type { StarLevel } from '../stats'

function rootStarLevel(root: RootItem, statsDB: StatsDB): StarLevel {
  if (root.variations.length === 0) return starLevel(statsDB[root.name])
  const all = root.variations.map((v) => statsDB[v.statsKey])
  if (!all.every((s) => s && s.completed >= 1)) return 'none'
  if (!all.every((s) => s && s.perfect >= 1))  return 'empty'
  if (!all.every((s) => s && s.perfect >= 5))  return 'gold1'
  if (!all.every((s) => s && s.perfect >= 10)) return 'gold2'
  return 'gold3'
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  openings: Opening[]
  statsDB: StatsDB
  deck: Deck
  customOpenings: CustomOpening[]
  cleanupStats: CleanupStats | null
  onToggleDeck: (rootName: string, variations?: string[]) => void
  onToggleCustomDeck: (id: string, name: string) => void
  onBack: () => void
  onTrain: (rootName: string, allowedVariations?: Set<string>) => void
  onTrainCustom: (name: string, db: TheoryDB) => void
  onEditCustom: (id: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Explorer({
  openings, statsDB, deck, customOpenings, cleanupStats,
  onToggleDeck, onToggleCustomDeck, onBack, onTrain, onTrainCustom, onEditCustom,
}: Props) {
  const [search, setSearch]         = useState('')
  const [openState, setOpenState]   = useState<Record<string, boolean>>({})
  const [preview, setPreview]       = useState<Preview | null>(null)
  const [viewState, setViewState]   = useState<ViewState | null>(null)
  const [checkedVars, setCheckedVars] = useState<Record<string, Set<string>>>({})

  const tree = useMemo(() => buildTree(openings), [openings])
  const q    = search.toLowerCase().trim()

  // Lichess: filter by search
  const visible = useMemo(() => {
    if (!q) return tree.map((r) => ({ root: r, vars: r.variations }))
    return tree
      .map((r) => {
        const rootMatch = r.name.toLowerCase().includes(q)
        const vars = rootMatch ? r.variations : r.variations.filter((v) => v.name.toLowerCase().includes(q))
        return { root: r, vars }
      })
      .filter(({ root, vars }) => vars.length > 0 || root.name.toLowerCase().includes(q))
  }, [tree, q])

  // Custom: precompute lines, then filter
  const customWithLines = useMemo(
    () => customOpenings.map((o) => ({ ...o, lines: buildCustomLines(o) })),
    [customOpenings],
  )
  const visibleCustom = useMemo(
    () => !q ? customWithLines : customWithLines.filter((o) => o.name.toLowerCase().includes(q)),
    [customWithLines, q],
  )

  // Keyboard navigation for viewer
  useEffect(() => {
    if (!viewState) return
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')  { setViewState((v) => v && { ...v, pos: Math.max(0, v.pos - 1) }); e.preventDefault() }
      else if (e.key === 'ArrowRight') { setViewState((v) => v && { ...v, pos: Math.min(v.moves.length, v.pos + 1) }); e.preventDefault() }
      else if (e.key === 'Home') { setViewState((v) => v && { ...v, pos: 0 }); e.preventDefault() }
      else if (e.key === 'End')  { setViewState((v) => v && { ...v, pos: v.moves.length }); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewState])

  function toggle(key: string) {
    const defaultOpen = q.length > 0
    const current = openState[key] ?? defaultOpen
    setOpenState((prev) => ({ ...prev, [key]: !current }))
  }

  function toggleCheck(rootName: string, statsKey: string) {
    setCheckedVars((prev) => {
      const set = new Set(prev[rootName] ?? [])
      if (set.has(statsKey)) set.delete(statsKey)
      else set.add(statsKey)
      return { ...prev, [rootName]: set }
    })
  }

  function checkAll(root: RootItem) {
    setCheckedVars((prev) => ({ ...prev, [root.name]: new Set(root.variations.map((v) => v.statsKey)) }))
  }

  function checkNone(rootName: string) {
    setCheckedVars((prev) => { const next = { ...prev }; delete next[rootName]; return next })
  }

  function openView(key: string, pgn: string) {
    if (viewState?.key === key) { setViewState(null); return }
    const moves = parseMoves(pgn)
    setViewState({ key, moves, fens: computeFens(moves), pos: 0 })
    setPreview(null)
  }

  function showPreview(e: React.MouseEvent<HTMLLIElement>, pgn: string) {
    const rect = e.currentTarget.getBoundingClientRect()
    let left = rect.right + 14
    if (left + BOARD_PX > window.innerWidth) left = rect.left - BOARD_PX - 14
    let top = rect.top + rect.height / 2 - BOARD_PX / 2
    top = Math.max(8, Math.min(top, window.innerHeight - BOARD_PX - 8))
    setPreview({ fen: pgnToFen(pgn), top, left })
  }

  const noneMatch = visible.length === 0 && visibleCustom.length === 0

  return (
    <div className="explorer">
      <div className="explorer-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1>Opening Explorer</h1>
      </div>

      <input
        className="search-input explorer-search"
        type="text"
        placeholder="Filter openings…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />

      <div className="explorer-tree">
        {noneMatch && <p className="explorer-empty">No openings match.</p>}

        {/* ── Custom openings section ─────────────────────────────── */}
        {visibleCustom.length > 0 && (
          <>
            <div className="explorer-section-header">Your Openings</div>
            {visibleCustom.map((o) => {
              const isOpen = openState[o.id] ?? (q.length > 0)
              return (
                <div key={o.id} className="tree-node tree-node-custom">
                  <div className="tree-root-row" onClick={() => toggle(o.id)}>
                    <span className="tree-arrow">{isOpen ? '▾' : '▸'}</span>
                    <span className="tree-root-name">{o.name}</span>
                    <span className="tree-badges">
                      <span className="tree-count">{o.lines.length} line{o.lines.length !== 1 ? 's' : ''}</span>
                    </span>
                    {(() => {
                      const inDeck = deck.some((e) => e.customId === o.id)
                      return (
                        <button
                          className={`tree-deck-btn${inDeck ? ' in-deck' : ''}`}
                          title={inDeck ? 'Remove from deck' : 'Add to deck'}
                          onClick={(e) => { e.stopPropagation(); onToggleCustomDeck(o.id, o.name) }}
                        >{inDeck ? '✓' : '+'}</button>
                      )
                    })()}
                    <button
                      className="tree-edit-btn"
                      onClick={(e) => { e.stopPropagation(); onEditCustom(o.id) }}
                    >Edit</button>
                    <button
                      className="tree-train-btn"
                      onClick={(e) => { e.stopPropagation(); onTrainCustom(o.name, o.db) }}
                    >Train</button>
                  </div>

                  {isOpen && o.lines.length > 0 && (
                    <ul className="tree-children">
                      {o.lines.map((line, idx) => {
                        const key       = `${o.id}-line-${idx}`
                        const isViewing = viewState?.key === key
                        return (
                          <li
                            key={key}
                            className={`tree-leaf${isViewing ? ' tree-leaf-selected' : ''}`}
                            onMouseEnter={(e) => { if (!isViewing) showPreview(e, line.pgn) }}
                            onMouseLeave={() => setPreview(null)}
                            onClick={() => openView(key, line.pgn)}
                          >
                            <span className="tree-leaf-name">{line.label}</span>
                            <span className="tree-badges">
                              <span className="tree-ply">{line.moves.length} ply</span>
                            </span>
                            <button
                              className={`tree-view-btn${isViewing ? ' active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); openView(key, line.pgn) }}
                            >{isViewing ? 'Close' : 'View'}</button>
                            {isViewing && viewState && (
                              <VariationViewer vs={viewState} set={setViewState} />
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── Lichess section header (only when both sections visible) ── */}
        {visibleCustom.length > 0 && visible.length > 0 && (
          <div className="explorer-section-header">Opening Database</div>
        )}

        {/* ── Lichess openings ────────────────────────────────────── */}
        {visible.map(({ root, vars }) => {
          const isOpen     = openState[root.name] ?? (q.length > 0)
          const rLevel     = rootStarLevel(root, statsDB)
          const inDeck     = deck.some((e) => e.rootName === root.name)
          const checkedSet = checkedVars[root.name]
          const numChecked = checkedSet?.size ?? 0
          return (
            <div key={root.name} className="tree-node">
              <div className="tree-root-row" onClick={() => toggle(root.name)}>
                <span className="tree-arrow">{isOpen ? '▾' : '▸'}</span>
                <span className="tree-root-name">{root.name}</span>
                <Stars level={rLevel} />
                <span className="tree-badges">
                  {root.eco && <span className="tree-eco">{root.eco}</span>}
                  <span className="tree-count">{vars.length} lines</span>
                </span>
                <button
                  className={`tree-deck-btn${inDeck ? ' in-deck' : ''}`}
                  title={inDeck ? 'Remove from deck' : 'Add to deck'}
                  onClick={(e) => { e.stopPropagation(); onToggleDeck(root.name, numChecked > 0 ? Array.from(checkedSet) : undefined) }}
                >{inDeck ? '✓' : '+'}</button>
                <button
                  className="tree-train-btn"
                  onClick={(e) => { e.stopPropagation(); onTrain(root.name, numChecked > 0 ? checkedSet : undefined) }}
                >{numChecked > 0 ? `Train (${numChecked})` : 'Train'}</button>
              </div>

              {isOpen && vars.length > 0 && (
                <>
                  <div className="tree-var-controls">
                    <button className="tree-check-btn" onClick={() => checkAll(root)}>All</button>
                    <button className="tree-check-btn" onClick={() => checkNone(root.name)}>None</button>
                    <span className="tree-check-count">{numChecked}/{root.variations.length}</span>
                  </div>
                  <ul className="tree-children">
                    {vars.map((v) => {
                      const vLevel    = starLevel(statsDB[v.statsKey])
                      const key       = v.eco + v.name
                      const isChecked = checkedSet?.has(v.statsKey) ?? false
                      const isViewing = viewState?.key === key
                      return (
                        <li
                          key={key}
                          className={`tree-leaf${isViewing ? ' tree-leaf-selected' : ''}`}
                          onMouseEnter={(e) => { if (!isViewing) showPreview(e, v.pgn) }}
                          onMouseLeave={() => setPreview(null)}
                          onClick={() => openView(key, v.pgn)}
                        >
                          <input
                            type="checkbox"
                            className="tree-leaf-check"
                            checked={isChecked}
                            onChange={() => toggleCheck(root.name, v.statsKey)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="tree-leaf-name">{v.name}</span>
                          <Stars level={vLevel} />
                          <span className="tree-badges">
                            <span className="tree-eco">{v.eco}</span>
                            <span className="tree-ply">{v.moveCount} ply</span>
                          </span>
                          <button
                            className={`tree-view-btn${isViewing ? ' active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); openView(key, v.pgn) }}
                          >{isViewing ? 'Close' : 'View'}</button>
                          {isViewing && viewState && (
                            <VariationViewer vs={viewState} set={setViewState} />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          )
        })}
      </div>

      {preview && (
        <div className="board-preview" style={{ top: preview.top, left: preview.left, width: BOARD_PX }}>
          <Chessboard options={{ position: preview.fen, boardOrientation: 'white', animationDurationInMs: 0 }} />
        </div>
      )}

      {cleanupStats && (
        <div className="db-stats">
          <h3 className="db-stats-title">Database cleanup</h3>
          <table className="db-stats-table">
            <tbody>
              <tr><td>Raw entries</td><td className="db-stats-val">{cleanupStats.totalBefore.toLocaleString()}</td></tr>
              <tr><td>After cleanup</td><td className="db-stats-val">{cleanupStats.totalAfter.toLocaleString()}</td></tr>
              <tr><td>Prefix duplicates removed</td><td className="db-stats-val db-stats-removed">−{cleanupStats.prefixRemoved}</td></tr>
              <tr>
                <td>Final-move groups <span className="db-stats-hint">(shown as arrows)</span></td>
                <td className="db-stats-val db-stats-grouped">{cleanupStats.finalMoveGroups}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
