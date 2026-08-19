// CompiledGraph.ts — port GDScript CompiledGraph.gd
// Pre-indexovaná grafová struktura pro rychlé opakované simulace.
// Vyhýbá se lineárním průchodům nodes/connections při každém ticku.

import type { GSSGraph, GSSNode, GSSConnection } from '../types/graph'
import { NodeType } from '../types/graph'

export interface CompiledGraph {
  // Per-typ pole uzlů
  sources:     GSSNode[]
  converters:  GSSNode[]
  drains:      GSSNode[]
  gates:       GSSNode[]
  chanceNodes: GSSNode[]
  splitters:   GSSNode[]
  poolsList:   GSSNode[]
  modifiers:   GSSNode[]

  // Adjacenční mapy (out/in)
  adjacencyOut: Record<string, GSSConnection[]>  // from_id → connections
  adjacencyIn:  Record<string, GSSConnection[]>  // to_id   → connections

  // Index zdrojů → seznam ID poolů
  resourcePools: Record<string, string[]>

  // Uzly dle ID
  nodeById: Record<string, GSSNode>

  // ID uzlů dle typu
  nodeIdsByType: Record<number, string[]>

  // Originální graf
  graph: GSSGraph
}

// ==================== COMPILE ====================

export function compileGraph(graph: GSSGraph): CompiledGraph {
  const cg: CompiledGraph = {
    sources:      [],
    converters:   [],
    drains:       [],
    gates:        [],
    chanceNodes:  [],
    splitters:    [],
    poolsList:    [],
    modifiers:    [],
    adjacencyOut: {},
    adjacencyIn:  {},
    resourcePools: {},
    nodeById:     {},
    nodeIdsByType: {},
    graph,
  }

  // Index uzlů dle typu a ID
  for (const node of graph.nodes) {
    const nid   = String(node.id)
    const ntype = Number(node.type)
    cg.nodeById[nid] = node

    cg.nodeIdsByType[ntype] ??= []
    cg.nodeIdsByType[ntype].push(nid)

    const data = node.data as unknown as Record<string, unknown>

    switch (ntype) {
      case NodeType.POOL: {
        cg.poolsList.push(node)
        const resource = String(data['resource'] ?? '')
        if (resource) {
          cg.resourcePools[resource] ??= []
          cg.resourcePools[resource].push(nid)
        }
        break
      }
      case NodeType.SOURCE:    cg.sources.push(node);     break
      case NodeType.CONVERTER: cg.converters.push(node);  break
      case NodeType.DRAIN:     cg.drains.push(node);      break
      case NodeType.GATE:      cg.gates.push(node);       break
      case NodeType.CHANCE:    cg.chanceNodes.push(node); break
      case NodeType.SPLITTER:  cg.splitters.push(node);   break
      default:                 cg.modifiers.push(node);   break
    }
  }

  // Adjacenční listy
  for (const conn of graph.connections) {
    const fromId = String(conn.from_node)
    const toId   = String(conn.to_node)
    cg.adjacencyOut[fromId] ??= []
    cg.adjacencyOut[fromId].push(conn)
    cg.adjacencyIn[toId] ??= []
    cg.adjacencyIn[toId].push(conn)
  }

  return cg
}

// ==================== QUERY HELPERS ====================

export function getOutConnections(cg: CompiledGraph, nodeId: string): GSSConnection[] {
  return cg.adjacencyOut[nodeId] ?? []
}

export function getInConnections(cg: CompiledGraph, nodeId: string): GSSConnection[] {
  return cg.adjacencyIn[nodeId] ?? []
}

export function getNodeById(cg: CompiledGraph, nodeId: string): GSSNode | null {
  return cg.nodeById[nodeId] ?? null
}

export function getTotalResource(
  cg: CompiledGraph,
  resource: string,
  pools: Record<string, { amount: number }>,
): number {
  let total = 0
  for (const pid of cg.resourcePools[resource] ?? []) {
    if (pools[pid]) total += pools[pid].amount
  }
  return total
}

export function nodeCount(cg: CompiledGraph): number {
  return Object.keys(cg.nodeById).length
}

export function connectionCount(cg: CompiledGraph): number {
  return Object.values(cg.adjacencyOut).reduce((s, arr) => s + arr.length, 0)
}
