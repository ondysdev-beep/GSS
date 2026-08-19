// RNGPsychology.ts — port GDScript RNGPsychology.gd
// Psychologická analýza RNG systémů: frustrace, férovost, pity doporučení.

export type RiskLevel   = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'CRITICAL'
export type StreakDanger = 'ACCEPTABLE' | 'CONCERNING' | 'DANGEROUS'
export type PityUrgency  = 'OPTIONAL' | 'RECOMMENDED' | 'REQUIRED'

// ==================== TYPY ====================

export interface PainMetrics {
  frustration_index:         number
  rage_quit_risk:            number
  perceived_unfairness:      number
  reward_starvation_score:   number
  hope_depletion_rate:       number
  recovery_time_estimate:    number
}

export interface StreakAnalysis {
  max_failure_streak:               number
  avg_failure_streak:               number
  failure_streak_at_percentile_95:  number
  failure_streak_at_percentile_99:  number
  streak_frustration_multiplier:    number
  near_miss_count:                  number
  cold_streak_duration_seconds:     number
}

export interface FairnessPerception {
  actual_success_rate:           number
  perceived_success_rate:        number
  fairness_gap:                  number
  pattern_recognition_triggered: boolean
  recency_bias_impact:           number
  confirmation_bias_risk:        number
  visual_fairness_flags:         string[]
}

export interface PityRecommendation {
  recommended:          boolean
  urgency:              PityUrgency
  pity_threshold:       number
  soft_pity_start:      number
  soft_pity_increment:  number
  reasoning:            string
  expected_impact:      Record<string, string>
}

export interface ActionItem {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  action:   string
  reason:   string
  impact:   string
}

export interface RNGAnalysisReport {
  pain_metrics:        PainMetrics
  streak_analysis:     StreakAnalysis
  fairness_perception: FairnessPerception
  pity_recommendation: PityRecommendation
  action_items:        ActionItem[]
  designer_summary:    string
  overall_risk:        RiskLevel
}

export interface AttemptResult {
  success:   boolean
  near_miss: boolean
  value?:    number
}

// ==================== PAIN METRICS ====================

const FRUSTRATION_STREAK_THRESHOLD = 5
const RAGE_QUIT_STREAK_THRESHOLD   = 10

export function getOverallPainScore(m: PainMetrics): number {
  return m.frustration_index * 0.30 + m.perceived_unfairness * 0.25 + m.reward_starvation_score * 0.25 + m.rage_quit_risk * 100 * 0.20
}

export function getRiskLevel(m: PainMetrics): RiskLevel {
  const s = getOverallPainScore(m)
  if (s < 20) return 'LOW'
  if (s < 40) return 'MODERATE'
  if (s < 60) return 'HIGH'
  if (s < 80) return 'VERY_HIGH'
  return 'CRITICAL'
}

// ==================== FRUSTRATION ====================

const BASE_FRUSTRATION_PER_FAIL  = 5.0
const FRUSTRATION_EXPONENT       = 1.4
const FRUSTRATION_DECAY_PER_WIN  = 0.6
const NEAR_MISS_FRUSTRATION_BONUS = 15.0

export function calcCumulativeFrustration(sequence: AttemptResult[], timeBetweenAttempts = 5.0): number {
  let frustration = 0
  let consecutive = 0

  for (const attempt of sequence) {
    if (attempt.success) {
      frustration *= FRUSTRATION_DECAY_PER_WIN
      consecutive = 0
    } else {
      consecutive++
      let impact = BASE_FRUSTRATION_PER_FAIL * Math.pow(FRUSTRATION_EXPONENT, consecutive - 1)
      if (attempt.near_miss) impact += NEAR_MISS_FRUSTRATION_BONUS
      frustration += impact
    }
  }

  const timeFactor = 1 + (10 / Math.max(timeBetweenAttempts, 1)) * 0.1
  return Math.max(0, Math.min(100, frustration * timeFactor))
}

export function estimateRageQuitProbability(frustration: number, sessionLengthMinutes: number): number {
  const base = frustration / 150
  let factor = 1.0
  if (sessionLengthMinutes < 5)   factor = 1.3
  else if (sessionLengthMinutes > 30) factor = 0.8
  return Math.max(0, Math.min(1, base * factor))
}

// ==================== STREAK ANALYSIS ====================

export function getStreakDangerLevel(analysis: StreakAnalysis): StreakDanger {
  if (analysis.max_failure_streak < FRUSTRATION_STREAK_THRESHOLD) return 'ACCEPTABLE'
  if (analysis.max_failure_streak < RAGE_QUIT_STREAK_THRESHOLD)   return 'CONCERNING'
  return 'DANGEROUS'
}

export function getEmotionalState(currentStreak: number): string {
  if (currentStreak <= 2) return 'NEUTRAL — Normal gameplay variance'
  if (currentStreak <= 4) return 'MILD_FRUSTRATION — Starting to notice bad luck'
  if (currentStreak <= 6) return 'FRUSTRATED — Questioning if game is fair'
  if (currentStreak <= 9) return 'ANGRY — Considering quitting'
  return 'RAGE — High probability of uninstall/negative review'
}

// ==================== FAIRNESS ====================

const LOSS_AVERSION_MULTIPLIER  = 2.5
const RECENCY_WINDOW            = 10
const PATTERN_DETECTION_THRESHOLD = 3

export function calculatePerceivedRate(
  actualResults: boolean[],
  actualRate: number,
): { perceived: number; gap: number; bias_factors: string[]; recent_rate: number; loss_aversion_active: boolean } {
  if (actualResults.length === 0) return { perceived: actualRate, gap: 0, bias_factors: [], recent_rate: actualRate, loss_aversion_active: false }

  const biasFactors: string[] = []
  const recentCount   = Math.min(RECENCY_WINDOW, actualResults.length)
  const recentResults = actualResults.slice(-recentCount)
  const recentSucc    = recentResults.filter(Boolean).length
  const recentRate    = recentSucc / recentCount

  const successes = actualResults.filter(Boolean).length
  const failures  = actualResults.length - successes
  const weightedTotal = successes + failures * LOSS_AVERSION_MULTIPLIER
  let perceived = weightedTotal > 0 ? successes / weightedTotal : 0
  perceived = perceived * 0.4 + recentRate * 0.6

  if (recentRate < actualRate * 0.5) biasFactors.push('RECENCY_BIAS: Recent results significantly below average')

  let consecutive = 1
  let maxConsecutive = 1
  for (let i = 1; i < actualResults.length; i++) {
    if (actualResults[i] === actualResults[i - 1]) { consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive) }
    else consecutive = 1
  }
  if (maxConsecutive >= PATTERN_DETECTION_THRESHOLD) {
    biasFactors.push(`PATTERN_ILLUSION: ${maxConsecutive} consecutive same results detected`)
    perceived *= 0.9
  }

  return { perceived, gap: actualRate - perceived, bias_factors: biasFactors, recent_rate: recentRate, loss_aversion_active: failures > successes }
}

export function getFairnessVerdict(perception: FairnessPerception): string {
  const g = perception.fairness_gap
  if (g < 0.05) return 'FAIR — Perception matches reality'
  if (g < 0.15) return 'SLIGHTLY_UNFAIR — Minor perception gap'
  if (g < 0.25) return 'FEELS_UNFAIR — Significant perception gap, pity recommended'
  return 'FEELS_RIGGED — Major perception problem, intervention required'
}

// ==================== PITY ====================

export function recommendPitySystem(baseRate: number, attemptsPerSession: number, monetization = false): PityRecommendation {
  if (baseRate <= 0 || baseRate >= 1) return { recommended: false, urgency: 'OPTIONAL', pity_threshold: 0, soft_pity_start: 0, soft_pity_increment: 0, reasoning: 'Invalid success rate', expected_impact: {} }

  const attemptsFor99      = Math.ceil(Math.log(0.01) / Math.log(1 - baseRate))
  const failureRate        = 1 - baseRate
  const expectedMaxStreak  = failureRate > 0 && failureRate < 1 ? Math.log(attemptsPerSession) / Math.log(1 / failureRate) : 0

  let recommended = false
  let urgency: PityUrgency = 'OPTIONAL'
  let reasoning = ''

  if (expectedMaxStreak >= RAGE_QUIT_STREAK_THRESHOLD) {
    recommended = true; urgency = 'REQUIRED'
    reasoning = `Expected max failure streak (${expectedMaxStreak.toFixed(0)}) exceeds rage-quit threshold (${RAGE_QUIT_STREAK_THRESHOLD})`
  } else if (expectedMaxStreak >= FRUSTRATION_STREAK_THRESHOLD) {
    recommended = true; urgency = 'RECOMMENDED'
    reasoning = `Expected max failure streak (${expectedMaxStreak.toFixed(0)}) may cause frustration`
  } else if (monetization && baseRate < 0.1) {
    recommended = true; urgency = 'REQUIRED'
    reasoning = `Low rate (${(baseRate * 100).toFixed(1)}%) with monetization requires consumer protection`
  } else {
    return { recommended: false, urgency: 'OPTIONAL', pity_threshold: 0, soft_pity_start: 0, soft_pity_increment: 0, reasoning: 'Base rate is acceptable for session length', expected_impact: {} }
  }

  const hardPity       = Math.max(Math.ceil(attemptsFor99 * 0.7), RAGE_QUIT_STREAK_THRESHOLD)
  const softPityStart  = Math.ceil(hardPity * 0.5)
  const steps          = hardPity - softPityStart
  const softIncrement  = steps > 0 ? (1 - baseRate) / steps : 0

  return {
    recommended, urgency, pity_threshold: hardPity,
    soft_pity_start: softPityStart, soft_pity_increment: softIncrement, reasoning,
    expected_impact: { frustration_reduction: '~40-60%', perceived_fairness_improvement: '+15-25%', rage_quit_reduction: '~50-70%', revenue_impact: 'Minimal if thresholds set correctly' },
  }
}

// ==================== MAIN API ====================

export function analyzeRNGSystem(
  baseSuccessRate: number,
  simulationResults: AttemptResult[],
  attemptsPerSession = 50,
  timeBetweenAttempts = 5.0,
  monetization = false,
): RNGAnalysisReport {
  // Pain metrics
  const frustration   = calcCumulativeFrustration(simulationResults, timeBetweenAttempts)
  const sessionMins   = simulationResults.length * timeBetweenAttempts / 60
  const rageQuit      = estimateRageQuitProbability(frustration, sessionMins)
  let longestDry = 0, curDry = 0
  for (const r of simulationResults) { if (r.success) curDry = 0; else { curDry++; longestDry = Math.max(longestDry, curDry) } }
  const painMetrics: PainMetrics = {
    frustration_index:        frustration,
    rage_quit_risk:           rageQuit,
    perceived_unfairness:     Math.min(100, longestDry * 10),
    reward_starvation_score:  Math.min(100, longestDry * 10),
    hope_depletion_rate:      frustration / Math.max(simulationResults.length, 1),
    recovery_time_estimate:   frustration * 2,
  }

  // Streak analysis
  let curStreak = 0
  const allStreaks: number[] = []
  let nearMisses = 0
  for (const r of simulationResults) {
    if (r.success) { if (curStreak > 0) { allStreaks.push(curStreak); curStreak = 0 } }
    else { curStreak++; if (r.near_miss) nearMisses++ }
  }
  if (curStreak > 0) allStreaks.push(curStreak)
  const failureRate  = 1 - baseSuccessRate
  const p95 = (failureRate > 0 && failureRate < 1) ? Math.ceil(Math.log(0.05 * attemptsPerSession) / Math.log(failureRate)) : 0
  const p99 = (failureRate > 0 && failureRate < 1) ? Math.ceil(Math.log(0.01 * attemptsPerSession) / Math.log(failureRate)) : 0
  const streakAnalysis: StreakAnalysis = {
    max_failure_streak:               allStreaks.length > 0 ? Math.max(...allStreaks) : 0,
    avg_failure_streak:               allStreaks.length > 0 ? allStreaks.reduce((s, v) => s + v, 0) / allStreaks.length : 0,
    failure_streak_at_percentile_95:  p95,
    failure_streak_at_percentile_99:  p99,
    streak_frustration_multiplier:    1.0,
    near_miss_count:                  nearMisses,
    cold_streak_duration_seconds:     longestDry * timeBetweenAttempts,
  }

  // Fairness
  const boolResults    = simulationResults.map((r) => r.success)
  const perceptionData = calculatePerceivedRate(boolResults, baseSuccessRate)
  const fairnessPerception: FairnessPerception = {
    actual_success_rate:           baseSuccessRate,
    perceived_success_rate:        perceptionData.perceived,
    fairness_gap:                  perceptionData.gap,
    pattern_recognition_triggered: perceptionData.bias_factors.some((f) => f.includes('PATTERN_ILLUSION')),
    recency_bias_impact:           Math.abs(perceptionData.recent_rate - baseSuccessRate),
    confirmation_bias_risk:        Math.min(1, perceptionData.gap * 2),
    visual_fairness_flags:         perceptionData.bias_factors,
  }

  // Pity
  const pityRecommendation = recommendPitySystem(baseSuccessRate, attemptsPerSession, monetization)

  // Action items
  const actionItems: ActionItem[] = []
  if (painMetrics.rage_quit_risk > 0.3) actionItems.push({ priority: 'CRITICAL', action: 'Implement pity system', reason: `Rage-quit risk ${(painMetrics.rage_quit_risk * 100).toFixed(0)}% is too high`, impact: 'Reduce player churn by 50-70%' })
  if (streakAnalysis.max_failure_streak >= 10) actionItems.push({ priority: 'CRITICAL', action: `Add hard pity cap at ${pityRecommendation.pity_threshold} attempts`, reason: `Max streak of ${streakAnalysis.max_failure_streak} failures causes rage`, impact: 'Eliminate extreme frustration cases' })
  if (fairnessPerception.fairness_gap > 0.15) actionItems.push({ priority: 'HIGH', action: "Add visual feedback for 'near miss'", reason: `Players perceive system as unfair (gap: ${(fairnessPerception.fairness_gap * 100).toFixed(0)}%)`, impact: 'Improve fairness perception by 15-25%' })
  if (painMetrics.reward_starvation_score > 50) actionItems.push({ priority: 'MEDIUM', action: 'Add small consolation rewards during failure streaks', reason: `Long period without rewards (score: ${painMetrics.reward_starvation_score.toFixed(0)})`, impact: 'Maintain engagement during bad luck' })

  const report: RNGAnalysisReport = {
    pain_metrics: painMetrics,
    streak_analysis: streakAnalysis,
    fairness_perception: fairnessPerception,
    pity_recommendation: pityRecommendation,
    action_items: actionItems,
    designer_summary: '',
    overall_risk: getRiskLevel(painMetrics),
  }
  report.designer_summary = generateDesignerSummary(report)
  return report
}

// ==================== DESIGNER SUMMARY ====================

export function generateDesignerSummary(report: RNGAnalysisReport): string {
  const { pain_metrics: pm, streak_analysis: sa, fairness_perception: fp, pity_recommendation: pr } = report
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '              RNG PSYCHOLOGY ANALYSIS REPORT',
    '═══════════════════════════════════════════════════════════════',
    '',
    `PLAYER FRUSTRATION RISK: ${getRiskLevel(pm)} (${getOverallPainScore(pm).toFixed(0)}/100)`,
    '',
    '─── KEY FINDINGS ───',
    '',
    'Frustration:',
    `  • Frustration index: ${pm.frustration_index.toFixed(0)}/100`,
    `  • Rage-quit risk: ${(pm.rage_quit_risk * 100).toFixed(0)}%`,
    `  • Perceived unfairness: ${pm.perceived_unfairness.toFixed(0)}/100`,
    '',
    'Failure streaks:',
    `  • Maximum: ${sa.max_failure_streak} in a row`,
    `  • 95% of players will experience: ${sa.failure_streak_at_percentile_95}+ failures in a row`,
    `  • Danger level: ${getStreakDangerLevel(sa)}`,
    '',
    'Fairness perception:',
    `  • Actual chance: ${(fp.actual_success_rate * 100).toFixed(1)}%`,
    `  • Perceived chance: ${(fp.perceived_success_rate * 100).toFixed(1)}%`,
    `  • Verdict: ${getFairnessVerdict(fp)}`,
    '',
    '─── PITY SYSTEM RECOMMENDATION ───',
    '',
  ]
  if (pr.recommended) {
    lines.push(`  STATUS: ${pr.urgency}`)
    lines.push(`  Hard pity: After ${pr.pity_threshold} failures, guaranteed success`)
    lines.push(`  Soft pity: From ${pr.soft_pity_start} failures, increase chance by ${(pr.soft_pity_increment * 100).toFixed(1)}%`)
    lines.push(`  Reason: ${pr.reasoning}`)
  } else {
    lines.push('  Pity system not required.')
    lines.push(`  Reason: ${pr.reasoning}`)
  }
  lines.push('')
  if (report.action_items.length > 0) {
    lines.push('─── ACTION ITEMS ───', '')
    report.action_items.forEach((item, i) => {
      lines.push(`  [${i + 1}] [${item.priority}] ${item.action}`)
      lines.push(`      Reason: ${item.reason}`)
      lines.push(`      Impact: ${item.impact}`)
      lines.push('')
    })
  }
  lines.push('═══════════════════════════════════════════════════════════════')
  return lines.join('\n')
}
