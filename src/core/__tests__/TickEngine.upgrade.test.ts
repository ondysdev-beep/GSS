// TickEngine.upgrade.test.ts — Upgrade node: buying levels with growing cost,
// production / capacity boosts, max level, stacking, report fields, validation.

import { describe, it, expect } from 'vitest'
import { createRNG } from '../SimRNG'
import { initState, simulateTick, upgradeCost, upgradeMultiplier } from '../TickEngine'
import { runScenario } from '../ScenarioRunner'
import { validate } from '../GraphValidator'
import type { GSSGraph, GSSNode } from '../../types/graph'

function g(nodes: GSSGraph['nodes'], connections: GSSGraph['connections']): GSSGraph {
  return {
    version: '3.0', tick_spec_version: 2, name: 'upgrade', description: '',
    created_at: '', modified_at: '', simulation_seed: 1, nodes, connections,
  }
}
const at = { x: 0, y: 0 }
const c = (from: string, to: string, port = 0) => ({ from_node: from, to_node: to, from_port: port, to_port: 0 })

function run(graph: GSSGraph, ticks: number, dt = 1) {
  const rng = createRNG(1)
  let s = initState(graph)
  for (let i = 0; i < ticks; i++) s = simulateTick(s, graph, dt, rng)
  return s
}

const upgrade = (id: string, data: Record<string, unknown> = {}): GSSNode => ({
  id, type: 11, label: id, position: at,
  data: { resource: 'gold', base_cost: 50, cost_growth: 2, bonus_per_level: 100, bonus_mode: 0, max_level: 0, ...data } as never,
})

// Mine 10 gold/s → Bank; "Pickaxe" upgrade paid from Bank boosts the Mine.
const mineGraph = (upgradeData: Record<string, unknown> = {}) => g(
  [
    { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
    { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e6 } },
    upgrade('pickaxe', upgradeData),
  ],
  [c('mine', 'bank'), c('bank', 'pickaxe'), c('pickaxe', 'mine')],
)

describe('Upgrade formulas', () => {
  it('cost grows exponentially per level', () => {
    expect(upgradeCost(10, 1.15, 0)).toBe(10)
    expect(upgradeCost(10, 2, 3)).toBe(80)
  })
  it('additive and compound bonus', () => {
    expect(upgradeMultiplier(10, 0, 3)).toBeCloseTo(1.3)
    expect(upgradeMultiplier(10, 1, 3)).toBeCloseTo(1.331)
    expect(upgradeMultiplier(10, 0, 0)).toBe(1)
    expect(upgradeMultiplier(-50, 0, 5)).toBe(0) // never negative
  })
})

describe('Upgrade node', () => {
  it('buys levels as soon as they are affordable and boosts production from the next tick', () => {
    const r = runScenario(mineGraph(), { duration: 10, dt: 1, sampling_interval: 1, seed_override: 1 })
    // 5 ticks × 10 = 50 → level 1 (cost 50); then 20/s, level 2 costs 100 → 5 more ticks.
    expect(r.summary.upgrade_levels).toEqual({ pickaxe: 2 })
    expect(r.summary.upgrade_times).toEqual({ pickaxe: [5, 10] })
    expect(r.summary.final_values.bank).toBe(0)
    expect(r.time_series[6].upgrades).toEqual({ pickaxe: 1 })
  })

  it('respects max level', () => {
    const s = run(mineGraph({ max_level: 1 }), 30)
    expect(s.upgrade_levels?.pickaxe).toBe(1)
    // 50 spent at tick 5, then 25 ticks at 20/s
    expect(s.pools.bank.amount).toBeCloseTo(500)
  })

  it('compound mode multiplies the bonus', () => {
    const s = run(mineGraph({ bonus_mode: 1, base_cost: 10, cost_growth: 1, max_level: 3 }), 10)
    expect(s.upgrade_levels?.pickaxe).toBe(3)
    // levels bought at ticks 1, 2 and 3 → tick 4+ produce 10 × 2³ = 80/s
    const s2 = simulateTick(s, mineGraph({ bonus_mode: 1, base_cost: 10, cost_growth: 1, max_level: 3 }), 1, createRNG(1))
    expect(s2.pools.bank.amount - s.pools.bank.amount).toBeCloseTo(80)
  })

  it('several upgrades on one node multiply, and the earlier node has priority over shared currency', () => {
    const graph = g(
      [
        { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
        { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e6 } },
        upgrade('a', { base_cost: 10, cost_growth: 1, max_level: 1 }),
        upgrade('b', { base_cost: 10, cost_growth: 1, max_level: 1 }),
      ],
      [c('mine', 'bank'), c('bank', 'a'), c('bank', 'b'), c('a', 'mine'), c('b', 'mine')],
    )
    const s1 = run(graph, 1)
    expect(s1.upgrade_levels).toEqual({ a: 1, b: 0 })
    const s3 = run(graph, 3)
    expect(s3.upgrade_levels).toEqual({ a: 1, b: 1 })
    // tick 2: 20/s → a's bonus only; b bought at end of tick 2 → tick 3: 10 × 2 × 2 = 40
    const s4 = simulateTick(s3, graph, 1, createRNG(1))
    expect(s4.pools.bank.amount - s3.pools.bank.amount).toBeCloseTo(40)
  })

  it('boosts pool capacity', () => {
    const graph = g(
      [
        { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
        { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e6 } },
        { id: 'silo', type: 0, label: 'Silo', position: at, data: { resource: 'gold', capacity: 100 } },
        upgrade('storage', { base_cost: 100, max_level: 1 }),
      ],
      [c('mine', 'bank'), c('mine', 'silo'), c('bank', 'storage'), c('storage', 'silo')],
    )
    const s = run(graph, 30)
    expect(s.upgrade_levels?.storage).toBe(1)
    expect(s.pools.silo.capacity).toBe(200)
    expect(s.pools.silo.amount).toBe(200)
  })

  it('graphs without upgrades keep the old report shape', () => {
    const graph = g(
      [
        { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
        { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 100 } },
      ],
      [c('mine', 'bank')],
    )
    const r = runScenario(graph, { duration: 3, dt: 1, sampling_interval: 1, seed_override: 1 })
    expect(r.summary.upgrade_levels).toBeUndefined()
    expect(r.time_series[1]).toEqual({ time: 1, pools: { bank: 10 }, gates: {} })
  })

  it('a zero cost never buys (no infinite levels)', () => {
    const s = run(mineGraph({ base_cost: 0 }), 5)
    expect(s.upgrade_levels?.pickaxe).toBe(0)
  })
})

describe('Upgrade validation', () => {
  it('accepts a well-formed upgrade', () => {
    const issues = validate(mineGraph()).filter((i) => i.severity !== 'INFO')
    expect(issues).toEqual([])
  })
  it('flags zero cost, missing pool and targets it cannot boost', () => {
    const graph = g(
      [
        { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
        { id: 'drain', type: 3, label: 'Drain', position: at, data: { resource: 'gold', rate: 1 } },
        upgrade('u', { base_cost: 0 }),
      ],
      [c('mine', 'u'), c('u', 'drain')],
    )
    const codes = validate(graph).map((i) => `${i.severity}:${i.code}`)
    expect(codes).toContain('ERROR:NEGATIVE_VALUE')
    expect(codes).toContain('WARNING:UPGRADE_INPUT')
    expect(codes).toContain('WARNING:UPGRADE_TARGET')
  })
})
