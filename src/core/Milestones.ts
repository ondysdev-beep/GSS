// Milestones.ts — measures when a run reaches the graph's pacing goals
// ("1M gold", "Pickaxe level 10"). Checked after every tick, so the time is
// exact to one tick, not to the sampling interval of the time series.

import type { GSSGraph, Milestone } from '../types/graph'
import type { SimState } from '../types/simulation'

/** Time (simulated seconds) at which each milestone was reached; -1 = not reached. */
export type MilestoneTimes = Record<string, number>

/** Milestones of a graph that can actually be measured (sane kind, target and value). */
export function graphMilestones(graph: Pick<GSSGraph, 'milestones'>): Milestone[] {
  return (graph.milestones ?? []).filter((m) =>
    !!m && typeof m.id === 'string' && m.id !== '' &&
    (m.kind === 'resource' || m.kind === 'upgrade') &&
    typeof m.target === 'string' && m.target !== '' &&
    typeof m.value === 'number' && Number.isFinite(m.value))
}

export interface MilestoneTracker {
  /** Call with the state after every tick (and once with the initial state at t = 0). */
  /** `played` = seconds the player has actually played so far (defaults to `elapsed`). */
  update(state: SimState, elapsed: number, played?: number): void
  /** null when the graph has no milestones (reports keep their old shape). */
  result(): MilestoneTimes | null
  /** Play time (not calendar time) at which each milestone was reached; -1 = not reached. */
  playedResult(): MilestoneTimes | null
}

export function createMilestoneTracker(graph: Pick<GSSGraph, 'milestones'>): MilestoneTracker {
  const milestones = graphMilestones(graph)
  const times: MilestoneTimes = {}
  const playedTimes: MilestoneTimes = {}
  for (const m of milestones) { times[m.id] = -1; playedTimes[m.id] = -1 }
  let pending = milestones.length

  return {
    update(state, elapsed, played = elapsed) {
      if (pending === 0) return
      for (const m of milestones) {
        if (times[m.id] >= 0) continue
        if (currentValue(m, state) >= m.value) {
          times[m.id] = Math.round(elapsed * 1000) / 1000
          playedTimes[m.id] = Math.round(played * 1000) / 1000
          pending--
        }
      }
    },
    result() {
      return milestones.length > 0 ? { ...times } : null
    },
    playedResult() {
      return milestones.length > 0 ? { ...playedTimes } : null
    },
  }
}

function currentValue(m: Milestone, state: SimState): number {
  if (m.kind === 'upgrade') return state.upgrade_levels?.[m.target] ?? 0
  let total = 0
  for (const pool of Object.values(state.pools)) {
    if (pool.resource === m.target) total += pool.amount
  }
  return total
}
