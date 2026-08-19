// RPGAnalyzer.ts — port GDScript RPGAnalyzer.gd
// Analýza RPG progresních systémů: XP křivky, levelování, statistiky.

import {
  clampScore, calculateRating, createIssue, createRecommendation,
  type AnalysisIssue, type AnalysisRecommendation, type AnalysisReport,
} from './BaseAnalyzer'
import type { RPGConfig } from './RPGModule'

export interface RPGHealthScore {
  total: number
  xp_curve_shape: number
  level_pacing: number
  stat_balance: number
  scaling_consistency: number
  endgame_viability: number
  rating: string
}

export interface RPGAnalysisReport extends Omit<AnalysisReport, 'health_score'> {
  health_score: RPGHealthScore
}

// ==================== MAIN ====================

export function analyzeRPG(data: RPGConfig, simulationHistory: unknown[] = []): RPGAnalysisReport {
  const t0 = performance.now()
  const health          = getRPGHealthScore(data)
  const issues          = getRPGIssues(data)
  const recommendations = getRPGRecommendations(data, issues)
  const stats           = getRPGQuickStats(data, simulationHistory)
  const confidence      = calcRPGConfidence(data, simulationHistory)

  return {
    analyzer_type: 'rpg',
    health_score: health,
    issues,
    recommendations,
    quick_stats: stats,
    confidence,
    analysis_time: (performance.now() - t0) / 1000,
  }
}

// ==================== HEALTH SCORE ====================

export function getRPGHealthScore(data: RPGConfig): RPGHealthScore {
  const curveScore     = analyzeXPCurve(data)
  const pacingScore    = analyzeLevelPacing(data)
  const statScore      = analyzeStatBalance(data)
  const scalingScore   = analyzeScalingConsistency(data)
  const endgameScore   = analyzeEndgameViability(data)

  const total = curveScore * 0.25 + pacingScore * 0.25 + statScore * 0.20 + scalingScore * 0.15 + endgameScore * 0.15

  return {
    total:                clampScore(total),
    xp_curve_shape:       clampScore(curveScore),
    level_pacing:         clampScore(pacingScore),
    stat_balance:         clampScore(statScore),
    scaling_consistency:  clampScore(scalingScore),
    endgame_viability:    clampScore(endgameScore),
    rating: calculateRating(total),
  }
}

// ==================== ISSUES ====================

export function getRPGIssues(data: RPGConfig): AnalysisIssue[] {
  const issues: AnalysisIssue[] = []
  const { xp_multiplier, xp_exponent, max_level, xp_per_second, stats } = data
  const curveType = data.curve_type

  if (curveType === 'exponential') {
    if (xp_multiplier > 2.0) {
      issues.push(createIssue('Extreme XP Scaling', `XP multiplier of ${xp_multiplier.toFixed(2)} creates extremely steep progression. Most players won't reach high levels.`, 'HIGH'))
    } else if (xp_multiplier < 1.1) {
      issues.push(createIssue('Flat XP Curve', `XP multiplier of ${xp_multiplier.toFixed(2)} is too flat. Levels will feel meaningless.`, 'MEDIUM'))
    }
  }

  if (curveType === 'polynomial') {
    if (xp_exponent > 3.0) {
      issues.push(createIssue('Extreme Polynomial Exponent', `Exponent of ${xp_exponent.toFixed(1)} creates punishing late-game progression.`, 'HIGH'))
    } else if (xp_exponent < 1.5) {
      issues.push(createIssue('Weak Polynomial Curve', `Exponent of ${xp_exponent.toFixed(1)} may feel too linear.`, 'LOW'))
    }
  }

  const totalXP = estimateTotalXP(data)
  const hoursToMax = totalXP / Math.max(xp_per_second, 0.1) / 3600

  if (hoursToMax < 1) {
    issues.push(createIssue('Too Fast Progression', `Players can reach max level in ${hoursToMax.toFixed(1)} hours. Consider slowing progression.`, 'MEDIUM'))
  } else if (hoursToMax > 1000) {
    issues.push(createIssue('Unreachable Max Level', `Reaching max level would take ${Math.round(hoursToMax)}+ hours. Most players will never complete.`, 'HIGH'))
  }

  if (Object.keys(stats).length === 0) {
    issues.push(createIssue('No Stats Defined', 'Your RPG system has no stats. Consider adding HP, Attack, Defense, etc.', 'MEDIUM'))
  }

  for (const [statName, statData] of Object.entries(stats)) {
    if (statData.growth_type === 'percentage' && statData.growth > 20) {
      issues.push(createIssue('Extreme Stat Growth', `Stat '${statName}' grows at ${Math.round(statData.growth)}% per level which may break balance at high levels.`, 'MEDIUM', statName))
    }
  }

  if (max_level > 20 && Object.keys(stats).length === 0) {
    issues.push(createIssue('Empty Progression', `You have ${max_level} levels but no stat growth. Levels feel meaningless.`, 'HIGH'))
  }

  return issues
}

// ==================== RECOMMENDATIONS ====================

export function getRPGRecommendations(data: RPGConfig, issues: AnalysisIssue[]): AnalysisRecommendation[] {
  const recs: AnalysisRecommendation[] = []
  const { xp_multiplier, xp_exponent, stats } = data
  const curveType = data.curve_type

  for (const issue of issues) {
    if (issue.severity === 'CRITICAL' || issue.severity === 'HIGH') {
      recs.push(createRecommendation(`Address: ${issue.title}`, '', 0, 0, 1, 0.9))
    }
  }

  if (curveType === 'exponential' && (xp_multiplier < 1.2 || xp_multiplier > 1.8)) {
    recs.push(createRecommendation('Adjust XP multiplier to optimal range (1.3-1.6) for balanced progression', 'xp_multiplier', xp_multiplier, 1.5, 2, 0.85))
  }

  if (curveType === 'polynomial' && (xp_exponent < 1.8 || xp_exponent > 2.5)) {
    recs.push(createRecommendation('Adjust XP exponent to optimal range (2.0-2.5) for smooth scaling', 'xp_exponent', xp_exponent, 2.0, 2, 0.8))
  }

  if (Object.keys(stats).length === 0) {
    recs.push(createRecommendation('Add core stats (HP, Attack, Defense) to make leveling meaningful', 'stat_count', 0, 3, 2, 0.9))
  }

  recs.sort((a, b) => a.priority - b.priority)
  return recs
}

// ==================== QUICK STATS ====================

export function getRPGQuickStats(data: RPGConfig, simulationHistory: unknown[]): Record<string, unknown> {
  const totalXP    = estimateTotalXP(data)
  const hoursToMax = totalXP / Math.max(data.xp_per_second, 0.1) / 3600
  return {
    max_level:      data.max_level,
    stat_count:     Object.keys(data.stats).length,
    total_xp_to_max: totalXP,
    hours_to_max:   hoursToMax,
    xp_per_second:  data.xp_per_second,
    simulation_ticks: simulationHistory.length,
  }
}

// ==================== PRIVATE HELPERS ====================

function analyzeXPCurve(data: RPGConfig): number {
  const { curve_type, xp_multiplier, xp_exponent } = data
  switch (curve_type) {
    case 'linear': return 60
    case 'exponential':
      if (xp_multiplier >= 1.3 && xp_multiplier <= 1.6) return 90
      if (xp_multiplier >= 1.2 && xp_multiplier <= 1.8) return 75
      return 50
    case 'polynomial':
      if (xp_exponent >= 1.8 && xp_exponent <= 2.5) return 85
      if (xp_exponent >= 1.5 && xp_exponent <= 3.0) return 70
      return 45
    default: return 50
  }
}

function analyzeLevelPacing(data: RPGConfig): number {
  const timeToLvl2 = data.base_xp / Math.max(data.xp_per_second, 0.1)
  if (timeToLvl2 < 10)   return 50
  if (timeToLvl2 < 30)   return 70
  if (timeToLvl2 <= 300) return 90
  if (timeToLvl2 <= 600) return 70
  return 40
}

function analyzeStatBalance(data: RPGConfig): number {
  const count = Object.keys(data.stats).length
  if (count === 0) return 40
  if (count === 1) return 55
  if (count >= 3 && count <= 8) return 90
  if (count > 8)  return 70
  return 75
}

function analyzeScalingConsistency(data: RPGConfig): number {
  const stats = Object.values(data.stats)
  if (stats.length === 0) return 50
  const types = new Set(stats.map((s) => s.growth_type))
  if (types.size === 1) return 85
  if (types.size === 2) return 80
  return 65
}

function analyzeEndgameViability(data: RPGConfig): number {
  const totalXP    = estimateTotalXP(data)
  const hoursToMax = totalXP / Math.max(data.xp_per_second, 0.1) / 3600
  if (hoursToMax < 5)    return 50
  if (hoursToMax < 20)   return 70
  if (hoursToMax <= 200) return 90
  if (hoursToMax <= 500) return 65
  return 40
}

function estimateTotalXP(data: RPGConfig): number {
  const { base_xp, xp_multiplier, xp_exponent, max_level, curve_type } = data
  let total = 0
  for (let level = 2; level <= max_level; level++) {
    let xpNeeded: number
    switch (curve_type) {
      case 'linear':      xpNeeded = base_xp * level; break
      case 'exponential': xpNeeded = base_xp * Math.pow(xp_multiplier, level - 1); break
      case 'polynomial':  xpNeeded = base_xp * Math.pow(level, xp_exponent); break
      default:            xpNeeded = base_xp * level
    }
    total += xpNeeded
    if (total > 1e15) return total
  }
  return total
}

function calcRPGConfidence(data: RPGConfig, simulationHistory: unknown[]): number {
  let conf = 0.6
  if (Object.keys(data.stats).length > 0) conf += 0.1
  if (simulationHistory.length > 10)      conf += 0.15
  if (simulationHistory.length > 100)     conf += 0.1
  return Math.min(conf, 1.0)
}
