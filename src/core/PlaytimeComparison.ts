// PlaytimeComparison.ts — the same game played by player types who differ only
// in how long they play per day (30 min vs 5 h…). Answers "on which day does a
// casual player reach the first Drill?" — the offline speed and limit come from
// the graph's play schedule, the session pattern from each profile.

import type { GSSGraph } from '../types/graph'
import type { Scenario } from '../types/simulation'
import { runScenario } from './ScenarioRunner'
import { PLAYTIME_PROFILES, graphWithProfile, describePlaySchedule } from './PlaySchedule'
import type { PlaytimeProfile } from './PlaySchedule'

export interface PlaytimeRun {
  profile: PlaytimeProfile
  /** Calendar time each milestone was reached (-1 = not reached). */
  milestone_times: Record<string, number>
  /** Play time each milestone was reached (-1 = not reached). */
  milestone_played_times: Record<string, number>
  played_time: number
  elapsed: number
  /** Sum of all pools at the end of the run. */
  final_wealth: number
  wealth_series: Array<{ time: number; wealth: number }>
}

/** The built-in profiles, plus the graph's own schedule when it has one. */
export function comparisonProfiles(graph: GSSGraph): PlaytimeProfile[] {
  const s = graph.play_schedule
  if (!s) return PLAYTIME_PROFILES
  const same = PLAYTIME_PROFILES.some((p) =>
    p.sessions_per_day === Math.round(s.sessions_per_day) && p.session_minutes === s.session_minutes)
  if (same) return PLAYTIME_PROFILES
  return [
    { id: 'graph', name: `This game's schedule — ${describePlaySchedule(s).split(',')[0]}`, sessions_per_day: Math.round(s.sessions_per_day), session_minutes: s.session_minutes },
    ...PLAYTIME_PROFILES,
  ]
}

export function runPlaytimeComparison(
  graph: GSSGraph,
  scenario: Partial<Scenario>,
  profiles: PlaytimeProfile[] = comparisonProfiles(graph),
): PlaytimeRun[] {
  return profiles.map((profile) => {
    const report = runScenario(graphWithProfile(graph, profile), scenario)
    const s = report.summary
    return {
      profile,
      milestone_times: s.milestone_times ?? {},
      milestone_played_times: s.milestone_played_times ?? s.milestone_times ?? {},
      played_time: s.played_time ?? s.elapsed,
      elapsed: s.elapsed,
      final_wealth: Object.values(s.final_values).reduce((a, b) => a + b, 0),
      wealth_series: report.time_series.map((f) => ({
        time: f.time,
        wealth: Object.values(f.pools).reduce((a, b) => a + b, 0),
      })),
    }
  })
}
