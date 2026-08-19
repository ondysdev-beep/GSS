// XPCurveChart — Pool fill % over time (0–100 scale, good for RPG progression curves)

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { useSimulationStore } from '../../store/simulationStore'

const LINE_COLORS = [
  '#a855f7', '#3b82f6', '#22c55e', '#f97316',
  '#eab308', '#ef4444', '#06b6d4', '#ec4899',
]

export function XPCurveChart() {
  const reportA = useSimulationStore((s) => s.reportA)

  if (!reportA || reportA.time_series.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
        Run the simulation to see the XP curves
      </div>
    )
  }

  const ts = reportA.time_series
  const poolKeys = Object.keys(ts[0].pools)
  const step = Math.max(1, Math.floor(ts.length / 300))

  // Normalizovat na % z max hodnoty pro každý pool (simulátor XP křivky)
  const maxVals: Record<string, number> = {}
  for (const key of poolKeys) {
    maxVals[key] = Math.max(...ts.map((f) => f.pools[key] ?? 0), 1)
  }

  const data = ts
    .filter((_, i) => i % step === 0)
    .map((frame) => {
      const row: Record<string, number> = { tick: frame.time }
      for (const key of poolKeys) {
        row[key] = parseFloat(((frame.pools[key] ?? 0) / maxVals[key] * 100).toFixed(1))
      }
      return row
    })

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        <XAxis
          dataKey="tick"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          width={36}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(v: number) => [`${v}%`, undefined]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
        <ReferenceLine y={100} stroke="#4b5563" strokeDasharray="4 4" />
        <ReferenceLine y={50} stroke="#374151" strokeDasharray="2 4" />
        {poolKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
