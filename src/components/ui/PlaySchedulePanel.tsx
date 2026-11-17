// PlaySchedulePanel.tsx — how the player plays in real life (sessions per
// day, offline earnings) and how long the same game takes for a casual vs a
// hardcore player. The schedule is stored in the graph (.gss) and applies to
// every run; the comparison is computed on demand (several runs).

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useLicenseStore } from '../../store/licenseStore'
import { FREE_TIER_LIMITS } from '../../types/simulation'
import type { Milestone, PlaySchedule } from '../../types/graph'
import { NumericInput } from './NumericInput'
import { defaultPlaySchedule, describePlaySchedule, playsNonstop, DAY_SECONDS } from '../../core/PlaySchedule'
import { runPlaytimeComparison, type PlaytimeRun } from '../../core/PlaytimeComparison'
import { validate, hasErrors } from '../../core/GraphValidator'
import { formatDuration, formatNumber } from '../../core/formatNumber'

const inputCls = 'bg-bg border border-border rounded px-2 py-1 text-white text-xs w-full'
const PROFILE_COLORS = ['#a855f7', '#3b82f6', '#22c55e', '#f97316', '#9ca3af']

/** Run lengths that make sense for sessions, with a dt that keeps them fast. */
const RUN_LENGTHS: Array<{ label: string; days: number; dt: number }> = [
  { label: '1 day', days: 1, dt: 5 },
  { label: '7 days', days: 7, dt: 10 },
  { label: '30 days', days: 30, dt: 60 },
]

export function PlaySchedulePanel() {
  const graph = useGraphStore((s) => s.graph)
  const setPlaySchedule = useGraphStore((s) => s.setPlaySchedule)
  const scenario = useSimulationStore((s) => s.scenario)
  const setScenario = useSimulationStore((s) => s.setScenario)
  const isPro = useLicenseStore((s) => s.license?.isPro ?? false)
  const [runs, setRuns] = useState<PlaytimeRun[] | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const schedule = graph.play_schedule
  const duration = isPro ? scenario.duration : Math.min(scenario.duration, FREE_TIER_LIMITS.MAX_DURATION_SECONDS)

  function patch(p: Partial<PlaySchedule>, field: string) {
    if (!schedule) return
    setPlaySchedule({ ...schedule, ...p }, `play_schedule:${field}`)
  }

  async function compare() {
    if (running) return
    if (hasErrors(validate(graph))) {
      setError('Graph contains errors. Fix them (see Issues in the Editor tab) before running.')
      return
    }
    if (!isPro && graph.nodes.length > FREE_TIER_LIMITS.MAX_NODES) {
      setError(`Free tier: max ${FREE_TIER_LIMITS.MAX_NODES} nodes. Upgrade to GSS PRO for unlimited nodes.`)
      return
    }
    setRunning(true)
    await new Promise<void>((r) => setTimeout(r, 0))
    try {
      setRuns(runPlaytimeComparison(graph, { ...scenario, duration }))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRuns(null)
    } finally {
      setRunning(false)
    }
  }

  const milestones = graph.milestones ?? []
  const short = duration < DAY_SECONDS / 4

  return (
    <div className="bg-card rounded-lg border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-white/70 uppercase">Play sessions — real-life pacing</h3>
        <div className="flex rounded overflow-hidden border border-border text-[11px]">
          <button
            onClick={() => setPlaySchedule(undefined)}
            className={`px-2 py-1 ${!schedule ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
          >
            Plays nonstop
          </button>
          <button
            onClick={() => { if (!schedule) setPlaySchedule(defaultPlaySchedule()) }}
            className={`px-2 py-1 ${schedule ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
          >
            Plays in sessions
          </button>
        </div>
      </div>

      {!schedule ? (
        <p className="text-[11px] text-muted">
          Every run assumes the player never leaves the game. Switch to sessions to model real players: a few
          sessions a day, with the game earning a share of its income while they are away (offline earnings).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-muted">Sessions per day</span>
              <NumericInput className={inputCls} value={schedule.sessions_per_day} min={1} max={96} integer
                onCommit={(v) => patch({ sessions_per_day: v }, 'sessions')} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted">Minutes per session</span>
              <NumericInput className={inputCls} value={schedule.session_minutes} min={1} max={1440}
                onCommit={(v) => patch({ session_minutes: v }, 'minutes')} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted" title="Share of the automatic economy (production, converters, drains) that keeps running while the player is away. 0 % = the game stops.">
                Offline speed (%)
              </span>
              <NumericInput className={inputCls} value={schedule.offline_speed} min={0} max={100}
                onCommit={(v) => patch({ offline_speed: v }, 'speed')} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted" title="Offline earnings stop after this many hours away (0 = no limit).">
                Offline limit (h, 0 = none)
              </span>
              <NumericInput className={inputCls} value={schedule.offline_cap_hours} min={0} max={8760}
                onCommit={(v) => patch({ offline_cap_hours: v }, 'cap')} />
            </label>
          </div>
          <p className="text-[11px] text-white/70">
            The player {describePlaySchedule(schedule)}.
            {!playsNonstop(schedule) && (
              <> While away, the game runs at {formatNumber(schedule.offline_speed)} % speed
                {schedule.offline_cap_hours > 0 ? ` for at most ${formatNumber(schedule.offline_cap_hours)} h per break` : ''};
                Player Actions and Upgrade purchases wait for the next session.</>
            )}
          </p>
        </>
      )}

      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-muted">Run length {formatDuration(duration)}{short ? ' — sessions matter over days:' : ':'}</span>
        {RUN_LENGTHS.map((r) => (
          <button
            key={r.label}
            disabled={!isPro}
            title={isPro ? `Duration ${r.days} d, dt ${r.dt} s` : `FREE runs are limited to ${FREE_TIER_LIMITS.MAX_DURATION_SECONDS} s`}
            onClick={() => setScenario({
              duration: r.days * DAY_SECONDS,
              dt: Math.max(scenario.dt, r.dt),
              sampling_interval: Math.max(scenario.sampling_interval, (r.days * DAY_SECONDS) / 1000),
            })}
            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white/80 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {r.label}
          </button>
        ))}
        {!isPro && (
          <span className="text-warning">FREE runs stop at {FREE_TIER_LIMITS.MAX_DURATION_SECONDS} s, so sessions have no effect there.</span>
        )}
      </div>

      <div className="border-t border-border pt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-white/70">
            Player types by play time — the same game for 30 min a day vs 5 h a day
          </span>
          <button
            onClick={compare}
            disabled={running}
            className="px-3 py-1 text-[10px] bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors disabled:opacity-50"
          >
            {running ? '⏳ Running…' : runs ? '↺ Recompute' : '▶ Compare player types'}
          </button>
        </div>
        {error && <div className="text-[10px] text-danger">{error}</div>}
        {runs && <ComparisonResult runs={runs} milestones={milestones} />}
      </div>
    </div>
  )
}

function ComparisonResult({ runs, milestones }: { runs: PlaytimeRun[]; milestones: Milestone[] }) {
  const byTime = new Map<number, Record<string, number>>()
  runs.forEach((r, i) => {
    for (const f of r.wealth_series) {
      const row = byTime.get(f.time) ?? { time: f.time }
      row[`p${i}`] = f.wealth
      byTime.set(f.time, row)
    }
  })
  const data = [...byTime.values()].sort((a, b) => a.time - b.time)

  return (
    <>
      <table className="w-full text-[11px] text-left border-collapse">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="py-1 pr-3 font-normal">Player type</th>
            <th className="py-1 pr-3 font-normal">Played</th>
            {milestones.map((m) => (
              <th key={m.id} className="py-1 pr-3 font-normal">{m.label.trim() || `${formatNumber(m.value)} ${m.target}`}</th>
            ))}
            <th className="py-1 pr-3 font-normal text-right">Total at end</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={r.profile.id} className="border-b border-border/30">
              <td className="py-1 pr-3" style={{ color: PROFILE_COLORS[i % PROFILE_COLORS.length] }}>{r.profile.name}</td>
              <td className="py-1 pr-3 font-mono text-white/70">{formatDuration(r.played_time)}</td>
              {milestones.map((m) => {
                const t = r.milestone_times[m.id]
                const p = r.milestone_played_times[m.id]
                return (
                  <td key={m.id} className="py-1 pr-3 font-mono whitespace-nowrap">
                    {t === undefined ? <span className="text-muted">—</span>
                      : t < 0 ? <span className="text-warning">not reached</span>
                        : <span title="calendar time · time actually played">
                            {dayLabel(t)}
                            {p !== undefined && p >= 0 && p < t - 1e-6 && <span className="text-muted"> · {formatDuration(p)} played</span>}
                          </span>}
                  </td>
                )
              })}
              <td className="py-1 pr-3 font-mono text-right text-white">{formatNumber(r.final_wealth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {milestones.length === 0 && (
        <p className="text-[10px] text-muted">Add milestones (above) to see when each player type reaches them.</p>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false} tickFormatter={(t: number) => formatDuration(t)} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} width={48} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(v: number) => formatNumber(v)}
            labelFormatter={(t: number) => dayLabel(t)}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
          {runs.map((r, i) => (
            <Line key={r.profile.id} type="monotone" dataKey={`p${i}`} name={r.profile.name}
              stroke={PROFILE_COLORS[i % PROFILE_COLORS.length]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

/** "day 3 (2d 4h)" for multi-day runs (day 1 = the first 24 h), a plain duration otherwise. */
function dayLabel(seconds: number): string {
  if (seconds < DAY_SECONDS) return formatDuration(seconds)
  return `day ${Math.floor(seconds / DAY_SECONDS) + 1} (${formatDuration(seconds)})`
}
