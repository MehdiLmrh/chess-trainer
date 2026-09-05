import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchOpenings, getRootNames, getVariations, buildTheoryDB, filterDB, getCleanupStats, type CleanupStats } from './data/lichess'
import { Trainer } from './components/Trainer'
import { Profile } from './components/Profile'
import { Explorer } from './components/Explorer'
import { DeckScreen } from './components/Deck'
import { Editor } from './components/Editor'
import { loadStats, recordStart, recordCorrect, recordWrong, recordComplete, type StatsDB } from './stats'
import { loadExclusions, addExclusion, removeExclusion, type ExclusionsDB } from './exclusions'
import { loadDeck, addToDeck, removeFromDeck, addCustomToDeck, removeCustomFromDeck, buildSessionQueue, setDeckEntrySide, type Deck, type DeckEntry, type DeckSide } from './deck'
import { loadCustomOpenings, saveCustomOpening, type CustomOpening } from './customOpenings'
import { sound } from './sound'
import { RunHud, RunSummary } from './components/Run'
import { initialRunStats, pointsForMove, type RunStats } from './run'
import type { Opening } from './data/lichess'
import type { Side, TheoryDB } from './types'
import './App.css'

type Screen = 'setup' | 'trainer' | 'profile' | 'explorer' | 'deck' | 'editor' | 'run-summary'

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
  const [deckSide, setDeckSide] = useState<DeckSide>('black')
  const [useEvalThresholds, setUseEvalThresholds] = useState(false)
  const [ownThresholdCp, setOwnThresholdCp] = useState(30)
  const [opponentThresholdCp, setOpponentThresholdCp] = useState(50)
  const [sfxOn, setSfxOn]         = useState(() => sound.isSfxOn())
  const [musicOn, setMusicOn]     = useState(() => sound.isMusicOn())
  const [runMode, setRunMode]     = useState(false)
  const [runStats, setRunStats]   = useState<RunStats>(initialRunStats)
  const lastDrawnRef              = useRef('')
  const sessionQueueRef           = useRef<DeckEntry[]>([])
  const sessionPosRef             = useRef(0)
  const activeDeckRef             = useRef<DeckEntry[]>([])
  const lastRunDeckRef            = useRef<DeckEntry[]>([])
  const inputRef                  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchOpenings()
      .then((o) => { setOpenings(o); setCleanupStats(getCleanupStats()) })
      .catch(() => setLoadError('Failed to load openings. Check your connection.'))
  }, [])

  // Browsers require a user gesture before audio can play — unlock on the
  // first click/keypress anywhere in the app.
  useEffect(() => {
    function unlock() { sound.unlock() }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
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
    // entry.side is already resolved to 'white' | 'black' by buildSessionQueue
    if (entry.side === 'white' || entry.side === 'black') setSide(entry.side)
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
    const queue = buildSessionQueue(filtered, statsDB, deckSide)
    sessionQueueRef.current = queue
    sessionPosRef.current = 0
    advanceSession(queue, 0)
  }

  function startRunSession(filtered: DeckEntry[]) {
    if (filtered.length === 0) return
    lastRunDeckRef.current = filtered
    setRunMode(true)
    setRunStats(initialRunStats())
    startDeckSession(filtered)
  }

  function retryRun() {
    startRunSession(lastRunDeckRef.current)
  }

  function drawNext() {
    let pos = sessionPosRef.current
    let queue = sessionQueueRef.current
    if (pos >= queue.length) {
      queue = buildSessionQueue(activeDeckRef.current, statsDB, deckSide)
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
      <button
        className={`nav-btn sound-btn${sfxOn ? ' active' : ''}`}
        title={sfxOn ? 'Sound effects on' : 'Sound effects off'}
        onClick={() => { const next = !sfxOn; setSfxOn(next); sound.setSfxOn(next); if (next) sound.play('move') }}
      >
        {sfxOn ? '🔊' : '🔇'}
      </button>
      <button
        className={`nav-btn sound-btn${musicOn ? ' active' : ''}`}
        title={musicOn ? 'Music on' : 'Music off'}
        onClick={() => { const next = !musicOn; setMusicOn(next); sound.setMusicOn(next) }}
      >
        🎵
      </button>
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
        deckSide={deckSide}
        statsDB={statsDB}
        onBack={() => setScreen('setup')}
        onRemove={(entry) => setDeck((d) =>
          entry.customId
            ? removeCustomFromDeck(d, entry.customId)
            : removeFromDeck(d, entry.rootName)
        )}
        onSetDeckSide={setDeckSide}
        onSetEntrySide={(entry, side) => setDeck((d) => setDeckEntrySide(d, entry, side))}
        mainLineOnly={mainLineOnly}
        onSetMainLineOnly={setMainLineOnly}
        onStart={(filtered) => startDeckSession(filtered)}
        onStartRun={(filtered) => startRunSession(filtered)}
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

  if (screen === 'run-summary') {
    return (
      <RunSummary
        stats={runStats}
        onRetry={retryRun}
        onBack={() => { setRunMode(false); setScreen('setup') }}
      />
    )
  }

  if (screen === 'trainer') {
    return (
      <>
        {navBtns}
        {runMode && <RunHud stats={runStats} />}
        <Trainer
          key={sessionKey}
          db={db}
          side={side}
          selectedRoot={selectedRoot}
          deckProgress={deckMode ? deckProgress ?? undefined : undefined}
          evalConfig={useEvalThresholds
            ? { ownThreshold: ownThresholdCp, opponentThreshold: opponentThresholdCp }
            : undefined}
          onCorrect={(quality) => {
            setStatsDB((s) => recordCorrect(s, selectedRoot))
            if (runMode) {
              setRunStats((r) => {
                const combo = r.combo + 1
                return {
                  ...r,
                  score: r.score + pointsForMove(quality),
                  correctMoves: r.correctMoves + 1,
                  combo,
                  bestCombo: Math.max(r.bestCombo, combo),
                }
              })
            }
          }}
          onWrong={() => {
            setStatsDB((s) => recordWrong(s, selectedRoot))
            if (runMode) {
              const lives = runStats.lives - 1
              setRunStats((r) => ({ ...r, lives, combo: 0 }))
              if (lives <= 0) {
                sound.play('gameOver')
                setTimeout(() => setScreen('run-summary'), 650)
              }
            }
          }}
          onEndOfTheory={(isPerfect, variation) => {
            setStatsDB((s) => {
              let next = recordComplete(s, selectedRoot, isPerfect)
              if (variation && variation !== selectedRoot)
                next = recordComplete(next, variation, isPerfect)
              return next
            })
            if (runMode) setRunStats((r) => ({ ...r, openingsCleared: r.openingsCleared + 1 }))
          }}
          onExclude={handleExclude}
          onReset={handleReset}
          onBack={() => {
            if (runMode) { setRunMode(false); setScreen('setup') }
            else setScreen(deckMode ? 'deck' : 'setup')
          }}
          onNext={deckMode ? drawNext : undefined}
          onDeleteLine={(newDb) => {
            setDbOverride(newDb)
            const custom = customOpenings.find((o) => o.name === selectedRoot)
            if (custom) {
              const updated: CustomOpening = { ...custom, db: newDb }
              setCustomOpenings((prev) => prev.map((o) => o.id === custom.id ? updated : o))
              saveCustomOpening(updated)
            }
            setSessionKey((k) => k + 1)
          }}
        />
      </>
    )
  }

  // setup screen
  return (
    <div className="setup">
      {navBtns}
      <h1>Chess Theory Trainer</h1>

      <div className="deck-panel">
        {deck.length > 0 ? (
          <>
            <div className="deck-panel-head">
              <span className="deck-panel-title">Your deck</span>
              <span className="deck-panel-count">
                {deck.length} opening{deck.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="deck-panel-side">
              {([['white', 'White'], ['black', 'Black'], ['both', 'Both']] as [DeckSide, string][]).map(
                ([value, label]) => (
                  <button
                    key={value}
                    className={deckSide === value ? 'active' : ''}
                    onClick={() => setDeckSide(value)}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <div className="deck-panel-actions">
              <button
                className="start-btn"
                disabled={openings.length === 0 && deck.some((e) => !e.customId)}
                onClick={() => startDeckSession(deck)}
              >
                ▶ Start Deck Practice
              </button>
              <button
                className="run-btn"
                disabled={openings.length === 0 && deck.some((e) => !e.customId)}
                title="3 lives — cycle the deck until you run out"
                onClick={() => startRunSession(deck)}
              >
                🏃 Start Run (3 lives)
              </button>
              <button className="deck-manage-btn" onClick={() => setScreen('deck')}>
                Manage deck →
              </button>
            </div>
          </>
        ) : (
          <p className="deck-panel-empty">
            Your deck is empty. Search an opening below, or open the{' '}
            <button className="link-btn" onClick={() => setScreen('explorer')}>Explorer</button>{' '}
            to add lines.
          </p>
        )}
      </div>

      <div className="divider">or train a single opening</div>

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
        </>
      )}

      {selectedRoot && (
        <>
          <div className="eval-thresholds">
            <label className="eval-thresholds-toggle">
              <input
                type="checkbox"
                checked={useEvalThresholds}
                onChange={(e) => setUseEvalThresholds(e.target.checked)}
              />
              <strong>Eval-based training</strong>
              <span className="eval-thresholds-hint">(requires Stockfish-annotated PGN)</span>
            </label>
            {useEvalThresholds && (
              <div className="eval-thresholds-body">
                <label>
                  My moves: max <strong>{ownThresholdCp} cp</strong> drop
                  <input
                    type="range" min={0} max={100} step={5}
                    value={ownThresholdCp}
                    onChange={(e) => setOwnThresholdCp(Number(e.target.value))}
                  />
                </label>
                <label>
                  Opponent moves: max <strong>{opponentThresholdCp} cp</strong> drop
                  <input
                    type="range" min={0} max={200} step={10}
                    value={opponentThresholdCp}
                    onChange={(e) => setOpponentThresholdCp(Number(e.target.value))}
                  />
                </label>
              </div>
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
              disabled={allVariations.length > 0 && selectedVariations.size === 0}
              onClick={() => beginSession(selectedRoot, dbOverride)}
            >
              Start Training
            </button>
            {(() => {
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
