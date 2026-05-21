import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { pgnLength, type Opening, type CleanupStats } from '../data/lichess'
import { starLevel, type StatsDB } from '../stats'
import { Stars } from './Stars'
import type { Deck } from '../deck'

// ── Tree data ────────────────────────────────────────────────────────────────

interface VarItem {
  eco: string
  name: string       // display label
  pgn: string
  moveCount: number
  statsKey: string   // key into StatsDB
}

interface RootItem {
  name: string
  eco: string
  variations: VarItem[]
}

// For flat openings (no colon), use the last 2 half-moves as a short label.
function flatLabel(pgn: string): string {
  const moves = pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/).filter(Boolean)
  return '…' + moves.slice(-2).join(' ')
}

function buildTree(openings: Opening[]): RootItem[] {
  const map = new Map<string, RootItem>()
  for (const o of openings) {
    const ci = o.name.indexOf(':')
    const rootName = ci >= 0 ? o.name.slice(0, ci).trim() : o.name.trim()
    const varName  = ci >= 0 ? o.name.slice(ci + 1).trim() : null
    if (!map.has(rootName)) map.set(rootName, { name: rootName, eco: '', variations: [] })
    const node = map.get(rootName)!
    if (!varName) {
      node.eco = o.eco
      // Flat entry: add as a variation so it's visible and trainable
      node.variations.push({
        eco: o.eco,
        name: flatLabel(o.pgn),
        pgn: o.pgn,
        moveCount: pgnLength(o.pgn),
        statsKey: rootName,
      })
    } else {
      node.variations.push({
        eco: o.eco,
        name: varName,
        pgn: o.pgn,
        moveCount: pgnLength(o.pgn),
        statsKey: rootName + ': ' + varName,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ── FEN preview ──────────────────────────────────────────────────────────────

const BOARD_PX = 210

function pgnToFen(pgn: string): string {
  const chess = new Chess()
  const moves = pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/).filter(Boolean)
  for (const m of moves) { try { chess.move(m) } catch { break } }
  return chess.fen()
}

interface Preview { fen: string; top: number; left: number }

// ── Root-level star aggregation ──────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  openings: Opening[]
  statsDB: StatsDB
  deck: Deck
  cleanupStats: CleanupStats | null
  onToggleDeck: (rootName: string) => void
  onBack: () => void
  onTrain: (rootName: string) => void
}

export function Explorer({ openings, statsDB, deck, cleanupStats, onToggleDeck, onBack, onTrain }: Props) {
  const [search, setSearch]     = useState('')
  // openState tracks explicit open/closed overrides per node.
  // Default when no search: closed. Default when searching: open.
  const [openState, setOpenState] = useState<Record<string, boolean>>({})
  const [preview, setPreview]   = useState<Preview | null>(null)
  const [selectedVar, setSelectedVar] = useState<string | null>(null)

  const tree = useMemo(() => buildTree(openings), [openings])
  const q    = search.toLowerCase().trim()

  const visible = useMemo(() => {
    if (!q) return tree.map((r) => ({ root: r, vars: r.variations }))
    return tree
      .map((r) => {
        const rootMatch = r.name.toLowerCase().includes(q)
        const vars = rootMatch
          ? r.variations
          : r.variations.filter((v) => v.name.toLowerCase().includes(q))
        return { root: r, vars }
      })
      .filter(({ root, vars }) => vars.length > 0 || root.name.toLowerCase().includes(q))
  }, [tree, q])

  function toggle(name: string) {
    const defaultOpen = q.length > 0
    const current = openState[name] ?? defaultOpen
    setOpenState((prev) => ({ ...prev, [name]: !current }))
  }

  function showPreview(e: React.MouseEvent<HTMLLIElement>, pgn: string) {
    const rect = e.currentTarget.getBoundingClientRect()
    let left = rect.right + 14
    if (left + BOARD_PX > window.innerWidth) left = rect.left - BOARD_PX - 14
    let top = rect.top + rect.height / 2 - BOARD_PX / 2
    top = Math.max(8, Math.min(top, window.innerHeight - BOARD_PX - 8))
    setPreview({ fen: pgnToFen(pgn), top, left })
  }

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
        {visible.length === 0 && <p className="explorer-empty">No openings match.</p>}
        {visible.map(({ root, vars }) => {
          const isOpen = openState[root.name] ?? (q.length > 0)
          const rLevel = rootStarLevel(root, statsDB)
          const inDeck = deck.includes(root.name)
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
                  onClick={(e) => { e.stopPropagation(); onToggleDeck(root.name) }}
                >
                  {inDeck ? '✓' : '+'}
                </button>
                <button
                  className="tree-train-btn"
                  onClick={(e) => { e.stopPropagation(); onTrain(root.name) }}
                >
                  Train
                </button>
              </div>

              {isOpen && vars.length > 0 && (
                <ul className="tree-children">
                  {vars.map((v) => {
                    const vLevel = starLevel(statsDB[v.statsKey])
                    const key = v.eco + v.name
                    const isSelected = selectedVar === key
                    return (
                      <li
                        key={key}
                        className={`tree-leaf${isSelected ? ' tree-leaf-selected' : ''}`}
                        onMouseEnter={(e) => { if (!isSelected) showPreview(e, v.pgn) }}
                        onMouseLeave={() => setPreview(null)}
                        onClick={() => {
                          setPreview(null)
                          setSelectedVar(isSelected ? null : key)
                        }}
                      >
                        <span className="tree-leaf-name">{v.name}</span>
                        <Stars level={vLevel} />
                        <span className="tree-badges">
                          <span className="tree-eco">{v.eco}</span>
                          <span className="tree-ply">{v.moveCount} ply</span>
                        </span>
                        {isSelected && (
                          <span className="tree-leaf-pgn">{v.pgn}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {preview && (
        <div
          className="board-preview"
          style={{ top: preview.top, left: preview.left, width: BOARD_PX }}
        >
          <Chessboard
            options={{ position: preview.fen, boardOrientation: 'white', animationDurationInMs: 0 }}
          />
        </div>
      )}

      {cleanupStats && (
        <div className="db-stats">
          <h3 className="db-stats-title">Database cleanup</h3>
          <table className="db-stats-table">
            <tbody>
              <tr>
                <td>Raw entries</td>
                <td className="db-stats-val">{cleanupStats.totalBefore.toLocaleString()}</td>
              </tr>
              <tr>
                <td>After cleanup</td>
                <td className="db-stats-val">{cleanupStats.totalAfter.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Prefix duplicates removed</td>
                <td className="db-stats-val db-stats-removed">−{cleanupStats.prefixRemoved}</td>
              </tr>
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
