// GraphNormalizer.ts — turns any parsed JSON that looks like a GSS graph
// into a structurally complete GSSGraph.
//
// Grafy přichází z mnoha zdrojů (vlastní .gss soubory, vzorky v
// public/samples, Community Library, AI Generator, autosave, Diff Viewer
// upload). Dřív se načítaly "jak jsou" — vzorkům chybělo `name` i `label`,
// takže např. Save padal na `graph.name.replace`, a uzel bez `data` shodil
// render editoru. Normalizace doplní chybějící pole výchozími hodnotami,
// ale NEMĚNÍ význam dat (neplatné hodnoty dál hlásí GraphValidator).

import { GSS_FORMAT_VERSION, NodeType } from '../types/graph'
import type { GSSGraph, GSSNode, GSSConnection, NodeTypeValue } from '../types/graph'
import { TICK_SPEC_VERSION } from './TickEngine'

export class GraphFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphFormatError'
  }
}

const TYPE_NAMES: Record<number, string> = {
  [NodeType.POOL]: 'Pool',
  [NodeType.SOURCE]: 'Source',
  [NodeType.CONVERTER]: 'Converter',
  [NodeType.DRAIN]: 'Drain',
  [NodeType.GATE]: 'Gate',
  [NodeType.CHANCE]: 'Chance',
  [NodeType.SPLITTER]: 'Splitter',
  [NodeType.TIMER]: 'Timer',
  [NodeType.FORMULA]: 'Formula',
  [NodeType.PLAYER_ACTION]: 'Player Action',
}

/** All node type IDs the engine understands. */
export const KNOWN_NODE_TYPES: ReadonlySet<number> = new Set(Object.keys(TYPE_NAMES).map(Number))

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function finite(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** True if the value has the minimal shape of a GSS graph (an object with a `nodes` array). */
export function looksLikeGraph(raw: unknown): raw is { nodes: unknown[] } {
  return isRecord(raw) && Array.isArray(raw.nodes)
}

/**
 * Returns a structurally complete copy of `raw`. Throws GraphFormatError if
 * `raw` is not an object with a `nodes` array.
 */
export function normalizeGraph(raw: unknown, fallbackName = 'Untitled Economy'): GSSGraph {
  if (!looksLikeGraph(raw)) {
    throw new GraphFormatError('The data does not match the GSS graph structure (missing "nodes").')
  }
  const r = raw as Record<string, unknown>
  const now = new Date().toISOString()

  const nodes: GSSNode[] = []
  const usedIds = new Set<string>()
  ;(r.nodes as unknown[]).forEach((rawNode, index) => {
    if (!isRecord(rawNode)) return
    nodes.push(normalizeNode(rawNode, index, usedIds))
  })

  const connections: GSSConnection[] = Array.isArray(r.connections)
    ? (r.connections as unknown[]).filter(isRecord).map(normalizeConnection)
    : []

  const graph: GSSGraph = {
    version: str(r.version) || GSS_FORMAT_VERSION,
    tick_spec_version: finite(r.tick_spec_version) ?? TICK_SPEC_VERSION,
    name: str(r.name).trim() || fallbackName,
    description: str(r.description),
    created_at: str(r.created_at) || now,
    modified_at: str(r.modified_at) || now,
    simulation_seed: finite(r.simulation_seed) ?? 42,
    nodes,
    connections,
  }
  if (Array.isArray(r.personas)) graph.personas = r.personas as GSSGraph['personas']
  if (Array.isArray(r.scenarios)) graph.scenarios = r.scenarios as GSSGraph['scenarios']
  if (isRecord(r.meta)) graph.meta = r.meta
  return graph
}

function normalizeNode(n: Record<string, unknown>, index: number, usedIds: Set<string>): GSSNode {
  const hasId = n.id !== undefined && n.id !== null && String(n.id) !== ''
  // Duplicitní ID se ZÁMĚRNĚ nepřejmenovávají (spojení na ně odkazují) —
  // GraphValidator je hlásí jako ERROR. Doplňuje se jen chybějící ID.
  let id = hasId ? String(n.id) : `node_${index + 1}`
  if (!hasId) {
    let k = index + 1
    while (usedIds.has(id)) id = `node_${++k}`
  }
  usedIds.add(id)

  const type = (finite(n.type) ?? -1) as NodeTypeValue
  const pos = isRecord(n.position) ? n.position : {}
  return {
    id,
    type,
    label: str(n.label).trim() || `${TYPE_NAMES[type] ?? 'Node'} ${id}`,
    position: {
      x: finite(pos.x) ?? 120 + (index % 5) * 180,
      y: finite(pos.y) ?? 100 + Math.floor(index / 5) * 140,
    },
    data: (isRecord(n.data) ? { ...n.data } : {}) as unknown as GSSNode['data'],
  }
}

function normalizeConnection(c: Record<string, unknown>): GSSConnection {
  return {
    from_node: c.from_node === undefined || c.from_node === null ? '' : String(c.from_node),
    to_node: c.to_node === undefined || c.to_node === null ? '' : String(c.to_node),
    from_port: finite(c.from_port) ?? 0,
    to_port: finite(c.to_port) ?? 0,
  }
}
