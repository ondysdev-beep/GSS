// ParameterSweeper.ts — přímý port GDScript ParameterSweeper.gd
// Variuje 1–2 parametry grafu přes rozsah, spouští ScenarioRunner pro každou kombinaci,
// počítá sensitivity metriky (korelace, elasticita, tornado).

import { runScenario } from './ScenarioRunner'
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

const MAX_RUNS = 500

// ==================== SWEEP CONFIG ====================

export interface SweepConfig {
  params: SweepParam[]
  scenario: Partial<Scenario>
  target_pool: string
  target_metric: 'final_value' | 'min_value' | 'max_value' | 'time_to_threshold'
}

// ==================== CORE SWEEP ====================

export function runSweep(graph: GSSGraph, config: SweepConfig): SweepReport {
  const params      = config.params
  const sc          = { ...defaultScenario(), ...config.scenario }
  const targetPool  = config.target_pool
  const targetMetric = config.target_metric

  if (params.length === 0) {
    return buildEmptyReport(config, sc)
  }

  // Generovat kombinace parametrů
  let combos = generateCombos(params)
  if (combos.length > MAX_RUNS) combos = combos.slice(0, MAX_RUNS)

  const results: SweepResult[] = []

  for (const combo of combos) {
    const modGraph = applyParamOverrides(graph, combo)
    const report   = runScenario(modGraph, sc)
    const metric   = extractMetric(report.summary, targetPool, targetMetric)
    results.push({ param_values: combo, metric_value: metric })
  }

  // Sensitivity analysis pro každý parametr
  const sensitivity: Record<string, SweepSensitivity> = {}
  const tornado: TornadoEntry[] = []

  for (const p of params) {
    const key = `${p.node_id}.${p.field}`
    const sens = computeSensitivity(results, key)
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

  if (params.length === 1) {
    const p   = params[0]
    const key = `${p.node_id}.${p.field}`
    for (let i = 0; i <= p.steps; i++) {
      const t   = i / Math.max(p.steps, 1)
      const val = p.min + (p.max - p.min) * t
      combos.push({ [key]: val })
    }
  } else if (params.length >= 2) {
    const p1   = params[0]
    const p2   = params[1]
    const key1 = `${p1.node_id}.${p1.field}`
    const key2 = `${p2.node_id}.${p2.field}`
    for (let i = 0; i <= p1.steps; i++) {
      const t1  = i / Math.max(p1.steps, 1)
      const v1  = p1.min + (p1.max - p1.min) * t1
      for (let j = 0; j <= p2.steps; j++) {
        const t2 = j / Math.max(p2.steps, 1)
        const v2 = p2.min + (p2.max - p2.min) * t2
        combos.push({ [key1]: v1, [key2]: v2 })
      }
    }
  }

  return combos
}

// ==================== APLIKOVÁNÍ OVERRIDE NA GRAF ====================

function applyParamOverrides(graph: GSSGraph, overrides: Record<string, number>): GSSGraph {
  const nodes: GSSNode[] = graph.nodes.map((n) => {
    const nodeId = String(n.id)
    const updated = { ...n, data: { ...n.data } as Record<string, unknown> }
    for (const [key, value] of Object.entries(overrides)) {
      const [oNodeId, field] = key.split('.')
      if (oNodeId === nodeId && field) {
        ;(updated.data as Record<string, unknown>)[field] = value
      }
    }
    return updated as unknown as GSSNode
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
    case 'final_value':      return summary.final_values?.[targetPool]      ?? 0
    case 'min_value':        return summary.min_values?.[targetPool]        ?? 0
    case 'max_value':        return summary.max_values?.[targetPool]        ?? 0
    case 'time_to_threshold': return summary.time_to_threshold?.[targetPool] ?? -1
    default:                 return summary.final_values?.[targetPool]      ?? 0
  }
}

// ==================== SENSITIVITY ANALYSIS ====================

function computeSensitivity(results: SweepResult[], paramKey: string): SweepSensitivity {
  const xs: number[] = []
  const ys: number[] = []

  for (const r of results) {
    const pv = r.param_values[paramKey]
    if (pv !== undefined) {
      xs.push(pv)
      ys.push(r.metric_value)
    }
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
  const header = [...keys, 'metric'].join(',')
  const rows = report.results.map((r) => {
    const cols = keys.map((k) => r.param_values[k].toFixed(4))
    return [...cols, r.metric_value.toFixed(4)].join(',')
  })
  return [header, ...rows].join('\n')
}
