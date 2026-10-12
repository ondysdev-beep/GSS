// ProductionSummaryChart — final amount in each pool (bar chart) with fill % of its capacity

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
import { useGraphStore } from '../../store/graphStore'

const BAR_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7',
  '#eab308', '#ef4444', '#06b6d4', '#ec4899',
]

export function ProductionSummaryChart() {
  const reportA = useSimulationStore((s) => s.reportA)
  const nodes = useGraphStore((s) => s.graph.nodes)

  if (!reportA) {
    return (
      <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border text-muted text-sm">
        Run the simulation to see the summary
      </div>
    )
  }

  const finalValues = reportA.summary.final_values
  // Kapacita z grafu — dřív bylo fill_pct natvrdo 0 a tooltip vždy psal "0% full".
  const capacityOf = (id: string): number | null => {
    const cap = (nodes.find((n) => n.id === id)?.data as { capacity?: unknown } | undefined)?.capacity
    return typeof cap === 'number' && cap > 0 ? cap : null
  }
  const data = Object.entries(finalValues).map(([id, amount]) => {
    const cap = capacityOf(id)
    return {
      name: id,
      amount: parseFloat(amount.toFixed(2)),
      fill_pct: cap ? Math.round((amount / cap) * 100) : null,
    }
  })

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
          formatter={(value: number, _name: string, props: { payload?: { fill_pct: number | null } }) => [
            props.payload?.fill_pct != null ? `${value} (${props.payload.fill_pct}% of capacity)` : `${value}`,
            'Final amount',
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
