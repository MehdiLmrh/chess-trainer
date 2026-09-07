import type { TheoryDB } from './types'

export interface CustomOpening {
  id: string
  name: string
  createdAt: number
  db: TheoryDB
}

const KEY = 'chess-trainer-custom-openings'

export function loadCustomOpenings(): CustomOpening[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') }
  catch { return [] }
}

export class StorageFullError extends Error {}

export function saveCustomOpening(o: CustomOpening): CustomOpening[] {
  const all = loadCustomOpenings()
  const idx = all.findIndex((x) => x.id === o.id)
  if (idx >= 0) all[idx] = o
  else all.push(o)
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Large PGN imports can blow past the ~5 MB localStorage quota.
    throw new StorageFullError(
      'Not enough browser storage to save this opening — it may be too large, or you have too many saved.',
    )
  }
  return all
}

export function deleteCustomOpening(id: string): CustomOpening[] {
  const all = loadCustomOpenings().filter((x) => x.id !== id)
  localStorage.setItem(KEY, JSON.stringify(all))
  return all
}
