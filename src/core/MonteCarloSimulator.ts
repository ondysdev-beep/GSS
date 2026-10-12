// MonteCarloSimulator.ts — přímý port GDScript MonteCarloSimulator.gd
// Spustí N simulací s různými seed hodnotami, sbírá statistiky přes všechny výsledky.

import { SimRNG, createRNG } from './SimRNG'
import { TICK_SPEC_VERSION, initState, simulateTick, applyInitialOverrides } from './TickEngine'
import { validateScenarioTiming, scenarioTickCount } from './ScenarioRunner'
import type { GSSGraph } from '../types/graph'
import type { Scenario, MCReport, MCPoolStats } from '../types/simulation'
import { defaultScenario } from '../types/simulation'

export interface MCConfig {
  iterations: number      // počet běhů (default 100)
  seed_base: number       // základní seed (0 = náhodný seed pro každý běh)
  scenario: Partial<Scenario>
}

/** Upper bound on iterations × ticks so a single MC run cannot freeze the UI for minutes. */
export const MAX_MC_TOTAL_TICKS = 20_000_000

export function defaultMCConfig(): MCConfig {
  return { iterations: 100, seed_base: 42, scenario: {} }
}

// ==================== CORE RUNNER ====================

export function runMonteCarlo(
  graph: GSSGraph,
  config: Partial<MCConfig> = {},
): MCReport {
  const iterations = Math.max(0, Math.floor(config.iterations ?? 100))
  const seedBase = config.seed_base ?? 42
  const sc: Scenario = { ...defaultScenario(), ...config.scenario }
  validateScenarioTiming(sc)

  const ticksPerRun = scenarioTickCount(sc.duration, sc.dt)
  if (ticksPerRun * iterations > MAX_MC_TOTAL_TICKS) {
    throw new Error(
      `Monte Carlo would simulate ${(ticksPerRun * iterations).toLocaleString('en-US')} ticks in total (limit ${MAX_MC_TOTAL_TICKS.toLocaleString('en-US')}). Reduce iterations or duration, or increase dt.`,
    )
  }

  // Per-pool: collect final values across all runs
  const poolValues: Record<string, number[]> = {}
  // Per-chance: success rate per run
  const chanceRates: Record<string, number[]> = {}

  for (let run = 0; run < iterations; run++) {
    // Deterministic: each run gets a unique seed via isolated RNG instance
    const runSeed = seedBase === 0 ? SimRNG.generateSeed() : (seedBase + run) >>> 0
    const rng = createRNG(runSeed)

    let state = initState(graph)
    applyInitialOverrides(state, graph, sc.initial_overrides)

    for (let t = 0; t < ticksPerRun; t++) {
      state = simulateTick(state, graph, sc.dt, rng)
    }

    for (const [pid, pool] of Object.entries(state.pools)) {
      if (!poolValues[pid]) poolValues[pid] = []
      poolValues[pid].push(pool.amount)
    }

    for (const [cid, cr] of Object.entries(state.chance_rolls)) {
      if (!chanceRates[cid]) chanceRates[cid] = []
      chanceRates[cid].push(cr.total > 0 ? cr.successes / cr.total : 0)
    }
  }

  const poolStats: Record<string, MCPoolStats> = {}
  for (const [pid, vals] of Object.entries(poolValues)) {
    poolStats[pid] = computeStats(vals)
  }

  const chanceStats: Record<string, { mean_success_rate: number; std: number }> = {}
  for (const [cid, rates] of Object.entries(chanceRates)) {
    chanceStats[cid] = {
      mean_success_rate: arrayMean(rates),
      std: arrayStd(rates),
    }
  }

  return {
    tick_spec_version: TICK_SPEC_VERSION,
    iterations,
    seed_base: seedBase,
    scenario: sc,
    pool_stats: poolStats,
    chance_stats: chanceStats,
  }
}

// ==================== STATISTIKY ====================

function computeStats(vals: number[]): MCPoolStats {
  if (vals.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 }
  }
  const sorted = [...vals].sort((a, b) => a - b)
  const n = sorted.length

  return {
    mean: arrayMean(vals),
    std: arrayStd(vals),
    min: sorted[0],
    max: sorted[n - 1],
    p10: percentile(sorted, 0.10),
    p50: percentile(sorted, 0.50),
    p90: percentile(sorted, 0.90),
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = p * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function arrayMean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

/** Population standard deviation (same definition as HealthScoreCalculator). */
function arrayStd(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arrayMean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
}
