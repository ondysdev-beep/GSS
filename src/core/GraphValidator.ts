// GraphValidator.ts — Pre-run validation for node graphs
// Pure function: validate(graph) → ValidationIssue[]
// Ported from GraphValidator.gd (all original checks preserved) and extended
// with checks for the newer node types and for untrusted input.

import { NodeType } from '../types/graph'
import type { GSSGraph } from '../types/graph'
import type { ValidationIssue } from '../types/simulation'
import { validateFormulaSyntax } from './FormulaEvaluator'
import { KNOWN_NODE_TYPES } from './GraphNormalizer'

type NodeLike = GSSGraph['nodes'][number]
type ConnLike = GSSGraph['connections'][number]
type Data = Record<string, unknown>

// ==================== Defensive helpers ====================
// validate() zpracovává i nedůvěryhodná externí data (AI Generator,
// Community Library, Diff Viewer upload, ručně upravené soubory). Hodnota
// může mít libovolný typ — `toFixed`/`trim`/`split` na ní nesmí spadnout.

function dataOf(node: NodeLike): Data {
  const d = node.data as unknown
  return d && typeof d === 'object' ? (d as Data) : {}
}

/** Number or `fallback` when the field is missing; NaN for present-but-invalid values. */
function num(v: unknown, fallback: number): number {
  if (v === undefined || v === null) return fallback
  return typeof v === 'number' ? v : NaN
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function fmt(v: number, digits: number): string {
  return Number.isFinite(v) ? v.toFixed(digits) : String(v)
}

export function validate(graph: GSSGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const raw = (graph ?? {}) as unknown as Record<string, unknown>

  // Normalizace vstupu (oprava B1): cizí JSON může mít uzel bez `data`,
  // bez `nodes`/`connections` nebo s nesmyslnými typy hodnot.
  const nodes: NodeLike[] = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .filter((n): n is NodeLike => !!n && typeof n === 'object')
    .map((n) => ({ ...n, data: dataOf(n) as unknown as NodeLike['data'] }))
  const connections: ConnLike[] = (Array.isArray(raw.connections) ? raw.connections : [])
    .filter((c): c is ConnLike => !!c && typeof c === 'object')

  _checkEmptyGraph(nodes, issues)
  _checkNodeIdsAndTypes(nodes, issues)
  _checkDuplicateIds(nodes, issues)
  _checkOrphanNodes(nodes, connections, issues)
  _checkFanOutCopies(nodes, connections, issues)
  _checkUnreachablePools(nodes, connections, issues)
  _checkMissingConnectionTargets(nodes, connections, issues)
  _checkNegativeValues(nodes, issues)
  _checkPoolAmounts(nodes, issues)
  _checkEmptyResources(nodes, issues)
  _checkChanceRange(nodes, issues)
  _checkSplitterWeights(nodes, issues)
  _checkConverterCompleteness(nodes, issues)
  _checkGateNodes(nodes, issues)
  _checkCycles(nodes, connections, issues)
  _checkRoutingLoops(nodes, connections, issues)
  _checkTimerNodes(nodes, issues)
  _checkFormulaNodes(nodes, issues)
  _checkPlayerActionNodes(nodes, issues)

  return issues
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'ERROR')
}

export function hasWarnings(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'WARNING')
}

export function formatIssue(issue: ValidationIssue): string {
  const nodeRef = issue.nodeId ? ` [${issue.nodeId}]` : ''
  return `[${issue.severity}]${nodeRef} ${issue.message}`
}

// ==================== Individual checks ====================

function _checkEmptyGraph(nodes: NodeLike[], issues: ValidationIssue[]): void {
  if (nodes.length === 0) {
    issues.push({
      code: 'EMPTY_GRAPH',
      severity: 'ERROR',
      message: 'Graph is empty — add nodes before simulating.',
      nodeId: '',
    })
  }
}

function _checkNodeIdsAndTypes(nodes: NodeLike[], issues: ValidationIssue[]): void {
  nodes.forEach((node, index) => {
    const hasId = node.id !== undefined && node.id !== null && String(node.id) !== ''
    if (!hasId) {
      issues.push({ code: 'MISSING_ID', severity: 'ERROR', message: `Node #${index + 1} has no ID.`, nodeId: '' })
    }
    if (!KNOWN_NODE_TYPES.has(node.type as number)) {
      issues.push({
        code: 'UNKNOWN_NODE_TYPE',
        severity: 'ERROR',
        message: `Node '${hasId ? String(node.id) : `#${index + 1}`}' has an unknown type (${String(node.type)}).`,
        nodeId: hasId ? String(node.id) : '',
      })
    }
  })
}

function _checkDuplicateIds(nodes: NodeLike[], issues: ValidationIssue[]): void {
  const seen = new Set<string>()
  for (const node of nodes) {
    const nid = String(node.id)
    if (seen.has(nid)) {
      issues.push({ code: 'DUPLICATE_ID', severity: 'ERROR', message: `Duplicate node ID: '${nid}'`, nodeId: nid })
    }
    seen.add(nid)
  }
}

function _checkOrphanNodes(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const connectedIds = new Set<string>()
  for (const conn of connections) {
    connectedIds.add(String(conn.from_node))
    connectedIds.add(String(conn.to_node))
  }
  for (const node of nodes) {
    const nid = String(node.id)
    if (!connectedIds.has(nid)) {
      // Název místo interního ID ("node_1791840049492_1") — hláška se ukazuje
      // živě pod editorem hned po vložení uzlu.
      const name = typeof node.label === 'string' && node.label.trim() ? node.label.trim() : nid
      issues.push({
        code: 'ORPHAN_NODE',
        severity: 'WARNING',
        message: `'${name}' is not connected to anything yet — drag from its output handle to another node, or delete it.`,
        nodeId: nid,
      })
    }
  }
}

// Uzly, které tok aktivně posílají dál. Pool, Drain a Splitter sem nepatří:
// z poolu se jen bere (Drain/Converter si tahají), Splitter tok dělí.
const PUSH_NODE_TYPES = new Set<number>([
  NodeType.SOURCE, NodeType.CONVERTER, NodeType.GATE, NodeType.CHANCE,
  NodeType.TIMER, NodeType.FORMULA, NodeType.PLAYER_ACTION,
])

/**
 * Fan-out = kopie (viz TickEngine getSemanticsNotes): uzel se dvěma a více
 * spojeními z jednoho výstupu pošle CELÉ množství do každého z nich. Je to
 * záměrné pravidlo enginu, ale snadno se splete s dělením — proto INFO.
 */
function _checkFanOutCopies(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const byId = new Map(nodes.map((n) => [String(n.id), n]))
  const outCount = new Map<string, number>()
  const fedByPush = new Set<string>()
  for (const conn of connections) {
    const from = byId.get(String(conn.from_node))
    if (!from) continue
    if (from.type !== NodeType.POOL) fedByPush.add(String(conn.to_node))
    // Chance má dva výstupy (úspěch/neúspěch) — kopie se počítá po portech.
    const port = from.type === NodeType.CHANCE ? Number(conn.from_port) || 0 : 0
    const key = `${String(from.id)}#${port}`
    outCount.set(key, (outCount.get(key) ?? 0) + 1)
  }
  const reported = new Set<string>()
  for (const [key, count] of outCount) {
    if (count < 2) continue
    const nid = key.slice(0, key.lastIndexOf('#'))
    const node = byId.get(nid)
    if (!node || !PUSH_NODE_TYPES.has(node.type) || reported.has(nid)) continue
    // Gate, přes který se jen bere z poolu (Pool → Gate → Drain), nic nekopíruje.
    if (node.type === NodeType.GATE && !fedByPush.has(nid)) continue
    reported.add(nid)
    const name = typeof node.label === 'string' && node.label.trim() ? node.label.trim() : nid
    issues.push({
      code: 'FAN_OUT_COPIES',
      severity: 'INFO',
      message: `'${name}' sends the full amount to each of its ${count} connections (flow is copied, not divided). Put a Splitter after it if you want to divide the flow.`,
      nodeId: nid,
    })
  }
}

function _checkUnreachablePools(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const hasIncoming = new Set<string>()
  const hasAny = new Set<string>()
  for (const conn of connections) {
    hasIncoming.add(String(conn.to_node))
    hasAny.add(String(conn.to_node))
    hasAny.add(String(conn.from_node))
  }
  for (const node of nodes) {
    if (node.type !== NodeType.POOL) continue
    const nid = String(node.id)
    // Úplně nezapojený pool už hlásí ORPHAN_NODE — dvojí hlášení by jen šumělo.
    if (!hasIncoming.has(nid) && hasAny.has(nid)) {
      issues.push({
        code: 'UNREACHABLE_POOL',
        severity: 'INFO',
        message: `Pool '${nid}' has no incoming connections — it will never fill.`,
        nodeId: nid,
      })
    }
  }
}

function _checkMissingConnectionTargets(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const nodeIds = new Set(nodes.map((n) => String(n.id)))
  for (const conn of connections) {
    const fromId = String(conn.from_node)
    const toId = String(conn.to_node)
    if (!nodeIds.has(fromId)) {
      issues.push({
        code: 'MISSING_SOURCE',
        severity: 'ERROR',
        message: `Connection references missing source node '${fromId}'.`,
        nodeId: fromId,
      })
    }
    if (!nodeIds.has(toId)) {
      issues.push({
        code: 'MISSING_TARGET',
        severity: 'ERROR',
        message: `Connection references missing target node '${toId}'.`,
        nodeId: toId,
      })
    }
  }
}

function _checkNegativeValues(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    const nid = String(node.id)
    const data = dataOf(node)
    if (node.type === NodeType.POOL) {
      const cap = num(data.capacity, 100)
      if (!(cap > 0)) {
        issues.push({
          code: 'NEGATIVE_VALUE',
          severity: 'ERROR',
          message: `Pool '${nid}' has non-positive or invalid capacity (${fmt(cap, 1)}).`,
          nodeId: nid,
        })
      }
    } else if (node.type === NodeType.SOURCE || node.type === NodeType.DRAIN) {
      const rate = num(data.rate, 1.0)
      if (!Number.isFinite(rate)) {
        issues.push({ code: 'INVALID_VALUE', severity: 'ERROR', message: `Node '${nid}' has an invalid rate (${String(data.rate)}).`, nodeId: nid })
      } else if (rate < 0) {
        issues.push({
          code: 'NEGATIVE_VALUE',
          severity: 'WARNING',
          message: `Node '${nid}' has negative rate (${fmt(rate, 2)}) — it will be treated as 0.`,
          nodeId: nid,
        })
      }
    }
  }
}

function _checkPoolAmounts(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.POOL) continue
    const nid = String(node.id)
    const data = dataOf(node)
    const initial = num(data.initial_amount, 0)
    const cap = num(data.capacity, 100)
    if (!Number.isFinite(initial)) {
      issues.push({ code: 'INVALID_VALUE', severity: 'ERROR', message: `Pool '${nid}' has an invalid initial amount (${String(data.initial_amount)}).`, nodeId: nid })
    } else if (initial < 0) {
      issues.push({ code: 'NEGATIVE_VALUE', severity: 'WARNING', message: `Pool '${nid}' has a negative initial amount (${fmt(initial, 2)}) — it starts at 0.`, nodeId: nid })
    } else if (cap > 0 && initial > cap) {
      issues.push({
        code: 'INITIAL_EXCEEDS_CAPACITY',
        severity: 'WARNING',
        message: `Pool '${nid}' starts with ${fmt(initial, 2)} but its capacity is ${fmt(cap, 2)} — it is clamped to the capacity.`,
        nodeId: nid,
      })
    }
  }
}

function _checkEmptyResources(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    const nid = String(node.id)
    const data = dataOf(node)
    if (
      node.type === NodeType.POOL ||
      node.type === NodeType.SOURCE ||
      node.type === NodeType.DRAIN
    ) {
      if (str(data.resource).trim() === '') {
        issues.push({
          code: 'EMPTY_RESOURCE',
          severity: 'WARNING',
          message: `Node '${nid}' has no resource name set.`,
          nodeId: nid,
        })
      }
    }
  }
}

function _checkChanceRange(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.CHANCE) continue
    const nid = String(node.id)
    const chance = num(dataOf(node).success_chance, 50)
    if (!Number.isFinite(chance) || chance < 0 || chance > 100) {
      issues.push({
        code: 'CHANCE_RANGE',
        severity: 'ERROR',
        message: `Chance node '${nid}' has out-of-range probability (${fmt(chance, 1)}%). Must be 0-100.`,
        nodeId: nid,
      })
    }
  }
}

function _checkSplitterWeights(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.SPLITTER) continue
    const nid = String(node.id)
    const data = dataOf(node)
    const weightsStr = typeof data.weights === 'string' ? data.weights : '1,1'
    const outputCount = num(data.output_count, 2)
    const parts = weightsStr.split(',')
    if (Number.isFinite(outputCount) && parts.length < outputCount) {
      issues.push({
        code: 'SPLITTER_WEIGHTS',
        severity: 'WARNING',
        message: `Splitter '${nid}' has ${outputCount} outputs but only ${parts.length} weights. Missing weights default to 1.`,
        nodeId: nid,
      })
    }
    parts.forEach((p, i) => {
      const w = parseFloat(p.trim())
      if (!Number.isFinite(w) || w <= 0) {
        issues.push({
          code: 'SPLITTER_WEIGHTS',
          severity: 'WARNING',
          message: `Splitter '${nid}' weight #${i + 1} ("${p.trim()}") is not a positive number — it is treated as 1.`,
          nodeId: nid,
        })
      }
    })
  }
}

function _checkConverterCompleteness(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.CONVERTER) continue
    const nid = String(node.id)
    const data = dataOf(node)
    if (str(data.input_resource).trim() === '') {
      issues.push({
        code: 'CONVERTER_INCOMPLETE',
        severity: 'WARNING',
        message: `Converter '${nid}' has no input resource set.`,
        nodeId: nid,
      })
    }
    if (str(data.output_resource).trim() === '') {
      issues.push({
        code: 'CONVERTER_INCOMPLETE',
        severity: 'WARNING',
        message: `Converter '${nid}' has no output resource set.`,
        nodeId: nid,
      })
    }
    const cycleTime = num(data.cycle_time, 1.0)
    if (!(cycleTime > 0)) {
      issues.push({
        code: 'CONVERTER_INCOMPLETE',
        severity: 'ERROR',
        message: `Converter '${nid}' has non-positive or invalid cycle time (${fmt(cycleTime, 2)}).`,
        nodeId: nid,
      })
    }
    for (const field of ['input_amount', 'output_amount'] as const) {
      const v = num(data[field], 1.0)
      if (!(v > 0)) {
        issues.push({
          code: 'CONVERTER_INCOMPLETE',
          severity: 'WARNING',
          message: `Converter '${nid}' has non-positive ${field.replace('_', ' ')} (${fmt(v, 2)}) — it will never produce anything.`,
          nodeId: nid,
        })
      }
    }
  }
}

function _checkGateNodes(nodes: NodeLike[], issues: ValidationIssue[]): void {
  const resourceNames = new Set<string>()
  for (const node of nodes) {
    const r = str(dataOf(node).resource)
    if (r) resourceNames.add(r)
  }
  for (const node of nodes) {
    if (node.type !== NodeType.GATE) continue
    const nid = String(node.id)
    const data = dataOf(node)
    const variable = str(data.variable).trim()
    const operator = num(data.operator, 0)
    if (![0, 1, 2, 3, 4, 5].includes(operator)) {
      issues.push({ code: 'GATE_OPERATOR', severity: 'ERROR', message: `Gate '${nid}' has an invalid operator (${String(data.operator)}).`, nodeId: nid })
    }
    if (!Number.isFinite(num(data.value, 0))) {
      issues.push({ code: 'INVALID_VALUE', severity: 'ERROR', message: `Gate '${nid}' has an invalid threshold (${String(data.value)}).`, nodeId: nid })
    }
    if (variable === '') {
      issues.push({ code: 'GATE_VARIABLE', severity: 'WARNING', message: `Gate '${nid}' has no variable (resource name) set.`, nodeId: nid })
    } else if (!resourceNames.has(variable)) {
      issues.push({
        code: 'GATE_VARIABLE',
        severity: 'WARNING',
        message: `Gate '${nid}' checks '${variable}', but no node uses a resource with that name. The Gate compares a resource total by NAME (e.g. "Gold"), not a pool ID.`,
        nodeId: nid,
      })
    }
  }
}

function _checkCycles(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const cycleNodes = _findCycleNodes(nodes.map((n) => String(n.id)), connections)
  if (cycleNodes.length > 0) {
    issues.push({
      code: 'CYCLE_DETECTED',
      severity: 'INFO',
      message: `Graph contains cycle(s) involving node(s): ${cycleNodes.join(', ')}. This may cause feedback loops.`,
      nodeId: cycleNodes[0],
    })
  }
}

/** Loops made only of routing nodes (Gate/Splitter/Chance) bounce flow until the engine's hop limit cuts it. */
function _checkRoutingLoops(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const routing = new Set(
    nodes
      .filter((n) => n.type === NodeType.GATE || n.type === NodeType.SPLITTER || n.type === NodeType.CHANCE)
      .map((n) => String(n.id)),
  )
  if (routing.size === 0) return
  const routingConns = connections.filter((c) => routing.has(String(c.from_node)) && routing.has(String(c.to_node)))
  const loopNodes = _findCycleNodes([...routing], routingConns)
  if (loopNodes.length > 0) {
    issues.push({
      code: 'ROUTING_LOOP',
      severity: 'WARNING',
      message: `Routing loop between Gate/Splitter/Chance node(s): ${loopNodes.join(', ')}. Flow circling in it is dropped after 64 hops.`,
      nodeId: loopNodes[0],
    })
  }
}

/** Iterative DFS (no recursion limit on long chains). Returns nodes that close a cycle. */
function _findCycleNodes(ids: string[], connections: ConnLike[]): string[] {
  const adj: Record<string, string[]> = {}
  for (const id of ids) adj[id] = []
  for (const conn of connections) {
    const fromId = String(conn.from_node)
    if (adj[fromId]) adj[fromId].push(String(conn.to_node))
  }

  const state: Record<string, 0 | 1 | 2> = {} // 0 = new, 1 = on stack, 2 = done
  const cycleNodes: string[] = []
  for (const start of ids) {
    if (state[start]) continue
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }]
    state[start] = 1
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const neighbors = adj[top.id] ?? []
      if (top.next < neighbors.length) {
        const nb = neighbors[top.next++]
        if (!state[nb]) {
          if (adj[nb] === undefined) continue
          state[nb] = 1
          stack.push({ id: nb, next: 0 })
        } else if (state[nb] === 1 && !cycleNodes.includes(nb)) {
          cycleNodes.push(nb)
        }
      } else {
        state[top.id] = 2
        stack.pop()
      }
    }
  }
  return cycleNodes
}

function _checkTimerNodes(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.TIMER) continue
    const nid = String(node.id)
    const data = dataOf(node)
    const interval = num(data.interval, 60)
    const amount = num(data.amount, 1)
    if (!(interval > 0)) {
      issues.push({
        code: 'NEGATIVE_VALUE',
        severity: 'ERROR',
        message: `Timer '${nid}' has non-positive or invalid interval (${String(data.interval)}). Must be > 0.`,
        nodeId: nid,
      })
    }
    if (!(amount >= 0)) {
      issues.push({ code: 'NEGATIVE_VALUE', severity: 'WARNING', message: `Timer '${nid}' has a negative or invalid amount (${String(data.amount)}).`, nodeId: nid })
    }
    if (str(data.resource).trim() === '') {
      issues.push({
        code: 'EMPTY_RESOURCE',
        severity: 'WARNING',
        message: `Timer '${nid}' has no resource name set.`,
        nodeId: nid,
      })
    }
  }
}

function _checkFormulaNodes(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.FORMULA) continue
    const nid = String(node.id)
    const data = dataOf(node)
    const expression = str(data.expression).trim()

    if (expression === '') {
      issues.push({
        code: 'FORMULA_EMPTY',
        severity: 'ERROR',
        message: `Formula node '${nid}' has no expression.`,
        nodeId: nid,
      })
    } else {
      const err = validateFormulaSyntax(expression)
      if (err) {
        issues.push({
          code: 'FORMULA_SYNTAX',
          severity: 'ERROR',
          message: `Formula node '${nid}' has an invalid expression: ${err.message}.`,
          nodeId: nid,
        })
      }
    }
    if (str(data.output_resource).trim() === '') {
      issues.push({
        code: 'EMPTY_RESOURCE',
        severity: 'WARNING',
        message: `Formula node '${nid}' has no output resource set.`,
        nodeId: nid,
      })
    }
  }
}

function _checkPlayerActionNodes(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.PLAYER_ACTION) continue
    const nid = String(node.id)
    const data = dataOf(node)
    const cadence = num(data.cadence, 5)
    const amount = num(data.amount, 1)
    if (!(cadence > 0)) {
      issues.push({
        code: 'NEGATIVE_VALUE',
        severity: 'ERROR',
        message: `Player Action '${nid}' has non-positive or invalid cadence (${String(data.cadence)}). Must be > 0.`,
        nodeId: nid,
      })
    }
    if (!(amount >= 0)) {
      issues.push({ code: 'NEGATIVE_VALUE', severity: 'WARNING', message: `Player Action '${nid}' has a negative or invalid amount (${String(data.amount)}).`, nodeId: nid })
    }
    if (str(data.resource).trim() === '') {
      issues.push({
        code: 'EMPTY_RESOURCE',
        severity: 'WARNING',
        message: `Player Action '${nid}' has no resource name set.`,
        nodeId: nid,
      })
    }
  }
}
