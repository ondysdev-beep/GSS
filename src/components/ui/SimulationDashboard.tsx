// SimulationDashboard.tsx — Full Scenario Runner UI with A/B, MC, Sweep
import { useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import { useGraphStore } from '../../store/graphStore'
import { useSimulation } from '../../hooks/useSimulation'
import { useLicenseStore } from '../../store/licenseStore'
import { compareReports } from '../../core/ScenarioComparer'
import { runScenario } from '../../core/ScenarioRunner'
import { runMonteCarlo } from '../../core/MonteCarloSimulator'
import { runSweep } from '../../core/ParameterSweeper'
import { WealthOverTimeChart } from '../charts/WealthOverTimeChart'
import { ProductionSummaryChart } from '../charts/ProductionSummaryChart'
import type { SweepParam } from '../../types/simulation'

type DashMode = 'run' | 'ab' | 'mc' | 'sweep'

export function SimulationDashboard() {
  const [mode, setMode] = useState<DashMode>('run')
  const isPro = useLicenseStore((s) => s.license?.isPro ?? false)
  const { run, isRunning, error } = useSimulation()

  const {
    scenario, reportA, compareReport, mcReport,
    setScenario, setReportB, setCompareReport, setMCReport,
  } = useSimulationStore()
  const graph = useGraphStore((s) => s.graph)

  // ---- A/B: spustit jako B ----
  const [runningB, setRunningB] = useState(false)
  const runAsB = async () => {
    if (runningB) return
    setRunningB(true)
    try {
      const r = runScenario(graph, scenario)
      setReportB(r)
      if (reportA) setCompareReport(compareReports(reportA, r))
    } finally {
      setRunningB(false)
    }
  }

  // ---- MC ----
  const [mcIter, setMcIter] = useState(100)
  const [runningMC, setRunningMC] = useState(false)
  const runMC = async () => {
    if (runningMC) return
    setRunningMC(true)
    await new Promise<void>((r) => setTimeout(r, 0))
    try {
      const report = runMonteCarlo(graph, { iterations: mcIter, seed_base: scenario.seed_override || 42, scenario })
      setMCReport(report)
    } finally {
      setRunningMC(false)
    }
  }

  // ---- Sweep ----
  const [sweepTarget, setSweepTarget] = useState('')
  const [runningSweep, setRunningSweep] = useState(false)
  const [sweepReport, setSweepReport] = useState<ReturnType<typeof runSweep> | null>(null)
  // Flexible sweep params
  const [sweepNodeId,  setSweepNodeId]  = useState('')
  const [sweepField,   setSweepField]   = useState('rate')
  const [sweepMin,     setSweepMin]     = useState(0.5)
  const [sweepMax,     setSweepMax]     = useState(10)
  const [sweepSteps,   setSweepSteps]   = useState(10)
  const [sweepMetric,  setSweepMetric]  = useState<'final_value'|'min_value'|'max_value'>('final_value')

  // Numerická pole per typ uzlu
  const SWEEP_FIELDS: Record<number, string[]> = {
    0: ['capacity', 'initial_amount'],
    1: ['rate'],
    2: ['input_amount', 'output_amount', 'cycle_time'],
    3: ['rate'],
    4: ['value'],
    5: ['success_chance'],
  }
  const selectedSweepNode = graph.nodes.find((n) => n.id === sweepNodeId)
  const availableFields = selectedSweepNode ? (SWEEP_FIELDS[selectedSweepNode.type] ?? ['rate']) : ['rate']

  const runSweepAction = async () => {
    if (!sweepTarget || !sweepNodeId || runningSweep) return
    setRunningSweep(true)
    await new Promise<void>((r) => setTimeout(r, 0))
    try {
      const params: SweepParam[] = [{ node_id: sweepNodeId, field: sweepField, min: sweepMin, max: sweepMax, steps: sweepSteps }]
      const r = runSweep(graph, { params, scenario, target_pool: sweepTarget, target_metric: sweepMetric })
      setSweepReport(r)
    } finally {
      setRunningSweep(false)
    }
  }

  const MODES: { id: DashMode; label: string; pro?: boolean }[] = [
    { id: 'run',   label: '▶ Run' },
    { id: 'ab',    label: 'A/B Comparison', pro: true },
    { id: 'mc',    label: 'Monte Carlo',    pro: true },
    { id: 'sweep', label: 'Parameter Sweep',pro: true },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Mode tabs */}
      <div className="flex gap-1 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => { if (m.pro && !isPro) return; setMode(m.id) }}
            title={m.pro && !isPro ? 'GSS PRO required' : undefined}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              mode === m.id ? 'bg-accent text-white' :
              m.pro && !isPro ? 'text-muted/40 cursor-not-allowed' :
              'text-muted hover:text-white hover:bg-border'
            }`}
          >
            {m.label}{m.pro && !isPro ? ' 🔒' : ''}
          </button>
        ))}
      </div>

      {/* Scenario settings (sdílené) */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Scenario Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Name</span>
            <input
              className="bg-bg border border-border rounded px-2 py-1 text-white"
              value={scenario.name}
              onChange={(e) => setScenario({ name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Duration (s)</span>
            <input
              type="number" min={1} max={100000}
              className="bg-bg border border-border rounded px-2 py-1 text-white"
              value={scenario.duration}
              onChange={(e) => setScenario({ duration: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">dt</span>
            <input
              type="number" min={0.01} step={0.1}
              className="bg-bg border border-border rounded px-2 py-1 text-white"
              value={scenario.dt}
              onChange={(e) => setScenario({ dt: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Seed (0 = random)</span>
            <input
              type="number" min={0}
              className="bg-bg border border-border rounded px-2 py-1 text-white"
              value={scenario.seed_override}
              onChange={(e) => setScenario({ seed_override: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {/* ---- MODE: Základní běh ---- */}
      {mode === 'run' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={run}
              disabled={isRunning}
              className="px-4 py-2 bg-accent text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {isRunning ? '⏳ Running…' : '▶ Run Simulation'}
            </button>
            {error && <span className="text-red-400 text-xs">{error}</span>}
          </div>

          {reportA && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-3 text-white/80">Wealth Over Time</h3>
                <WealthOverTimeChart />
              </div>
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-3 text-white/80">Production Summary</h3>
                <ProductionSummaryChart />
              </div>
              <RunSummaryTable report={reportA} label="Results A" />
            </div>
          )}
        </div>
      )}

      {/* ---- MODE: A/B ---- */}
      {mode === 'ab' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 items-center">
            <button
              onClick={run}
              disabled={isRunning}
              className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium disabled:opacity-50"
            >
              {isRunning ? '⏳…' : '▶ Run as A'}
            </button>
            <button
              onClick={runAsB}
              disabled={runningB || !reportA}
              className="px-3 py-1.5 bg-secondary text-white rounded text-xs font-medium disabled:opacity-50"
            >
              {runningB ? '⏳…' : '▶ Run as B'}
            </button>
            {(!reportA) && <span className="text-muted text-xs">Run A first</span>}
          </div>

          {compareReport && (
            <div className="bg-card rounded-lg border border-border p-4 overflow-auto">
              <h3 className="text-sm font-semibold mb-3 text-white/80">
                A/B: {compareReport.scenario_a} vs {compareReport.scenario_b}
              </h3>
              <div className="text-xs text-accent mb-2">{compareReport.winner_summary}</div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="text-muted border-b border-border">
                    <th className="py-1 pr-3">Pool</th>
                    <th className="py-1 pr-3">Final A</th>
                    <th className="py-1 pr-3">Final B</th>
                    <th className="py-1 pr-3">Delta</th>
                    <th className="py-1">% change</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compareReport.pool_diffs).map(([pid, d]) => (
                    <tr key={pid} className="border-b border-border/30">
                      <td className="py-1 pr-3 text-white">{pid}</td>
                      <td className="py-1 pr-3">{d.final_a.toFixed(2)}</td>
                      <td className="py-1 pr-3">{d.final_b.toFixed(2)}</td>
                      <td className={`py-1 pr-3 ${d.delta > 0 ? 'text-green-400' : d.delta < 0 ? 'text-red-400' : 'text-muted'}`}>
                        {d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)}
                      </td>
                      <td className="py-1">{d.pct_change.toFixed(1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- MODE: Monte Carlo ---- */}
      {mode === 'mc' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 text-xs text-muted">
              Iterations:
              <input
                type="number" min={10} max={10000} step={10}
                className="w-20 bg-bg border border-border rounded px-2 py-1 text-white"
                value={mcIter}
                onChange={(e) => setMcIter(Number(e.target.value))}
              />
            </label>
            <button
              onClick={runMC}
              disabled={runningMC}
              className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium disabled:opacity-50"
            >
              {runningMC ? '⏳ MC running…' : '▶ Run Monte Carlo'}
            </button>
          </div>

          {mcReport && (
            <div className="bg-card rounded-lg border border-border p-4 overflow-auto">
              <h3 className="text-sm font-semibold mb-3 text-white/80">
                MC ({mcReport.iterations} iterations)
              </h3>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="text-muted border-b border-border">
                    <th className="py-1 pr-3">Pool</th>
                    <th className="py-1 pr-3">Mean</th>
                    <th className="py-1 pr-3">Std</th>
                    <th className="py-1 pr-3">Min</th>
                    <th className="py-1 pr-3">P10</th>
                    <th className="py-1 pr-3">P50</th>
                    <th className="py-1 pr-3">P90</th>
                    <th className="py-1">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(mcReport.pool_stats).map(([pid, s]) => (
                    <tr key={pid} className="border-b border-border/30">
                      <td className="py-1 pr-3 text-white">{pid}</td>
                      <td className="py-1 pr-3">{s.mean.toFixed(2)}</td>
                      <td className="py-1 pr-3">{s.std.toFixed(2)}</td>
                      <td className="py-1 pr-3">{s.min.toFixed(2)}</td>
                      <td className="py-1 pr-3">{s.p10.toFixed(2)}</td>
                      <td className="py-1 pr-3">{s.p50.toFixed(2)}</td>
                      <td className="py-1 pr-3">{s.p90.toFixed(2)}</td>
                      <td className="py-1">{s.max.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- MODE: Parameter Sweep ---- */}
      {mode === 'sweep' && (
        <div className="flex flex-col gap-4">
          {/* Konfigurace sweepovaného parametru */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Sweep Parameter</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-muted">Node</span>
                <select className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepNodeId} onChange={(e) => { setSweepNodeId(e.target.value); setSweepField('rate') }}>
                  <option value="">– select –</option>
                  {graph.nodes.filter((n) => n.type !== 0).map((n) => (
                    <option key={n.id} value={n.id}>{n.label || n.id}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Field</span>
                <select className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepField} onChange={(e) => setSweepField(e.target.value)}>
                  {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Target Pool (metric)</span>
                <select className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepTarget} onChange={(e) => setSweepTarget(e.target.value)}>
                  <option value="">– select –</option>
                  {graph.nodes.filter((n) => n.type === 0).map((n) => (
                    <option key={n.id} value={n.id}>{n.label || n.id}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Min</span>
                <input type="number" className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepMin} onChange={(e) => setSweepMin(Number(e.target.value))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Max</span>
                <input type="number" className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepMax} onChange={(e) => setSweepMax(Number(e.target.value))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Steps</span>
                <input type="number" min={2} max={50} className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepSteps} onChange={(e) => setSweepSteps(Number(e.target.value))} />
              </label>
            </div>
            <div className="flex gap-3 items-center mt-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                Metric:
                <select className="bg-bg border border-border rounded px-2 py-1 text-white" value={sweepMetric} onChange={(e) => setSweepMetric(e.target.value as 'final_value'|'min_value'|'max_value')}>
                  <option value="final_value">Final value</option>
                  <option value="min_value">Min value</option>
                  <option value="max_value">Max value</option>
                </select>
              </label>
              <button
                onClick={runSweepAction}
                disabled={runningSweep || !sweepTarget || !sweepNodeId}
                className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium disabled:opacity-50"
              >
                {runningSweep ? '⏳ Sweep running…' : '▶ Run Sweep'}
              </button>
            </div>
          </div>

          {sweepReport && (
            <div className="flex flex-col gap-3">
              <div className="bg-card rounded-lg border border-border p-4 overflow-auto">
                <h3 className="text-sm font-semibold mb-2 text-white/80">Tornado Chart (elasticity)</h3>
                {sweepReport.tornado.map((t) => (
                  <div key={t.param_key} className="flex items-center gap-2 mb-1 text-xs">
                    <span className="w-36 text-muted truncate">{t.param_key}</span>
                    <div className="flex-1 h-3 bg-border rounded overflow-hidden">
                      <div
                        className="h-full bg-accent rounded"
                        style={{ width: `${Math.min(100, t.impact * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-muted">{t.impact.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="bg-card rounded-lg border border-border p-4 overflow-auto">
                <h3 className="text-sm font-semibold mb-2 text-white/80">
                  Results ({sweepReport.results.length} combinations)
                </h3>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      {Object.keys(sweepReport.results[0]?.param_values ?? {}).map((k) => (
                        <th key={k} className="py-1 pr-3">{k}</th>
                      ))}
                      <th className="py-1">Metric</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweepReport.results.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b border-border/30">
                        {Object.values(r.param_values).map((v, j) => (
                          <td key={j} className="py-1 pr-3">{Number(v).toFixed(2)}</td>
                        ))}
                        <td className="py-1 text-accent">{r.metric_value.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sweepReport.results.length > 20 && (
                  <p className="text-muted text-xs mt-1">+{sweepReport.results.length - 20} more rows…</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Helper: Run Summary Table ----
function RunSummaryTable({
  report,
  label,
}: {
  report: import('../../types/simulation').RunReport
  label: string
}) {
  const { final_values, min_values, max_values } = report.summary
  const pids = Object.keys(final_values)
  if (pids.length === 0) return null

  return (
    <div className="bg-card rounded-lg border border-border p-4 overflow-auto">
      <h3 className="text-sm font-semibold mb-2 text-white/80">{label}</h3>
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="py-1 pr-3">Pool</th>
            <th className="py-1 pr-3">Final</th>
            <th className="py-1 pr-3">Min</th>
            <th className="py-1">Max</th>
          </tr>
        </thead>
        <tbody>
          {pids.map((pid) => (
            <tr key={pid} className="border-b border-border/30">
              <td className="py-1 pr-3 text-white">{pid}</td>
              <td className="py-1 pr-3">{final_values[pid].toFixed(2)}</td>
              <td className="py-1 pr-3">{min_values[pid].toFixed(2)}</td>
              <td className="py-1">{max_values[pid].toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-muted text-xs mt-2">
        {report.summary.total_ticks} ticks · seed {report.seed_used} · {report.summary.elapsed.toFixed(1)}s
      </div>
    </div>
  )
}
