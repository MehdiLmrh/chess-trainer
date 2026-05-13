import type { StarLevel } from '../stats'

export function Stars({ level }: { level: StarLevel }) {
  if (level === 'none')  return null
  if (level === 'empty') return <span className="stars stars-empty">☆</span>
  if (level === 'gold1') return <span className="stars stars-gold">★</span>
  if (level === 'gold2') return <span className="stars stars-gold">★★</span>
  return                        <span className="stars stars-gold">★★★</span>
}
