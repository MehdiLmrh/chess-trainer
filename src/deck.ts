import type { StatsDB } from './stats'

export interface DeckEntry {
  rootName: string
  variations?: string[]  // undefined = all variations
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
  const next = deck.filter((e) => e.rootName !== rootName)
  save(next)
  return next
}

// Builds a one-pass session queue where less-practiced openings come first.
export function buildSessionQueue(deck: Deck, stats: StatsDB): DeckEntry[] {
  if (deck.length === 0) return []
  return [...deck]
    .map((entry) => ({ entry, sort: (stats[entry.rootName]?.perfect ?? 0) + Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((e) => e.entry)
}
