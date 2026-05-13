// Record<openingName, excludedVariationNames[]>
export type ExclusionsDB = Record<string, string[]>

const KEY = 'chess-trainer-exclusions'

export function loadExclusions(): ExclusionsDB {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export function saveExclusions(db: ExclusionsDB): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function addExclusion(db: ExclusionsDB, opening: string, variation: string): ExclusionsDB {
  const current = db[opening] ?? []
  if (current.includes(variation)) return db
  const next = { ...db, [opening]: [...current, variation] }
  saveExclusions(next)
  return next
}

export function removeExclusion(db: ExclusionsDB, opening: string, variation: string): ExclusionsDB {
  const next = { ...db, [opening]: (db[opening] ?? []).filter((v) => v !== variation) }
  saveExclusions(next)
  return next
}
