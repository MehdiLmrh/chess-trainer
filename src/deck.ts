import type { StatsDB } from './stats'

export type Deck = string[]

const KEY = 'chess-trainer-deck'

export function loadDeck(): Deck {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function save(deck: Deck): void {
  localStorage.setItem(KEY, JSON.stringify(deck))
}

export function addToDeck(deck: Deck, opening: string): Deck {
  if (deck.includes(opening)) return deck
  const next = [...deck, opening]
  save(next)
  return next
}

export function removeFromDeck(deck: Deck, opening: string): Deck {
  const next = deck.filter((o) => o !== opening)
  save(next)
  return next
}

// Weighted random: openings with fewer perfects are drawn more often.
// Avoids drawing the same opening twice in a row when the deck has multiple items.
export function drawFromDeck(deck: Deck, stats: StatsDB, lastDrawn = ''): string | null {
  if (deck.length === 0) return null
  const pool = deck.length > 1 ? deck.filter((o) => o !== lastDrawn) : deck
  const weights = pool.map((name) => Math.max(1, 11 - (stats[name]?.perfect ?? 0)))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// Builds a one-pass session queue where less-practiced openings come first.
// Each opening appears exactly once; the next call to buildSessionQueue starts a new round.
export function buildSessionQueue(deck: Deck, stats: StatsDB): string[] {
  if (deck.length === 0) return []
  return [...deck]
    .map((name) => ({ name, sort: (stats[name]?.perfect ?? 0) + Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((e) => e.name)
}
