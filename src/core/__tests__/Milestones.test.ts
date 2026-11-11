// Milestones.test.ts — time-to-reach for resource totals and upgrade levels,
// in the main run, in persona runs, persistence and validation.

import { describe, it, expect } from 'vitest'
import { runScenario } from '../ScenarioRunner'
import { runAllPersonaSimulations } from '../PlayerPersona'
import { normalizeGraph } from '../GraphNormalizer'
import { validate } from '../GraphValidator'
import { stringifyGraph } from '../DeterministicJSON'
import { formatDuration } from '../formatNumber'
import type { GSSGraph, Milestone } from '../../types/graph'

const at = { x: 0, y: 0 }
const c = (from: string, to: string) => ({ from_node: from, to_node: to, from_port: 0, to_port: 0 })

function mine(milestones: Milestone[]): GSSGraph {
  return {
    version: '3.0', tick_spec_version: 2, name: 'm', description: '', created_at: '', modified_at: '', simulation_seed: 1,
    nodes: [
      { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
      { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e6 } },
      { id: 'vault', type: 0, label: 'Vault', position: at, data: { resource: 'gold', capacity: 1e6, initial_amount: 100 } },
      { id: 'pickaxe', type: 11, label: 'Pickaxe', position: at,
        data: { resource: 'gold', base_cost: 50, cost_growth: 2, bonus_per_level: 100, bonus_mode: 0, max_level: 0 } },
    ],
    connections: [c('mine', 'bank'), c('bank', 'pickaxe'), c('pickaxe', 'mine')],
    milestones,
  }
}

const sc = { duration: 30, dt: 1, sampling_interval: 10, seed_override: 1 }

describe('milestones in a run', () => {
  it('measures resource totals across all pools, exact to the tick (not the sampling interval)', () => {
    const r = runScenario(mine([{ id: 'a', label: '', kind: 'resource', target: 'gold', value: 130 }]), sc)
    // vault 100 + bank 10/tick → 130 at t = 3
    expect(r.summary.milestone_times).toEqual({ a: 3 })
  })
  it('measures upgrade levels and reports -1 when not reached', () => {
    const r = runScenario(mine([
      { id: 'lvl2', label: '', kind: 'upgrade', target: 'pickaxe', value: 2 },
      { id: 'huge', label: '', kind: 'resource', target: 'gold', value: 1e9 },
    ]), sc)
    expect(r.summary.milestone_times).toEqual({ lvl2: 10, huge: -1 })
  })
  it('a milestone already met at the start is reached at t = 0', () => {
    const r = runScenario(mine([{ id: 'z', label: '', kind: 'resource', target: 'gold', value: 50 }]), sc)
    expect(r.summary.milestone_times).toEqual({ z: 0 })
  })
  it('graphs without milestones keep the old summary shape', () => {
    expect(runScenario(mine([]), sc).summary.milestone_times).toBeUndefined()
  })
  it('persona runs report their own milestone times', () => {
    const results = runAllPersonaSimulations(mine([{ id: 'a', label: '', kind: 'resource', target: 'gold', value: 130 }]), { duration: 30, dt: 1, sampling_interval: 10 })
    for (const r of results) expect(r.milestone_times?.a).toBeGreaterThanOrEqual(0)
  })
})

describe('milestones in the file format', () => {
  it('survive save → load', () => {
    const g = mine([{ id: 'a', label: 'First 130', kind: 'resource', target: 'gold', value: 130 }])
    const back = normalizeGraph(JSON.parse(stringifyGraph(g)))
    expect(back.milestones).toEqual(g.milestones)
  })
  it('broken entries are repaired on load, not dropped silently into a crash', () => {
    const back = normalizeGraph({ nodes: [], milestones: [{ kind: 'weird', value: 'x' }, 'nope'] })
    expect(back.milestones).toEqual([{ id: 'milestone_1', label: '', kind: 'resource', target: '', value: 0 }])
  })
  it('warns about milestones that can never be reached', () => {
    const issues = validate(mine([
      { id: 'a', label: 'Typo', kind: 'resource', target: 'Gold', value: 10 },
      { id: 'b', label: '', kind: 'upgrade', target: 'deleted_node', value: 1 },
      { id: 'c', label: '', kind: 'resource', target: 'gold', value: 10 },
    ]))
    expect(issues.filter((i) => i.code === 'MILESTONE_TARGET')).toHaveLength(2)
  })
})

describe('formatDuration', () => {
  it('formats simulated time', () => {
    expect(formatDuration(3)).toBe('3s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(725)).toBe('12m 05s')
    expect(formatDuration(12000)).toBe('3h 20m')
    expect(formatDuration(190000)).toBe('2d 4h')
    expect(formatDuration(-1)).toBe('—')
  })
})
