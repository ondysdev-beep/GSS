import { describe, it, expect } from 'vitest'
import { runPersonaSimulation, runAllPersonaSimulations, presetCasual, presetGrinder, presetMinMaxer } from '../PlayerPersona'
import type { GSSGraph } from '../../types/graph'

// Zdroj -> Pool -> (Drain jako útratový cíl persony)
const GRAPH: GSSGraph = {
  version: '3.0',
  tick_spec_version: 1,
  name: 'Persona Test',
  description: '',
  created_at: '2024-01-01T00:00:00Z',
  modified_at: '2024-01-01T00:00:00Z',
  simulation_seed: 42,
  nodes: [
    { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 100000 } },
    { id: 'drain1', type: 3, label: 'Shop', position: { x: 400, y: 0 }, data: { resource: 'Gold', rate: 1 } },
  ],
  connections: [
    { from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 },
    { from_node: 'pool1', to_node: 'drain1', from_port: 0, to_port: 0 },
  ],
}

const SCENARIO = { duration: 60, dt: 1.0, sampling_interval: 5 }

describe('runPersonaSimulation', () => {
  it('produces a non-empty time series', () => {
    const result = runPersonaSimulation(GRAPH, presetCasual(), SCENARIO)
    expect(result.time_series.length).toBeGreaterThan(0)
    expect(result.time_series[result.time_series.length - 1].time).toBeLessThanOrEqual(60)
  })

  it('deterministic: same seed produces same result', () => {
    const r1 = runPersonaSimulation(GRAPH, presetGrinder(), { ...SCENARIO, seed: 7 })
    const r2 = runPersonaSimulation(GRAPH, presetGrinder(), { ...SCENARIO, seed: 7 })
    expect(r1.time_series).toEqual(r2.time_series)
    expect(r1.total_spent).toBe(r2.total_spent)
  })

  it('a more aggressive persona (Min-Maxer) spends at least as much as Casual', () => {
    const casual = runPersonaSimulation(GRAPH, presetCasual(), { ...SCENARIO, seed: 1 })
    const minMaxer = runPersonaSimulation(GRAPH, presetMinMaxer(), { ...SCENARIO, seed: 1 })
    expect(minMaxer.total_spent).toBeGreaterThanOrEqual(casual.total_spent)
  })

  it('does not mutate the input graph', () => {
    const before = JSON.stringify(GRAPH)
    runPersonaSimulation(GRAPH, presetGrinder(), SCENARIO)
    expect(JSON.stringify(GRAPH)).toBe(before)
  })
})

describe('runAllPersonaSimulations', () => {
  it('returns one result per preset (Casual, Grinder, Min-Maxer)', () => {
    const results = runAllPersonaSimulations(GRAPH, SCENARIO)
    expect(results).toHaveLength(3)
    expect(results.map((r) => r.persona.name)).toEqual(['Casual', 'Grinder', 'Min-Maxer'])
  })
})
