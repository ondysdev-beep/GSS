// FailureDetectors.ts — přímý port GDScript FailureDetectors.gd
// Detekuje: infinite growth, economy collapse, deadlock, hard bottleneck

import type {
  CriticalFailure,
  FailureReport,
  FailureSeverity,
  SimulationContext,
} from '../types/simulation'

// ==================== PRAHY ====================

const GROWTH_THRESHOLD      = 1.5  // 50 % růst za cyklus
const CONSECUTIVE_CYCLES    = 5    // počet cyklů pro potvrzení
const COLLAPSE_THRESHOLD    = 0.1  // 10 % původní hodnoty
const AFFECTED_PLAYER_RATIO = 0.8  // 80 % hráčů v insolvenci
const BOTTLENECK_MULTIPLIER = 3.0  // 3× očekávaný čas

function noFailure(): CriticalFailure {
  return { type: 'NONE', severity: 'NONE', message: '', details: {} }
}

// ==================== INFINITE GROWTH ====================

export function detectInfiniteGrowth(resourceId: string, history: number[]): CriticalFailure {
  if (history.length < CONSECUTIVE_CYCLES + 1) return noFailure()

  const growthRates: number[] = []
  for (let i = 0; i < CONSECUTIVE_CYCLES; i++) {
    const idx  = history.length - CONSECUTIVE_CYCLES + i
    const prev = history[idx - 1]
    const curr = history[idx]
    if (prev <= 0) return noFailure()
    const rate = curr / prev
    if (rate < GROWTH_THRESHOLD) return noFailure()
    growthRates.push(rate)
  }

  const avgGrowth    = arrayMean(growthRates)
  const growthPct    = (avgGrowth - 1) * 100
  const label        = resourceId ? `${resourceId} ` : ''

  return {
    type: 'INFINITE_GROWTH',
    severity: 'CRITICAL',
    message: `CRITICAL: ${label}exhibits unbounded growth (${growthPct.toFixed(0)}% per cycle). System will overflow or trivialize progression.`,
    details: {
      resource_name: resourceId,
      growth_rate_per_cycle: avgGrowth,
      growth_percent: growthPct,
      consecutive_cycles: CONSECUTIVE_CYCLES,
      growth_rates: growthRates,
    },
  }
}

// ==================== ECONOMY COLLAPSE ====================

export function detectEconomyCollapse(
  currencyId: string,
  currentValue: number,
  initialValue: number,
  playersBroke: number,
  playersTotal: number,
): CriticalFailure {
  if (initialValue <= 0 || playersTotal <= 0) return noFailure()

  const valueRatio      = currentValue / initialValue
  const brokeRatio      = playersBroke / playersTotal
  const valueCollapse   = valueRatio < COLLAPSE_THRESHOLD
  const popCollapse     = brokeRatio > AFFECTED_PLAYER_RATIO

  if (!valueCollapse && !popCollapse) return noFailure()

  const lossPct = (1 - valueRatio) * 100
  const label   = currencyId || 'Economy'

  return {
    type: 'ECONOMY_COLLAPSE',
    severity: 'CRITICAL',
    message: valueCollapse
      ? `CRITICAL: Economy collapse detected. ${label} has lost ${lossPct.toFixed(0)}% of value.`
      : `CRITICAL: Economy collapse detected. ${(brokeRatio * 100).toFixed(0)}% of players are broke.`,
    details: {
      currency_name: currencyId,
      currency_current: currentValue,
      currency_initial: initialValue,
      value_ratio: valueRatio,
      loss_percent: lossPct,
      players_broke: playersBroke,
      players_total: playersTotal,
      broke_ratio: brokeRatio,
      collapse_type: valueCollapse ? 'value' : 'population',
    },
  }
}

// ==================== HARD BOTTLENECK ====================

export function detectHardBottleneck(
  gateId: string,
  actualTime: number,
  expectedTime: number,
  alternativePaths: number,
): CriticalFailure {
  if (alternativePaths > 0 || expectedTime <= 0) return noFailure()
  const mult = actualTime / expectedTime
  if (mult <= BOTTLENECK_MULTIPLIER) return noFailure()

  return {
    type: 'HARD_BOTTLENECK',
    severity: 'UNSAFE',
    message: `UNSAFE: Hard bottleneck at '${gateId}'. Expected: ${expectedTime.toFixed(1)}, Actual: ${actualTime.toFixed(1)} (${mult.toFixed(1)}× slower). No alternative path.`,
    details: {
      gate_id: gateId,
      expected_time: expectedTime,
      actual_time: actualTime,
      time_multiplier: mult,
      alternative_paths: alternativePaths,
    },
  }
}

// ==================== CIRCULAR DEPENDENCY ====================

export function detectCircularDependency(
  requirementsGraph: Record<string, string[]>,
): CriticalFailure {
  const visited: Record<string, boolean>  = {}
  const recStack: Record<string, boolean> = {}
  const cyclePath: string[] = []

  function dfs(node: string): boolean {
    visited[node]  = true
    recStack[node] = true
    cyclePath.push(node)
    for (const neighbor of requirementsGraph[node] ?? []) {
      if (!visited[neighbor]) {
        if (dfs(neighbor)) return true
      } else if (recStack[neighbor]) {
        cyclePath.push(neighbor)
        return true
      }
    }
    cyclePath.pop()
    recStack[node] = false
    return false
  }

  for (const node of Object.keys(requirementsGraph)) {
    if (!visited[node] && dfs(node)) {
      return {
        type: 'DEADLOCK',
        severity: 'CRITICAL',
        message: `CRITICAL: Circular dependency deadlock. Cycle: ${cyclePath.join(' -> ')}`,
        details: { cycle_path: cyclePath, requirements_graph: requirementsGraph },
      }
    }
  }

  return noFailure()
}

// ==================== BATCH ANALYSIS ====================

export function analyzeContext(ctx: SimulationContext): FailureReport {
  const failures: CriticalFailure[] = []

  // Infinite growth pro každý resource
  for (const [id, history] of Object.entries(ctx.resource_history)) {
    const f = detectInfiniteGrowth(id, history)
    if (f.type !== 'NONE') failures.push(f)
  }

  // Circular dependency
  if (ctx.state_transitions.length > 0) {
    const reqGraph: Record<string, string[]> = {}
    for (const t of ctx.state_transitions) {
      reqGraph[t.from] = t.requirements
    }
    const f = detectCircularDependency(reqGraph)
    if (f.type !== 'NONE') failures.push(f)
  }

  // Hard bottlenecks
  for (const [gateId, data] of Object.entries(ctx.gate_times)) {
    const f = detectHardBottleneck(
      gateId,
      data.actual_time,
      data.expected_time,
      data.alternative_paths,
    )
    if (f.type !== 'NONE') failures.push(f)
  }

  return buildReport(failures)
}

export function buildReport(failures: CriticalFailure[]): FailureReport {
  let hasCritical = false
  let hasUnsafe   = false
  let worst: FailureSeverity = 'NONE'

  for (const f of failures) {
    if (f.severity === 'CRITICAL') { hasCritical = true; worst = 'CRITICAL' }
    else if (f.severity === 'UNSAFE' && worst !== 'CRITICAL') { hasUnsafe = true; worst = 'UNSAFE' }
  }

  return { failures, has_critical: hasCritical, has_unsafe: hasUnsafe, worst_severity: worst }
}

// ==================== UTILITIES ====================

function arrayMean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
