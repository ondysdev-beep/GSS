// IntelligenceDashboard.tsx — Health Score, Verdict, Failure Detectors, Bottlenecks, Exploits, RNG
import { useMemo } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import { useGraphStore } from '../../store/graphStore'
import { useLicenseStore } from '../../store/licenseStore'
import { findBottlenecks } from '../../core/BottleneckAnalyzer'
import { generateRecommendations } from '../../core/RecommendationEngine'
import { discoverConversionLoops } from '../../core/ExploitDiscovery'
import type { VerdictState, HealthScore, CriticalFailure } from '../../types/simulation'

const VERDICT_COLORS: Record<VerdictState, string> = {
  SAFE:     'text-green-400  border-green-500/30  bg-green-500/10',
  CAUTION:  'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  UNSAFE:   'text-orange-400 border-orange-500/30 bg-orange-500/10',
  CRITICAL: 'text-red-400    border-red-500/30    bg-red-500/10',
}

const VERDICT_ICONS: Record<VerdictState, string> = {
  SAFE: '✅', CAUTION: '⚠️', UNSAFE: '🔶', CRITICAL: '🚨',
}

const HEALTH_FIELDS: { key: keyof Omit<HealthScore, 'total'>; label: string; weight: number }[] = [
  { key: 'stability',      label: 'Stability',        weight: 0.30 },
  { key: 'convergence',    label: 'Convergence',       weight: 0.25 },
  { key: 'fairness',       label: 'Fairness',          weight: 0.20 },
  { key: 'exploitability', label: 'Exploit Resistance',weight: 0.15 },
  { key: 'recovery',       label: 'Recovery',          weight: 0.10 },
]

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-border rounded-full overflow-hidden w-full">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function scoreColor(v: number) {
  if (v >= 75) return 'bg-green-500'
  if (v >= 50) return 'bg-yellow-500'
  if (v >= 25) return 'bg-orange-500'
  return 'bg-red-500'
}

export function IntelligenceDashboard() {
  const verdictReport = useSimulationStore((s) => s.verdictReport)
  const reportA       = useSimulationStore((s) => s.reportA)
  const graph         = useGraphStore((s) => s.graph)
  const isPro         = useLicenseStore((s) => s.license?.isPro ?? false)

  // Doporučení z RecommendationEngine
  const recommendations = useMemo(() => {
    if (!verdictReport) return []
    return generateRecommendations(verdictReport)
  }, [verdictReport])

  // Exploit Discovery — konverzní smyčky z grafu
  const exploitPaths = useMemo(() => {
    const converters = graph.nodes
      .filter((n) => n.type === 2)
      .map((n) => {
        const d = n.data as { input_resource: string; output_resource: string; input_amount: number; output_amount: number }
        return { id: n.id, input: d.input_resource ?? '', output: d.output_resource ?? '', input_amount: d.input_amount ?? 1, output_amount: d.output_amount ?? 1 }
      })
    const resources = [...new Set(graph.nodes.filter((n) => n.type === 0).map((n) => (n.data as { resource: string }).resource ?? n.id))]
    return discoverConversionLoops(converters, resources)
  }, [graph])

  // RNG Analysis z chance_stats simulace
  const rngAnalysis = useMemo(() => {
    if (!reportA) return null
    const entries = Object.entries(reportA.chance_stats)
    if (entries.length === 0) return null
    return entries.map(([id, stat]) => {
      const node = graph.nodes.find((n) => n.id === id)
      const expected = node ? ((node.data as { success_chance?: number }).success_chance ?? 50) : 50
      const actual = stat.total > 0 ? (stat.successes / stat.total) * 100 : 0
      const deviation = actual - expected
      const absDeviation = Math.abs(deviation)
      let fairness: 'ok' | 'warn' | 'bad' = 'ok'
      if (absDeviation > 15) fairness = 'bad'
      else if (absDeviation > 7) fairness = 'warn'
      const rageQuitRisk = actual < expected * 0.5 && stat.total > 20
      return { id, expected, actual, deviation, fairness, rageQuitRisk, total: stat.total, successes: stat.successes }
    })
  }, [reportA, graph])

  // Odvozené pool stavy z posledního framu time_series
  const bottleneckReport = useMemo(() => {
    if (!reportA || reportA.time_series.length === 0) return null
    const lastFrame = reportA.time_series[reportA.time_series.length - 1]
    const pools: Record<string, { amount: number; capacity: number }> = {}
    for (const [pid, amount] of Object.entries(lastFrame.pools)) {
      pools[pid] = { amount, capacity: reportA.summary.max_values[pid] ?? 0 }
    }
    const gateStates: Record<string, boolean> = lastFrame.gates
    return findBottlenecks(graph, pools, gateStates)
  }, [reportA, graph])

  if (!reportA) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        Run simulation to view the Intelligence report
      </div>
    )
  }

  if (!verdictReport) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        Loading Intelligence analysis…
      </div>
    )
  }

  const { verdict, health_score, failure_report, simulation_info } = verdictReport
  const vc = VERDICT_COLORS[verdict.state]

  return (
    <div className="flex flex-col gap-4">
      {/* Verdict + Health celkové */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Verdict box */}
        <div className={`rounded-lg border p-4 ${vc}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{VERDICT_ICONS[verdict.state]}</span>
            <span className="text-lg font-bold">{verdict.state}</span>
          </div>
          <div className="text-xs opacity-80 space-y-0.5">
            <div>Confidence: {(verdict.confidence_score * 100).toFixed(0)}%</div>
            <div>Coverage: {(verdict.sample_coverage * 100).toFixed(0)}%</div>
            <div>Cycles: {simulation_info.cycles} · Resources: {simulation_info.resources_tracked}</div>
          </div>
        </div>

        {/* Celkové health skóre */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-end justify-between mb-2">
            <span className="text-sm font-semibold text-white/80">Health Score</span>
            <span className={`text-2xl font-bold ${health_score.total >= 75 ? 'text-green-400' : health_score.total >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {health_score.total.toFixed(0)}
            </span>
          </div>
          <ScoreBar value={health_score.total} color={scoreColor(health_score.total)} />
        </div>
      </div>

      {/* PRO banner for free users */}
      {!isPro && (
        <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <span className="text-accent text-sm">⭐</span>
          <div className="flex-1">
            <p className="text-xs text-white/70 font-medium">Upgrade to GSS PRO for the full report</p>
            <p className="text-[10px] text-white/35">Sub-scores · Bottleneck analysis · Exploit detection · RNG psychology</p>
          </div>
          <a href="#" className="text-[10px] text-accent hover:underline whitespace-nowrap" onClick={(e) => { e.preventDefault(); document.dispatchEvent(new CustomEvent('gss:open-settings', { detail: 'license' })) }}>Upgrade →</a>
        </div>
      )}

      {/* 5 sub-skóre — PRO only */}
      {isPro && (
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3 text-white/80">Sub-scores</h3>
        <div className="space-y-3">
          {HEALTH_FIELDS.map(({ key, label, weight }) => {
            const val = health_score[key]
            return (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">{label}</span>
                  <span className="text-white/70">
                    {val.toFixed(0)}/100 <span className="text-muted">({(weight * 100).toFixed(0)} %)</span>
                  </span>
                </div>
                <ScoreBar value={val} color={scoreColor(val)} />
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* Failure Detectors — PRO only */}
      {failure_report.failures.length > 0 && isPro && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 text-white/80">
            Detected Failures ({failure_report.failures.length})
          </h3>
          <div className="space-y-2">
            {failure_report.failures.map((f: CriticalFailure, i) => (
              <div
                key={i}
                className={`rounded p-2 text-xs border ${
                  f.severity === 'CRITICAL'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                }`}
              >
                <span className="font-medium">[{f.type}]</span> {f.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {failure_report.failures.length === 0 && isPro && (
        <div className="bg-green-500/10 rounded-lg border border-green-500/30 p-3 text-green-400 text-xs">
          ✅ No critical failures detected
        </div>
      )}

      {/* Bottleneck Analyzer — PRO only */}
      {bottleneckReport && isPro && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 text-white/80">
            Bottleneck Analysis
            {bottleneckReport.bottlenecks.length > 0
              ? ` — ${bottleneckReport.bottlenecks.length} issue(s)`
              : ' — clean'}
          </h3>

          {bottleneckReport.bottlenecks.length === 0 ? (
            <div className="text-xs text-green-400">✅ No bottlenecks found</div>
          ) : (
            <div className="space-y-1.5">
              {bottleneckReport.bottlenecks.map((b, i) => (
                <div
                  key={i}
                  className={`rounded p-2 text-xs border ${
                    b.severity === 'high'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                  }`}
                >
                  <span className="font-medium uppercase">[{b.type.replace('_', ' ')}]</span> {b.reason}
                </div>
              ))}
            </div>
          )}

          {(bottleneckReport.empty_pools.length > 0 || bottleneckReport.saturated_pools.length > 0) && (
            <div className="mt-2 flex gap-3 text-[10px] text-muted">
              {bottleneckReport.empty_pools.length > 0 && (
                <span>🟥 Empty: {bottleneckReport.empty_pools.join(', ')}</span>
              )}
              {bottleneckReport.saturated_pools.length > 0 && (
                <span>🟧 Full: {bottleneckReport.saturated_pools.join(', ')}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Doporučení — PRO only */}
      {recommendations.length > 0 && isPro && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 text-white/80">
            Recommendations ({recommendations.length})
          </h3>
          <div className="space-y-2">
            {recommendations.map((r, i) => (
              <div key={i} className="rounded border border-border bg-bg p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-accent">{r.target_parameter}</span>
                  <span className="text-muted">+{r.expected_improvement.toFixed(0)} pts · {(r.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div className="text-white/70">
                  <span className="text-muted">Current:</span> {String(r.current_value)} →{' '}
                  <span className="text-green-400">{String(r.suggested_value)}</span>
                </div>
                {r.trade_off && (
                  <div className="text-muted mt-1 italic">{r.trade_off}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exploit Discovery — PRO only */}
      {isPro && <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3 text-white/80">
          Exploit Discovery
          {exploitPaths.length > 0 ? ` — ${exploitPaths.length} exploit(s) found` : ' — clean'}
        </h3>
        {exploitPaths.length === 0 ? (
          <div className="text-xs text-green-400">✅ No conversion loops found</div>
        ) : (
          <div className="space-y-2">
            {exploitPaths.map((e, i) => (
              <div key={i} className={`rounded p-2 text-xs border ${
                e.severity === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                e.severity === 'HIGH'     ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
                e.severity === 'MEDIUM'   ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                                            'bg-border border-border/60 text-muted'
              }`}>
                <div className="font-medium mb-0.5">[{e.severity}] {e.title}</div>
                <div className="opacity-80">{e.description}</div>
                <div className="mt-1 opacity-70">
                  Gain: <span className="font-mono">{e.gain_multiplier.toFixed(2)}x</span> /cycle
                   ·  after 10 cycles: <span className="font-mono">{e.projection_10_cycles.toFixed(0)}</span>
                   ·  Difficulty: {e.difficulty}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* RNG Psychology — PRO only */}
      {isPro && rngAnalysis && rngAnalysis.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 text-white/80">RNG Psychology</h3>
          <div className="space-y-2">
            {rngAnalysis.map((r) => (
              <div key={r.id} className="rounded border border-border bg-bg p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-white/80">{r.id}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                    r.fairness === 'ok'   ? 'bg-green-500/20 text-green-400' :
                    r.fairness === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                                           'bg-red-500/20 text-red-400'
                  }`}>
                    {r.fairness === 'ok' ? '✅ OK' : r.fairness === 'warn' ? '⚠ Deviation' : '🔴 Unfair'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-muted">
                  <div>Expected: <span className="text-white">{r.expected.toFixed(1)}%</span></div>
                  <div>Actual: <span className="text-white">{r.actual.toFixed(1)}%</span></div>
                  <div>Deviation: <span className={r.deviation > 0 ? 'text-green-400' : 'text-red-400'}>{r.deviation > 0 ? '+' : ''}{r.deviation.toFixed(1)}%</span></div>
                </div>
                <div className="mt-1.5 text-[10px] text-muted">{r.total} rolls · {r.successes} successes</div>
                {r.rageQuitRisk && (
                  <div className="mt-1.5 text-[10px] text-red-400 font-medium">🚨 Rage-quit risk: actual success rate is &lt;50% of expected</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-2">
            Tip: Deviation &gt;15% may be perceived as unfair. Consider a pity system when rage-quit risk is detected.
          </p>
        </div>
      )}

      {/* Chance statistiky — PRO only */}
      {isPro && Object.keys(reportA.chance_stats).length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 text-white/80">Chance Node Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(reportA.chance_stats).map(([id, stat]) => {
              const rate = stat.total > 0 ? (stat.successes / stat.total * 100).toFixed(1) : '–'
              return (
                <div key={id} className="rounded border border-border bg-bg p-2 text-xs">
                  <div className="text-muted truncate">{id}</div>
                  <div className="text-white font-medium">{rate}% success rate</div>
                  <div className="text-muted">{stat.total} total</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
