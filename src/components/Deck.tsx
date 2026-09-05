import { useState } from 'react'
import { Stars } from './Stars'
import { starLevel } from '../stats'
import type { StatsDB } from '../stats'
import type { Deck, DeckEntry, DeckSide } from '../deck'

const FILTERS = [
  { label: 'All',       maxPerfect: Infinity },
  { label: '0 perfect', maxPerfect: 1 },
  { label: '< 5',       maxPerfect: 5 },
] as const

const SIDE_OPTIONS: { label: string; value: DeckSide }[] = [
  { label: 'White', value: 'white' },
  { label: 'Black', value: 'black' },
  { label: 'Both',  value: 'both'  },
]

interface Props {
  deck: Deck
  deckSide: DeckSide
  statsDB: StatsDB
  mainLineOnly: boolean
  onBack: () => void
  onRemove: (entry: DeckEntry) => void
  onSetDeckSide: (side: DeckSide) => void
  onSetEntrySide: (entry: DeckEntry, side: DeckSide) => void
  onSetMainLineOnly: (v: boolean) => void
  onStart: (filtered: DeckEntry[]) => void
  onStartRun: (filtered: DeckEntry[]) => void
}

export function DeckScreen({
  deck, deckSide, statsDB, mainLineOnly,
  onBack, onRemove, onSetDeckSide, onSetEntrySide, onSetMainLineOnly, onStart, onStartRun,
}: Props) {
  const [maxPerfect, setMaxPerfect] = useState<number>(Infinity)

  const filtered = deck.filter((entry) => (statsDB[entry.rootName]?.perfect ?? 0) < maxPerfect)

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

          <div className="deck-filter">
            <span className="deck-filter-label">Lines:</span>
            <button
              className={`deck-filter-btn${!mainLineOnly ? ' active' : ''}`}
              onClick={() => onSetMainLineOnly(false)}
            >
              All
            </button>
            <button
              className={`deck-filter-btn${mainLineOnly ? ' active' : ''}`}
              onClick={() => onSetMainLineOnly(true)}
            >
              Main line only
            </button>
          </div>

          {/* Default side for all entries */}
          <div className="deck-filter">
            <span className="deck-filter-label">Default side:</span>
            {SIDE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`deck-filter-btn${deckSide === opt.value ? ' active' : ''}`}
                onClick={() => onSetDeckSide(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <ul className="deck-list">
            {deck.map((entry) => {
              const excluded = (statsDB[entry.rootName]?.perfect ?? 0) >= maxPerfect
              const key = entry.customId ?? entry.rootName
              const effectiveSide: DeckSide = entry.side ?? deckSide
              return (
                <li key={key} className={`deck-item${excluded ? ' deck-item-excluded' : ''}`}>
                  <span className="deck-item-name">{entry.rootName}</span>
                  {entry.customId && (
                    <span className="deck-item-tag">custom</span>
                  )}
                  {!entry.customId && entry.variations && (
                    <span className="deck-item-vars" title={entry.variations.join('\n')}>
                      {entry.variations.length} var{entry.variations.length !== 1 ? 's' : ''}
                    </span>
                  )}

                  {/* Per-entry side selector */}
                  <div className="deck-entry-side">
                    {SIDE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        title={`Play as ${opt.label}`}
                        className={`deck-entry-side-btn${effectiveSide === opt.value ? ' active' : ''}${entry.side === undefined && opt.value === deckSide ? ' inherited' : ''}`}
                        onClick={() => onSetEntrySide(entry, opt.value)}
                      >
                        {opt.value === 'white' ? 'W' : opt.value === 'black' ? 'B' : '±'}
                      </button>
                    ))}
                  </div>

                  <Stars level={starLevel(statsDB[entry.rootName])} />
                  <button
                    className="deck-remove-btn"
                    title="Remove from deck"
                    onClick={() => onRemove(entry)}
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
            Entries set to <strong>±</strong> train as both White and Black.
          </p>

          <div className="deck-start-row">
            <button className="start-btn" disabled={filtered.length === 0} onClick={() => onStart(filtered)}>
              Start Practice{filtered.length < deck.length ? ` (${filtered.length})` : ''}
            </button>
            <button
              className="run-btn"
              disabled={filtered.length === 0}
              title="3 lives — cycle the deck until you run out"
              onClick={() => onStartRun(filtered)}
            >
              🏃 Start Run
            </button>
          </div>
        </>
      )}
    </div>
  )
}
