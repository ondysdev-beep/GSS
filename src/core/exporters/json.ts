// JSON exporter — exports .gss format, preserves backward compatibility
// Sorted keys for deterministic diffs (ported from DeterministicJSON.gd)

import { GSS_FORMAT_VERSION } from '../../types/graph'
import { TICK_SPEC_VERSION } from '../TickEngine'
import type { GSSGraph } from '../../types/graph'

// Same semantics as JSON.stringify (undefined/functions are skipped in
// objects and become null in arrays) — dřív `undefined` vyrobil text
// "undefined", na kterém pak JSON.parse spadl a Save/Export selhal.
function sortedStringify(value: unknown): string | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined
  if (Array.isArray(value)) {
    return '[' + value.map((v) => sortedStringify(v) ?? 'null').join(',') + ']'
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof (obj as { toJSON?: unknown }).toJSON === 'function') return JSON.stringify(obj)
    const pairs: string[] = []
    for (const k of Object.keys(obj).sort()) {
      const v = sortedStringify(obj[k])
      if (v !== undefined) pairs.push(`${JSON.stringify(k)}:${v}`)
    }
    return '{' + pairs.join(',') + '}'
  }
  return JSON.stringify(value)
}

export function exportGSSJson(
  graph: GSSGraph,
): string {
  const doc: GSSGraph = {
    ...graph,
    version: GSS_FORMAT_VERSION,
    tick_spec_version: TICK_SPEC_VERSION,
    modified_at: new Date().toISOString(),
  }
  return JSON.stringify(JSON.parse(sortedStringify(doc) ?? '{}'), null, 2)
}
