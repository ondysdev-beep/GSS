// RecommendationEngine.ts — port GDScript RecommendationEngine.gd
// Generuje návrhy úprav parametrů na základě VerdictReport (max 5 per run).

import type { VerdictReport, HealthScore, CriticalFailure } from '../types/simulation'

export interface Recommendation {
  target_parameter: string
  current_value: string | number
  suggested_value: string | number
  expected_improvement: number
  trade_off: string
  confidence: number
}

const MAX_PER_RUN      = 5
const MAX_PER_FAILURE  = 2

// ==================== MAIN API ====================

export function generateRecommendations(
  verdictReport: VerdictReport,
  systemParameters: Record<string, number> = {},
): Recommendation[] {
  const recs: Recommendation[] = []
  const usedParams = new Set<string>()

  // Priority 1: kritická selhání
  let failureCount = 0
  for (const failure of verdictReport.failure_report.failures) {
    if (failureCount >= MAX_PER_FAILURE) break
    const rec = createRecForFailure(failure, systemParameters, usedParams)
    if (rec) { recs.push(rec); failureCount++ }
  }

  // Priority 2: nízká zdravotní sub-skóre
  if (recs.length < MAX_PER_RUN) {
    const healthRecs = generateHealthRecs(
      verdictReport.health_score,
      systemParameters,
      usedParams,
    )
    for (const r of healthRecs) {
      if (recs.length >= MAX_PER_RUN) break
      recs.push(r)
    }
  }

  recs.sort((a, b) => b.expected_improvement - a.expected_improvement)
  return recs.slice(0, MAX_PER_RUN)
}

// ==================== FAILURE RECOMMENDATIONS ====================

function createRecForFailure(
  failure: CriticalFailure,
  params: Record<string, number>,
  used: Set<string>,
): Recommendation | null {
  switch (failure.type) {
    case 'INFINITE_GROWTH':    return recInfiniteGrowth(failure, params, used)
    case 'ECONOMY_COLLAPSE':   return recEconomyCollapse(failure, params, used)
    case 'DEADLOCK':           return recDeadlock(failure)
    case 'HARD_BOTTLENECK':    return recBottleneck(failure, params, used)
    default: return null
  }
}

function recInfiniteGrowth(
  failure: CriticalFailure,
  params: Record<string, number>,
  used: Set<string>,
): Recommendation {
  const details = failure.details ?? {}
  const resourceName = String(details['resource_name'] ?? 'resource')
  const growthRate = Number(details['growth_rate_per_cycle'] ?? 1.5)

  const candidates = [
    `${resourceName}_production_rate`,
    `${resourceName}_rate`,
    'production_rate',
    `${resourceName}_multiplier`,
  ]

  for (const param of candidates) {
    if (param in params && !used.has(param)) {
      const cur = params[param]
      const sug = Math.round((cur / growthRate) * 100) / 100
      used.add(param)
      return {
        target_parameter: param,
        current_value: cur,
        suggested_value: sug,
        expected_improvement: 15,
        trade_off: `Progression speed will decrease by ${Math.round((1 - sug / cur) * 100)}%`,
        confidence: 0.85,
      }
    }
  }

  return {
    target_parameter: `${resourceName}_production_rate`,
    current_value: 'unknown',
    suggested_value: `reduce by ${Math.round((growthRate - 1) * 100)}%`,
    expected_improvement: 15,
    trade_off: 'Slower resource accumulation',
    confidence: 0.6,
  }
}

function recEconomyCollapse(
  failure: CriticalFailure,
  params: Record<string, number>,
  used: Set<string>,
): Recommendation {
  const details = failure.details ?? {}
  const collapseType = String(details['collapse_type'] ?? 'value')
  const currencyName = String(details['currency_name'] ?? 'currency')

  if (collapseType === 'value') {
    const candidates = [
      `${currencyName}_drain_rate`,
      `${currencyName}_cost_multiplier`,
      'cost_multiplier',
      'drain_rate',
    ]
    for (const param of candidates) {
      if (param in params && !used.has(param)) {
        const cur = params[param]
        const sug = Math.round(cur * 0.5 * 100) / 100
        used.add(param)
        return {
          target_parameter: param,
          current_value: cur,
          suggested_value: sug,
          expected_improvement: 20,
          trade_off: 'Game may become easier, faster progression',
          confidence: 0.8,
        }
      }
    }
    return {
      target_parameter: `${currencyName}_drain_rate`,
      current_value: 'unknown',
      suggested_value: 'reduce by 50%',
      expected_improvement: 20,
      trade_off: 'Reduced difficulty',
      confidence: 0.5,
    }
  }

  return {
    target_parameter: `${currencyName}_income_rate`,
    current_value: 'unknown',
    suggested_value: 'increase by 100%',
    expected_improvement: 20,
    trade_off: 'Faster start, potential late-game inflation',
    confidence: 0.5,
  }
}

function recDeadlock(failure: CriticalFailure): Recommendation {
  const details = failure.details ?? {}
  const stateId   = String(details['state_id'] ?? 'unknown')
  const cyclePath = Array.isArray(details['cycle_path']) ? (details['cycle_path'] as string[]) : []

  if (cyclePath.length > 0) {
    return {
      target_parameter: 'requirement_chain',
      current_value: cyclePath.join(' → '),
      suggested_value: `break cycle at '${cyclePath[0]}'`,
      expected_improvement: 25,
      trade_off: 'Need to add alternative progression path',
      confidence: 0.9,
    }
  }
  return {
    target_parameter: `${stateId}_transitions`,
    current_value: 'no valid transitions',
    suggested_value: 'add exit transition or mark as terminal',
    expected_improvement: 25,
    trade_off: 'None if state should be terminal',
    confidence: 0.85,
  }
}

function recBottleneck(
  failure: CriticalFailure,
  params: Record<string, number>,
  used: Set<string>,
): Recommendation {
  const details     = failure.details ?? {}
  const gateId      = String(details['gate_id'] ?? 'gate')
  const timeMulti   = Number(details['time_multiplier'] ?? 3)
  const expectedTime = Number(details['expected_time'] ?? 1)

  const candidates = [
    `${gateId}_requirement`,
    `${gateId}_threshold`,
    `${gateId}_cost`,
  ]
  for (const param of candidates) {
    if (param in params && !used.has(param)) {
      const cur = params[param]
      const sug = Math.round((cur / timeMulti) * 10) / 10
      used.add(param)
      return {
        target_parameter: param,
        current_value: cur,
        suggested_value: sug,
        expected_improvement: 12,
        trade_off: 'Gate becomes easier, may reduce sense of achievement',
        confidence: 0.75,
      }
    }
  }
  return {
    target_parameter: `${gateId}_requirement`,
    current_value: `causes ${timeMulti.toFixed(1)}× delay`,
    suggested_value: `reduce to achieve ~${expectedTime.toFixed(1)}s`,
    expected_improvement: 12,
    trade_off: 'Faster progression through gate',
    confidence: 0.6,
  }
}

// ==================== HEALTH RECOMMENDATIONS ====================

function generateHealthRecs(
  healthScore: HealthScore,
  params: Record<string, number>,
  used: Set<string>,
): Recommendation[] {
  const subScores: { name: keyof Omit<HealthScore, 'total'>; value: number }[] = [
    { name: 'stability',      value: healthScore.stability },
    { name: 'convergence',    value: healthScore.convergence },
    { name: 'fairness',       value: healthScore.fairness },
    { name: 'exploitability', value: healthScore.exploitability },
    { name: 'recovery',       value: healthScore.recovery },
  ]
  subScores.sort((a, b) => a.value - b.value)

  const recs: Recommendation[] = []
  for (const { name, value } of subScores) {
    if (recs.length >= 2) break
    if (value >= 70) continue
    const rec = createHealthRec(name, value, params, used)
    if (rec) recs.push(rec)
  }
  return recs
}

function createHealthRec(
  scoreName: keyof Omit<HealthScore, 'total'>,
  scoreValue: number,
  _params: Record<string, number>,
  _used: Set<string>,
): Recommendation | null {
  const improvement = (70 - scoreValue) * 0.3

  const presets: Record<string, Omit<Recommendation, 'expected_improvement'>> = {
    stability: {
      target_parameter: 'production_variance',
      current_value: 'high variance detected',
      suggested_value: 'add rate smoothing or caps',
      trade_off: 'Less dynamic resource flow',
      confidence: 0.65,
    },
    convergence: {
      target_parameter: 'equilibrium_mechanics',
      current_value: 'system diverges over time',
      suggested_value: 'add diminishing returns or soft caps',
      trade_off: 'Reduced late-game growth',
      confidence: 0.6,
    },
    fairness: {
      target_parameter: 'archetype_balance',
      current_value: 'uneven outcomes',
      suggested_value: 'add catch-up mechanics or normalize rewards',
      trade_off: 'May reduce rewards for optimal play',
      confidence: 0.55,
    },
    exploitability: {
      target_parameter: 'exploit_prevention',
      current_value: 'system is exploitable',
      suggested_value: 'add cooldowns or diminishing returns',
      trade_off: 'Reduced player freedom',
      confidence: 0.7,
    },
    recovery: {
      target_parameter: 'recovery_mechanics',
      current_value: 'weak recovery from setbacks',
      suggested_value: 'add rubber-banding or recovery bonuses',
      trade_off: 'Reduced consequences for mistakes',
      confidence: 0.5,
    },
  }

  const preset = presets[scoreName]
  if (!preset) return null
  return { ...preset, expected_improvement: improvement }
}
