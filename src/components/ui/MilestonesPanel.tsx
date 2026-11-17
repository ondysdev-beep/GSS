// MilestonesPanel.tsx — pacing goals of the graph ("1M gold", "Pickaxe level
// 10") and when the last run reached them. Milestones are stored in the graph
// (.gss), measured by ScenarioRunner every tick (core/Milestones.ts).

import { useMemo } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { NodeType } from '../../types/graph'
import type { Milestone } from '../../types/graph'
import { NumericInput } from './NumericInput'
import { formatDuration, formatNumber } from '../../core/formatNumber'

const inputCls = 'bg-bg border border-border rounded px-2 py-1 text-white text-xs'

let _milestoneCounter = 0

export function MilestonesPanel() {
  const graph = useGraphStore((s) => s.graph)
  const setMilestones = useGraphStore((s) => s.setMilestones)
  const reportA = useSimulationStore((s) => s.reportA)
  const milestones = useMemo(() => graph.milestones ?? [], [graph.milestones])

  const resources = useMemo(() => {
    const names = new Set<string>()
    for (const n of graph.nodes) {
      const r = (n.data as unknown as Record<string, unknown> | undefined)?.resource
      if (n.type === NodeType.POOL && typeof r === 'string' && r) names.add(r)
    }
    return [...names].sort()
  }, [graph.nodes])
  const upgrades = useMemo(() => graph.nodes.filter((n) => n.type === NodeType.UPGRADE), [graph.nodes])

  function update(id: string, patch: Partial<Milestone>, field: string) {
    setMilestones(milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)), `milestone:${id}:${field}`)
  }

  function add() {
    _milestoneCounter++
    const m: Milestone = upgrades.length > 0 && resources.length === 0
      ? { id: `ms_${Date.now()}_${_milestoneCounter}`, label: '', kind: 'upgrade', target: upgrades[0].id, value: 10 }
      : { id: `ms_${Date.now()}_${_milestoneCounter}`, label: '', kind: 'resource', target: resources[0] ?? 'Gold', value: 1000 }
    setMilestones([...milestones, m])
  }

  function remove(id: string) {
    setMilestones(milestones.filter((m) => m.id !== id))
  }

  const times = reportA?.summary.milestone_times
  const played = reportA?.summary.milestone_played_times
  const runDuration = reportA?.summary.elapsed ?? 0

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white/70 uppercase">Milestones — time to reach</h3>
        <button
          onClick={add}
          className="px-2 py-1 text-[10px] bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors"
        >
          + Add milestone
        </button>
      </div>

      {milestones.length === 0 ? (
        <p className="text-[11px] text-muted">
          Add a pacing goal, such as "1000 Gold in total" or "Pickaxe level 10", to see when the player reaches it.
          Milestones are saved with the graph.
        </p>
      ) : (
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="py-1 pr-2 font-normal">Name</th>
              <th className="py-1 pr-2 font-normal">Goal</th>
              <th className="py-1 pr-2 font-normal">Target</th>
              <th className="py-1 pr-2 font-normal">Reaches</th>
              <th className="py-1 pr-2 font-normal">Reached at</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => {
              const t = times?.[m.id]
              return (
                <tr key={m.id} className="border-b border-border/30">
                  <td className="py-1 pr-2">
                    <input className={`${inputCls} w-full`} value={m.label} placeholder="e.g. First million"
                      onChange={(e) => update(m.id, { label: e.target.value }, 'label')} />
                  </td>
                  <td className="py-1 pr-2">
                    <select className={inputCls} value={m.kind}
                      onChange={(e) => {
                        const kind = e.target.value === 'upgrade' ? 'upgrade' : 'resource'
                        const target = kind === 'upgrade' ? upgrades[0]?.id ?? '' : resources[0] ?? ''
                        update(m.id, { kind, target }, 'kind')
                      }}>
                      <option value="resource">Resource total</option>
                      <option value="upgrade">Upgrade level</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    {m.kind === 'upgrade' ? (
                      <select className={inputCls} value={m.target} onChange={(e) => update(m.id, { target: e.target.value }, 'target')}>
                        {!upgrades.some((u) => u.id === m.target) && <option value={m.target}>(missing)</option>}
                        {upgrades.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                      </select>
                    ) : (
                      <input className={inputCls} value={m.target} list="gss-milestone-resources"
                        onChange={(e) => update(m.id, { target: e.target.value }, 'target')} />
                    )}
                  </td>
                  <td className="py-1 pr-2 w-28">
                    <NumericInput className={`${inputCls} w-full`} value={m.value} min={0}
                      integer={m.kind === 'upgrade'} onCommit={(v) => update(m.id, { value: v }, 'value')} />
                  </td>
                  <td className="py-1 pr-2 font-mono whitespace-nowrap">
                    {t === undefined ? <span className="text-muted">run again</span>
                      : t < 0 ? <span className="text-warning">not in {formatDuration(runDuration)}</span>
                        : <span className="text-white" title={`${formatNumber(t)} s`}>
                            {formatDuration(t)}
                            {played?.[m.id] !== undefined && played[m.id] >= 0 && played[m.id] < t - 1e-6 && (
                              <span className="text-muted" title="Time the player actually played (play sessions)"> · {formatDuration(played[m.id])} played</span>
                            )}
                          </span>}
                  </td>
                  <td className="py-1 text-right">
                    <button onClick={() => remove(m.id)} title="Remove milestone"
                      className="text-muted hover:text-danger px-1">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <datalist id="gss-milestone-resources">
        {resources.map((r) => <option key={r} value={r} />)}
      </datalist>
    </div>
  )
}
