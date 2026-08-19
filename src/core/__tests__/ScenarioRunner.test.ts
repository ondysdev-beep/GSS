import { describe, it, expect } from 'vitest'
import { runScenario } from '../ScenarioRunner'
import type { GSSGraph } from '../../types/graph'

const SIMPLE_GRAPH: GSSGraph = {
  version: '3.0',
  tick_spec_version: 1,
  name: 'Simple',
  description: '',
  created_at: '2024-01-01T00:00:00Z',
  modified_at: '2024-01-01T00:00:00Z',
  simulation_seed: 42,
  nodes: [
    { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 10000 } },
  ],
  connections: [
    { from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 },
  ],
}

describe('ScenarioRunner (Fix 1.7 — integer tick counting)', () => {
  it('should produce exact elapsed time with no floating-point drift', () => {
    const report = runScenario(SIMPLE_GRAPH, { duration: 10, dt: 0.1, seed_override: 42 })
    // 10 / 0.1 = 100 ticks exactly
    expect(report.summary.total_ticks).toBe(100)
    expect(report.summary.elapsed).toBe(10)
  })

  it('should produce correct pool amount with dt=0.1', () => {
    const report = runScenario(SIMPLE_GRAPH, { duration: 10, dt: 0.1, seed_override: 42 })
    // rate=10 * dt=0.1 * 100 ticks = 100
    expect(report.summary.final_values['pool1']).toBeCloseTo(100, 2)
  })

  it('should produce correct pool amount with dt=1.0', () => {
    const report = runScenario(SIMPLE_GRAPH, { duration: 60, dt: 1.0, seed_override: 42 })
    // rate=10 * 60 ticks = 600
    expect(report.summary.final_values['pool1']).toBeCloseTo(600, 2)
  })

  it('should be deterministic: same seed produces same results', () => {
    const r1 = runScenario(SIMPLE_GRAPH, { duration: 30, seed_override: 123 })
    const r2 = runScenario(SIMPLE_GRAPH, { duration: 30, seed_override: 123 })
    expect(r1.summary.final_values).toEqual(r2.summary.final_values)
    expect(r1.summary.total_ticks).toBe(r2.summary.total_ticks)
  })

  it('should use local RNG and not contaminate global SimRNG state (Fix 1.5)', () => {
    // Run two scenarios back-to-back with same seed — both should give identical results
    // even though they would contaminate global SimRNG if using the singleton
    const r1 = runScenario(SIMPLE_GRAPH, { duration: 30, seed_override: 42 })
    const r2 = runScenario(SIMPLE_GRAPH, { duration: 30, seed_override: 42 })
    expect(r1.summary.final_values['pool1']).toBe(r2.summary.final_values['pool1'])
  })

  it('should record time series at approximately correct intervals', () => {
    const report = runScenario(SIMPLE_GRAPH, {
      duration: 10,
      dt: 1.0,
      sampling_interval: 2.0,
      seed_override: 42,
    })
    const times = report.time_series.map((f) => f.time)
    // With sampling_interval=2 and dt=1, samples should be spaced ~2 apart
    expect(times.length).toBeGreaterThanOrEqual(4) // at least 4-5 samples in 10 ticks
    expect(times.length).toBeLessThanOrEqual(7)
    // Last sample should be at duration
    expect(times[times.length - 1]).toBe(10)
  })
})
