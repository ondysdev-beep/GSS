// TickEngine.v2.test.ts — tick spec v2: gate relay, pulling through gates,
// chance routing into any node type, routing-loop guard, pool capacity,
// converter buffer rules, player action multi-fire, initial overrides.

import { describe, it, expect } from 'vitest'
import { createRNG } from '../SimRNG'
import { initState, simulateTick, applyInitialOverrides } from '../TickEngine'
import type { GSSGraph } from '../../types/graph'

function g(nodes: GSSGraph['nodes'], connections: GSSGraph['connections']): GSSGraph {
  return {
    version: '3.0', tick_spec_version: 2, name: 'v2', description: '',
    created_at: '', modified_at: '', simulation_seed: 1, nodes, connections,
  }
}
const at = { x: 0, y: 0 }
const c = (from: string, to: string, port = 0) => ({ from_node: from, to_node: to, from_port: port, to_port: 0 })

function run(graph: GSSGraph, ticks: number, dt = 1, seed = 1) {
  const rng = createRNG(seed)
  let s = initState(graph)
  for (let i = 0; i < ticks; i++) s = simulateTick(s, graph, dt, rng)
  return s
}

describe('Gate relay', () => {
  const graph = (xp: number) => g(
    [
      { id: 'xp_pool', type: 0, label: 'XP', position: at, data: { resource: 'xp', capacity: 1000, initial_amount: xp } },
      { id: 'gate', type: 4, label: 'Gate', position: at, data: { variable: 'xp', operator: 1, value: 100 } },
      { id: 'reward', type: 1, label: 'Reward', position: at, data: { resource: 'gold', rate: 20 } },
      { id: 'gold', type: 0, label: 'Gold', position: at, data: { resource: 'gold', capacity: 10000 } },
    ],
    [c('reward', 'gate'), c('gate', 'gold')],
  )

  it('an open gate passes flow through to its outputs', () => {
    expect(run(graph(150), 3).pools['gold'].amount).toBeCloseTo(60, 5)
  })

  it('a closed gate blocks the flow', () => {
    expect(run(graph(10), 3).pools['gold'].amount).toBe(0)
  })

  it('a drain can pull from a pool through an open gate, but not through a closed one', () => {
    const drainGraph = (food: number) => g(
      [
        { id: 'food', type: 0, label: 'Food', position: at, data: { resource: 'food', capacity: 100, initial_amount: food } },
        { id: 'hp', type: 0, label: 'HP', position: at, data: { resource: 'hp', capacity: 100, initial_amount: 100 } },
        { id: 'starving', type: 4, label: 'Starving', position: at, data: { variable: 'food', operator: 2, value: 10 } },
        { id: 'hp_drain', type: 3, label: 'HP drain', position: at, data: { resource: 'hp', rate: 2 } },
      ],
      [c('hp', 'starving'), c('starving', 'hp_drain')],
    )
    expect(run(drainGraph(0), 5).pools['hp'].amount).toBeCloseTo(90, 5)   // food < 10 → gate open
    expect(run(drainGraph(50), 5).pools['hp'].amount).toBeCloseTo(100, 5) // food ≥ 10 → gate closed
  })
})

describe('Chance routing', () => {
  it('can chain into another chance node (port 1 → next roll)', () => {
    const graph = g(
      [
        { id: 'src', type: 1, label: 'Pulls', position: at, data: { resource: 'pull', rate: 1 } },
        { id: 'c1', type: 5, label: 'SSR', position: at, data: { success_chance: 0 } },
        { id: 'c2', type: 5, label: 'SR', position: at, data: { success_chance: 100 } },
        { id: 'ssr', type: 0, label: 'SSR', position: at, data: { resource: 'pull', capacity: 1000 } },
        { id: 'sr', type: 0, label: 'SR', position: at, data: { resource: 'pull', capacity: 1000 } },
      ],
      [c('src', 'c1'), c('c1', 'ssr', 0), c('c1', 'c2', 1), c('c2', 'sr', 0)],
    )
    const s = run(graph, 10)
    expect(s.pools['ssr'].amount).toBe(0)
    expect(s.pools['sr'].amount).toBeCloseTo(10, 5)
    expect(s.chance_rolls['c2'].total).toBe(10)
  })
})

describe('Routing loop guard', () => {
  it('splitter ↔ splitter loop does not overflow the stack', () => {
    const graph = g(
      [
        { id: 'src', type: 1, label: 'Src', position: at, data: { resource: 'gold', rate: 10 } },
        { id: 's1', type: 7, label: 'S1', position: at, data: { split_mode: 0, output_count: 2, weights: '1,1' } },
        { id: 's2', type: 7, label: 'S2', position: at, data: { split_mode: 0, output_count: 2, weights: '1,1' } },
        { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 1000 } },
      ],
      [c('src', 's1'), c('s1', 's2', 0), c('s2', 's1', 0), c('s2', 'pool', 1)],
    )
    expect(() => run(graph, 3)).not.toThrow()
  })
})

describe('Pool capacity', () => {
  it('a pool over capacity does not lose resources when more flows in', () => {
    const graph = g(
      [
        { id: 'src', type: 1, label: 'Src', position: at, data: { resource: 'gold', rate: 5 } },
        { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 50, initial_amount: 80 } },
      ],
      [c('src', 'pool')],
    )
    const s0 = initState(graph)
    expect(s0.pools['pool'].amount).toBe(50) // initial amount clamped to capacity
    expect(run(graph, 3).pools['pool'].amount).toBe(50)
  })

  it('negative production never drains a pool', () => {
    const graph = g(
      [
        { id: 'src', type: 1, label: 'Src', position: at, data: { resource: 'gold', rate: -5 } },
        { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 100, initial_amount: 20 } },
      ],
      [c('src', 'pool')],
    )
    expect(run(graph, 3).pools['pool'].amount).toBe(20)
  })
})

describe('Converter input buffer', () => {
  const converter = (inputResource: string) => g(
    [
      { id: 'src', type: 1, label: 'Src', position: at, data: { resource: 'ore', rate: 10 } },
      { id: 'conv', type: 2, label: 'Smelter', position: at, data: { input_resource: inputResource, input_amount: 2, output_resource: 'ingot', output_amount: 1, cycle_time: 1 } },
      { id: 'out', type: 0, label: 'Ingots', position: at, data: { resource: 'ingot', capacity: 1000 } },
    ],
    [c('src', 'conv'), c('conv', 'out')],
  )

  it('converts pushed input and discards surplus instead of hoarding it', () => {
    const s = run(converter('ore'), 5)
    expect(s.pools['out'].amount).toBeCloseTo(5, 5)                // 1 ingot per tick
    expect(s.converter_buffers['conv'].input_buffer).toBeLessThanOrEqual(2)
  })

  it('ignores a resource that is not its configured input', () => {
    const s = run(converter('wood'), 5)
    expect(s.pools['out'].amount).toBe(0)
    expect(s.converter_buffers['conv'].input_buffer).toBe(0)
  })
})

describe('Player Action with dt > cadence', () => {
  it('fires dt / cadence times per tick instead of at most once', () => {
    const graph = g(
      [
        { id: 'act', type: 10, label: 'Click', position: at, data: { resource: 'gold', amount: 1, cadence: 0.5 } },
        { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 1000 } },
      ],
      [c('act', 'pool')],
    )
    expect(run(graph, 10, 1).pools['pool'].amount).toBe(20)
  })
})

describe('applyInitialOverrides', () => {
  it('clamps to capacity and re-evaluates gates', () => {
    const graph = g(
      [
        { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 100 } },
        { id: 'gate', type: 4, label: 'Gate', position: at, data: { variable: 'gold', operator: 0, value: 50 } },
      ],
      [],
    )
    const s = initState(graph)
    expect(s.gate_states['gate']).toBe(false)
    applyInitialOverrides(s, graph, { pool: 500 })
    expect(s.pools['pool'].amount).toBe(100)
    expect(s.gate_states['gate']).toBe(true)
  })
})
