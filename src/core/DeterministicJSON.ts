// DeterministicJSON.ts — port GDScript DeterministicJSON.gd
// Deterministická JSON serializace: seřazené klíče slovníků, stabilní řazení polí.

/** Serializuje hodnotu do deterministického JSON stringu s odsazením \t */
export function stringify(value: unknown, indent = '\t'): string {
  return serialize(value, indent, 0)
}

type AnyObj = Record<string, unknown>

/** Stable string comparator (returns 0 for equal keys, unlike `a < b ? -1 : 1`). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Speciální varianta pro GSSGraph — seřadí scenarios a personas podle jména.
 *
 * `nodes` a `connections` se ZÁMĚRNĚ neřadí: TickEngine zpracovává uzly a
 * spojení v pořadí pole (např. který ze dvou drainů odebere z poolu dřív),
 * takže přeřazení by změnilo výsledek simulace po uložení a načtení.
 */
export function stringifyGraph(graph: unknown): string {
  const gd = JSON.parse(JSON.stringify(graph)) as AnyObj

  if (Array.isArray(gd['scenarios'])) {
    gd['scenarios'] = (gd['scenarios'] as AnyObj[]).slice().sort((a, b) =>
      compareStrings(String(a['name'] ?? ''), String(b['name'] ?? '')))
  }
  if (Array.isArray(gd['personas'])) {
    gd['personas'] = (gd['personas'] as AnyObj[]).slice().sort((a, b) =>
      compareStrings(String(a['name'] ?? ''), String(b['name'] ?? '')))
  }

  return stringify(gd)
}

// ==================== INTERNÍ SERIALIZACE ====================

function serialize(value: unknown, indent: string, depth: number): string {
  if (value === null || value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') return escapeString(value)
  if (Array.isArray(value))      return serializeArray(value, indent, depth)
  if (typeof value === 'object') return serializeObject(value as Record<string, unknown>, indent, depth)
  return JSON.stringify(value)
}

function formatNumber(v: number): string {
  // NaN se musí řešit PŘED isFinite (isFinite(NaN) je false → dřív končil jako -1e308).
  if (Number.isNaN(v)) return '0'
  if (!Number.isFinite(v)) return v > 0 ? '1e308' : '-1e308'
  // Nejkratší zápis, který se přesně načte zpět (dřív toFixed(6) ořezal
  // malé hodnoty jako 0.0000005 na 0 — ztráta dat při uložení).
  return String(v)
}

function escapeString(s: string): string {
  return JSON.stringify(s) // Nativní JSON.stringify správně escapuje
}

function serializeObject(obj: Record<string, unknown>, indent: string, depth: number): string {
  const keys = Object.keys(obj).sort()
  if (keys.length === 0) return '{}'

  const innerIndent = indent.repeat(depth + 1)
  const outerIndent = indent.repeat(depth)
  const lines = keys.map((k) => `${innerIndent}${escapeString(k)}: ${serialize(obj[k], indent, depth + 1)}`)
  return `{\n${lines.join(',\n')}\n${outerIndent}}`
}

function serializeArray(arr: unknown[], indent: string, depth: number): string {
  if (arr.length === 0) return '[]'

  // Krátká jednoduchá pole inline
  const allSimple = arr.every((item) => typeof item !== 'object' || item === null)
  if (allSimple && arr.length <= 8) {
    return `[${arr.map((item) => serialize(item, indent, depth + 1)).join(', ')}]`
  }

  const innerIndent = indent.repeat(depth + 1)
  const outerIndent = indent.repeat(depth)
  const lines = arr.map((item) => `${innerIndent}${serialize(item, indent, depth + 1)}`)
  return `[\n${lines.join(',\n')}\n${outerIndent}]`
}
