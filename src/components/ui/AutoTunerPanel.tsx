// AutoTunerPanel.tsx — GSS AutoTuner UI
// Mini hill-climbing optimizér napojený přímo na RunReport pipeline.
import { useState, useCallback, useRef } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useLicenseStore } from '../../store/licenseStore'
import { Logger } from '../../core/Logger'
import { ProGate } from './ProGate'
import { runScenario, buildSimulationContext } from '../../core/ScenarioRunner'
import { generateVerdictReport } from '../../core/VerdictSystem'
import { createRNG } from '../../core/SimRNG'
import type { RNGInstance } from '../../core/SimRNG'

// ==================== LOKÁLNÍ TYPY ====================

interface TunerParam {
  id: string
  name: string
  original_value: number
  min_value: number
  max_value: number
}

interface IterRecord {
  iteration: number
  score: number
}

interface TunerResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  total_iterations: number
  best_score: number
  best_parameters: Record<string, number>
  original_parameters: Record<string, number>
  iterations: IterRecord[]
  duration_ms: number
  seed_used: number
}

type Strategy = 'hill_climbing' | 'simulated_annealing' | 'random_search'
type GoalMetric = 'health_score' | 'stability' | 'fairness' | 'convergence'

// ==================== HELPERS ====================

const SWEEP_FIELDS: Record<number, string[]> = {
  1: ['rate'],
  2: ['input_amount', 'output_amount', 'cycle_time'],
  3: ['rate'],
  4: ['value'],
  5: ['success_chance'],
}

function extractParams(graph: import('../../types/graph').GSSGraph): TunerParam[] {
  const out: TunerParam[] = []
  for (const node of graph.nodes) {
    const fields = SWEEP_FIELDS[node.type]
    if (!fields) continue
    for (const field of fields) {
      const val = (node.data as unknown as Record<string, number>)[field]
      if (typeof val !== 'number' || val <= 0) continue
      out.push({ id: `${node.id}.${field}`, name: `${node.label || node.id} → ${field}`, original_value: val, min_value: Math.max(0.001, val * 0.1), max_value: val * 5 })
    }
  }
  return out
}

function evalScore(
  overrides: Record<string, number>,
  graph: import('../../types/graph').GSSGraph,
  scenario: import('../../types/simulation').Scenario,
  metric: GoalMetric,
): number {
  const patched = {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const patch: Record<string, number> = {}
      for (const [key, v] of Object.entries(overrides)) {
        const [nid, field] = key.split('.')
        if (nid === n.id) patch[field] = v
      }
      return Object.keys(patch).length > 0 ? { ...n, data: { ...n.data, ...patch } } : n
    }),
  }
  try {
    const report = runScenario(patched, scenario)
    const ctx = buildSimulationContext(report, patched, scenario)
    const verdict = generateVerdictReport(ctx)
    const hs = verdict.health_score
    if (metric === 'stability') return hs.stability
    if (metric === 'fairness') return hs.fairness
    if (metric === 'convergence') return hs.convergence
    return hs.total
  } catch { return 0 }
}

function clamp(v: number, mn: number, mx: number) { return Math.max(mn, Math.min(mx, v)) }

async function hillClimb(
  params: TunerParam[],
  locked: Set<string>,
  maxIter: number,
  metric: GoalMetric,
  graph: import('../../types/graph').GSSGraph,
  scenario: import('../../types/simulation').Scenario,
  onProg: (p: number) => void,
  isCancelled: () => boolean,
  seed: number,
): Promise<TunerResult> {
  const t0 = Date.now()
  const rng: RNGInstance = createRNG(seed)
  let effectiveMaxIter = maxIter
  let current: Record<string, number> = Object.fromEntries(params.map((p) => [p.id, p.original_value]))
  let bestScore = evalScore(current, graph, scenario, metric)
  let best = { ...current }
  const iters: IterRecord[] = [{ iteration: 0, score: bestScore }]

  for (let i = 1; i <= effectiveMaxIter; i++) {
    if (isCancelled()) {
      const orig = Object.fromEntries(params.map((p) => [p.id, p.original_value]))
      return { status: 'PARTIAL', total_iterations: i - 1, best_score: bestScore, best_parameters: best, original_parameters: orig, iterations: iters, duration_ms: Date.now() - t0, seed_used: seed }
    }

    if (i % 5 === 0) {
      onProg(i / effectiveMaxIter)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }

    const candidate = { ...current }
    const free = params.filter((p) => !locked.has(p.id))
    if (free.length === 0) break
    const p = free[Math.floor(rng.randf() * free.length)]
    const step = (p.max_value - p.min_value) * 0.1
    candidate[p.id] = clamp(current[p.id] + (rng.randf() < 0.5 ? step : -step), p.min_value, p.max_value)

    const t1 = performance.now()
    const score = evalScore(candidate, graph, scenario, metric)
    const evalMs = performance.now() - t1
    if (evalMs > 500 && effectiveMaxIter > 10) {
      effectiveMaxIter = Math.max(10, Math.floor(effectiveMaxIter / 2))
      Logger.warning(`AutoTuner: evalScore took ${evalMs.toFixed(0)}ms — reducing iterations to ${effectiveMaxIter}`)
    }

    iters.push({ iteration: i, score })
    if (score > bestScore) { bestScore = score; best = { ...candidate }; current = candidate }
  }

  const orig = Object.fromEntries(params.map((p) => [p.id, p.original_value]))
  return {
    status: bestScore >= 75 ? 'SUCCESS' : bestScore >= 50 ? 'PARTIAL' : 'FAILED',
    total_iterations: effectiveMaxIter,
    best_score: bestScore,
    best_parameters: best,
    original_parameters: orig,
    iterations: iters,
    duration_ms: Date.now() - t0,
    seed_used: seed,
  }
}

async function randomSearch(
  params: TunerParam[],
  locked: Set<string>,
  maxIter: number,
  metric: GoalMetric,
  graph: import('../../types/graph').GSSGraph,
  scenario: import('../../types/simulation').Scenario,
  onProg: (p: number) => void,
  isCancelled: () => boolean,
  seed: number,
): Promise<TunerResult> {
  const t0 = Date.now()
  const rng: RNGInstance = createRNG(seed)
  let effectiveMaxIter = maxIter
  let bestScore = -Infinity
  let best: Record<string, number> = Object.fromEntries(params.map((p) => [p.id, p.original_value]))
  const iters: IterRecord[] = []

  for (let i = 1; i <= effectiveMaxIter; i++) {
    if (isCancelled()) {
      const orig = Object.fromEntries(params.map((p) => [p.id, p.original_value]))
      return { status: 'PARTIAL', total_iterations: i - 1, best_score: bestScore === -Infinity ? 0 : bestScore, best_parameters: best, original_parameters: orig, iterations: iters, duration_ms: Date.now() - t0, seed_used: seed }
    }

    if (i % 5 === 0) {
      onProg(i / effectiveMaxIter)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }

    const candidate: Record<string, number> = {}
    for (const p of params) {
      candidate[p.id] = locked.has(p.id) ? p.original_value : clamp(p.min_value + rng.randf() * (p.max_value - p.min_value), p.min_value, p.max_value)
    }

    const t1 = performance.now()
    const score = evalScore(candidate, graph, scenario, metric)
    const evalMs = performance.now() - t1
    if (evalMs > 500 && effectiveMaxIter > 10) {
      effectiveMaxIter = Math.max(10, Math.floor(effectiveMaxIter / 2))
      Logger.warning(`AutoTuner: evalScore took ${evalMs.toFixed(0)}ms — reducing iterations to ${effectiveMaxIter}`)
    }

    iters.push({ iteration: i, score })
    if (score > bestScore) { bestScore = score; best = { ...candidate } }
  }

  const orig = Object.fromEntries(params.map((p) => [p.id, p.original_value]))
  return {
    status: bestScore >= 75 ? 'SUCCESS' : bestScore >= 50 ? 'PARTIAL' : 'FAILED',
    total_iterations: effectiveMaxIter,
    best_score: bestScore === -Infinity ? 0 : bestScore,
    best_parameters: best,
    original_parameters: orig,
    iterations: iters,
    duration_ms: Date.now() - t0,
    seed_used: seed,
  }
}

// ==================== PRESETS ====================

const GOAL_PRESETS: { id: string; label: string; metric: GoalMetric }[] = [
  { id: 'max_health', label: '📈 Maximize Health Score', metric: 'health_score' },
  { id: 'max_stability', label: '⚖️ Maximize Stability', metric: 'stability' },
  { id: 'max_fairness', label: '🎯 Maximize Fairness', metric: 'fairness' },
  { id: 'max_conv', label: '🔁 Maximize Convergence', metric: 'convergence' },
]

// ==================== COMPONENT ====================

function AutoTunerContent() {
  const graph = useGraphStore((s) => s.graph)
  const scenario = useSimulationStore((s) => s.scenario)

  const [goalId, setGoalId] = useState('max_health')
  const [strategy, setStrategy] = useState<Strategy>('hill_climbing')
  const [maxIter, setMaxIter] = useState(40)
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TunerResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [seed, setSeed] = useState<number>(Date.now() & 0xFFFFFFFF)
  const cancelledRef = useRef(false)

  const params = extractParams(graph)

  const toggleLock = useCallback((id: string) => {
    setLockedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  const handleRun = useCallback(async () => {
    if (running || params.length === 0) return
    cancelledRef.current = false
    setRunning(true); setProgress(0); setResult(null)
    await new Promise<void>((r) => setTimeout(r, 0))
    try {
      const metric = GOAL_PRESETS.find((g) => g.id === goalId)?.metric ?? 'health_score'
      const fn = strategy === 'random_search' ? randomSearch : hillClimb
      const r = await fn(params, lockedIds, maxIter, metric, graph, scenario, setProgress, () => cancelledRef.current, seed)
      setResult(r)
    } finally {
      setRunning(false); setProgress(1)
    }
  }, [running, params, lockedIds, goalId, strategy, maxIter, graph, scenario, seed])

  const scoreColor = (v: number) =>
    v >= 75 ? 'text-green-400' : v >= 50 ? 'text-yellow-400' : v >= 25 ? 'text-orange-400' : 'text-red-400'

  if (params.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        Add Source, Converter, Drain, or Gate nodes to the graph to enable the AutoTuner.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Configuration */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">AutoTuner Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Optimization Goal</span>
            <select className="bg-bg border border-border rounded px-2 py-1.5 text-white" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              {GOAL_PRESETS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Strategy</span>
            <select className="bg-bg border border-border rounded px-2 py-1.5 text-white" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              <option value="hill_climbing">Hill Climbing (fast, local)</option>
              <option value="random_search">Random Search (global exploration)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Iterations</span>
            <input type="number" min={5} max={200} step={5} className="bg-bg border border-border rounded px-2 py-1.5 text-white" value={maxIter} onChange={(e) => setMaxIter(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Seed (reproducibility)</span>
            <input type="number" min={0} max={4294967295} step={1} className="bg-bg border border-border rounded px-2 py-1.5 text-white font-mono" value={seed} onChange={(e) => setSeed(Number(e.target.value) >>> 0)} />
          </label>
        </div>
      </div>

      {/* Parameters */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Parameters ({params.length}) — click 🔒 to lock</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {params.map((p) => {
            const locked = lockedIds.has(p.id)
            return (
              <button key={p.id} onClick={() => toggleLock(p.id)}
                className={`flex items-center justify-between p-2 rounded border text-xs text-left transition-colors ${locked ? 'border-border bg-border/40 text-muted' : 'border-accent/30 bg-accent/5 text-white hover:bg-accent/10'}`}>
                <span className="truncate font-mono">{p.name}</span>
                <span className="ml-2 flex-shrink-0">{locked ? '🔒' : p.original_value.toFixed(2)}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted mt-2">Range: ×0.1 – ×5 of original value</p>
      </div>

      {/* Button */}
      <div className="flex items-center gap-3">
        <button onClick={handleRun} disabled={running}
          className="px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors">
          {running ? `⏳ Tuning… ${(progress * 100).toFixed(0)}%` : '🔧 Run AutoTuner'}
        </button>
        {running && (
          <button onClick={handleCancel}
            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded font-medium transition-colors">
            Cancel
          </button>
        )}
        {running && (
          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${(progress * 100).toFixed(0)}%` }} />
          </div>
        )}
      </div>

      {/* Výsledky */}
      {result && (
        <div className="flex flex-col gap-3">
          <div className={`rounded-lg border p-3 text-xs ${result.status === 'SUCCESS' ? 'bg-green-500/10 border-green-500/30 text-green-400' : result.status === 'PARTIAL' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            <div className="font-semibold text-sm mb-1">
              {result.status === 'SUCCESS' ? '✅ Optimization successful' : result.status === 'PARTIAL' ? '⚠ Partial success' : '❌ Optimization failed'}
            </div>
            <div className="flex gap-4 text-[10px] flex-wrap">
              <span>{result.total_iterations} iterations</span>
              <span>Best score: <span className={`font-mono font-semibold ${scoreColor(result.best_score)}`}>{result.best_score.toFixed(1)}</span></span>
              <span>Time: {result.duration_ms.toFixed(0)} ms</span>
              <span>Seed: <span className="font-mono">{result.seed_used}</span></span>
            </div>
          </div>

          {/* Doporučené parametry */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Recommended Parameters</h3>
            <div className="space-y-1.5">
              {Object.entries(result.best_parameters).map(([id, val]) => {
                const orig = result.original_parameters[id] ?? val
                const delta = val - orig
                const pct = orig !== 0 ? (delta / orig) * 100 : 0
                return (
                  <div key={id} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                    <span className="font-mono text-white/70 truncate max-w-[200px]">{id}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-muted">{orig.toFixed(3)}</span>
                      <span className="text-muted">→</span>
                      <span className="text-accent font-semibold font-mono">{val.toFixed(3)}</span>
                      <span className={`text-[10px] w-16 text-right ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-muted'}`}>
                        {delta > 0 ? '+' : ''}{pct.toFixed(1)} %
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Průběh optimalizace */}
          {result.iterations.length > 1 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold text-white/70 uppercase mb-3">Progress ({result.iterations.length} iterations)</h3>
              <div className="flex items-end gap-px h-16 overflow-hidden">
                {result.iterations
                  .filter((_it, idx, arr) => idx % Math.max(1, Math.floor(arr.length / 80)) === 0)
                  .map((it, idx) => {
                    const maxS = Math.max(...result.iterations.map((x) => x.score), 0.01)
                    const h = Math.max(2, (it.score / maxS) * 100)
                    return <div key={idx} className="flex-1 min-w-[2px] bg-accent/60 rounded-t" style={{ height: `${h}%` }} title={`${it.score.toFixed(1)}`} />
                  })}
              </div>
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>Start: {result.iterations[0]?.score.toFixed(1)}</span>
                <span>End: {result.iterations[result.iterations.length - 1]?.score.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AutoTunerPanel() {
  const isPro = useLicenseStore((s) => s.license?.isPro ?? false)
  if (!isPro) return <ProGate feature="AutoTuner — AI Economy Balancing" preview={false} />
  return <AutoTunerContent />
}
