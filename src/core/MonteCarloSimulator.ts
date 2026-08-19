// MonteCarloSimulator.ts — přímý port GDScript MonteCarloSimulator.gd
// Spustí N simulací s různými seed hodnotami, sbírá statistiky přes všechny výsledky.

import { SimRNG, createRNG } from './SimRNG'
import { TICK_SPEC_VERSION, initState, simulateTick } from './TickEngine'
import type { GSSGraph } from '../types/graph'
import type { Scenario, MCReport, MCPoolStats } from '../types/simulation'
import { defaultScenario } from '../types/simulation'

export interface MCConfig {
  iterations: number      // počet běhů (default 100)
  seed_base: number       // základní seed (0 = náhodný)
  scenario: Partial<Scenario>
}

export function defaultMCConfig(): MCConfig {
  return { iterations: 100, seed_base: 42, scenario: {} }
}

// ==================== CORE RUNNER ====================

export function runMonteCarlo(
  graph: GSSGraph,
  config: Partial<MCConfig> = {},
): MCReport {
  const iterations = config.iterations ?? 100
  const seedBase = config.seed_base ?? 42
  const sc = { ...defaultScenario(), ...config.scenario }

  const duration = sc.duration
  const dt = sc.dt

  // Per-pool: collect final values across all runs
  const poolValues: Record<string, number[]> = {}
  // Per-chance: collect total rolls across all runs
  const chanceSuccesses: Record<string, number[]> = {}
  const chanceRates: Record<string, number[]> = {}

  for (let run = 0; run < iterations; run++) {
    // Deterministic: each run gets a unique seed via isolated RNG instance
    const runSeed = seedBase === 0
      ? SimRNG.generateSeed()
      : seedBase + run
    const rng = createRNG(runSeed)

    // Initialize state
    let state = initState(graph)

    // Apply initial overrides
    for (const [pid, amount] of Object.entries(sc.initial_overrides)) {
      if (state.pools[pid]) state.pools[pid].amount = amount
    }

    // Simulation loop — integer tick counting (no floating-point accumulation)
    let totalTicks = 0
    while (totalTicks * dt < duration) {
      state = simulateTick(state, graph, dt, rng)
      totalTicks++
    }

    // Sbírat finální hodnoty poolů
    for (const [pid, pool] of Object.entries(state.pools)) {
      if (!poolValues[pid]) poolValues[pid] = []
      poolValues[pid].push(pool.amount)
    }

    // Sbírat chance statistiky
    for (const [cid, cr] of Object.entries(state.chance_rolls)) {
      if (!chanceSuccesses[cid]) chanceSuccesses[cid] = []
      if (!chanceRates[cid]) chanceRates[cid] = []
      const rate = cr.total > 0 ? cr.successes / cr.total : 0
      chanceSuccesses[cid].push(cr.successes)
      chanceRates[cid].push(rate)
    }
  }

  // Vypočítat statistiky pro každý pool
  const poolStats: Record<string, MCPoolStats> = {}
  for (const [pid, vals] of Object.entries(poolValues)) {
    poolStats[pid] = computeStats(vals)
  }

  // Vypočítat statistiky pro chance nody
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

function arrayStd(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arrayMean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
}
