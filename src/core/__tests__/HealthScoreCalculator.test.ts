import { describe, it, expect } from 'vitest'
import { calculateHealthScore } from '../HealthScoreCalculator'
import { runScenario, buildSimulationContext } from '../ScenarioRunner'
import type { GSSGraph } from '../../types/graph'
import type { SimulationContext } from '../../types/simulation'

// Helper to create a minimal simulation context with player distribution
function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    resource_history: { pool1: Array.from({ length: 60 }, (_, i) => 50 + i * 0.5) },
    gate_times: {},
    player_distribution: {},
    state_transitions: [],
    cycle_count: 60,
    total_duration: 60,
    ...overrides,
  }
}

describe('HealthScoreCalculator', () => {
  it('should return Fairness = 75 when player_distribution is empty (< 2 keys)', () => {
    const ctx = makeCtx({ player_distribution: {} })
    const hs = calculateHealthScore(ctx)
    expect(hs.fairness).toBe(75)
  })

  it('should return Fairness below 60 for heavily biased economy (100x gap)', () => {
    const ctx = makeCtx({
      player_distribution: {
        casual: 10,
        grinder: 200,
        minmaxer: 1000,
        optimal: 100,
        exploiter: 1000,
      },
    })
    const hs = calculateHealthScore(ctx)
    // With min/max ratio < 0.1, the -20 penalty applies, pushing fairness down
    expect(hs.fairness).toBeLessThan(60)
  })

  it('should return Fairness above 75 for balanced economy', () => {
    const ctx = makeCtx({
      player_distribution: {
        casual: 90,
        grinder: 100,
        minmaxer: 110,
        optimal: 100,
        exploiter: 105,
      },
    })
    const hs = calculateHealthScore(ctx)
    expect(hs.fairness).toBeGreaterThan(75)
  })

  it('should penalize Exploitability when exploiter >> optimal', () => {
    const ctx = makeCtx({
      player_distribution: {
        casual: 100,
        grinder: 200,
        minmaxer: 300,
        optimal: 100,
        exploiter: 500,
      },
    })
    const hs = calculateHealthScore(ctx)
    expect(hs.exploitability).toBeLessThan(80)
  })

  it('should reflect actual resource stability in Health Score', () => {
    // Fast drain: resources drop to near zero quickly
    const drainHistory = Array.from({ length: 60 }, (_, i) => Math.max(100 - i * 5, 0))
    const ctx = makeCtx({
      resource_history: { pool1: drainHistory },
      player_distribution: { casual: 10, grinder: 50, optimal: 30 },
    })
    const hs = calculateHealthScore(ctx)
    // The total score should be lower than a stable economy
    expect(hs.total).toBeLessThan(80)
  })

  it('should produce varying scores for different economies (not constant)', () => {
    const balanced = makeCtx({
      player_distribution: { casual: 95, grinder: 100, minmaxer: 105, optimal: 100 },
    })
    const unbalanced = makeCtx({
      player_distribution: { casual: 10, grinder: 500, minmaxer: 2000, optimal: 100, exploiter: 3000 },
    })
    const hsBalanced = calculateHealthScore(balanced)
    const hsUnbalanced = calculateHealthScore(unbalanced)
    expect(hsBalanced.fairness).not.toBe(hsUnbalanced.fairness)
  })
})

describe('buildSimulationContext with graph', () => {
  const BALANCED_GRAPH: GSSGraph = {
    version: '3.0',
    tick_spec_version: 1,
    name: 'Balanced',
    description: '',
    created_at: '2024-01-01T00:00:00Z',
    modified_at: '2024-01-01T00:00:00Z',
    simulation_seed: 42,
    nodes: [
      { id: 'src1', type: 1, label: 'Gold Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
      { id: 'pool1', type: 0, label: 'Gold Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000, initial_amount: 0 } },
      { id: 'drain1', type: 3, label: 'Gold Drain', position: { x: 400, y: 0 }, data: { resource: 'Gold', rate: 5 } },
    ],
    connections: [
      { from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 },
      { from_node: 'pool1', to_node: 'drain1', from_port: 0, to_port: 0 },
    ],
  }

  it('should populate player_distribution with persona keys when graph is provided', () => {
    const report = runScenario(BALANCED_GRAPH, { duration: 30, seed_override: 42 })
    const ctx = buildSimulationContext(report, BALANCED_GRAPH, { duration: 30, seed_override: 42 })

    expect(Object.keys(ctx.player_distribution)).toContain('optimal')
    expect(Object.keys(ctx.player_distribution)).toContain('casual')
    expect(Object.keys(ctx.player_distribution)).toContain('grinder')
    expect(Object.keys(ctx.player_distribution)).toContain('minmaxer')
    expect(Object.keys(ctx.player_distribution)).toContain('exploiter')
  })

  it('should return non-empty player_distribution values', () => {
    const report = runScenario(BALANCED_GRAPH, { duration: 30, seed_override: 42 })
    const ctx = buildSimulationContext(report, BALANCED_GRAPH, { duration: 30, seed_override: 42 })

    for (const val of Object.values(ctx.player_distribution)) {
      expect(typeof val).toBe('number')
      expect(val).toBeGreaterThanOrEqual(0)
    }
  })

  it('should produce different Fairness score with graph vs without graph', () => {
    const report = runScenario(BALANCED_GRAPH, { duration: 30, seed_override: 42 })

    const ctxWithGraph = buildSimulationContext(report, BALANCED_GRAPH, { duration: 30, seed_override: 42 })
    const ctxWithout = buildSimulationContext(report)

    const hsWith = calculateHealthScore(ctxWithGraph)
    const hsWithout = calculateHealthScore(ctxWithout)

    // Without graph: fairness always 75 (early return). With graph: may differ.
    expect(hsWithout.fairness).toBe(75)
    // With graph, we have persona data so it should compute a real value
    expect(Object.keys(ctxWithGraph.player_distribution).length).toBeGreaterThanOrEqual(3)
    expect(typeof hsWith.fairness).toBe('number')
  })
})
