import { describe, it, expect } from 'vitest'
import { createRNG } from '../SimRNG'
import { initState, simulateTick, TICK_SPEC_VERSION } from '../TickEngine'
import type { GSSGraph } from '../../types/graph'

const MINIMAL_GRAPH: GSSGraph = {
  version: '3.0',
  tick_spec_version: 1,
  name: 'Test',
  description: '',
  created_at: '2024-01-01T00:00:00Z',
  modified_at: '2024-01-01T00:00:00Z',
  simulation_seed: 42,
  nodes: [
    {
      id: 'src1',
      type: 1,  // SOURCE
      label: 'Gold Source',
      position: { x: 0, y: 0 },
      data: { resource: 'Gold', rate: 10 },
    },
    {
      id: 'pool1',
      type: 0,  // POOL
      label: 'Gold Pool',
      position: { x: 200, y: 0 },
      data: { resource: 'Gold', capacity: 1000 },
    },
  ],
  connections: [
    { from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 },
  ],
}

describe('TickEngine', () => {
  it('TICK_SPEC_VERSION is 1', () => {
    expect(TICK_SPEC_VERSION).toBe(1)
  })

  it('initState creates empty pool with correct capacity', () => {
    const state = initState(MINIMAL_GRAPH)
    expect(state.pools['pool1']).toBeDefined()
    expect(state.pools['pool1'].amount).toBe(0)
    expect(state.pools['pool1'].capacity).toBe(1000)
    expect(state.pools['pool1'].resource).toBe('Gold')
  })

  it('Source → Pool: pool grows by rate per tick', () => {
    const rng = createRNG(12345)
    let state = initState(MINIMAL_GRAPH)
    state = simulateTick(state, MINIMAL_GRAPH, 1.0, rng)
    expect(state.pools['pool1'].amount).toBeCloseTo(10, 5)
  })

  it('Pool fills over multiple ticks', () => {
    const rng = createRNG(12345)
    let state = initState(MINIMAL_GRAPH)
    for (let i = 0; i < 5; i++) {
      state = simulateTick(state, MINIMAL_GRAPH, 1.0, rng)
    }
    expect(state.pools['pool1'].amount).toBeCloseTo(50, 5)
  })

  it('Pool does not exceed capacity', () => {
    const rng = createRNG(12345)
    let state = initState(MINIMAL_GRAPH)
    // 100 ticks × 10 rate = 1000, capacity is 1000
    for (let i = 0; i < 150; i++) {
      state = simulateTick(state, MINIMAL_GRAPH, 1.0, rng)
    }
    expect(state.pools['pool1'].amount).toBeLessThanOrEqual(1000)
    expect(state.pools['pool1'].amount).toBeCloseTo(1000, 5)
  })

  it('simulateTick is pure — does not mutate input state', () => {
    const rng = createRNG(12345)
    const state = initState(MINIMAL_GRAPH)
    const originalAmount = state.pools['pool1'].amount
    simulateTick(state, MINIMAL_GRAPH, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(originalAmount)
  })

  it('tick counter increments', () => {
    const rng = createRNG(12345)
    let state = initState(MINIMAL_GRAPH)
    expect(state.tick).toBe(0)
    state = simulateTick(state, MINIMAL_GRAPH, 1.0, rng)
    expect(state.tick).toBe(1)
    state = simulateTick(state, MINIMAL_GRAPH, 1.0, rng)
    expect(state.tick).toBe(2)
  })

  it('determinism: same seed, independent RNG instances = same result', () => {
    // Two fully independent createRNG() instances with the same seed must
    // produce identical results — this is the guarantee R-06 protects:
    // no shared/global RNG state that could let two simulations influence
    // each other (e.g. concurrent Monte Carlo runs).
    const rng1 = createRNG(42)
    let s1 = initState(MINIMAL_GRAPH)
    for (let i = 0; i < 10; i++) s1 = simulateTick(s1, MINIMAL_GRAPH, 1.0, rng1)

    const rng2 = createRNG(42)
    let s2 = initState(MINIMAL_GRAPH)
    for (let i = 0; i < 10; i++) s2 = simulateTick(s2, MINIMAL_GRAPH, 1.0, rng2)

    expect(s1.pools['pool1'].amount).toBe(s2.pools['pool1'].amount)
  })

  it('advancing one RNG instance does not affect a separate instance', () => {
    const rngA = createRNG(7)
    const rngB = createRNG(7)
    rngA.randf()
    rngA.randf()
    rngA.randf()
    // rngB was never advanced, so its first draw must equal rngA's first draw
    const freshExpected = createRNG(7).randf()
    expect(rngB.randf()).toBe(freshExpected)
  })
})
