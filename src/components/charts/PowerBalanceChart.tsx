// PowerBalanceChart (PRO) — Radar chart of pool fill % at final tick

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useSimulationStore } from '../../store/simulationStore'

export function PowerBalanceChart() {
  const reportA = useSimulationStore((s) => s.reportA)

  if (!reportA) {
    return (
      <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
        Run the simulation to see the Power Balance
      </div>
    )
  }

  const finalValues = reportA.summary.final_values
  const maxVal = Math.max(...Object.values(finalValues), 1)
  const data = Object.entries(finalValues).map(([id, amount]) => ({
    subject: id,
    fill_pct: parseFloat((amount / maxVal * 100).toFixed(1)),
  }))

  if (data.length < 3) {
    return (
      <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
        Need at least 3 pools for power balance radar
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <RadarChart data={data}>
        <PolarGrid stroke="#2a2a3a" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
        <PolarRadiusAxis
          angle={30}
          domain={[0, 100]}
          tick={{ fill: '#6b7280', fontSize: 9 }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
          formatter={(v: number) => [`${v}%`, 'Fill']}
        />
        <Radar
          dataKey="fill_pct"
          stroke="#a855f7"
          fill="#a855f7"
          fillOpacity={0.25}
          isAnimationActive={false}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
