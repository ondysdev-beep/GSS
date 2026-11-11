// WealthOverTimeChart — Pool amounts over time from simulation trace

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
import { useGraphStore } from '../../store/graphStore'
import { formatDuration, formatNumber } from '../../core/formatNumber'

const LINE_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7',
  '#eab308', '#ef4444', '#06b6d4', '#ec4899',
]

export function WealthOverTimeChart() {
  const reportA = useSimulationStore((s) => s.reportA)
  const milestones = useGraphStore((s) => s.graph.milestones)

  if (!reportA || reportA.time_series.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
        Run the simulation to see the trend
      </div>
    )
  }

  // Pool keys z prvního frame
  const poolKeys = Object.keys(reportA.time_series[0].pools)

  // Vzorkovat max 300 bodů
  const ts = reportA.time_series
  const step = Math.max(1, Math.floor(ts.length / 300))
  const data = ts
    .filter((_, i) => i % step === 0)
    .map((frame) => {
      const row: Record<string, number> = { time: frame.time }
      for (const key of poolKeys) {
        row[key] = parseFloat((frame.pools[key] ?? 0).toFixed(3))
      }
      return row
    })

  // Dosažené milníky jako svislé čáry (MilestonesPanel).
  const reached = (milestones ?? []).flatMap((m) => {
    const t = reportA.summary.milestone_times?.[m.id]
    return t !== undefined && t >= 0 ? [{ id: m.id, time: t, label: m.label.trim() || `${formatNumber(m.value)} ${m.target}` }] : []
  })

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        {/* Číselná osa: čára milníku musí sedět i na čas, který mezi vzorky grafu není. */}
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -4, fill: '#6b7280', fontSize: 10 }}
        />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} width={44} tickFormatter={(v: number) => formatNumber(v)} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(v: number) => formatNumber(v)}
          labelFormatter={(t: number) => formatDuration(t)}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
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
        {reached.map((m) => (
          <ReferenceLine key={m.id} x={m.time} stroke="#cbd5e1" strokeDasharray="3 3"
            label={{ value: `◆ ${m.label}`, position: 'insideTopLeft', fill: '#cbd5e1', fontSize: 9 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
