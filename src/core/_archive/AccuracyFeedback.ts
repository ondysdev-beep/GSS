// AccuracyFeedback.ts — port GDScript AccuracyFeedback.gd
// Sledování přesnosti verdiktů a rekalibraci prahů.

import type { VerdictState } from '../types/simulation'

export type FeedbackType = 'CORRECT' | 'FALSE_POSITIVE' | 'MISSED_ISSUE'
export type CalibrationAction = 'MAINTAIN' | 'RAISE_THRESHOLD' | 'LOWER_THRESHOLD'

// ==================== TYPY ====================

export interface VerdictFeedback {
  feedback_id:        string
  system_id:          string
  system_name:        string
  verdict_issued:     VerdictState | ''
  verdict_confidence: number
  health_score:       number
  failures_detected:  string[]
  feedback_type:      FeedbackType
  feedback_timestamp: string
  verdict_timestamp:  string
  days_since_verdict: number
  user_note:          string
  system_parameters:  Record<string, unknown>
  simulation_config:  Record<string, unknown>
}

export interface AccuracyMetrics {
  total_feedback:       number
  correct_count:        number
  false_positive_count: number
  missed_issue_count:   number
  accuracy_rate:        number
  false_positive_rate:  number
  missed_issue_rate:    number
}

export interface FailureTypeMetrics {
  failure_type:   string
  true_positives: number
  false_positives: number
  missed:         number
  precision:      number
  recall:         number
}

export interface CalibrationResult {
  action:               CalibrationAction
  failure_type:         string
  current_threshold:    number
  suggested_threshold:  number
  reason:               string
  sample_count:         number
  false_positive_rate:  number
  missed_issue_rate:    number
}

export interface AccuracyReport {
  overall:              AccuracyMetrics
  by_verdict:           Record<string, AccuracyMetrics>
  by_failure_type:      Record<string, FailureTypeMetrics>
  total_feedback_count: number
}

// ==================== FACTORY ====================

let _fbCounter = 0

export function createFeedback(): VerdictFeedback {
  return {
    feedback_id:        `FB-${Date.now()}-${String(_fbCounter++).padStart(4, '0')}`,
    system_id:          '',
    system_name:        '',
    verdict_issued:     '',
    verdict_confidence: 0,
    health_score:       0,
    failures_detected:  [],
    feedback_type:      'CORRECT',
    feedback_timestamp: new Date().toISOString(),
    verdict_timestamp:  '',
    days_since_verdict: 0,
    user_note:          '',
    system_parameters:  {},
    simulation_config:  {},
  }
}

export function submitFeedback(
  systemId:       string,
  systemName:     string,
  verdictState:   VerdictState,
  confidenceScore: number,
  healthScore:    number,
  failures:       string[],
  feedbackType:   FeedbackType,
  userNote = '',
): VerdictFeedback {
  return {
    ...createFeedback(),
    system_id:          systemId,
    system_name:        systemName,
    verdict_issued:     verdictState,
    verdict_confidence: confidenceScore,
    health_score:       healthScore,
    failures_detected:  failures,
    feedback_type:      feedbackType,
    user_note:          userNote,
    verdict_timestamp:  new Date().toISOString(),
  }
}

// ==================== ACCURACY CALCULATOR ====================

export function calcOverallAccuracy(feedback: VerdictFeedback[]): AccuracyMetrics {
  const total   = feedback.length
  const correct = feedback.filter((f) => f.feedback_type === 'CORRECT').length
  const fp      = feedback.filter((f) => f.feedback_type === 'FALSE_POSITIVE').length
  const missed  = feedback.filter((f) => f.feedback_type === 'MISSED_ISSUE').length
  return {
    total_feedback:       total,
    correct_count:        correct,
    false_positive_count: fp,
    missed_issue_count:   missed,
    accuracy_rate:        total > 0 ? correct / total : 0,
    false_positive_rate:  total > 0 ? fp / total : 0,
    missed_issue_rate:    total > 0 ? missed / total : 0,
  }
}

export function calcVerdictAccuracy(feedback: VerdictFeedback[], verdict: string): AccuracyMetrics {
  return calcOverallAccuracy(feedback.filter((f) => f.verdict_issued === verdict))
}

export function calcFailureTypeMetrics(feedback: VerdictFeedback[], failureType: string): FailureTypeMetrics {
  let tp = 0, fp = 0, missed = 0
  for (const fb of feedback) {
    const detected = fb.failures_detected.includes(failureType)
    if (fb.feedback_type === 'CORRECT' && detected)          tp++
    else if (fb.feedback_type === 'FALSE_POSITIVE' && detected) fp++
    else if (fb.feedback_type === 'MISSED_ISSUE') {
      if (fb.user_note.toLowerCase().includes(failureType.toLowerCase()) || !detected) missed++
    }
  }
  const totalPos    = tp + fp
  const totalActual = tp + missed
  return {
    failure_type:    failureType,
    true_positives:  tp,
    false_positives: fp,
    missed,
    precision:       totalPos    > 0 ? tp / totalPos    : 0,
    recall:          totalActual > 0 ? tp / totalActual : 0,
  }
}

// ==================== THRESHOLD CALIBRATOR ====================

const MIN_SAMPLES_FOR_RECAL    = 20
const FALSE_POSITIVE_TOLERANCE = 0.15
const MISSED_ISSUE_TOLERANCE   = 0.05

export function evaluateThreshold(
  failureType:       string,
  currentThreshold:  number,
  feedback:          VerdictFeedback[],
): CalibrationResult {
  const relevant = feedback.filter((f) => f.failures_detected.includes(failureType))
  const base: CalibrationResult = {
    action: 'MAINTAIN', failure_type: failureType,
    current_threshold: currentThreshold, suggested_threshold: currentThreshold,
    reason: '', sample_count: relevant.length, false_positive_rate: 0, missed_issue_rate: 0,
  }

  if (relevant.length < MIN_SAMPLES_FOR_RECAL) {
    return { ...base, reason: `Insufficient samples (${relevant.length}/${MIN_SAMPLES_FOR_RECAL} required)` }
  }

  const falsePos = relevant.filter((f) => f.feedback_type === 'FALSE_POSITIVE').length
  const missed   = feedback.filter((f) =>
    f.feedback_type === 'MISSED_ISSUE' && f.user_note.toLowerCase().includes(failureType.toLowerCase()),
  ).length

  const fpRate     = falsePos / relevant.length
  const missedRate = feedback.length > 0 ? missed / feedback.length : 0

  if (fpRate > FALSE_POSITIVE_TOLERANCE) {
    return {
      ...base, action: 'RAISE_THRESHOLD', suggested_threshold: currentThreshold * 1.1,
      false_positive_rate: fpRate, missed_issue_rate: missedRate,
      reason: `False positive rate (${(fpRate * 100).toFixed(1)}%) exceeds tolerance (${(FALSE_POSITIVE_TOLERANCE * 100).toFixed(1)}%)`,
    }
  }
  if (missedRate > MISSED_ISSUE_TOLERANCE) {
    return {
      ...base, action: 'LOWER_THRESHOLD', suggested_threshold: currentThreshold * 0.9,
      false_positive_rate: fpRate, missed_issue_rate: missedRate,
      reason: `Missed issue rate (${(missedRate * 100).toFixed(1)}%) exceeds tolerance (${(MISSED_ISSUE_TOLERANCE * 100).toFixed(1)}%)`,
    }
  }
  return { ...base, false_positive_rate: fpRate, missed_issue_rate: missedRate, reason: 'Threshold performing within tolerance' }
}

// ==================== CONFIDENCE ADJUSTER ====================

export function adjustConfidence(
  rawConfidence:   number,
  failureTypes:    string[],
  accuracyHistory: Record<string, number>,
): number {
  if (failureTypes.length === 0) return rawConfidence
  const known = failureTypes.filter((ft) => accuracyHistory[ft] !== undefined)
  if (known.length === 0) return rawConfidence
  const avgAccuracy = known.reduce((s, ft) => s + accuracyHistory[ft], 0) / known.length
  return rawConfidence * avgAccuracy
}

// ==================== MAIN REPORT ====================

const KNOWN_VERDICTS      = ['SAFE', 'CAUTION', 'UNSAFE', 'CRITICAL'] as const
const KNOWN_FAILURE_TYPES = ['INFINITE_GROWTH', 'ECONOMY_COLLAPSE', 'DEADLOCK', 'HARD_BOTTLENECK'] as const

export function getAccuracyReport(feedback: VerdictFeedback[]): AccuracyReport {
  const byVerdict: Record<string, AccuracyMetrics> = {}
  for (const v of KNOWN_VERDICTS) byVerdict[v] = calcVerdictAccuracy(feedback, v)

  const byFailureType: Record<string, FailureTypeMetrics> = {}
  for (const ft of KNOWN_FAILURE_TYPES) byFailureType[ft] = calcFailureTypeMetrics(feedback, ft)

  return { overall: calcOverallAccuracy(feedback), by_verdict: byVerdict, by_failure_type: byFailureType, total_feedback_count: feedback.length }
}

export function getCalibrationRecommendations(feedback: VerdictFeedback[]): CalibrationResult[] {
  const thresholds: Record<string, number> = { INFINITE_GROWTH: 1.5, ECONOMY_COLLAPSE: 0.1, DEADLOCK: 0.0, HARD_BOTTLENECK: 3.0 }
  return Object.entries(thresholds)
    .map(([ft, threshold]) => evaluateThreshold(ft, threshold, feedback))
    .filter((r) => r.action !== 'MAINTAIN')
}

export function getFeedbackPromptData(verdictState: VerdictState, confidenceScore: number, allFeedback: VerdictFeedback[]) {
  return {
    verdict:               verdictState,
    confidence:            confidenceScore,
    total_feedback_count:  allFeedback.length,
    similar_verdict_count: allFeedback.filter((f) => f.verdict_issued === verdictState).length,
    prompt_text:           'Was this verdict accurate?',
    options: [
      { type: 'CORRECT',        label: '✓ Correct',        description: 'Verdict matched what happened' },
      { type: 'FALSE_POSITIVE', label: '⚠ False Positive', description: "Warning didn't materialize" },
      { type: 'MISSED_ISSUE',   label: '✗ Missed Issue',   description: "Problem the tool didn't catch" },
    ],
  }
}

export function formatAccuracyReport(feedback: VerdictFeedback[]): string {
  const report = getAccuracyReport(feedback)
  const o      = report.overall
  const lines  = [
    '═══════════════════════════════════════════════════════════════',
    '                    ACCURACY REPORT',
    '═══════════════════════════════════════════════════════════════',
    '',
    'OVERALL ACCURACY',
    `  Total feedback: ${o.total_feedback}`,
    `  Correct: ${o.correct_count} (${(o.accuracy_rate * 100).toFixed(1)}%)`,
    `  False Positives: ${o.false_positive_count} (${(o.false_positive_rate * 100).toFixed(1)}%)`,
    `  Missed Issues: ${o.missed_issue_count} (${(o.missed_issue_rate * 100).toFixed(1)}%)`,
    '',
    'BY VERDICT',
  ]
  for (const v of KNOWN_VERDICTS) {
    const vd = report.by_verdict[v]
    if (vd.total_feedback > 0) lines.push(`  ${v}: ${vd.total_feedback} verdicts, ${(vd.accuracy_rate * 100).toFixed(1)}% accurate`)
  }
  lines.push('', 'BY FAILURE TYPE')
  for (const ft of KNOWN_FAILURE_TYPES) {
    const ftd = report.by_failure_type[ft]
    if (ftd.true_positives + ftd.false_positives > 0) {
      lines.push(`  ${ft}:`, `    Precision: ${(ftd.precision * 100).toFixed(1)}% | Recall: ${(ftd.recall * 100).toFixed(1)}%`)
    }
  }
  lines.push('', '═══════════════════════════════════════════════════════════════')
  return lines.join('\n')
}
