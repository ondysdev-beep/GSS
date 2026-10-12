// ParameterSweeper.ts — přímý port GDScript ParameterSweeper.gd
// Variuje 1–2 parametry grafu přes rozsah, spouští ScenarioRunner pro každou kombinaci,
// počítá sensitivity metriky (korelace, elasticita, tornado).

import { runScenario, resolveSeed, csvCell } from './ScenarioRunner'
import { TICK_SPEC_VERSION } from './TickEngine'
import type { GSSGraph, GSSNode } from '../types/graph'
import type {
  Scenario,
  SweepReport,
  SweepParam,
  SweepResult,
  SweepSensitivity,
  TornadoEntry,
} from '../types/simulation'
import { defaultScenario } from '../types/simulation'

export const MAX_SWEEP_RUNS = 500
/** A sweep varies at most this many parameters (1D or 2D grid). */
export const MAX_SWEEP_PARAMS = 2

// ==================== SWEEP CONFIG ====================

export interface SweepConfig {
  params: SweepParam[]
  scenario: Partial<Scenario>
  target_pool: string
  target_metric: 'final_value' | 'min_value' | 'max_value' | 'time_to_threshold'
}

/** Key used for a swept parameter in results: `<node_id>.<field>`. */
export function sweepParamKey(p: Pick<SweepParam, 'node_id' | 'field'>): string {
  return `${p.node_id}.${p.field}`
}

/**
 * Splits a `<node_id>.<field>` key. Field names never contain a dot, node IDs
 * may — so split at the LAST dot (splitting at the first broke IDs like "a.b").
 */
export function splitParamKey(key: string): [nodeId: string, field: string] {
  const i = key.lastIndexOf('.')
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)]
}

// ==================== CORE SWEEP ====================

export function runSweep(graph: GSSGraph, config: SweepConfig): SweepReport {
  if (config.params.length > MAX_SWEEP_PARAMS) {
    throw new Error(`A parameter sweep supports at most ${MAX_SWEEP_PARAMS} parameters (got ${config.params.length}).`)
  }
  const params = config.params.map((p) => ({ ...p, steps: Math.max(1, Math.floor(p.steps)) }))
  // Jeden pevný seed pro všechny běhy — jinak by se do citlivosti míchal
  // RNG šum (při seedu 0 dostal každý běh jiný náhodný seed).
  const sc: Scenario = {
    ...defaultScenario(),
    ...config.scenario,
  }
  sc.seed_override = resolveSeed(sc.seed_override, graph.simulation_seed)
  const targetPool = config.target_pool
  const targetMetric = config.target_metric

  if (params.length === 0) {
    return buildEmptyReport(config, sc)
  }

  const combos = generateCombos(params)
  if (combos.length > MAX_SWEEP_RUNS) {
    throw new Error(
      `This sweep needs ${combos.length} simulation runs (limit ${MAX_SWEEP_RUNS}). Reduce the number of steps.`,
    )
  }

  const results: SweepResult[] = []

  for (const combo of combos) {
    const modGraph = applyParamOverrides(graph, combo)
    const report = runScenario(modGraph, sc)
    const metric = extractMetric(report.summary, targetPool, targetMetric)
    results.push({ param_values: combo, metric_value: metric })
  }

  // Sensitivity analysis pro každý parametr
  const sensitivity: Record<string, SweepSensitivity> = {}
  const tornado: TornadoEntry[] = []

  for (const p of params) {
    const key = sweepParamKey(p)
    // time_to_threshold = -1 znamená "nikdy nedosaženo" — takové body by
    // regresi zkreslily, proto se do citlivosti nezapočítávají.
    const sens = computeSensitivity(results, key, targetMetric === 'time_to_threshold')
    sensitivity[key] = sens
    tornado.push({ param_key: key, impact: Math.abs(sens.elasticity) })
  }

  tornado.sort((a, b) => b.impact - a.impact)

  return {
    tick_spec_version: TICK_SPEC_VERSION,
    config: {
      params,
      scenario: sc,
      target_pool: targetPool,
      target_metric: targetMetric,
    },
    results,
    sensitivity,
    tornado,
  }
}

// ==================== GENEROVÁNÍ KOMBINACÍ ====================

function generateCombos(params: SweepParam[]): Record<string, number>[] {
  const combos: Record<string, number>[] = []
  const values = (p: SweepParam) =>
    Array.from({ length: p.steps + 1 }, (_, i) => p.min + (p.max - p.min) * (i / p.steps))

  if (params.length === 1) {
    const key = sweepParamKey(params[0])
    for (const v of values(params[0])) combos.push({ [key]: v })
  } else if (params.length === 2) {
    const key1 = sweepParamKey(params[0])
    const key2 = sweepParamKey(params[1])
    for (const v1 of values(params[0])) {
      for (const v2 of values(params[1])) combos.push({ [key1]: v1, [key2]: v2 })
    }
  }

  return combos
}

// ==================== APLIKOVÁNÍ OVERRIDE NA GRAF ====================

function applyParamOverrides(graph: GSSGraph, overrides: Record<string, number>): GSSGraph {
  const nodes: GSSNode[] = graph.nodes.map((n) => {
    const nodeId = String(n.id)
    let data: Record<string, unknown> | null = null
    for (const [key, value] of Object.entries(overrides)) {
      const [oNodeId, field] = splitParamKey(key)
      if (oNodeId === nodeId && field) {
        data ??= { ...((n.data ?? {}) as unknown as Record<string, unknown>) }
        data[field] = value
      }
    }
    return data ? ({ ...n, data } as unknown as GSSNode) : n
  })
  return { ...graph, nodes }
}

// ==================== EXTRAKCE METRIKY ====================

function extractMetric(
  summary: { final_values?: Record<string, number>; min_values?: Record<string, number>; max_values?: Record<string, number>; time_to_threshold?: Record<string, number> },
  targetPool: string,
  metric: string,
): number {
  switch (metric) {
    case 'final_value':       return summary.final_values?.[targetPool] ?? 0
    case 'min_value':         return summary.min_values?.[targetPool] ?? 0
    case 'max_value':         return summary.max_values?.[targetPool] ?? 0
    case 'time_to_threshold': return summary.time_to_threshold?.[targetPool] ?? -1
    default:                  return summary.final_values?.[targetPool] ?? 0
  }
}

// ==================== SENSITIVITY ANALYSIS ====================

function computeSensitivity(results: SweepResult[], paramKey: string, skipNegative: boolean): SweepSensitivity {
  const xs: number[] = []
  const ys: number[] = []

  for (const r of results) {
    const pv = r.param_values[paramKey]
    if (pv === undefined) continue
    if (skipNegative && r.metric_value < 0) continue
    xs.push(pv)
    ys.push(r.metric_value)
  }

  if (xs.length < 2) return { correlation: 0, elasticity: 0, slope: 0 }

  const meanX = xs.reduce((s, v) => s + v, 0) / xs.length
  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length

  let covXY = 0, varX = 0, varY = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    covXY += dx * dy
    varX  += dx * dx
    varY  += dy * dy
  }

  const correlation = varX > 0.0001 && varY > 0.0001
    ? covXY / (Math.sqrt(varX) * Math.sqrt(varY))
    : 0

  const slope = varX > 0.0001 ? covXY / varX : 0
  const elasticity = Math.abs(meanY) > 0.0001 ? (slope * meanX) / meanY : 0

  return {
    correlation: Math.round(correlation * 10000) / 10000,
    elasticity:  Math.round(elasticity  * 10000) / 10000,
    slope:       Math.round(slope       * 10000) / 10000,
  }
}

// ==================== HELPERS ====================

function buildEmptyReport(config: SweepConfig, sc: Scenario): SweepReport {
  return {
    tick_spec_version: TICK_SPEC_VERSION,
    config: { params: [], scenario: sc, target_pool: config.target_pool, target_metric: config.target_metric },
    results: [],
    sensitivity: {},
    tornado: [],
  }
}

export function sweepToCSV(report: SweepReport): string {
  if (report.results.length === 0) return ''
  const keys = Object.keys(report.results[0].param_values).sort()
  const header = [...keys.map(csvCell), 'metric'].join(',')
  const rows = report.results.map((r) => {
    const cols = keys.map((k) => r.param_values[k].toFixed(4))
    return [...cols, r.metric_value.toFixed(4)].join(',')
  })
  return [header, ...rows].join('\n')
}
