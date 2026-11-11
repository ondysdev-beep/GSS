// MultiPersonaChart.tsx — Multi-Persona Dashboard (Fáze 2 nových funkcí).
//
// Zobrazuje wealth-over-time pro Casual/Grinder/Min-Maxer persony najednou
// pomocí `runAllPersonaSimulations` (PlayerPersona.ts). Počítá se na
// vyžádání (tlačítko), ne automaticky při každém renderu — simulace pro
// 3 persony je dražší než jedna a nemá smysl ji spouštět, dokud si to
// uživatel nevyžádá, stejně jako ostatní režimy v SimulationDashboard.

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { runAllPersonaSimulations, type PersonaRunResult } from '../../core/PlayerPersona'
import { formatDuration, formatNumber } from '../../core/formatNumber'
import { validate, hasErrors } from '../../core/GraphValidator'
import { useLicenseStore } from '../../store/licenseStore'
import { FREE_TIER_LIMITS } from '../../types/simulation'

const PERSONA_COLORS: Record<string, string> = {
  Casual: '#3b82f6',
  Grinder: '#f97316',
  'Min-Maxer': '#ef4444',
}

export function MultiPersonaChart() {
  const graph = useGraphStore((s) => s.graph)
  const scenario = useSimulationStore((s) => s.scenario)
  const [results, setResults] = useState<PersonaRunResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const isPro = useLicenseStore((s) => s.license?.isPro ?? false)

  async function run() {
    if (running) return
    // Stejná pravidla jako hlavní běh (useSimulation): validní graf a limity
    // FREE verze — dřív je tenhle panel obcházel.
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
      const r = runAllPersonaSimulations(graph, {
        duration: isPro ? scenario.duration : Math.min(scenario.duration, FREE_TIER_LIMITS.MAX_DURATION_SECONDS),
        dt: scenario.dt,
        sampling_interval: scenario.sampling_interval,
        seed: scenario.seed_override > 0 ? scenario.seed_override : undefined,
      })
      setResults(r)
      setError(null)
    } catch (err) {
      setError(`Failed to run simulation: ${err instanceof Error ? err.message : String(err)}`)
      setResults(null)
    } finally {
      setRunning(false)
    }
  }

  const chartData = results
    ? mergeTimeSeries(results)
    : []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          onClick={run}
          disabled={running}
          className="px-3 py-1 text-[10px] bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors disabled:opacity-50"
        >
          {running ? '⏳ Running…' : results ? '↺ Recompute' : '▶ Run persona simulation'}
        </button>
        {results && (
          <div className="flex gap-3 text-[10px]">
            {results.map((r) => (
              <span key={r.persona.name} style={{ color: PERSONA_COLORS[r.persona.name] }}>
                {r.persona.name}: {r.purchase_count} purchases, spent {formatNumber(r.total_spent)}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="text-[10px] text-danger">{error}</div>}

      {!results ? (
        <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
          Run the simulation to compare how different types of players experience the same economy
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} width={44} tickFormatter={(v: number) => formatNumber(v)} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(v: number) => formatNumber(v)}
              labelFormatter={(t: number) => formatDuration(t)}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            {results.map((r) => (
              <Line
                key={r.persona.name}
                type="monotone"
                dataKey={r.persona.name}
                stroke={PERSONA_COLORS[r.persona.name] ?? '#9ca3af'}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Milníky po personách — kdo se ke kterému cíli dostane kdy */}
      {results && results.some((r) => r.milestone_times) && (graph.milestones ?? []).length > 0 && (
        <table className="w-full text-[11px] text-left border-collapse mt-1">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="py-1 pr-3 font-normal">Milestone</th>
              {results.map((r) => (
                <th key={r.persona.name} className="py-1 pr-3 font-normal" style={{ color: PERSONA_COLORS[r.persona.name] }}>{r.persona.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(graph.milestones ?? []).map((m) => (
              <tr key={m.id} className="border-b border-border/30">
                <td className="py-1 pr-3 text-white/80">{m.label.trim() || `${formatNumber(m.value)} ${m.target}`}</td>
                {results.map((r) => {
                  const t = r.milestone_times?.[m.id]
                  return (
                    <td key={r.persona.name} className="py-1 pr-3 font-mono">
                      {t === undefined ? <span className="text-muted">—</span>
                        : t < 0 ? <span className="text-warning">not reached</span>
                          : formatDuration(t)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Sloučí time_series z více PersonaRunResult do jedné sady řádků pro recharts. */
function mergeTimeSeries(results: PersonaRunResult[]): Record<string, number>[] {
  const byTime = new Map<number, Record<string, number>>()
  for (const r of results) {
    for (const frame of r.time_series) {
      const row = byTime.get(frame.time) ?? { time: frame.time }
      row[r.persona.name] = frame.total_wealth
      byTime.set(frame.time, row)
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}
