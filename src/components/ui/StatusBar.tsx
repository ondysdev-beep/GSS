// StatusBar.tsx — Persistent bottom bar: health score, verdict, graph metadata
import { useSimulationStore } from '../../store/simulationStore'
import { useGraphStore } from '../../store/graphStore'
import { useLicenseStore } from '../../store/licenseStore'

const VERDICT_STYLE = {
  SAFE:     'bg-green-500/20  text-green-400  border-green-500/40',
  CAUTION:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  UNSAFE:   'bg-orange-500/20 text-orange-400 border-orange-500/40',
  CRITICAL: 'bg-red-500/20    text-red-400    border-red-500/40',
} as const

const VERDICT_ICON = { SAFE: '✅', CAUTION: '⚠️', UNSAFE: '🔶', CRITICAL: '🚨' } as const

function HealthGauge({ value }: { value: number }) {
  const color = value >= 75 ? '#22c55e' : value >= 50 ? '#eab308' : value >= 25 ? '#f97316' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-mono text-[11px] font-semibold" style={{ color }}>{value.toFixed(0)}</span>
    </div>
  )
}

export function StatusBar() {
  const verdictReport = useSimulationStore((s) => s.verdictReport)
  const reportA       = useSimulationStore((s) => s.reportA)
  const isRunning     = useSimulationStore((s) => s.isRunning)
  const isDirty       = useGraphStore((s) => s.isDirty)
  const graph         = useGraphStore((s) => s.graph)
  const isPro         = useLicenseStore((s) => s.license?.isPro ?? false)

  const verdictState = verdictReport?.verdict.state
  const health        = verdictReport?.health_score.total ?? 0
  const nodeCount = graph.nodes.length
  const connCount = graph.connections.length

  return (
    <div className="flex items-center gap-4 px-4 h-7 bg-bg border-t border-border text-[11px] text-muted select-none shrink-0 overflow-hidden">

      {/* Stav simulace / verdict */}
      {isRunning ? (
        <span className="flex items-center gap-1.5 text-accent animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
          Running…
        </span>
      ) : verdictState ? (
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${VERDICT_STYLE[verdictState]}`}>
          {VERDICT_ICON[verdictState]} {verdictState}
        </span>
      ) : (
        <span className="text-white/20 italic">Not run</span>
      )}

      {/* Health score */}
      {verdictReport && (
        <>
          <div className="w-px h-3.5 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Health</span>
            <HealthGauge value={health} />
          </div>
        </>
      )}

      {/* Sub-scores (PRO only) */}
      {verdictReport && isPro && (
        <>
          <div className="w-px h-3.5 bg-white/10" />
          <div className="flex items-center gap-3 text-[10px]">
            {[
              { label: 'Stab', val: verdictReport.health_score.stability },
              { label: 'Conv', val: verdictReport.health_score.convergence },
              { label: 'Fair', val: verdictReport.health_score.fairness },
            ].map(({ label, val }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="text-white/30">{label}</span>
                <span className={val >= 70 ? 'text-green-400' : val >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                  {val.toFixed(0)}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {/* Oddělovač */}
      <div className="flex-1" />

      {/* Graf metadata */}
      <div className="flex items-center gap-3">
        {reportA && (
          <span className="text-white/30">
            {reportA.scenario.duration}s · dt {reportA.scenario.dt} · seed {reportA.seed_used}
          </span>
        )}
        <div className="w-px h-3.5 bg-white/10" />
        <span title="Node count">
          <span className="text-white/30 mr-1">Nodes</span>
          <span className="text-white/60">{nodeCount}</span>
        </span>
        <span title="Connection count">
          <span className="text-white/30 mr-1">Edges</span>
          <span className="text-white/60">{connCount}</span>
        </span>
        {isDirty && (
          <>
            <div className="w-px h-3.5 bg-white/10" />
            <span className="text-accent" title="Unsaved changes">● Unsaved</span>
          </>
        )}
      </div>
    </div>
  )
}
