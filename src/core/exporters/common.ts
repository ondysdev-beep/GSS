// common.ts — shared helpers for the code exporters (C#, GDScript, TypeScript).

import type { GSSGraph, GSSNode } from '../../types/graph'
import { NodeType } from '../../types/graph'

export const NODE_TYPE_NAMES: Record<number, string> = {
  [NodeType.POOL]: 'Pool',
  [NodeType.SOURCE]: 'Source',
  [NodeType.CONVERTER]: 'Converter',
  [NodeType.DRAIN]: 'Drain',
  [NodeType.GATE]: 'Gate',
  [NodeType.CHANCE]: 'Chance',
  [NodeType.SPLITTER]: 'Splitter',
  [NodeType.TIMER]: 'Timer',
  [NodeType.FORMULA]: 'Formula',
  [NodeType.PLAYER_ACTION]: 'PlayerAction',
}

export const GATE_OPERATORS = ['>', '>=', '<', '<=', '==', '!='] as const

export function dataOf(node: GSSNode): Record<string, unknown> {
  const d = node.data as unknown
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
}

/** Finite number or fallback (exported code must never contain NaN/Infinity/strings in number slots). */
export function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/**
 * Double-quoted string literal with all special characters escaped.
 * JSON escapes (\" \\ \n \t \uXXXX) are valid in C#, GDScript and TS.
 */
export function quote(v: unknown): string {
  return JSON.stringify(String(v ?? ''))
}

// CR, LF and the Unicode line/paragraph separators (U+2028, U+2029), which
// also end a `//` comment in JS/TS and C#.
const LINE_BREAKS = new RegExp(`[\\r\\n${String.fromCharCode(0x2028, 0x2029)}]+`, 'g')

/** Text safe to put inside a single-line comment (no line breaks). */
export function commentText(v: unknown): string {
  return String(v ?? '').replace(LINE_BREAKS, ' ')
}

/** Identifier from arbitrary text: [A-Za-z0-9_], never starting with a digit, never empty. */
export function identifier(raw: string, fallback: string): string {
  let id = raw.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!id) id = fallback
  if (/^[0-9]/.test(id)) id = `_${id}`
  return id
}

/** Stable, collision-free identifiers per node ID ("a-b" and "a_b" no longer clash). */
export function nodeIdentifiers(graph: GSSGraph): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  graph.nodes.forEach((n, i) => {
    const base = identifier(String(n.id), `node_${i + 1}`)
    let id = base
    for (let k = 2; used.has(id.toLowerCase()); k++) id = `${base}_${k}`
    used.add(id.toLowerCase())
    out.set(String(n.id), id)
  })
  return out
}

export function nodesOfType(graph: GSSGraph, type: number): GSSNode[] {
  return graph.nodes.filter((n) => n.type === type)
}

/** Parsed splitter weights (same rules as the TickEngine: non-positive → 1). */
export function splitterWeights(v: unknown): number[] {
  return str(v, '1,1').split(',').map((w) => {
    const n = parseFloat(w.trim())
    return Number.isFinite(n) && n > 0 ? n : 1
  })
}
