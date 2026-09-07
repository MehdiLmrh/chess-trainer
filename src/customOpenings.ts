import type { TheoryDB } from './types'

export interface CustomOpening {
  id: string
  name: string
  createdAt: number
  db: TheoryDB
}

export class StorageFullError extends Error {}

// Custom openings live in IndexedDB — a Stockfish-annotated repertoire PGN can
// serialize to several MB, well past the ~5 MB localStorage quota. A small
// in-memory cache lets the UI read synchronously after `initCustomOpenings()`.

const LS_KEY  = 'chess-trainer-custom-openings' // legacy store, migrated on init
const DB_NAME = 'chess-trainer'
const STORE   = 'customOpenings'

let cache: CustomOpening[] = []
let ready = false
let dbPromise: Promise<IDBDatabase> | null | undefined

// ── IndexedDB plumbing ───────────────────────────────────────────────────────

function idb(): Promise<IDBDatabase> | null {
  if (dbPromise === undefined) {
    dbPromise =
      typeof indexedDB === 'undefined'
        ? null
        : new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1)
            req.onupgradeneeded = () => {
              const db = req.result
              if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
          })
  }
  return dbPromise
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── localStorage fallback ────────────────────────────────────────────────────

function lsLoad(): CustomOpening[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') }
  catch { return [] }
}

function lsSave(all: CustomOpening[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch {
    throw new StorageFullError(
      'Not enough browser storage to save this opening — it may be too large, or you have too many saved.',
    )
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/** Populate the in-memory cache from IndexedDB (or localStorage). Idempotent. */
export async function initCustomOpenings(): Promise<CustomOpening[]> {
  if (ready) return cache
  const dbp = idb()
  if (!dbp) {
    cache = lsLoad()
    ready = true
    return cache
  }
  try {
    const db = await dbp
    const all = await tx<CustomOpening[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<CustomOpening[]>)
    // One-time migration of the old localStorage store into IndexedDB.
    const legacy = lsLoad()
    if (legacy.length > 0) {
      for (const o of legacy) {
        if (!all.some((x) => x.id === o.id)) {
          await tx(db, 'readwrite', (s) => s.put(o))
          all.push(o)
        }
      }
      try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    }
    cache = all.sort((a, b) => a.createdAt - b.createdAt)
    ready = true
    return cache
  } catch {
    cache = lsLoad()
    ready = true
    return cache
  }
}

/** Synchronous snapshot of the cache (empty until `initCustomOpenings` resolves). */
export function getCustomOpenings(): CustomOpening[] {
  return cache
}

export async function saveCustomOpening(o: CustomOpening): Promise<CustomOpening[]> {
  const dbp = idb()
  if (dbp) {
    try {
      const db = await dbp
      await tx(db, 'readwrite', (s) => s.put(o))
      cache = cache.some((x) => x.id === o.id)
        ? cache.map((x) => (x.id === o.id ? o : x))
        : [...cache, o]
      return cache
    } catch {
      throw new StorageFullError('Not enough browser storage to save this opening.')
    }
  }
  const all = lsLoad()
  const idx = all.findIndex((x) => x.id === o.id)
  if (idx >= 0) all[idx] = o
  else all.push(o)
  lsSave(all)
  cache = all
  return cache
}

export async function deleteCustomOpening(id: string): Promise<CustomOpening[]> {
  const dbp = idb()
  if (dbp) {
    try {
      const db = await dbp
      await tx(db, 'readwrite', (s) => s.delete(id))
      cache = cache.filter((x) => x.id !== id)
      return cache
    } catch { /* fall through to localStorage */ }
  }
  const all = lsLoad().filter((x) => x.id !== id)
  lsSave(all)
  cache = all
  return cache
}
