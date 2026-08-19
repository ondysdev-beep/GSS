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

  function run() {
    try {
      const r = runAllPersonaSimulations(graph, {
        duration: scenario.duration,
        dt: scenario.dt,
        sampling_interval: scenario.sampling_interval,
        seed: scenario.seed_override > 0 ? scenario.seed_override : undefined,
      })
      setResults(r)
      setError(null)
    } catch (err) {
      setError(`Failed to run simulation: ${err}`)
      setResults(null)
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
          className="px-3 py-1 text-[10px] bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors"
        >
          {results ? '↺ Recompute' : '▶ Run persona simulation'}
        </button>
        {results && (
          <div className="flex gap-3 text-[10px]">
            {results.map((r) => (
              <span key={r.persona.name} style={{ color: PERSONA_COLORS[r.persona.name] }}>
                {r.persona.name}: {r.purchase_count} purchases, spent {r.total_spent.toFixed(1)}
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
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
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
