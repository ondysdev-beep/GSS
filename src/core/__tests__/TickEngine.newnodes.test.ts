// TickEngine.newnodes.test.ts — pokrývá 3 nové typy uzlů: Timer, Formula,
// Player Action. Nezávislé na existujících TickEngine testech, takže je
// vidět, že staré grafy (bez těchto typů) se nezměnily (viz TickEngine.test.ts,
// beze změny výsledků po přidání této funkce).

import { describe, it, expect } from 'vitest'
import { createRNG } from '../SimRNG'
import { initState, simulateTick } from '../TickEngine'
import type { GSSGraph } from '../../types/graph'

function baseGraph(nodes: GSSGraph['nodes'], connections: GSSGraph['connections']): GSSGraph {
  return {
    version: '3.0',
    tick_spec_version: 1,
    name: 'New Node Test',
    description: '',
    created_at: '2024-01-01T00:00:00Z',
    modified_at: '2024-01-01T00:00:00Z',
    simulation_seed: 42,
    nodes,
    connections,
  }
}

describe('Timer node', () => {
  const graph = baseGraph(
    [
      { id: 'timer1', type: 8, label: 'Daily Reward', position: { x: 0, y: 0 }, data: { resource: 'Gold', amount: 100, interval: 5 } },
      { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 100000 } },
    ],
    [{ from_node: 'timer1', to_node: 'pool1', from_port: 0, to_port: 0 }],
  )

  it('does not fire before the interval elapses', () => {
    const rng = createRNG(1)
    let state = initState(graph)
    for (let i = 0; i < 4; i++) state = simulateTick(state, graph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(0)
  })

  it('fires exactly once per interval', () => {
    const rng = createRNG(1)
    let state = initState(graph)
    for (let i = 0; i < 5; i++) state = simulateTick(state, graph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(100)
    for (let i = 0; i < 5; i++) state = simulateTick(state, graph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(200)
  })

  it('handles delta larger than interval without losing pulses', () => {
    const rng = createRNG(1)
    let state = initState(graph)
    state = simulateTick(state, graph, 12.0, rng)  // 2 full intervals of 5s + remainder
    expect(state.pools['pool1'].amount).toBe(200)
  })

  it('regrese B2: extrémní dt + malý interval doběhne rychle a bezpečně místo zamrznutí', () => {
    // Přesně scénář z auditu: dt=100000, interval=0.001 — obojí validní
    // podle UI (dt min 0.01 bez horního limitu, interval min 0.001 bez
    // horního limitu), dřív to znamenalo 100 milionů iterací v jediném
    // simulateTick() volání (naměřeno ~1.6s zamrznutí).
    const extremeGraph = baseGraph(
      [
        { id: 'timer1', type: 8, label: 'Timer', position: { x: 0, y: 0 }, data: { resource: 'Gold', amount: 1, interval: 0.001 } },
        { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1e15 } },
      ],
      [{ from_node: 'timer1', to_node: 'pool1', from_port: 0, to_port: 0 }],
    )
    const rng = createRNG(1)
    let state = initState(extremeGraph)
    const start = Date.now()
    state = simulateTick(state, extremeGraph, 100_000, rng)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)          // dřív ~1600ms, teď capped
    expect(state.pools['pool1'].amount).toBe(10_000)  // MAX_TIMER_PULSES_PER_TICK
  })
})

describe('Formula node', () => {
  const graph = baseGraph(
    [
      { id: 'pool1', type: 0, label: 'Level Pool', position: { x: 0, y: 0 }, data: { resource: 'Level', capacity: 100000, initial_amount: 10 } },
      { id: 'formula1', type: 9, label: 'XP Gain', position: { x: 200, y: 0 }, data: { expression: 'Level * 1.2', output_resource: 'XP' } },
      { id: 'pool2', type: 0, label: 'XP Pool', position: { x: 400, y: 0 }, data: { resource: 'XP', capacity: 100000 } },
    ],
    [{ from_node: 'formula1', to_node: 'pool2', from_port: 0, to_port: 0 }],
  )

  it('produces output based on evaluated expression', () => {
    const rng = createRNG(1)
    let state = initState(graph)
    state = simulateTick(state, graph, 1.0, rng)
    expect(state.pools['pool2'].amount).toBeCloseTo(12, 5)  // 10 * 1.2
  })

  it('clamps negative results to 0 instead of draining a pool', () => {
    const negGraph = baseGraph(
      [{ id: 'formula1', type: 9, label: 'Negative', position: { x: 0, y: 0 }, data: { expression: '-5', output_resource: 'Gold' } },
       { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 100000, initial_amount: 50 } }],
      [{ from_node: 'formula1', to_node: 'pool1', from_port: 0, to_port: 0 }],
    )
    const rng = createRNG(1)
    let state = initState(negGraph)
    state = simulateTick(state, negGraph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(50)  // unchanged, not drained
  })

  it('an invalid expression produces 0 instead of crashing the simulation', () => {
    const badGraph = baseGraph(
      [{ id: 'formula1', type: 9, label: 'Broken', position: { x: 0, y: 0 }, data: { expression: '2 +', output_resource: 'Gold' } },
       { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 100000 } }],
      [{ from_node: 'formula1', to_node: 'pool1', from_port: 0, to_port: 0 }],
    )
    const rng = createRNG(1)
    let state = initState(badGraph)
    expect(() => simulateTick(state, badGraph, 1.0, rng)).not.toThrow()
    state = simulateTick(state, badGraph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(0)
  })

  it('regrese B5: více Formula uzlů ve stejném ticku počítá se sdílenými, konzistentními hodnotami', () => {
    // Ověřuje, že přesun výpočtu proměnných mimo per-uzel smyčku (oprava
    // výkonu B5) neposunul VÝSLEDEK — všechny formula uzly ve stejném ticku
    // musí i nadále vidět stejný `tick` a stejné resource totaly, ať už
    // referencují jakoukoli kombinaci resources.
    const multiGraph = baseGraph(
      [
        { id: 'pool1', type: 0, label: 'Level', position: { x: 0, y: 0 }, data: { resource: 'Level', capacity: 100000, initial_amount: 5 } },
        { id: 'formula1', type: 9, label: 'F1', position: { x: 200, y: 0 }, data: { expression: 'Level * 2', output_resource: 'A' } },
        { id: 'formula2', type: 9, label: 'F2', position: { x: 200, y: 100 }, data: { expression: 'Level * 3', output_resource: 'B' } },
        { id: 'formula3', type: 9, label: 'F3', position: { x: 200, y: 200 }, data: { expression: 'tick', output_resource: 'C' } },
        { id: 'poolA', type: 0, label: 'A', position: { x: 400, y: 0 }, data: { resource: 'A', capacity: 100000 } },
        { id: 'poolB', type: 0, label: 'B', position: { x: 400, y: 100 }, data: { resource: 'B', capacity: 100000 } },
        { id: 'poolC', type: 0, label: 'C', position: { x: 400, y: 200 }, data: { resource: 'C', capacity: 100000 } },
      ],
      [
        { from_node: 'formula1', to_node: 'poolA', from_port: 0, to_port: 0 },
        { from_node: 'formula2', to_node: 'poolB', from_port: 0, to_port: 0 },
        { from_node: 'formula3', to_node: 'poolC', from_port: 0, to_port: 0 },
      ],
    )
    const rng = createRNG(1)
    let state = initState(multiGraph)
    state = simulateTick(state, multiGraph, 1.0, rng)  // tick = 1
    expect(state.pools['poolA'].amount).toBeCloseTo(10, 5)  // Level(5) * 2
    expect(state.pools['poolB'].amount).toBeCloseTo(15, 5)  // Level(5) * 3
    expect(state.pools['poolC'].amount).toBeCloseTo(1, 5)   // tick(1)
  })
})

describe('Player Action node', () => {
  const graph = baseGraph(
    [
      { id: 'action1', type: 10, label: 'Gather', position: { x: 0, y: 0 }, data: { resource: 'Wood', amount: 10, cadence: 3 } },
      { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Wood', capacity: 100000 } },
    ],
    [{ from_node: 'action1', to_node: 'pool1', from_port: 0, to_port: 0 }],
  )

  it('is deterministic for a given seed', () => {
    const run = () => {
      const rng = createRNG(99)
      let state = initState(graph)
      for (let i = 0; i < 50; i++) state = simulateTick(state, graph, 1.0, rng)
      return state.pools['pool1'].amount
    }
    expect(run()).toBe(run())
  })

  it('produces amounts that are always multiples of the configured amount', () => {
    const rng = createRNG(5)
    let state = initState(graph)
    for (let i = 0; i < 100; i++) state = simulateTick(state, graph, 1.0, rng)
    expect(state.pools['pool1'].amount % 10).toBeCloseTo(0, 5)
  })

  it('never fires with cadence effectively infinite (fireChance ≈ 0)', () => {
    const rareGraph = baseGraph(
      [{ id: 'action1', type: 10, label: 'Rare', position: { x: 0, y: 0 }, data: { resource: 'Wood', amount: 10, cadence: 1_000_000 } },
       { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Wood', capacity: 100000 } }],
      [{ from_node: 'action1', to_node: 'pool1', from_port: 0, to_port: 0 }],
    )
    const rng = createRNG(1)
    let state = initState(rareGraph)
    for (let i = 0; i < 20; i++) state = simulateTick(state, rareGraph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBe(0)
  })
})

describe('backward compatibility', () => {
  it('a graph without any new node types simulates identically to before', () => {
    // Regression guard: same fixture style as TickEngine.test.ts.
    const graph = baseGraph(
      [
        { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
        { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000 } },
      ],
      [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
    )
    const rng = createRNG(12345)
    let state = initState(graph)
    state = simulateTick(state, graph, 1.0, rng)
    expect(state.pools['pool1'].amount).toBeCloseTo(10, 5)
  })
})
