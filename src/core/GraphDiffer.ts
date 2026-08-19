// GraphDiffer.ts — přímý port GDScript GraphDiffer.gd
// Strukturální diff dvou GSSGraph objektů, klasifikuje závažnost změn.

import type { GSSGraph } from '../types/graph'

export type ChangeType = 'ADDED' | 'REMOVED' | 'CHANGED'
export type DiffSeverity = 'BREAKING' | 'MAJOR' | 'MINOR'

export interface NodeChange {
  type: ChangeType
  severity: DiffSeverity
  node_id: string
  details: string
}

export interface EdgeChange {
  type: ChangeType
  severity: DiffSeverity
  from: string
  to: string
  details: string
}

export interface ParamChange {
  severity: DiffSeverity
  node_id: string
  field: string
  old_value: unknown
  new_value: unknown
}

export interface DiffReport {
  node_changes: NodeChange[]
  edge_changes: EdgeChange[]
  param_changes: ParamChange[]
  summary: { added: number; removed: number; changed: number; breaking: number }
}

const MAJOR_FIELDS = new Set([
  'rate', 'capacity', 'input_amount', 'output_amount', 'cycle_time',
  'success_chance', 'value', 'resource', 'input_resource', 'output_resource',
  'split_mode', 'weights', 'output_count',
])

export function diffGraphs(graphA: GSSGraph, graphB: GSSGraph): DiffReport {
  const nodeChanges:  NodeChange[]  = []
  const edgeChanges:  EdgeChange[]  = []
  const paramChanges: ParamChange[] = []

  // Index uzlů podle ID. Normalizace `data ?? {}` (oprava B1/B1b): grafy
  // nahrané přes "Nahrát soubor" v Diff Vieweru jsou nedůvěryhodný externí
  // vstup a mohou mít uzel bez pole `data` úplně — bez normalizace by na
  // to spadl `Object.keys(dataA)` níž přímo uvnitř React `useMemo` (viz
  // nález B1b), tedy během renderu, ne v ošetřeném event handleru.
  const nodesA: Record<string, (typeof graphA.nodes)[0]> = {}
  const nodesB: Record<string, (typeof graphB.nodes)[0]> = {}
  for (const n of graphA.nodes) nodesA[String(n.id)] = { ...n, data: n.data ?? ({} as typeof n.data) }
  for (const n of graphB.nodes) nodesB[String(n.id)] = { ...n, data: n.data ?? ({} as typeof n.data) }

  // Odstraněné uzly → BREAKING
  for (const nid of Object.keys(nodesA)) {
    if (!nodesB[nid]) {
      nodeChanges.push({
        type: 'REMOVED', severity: 'BREAKING', node_id: nid,
        details: `Node '${nid}' removed (was type ${nodesA[nid].type})`,
      })
    }
  }

  // Přidané uzly → MAJOR
  for (const nid of Object.keys(nodesB)) {
    if (!nodesA[nid]) {
      nodeChanges.push({
        type: 'ADDED', severity: 'MAJOR', node_id: nid,
        details: `Node '${nid}' added (type ${nodesB[nid].type})`,
      })
    }
  }

  // Změněné uzly (stejné ID)
  for (const nid of Object.keys(nodesA)) {
    if (!nodesB[nid]) continue
    const na = nodesA[nid]
    const nb = nodesB[nid]

    // Změna typu → BREAKING
    if (na.type !== nb.type) {
      nodeChanges.push({
        type: 'CHANGED', severity: 'BREAKING', node_id: nid,
        details: `Node '${nid}' type changed: ${na.type} → ${nb.type}`,
      })
      continue
    }

    // Porovnat data pole
    const dataA = na.data as unknown as Record<string, unknown>
    const dataB = nb.data as unknown as Record<string, unknown>
    const allKeys = new Set([...Object.keys(dataA), ...Object.keys(dataB)])
    let alreadyAdded = false

    for (const k of allKeys) {
      const va = dataA[k]
      const vb = dataB[k]
      if (!valuesDiffer(va, vb)) continue

      const sev: DiffSeverity = MAJOR_FIELDS.has(k) ? 'MAJOR' : 'MINOR'
      paramChanges.push({ severity: sev, node_id: nid, field: k, old_value: va, new_value: vb })

      if (!alreadyAdded) {
        nodeChanges.push({
          type: 'CHANGED', severity: sev, node_id: nid,
          details: `Node '${nid}' parameters changed`,
        })
        alreadyAdded = true
      }
    }
  }

  // Index hran
  const edgesA: Record<string, (typeof graphA.connections)[0]> = {}
  const edgesB: Record<string, (typeof graphB.connections)[0]> = {}
  for (const e of graphA.connections) edgesA[edgeKey(e)] = e
  for (const e of graphB.connections) edgesB[edgeKey(e)] = e

  // Odstraněné hrany → BREAKING
  for (const key of Object.keys(edgesA)) {
    if (!edgesB[key]) {
      const e = edgesA[key]
      edgeChanges.push({
        type: 'REMOVED', severity: 'BREAKING',
        from: String(e.from_node), to: String(e.to_node),
        details: `Edge removed: ${e.from_node} → ${e.to_node}`,
      })
    }
  }

  // Přidané hrany → MAJOR
  for (const key of Object.keys(edgesB)) {
    if (!edgesA[key]) {
      const e = edgesB[key]
      edgeChanges.push({
        type: 'ADDED', severity: 'MAJOR',
        from: String(e.from_node), to: String(e.to_node),
        details: `Edge added: ${e.from_node} → ${e.to_node}`,
      })
    }
  }

  // Summary
  let added = 0, removed = 0, changed = 0, breaking = 0
  for (const c of [...nodeChanges, ...edgeChanges]) {
    if (c.type === 'ADDED')   added++
    if (c.type === 'REMOVED') removed++
    if (c.type === 'CHANGED') changed++
    if (c.severity === 'BREAKING') breaking++
  }

  return { node_changes: nodeChanges, edge_changes: edgeChanges, param_changes: paramChanges, summary: { added, removed, changed, breaking } }
}

export function formatDiffChange(c: NodeChange | EdgeChange): string {
  return `[${c.severity}] ${c.details}`
}

function edgeKey(e: { from_node: string; from_port: number; to_node: string; to_port: number }): string {
  return `${e.from_node}:${e.from_port}->${e.to_node}:${e.to_port}`
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return false
  if (a === null || b === null) return true
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 0.0001
  return String(a) !== String(b)
}
