// UpgradeReportPanel.tsx — after a run: level reached by each Upgrade, cost
// and payback of the next level, and pacing warnings (price walls, stalls,
// levels that never pay off). Analysis lives in core/UpgradeReport.ts.

import { useMemo } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { NodeType } from '../../types/graph'
import { analyzeUpgrades } from '../../core/UpgradeReport'
import { formatDuration, formatNumber } from '../../core/formatNumber'

export function UpgradeReportPanel() {
  const graph = useGraphStore((s) => s.graph)
  const reportA = useSimulationStore((s) => s.reportA)
  const hasUpgrades = graph.nodes.some((n) => n.type === NodeType.UPGRADE)

  const insights = useMemo(() => {
    if (!reportA || !hasUpgrades) return null
    try { return analyzeUpgrades(graph, reportA) } catch { return null }
    // Přepočítat jen po novém běhu — úpravy grafu mezi běhy by míchaly
    // výsledek starého běhu s novými parametry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportA, hasUpgrades])

  if (!hasUpgrades) return null

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Upgrades — pacing and payback</h3>
      {!insights ? (
        <p className="text-[11px] text-muted">Run the simulation to see how far each Upgrade gets and when its next level pays off.</p>
      ) : (
        <>
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="py-1 pr-2 font-normal">Upgrade</th>
                <th className="py-1 pr-2 font-normal">Level</th>
                <th className="py-1 pr-2 font-normal">Last bought</th>
                <th className="py-1 pr-2 font-normal">Next level costs</th>
                <th className="py-1 pr-2 font-normal" title="Next level's cost ÷ the extra production of the same currency it adds">
                  Pays back in ≈
                </th>
              </tr>
            </thead>
            <tbody>
              {insights.map((u) => (
                <tr key={u.id} className="border-b border-border/30 align-top">
                  <td className="py-1 pr-2 text-white">{u.label}</td>
                  <td className="py-1 pr-2 font-mono">
                    {u.level}{u.max_level > 0 ? ` / ${u.max_level}` : ''}
                  </td>
                  <td className="py-1 pr-2 font-mono">{u.last_bought < 0 ? <span className="text-muted">never</span> : formatDuration(u.last_bought)}</td>
                  <td className="py-1 pr-2 font-mono">
                    {u.maxed ? <span className="text-success">max level</span> : `${formatNumber(u.next_cost ?? 0)} ${u.resource}`}
                  </td>
                  <td className="py-1 pr-2 font-mono">
                    {u.maxed ? '—'
                      : u.payback_seconds !== null ? formatDuration(u.payback_seconds)
                        : <span className="text-muted" title={u.extra_per_second === null ? `Boosts something other than ${u.resource} production (e.g. pool capacity or another resource)` : 'Adds no production'}>
                            {u.extra_per_second === null ? 'n/a' : 'never'}
                          </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {insights.some((u) => u.notes.length > 0) && (
            <ul className="mt-3 flex flex-col gap-1 text-[11px]">
              {insights.flatMap((u) => u.notes.map((n, i) => (
                <li key={`${u.id}-${i}`} className={n.severity === 'warning' ? 'text-warning' : 'text-white/70'}>
                  {n.severity === 'warning' ? '⚠' : 'ℹ'} <span className="text-white">{u.label}:</span> {n.message}
                </li>
              )))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
