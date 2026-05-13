import { useState } from 'react'
import { Stars } from './Stars'
import { starLevel } from '../stats'
import type { StatsDB } from '../stats'
import type { Deck } from '../deck'
import type { Side } from '../types'

const FILTERS = [
  { label: 'All',      maxPerfect: Infinity },
  { label: '0 perfect', maxPerfect: 1 },
  { label: '< 5',      maxPerfect: 5 },
] as const

interface Props {
  deck: Deck
  side: Side
  statsDB: StatsDB
  onBack: () => void
  onRemove: (opening: string) => void
  onSetSide: (side: Side) => void
  onStart: (filtered: Deck) => void
}

export function DeckScreen({ deck, side, statsDB, onBack, onRemove, onSetSide, onStart }: Props) {
  const [maxPerfect, setMaxPerfect] = useState<number>(Infinity)

  const filtered = deck.filter((name) => (statsDB[name]?.perfect ?? 0) < maxPerfect)

  return (
    <div className="deck-screen">
      <div className="deck-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1>Deck Practice</h1>
      </div>

      {deck.length === 0 ? (
        <p className="deck-empty">
          No openings yet — add them from the Explorer with the <strong>+</strong> button.
        </p>
      ) : (
        <>
          <div className="deck-filter">
            <span className="deck-filter-label">Practice:</span>
            {FILTERS.map((f) => (
              <button
                key={f.label}
                className={`deck-filter-btn${maxPerfect === f.maxPerfect ? ' active' : ''}`}
                onClick={() => setMaxPerfect(f.maxPerfect)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ul className="deck-list">
            {deck.map((name) => {
              const excluded = (statsDB[name]?.perfect ?? 0) >= maxPerfect
              return (
                <li key={name} className={`deck-item${excluded ? ' deck-item-excluded' : ''}`}>
                  <span className="deck-item-name">{name}</span>
                  <Stars level={starLevel(statsDB[name])} />
                  <button
                    className="deck-remove-btn"
                    title="Remove from deck"
                    onClick={() => onRemove(name)}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>

          {maxPerfect !== Infinity && (
            <p className="deck-filter-count">
              {filtered.length} / {deck.length} openings selected
            </p>
          )}

          <p className="deck-hint">
            Openings with fewer perfect runs are drawn more often.
          </p>

          <div className="side-picker">
            <button className={side === 'white' ? 'active' : ''} onClick={() => onSetSide('white')}>
              Play White
            </button>
            <button className={side === 'black' ? 'active' : ''} onClick={() => onSetSide('black')}>
              Play Black
            </button>
          </div>

          <button className="start-btn" disabled={filtered.length === 0} onClick={() => onStart(filtered)}>
            Start Practice{filtered.length < deck.length ? ` (${filtered.length})` : ''}
          </button>
        </>
      )}
    </div>
  )
}
