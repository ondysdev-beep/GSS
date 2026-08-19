// CausalRecommendation.ts — port GDScript CausalRecommendation.gd
// Evidence-backed causal recommendations from sensitivity analysis.

import type { FailureType, HealthScore } from '../types/simulation'

// ==================== TYPY ====================

export interface ParameterSensitivity {
  parameter_id:          string
  parameter_name:        string
  base_value:            number
  sensitivity:           number
  variance_contribution: number
  correlation:           number
  test_low:              number
  test_high:             number
  metric_at_low:         number
  metric_at_high:        number
}

export interface CausalStep {
  description: string
  parameter:   string
  effect:      string
  magnitude:   string
}

export interface CausalChain {
  root_cause:      string
  root_parameter:  string
  steps:           CausalStep[]
  final_effect:    string
}

export interface CausalEvidence {
  variance_contribution: number
  sensitivity:           number
  correlation:           number
  test_data:             Record<string, unknown>
  causal_chain:          CausalChain | null
}

export interface EvidenceBackedRecommendation {
  parameter_id:              string
  parameter_name:            string
  current_value:             number
  suggested_value:           number
  change_percent:            number
  evidence:                  CausalEvidence | null
  expected_improvement:      number
  confidence_interval_low:   number
  confidence_interval_high:  number
  confidence:                number
  trade_off:                 string
  trade_off_severity:        'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT'
  priority:                  number
  failure_type:              string
}

// ==================== SENSITIVITY ANALYZER ====================

const TEST_DELTA = 0.1  // ±10%

export type SimRunFn = (overrides: Record<string, number>) => Record<string, unknown>

function extractMetric(result: Record<string, unknown> | null, metricName: string): number {
  if (!result) return 0
  if (metricName in result) return Number(result[metricName])
  if (metricName === 'health' && 'health_score' in result) return Number(result['health_score'])
  return 0
}

export function analyzeParameter(
  parameterId: string,
  baseValue:   number,
  runFn:       SimRunFn,
  targetMetric = 'health',
): ParameterSensitivity {
  const testHigh = baseValue * (1 + TEST_DELTA)
  const testLow  = baseValue * (1 - TEST_DELTA)

  const highResult = runFn({ [parameterId]: testHigh })
  const lowResult  = runFn({ [parameterId]: testLow })

  const metricHigh = extractMetric(highResult, targetMetric)
  const metricLow  = extractMetric(lowResult,  targetMetric)

  const paramDelta  = testHigh - testLow
  const metricDelta = metricHigh - metricLow
  const sensitivity = paramDelta !== 0 ? metricDelta / paramDelta : 0

  const absSens    = Math.abs(sensitivity)
  const correlation = (metricDelta > 0 && paramDelta > 0) || (metricDelta < 0 && paramDelta < 0)
    ? absSens / (absSens + 1)
    : -(absSens / (absSens + 1))

  return {
    parameter_id:          parameterId,
    parameter_name:        parameterId.replace(/_/g, ' '),
    base_value:            baseValue,
    sensitivity,
    variance_contribution: 0,
    correlation,
    test_low:              testLow,
    test_high:             testHigh,
    metric_at_low:         metricLow,
    metric_at_high:        metricHigh,
  }
}

export function calcVarianceAttribution(sensitivities: ParameterSensitivity[]): ParameterSensitivity[] {
  const totalSq = sensitivities.reduce((s, p) => s + p.sensitivity * p.sensitivity, 0)
  return sensitivities.map((p) => ({
    ...p,
    variance_contribution: totalSq > 0 ? (p.sensitivity * p.sensitivity) / totalSq : 0,
  }))
}

// ==================== CAUSAL CHAIN ====================

function buildCausalChain(failureType: FailureType, sensitivity: ParameterSensitivity): CausalChain {
  const pid = sensitivity.parameter_id
  const val = sensitivity.base_value.toFixed(2)
  const steps: CausalStep[] = []
  let finalEffect = ''

  switch (failureType) {
    case 'INFINITE_GROWTH':
      steps.push(
        { description: `'${pid}' (${val}) causes resource generation above consumption`, parameter: pid, effect: 'surplus', magnitude: 'high' },
        { description: 'Surplus compounds each cycle',         parameter: '', effect: 'growth',   magnitude: 'exponential' },
        { description: 'Resource value grows unbounded',       parameter: '', effect: 'overflow',  magnitude: 'critical' },
        { description: 'System reaches INFINITE_GROWTH state', parameter: '', effect: 'failure',   magnitude: 'critical' },
      )
      finalEffect = 'Economy trivializes or overflows'
      break
    case 'ECONOMY_COLLAPSE':
      steps.push(
        { description: `'${pid}' (${val}) creates drain exceeding income`, parameter: pid, effect: 'deficit',  magnitude: 'high' },
        { description: 'Players cannot afford progression',                parameter: '', effect: 'stall',     magnitude: 'high' },
        { description: 'Income growth stalls',                             parameter: '', effect: 'decline',   magnitude: 'critical' },
        { description: 'Economy enters collapse spiral',                   parameter: '', effect: 'failure',   magnitude: 'critical' },
      )
      finalEffect = 'Players stuck, cannot recover'
      break
    case 'DEADLOCK':
      steps.push(
        { description: `'${pid}' (${val}) creates unachievable requirement`, parameter: pid, effect: 'block',    magnitude: 'critical' },
        { description: 'No valid state transitions available',              parameter: '', effect: 'deadlock',  magnitude: 'critical' },
        { description: 'Player reaches terminal non-goal state',            parameter: '', effect: 'failure',   magnitude: 'critical' },
      )
      finalEffect = 'Progression impossible'
      break
    case 'HARD_BOTTLENECK':
      steps.push(
        { description: `'${pid}' (${val}) makes gate requirement too high`, parameter: pid, effect: 'choke',    magnitude: 'high' },
        { description: 'Time to pass gate exceeds acceptable threshold',    parameter: '', effect: 'frustration', magnitude: 'high' },
        { description: 'No alternative progression paths exist',            parameter: '', effect: 'churn',      magnitude: 'high' },
      )
      finalEffect = 'Players quit at bottleneck'
      break
    default:
      finalEffect = 'Unknown failure mode'
  }

  return { root_cause: sensitivity.parameter_name, root_parameter: pid, steps, final_effect: finalEffect }
}

export function formatCausalChain(chain: CausalChain): string {
  const lines = ['CAUSAL CHAIN:']
  chain.steps.forEach((step, i) => {
    lines.push(`  ${i + 1}. ${step.description}`)
    if (i < chain.steps.length - 1) lines.push('     ↓ causes')
  })
  lines.push('', `ROOT CAUSE: ${chain.root_cause}`)
  return lines.join('\n')
}

// ==================== RECOMMENDATION GENERATOR ====================

const MAX_RECOMMENDATIONS    = 5
const MIN_VARIANCE_CONTRIBUTION = 0.1

function fixValueForFailure(failureType: FailureType, baseValue: number): number {
  switch (failureType) {
    case 'INFINITE_GROWTH':  return baseValue * 0.7
    case 'ECONOMY_COLLAPSE': return baseValue * 1.3
    case 'DEADLOCK':         return baseValue * 0.6
    case 'HARD_BOTTLENECK':  return baseValue * 0.5
    default:                 return baseValue * 0.8
  }
}

function identifyTradeOff(failureType: FailureType, sensitivity: ParameterSensitivity, newValue: number): string {
  const change = sensitivity.base_value !== 0 ? (newValue - sensitivity.base_value) / sensitivity.base_value : 0
  if (Math.abs(change) < 0.1) return ''
  switch (failureType) {
    case 'INFINITE_GROWTH':  return `Progression speed reduced by ~${(Math.abs(change) * 100).toFixed(0)}%, may feel slower to players`
    case 'ECONOMY_COLLAPSE': return 'Economy becomes more generous, may reduce monetization pressure'
    case 'HARD_BOTTLENECK':  return 'Gate becomes easier, may reduce sense of accomplishment'
    default:                 return ''
  }
}

function buildRecFromSensitivity(
  sensitivity:  ParameterSensitivity,
  failureType:  string,
  suggestedVal: number,
  chain:        CausalChain | null,
): EvidenceBackedRecommendation {
  const changePct = sensitivity.base_value !== 0 ? ((suggestedVal - sensitivity.base_value) / sensitivity.base_value) * 100 : 0
  const evidence: CausalEvidence = {
    variance_contribution: sensitivity.variance_contribution,
    sensitivity:           sensitivity.sensitivity,
    correlation:           sensitivity.correlation,
    test_data:             {
      parameter_id: sensitivity.parameter_id, base_value: sensitivity.base_value,
      test_low: sensitivity.test_low, test_high: sensitivity.test_high,
      metric_at_low: sensitivity.metric_at_low, metric_at_high: sensitivity.metric_at_high,
    },
    causal_chain: chain,
  }
  const sensImpact = Math.abs(sensitivity.sensitivity) * Math.abs(suggestedVal - sensitivity.base_value)
  const improvement = Math.max(5, Math.min(30, sensImpact))
  return {
    parameter_id:             sensitivity.parameter_id,
    parameter_name:           sensitivity.parameter_name,
    current_value:            sensitivity.base_value,
    suggested_value:          suggestedVal,
    change_percent:           changePct,
    evidence,
    expected_improvement:     improvement,
    confidence_interval_low:  improvement * 0.6,
    confidence_interval_high: improvement * 1.4,
    confidence:               0.5 + Math.abs(sensitivity.correlation) * 0.4,
    trade_off:                '',
    trade_off_severity:       'NONE',
    priority:                 1,
    failure_type:             failureType,
  }
}

export function generateRecommendations(
  failures:    Array<{ type: FailureType; severity: string; message: string }>,
  healthScore: HealthScore,
  parameters:  Record<string, number>,
  runFn:       SimRunFn,
): EvidenceBackedRecommendation[] {
  // Step 1: Sensitivity for all params
  let sensitivities = Object.entries(parameters).map(([id, val]) =>
    analyzeParameter(id, val, runFn, 'health'),
  )

  // Step 2: Variance attribution
  sensitivities = calcVarianceAttribution(sensitivities)

  const recs: EvidenceBackedRecommendation[] = []
  const bestSensitivity = sensitivities.length > 0
    ? sensitivities.reduce((best, s) => s.variance_contribution > best.variance_contribution ? s : best)
    : null

  // Step 3: Per failure
  if (bestSensitivity && bestSensitivity.variance_contribution >= MIN_VARIANCE_CONTRIBUTION) {
    for (const f of failures) {
      const suggested = fixValueForFailure(f.type, bestSensitivity.base_value)
      const chain     = buildCausalChain(f.type, bestSensitivity)
      const rec       = buildRecFromSensitivity(bestSensitivity, f.type, suggested, chain)
      rec.trade_off  = identifyTradeOff(f.type, bestSensitivity, suggested)
      rec.trade_off_severity = rec.trade_off ? 'MODERATE' : 'NONE'
      recs.push(rec)
    }
  }

  // Step 4: Low health sub-scores
  const subScores: [keyof HealthScore, number][] = [
    ['stability', healthScore.stability], ['convergence', healthScore.convergence],
    ['fairness', healthScore.fairness], ['exploitability', healthScore.exploitability], ['recovery', healthScore.recovery],
  ]
  for (const [name, value] of subScores) {
    if (value < 50 && bestSensitivity) {
      const suggested = bestSensitivity.sensitivity > 0
        ? bestSensitivity.base_value * 0.85
        : bestSensitivity.base_value * 1.15
      const changePct = bestSensitivity.base_value !== 0 ? ((suggested - bestSensitivity.base_value) / bestSensitivity.base_value) * 100 : 0
      const improvement = (50 - value) * bestSensitivity.variance_contribution
      recs.push({
        parameter_id: bestSensitivity.parameter_id, parameter_name: bestSensitivity.parameter_name,
        current_value: bestSensitivity.base_value, suggested_value: suggested, change_percent: changePct,
        evidence: { variance_contribution: bestSensitivity.variance_contribution, sensitivity: bestSensitivity.sensitivity, correlation: bestSensitivity.correlation, test_data: {}, causal_chain: null },
        expected_improvement: improvement, confidence_interval_low: improvement * 0.5, confidence_interval_high: improvement * 1.5,
        confidence: 0.6, trade_off: '', trade_off_severity: 'NONE', priority: 1, failure_type: `LOW_${String(name).toUpperCase()}`,
      })
    }
  }

  // Step 5: Sort, assign priorities, limit
  recs.sort((a, b) => b.expected_improvement - a.expected_improvement)
  return recs.slice(0, MAX_RECOMMENDATIONS).map((r, i) => ({ ...r, priority: i + 1 }))
}

// ==================== FORMATTING ====================

export function formatRecommendation(rec: EvidenceBackedRecommendation): string {
  const lines = [
    `RECOMMENDATION #${rec.priority}: Change '${rec.parameter_id}' from ${rec.current_value.toFixed(2)} to ${rec.suggested_value.toFixed(2)}`,
    '',
  ]
  if (rec.evidence) {
    const e    = rec.evidence
    const absc = Math.abs(e.correlation)
    const strength = absc > 0.7 ? 'strong' : absc > 0.4 ? 'moderate' : 'weak'
    lines.push(
      'EVIDENCE:',
      `  • This parameter contributes ${(e.variance_contribution * 100).toFixed(0)}% of the variance in the failing metric`,
      `  • Sensitivity analysis: ±10% change → ±${Math.abs(e.sensitivity * 0.2).toFixed(1)} score impact`,
      `  • Correlation with issue: r = ${absc.toFixed(2)} (${strength})`,
      '',
    )
  }
  lines.push(
    'EXPECTED IMPACT:',
    `  • Health score: +${rec.expected_improvement.toFixed(0)}`,
    `  • 95% confidence interval: +${rec.confidence_interval_low.toFixed(0)} to +${rec.confidence_interval_high.toFixed(0)}`,
    '',
    'TRADE-OFF:',
    rec.trade_off ? `  • ${rec.trade_off}\n  • Severity: ${rec.trade_off_severity}` : '  • None detected',
    '',
    `CONFIDENCE: ${(rec.confidence * 100).toFixed(0)}%`,
  )
  return lines.join('\n')
}

export function formatFullInspection(rec: EvidenceBackedRecommendation): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '              RECOMMENDATION INSPECTION',
    '═══════════════════════════════════════════════════════════════',
    '',
    formatRecommendation(rec),
    '',
  ]
  if (rec.evidence?.causal_chain) {
    lines.push('─── CAUSAL CHAIN ───', '', formatCausalChain(rec.evidence.causal_chain), '')
  }
  lines.push(
    '─── VERIFICATION ───',
    '',
    'To verify this recommendation:',
    '  1. Apply the suggested change',
    '  2. Re-run simulation',
    '  3. Compare health score',
    '',
    `Expected result: Health score improvement of ${rec.confidence_interval_low.toFixed(0)}-${rec.confidence_interval_high.toFixed(0)} points`,
    '',
    '═══════════════════════════════════════════════════════════════',
  )
  return lines.join('\n')
}
