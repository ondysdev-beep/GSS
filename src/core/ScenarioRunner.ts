// ScenarioRunner.ts — přímý port GDScript ScenarioRunner.gd
// Spustí graf přes TickEngine pro N ticků, sbírá time series,
// počítá summary metriky a vrací RunReport.

import { SimRNG, createRNG } from './SimRNG'
import type { RNGInstance } from './SimRNG'
import { TICK_SPEC_VERSION, initState, simulateTick, applyInitialOverrides } from './TickEngine'
import type { GSSGraph } from '../types/graph'
import { NodeType } from '../types/graph'
import type {
  Scenario,
  RunReport,
  TimeSeriesFrame,
  RunSummary,
  ChanceStat,
  SimState,
  SimulationContext,
} from '../types/simulation'
import { defaultScenario } from '../types/simulation'

export { defaultScenario }

/** Upper bound for ticks in a single run — protects the UI thread from multi-minute freezes. */
export const MAX_SCENARIO_TICKS = 1_000_000

// Tolerance pro porovnání časů složených z `ticks * dt` (např. 7 × 0.1 =
// 0.7000000000000001) — bez ní vzorkování občas vynechá snímek.
const TIME_EPSILON = 1e-9

/**
 * Throws a descriptive Error if the scenario timing would hang or explode
 * the simulation loop (dt ≤ 0 used to mean an infinite loop).
 */
export function validateScenarioTiming(sc: { duration: number; dt: number; sampling_interval: number }): void {
  if (!Number.isFinite(sc.dt) || sc.dt <= 0) {
    throw new Error(`Invalid scenario: dt must be a positive number (got ${sc.dt}).`)
  }
  if (!Number.isFinite(sc.duration) || sc.duration < 0) {
    throw new Error(`Invalid scenario: duration must be a non-negative number (got ${sc.duration}).`)
  }
  if (!Number.isFinite(sc.sampling_interval) || sc.sampling_interval <= 0) {
    throw new Error(`Invalid scenario: sampling interval must be a positive number (got ${sc.sampling_interval}).`)
  }
  const ticks = Math.ceil(sc.duration / sc.dt - TIME_EPSILON)
  if (ticks > MAX_SCENARIO_TICKS) {
    throw new Error(
      `Scenario would need ${ticks.toLocaleString('en-US')} ticks (limit ${MAX_SCENARIO_TICKS.toLocaleString('en-US')}). Increase dt or shorten the duration.`,
    )
  }
}

/**
 * Seed precedence shared by every runner: an explicit positive override
 * wins, then a positive project seed; 0/undefined everywhere means "random".
 */
export function resolveSeed(seedOverride: number | undefined, projectSeed: number | undefined): number {
  if (typeof seedOverride === 'number' && seedOverride > 0) return seedOverride >>> 0
  if (typeof projectSeed === 'number' && projectSeed > 0) return projectSeed >>> 0
  return SimRNG.generateSeed()
}

/** Number of ticks a scenario runs (integer counting avoids float drift). */
export function scenarioTickCount(duration: number, dt: number): number {
  return Math.max(0, Math.ceil(duration / dt - TIME_EPSILON))
}

// ==================== CORE RUNNER ====================

export function runScenario(
  graph: GSSGraph,
  scenario: Partial<Scenario> = {},
): RunReport {
  const sc: Scenario = { ...defaultScenario(), ...scenario }
  validateScenarioTiming(sc)

  const duration = sc.duration
  const dt = sc.dt
  const samplingInterval = sc.sampling_interval
  const thresholds = sc.thresholds ?? {}

  const effectiveSeed = resolveSeed(sc.seed_override, graph.simulation_seed)
  const rng: RNGInstance = createRNG(effectiveSeed)

  // Initialize state (+ initial overrides, gates re-evaluated afterwards)
  let state: SimState = initState(graph)
  applyInitialOverrides(state, graph, sc.initial_overrides)

  // Tracking
  const timeSeries: TimeSeriesFrame[] = []
  const minValues: Record<string, number> = {}
  const maxValues: Record<string, number> = {}
  const timeToThreshold: Record<string, number> = {}

  for (const pid of Object.keys(state.pools)) {
    const amt = state.pools[pid].amount
    minValues[pid] = amt
    maxValues[pid] = amt
    timeToThreshold[pid] = thresholds[pid] !== undefined && amt >= thresholds[pid] ? 0 : -1
  }

  // Initial frame (t = 0) so charts and replay start from the real starting state
  timeSeries.push(_frame(state, 0))
  let lastSample = 0

  // Main simulation loop — integer tick counting avoids floating-point accumulation
  const totalTicksPlanned = scenarioTickCount(duration, dt)
  let totalTicks = 0

  while (totalTicks < totalTicksPlanned) {
    state = simulateTick(state, graph, dt, rng)
    totalTicks++
    const elapsed = totalTicks * dt

    for (const pid of Object.keys(state.pools)) {
      const amt = state.pools[pid].amount
      if (amt < minValues[pid]) minValues[pid] = amt
      if (amt > maxValues[pid]) maxValues[pid] = amt

      if (thresholds[pid] !== undefined && timeToThreshold[pid] < 0 && amt >= thresholds[pid]) {
        timeToThreshold[pid] = elapsed
      }
    }

    const isLast = totalTicks === totalTicksPlanned
    if (elapsed - lastSample >= samplingInterval - TIME_EPSILON || isLast) {
      timeSeries.push(_frame(state, elapsed))
      lastSample = elapsed
    }
  }

  // Build final values
  const finalValues: Record<string, number> = {}
  for (const pid of Object.keys(state.pools)) {
    finalValues[pid] = Math.round(state.pools[pid].amount * 10000) / 10000
  }

  // Extract chance stats
  const chanceStats: Record<string, ChanceStat> = {}
  for (const [cid, cr] of Object.entries(state.chance_rolls)) {
    chanceStats[cid] = { successes: cr.successes, total: cr.total }
  }

  const summary: RunSummary = {
    final_values: finalValues,
    min_values: minValues,
    max_values: maxValues,
    time_to_threshold: timeToThreshold,
    total_ticks: totalTicks,
    elapsed: Math.round(totalTicks * dt * 1000) / 1000,
  }

  return {
    tick_spec_version: TICK_SPEC_VERSION,
    scenario: sc,
    time_series: timeSeries,
    summary,
    chance_stats: chanceStats,
    seed_used: effectiveSeed,
  }
}

function _frame(state: SimState, elapsed: number): TimeSeriesFrame {
  const frame: TimeSeriesFrame = {
    time: Math.round(elapsed * 1000) / 1000,
    pools: {},
    gates: {},
  }
  for (const pid of Object.keys(state.pools)) {
    frame.pools[pid] = Math.round(state.pools[pid].amount * 10000) / 10000
  }
  for (const gid of Object.keys(state.gate_states)) {
    frame.gates[gid] = state.gate_states[gid]
  }
  return frame
}

// ==================== EXPORT HELPERS ====================

/** Wide CSV: one row per sampled frame, one column per pool. */
export function reportToCSV(report: RunReport): string {
  const ts = report.time_series
  if (ts.length === 0) return ''

  const poolIds = Object.keys(ts[0].pools).sort()
  const header = ['time', ...poolIds.map(csvCell)].join(',')

  const rows = ts.map((frame) => {
    const cols = [frame.time.toFixed(3), ...poolIds.map((pid) => (frame.pools[pid] ?? 0).toFixed(4))]
    return cols.join(',')
  })

  return [header, ...rows].join('\n')
}

/** Long CSV: one `time,pool_id,value` row per pool per sampled frame. */
export function reportToLongCSV(report: RunReport): string {
  const ts = report.time_series
  if (ts.length === 0) return ''
  const poolIds = Object.keys(ts[0].pools).sort()
  const rows = ['time,pool_id,value']
  for (const frame of ts) {
    for (const pid of poolIds) {
      rows.push(`${frame.time.toFixed(3)},${csvCell(pid)},${(frame.pools[pid] ?? 0).toFixed(4)}`)
    }
  }
  return rows.join('\n')
}

/** Quotes a CSV cell if it contains a delimiter, quote or newline. */
export function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// ==================== CONTEXT BUILDER (for analysis pipeline) ====================

export function buildSimulationContext(
  report: RunReport,
  graph?: GSSGraph,
  scenario?: Partial<Scenario>,
): SimulationContext {
  const resourceHistory: Record<string, number[]> = {}

  for (const frame of report.time_series) {
    for (const [pid, amount] of Object.entries(frame.pools)) {
      if (!resourceHistory[pid]) resourceHistory[pid] = []
      resourceHistory[pid].push(amount)
    }
  }

  // --- player_distribution: run persona simulations if graph is provided ---
  const playerDistribution: Record<string, number> = {}
  if (graph) {
    // Persony musí běžet se STEJNÝM scénářem (délka, dt…) jako hlavní běh —
    // dřív se bez parametru `scenario` použil výchozí 60s scénář.
    const baseSc: Partial<Scenario> = { ...report.scenario, ...scenario, seed_override: report.seed_used }

    // optimal = base scenario final wealth
    const optimalWealth = _sumFinalWealth(report)
    playerDistribution['optimal'] = optimalWealth

    // Run per-persona: adjust drain rates to simulate different play styles
    const archetypes: Array<{ key: string; drainMult: number }> = [
      { key: 'casual', drainMult: 0.5 },
      { key: 'grinder', drainMult: 2.0 },
      { key: 'minmaxer', drainMult: 1.5 },
    ]

    for (const arch of archetypes) {
      try {
        const personaGraph = _adjustDrainRates(graph, arch.drainMult)
        const personaReport = runScenario(personaGraph, baseSc)
        playerDistribution[arch.key] = _sumFinalWealth(personaReport)
      } catch {
        playerDistribution[arch.key] = optimalWealth
      }
    }

    // exploiter = run with pools starting at max capacity
    try {
      const exploiterOverrides: Record<string, number> = {}
      for (const node of graph.nodes) {
        if (node.type === NodeType.POOL) {
          const capacity = (node.data as unknown as Record<string, unknown>)?.capacity
          exploiterOverrides[String(node.id)] = typeof capacity === 'number' && Number.isFinite(capacity) ? capacity : 100
        }
      }
      const exploiterReport = runScenario(graph, { ...baseSc, initial_overrides: exploiterOverrides })
      playerDistribution['exploiter'] = _sumFinalWealth(exploiterReport)
    } catch {
      playerDistribution['exploiter'] = optimalWealth
    }
  }

  // --- gate_times: extract from time series ---
  const gateTimes: Record<string, { actual_time: number; expected_time: number; alternative_paths: number }> = {}
  if (graph && report.time_series.length > 0) {
    const gateNodes = graph.nodes.filter((n) => n.type === NodeType.GATE)
    for (const gateNode of gateNodes) {
      const gid = String(gateNode.id)
      // Find the first frame where the gate is open
      let actualTime = -1
      for (const frame of report.time_series) {
        if (frame.gates[gid] === true) {
          actualTime = frame.time
          break
        }
      }
      if (actualTime < 0) continue

      // Estimate expected time: threshold / total production rate of sources feeding the gated resource
      const data = (gateNode.data ?? {}) as unknown as Record<string, unknown>
      const threshold = typeof data.value === 'number' ? data.value : 0
      const variable = typeof data.variable === 'string' ? data.variable : ''
      let totalSourceRate = 0
      for (const node of graph.nodes) {
        if (node.type !== NodeType.SOURCE) continue
        const srcData = (node.data ?? {}) as unknown as Record<string, unknown>
        if (srcData.resource === variable && typeof srcData.rate === 'number') totalSourceRate += srcData.rate
      }
      const expectedTime = totalSourceRate > 0 ? threshold / totalSourceRate : actualTime

      // Count alternative paths that bypass this gate
      const downstream = new Set<string>()
      for (const conn of graph.connections) {
        if (String(conn.from_node) === gid) downstream.add(String(conn.to_node))
      }
      let altPaths = 0
      for (const conn of graph.connections) {
        if (String(conn.from_node) === gid) continue
        if (downstream.has(String(conn.to_node))) altPaths++
      }

      gateTimes[gid] = { actual_time: actualTime, expected_time: expectedTime, alternative_paths: altPaths }
    }
  }

  return {
    resource_history: resourceHistory,
    gate_times: gateTimes,
    player_distribution: playerDistribution,
    state_transitions: [],
    cycle_count: report.summary.total_ticks,
    total_duration: report.summary.elapsed,
  }
}

function _sumFinalWealth(report: RunReport): number {
  let total = 0
  for (const val of Object.values(report.summary.final_values)) {
    total += val
  }
  return total
}

function _adjustDrainRates(graph: GSSGraph, multiplier: number): GSSGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.type !== NodeType.DRAIN) return n
      const data = (n.data ?? {}) as unknown as Record<string, unknown>
      const rate = typeof data.rate === 'number' ? data.rate : 1.0
      return { ...n, data: { ...data, rate: rate * multiplier } as unknown as typeof n.data }
    }),
  }
}
