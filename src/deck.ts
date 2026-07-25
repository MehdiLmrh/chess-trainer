import type { StatsDB } from './stats'

export type DeckSide = 'white' | 'black' | 'both'

export interface DeckEntry {
  rootName: string
  variations?: string[]  // undefined = all variations; only for Lichess entries
  customId?: string      // set when this entry refers to a custom opening
  side?: DeckSide        // per-entry side preference
}

export type Deck = DeckEntry[]

const KEY = 'chess-trainer-deck'

export function loadDeck(): Deck {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    // Migrate old string[] format
    if (raw.length > 0 && typeof raw[0] === 'string') {
      return (raw as string[]).map((name) => ({ rootName: name }))
    }
    return raw as Deck
  } catch { return [] }
}

function save(deck: Deck): void {
  localStorage.setItem(KEY, JSON.stringify(deck))
}

export function addToDeck(deck: Deck, rootName: string, variations?: string[]): Deck {
  const next: Deck = deck.some((e) => e.rootName === rootName)
    ? deck.map((e) => e.rootName === rootName ? { rootName, variations } : e)
    : [...deck, { rootName, variations }]
  save(next)
  return next
}

export function removeFromDeck(deck: Deck, rootName: string): Deck {
  const next = deck.filter((e) => e.rootName !== rootName || e.customId)
  save(next)
  return next
}

export function addCustomToDeck(deck: Deck, customId: string, name: string): Deck {
  if (deck.some((e) => e.customId === customId)) return deck
  const next = [...deck, { rootName: name, customId }]
  save(next)
  return next
}

export function removeCustomFromDeck(deck: Deck, customId: string): Deck {
  const next = deck.filter((e) => e.customId !== customId)
  save(next)
  return next
}

export function setDeckEntrySide(deck: Deck, entry: DeckEntry, side: DeckSide): Deck {
  const next = deck.map((e) => {
    const match = entry.customId
      ? e.customId === entry.customId
      : e.rootName === entry.rootName && !e.customId
    return match ? { ...e, side } : e
  })
  save(next)
  return next
}

// Builds a session queue; 'both' entries are expanded into two (one per side).
// Returned entries always have side resolved to 'white' | 'black'.
export function buildSessionQueue(
  deck: Deck,
  stats: StatsDB,
  deckSide: DeckSide = 'black',
): DeckEntry[] {
  if (deck.length === 0) return []
  const expanded = deck.flatMap((entry) => {
    const effective: DeckSide = entry.side ?? deckSide
    if (effective === 'both') {
      return [
        { ...entry, side: 'white' as const },
        { ...entry, side: 'black' as const },
      ]
    }
    return [{ ...entry, side: effective }]
  })
  return [...expanded]
    .map((entry) => ({ entry, sort: (stats[entry.rootName]?.perfect ?? 0) + Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((e) => e.entry)
}
