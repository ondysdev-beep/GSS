// SimulationDashboard.tsx — Full Scenario Runner UI with A/B, MC, Sweep
import { useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import { useGraphStore } from '../../store/graphStore'
import { useSimulation } from '../../hooks/useSimulation'
import { useLicenseStore } from '../../store/licenseStore'
import { compareReports } from '../../core/ScenarioComparer'
import { runScenario } from '../../core/ScenarioRunner'
import { runMonteCarlo } from '../../core/MonteCarloSimulator'
import { runSweep, MAX_SWEEP_RUNS } from '../../core/ParameterSweeper'
import { validate, hasErrors } from '../../core/GraphValidator'
import { NodeType } from '../../types/graph'
import type { RunReport, SweepParam } from '../../types/simulation'
import { NumericInput } from './NumericInput'

type DashMode = 'run' | 'ab' | 'mc' | 'sweep'

// Numerická pole, která má smysl sweepovat, per typ uzlu.
const SWEEP_FIELDS: Record<number, string[]> = {
  [NodeType.POOL]: ['capacity', 'initial_amount'],
  [NodeType.SOURCE]: ['rate'],
  [NodeType.CONVERTER]: ['input_amount', 'output_amount', 'cycle_time'],
  [NodeType.DRAIN]: ['rate'],
  [NodeType.GATE]: ['value'],
  [NodeType.CHANCE]: ['success_chance'],
  [NodeType.TIMER]: ['amount', 'interval'],
  [NodeType.PLAYER_ACTION]: ['amount', 'cadence'],
}

const inputCls = 'bg-bg border border-border rounded px-2 py-1 text-white'

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0))

export function SimulationDashboard() {
  const [mode, setMode] = useState<DashMode>('run')
  const isPro = useLicenseStore((s) => s.license?.isPro ?? false)
  const { run, isRunning, error } = useSimulation()

  const {
    scenario, reportA, compareReport, mcReport,
    setScenario, setReportB, setCompareReport, setMCReport,
  } = useSimulationStore()
  const graph = useGraphStore((s) => s.graph)
  const [modeError, setModeError] = useState<string | null>(null)

  /** Graph validation before the PRO run modes (the basic run validates in useSimulation). */
  function graphError(): string | null {
    return hasErrors(validate(graph)) ? 'Graph contains errors. Fix them (see Issues in the Editor tab) before running.' : null
  }

  // ---- A/B: spustit jako B ----
  const [runningB, setRunningB] = useState(false)
  const runAsB = async () => {
    if (runningB) return
    const gErr = graphError()
    if (gErr) { setModeError(gErr); return }
    setRunningB(true)
    setModeError(null)
    await yieldToUI()
    try {
      const r = runScenario(graph, scenario)
      setReportB(r)
      if (reportA) setCompareReport(compareReports(reportA, r))
    } catch (err) {
      setModeError(`A/B run failed: ${errorText(err)}`)
    } finally {
      setRunningB(false)
    }
  }

  // ---- MC ----
  const [mcIter, setMcIter] = useState(100)
  const [runningMC, setRunningMC] = useState(false)
  const runMC = async () => {
    if (runningMC) return
    const gErr = graphError()
    if (gErr) { setModeError(gErr); return }
    setRunningMC(true)
    setModeError(null)
    await yieldToUI()
    try {
      // Seed: override ze scénáře, jinak seed projektu (0 = každý běh náhodně).
      const seedBase = scenario.seed_override > 0 ? scenario.seed_override : graph.simulation_seed > 0 ? graph.simulation_seed : 0
      setMCReport(runMonteCarlo(graph, { iterations: mcIter, seed_base: seedBase, scenario }))
    } catch (err) {
      setModeError(`Monte Carlo failed: ${errorText(err)}`)
    } finally {
      setRunningMC(false)
    }
  }

  // ---- Sweep ----
  const [sweepTarget, setSweepTarget] = useState('')
  const [runningSweep, setRunningSweep] = useState(false)
  const [sweepReport, setSweepReport] = useState<ReturnType<typeof runSweep> | null>(null)
  const [sweepNodeId,  setSweepNodeId]  = useState('')
  const [sweepField,   setSweepField]   = useState('')
  const [sweepMin,     setSweepMin]     = useState(0.5)
  const [sweepMax,     setSweepMax]     = useState(10)
  const [sweepSteps,   setSweepSteps]   = useState(10)
  const [sweepMetric,  setSweepMetric]  = useState<'final_value'|'min_value'|'max_value'>('final_value')

  const sweepableNodes = graph.nodes.filter((n) => SWEEP_FIELDS[n.type])
  const selectedSweepNode = graph.nodes.find((n) => n.id === sweepNodeId)
  const availableFields = selectedSweepNode ? SWEEP_FIELDS[selectedSweepNode.type] ?? [] : []
  // Dřív zůstalo pole 'rate' i u uzlů, které ho nemají (select přitom ukazoval
  // jiné pole) → sweep tiše měnil neexistující parametr a výsledky byly stejné.
  const effectiveField = availableFields.includes(sweepField) ? sweepField : availableFields[0] ?? ''

  const runSweepAction = async () => {
    if (!sweepTarget || !sweepNodeId || !effectiveField || runningSweep) return
    const gErr = graphError()
    if (gErr) { setModeError(gErr); return }
    setRunningSweep(true)
    setModeError(null)
    await yieldToUI()
    try {
      const params: SweepParam[] = [{ node_id: sweepNodeId, field: effectiveField, min: sweepMin, max: sweepMax, steps: sweepSteps }]
      setSweepReport(runSweep(graph, { params, scenario, target_pool: sweepTarget, target_metric: sweepMetric }))
    } catch (err) {
      setModeError(`Parameter sweep failed: ${errorText(err)}`)
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
            onClick={() => { if (m.pro && !isPro) return; setMode(m.id); setModeError(null) }}
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Name</span>
            <input
              className={inputCls}
              value={scenario.name}
              onChange={(e) => setScenario({ name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Duration (s)</span>
            <NumericInput className={inputCls} value={scenario.duration} min={0.01} max={1000000}
              onCommit={(v) => setScenario({ duration: v })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">dt (s / tick)</span>
            <NumericInput className={inputCls} value={scenario.dt} min={0.001} max={3600} step={0.1}
              onCommit={(v) => setScenario({ dt: v })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Sampling (s)</span>
            <NumericInput className={inputCls} value={scenario.sampling_interval} min={0.001} max={1000000} step={0.5}
              onCommit={(v) => setScenario({ sampling_interval: v })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted" title="0 = use the project seed (random if that is 0 too)">Seed (0 = project)</span>
            <NumericInput className={inputCls} value={scenario.seed_override} min={0} max={4294967295} integer
              onCommit={(v) => setScenario({ seed_override: v })} />
          </label>
        </div>
      </div>

      {modeError && <div className="text-red-400 text-xs">{modeError}</div>}

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

          {/* Grafy průběhu jsou níže na stránce Analysis (dřív se zde zobrazovaly podruhé). */}
          {reportA && <RunSummaryTable report={reportA} label="Results A" />}
        </div>
      )}

      {/* ---- MODE: A/B ---- */}
      {mode === 'ab' && (
        <div className="flex flex-col gap-4">
          <p className="text-[10px] text-muted">
            Run the current graph/scenario as A, change the graph or scenario, then run it as B to compare.
          </p>
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
              className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded text-xs font-medium disabled:opacity-50"
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
              <NumericInput className={`w-20 ${inputCls}`} value={mcIter} min={1} max={10000} step={10} integer
                onCommit={setMcIter} />
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
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Sweep Parameter</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-muted">Node</span>
                <select className={inputCls} value={sweepNodeId} onChange={(e) => { setSweepNodeId(e.target.value); setSweepField('') }}>
                  <option value="">– select –</option>
                  {sweepableNodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.label || n.id}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Field</span>
                <select className={inputCls} value={effectiveField} onChange={(e) => setSweepField(e.target.value)} disabled={availableFields.length === 0}>
                  {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Target Pool (metric)</span>
                <select className={inputCls} value={sweepTarget} onChange={(e) => setSweepTarget(e.target.value)}>
                  <option value="">– select –</option>
                  {graph.nodes.filter((n) => n.type === NodeType.POOL).map((n) => (
                    <option key={n.id} value={n.id}>{n.label || n.id}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Min</span>
                <NumericInput className={inputCls} value={sweepMin} onCommit={setSweepMin} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Max</span>
                <NumericInput className={inputCls} value={sweepMax} onCommit={setSweepMax} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Steps</span>
                <NumericInput className={inputCls} value={sweepSteps} min={1} max={MAX_SWEEP_RUNS - 1} integer onCommit={setSweepSteps} />
              </label>
            </div>
            <div className="flex gap-3 items-center mt-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                Metric:
                <select className={inputCls} value={sweepMetric} onChange={(e) => setSweepMetric(e.target.value as 'final_value'|'min_value'|'max_value')}>
                  <option value="final_value">Final value</option>
                  <option value="min_value">Min value</option>
                  <option value="max_value">Max value</option>
                </select>
              </label>
              <button
                onClick={runSweepAction}
                disabled={runningSweep || !sweepTarget || !sweepNodeId || !effectiveField}
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
function RunSummaryTable({ report, label }: { report: RunReport; label: string }) {
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
              <td className="py-1 pr-3">{(min_values[pid] ?? 0).toFixed(2)}</td>
              <td className="py-1">{(max_values[pid] ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-muted text-xs mt-2">
        {report.summary.total_ticks} ticks · seed {report.seed_used} · {report.summary.elapsed.toFixed(1)} s simulated
      </div>
    </div>
  )
}
