// ScenarioRunner.ts — přímý port GDScript ScenarioRunner.gd
// Spustí graf přes TickEngine pro N ticků, sbírá time series,
// počítá summary metriky a vrací RunReport.

import { SimRNG, createRNG } from './SimRNG'
import type { RNGInstance } from './SimRNG'
import { TICK_SPEC_VERSION, initState, simulateTick } from './TickEngine'
import type { GSSGraph } from '../types/graph'
import type {
  Scenario,
  RunReport,
  TimeSeriesFrame,
  RunSummary,
  ChanceStat,
} from '../types/simulation'
import { defaultScenario } from '../types/simulation'
import type { SimState } from '../types/simulation'

export { defaultScenario }

// ==================== CORE RUNNER ====================

export function runScenario(
  graph: GSSGraph,
  scenario: Partial<Scenario> = {},
): RunReport {
  const sc: Scenario = { ...defaultScenario(), ...scenario }

  const duration = sc.duration
  const dt = sc.dt
  const samplingInterval = sc.sampling_interval
  const initialOverrides = sc.initial_overrides
  const thresholds = sc.thresholds

  // Determine seed
  const projectSeed = graph.simulation_seed ?? 0
  let effectiveSeed = sc.seed_override > 0 ? sc.seed_override : projectSeed
  if (effectiveSeed === 0) effectiveSeed = SimRNG.generateSeed()
  const rng: RNGInstance = createRNG(effectiveSeed)

  // Initialize state
  let state: SimState = initState(graph)

  // Apply initial overrides
  for (const [poolId, amount] of Object.entries(initialOverrides)) {
    if (state.pools[poolId]) state.pools[poolId].amount = amount
  }

  // Tracking
  const timeSeries: TimeSeriesFrame[] = []
  const minValues: Record<string, number> = {}
  const maxValues: Record<string, number> = {}
  const timeToThreshold: Record<string, number> = {}

  for (const pid of Object.keys(state.pools)) {
    minValues[pid] = state.pools[pid].amount
    maxValues[pid] = state.pools[pid].amount
    timeToThreshold[pid] = -1
  }

  // Main simulation loop — use integer tick counting to avoid floating-point accumulation
  let lastSample = -samplingInterval
  let totalTicks = 0

  while (totalTicks * dt < duration) {
    state = simulateTick(state, graph, dt, rng)
    totalTicks++
    const elapsed = totalTicks * dt

    // Update min/max and check thresholds
    for (const pid of Object.keys(state.pools)) {
      const amt = state.pools[pid].amount
      if (amt < minValues[pid]) minValues[pid] = amt
      if (amt > maxValues[pid]) maxValues[pid] = amt

      if (thresholds[pid] !== undefined && timeToThreshold[pid] < 0) {
        if (amt >= thresholds[pid]) timeToThreshold[pid] = elapsed
      }
    }

    // Sample time series
    if (elapsed - lastSample >= samplingInterval || elapsed >= duration) {
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
      timeSeries.push(frame)
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

  const finalElapsed = totalTicks * dt

  const summary: RunSummary = {
    final_values: finalValues,
    min_values: minValues,
    max_values: maxValues,
    time_to_threshold: timeToThreshold,
    total_ticks: totalTicks,
    elapsed: Math.round(finalElapsed * 1000) / 1000,
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

// ==================== EXPORT HELPERS ====================

export function reportToCSV(report: RunReport): string {
  const ts = report.time_series
  if (ts.length === 0) return ''

  const poolIds = Object.keys(ts[0].pools).sort()
  const header = ['time', ...poolIds].join(',')

  const rows = ts.map((frame) => {
    const cols = [frame.time.toFixed(3), ...poolIds.map((pid) => (frame.pools[pid] ?? 0).toFixed(4))]
    return cols.join(',')
  })

  return [header, ...rows].join('\n')
}

// ==================== CONTEXT BUILDER (for analysis pipeline) ====================

import type { SimulationContext } from '../types/simulation'
import { NodeType } from '../types/graph'

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
    const baseSc: Partial<Scenario> = { ...scenario, seed_override: report.seed_used }

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
          const data = node.data as unknown as Record<string, unknown>
          const capacity = (data.capacity as number) ?? 100
          exploiterOverrides[String(node.id)] = capacity
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
      // Find the first tick where gate opened
      let actualTime = -1
      for (const frame of report.time_series) {
        if (frame.gates[gid] === true) {
          actualTime = frame.time
          break
        }
      }
      if (actualTime < 0) continue

      // Estimate expected time: threshold / total production rate of connected sources
      const data = gateNode.data as unknown as Record<string, unknown>
      const threshold = (data.value as number) ?? 0
      let totalSourceRate = 0
      for (const conn of graph.connections) {
        if (String(conn.to_node) === gid) {
          const srcNode = graph.nodes.find((n) => String(n.id) === String(conn.from_node))
          if (srcNode && srcNode.type === NodeType.SOURCE) {
            const srcData = srcNode.data as unknown as Record<string, unknown>
            totalSourceRate += (srcData.rate as number) ?? 0
          }
        }
      }
      const expectedTime = totalSourceRate > 0 ? threshold / totalSourceRate : actualTime

      // Count alternative paths that bypass this gate
      const downstreamPools = new Set<string>()
      for (const conn of graph.connections) {
        if (String(conn.from_node) === gid) downstreamPools.add(String(conn.to_node))
      }
      let altPaths = 0
      for (const conn of graph.connections) {
        if (String(conn.from_node) === gid) continue
        if (downstreamPools.has(String(conn.to_node))) altPaths++
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
      const data = n.data as unknown as Record<string, unknown>
      const rate = (data.rate as number) ?? 1.0
      return { ...n, data: { ...n.data, rate: rate * multiplier } }
    }),
  }
}
