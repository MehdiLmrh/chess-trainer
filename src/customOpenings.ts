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

export function saveCustomOpening(o: CustomOpening): CustomOpening[] {
  const all = loadCustomOpenings()
  const idx = all.findIndex((x) => x.id === o.id)
  if (idx >= 0) all[idx] = o
  else all.push(o)
  localStorage.setItem(KEY, JSON.stringify(all))
  return all
}

export function deleteCustomOpening(id: string): CustomOpening[] {
  const all = loadCustomOpenings().filter((x) => x.id !== id)
  localStorage.setItem(KEY, JSON.stringify(all))
  return all
}
