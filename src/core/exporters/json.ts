// JSON exporter — exports .gss format, preserves backward compatibility
// Sorted keys for deterministic diffs (ported from DeterministicJSON.gd)

import { GSS_FORMAT_VERSION } from '../../types/graph'
import { TICK_SPEC_VERSION } from '../TickEngine'
import type { GSSGraph } from '../../types/graph'

function sortedStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(sortedStringify).join(',') + ']'
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as object).sort()
    const pairs = keys.map(
      (k) => `${JSON.stringify(k)}:${sortedStringify((value as Record<string, unknown>)[k])}`,
    )
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
  return JSON.stringify(JSON.parse(sortedStringify(doc)), null, 2)
}
