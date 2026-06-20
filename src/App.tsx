import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchOpenings, getRootNames, getVariations, buildTheoryDB, filterDB, getCleanupStats, type CleanupStats } from './data/lichess'
import { PRESETS } from './data/presets'
import { Trainer } from './components/Trainer'
import { Profile } from './components/Profile'
import { Explorer } from './components/Explorer'
import { DeckScreen } from './components/Deck'
import { Editor } from './components/Editor'
import { loadStats, recordStart, recordCorrect, recordWrong, recordComplete, type StatsDB } from './stats'
import { loadExclusions, addExclusion, removeExclusion, type ExclusionsDB } from './exclusions'
import { loadDeck, addToDeck, removeFromDeck, addCustomToDeck, removeCustomFromDeck, buildSessionQueue, type Deck, type DeckEntry } from './deck'
import { loadCustomOpenings, type CustomOpening } from './customOpenings'
import type { Opening } from './data/lichess'
import type { Side, TheoryDB } from './types'
import './App.css'

type Screen = 'setup' | 'trainer' | 'profile' | 'explorer' | 'deck' | 'editor'

export default function App() {
  const [screen, setScreen]       = useState<Screen>('setup')
  const [openings, setOpenings]       = useState<Opening[]>([])
  const [cleanupStats, setCleanupStats] = useState<CleanupStats | null>(null)
  const [loadError, setLoadError]     = useState('')
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
  const [customOpenings, setCustomOpenings] = useState<CustomOpening[]>(loadCustomOpenings)
  const [editorInitialId, setEditorInitialId] = useState<string | null>(null)
  const [editorReturnScreen, setEditorReturnScreen] = useState<Screen>('setup')
  const [mainLineOnly, setMainLineOnly] = useState(false)
  const [deckProgress, setDeckProgress] = useState<{ index: number; total: number } | null>(null)
  const [selectedVariations, setSelectedVariations] = useState<Set<string>>(new Set())
  const lastDrawnRef              = useRef('')
  const sessionQueueRef           = useRef<DeckEntry[]>([])
  const sessionPosRef             = useRef(0)
  const activeDeckRef             = useRef<DeckEntry[]>([])
  const inputRef                  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchOpenings()
      .then((o) => { setOpenings(o); setCleanupStats(getCleanupStats()) })
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
  const allVariations = useMemo(
    () => (selectedRoot && openings.length ? getVariations(openings, selectedRoot, minMoves) : []),
    [openings, selectedRoot, minMoves],
  )

  useEffect(() => {
    setSelectedVariations(new Set(allVariations))
  }, [allVariations])

  const lichessDB = useMemo(
    () =>
      selectedRoot && openings.length
        ? buildTheoryDB(
            openings,
            selectedRoot,
            minMoves,
            deckMode && mainLineOnly,
            !deckMode && selectedVariations.size < allVariations.length
              ? selectedVariations
              : undefined,
          )
        : {},
    [openings, selectedRoot, minMoves, deckMode, mainLineOnly, selectedVariations, allVariations],
  )
  const baseDB = dbOverride ?? lichessDB
  const db = useMemo(
    () => filterDB(baseDB, exclusions[selectedRoot] ?? []),
    [baseDB, exclusions, selectedRoot],
  )

  function beginSession(opening: string, overrideDB: TheoryDB | null, inDeck = false) {
    setSelectedRoot(opening)
    setDbOverride(overrideDB)
    setDeckMode(inDeck)
    setStatsDB((s) => recordStart(s, opening))
    setSessionKey((k) => k + 1)
    setScreen('trainer')
  }

  function advanceSession(queue: DeckEntry[], pos: number) {
    if (queue.length === 0) return
    const entry = queue[pos]
    sessionPosRef.current = pos + 1
    setDeckProgress({ index: pos + 1, total: queue.length })
    lastDrawnRef.current = entry.rootName
    let overrideDB: TheoryDB | null = null
    if (entry.customId) {
      overrideDB = customOpenings.find((o) => o.id === entry.customId)?.db ?? null
    } else if (entry.variations) {
      overrideDB = buildTheoryDB(openings, entry.rootName, minMoves, false, new Set(entry.variations))
    }
    beginSession(entry.rootName, overrideDB, true)
  }

  function startDeckSession(filtered: DeckEntry[]) {
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

  function handleToggleDeck(rootName: string, variations?: string[]) {
    setDeck((d) =>
      d.some((e) => e.rootName === rootName && !e.customId)
        ? removeFromDeck(d, rootName)
        : addToDeck(d, rootName, variations),
    )
  }

  function handleToggleCustomDeck(id: string, name: string) {
    setDeck((d) =>
      d.some((e) => e.customId === id)
        ? removeCustomFromDeck(d, id)
        : addCustomToDeck(d, id, name),
    )
  }

  const navBtns = screen !== 'profile' && screen !== 'explorer' && screen !== 'deck' && screen !== 'editor' && (
    <div className="nav-btns">
      <button className="nav-btn" onClick={() => setScreen('deck')}>
        Deck{deck.length > 0 ? ` (${deck.length})` : ''}
      </button>
      <button className="nav-btn" onClick={() => setScreen('explorer')}>Explorer</button>
      <button className="nav-btn" onClick={() => {
        setEditorInitialId(null)
        setEditorReturnScreen('setup')
        setScreen('editor')
      }}>Editor</button>
      <button className="nav-btn" onClick={() => setScreen('profile')}>Profile</button>
    </div>
  )

  if (screen === 'editor') {
    return (
      <Editor
        key={editorInitialId ?? 'new'}
        side={side}
        onSetSide={setSide}
        openings={openings}
        initialOpening={editorInitialId ? customOpenings.find((o) => o.id === editorInitialId) : null}
        onBack={() => {
          setEditorInitialId(null)
          setCustomOpenings(loadCustomOpenings())
          setScreen(editorReturnScreen)
        }}
        onTrain={(name, db) => beginSession(name, db)}
      />
    )
  }

  if (screen === 'explorer') {
    return (
      <Explorer
        openings={openings}
        statsDB={statsDB}
        deck={deck}
        customOpenings={customOpenings}
        cleanupStats={cleanupStats}
        onToggleDeck={handleToggleDeck}
        onToggleCustomDeck={handleToggleCustomDeck}
        onBack={() => setScreen('setup')}
        onTrain={(rootName, allowedVariations) => {
          if (allowedVariations && allowedVariations.size > 0) {
            const filteredDB = buildTheoryDB(openings, rootName, minMoves, false, allowedVariations)
            beginSession(rootName, filteredDB)
          } else {
            beginSession(rootName, null)
          }
        }}
        onTrainCustom={(name, db) => beginSession(name, db)}
        onEditCustom={(id) => {
          setEditorInitialId(id)
          setEditorReturnScreen('explorer')
          setScreen('editor')
        }}
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
        onRemove={(entry) => setDeck((d) =>
          entry.customId
            ? removeCustomFromDeck(d, entry.customId)
            : removeFromDeck(d, entry.rootName)
        )}
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

      {customOpenings.length > 0 && (
        <>
          <div className="divider">your openings</div>
          <div className="presets">
            {customOpenings.map((o) => (
              <button key={o.id} className="preset-btn preset-btn-custom" onClick={() => beginSession(o.name, o.db)}>
                {o.name}
              </button>
            ))}
          </div>
        </>
      )}

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
                setDeckMode(false)
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

          {selectedRoot && allVariations.length >= 1 && (
            <div className="variation-selector">
              <div className="variation-selector-header">
                <span className="variation-selector-title">Variations</span>
                {allVariations.length >= 2 && (
                  <>
                    <button
                      className="variation-all-btn"
                      onClick={() => setSelectedVariations(new Set(allVariations))}
                    >
                      All
                    </button>
                    <button
                      className="variation-all-btn"
                      onClick={() => setSelectedVariations(new Set())}
                    >
                      None
                    </button>
                  </>
                )}
                <span className="variation-count">
                  {selectedVariations.size}/{allVariations.length}
                </span>
              </div>
              <ul className="variation-list">
                {allVariations.map((v) => {
                  const label = v.includes(':')
                    ? v.split(':').slice(1).join(':').trim()
                    : 'Main line'
                  return (
                    <li key={v} className="variation-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedVariations.has(v)}
                          onChange={(e) => {
                            setSelectedVariations((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(v)
                              else next.delete(v)
                              return next
                            })
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

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
              disabled={!selectedRoot || selectedVariations.size === 0}
              onClick={() => beginSession(selectedRoot, null)}
            >
              Start Training
            </button>
            {selectedRoot && (() => {
              const isInDeck = deck.some((e) => e.rootName === selectedRoot)
              return (
                <button
                  className={`deck-toggle-btn${isInDeck ? ' in-deck' : ''}`}
                  title={isInDeck ? 'Remove from deck' : 'Add to deck'}
                  onClick={() => handleToggleDeck(selectedRoot)}
                >
                  {isInDeck ? '✓ Deck' : '+ Deck'}
                </button>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
