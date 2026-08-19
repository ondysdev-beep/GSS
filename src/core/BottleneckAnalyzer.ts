// BottleneckAnalyzer.ts — port GDScript BottleneckAnalyzer.gd
// Deterministická detekce bottlenecků a "proč je pool prázdný?" trace-back.

import type { GSSGraph } from '../types/graph'
import { NodeType } from '../types/graph'

export type BottleneckSeverity = 'high' | 'medium' | 'low'
export type BottleneckType =
  | 'closed_gate'
  | 'saturated_pool'
  | 'starved_converter'
  | 'overdrain'

export interface BottleneckEntry {
  node_id: string
  type: BottleneckType
  severity: BottleneckSeverity
  reason: string
}

export interface BottleneckReport {
  bottlenecks: BottleneckEntry[]
  empty_pools: string[]
  saturated_pools: string[]
}

export type WhyCauseType =
  | 'no_input'
  | 'closed_gate'
  | 'zero_rate_source'
  | 'active_source'
  | 'empty_upstream_pool'
  | 'stalled_upstream'
  | 'converter'
  | 'splitter'

export interface WhyCause {
  node_id: string
  type: WhyCauseType
  reason: string
  depth: number
}

export interface WhyEmptyResult {
  pool_id: string
  causes: WhyCause[]
  chain: string[]
  summary: string
}

// Pomocná: index příchozích a odchozích spojení
function buildConnIndex(graph: GSSGraph) {
  const incoming: Record<string, typeof graph.connections> = {}
  const outgoing: Record<string, typeof graph.connections> = {}
  for (const conn of graph.connections) {
    const t = String(conn.to_node)
    const f = String(conn.from_node)
    incoming[t] ??= []
    outgoing[f] ??= []
    incoming[t].push(conn)
    outgoing[f].push(conn)
  }
  return { incoming, outgoing }
}

type PoolState = { amount: number; capacity: number; resource?: string }

// ==================== FIND BOTTLENECKS ====================

export function findBottlenecks(
  graph: GSSGraph,
  pools: Record<string, PoolState>,
  gateStates: Record<string, boolean>,
): BottleneckReport {
  const { incoming, outgoing } = buildConnIndex(graph)
  const emptyPools: string[] = []
  const saturatedPools: string[] = []
  const bottlenecks: BottleneckEntry[] = []

  // Prázdné a plné pooly
  for (const [pid, pool] of Object.entries(pools)) {
    if (pool.amount <= 0.001) emptyPools.push(pid)
    if (pool.capacity > 0 && pool.amount >= pool.capacity * 0.99) saturatedPools.push(pid)
  }

  // Uzavřené gates blokující tok
  for (const [gateId, isOpen] of Object.entries(gateStates)) {
    if (isOpen) continue
    for (const conn of outgoing[gateId] ?? []) {
      const toId = String(conn.to_node)
      const p = pools[toId]
      if (p && p.amount < p.capacity * 0.5) {
        bottlenecks.push({
          node_id: gateId, type: 'closed_gate', severity: 'high',
          reason: `Gate '${gateId}' is CLOSED, blocking flow to pool '${toId}'`,
        })
        break
      }
    }
  }

  // Saturované pooly blokují upstream produkci
  for (const pid of saturatedPools) {
    if ((incoming[pid] ?? []).length > 0) {
      const p = pools[pid]
      bottlenecks.push({
        node_id: pid, type: 'saturated_pool', severity: 'medium',
        reason: `Pool '${pid}' is FULL (${p.amount.toFixed(0)}/${p.capacity.toFixed(0)}) — upstream production is discarded`,
      })
    }
  }

  // Starved convertery
  const converters = graph.nodes.filter((n) => n.type === NodeType.CONVERTER)
  for (const node of converters) {
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const inputResource = String(data.input_resource ?? '')
    if (!inputResource) continue
    const inConns = incoming[nid] ?? []
    let hasInput = false
    for (const conn of inConns) {
      const fromId = String(conn.from_node)
      const p = pools[fromId]
      if (p && p.resource === inputResource && p.amount > 0.001) { hasInput = true; break }
    }
    if (!hasInput && inConns.length > 0) {
      bottlenecks.push({
        node_id: nid, type: 'starved_converter', severity: 'high',
        reason: `Converter '${nid}' is starved — no '${inputResource}' from upstream pools`,
      })
    }
  }

  // Drains spotřebovávající rychleji než produkce
  const drains = graph.nodes.filter((n) => n.type === NodeType.DRAIN)
  const sources = graph.nodes.filter((n) => n.type === NodeType.SOURCE)
  for (const node of drains) {
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const drainResource = String(data.resource ?? '')
    const drainRate = typeof data.rate === 'number' ? data.rate : 0
    if (!drainResource || drainRate <= 0) continue
    let totalProduction = 0
    for (const src of sources) {
      const sd = src.data as unknown as Record<string, unknown>
      if (sd.resource === drainResource) totalProduction += typeof sd.rate === 'number' ? sd.rate : 0
    }
    if (drainRate > totalProduction * 1.1 && totalProduction > 0) {
      bottlenecks.push({
        node_id: nid, type: 'overdrain', severity: 'medium',
        reason: `Drain '${nid}' consumes ${drainRate.toFixed(1)}/s of '${drainResource}', but sources only produce ${totalProduction.toFixed(1)}/s`,
      })
    }
  }

  // Seřadit dle závažnosti
  const sevOrder: Record<BottleneckSeverity, number> = { high: 0, medium: 1, low: 2 }
  bottlenecks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  return { bottlenecks, empty_pools: emptyPools, saturated_pools: saturatedPools }
}

// ==================== WHY EMPTY? ====================

export function whyEmpty(
  poolId: string,
  graph: GSSGraph,
  pools: Record<string, PoolState>,
  gateStates: Record<string, boolean>,
): WhyEmptyResult {
  const result: WhyEmptyResult = { pool_id: poolId, causes: [], chain: [], summary: '' }
  const { incoming } = buildConnIndex(graph)

  const nodeIndex: Record<string, typeof graph.nodes[0]> = {}
  for (const n of graph.nodes) nodeIndex[String(n.id)] = n

  if (!pools[poolId]) {
    result.summary = `Pool '${poolId}' not found`
    return result
  }
  if (pools[poolId].amount > 0.001) {
    result.summary = `Pool '${poolId}' is not empty (${pools[poolId].amount.toFixed(2)})`
    return result
  }

  // BFS upstream
  const visited: Record<string, boolean> = {}
  const queue: { node_id: string; depth: number }[] = [{ node_id: poolId, depth: 0 }]
  visited[poolId] = true

  while (queue.length > 0) {
    const { node_id: nid, depth } = queue.shift()!
    const inConns = incoming[nid] ?? []

    if (inConns.length === 0) {
      if (nid === poolId) {
        result.causes.push({
          node_id: nid, type: 'no_input', depth,
          reason: `Pool '${nid}' has no upstream connections — nothing fills it`,
        })
      }
      continue
    }

    for (const conn of inConns) {
      const fromId = String(conn.from_node)
      if (visited[fromId]) continue
      visited[fromId] = true
      result.chain.push(fromId)

      const node = nodeIndex[fromId]
      const nodeType: number = node ? Number(node.type) : -1

      switch (nodeType) {
        case NodeType.GATE:
          if (gateStates[fromId] === false) {
            result.causes.push({ node_id: fromId, type: 'closed_gate', depth: depth + 1,
              reason: `Gate '${fromId}' is CLOSED — blocking flow to '${nid}'` })
          } else {
            queue.push({ node_id: fromId, depth: depth + 1 })
          }
          break

        case NodeType.SOURCE: {
          const sd = node.data as unknown as Record<string, unknown>
          const rate = typeof sd.rate === 'number' ? sd.rate : 0
          if (rate <= 0) {
            result.causes.push({ node_id: fromId, type: 'zero_rate_source', depth: depth + 1,
              reason: `Source '${fromId}' has rate=0 — produces nothing` })
          } else {
            result.causes.push({ node_id: fromId, type: 'active_source', depth: depth + 1,
              reason: `Source '${fromId}' produces ${rate.toFixed(1)}/s — but flow may be diverted or consumed` })
          }
          break
        }

        case NodeType.POOL:
          if (pools[fromId] && pools[fromId].amount <= 0.001) {
            result.causes.push({ node_id: fromId, type: 'empty_upstream_pool', depth: depth + 1,
              reason: `Upstream pool '${fromId}' is also empty` })
            queue.push({ node_id: fromId, depth: depth + 1 })
          } else {
            result.causes.push({ node_id: fromId, type: 'stalled_upstream', depth: depth + 1,
              reason: `Pool '${fromId}' has ${(pools[fromId]?.amount ?? 0).toFixed(1)} but flow does not reach '${nid}'` })
          }
          break

        case NodeType.CONVERTER:
          result.causes.push({ node_id: fromId, type: 'converter', depth: depth + 1,
            reason: `Converter '${fromId}' may be starved or producing wrong resource` })
          queue.push({ node_id: fromId, depth: depth + 1 })
          break

        case NodeType.SPLITTER:
          result.causes.push({ node_id: fromId, type: 'splitter', depth: depth + 1,
            reason: `Splitter '${fromId}' splits flow — may reduce throughput` })
          queue.push({ node_id: fromId, depth: depth + 1 })
          break

        default:
          queue.push({ node_id: fromId, depth: depth + 1 })
      }
    }
  }

  if (result.causes.length === 0) {
    result.summary = `Pool '${poolId}' is empty, but no clear cause was found in the graph`
  } else {
    result.summary = `Pool '${poolId}' is empty because: ${result.causes[0].reason}`
    if (result.causes.length > 1) result.summary += ` (+${result.causes.length - 1} more causes)`
  }

  return result
}
