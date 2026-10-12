// CommunityLibrary.ts — Community Library (Fáze 8 nových funkcí).
//
// GSS nemá a nebude mít vlastní backend pro hostování/sdílení grafů (stejná
// zásada jako u AI Generatoru — nevymýšlet neexistující infrastrukturu).
// Místo toho:
//
// - "Browse": čte statický JSON index hostovaný v GitHub repozitáři GSS
//   (raw.githubusercontent.com — veřejné, bez nutnosti API klíče). Nové
//   položky přibývají tak, že komunita pošle PR do `community-index.json`
//   v repozitáři — GSS samotné žádný upload mechanismus nemá.
// - "Import from URL": funguje HNED bez čekání na PR — kdokoli může nahrát
//   graf kamkoliv (GitHub raw soubor, gist, vlastní web) a nasdílet přímo
//   odkaz. Stejná defenzivní validace jako u AI Generatoru — žádný graf
//   z internetu se nevloží do editoru bez normalizace a průchodu GraphValidatorem.
// - "Share": export aktuálního grafu jako JSON pro ruční nahrání někam.

import { validate } from './GraphValidator'
import { normalizeGraph, looksLikeGraph } from './GraphNormalizer'
import { exportGSSJson } from './exporters/json'
import type { GSSGraph } from '../types/graph'

export class CommunityLibraryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommunityLibraryError'
  }
}

export interface CommunityEntry {
  id: string
  name: string
  author: string
  description: string
  category: string
  url: string
}

// Repozitář má výchozí větev `main` (dřív zde byla `master`, která
// neexistuje → index vracel 404).
const DEFAULT_INDEX_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_COMMUNITY_INDEX_URL ||
  'https://raw.githubusercontent.com/ondysdev-beep/GSS/main/community-index.json'

function isEntry(e: unknown): e is CommunityEntry {
  if (!e || typeof e !== 'object') return false
  const r = e as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.name === 'string' && typeof r.url === 'string' && /^https:\/\//.test(r.url)
}

/** Načte veřejný, komunitou spravovaný index sdílených grafů (viz community-index.json). */
export async function fetchCommunityIndex(indexUrl: string = DEFAULT_INDEX_URL): Promise<CommunityEntry[]> {
  let res: Response
  try {
    res = await fetch(indexUrl, { signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    throw new CommunityLibraryError(`Failed to load community index: ${err}`)
  }
  if (!res.ok) {
    throw new CommunityLibraryError(`Community index returned HTTP ${res.status}.`)
  }
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) {
    throw new CommunityLibraryError('Community index has an unexpected format.')
  }
  // Neúplné/poškozené položky se přeskočí, místo aby rozbily UI.
  return data.filter(isEntry).map((e) => ({
    id: e.id,
    name: e.name,
    url: e.url,
    author: typeof e.author === 'string' ? e.author : 'unknown',
    description: typeof e.description === 'string' ? e.description : '',
    category: typeof e.category === 'string' ? e.category : 'Other',
  }))
}

/** Stáhne graf z libovolné URL a zvaliduje ho stejně jako AI Generator — nikdy nedůvěřuje cizímu obsahu naslepo. */
export async function importGraphFromUrl(url: string): Promise<GSSGraph> {
  let trimmed = url.trim()
  if (!trimmed) throw new CommunityLibraryError('Enter the URL of a graph to import.')
  // GitHub Gist odkazy (gist.github.com/...) nejsou přímo JSON — převedeme je
  // na raw formát pro nejběžnější případ (jeden soubor v gistu). Oprava B7:
  // ID gistu může obsahovat i velká písmena. Anonymní gisty bez uživatelského
  // jména v URL zůstávají neošetřené — fetch pak vrátí HTML a uživatel dostane
  // srozumitelnou chybu níž, ne pád.
  const gistMatch = trimmed.match(/^https:\/\/gist\.github\.com\/([^/]+)\/([a-fA-F0-9]+)/)
  if (gistMatch) {
    trimmed = `https://gist.githubusercontent.com/${gistMatch[1]}/${gistMatch[2]}/raw/`
  }

  let res: Response
  try {
    res = await fetch(trimmed, { signal: AbortSignal.timeout(15_000) })
  } catch (err) {
    throw new CommunityLibraryError(`Failed to download graph: ${err}`)
  }
  if (!res.ok) {
    throw new CommunityLibraryError(`Server returned HTTP ${res.status}.`)
  }

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new CommunityLibraryError('The file at this URL is not valid JSON.')
  }

  if (!looksLikeGraph(parsed)) {
    throw new CommunityLibraryError('The file does not match the GSS graph structure (missing "nodes").')
  }

  // Doplnění chybějících polí (name, label, position, data…) — dřív se graf
  // vracel tak, jak přišel, a např. vzorky bez `name` pak shodily Save.
  const graph = normalizeGraph(parsed, 'Imported Graph')
  const issues = validate(graph)
  const errors = issues.filter((i) => i.severity === 'ERROR')
  if (errors.length > 0) {
    throw new CommunityLibraryError(
      `The graph has ${errors.length} error(s) and can't be safely imported: ${errors[0].message}`,
    )
  }

  return graph
}

/** Export aktuálního grafu jako JSON text ke sdílení (např. nahrání jako GitHub Gist). Znovupoužívá existující exportér, nic nového. */
export function graphToShareableJson(graph: GSSGraph): string {
  return exportGSSJson(graph)
}
