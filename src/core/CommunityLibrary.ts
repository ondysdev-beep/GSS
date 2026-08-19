// CommunityLibrary.ts — Community Library (Fáze 8 nových funkcí).
//
// GSS nemá a nebude mít vlastní backend pro hostování/sdílení grafů (stejná
// zásada jako u AI Generatoru a itch.io klíče — nevymýšlet neexistující
// infrastrukturu). Místo toho:
//
// - "Browse": čte statický JSON index hostovaný v GitHub repozitáři GSS
//   (raw.githubusercontent.com — veřejné, bez nutnosti API klíče). Nové
//   položky přibývají tak, že komunita pošle PR do `community-index.json`
//   v repozitáři — GSS samotné žádný upload mechanismus nemá.
// - "Import from URL": funguje HNED bez čekání na PR — kdokoli může nahrát
//   graf kamkoliv (GitHub raw soubor, gist, vlastní web) a nasdílet přímo
//   odkaz. Stejná defenzivní validace jako u AI Generatoru — žádný graf
//   z internetu se nevloží do editoru bez průchodu GraphValidatorem.
// - "Share": export aktuálního grafu jako JSON pro ruční nahrání někam
//   (žádné GitHub OAuth/token flow v této fázi — to by pro "nice to have"
//   přidalo neúměrně komplexity; zůstává jako budoucí vylepšení).

import { validate } from './GraphValidator'
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

const DEFAULT_INDEX_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_COMMUNITY_INDEX_URL ||
  'https://raw.githubusercontent.com/ondysdev-beep/GSS/master/community-index.json'

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
  return data as CommunityEntry[]
}

/** Stáhne graf z libovolné URL a zvaliduje ho stejně jako AI Generator — nikdy nedůvěřuje cizímu obsahu naslepo. */
export async function importGraphFromUrl(url: string): Promise<GSSGraph> {
  let trimmed = url.trim()
  if (!trimmed) throw new CommunityLibraryError('Zadej URL grafu.')
  // GitHub Gist odkazy (gist.github.com/...) nejsou přímo JSON — uživatelé
  // je ale nejčastěji budou kopírovat právě takhle, takže je automaticky
  // převedeme na raw formát pro nejběžnější případ (jeden soubor v gistu).
  // Oprava B7: ID gistu může obsahovat i velká písmena (byla jen [a-f0-9],
  // teď [a-fA-F0-9]) — anonymní gisty bez uživatelského jména v URL zůstávají
  // neošetřené (nešlo ověřit jejich přesný raw formát bez přístupu k živému
  // GitHub API v tomto prostředí); v tom případě fetch prostě selže na
  // HTML místo JSON a uživatel dostane srozumitelnou chybu níž, ne pád.
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

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    throw new CommunityLibraryError('The file does not match the GSS graph structure (missing "nodes").')
  }

  const graph = parsed as GSSGraph
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
