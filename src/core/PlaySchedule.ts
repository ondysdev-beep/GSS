// PlaySchedule.ts — real-life play pattern: the player plays a few sessions a
// day, and while they are away the game keeps running at the offline speed
// (idle games usually pay a fraction of online earnings, up to a limit).
//
// The day is split evenly into `sessions_per_day` slots; each slot starts with
// a session of `session_minutes`, the rest of the slot is the break. Whether a
// tick is online is decided by the time at its start.

import type { GSSGraph, PlaySchedule } from '../types/graph'
import type { TickMode } from './TickEngine'

export const DAY_SECONDS = 86_400

export const ONLINE: TickMode = { online: true, speed: 1 }

export function defaultPlaySchedule(): PlaySchedule {
  return { sessions_per_day: 3, session_minutes: 20, offline_speed: 50, offline_cap_hours: 8 }
}

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Repairs a schedule from a file (or returns undefined when it is unusable). */
export function normalizePlaySchedule(raw: unknown): PlaySchedule | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const d = defaultPlaySchedule()
  return {
    sessions_per_day: Math.min(Math.max(Math.round(finite(r.sessions_per_day) ?? d.sessions_per_day), 1), 96),
    session_minutes: Math.min(Math.max(finite(r.session_minutes) ?? d.session_minutes, 0), 24 * 60),
    offline_speed: Math.min(Math.max(finite(r.offline_speed) ?? d.offline_speed, 0), 100),
    offline_cap_hours: Math.max(finite(r.offline_cap_hours) ?? d.offline_cap_hours, 0),
  }
}

/** Length of one slot (session + break) in seconds. */
function slotSeconds(s: PlaySchedule): number {
  return DAY_SECONDS / Math.max(1, Math.round(s.sessions_per_day))
}

function sessionSeconds(s: PlaySchedule): number {
  return Math.max(0, s.session_minutes) * 60
}

/** True when the sessions fill the whole day (= the player never leaves). */
export function playsNonstop(s: PlaySchedule): boolean {
  return sessionSeconds(s) >= slotSeconds(s) - 1e-9
}

/** Online/offline mode of the tick that starts at `time` (simulated seconds). */
export function tickModeAt(s: PlaySchedule | undefined, time: number): TickMode {
  if (!s || playsNonstop(s)) return ONLINE
  const slot = slotSeconds(s)
  const session = sessionSeconds(s)
  const inSlot = ((time % slot) + slot) % slot
  if (inSlot < session - 1e-9) return ONLINE
  const away = inSlot - session
  const cap = Math.max(0, s.offline_cap_hours) * 3600
  if (cap > 0 && away >= cap - 1e-9) return { online: false, speed: 0 }
  return { online: false, speed: Math.min(Math.max(s.offline_speed, 0), 100) / 100 }
}

/** Seconds the player has actually played in [0, time]. */
export function playedSeconds(s: PlaySchedule | undefined, time: number): number {
  if (time <= 0) return 0
  if (!s || playsNonstop(s)) return time
  const slot = slotSeconds(s)
  const session = sessionSeconds(s)
  return Math.floor(time / slot) * session + Math.min(time % slot, session)
}

/** Minutes of play per day. */
export function dailyMinutes(s: PlaySchedule): number {
  return playsNonstop(s) ? 24 * 60 : Math.round(s.sessions_per_day) * s.session_minutes
}

/** "3 × 20 min a day (1h), away 7h 40m between sessions" — for UI summaries. */
export function describePlaySchedule(s: PlaySchedule | undefined): string {
  if (!s || playsNonstop(s)) return 'plays nonstop'
  const n = Math.round(s.sessions_per_day)
  const awayMin = Math.round((slotSeconds(s) - sessionSeconds(s)) / 60)
  return `${n} × ${formatMinutes(s.session_minutes)} a day (${formatMinutes(dailyMinutes(s))} total), away ${formatMinutes(awayMin)} between sessions`
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// ==================== Play-time profiles ====================

/** A player type defined by how long they play per day. `schedule: null` = nonstop. */
export interface PlaytimeProfile {
  id: string
  name: string
  sessions_per_day: number
  session_minutes: number
}

/** Built-in player types for the play-time comparison. */
export const PLAYTIME_PROFILES: PlaytimeProfile[] = [
  { id: 'casual', name: 'Casual — 30 min a day', sessions_per_day: 2, session_minutes: 15 },
  { id: 'regular', name: 'Regular — 1 h a day', sessions_per_day: 3, session_minutes: 20 },
  { id: 'hardcore', name: 'Hardcore — 5 h a day', sessions_per_day: 5, session_minutes: 60 },
  { id: 'nonstop', name: 'Nonstop (no breaks)', sessions_per_day: 1, session_minutes: 24 * 60 },
]

/**
 * The graph with the profile's play time. Offline speed and limit are a
 * property of the game, so they come from the graph's own schedule (or the
 * defaults when the graph has none).
 */
export function graphWithProfile(graph: GSSGraph, profile: PlaytimeProfile): GSSGraph {
  const base = graph.play_schedule ?? defaultPlaySchedule()
  return {
    ...graph,
    play_schedule: {
      ...base,
      sessions_per_day: profile.sessions_per_day,
      session_minutes: profile.session_minutes,
    },
  }
}
