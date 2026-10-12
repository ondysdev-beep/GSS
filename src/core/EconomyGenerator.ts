// EconomyGenerator.ts — AI Economy Generator (Fáze 7 nových funkcí).
//
// Tenká vrstva nad Rust příkazem `generate_economy_graph`. Výstup modelu
// NIKDY nejde přímo do editoru — vždy prochází stejnou `validate()` funkcí
// z GraphValidator.ts, jakou používá běžné ruční úpravy grafu. Pokud model
// vrátí nevalidní JSON nebo graf s chybami, uživatel dostane konkrétní
// chybovou zprávu místo pádu aplikace nebo tichého vložení rozbitého grafu.

import { platform, PlatformUnsupportedError } from '../platform'
import { validate } from './GraphValidator'
import { normalizeGraph } from './GraphNormalizer'
import { TICK_SPEC_VERSION } from './TickEngine'
import { GSS_FORMAT_VERSION } from '../types/graph'
import type { GSSGraph } from '../types/graph'
import type { ValidationIssue } from '../types/simulation'

export class EconomyGenerationError extends Error {
  issues?: ValidationIssue[]
  constructor(message: string, issues?: ValidationIssue[]) {
    super(message)
    this.name = 'EconomyGenerationError'
    this.issues = issues
  }
}

export async function hasAnthropicApiKey(): Promise<boolean> {
  return platform.hasAnthropicApiKey()
}

export async function saveAnthropicApiKey(key: string): Promise<void> {
  return platform.saveAnthropicApiKey(key)
}

export async function clearAnthropicApiKey(): Promise<void> {
  return platform.clearAnthropicApiKey()
}

/** Vygeneruje a zvaliduje GSS graf z textového popisu. Vyhazuje EconomyGenerationError při jakémkoli problému. */
export async function generateEconomyGraph(prompt: string): Promise<GSSGraph> {
  let raw: string
  try {
    raw = await platform.generateEconomyGraph(prompt)
  } catch (err) {
    // Na webu (zatím) chybí CORS proxy — jasná zpráva místo obecné chyby.
    if (err instanceof PlatformUnsupportedError) throw new EconomyGenerationError(err.message)
    throw err
  }

  let parsed: unknown
  let cleaned = ''
  try {
    // Model dostal instrukci vracet čistý JSON, ale i tak občas obalí
    // odpověď do markdown fences — ošetříme nejběžnější případ.
    cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    try {
      parsed = JSON.parse(cleaned)
    } catch (err) {
      // Text před/za JSONem ("Here is your economy: {...}") — zkusíme vyříznout
      // nejvnější objekt; když ani to nejde, platí původní chyba.
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start < 0 || end <= start) throw err
      parsed = JSON.parse(cleaned.slice(start, end + 1))
    }
  } catch {
    // Oprava B9: pokud odpověď nekončí "}" nebo "]", nejpravděpodobněji šlo
    // o oříznutí kvůli limitu délky odpovědi (max_tokens), ne o obecnou
    // chybu modelu — uživatel dostane konkrétnější radu, ne jen "zkus znovu".
    const looksTruncated = cleaned.length > 0 && !/[}\]]\s*$/.test(cleaned)
    throw new EconomyGenerationError(
      looksTruncated
        ? 'The model\'s response looks cut off (too long/complex a graph). Try a simpler or shorter description.'
        : 'The model returned invalid JSON. Try rephrasing your description or try again.',
    )
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    throw new EconomyGenerationError('The model\'s response does not match the expected GSS graph structure.')
  }

  // Normalizace doplní chybějící/poškozená pole (label, position, data, id
  // jako string, porty…) — model je občas vynechá a editor by na tom spadl.
  const now = new Date().toISOString()
  const graph: GSSGraph = {
    ...normalizeGraph(parsed, 'AI Generated Economy'),
    version: GSS_FORMAT_VERSION,
    tick_spec_version: TICK_SPEC_VERSION,
    created_at: now,
    modified_at: now,
    simulation_seed: 42,
  }

  const issues = validate(graph)
  const errors = issues.filter((i) => i.severity === 'ERROR')
  if (errors.length > 0) {
    throw new EconomyGenerationError(
      `The generated graph has ${errors.length} error(s) and can't be safely loaded.`,
      issues,
    )
  }

  return graph
}
