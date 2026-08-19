// GraphValidator.ts — Pre-run validation for node graphs
// Pure function: validate(graph) → ValidationIssue[]
// Ported from GraphValidator.gd — all checks preserved exactly.

import { NodeType } from '../types/graph'
import type { GSSGraph } from '../types/graph'
import type { ValidationIssue } from '../types/simulation'
import { validateFormulaSyntax } from './FormulaEvaluator'

export function validate(graph: GSSGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { connections } = graph

  // Normalizace vstupu (oprava B1): grafy z GSS editoru mají `data` vždy
  // vyplněné, ale `validate()` teď zpracovává i nedůvěryhodná externí data
  // (AI Generator, Community Library import, Diff Viewer upload) — cizí
  // JSON může mít uzel bez pole `data` úplně. Bez tohoto řádku by na to
  // spadl první check, který na `data.<cokoliv>` sáhne (viz nález B1).
  const nodes: NodeLike[] = graph.nodes.map((n) => ({ ...n, data: n.data ?? ({} as NodeLike['data']) }))

  _checkEmptyGraph(nodes, issues)
  _checkDuplicateIds(nodes, issues)
  _checkOrphanNodes(nodes, connections, issues)
  _checkUnreachablePools(nodes, connections, issues)
  _checkMissingConnectionTargets(nodes, connections, issues)
  _checkNegativeValues(nodes, issues)
  _checkEmptyResources(nodes, issues)
  _checkChanceRange(nodes, issues)
  _checkSplitterWeights(nodes, issues)
  _checkConverterCompleteness(nodes, issues)
  _checkCycles(nodes, connections, issues)
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

type NodeLike = GSSGraph['nodes'][number]
type ConnLike = GSSGraph['connections'][number]

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
      issues.push({
        code: 'ORPHAN_NODE',
        severity: 'WARNING',
        message: `Node '${nid}' has no connections (orphan).`,
        nodeId: nid,
      })
    }
  }
}

function _checkUnreachablePools(
  nodes: NodeLike[],
  connections: ConnLike[],
  issues: ValidationIssue[],
): void {
  const hasIncoming = new Set<string>()
  for (const conn of connections) hasIncoming.add(String(conn.to_node))
  for (const node of nodes) {
    if (node.type !== NodeType.POOL) continue
    const nid = String(node.id)
    if (!hasIncoming.has(nid)) {
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
    const data = node.data as unknown as Record<string, unknown>
    if (node.type === NodeType.POOL) {
      const cap = (data.capacity as number) ?? 100
      if (cap <= 0) {
        issues.push({
          code: 'NEGATIVE_VALUE',
          severity: 'ERROR',
          message: `Pool '${nid}' has non-positive capacity (${cap.toFixed(1)}).`,
          nodeId: nid,
        })
      }
    } else if (node.type === NodeType.SOURCE || node.type === NodeType.DRAIN) {
      const rate = (data.rate as number) ?? 1.0
      if (rate < 0) {
        issues.push({
          code: 'NEGATIVE_VALUE',
          severity: 'WARNING',
          message: `Node '${nid}' has negative rate (${rate.toFixed(2)}).`,
          nodeId: nid,
        })
      }
    }
  }
}

function _checkEmptyResources(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    if (
      node.type === NodeType.POOL ||
      node.type === NodeType.SOURCE ||
      node.type === NodeType.DRAIN
    ) {
      const res = ((data.resource as string) ?? '').trim()
      if (res === '') {
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
    const data = node.data as unknown as Record<string, unknown>
    const chance = (data.success_chance as number) ?? 50
    if (chance < 0 || chance > 100) {
      issues.push({
        code: 'CHANCE_RANGE',
        severity: 'ERROR',
        message: `Chance node '${nid}' has out-of-range probability (${chance.toFixed(1)}%). Must be 0-100.`,
        nodeId: nid,
      })
    }
  }
}

function _checkSplitterWeights(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.SPLITTER) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const weightsStr = (data.weights as string) ?? '1,1'
    const outputCount = (data.output_count as number) ?? 2
    const parts = weightsStr.split(',')
    if (parts.length < outputCount) {
      issues.push({
        code: 'SPLITTER_WEIGHTS',
        severity: 'WARNING',
        message: `Splitter '${nid}' has ${outputCount} outputs but only ${parts.length} weights. Missing weights default to 1.`,
        nodeId: nid,
      })
    }
    parts.forEach((p, i) => {
      const w = parseFloat(p.trim())
      if (isFinite(w) && w <= 0) {
        issues.push({
          code: 'SPLITTER_WEIGHTS',
          severity: 'WARNING',
          message: `Splitter '${nid}' weight #${i + 1} is non-positive (${w.toFixed(2)}).`,
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
    const data = node.data as unknown as Record<string, unknown>
    if (((data.input_resource as string) ?? '').trim() === '') {
      issues.push({
        code: 'CONVERTER_INCOMPLETE',
        severity: 'WARNING',
        message: `Converter '${nid}' has no input resource set.`,
        nodeId: nid,
      })
    }
    if (((data.output_resource as string) ?? '').trim() === '') {
      issues.push({
        code: 'CONVERTER_INCOMPLETE',
        severity: 'WARNING',
        message: `Converter '${nid}' has no output resource set.`,
        nodeId: nid,
      })
    }
    const cycleTime = (data.cycle_time as number) ?? 1.0
    if (cycleTime <= 0) {
      issues.push({
        code: 'CONVERTER_INCOMPLETE',
        severity: 'ERROR',
        message: `Converter '${nid}' has non-positive cycle time (${cycleTime.toFixed(2)}).`,
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
  const adj: Record<string, string[]> = {}
  for (const node of nodes) adj[String(node.id)] = []
  for (const conn of connections) {
    const fromId = String(conn.from_node)
    if (adj[fromId]) adj[fromId].push(String(conn.to_node))
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cycleNodes: string[] = []

  function dfs(nid: string): void {
    visited.add(nid)
    inStack.add(nid)
    for (const neighbor of adj[nid] ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
      } else if (inStack.has(neighbor) && !cycleNodes.includes(neighbor)) {
        cycleNodes.push(neighbor)
      }
    }
    inStack.delete(nid)
  }

  for (const nid in adj) {
    if (!visited.has(nid)) dfs(nid)
  }

  if (cycleNodes.length > 0) {
    issues.push({
      code: 'CYCLE_DETECTED',
      severity: 'INFO',
      message: `Graph contains cycle(s) involving node(s): ${cycleNodes.join(', ')}. This may cause feedback loops.`,
      nodeId: cycleNodes[0],
    })
  }
}

function _checkTimerNodes(nodes: NodeLike[], issues: ValidationIssue[]): void {
  for (const node of nodes) {
    if (node.type !== NodeType.TIMER) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const interval = (data.interval as number) ?? 60
    const resource = ((data.resource as string) ?? '').trim()
    if (interval <= 0) {
      issues.push({
        code: 'NEGATIVE_VALUE',
        severity: 'ERROR',
        message: `Timer '${nid}' has non-positive interval (${interval}). Must be > 0.`,
        nodeId: nid,
      })
    }
    if (resource === '') {
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
    const data = node.data as unknown as Record<string, unknown>
    const expression = ((data.expression as string) ?? '').trim()
    const outputResource = ((data.output_resource as string) ?? '').trim()

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
    if (outputResource === '') {
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
    const data = node.data as unknown as Record<string, unknown>
    const cadence = (data.cadence as number) ?? 5
    const resource = ((data.resource as string) ?? '').trim()
    if (cadence <= 0) {
      issues.push({
        code: 'NEGATIVE_VALUE',
        severity: 'ERROR',
        message: `Player Action '${nid}' has non-positive cadence (${cadence}). Must be > 0.`,
        nodeId: nid,
      })
    }
    if (resource === '') {
      issues.push({
        code: 'EMPTY_RESOURCE',
        severity: 'WARNING',
        message: `Player Action '${nid}' has no resource name set.`,
        nodeId: nid,
      })
    }
  }
}
