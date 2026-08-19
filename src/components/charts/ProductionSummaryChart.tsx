// ProductionSummaryChart — Total resource produced per pool (bar chart)

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useSimulationStore } from '../../store/simulationStore'

const BAR_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7',
  '#eab308', '#ef4444', '#06b6d4', '#ec4899',
]

export function ProductionSummaryChart() {
  const reportA = useSimulationStore((s) => s.reportA)

  if (!reportA) {
    return (
      <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
        Run the simulation to see the summary
      </div>
    )
  }

  const finalValues = reportA.summary.final_values
  const data = Object.entries(finalValues).map(([id, amount]) => ({
    name: id,
    amount: parseFloat(amount.toFixed(2)),
    fill_pct: 0,   // bez capacity info zde
  }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#6b7280', fontSize: 9 }}
          tickLine={false}
          interval={0}
        />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} width={40} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value: number, _name: string, props: { payload?: { fill_pct: number } }) => [
            `${value} (${props.payload?.fill_pct ?? 0}% full)`,
            'Amount',
          ]}
        />
        <Bar dataKey="amount" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((_entry, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
