import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchOpenings, getRootNames, buildTheoryDB, filterDB, filterToMainLines } from './data/lichess'
import { PRESETS } from './data/presets'
import { Trainer } from './components/Trainer'
import { Profile } from './components/Profile'
import { Explorer } from './components/Explorer'
import { DeckScreen } from './components/Deck'
import { loadStats, recordStart, recordCorrect, recordWrong, recordComplete, type StatsDB } from './stats'
import { loadExclusions, addExclusion, removeExclusion, type ExclusionsDB } from './exclusions'
import { loadDeck, addToDeck, removeFromDeck, buildSessionQueue, type Deck } from './deck'
import type { Opening } from './data/lichess'
import type { Side, TheoryDB } from './types'
import './App.css'

type Screen = 'setup' | 'trainer' | 'profile' | 'explorer' | 'deck'

export default function App() {
  const [screen, setScreen]       = useState<Screen>('setup')
  const [openings, setOpenings]   = useState<Opening[]>([])
  const [loadError, setLoadError] = useState('')
  const [search, setSearch]       = useState('')
  const [selectedRoot, setSelectedRoot] = useState('')
  const [dbOverride, setDbOverride]     = useState<TheoryDB | null>(null)
  const [side, setSide]           = useState<Side>('black')
  const [statsDB, setStatsDB]     = useState<StatsDB>(loadStats)
  const [exclusions, setExclusions] = useState<ExclusionsDB>(loadExclusions)
  const [sessionKey, setSessionKey] = useState(0)
  const [minMoves, setMinMoves]   = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [deck, setDeck]           = useState<Deck>(loadDeck)
  const [deckMode, setDeckMode]   = useState(false)
  const [mainLineOnly, setMainLineOnly] = useState(false)
  const [deckProgress, setDeckProgress] = useState<{ index: number; total: number } | null>(null)
  const lastDrawnRef              = useRef('')
  const sessionQueueRef           = useRef<string[]>([])
  const sessionPosRef             = useRef(0)
  const activeDeckRef             = useRef<string[]>([])
  const inputRef                  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchOpenings()
      .then(setOpenings)
      .catch(() => setLoadError('Failed to load openings. Check your connection.'))
  }, [])

  const rootNames = useMemo(() => getRootNames(openings, minMoves), [openings, minMoves])
  const filtered  = useMemo(
    () =>
      search.length < 2
        ? []
        : rootNames.filter((n) => n.toLowerCase().includes(search.toLowerCase())).slice(0, 10),
    [rootNames, search],
  )
  const lichessDB = useMemo(
    () => (selectedRoot && openings.length ? buildTheoryDB(openings, selectedRoot, minMoves) : {}),
    [openings, selectedRoot, minMoves],
  )
  const baseDB = dbOverride ?? lichessDB
  const db = useMemo(() => {
    let result = filterDB(baseDB, exclusions[selectedRoot] ?? [])
    if (deckMode && mainLineOnly) result = filterToMainLines(result)
    return result
  }, [baseDB, exclusions, selectedRoot, deckMode, mainLineOnly])

  function beginSession(opening: string, overrideDB: TheoryDB | null, inDeck = false) {
    setSelectedRoot(opening)
    setDbOverride(overrideDB)
    setDeckMode(inDeck)
    setStatsDB((s) => recordStart(s, opening))
    setSessionKey((k) => k + 1)
    setScreen('trainer')
  }

  function advanceSession(queue: string[], pos: number) {
    if (queue.length === 0) return
    const opening = queue[pos]
    sessionPosRef.current = pos + 1
    setDeckProgress({ index: pos + 1, total: queue.length })
    lastDrawnRef.current = opening
    beginSession(opening, null, true)
  }

  function startDeckSession(filtered: string[]) {
    activeDeckRef.current = filtered
    const queue = buildSessionQueue(filtered, statsDB)
    sessionQueueRef.current = queue
    sessionPosRef.current = 0
    advanceSession(queue, 0)
  }

  function drawNext() {
    let pos = sessionPosRef.current
    let queue = sessionQueueRef.current
    if (pos >= queue.length) {
      queue = buildSessionQueue(activeDeckRef.current, statsDB)
      sessionQueueRef.current = queue
      pos = 0
    }
    advanceSession(queue, pos)
  }

  function handleReset() {
    setStatsDB((s) => recordStart(s, selectedRoot))
    setSessionKey((k) => k + 1)
  }

  function handleExclude(variation: string) {
    setExclusions((e) => addExclusion(e, selectedRoot, variation))
    setStatsDB((s) => recordStart(s, selectedRoot))
    setSessionKey((k) => k + 1)
  }

  function handleReinclude(opening: string, variation: string) {
    setExclusions((e) => removeExclusion(e, opening, variation))
  }

  function handleToggleDeck(rootName: string) {
    setDeck((d) =>
      d.includes(rootName) ? removeFromDeck(d, rootName) : addToDeck(d, rootName),
    )
  }

  const navBtns = screen !== 'profile' && screen !== 'explorer' && screen !== 'deck' && (
    <div className="nav-btns">
      <button className="nav-btn" onClick={() => setScreen('deck')}>
        Deck{deck.length > 0 ? ` (${deck.length})` : ''}
      </button>
      <button className="nav-btn" onClick={() => setScreen('explorer')}>Explorer</button>
      <button className="nav-btn" onClick={() => setScreen('profile')}>Profile</button>
    </div>
  )

  if (screen === 'explorer') {
    return (
      <Explorer
        openings={openings}
        statsDB={statsDB}
        deck={deck}
        onToggleDeck={handleToggleDeck}
        onBack={() => setScreen('setup')}
        onTrain={(rootName) => beginSession(rootName, null)}
      />
    )
  }

  if (screen === 'deck') {
    return (
      <DeckScreen
        deck={deck}
        side={side}
        statsDB={statsDB}
        onBack={() => setScreen('setup')}
        onRemove={(name) => setDeck((d) => removeFromDeck(d, name))}
        onSetSide={setSide}
        mainLineOnly={mainLineOnly}
        onSetMainLineOnly={setMainLineOnly}
        onStart={(filtered) => startDeckSession(filtered)}
      />
    )
  }

  if (screen === 'profile') {
    return (
      <Profile
        stats={statsDB}
        exclusions={exclusions}
        onBack={() => setScreen('setup')}
        onClear={() => {
          setStatsDB({})
          localStorage.removeItem('chess-trainer-stats')
        }}
        onReinclude={handleReinclude}
      />
    )
  }

  if (screen === 'trainer') {
    return (
      <>
        {navBtns}
        <Trainer
          key={sessionKey}
          db={db}
          side={side}
          selectedRoot={selectedRoot}
          deckProgress={deckMode ? deckProgress ?? undefined : undefined}
          onCorrect={() => setStatsDB((s) => recordCorrect(s, selectedRoot))}
          onWrong={() => setStatsDB((s) => recordWrong(s, selectedRoot))}
          onEndOfTheory={(isPerfect, variation) =>
            setStatsDB((s) => {
              let next = recordComplete(s, selectedRoot, isPerfect)
              if (variation && variation !== selectedRoot)
                next = recordComplete(next, variation, isPerfect)
              return next
            })
          }
          onExclude={handleExclude}
          onReset={handleReset}
          onBack={() => setScreen(deckMode ? 'deck' : 'setup')}
          onNext={deckMode ? drawNext : undefined}
        />
      </>
    )
  }

  // setup screen
  return (
    <div className="setup">
      {navBtns}
      <h1>Chess Theory Trainer</h1>

      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.label} className="preset-btn" onClick={() => beginSession(p.label, p.db)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="divider">or search</div>

      {loadError && <p className="error">{loadError}</p>}
      {openings.length === 0 && !loadError && <p className="loading">Loading openings…</p>}

      {openings.length > 0 && (
        <>
          <div className="min-moves">
            <label>
              Minimum moves in line:
              <strong> {minMoves === 0 ? 'any' : minMoves}</strong>
            </label>
            <input
              type="range"
              min={0}
              max={20}
              value={minMoves}
              onChange={(e) => {
                setMinMoves(Number(e.target.value))
                setSelectedRoot('')
              }}
            />
          </div>

          <div className="search-wrap">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Search opening…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedRoot('')
                setDbOverride(null)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {filtered.length > 0 && showSuggestions && (
              <ul className="suggestions">
                {filtered.map((name) => (
                  <li
                    key={name}
                    className={name === selectedRoot ? 'active' : ''}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelectedRoot(name)
                      setSearch(name)
                      setDbOverride(null)
                      setShowSuggestions(false)
                      inputRef.current?.blur()
                    }}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="side-picker">
            <button className={side === 'white' ? 'active' : ''} onClick={() => setSide('white')}>
              Play White
            </button>
            <button className={side === 'black' ? 'active' : ''} onClick={() => setSide('black')}>
              Play Black
            </button>
          </div>

          <div className="start-row">
            <button
              className="start-btn"
              disabled={!selectedRoot}
              onClick={() => beginSession(selectedRoot, null)}
            >
              Start Training
            </button>
            {selectedRoot && (
              <button
                className={`deck-toggle-btn${deck.includes(selectedRoot) ? ' in-deck' : ''}`}
                title={deck.includes(selectedRoot) ? 'Remove from deck' : 'Add to deck'}
                onClick={() => handleToggleDeck(selectedRoot)}
              >
                {deck.includes(selectedRoot) ? '✓ Deck' : '+ Deck'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
