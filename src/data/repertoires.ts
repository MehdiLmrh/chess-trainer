import { parsePgnToDb } from '../pgn'
import type { TheoryDB } from '../types'

// Bundled repertoire PGNs (Stockfish-annotated, recursive variations). Each
// file is a lazily-loaded chunk — the raw text (French alone is ~1 MB) is only
// fetched when that repertoire is opened, keeping the main bundle small.
const LOADERS = import.meta.glob('../../repertoires/*.pgn', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

export interface RepertoireMeta { id: string; name: string }
export interface Repertoire extends RepertoireMeta { db: TheoryDB }

function prettyName(path: string): string {
  const base = path.split('/').pop()!.replace(/\.pgn$/i, '')
  return base
    .replace(/_/g, ' ')
    .replace(/\bs\b/g, "'s")          // "king s indian" → "king's indian"
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

const METAS: RepertoireMeta[] = Object.keys(LOADERS)
  .sort()
  .map((id) => ({ id, name: prettyName(id) }))

/** Cheap: just names + ids, no fetch, no parse. */
export function listRepertoires(): RepertoireMeta[] {
  return METAS
}

const cache = new Map<string, Repertoire>()

/** Fetch + parse a repertoire's PGN into a theory DB (memoized). */
export async function loadRepertoire(id: string): Promise<Repertoire> {
  const hit = cache.get(id)
  if (hit) return hit
  const loader = LOADERS[id]
  const meta = METAS.find((m) => m.id === id)
  if (!loader || !meta) throw new Error(`Unknown repertoire: ${id}`)
  const text = await loader()
  const rep: Repertoire = { ...meta, db: parsePgnToDb(text, meta.name) }
  cache.set(id, rep)
  return rep
}
