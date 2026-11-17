// PlaySchedule.test.ts — play sessions and offline progress, the play-time
// comparison and the upgrade pacing report.

import { describe, it, expect } from 'vitest'
import { runScenario, MAX_TIME_SERIES_FRAMES } from '../ScenarioRunner'
import { runPersonaSimulation, presetGrinder } from '../PlayerPersona'
import { initState, simulateTick } from '../TickEngine'
import { createRNG } from '../SimRNG'
import { normalizeGraph } from '../GraphNormalizer'
import { stringifyGraph } from '../DeterministicJSON'
import {
  tickModeAt, playedSeconds, normalizePlaySchedule, playsNonstop, describePlaySchedule, DAY_SECONDS,
} from '../PlaySchedule'
import { runPlaytimeComparison, comparisonProfiles } from '../PlaytimeComparison'
import { analyzeUpgrades } from '../UpgradeReport'
import type { GSSGraph, PlaySchedule } from '../../types/graph'

const at = { x: 0, y: 0 }
const c = (from: string, to: string) => ({ from_node: from, to_node: to, from_port: 0, to_port: 0 })

function base(extra: Partial<GSSGraph> = {}): GSSGraph {
  return {
    version: '3.0', tick_spec_version: 2, name: 't', description: '', created_at: '', modified_at: '', simulation_seed: 1,
    nodes: [
      { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
      { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e12 } },
    ],
    connections: [c('mine', 'bank')],
    ...extra,
  }
}

// 4 slots of 6 h; 1 h session, then 5 h away; offline 50 % for at most 2 h.
const sched: PlaySchedule = { sessions_per_day: 4, session_minutes: 60, offline_speed: 50, offline_cap_hours: 2 }

describe('schedule math', () => {
  it('online during the session, offline speed during the break, frozen after the limit', () => {
    expect(tickModeAt(sched, 0)).toEqual({ online: true, speed: 1 })
    expect(tickModeAt(sched, 3599)).toEqual({ online: true, speed: 1 })
    expect(tickModeAt(sched, 3600)).toEqual({ online: false, speed: 0.5 })
    expect(tickModeAt(sched, 3600 + 2 * 3600 - 1)).toEqual({ online: false, speed: 0.5 })
    expect(tickModeAt(sched, 3600 + 2 * 3600)).toEqual({ online: false, speed: 0 })
    expect(tickModeAt(sched, 6 * 3600)).toEqual({ online: true, speed: 1 }) // next session
  })
  it('no schedule, or sessions that fill the day = always online', () => {
    expect(tickModeAt(undefined, 5000)).toEqual({ online: true, speed: 1 })
    const full = { ...sched, session_minutes: 6 * 60 }
    expect(playsNonstop(full)).toBe(true)
    expect(tickModeAt(full, 5 * 3600)).toEqual({ online: true, speed: 1 })
  })
  it('counts played time', () => {
    expect(playedSeconds(sched, 1800)).toBe(1800)
    expect(playedSeconds(sched, 5 * 3600)).toBe(3600)
    expect(playedSeconds(sched, DAY_SECONDS)).toBe(4 * 3600)
    expect(playedSeconds(undefined, 1234)).toBe(1234)
  })
  it('describes itself', () => {
    expect(describePlaySchedule(sched)).toBe('4 × 1 h a day (4 h total), away 5 h between sessions')
    expect(describePlaySchedule(undefined)).toBe('plays nonstop')
  })
})

describe('engine offline mode', () => {
  const rng = () => createRNG(1)
  it('automatic production runs at the offline speed; nothing at all after the limit', () => {
    const g = base()
    const s0 = initState(g)
    expect(simulateTick(s0, g, 1, rng(), { online: false, speed: 0.5 }).pools.bank.amount).toBe(5)
    const frozen = simulateTick(s0, g, 1, rng(), { online: false, speed: 0 })
    expect(frozen.pools.bank.amount).toBe(0)
    expect(frozen.tick).toBe(1)
    expect(simulateTick(s0, g, 1, rng()).pools.bank.amount).toBe(10)
  })
  it('Player Actions and Upgrade purchases wait for the player', () => {
    const g = base({
      nodes: [
        { id: 'click', type: 10, label: 'Click', position: at, data: { resource: 'gold', amount: 100, cadence: 0.5 } },
        { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e9, initial_amount: 1000 } },
        { id: 'up', type: 11, label: 'Up', position: at, data: { resource: 'gold', base_cost: 10, cost_growth: 2, bonus_per_level: 10, bonus_mode: 0, max_level: 0 } },
      ],
      connections: [c('click', 'bank'), c('bank', 'up'), c('up', 'click')],
    })
    const off = simulateTick(initState(g), g, 1, rng(), { online: false, speed: 1 })
    expect(off.pools.bank.amount).toBe(1000)
    expect(off.upgrade_levels?.up).toBe(0)
    const on = simulateTick(initState(g), g, 1, rng())
    expect(on.upgrade_levels?.up).toBeGreaterThan(0)
  })
})

describe('runs with a play schedule', () => {
  it('one day: 4 sessions of 1 h at full speed + 2 h × 50 % per break', () => {
    const r = runScenario(base({ play_schedule: sched }), { duration: DAY_SECONDS, dt: 60, sampling_interval: 3600 })
    // per slot: 3600 s × 10 + 7200 s × 5 = 72 000; 4 slots
    expect(r.summary.final_values.bank).toBeCloseTo(4 * 72_000, 6)
    expect(r.summary.played_time).toBe(4 * 3600)
  })
  it('milestones report calendar time and play time', () => {
    const g = base({
      play_schedule: { ...sched, offline_speed: 0 },
      milestones: [{ id: 'm', label: '', kind: 'resource', target: 'gold', value: 50_000 }],
    })
    const r = runScenario(g, { duration: DAY_SECONDS, dt: 60, sampling_interval: 3600 })
    // 36 000 per session → reached 1400 s into the 2nd session (6 h + 1400 s); 3600 + 1400 played
    expect(r.summary.milestone_times?.m).toBe(6 * 3600 + 1440)
    expect(r.summary.milestone_played_times?.m).toBe(3600 + 1440)
  })
  it('graphs without a schedule keep the old summary shape', () => {
    const r = runScenario(base(), { duration: 10, dt: 1 })
    expect(r.summary.played_time).toBeUndefined()
    expect(r.summary.milestone_played_times).toBeUndefined()
  })
  it('long runs never record more than MAX_TIME_SERIES_FRAMES frames', () => {
    const r = runScenario(base(), { duration: 200_000, dt: 10, sampling_interval: 1 })
    expect(r.time_series.length).toBeLessThanOrEqual(MAX_TIME_SERIES_FRAMES + 2)
  })
  it('personas only decide during sessions', () => {
    const g = base({ play_schedule: { ...sched, offline_speed: 100, offline_cap_hours: 0 } })
    g.nodes.push({ id: 'shop', type: 3, label: 'Shop', position: at, data: { resource: 'gold', rate: 0 } })
    g.connections.push(c('bank', 'shop'))
    const nonstop = runPersonaSimulation({ ...g, play_schedule: undefined }, presetGrinder(), { duration: DAY_SECONDS, dt: 60, sampling_interval: 3600, seed: 1 })
    const sessions = runPersonaSimulation(g, presetGrinder(), { duration: DAY_SECONDS, dt: 60, sampling_interval: 3600, seed: 1 })
    expect(sessions.purchase_count).toBeGreaterThan(0)
    expect(sessions.purchase_count).toBeLessThan(nonstop.purchase_count / 3)
  })
})

describe('file format', () => {
  it('the schedule survives save → load', () => {
    const g = base({ play_schedule: sched })
    expect(normalizeGraph(JSON.parse(stringifyGraph(g))).play_schedule).toEqual(sched)
  })
  it('broken values are repaired, garbage is dropped', () => {
    expect(normalizePlaySchedule({ sessions_per_day: 0, session_minutes: -5, offline_speed: 250, offline_cap_hours: 'x' }))
      .toEqual({ sessions_per_day: 1, session_minutes: 0, offline_speed: 100, offline_cap_hours: 8 })
    expect(normalizeGraph({ nodes: [], play_schedule: 'nope' }).play_schedule).toBeUndefined()
  })
})

describe('play-time comparison', () => {
  it('a casual player reaches a goal later in calendar time than a nonstop one', () => {
    const g = base({
      play_schedule: { ...sched, offline_speed: 0 },
      milestones: [{ id: 'm', label: '', kind: 'resource', target: 'gold', value: 100_000 }],
    })
    const runs = runPlaytimeComparison(g, { duration: 7 * DAY_SECONDS, dt: 60, sampling_interval: 3600 })
    const byId = Object.fromEntries(runs.map((r) => [r.profile.id, r]))
    expect(byId.nonstop.milestone_times.m).toBe(10_020) // 10 000 s, rounded up to the 60 s tick
    expect(byId.casual.milestone_times.m).toBeGreaterThan(DAY_SECONDS)
    // Offline 0 % → the same amount of play is needed either way.
    expect(byId.casual.milestone_played_times.m).toBe(10_020)
  })
  it("adds the graph's own schedule when it is not one of the presets", () => {
    expect(comparisonProfiles(base({ play_schedule: sched }))[0].id).toBe('graph')
    expect(comparisonProfiles(base()).map((p) => p.id)).toEqual(['casual', 'regular', 'hardcore', 'nonstop'])
  })
})

describe('upgrade report', () => {
  function idle(upgradeData: Record<string, unknown>, extra: Partial<GSSGraph> = {}): GSSGraph {
    return base({
      nodes: [
        { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 10 } },
        { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 1e12 } },
        { id: 'pick', type: 11, label: 'Pickaxe', position: at, data: { resource: 'gold', bonus_mode: 0, max_level: 0, ...upgradeData } as unknown as GSSGraph['nodes'][number]['data'] },
      ],
      connections: [c('mine', 'bank'), c('bank', 'pick'), c('pick', 'mine')],
      ...extra,
    })
  }
  it('estimates the payback of the next level', () => {
    const g = idle({ base_cost: 1e9, cost_growth: 2, bonus_per_level: 50 })
    const [u] = analyzeUpgrades(g, runScenario(g, { duration: 10, dt: 1 }))
    expect(u.level).toBe(0)
    expect(u.next_cost).toBe(1e9)
    expect(u.extra_per_second).toBe(5) // +50 % of 10/s
    expect(u.payback_seconds).toBe(2e8)
    expect(u.notes.map((n) => n.kind)).toEqual(['never_bought', 'slow_payback'])
  })
  it('flags a price wall', () => {
    // cost ×20 per level: each level takes far longer than the one before
    const g = idle({ base_cost: 10, cost_growth: 20, bonus_per_level: 10 })
    const [u] = analyzeUpgrades(g, runScenario(g, { duration: 3000, dt: 1 }))
    expect(u.notes.some((n) => n.kind === 'price_wall' || n.kind === 'stalled')).toBe(true)
  })
  it('a smooth curve has no wall, and sessions do not create false walls', () => {
    const g = idle({ base_cost: 10, cost_growth: 1.15, bonus_per_level: 25 })
    const nonstop = analyzeUpgrades(g, runScenario(g, { duration: 600, dt: 1 }))[0]
    expect(nonstop.notes.filter((n) => n.kind === 'price_wall')).toEqual([])
    const gs = { ...g, play_schedule: sched }
    const withSessions = analyzeUpgrades(gs, runScenario(gs, { duration: DAY_SECONDS, dt: 30 }))[0]
    expect(withSessions.notes.filter((n) => n.kind === 'price_wall')).toEqual([])
  })
  it('boosting pool capacity has no payback in the currency', () => {
    const g = idle({ base_cost: 1e9, cost_growth: 2, bonus_per_level: 50 }, {
      connections: [c('mine', 'bank'), c('bank', 'pick'), c('pick', 'bank')],
    })
    const [u] = analyzeUpgrades(g, runScenario(g, { duration: 10, dt: 1 }))
    expect(u.extra_per_second).toBeNull()
    expect(u.payback_seconds).toBeNull()
  })
})

describe('validator', () => {
  it('the upgrade loop (bank → upgrade → mine → bank) is not reported as a flow cycle', async () => {
    const { validate } = await import('../GraphValidator')
    const g = base({
      nodes: [
        { id: 'mine', type: 1, label: 'Mine', position: at, data: { resource: 'gold', rate: 1 } },
        { id: 'bank', type: 0, label: 'Bank', position: at, data: { resource: 'gold', capacity: 100 } },
        { id: 'up', type: 11, label: 'Up', position: at, data: { resource: 'gold', base_cost: 10, cost_growth: 1.2, bonus_per_level: 10, bonus_mode: 0, max_level: 0 } },
      ],
      connections: [c('mine', 'bank'), c('bank', 'up'), c('up', 'mine')],
    })
    expect(validate(g).filter((i) => i.code === 'CYCLE_DETECTED')).toEqual([])
  })
})
