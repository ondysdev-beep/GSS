// EconomyAnalyzer.ts — port GDScript EconomyAnalyzer.gd
// Analýza idle/incremental ekonomik: producenty, upgrady, balance.

import {
  clampScore, calculateRating, createIssue, createRecommendation,
  type AnalysisIssue, type AnalysisRecommendation, type AnalysisReport,
} from './BaseAnalyzer'

export interface EconomyResource { id: string; name: string }
export interface EconomyProducerDef { id: string; name: string; rate: number; cost_coefficient?: number; produces?: string; resource?: string }
export interface EconomyUpgrade    { id: string; name: string; type?: string; target?: string }

export interface EconomyData {
  resources: EconomyResource[]
  producers: EconomyProducerDef[]
  upgrades:  EconomyUpgrade[]
}

export interface EconomyHealthScore {
  total: number
  income_drain_balance: number
  producer_diversity: number
  upgrade_effectiveness: number
  cost_scaling: number
  progression_pacing: number
  rating: string
}

export interface EconomyAnalysisReport extends Omit<AnalysisReport, 'health_score'> {
  health_score: EconomyHealthScore
}

// ==================== MAIN ====================

export function analyzeEconomy(data: EconomyData, simulationHistory: unknown[] = []): EconomyAnalysisReport {
  const t0 = performance.now()
  const health          = getEconomyHealthScore(data)
  const issues          = getEconomyIssues(data)
  const recommendations = getEconomyRecommendations(data, issues)
  const stats           = getEconomyQuickStats(data, simulationHistory)
  const confidence      = calcEconomyConfidence(data, simulationHistory)

  return {
    analyzer_type: 'economy',
    health_score: health,
    issues,
    recommendations,
    quick_stats: stats,
    confidence,
    analysis_time: (performance.now() - t0) / 1000,
  }
}

// ==================== HEALTH SCORE ====================

export function getEconomyHealthScore(data: EconomyData): EconomyHealthScore {
  const balanceScore    = analyzeIncomeDrainBalance(data)
  const producerScore   = analyzeProducerDiversity(data.producers)
  const upgradeScore    = analyzeUpgradeEffectiveness(data.upgrades, data.producers)
  const scalingScore    = analyzeCostScaling(data.producers)
  const progressScore   = analyzeProgressionPacing(data)

  const total = balanceScore * 0.30 + producerScore * 0.20 + upgradeScore * 0.20 + scalingScore * 0.15 + progressScore * 0.15

  return {
    total:                  clampScore(total),
    income_drain_balance:   clampScore(balanceScore),
    producer_diversity:     clampScore(producerScore),
    upgrade_effectiveness:  clampScore(upgradeScore),
    cost_scaling:           clampScore(scalingScore),
    progression_pacing:     clampScore(progressScore),
    rating: calculateRating(total),
  }
}

// ==================== ISSUES ====================

export function getEconomyIssues(data: EconomyData): AnalysisIssue[] {
  const { resources, producers, upgrades } = data
  const issues: AnalysisIssue[] = []

  if (resources.length === 0) {
    issues.push(createIssue('No Resources Defined', 'Your economy has no resources. Add at least one resource to track.', 'CRITICAL'))
  }
  if (producers.length === 0 && resources.length > 0) {
    issues.push(createIssue('No Income Sources', 'You have resources but no producers generating them. Players cannot progress.', 'CRITICAL'))
  }

  const prodByResource = getProductionByResource(producers)
  for (const res of resources) {
    if (!prodByResource[res.id] || prodByResource[res.id] <= 0) {
      issues.push(createIssue('Resource Has No Production', `Resource '${res.name || res.id}' has no producer generating it.`, 'HIGH', res.id))
    }
  }

  for (const prod of producers) {
    const coeff = prod.cost_coefficient ?? 1.15
    if (coeff > 1.5) {
      issues.push(createIssue('Extreme Cost Scaling', `Producer '${prod.name || prod.id}' has cost coefficient ${coeff.toFixed(2)} which may be too punishing.`, 'MEDIUM', prod.id))
    } else if (coeff < 1.05 && coeff > 1.0) {
      issues.push(createIssue('Weak Cost Scaling', `Producer '${prod.name || prod.id}' has cost coefficient ${coeff.toFixed(2)} which may allow infinite buying.`, 'MEDIUM', prod.id))
    }
  }

  for (const upg of upgrades) {
    if (!upg.target) {
      issues.push(createIssue('Upgrade Without Target', `Upgrade '${upg.name || upg.id}' has no target - it won't affect anything.`, 'MEDIUM', upg.id))
    }
  }

  if (upgrades.length < 2 && producers.length > 2) {
    issues.push(createIssue('Insufficient Upgrades', `You have ${producers.length} producers but only ${upgrades.length} upgrades. Consider adding more progression options.`, 'LOW'))
  }

  return issues
}

// ==================== RECOMMENDATIONS ====================

export function getEconomyRecommendations(data: EconomyData, issues: AnalysisIssue[]): AnalysisRecommendation[] {
  const { producers, upgrades } = data
  const recs: AnalysisRecommendation[] = []

  for (const issue of issues) {
    if (issue.severity === 'CRITICAL') {
      recs.push(createRecommendation(`Fix critical issue: ${issue.title}`, '', 0, 0, 1, 0.95))
    }
  }

  for (const prod of producers) {
    const coeff = prod.cost_coefficient ?? 1.15
    if (coeff > 1.3 || coeff < 1.1) {
      recs.push(createRecommendation(`Adjust cost coefficient for '${prod.name || prod.id}' to optimal range (1.10-1.20)`, 'cost_coefficient', coeff, 1.15, 3, 0.8))
    }
  }

  if (upgrades.length < producers.length) {
    recs.push(createRecommendation(`Add more upgrades to improve player engagement (${producers.length} producers, only ${upgrades.length} upgrades)`, 'upgrade_count', upgrades.length, producers.length, 3, 0.7))
  }

  recs.sort((a, b) => a.priority - b.priority)
  return recs
}

// ==================== QUICK STATS ====================

export function getEconomyQuickStats(data: EconomyData, simulationHistory: unknown[]): Record<string, unknown> {
  const { resources, producers, upgrades } = data
  const totalProduction = producers.reduce((s, p) => s + (p.rate ?? 0), 0)
  return {
    resource_count: resources.length,
    producer_count: producers.length,
    upgrade_count:  upgrades.length,
    total_production_rate: totalProduction,
    simulation_ticks: simulationHistory.length,
  }
}

// ==================== PRIVATE HELPERS ====================

function analyzeIncomeDrainBalance(data: EconomyData): number {
  const { producers } = data
  if (producers.length === 0) return 0
  const total = producers.reduce((s, p) => s + (p.rate ?? 0), 0)
  if (total <= 0) return 20
  if (total < 1)  return 50
  if (total > 1000) return 60
  return 85
}

function analyzeProducerDiversity(producers: EconomyProducerDef[]): number {
  if (producers.length === 0) return 0
  if (producers.length === 1) return 50
  const rates = producers.map((p) => p.rate ?? 1).sort((a, b) => a - b)
  const ratio = rates[rates.length - 1] / Math.max(rates[0], 0.01)
  if (ratio < 5)    return 60
  if (ratio > 1000) return 50
  return 85
}

function analyzeUpgradeEffectiveness(upgrades: EconomyUpgrade[], producers: EconomyProducerDef[]): number {
  if (upgrades.length === 0) return producers.length > 0 ? 40 : 50
  const hasMultiplier = upgrades.some((u) => u.type === 'multiplier')
  const hasAdditive   = upgrades.some((u) => u.type === 'additive')
  if (hasMultiplier && hasAdditive) return 90
  if (hasMultiplier || hasAdditive) return 70
  return 50
}

function analyzeCostScaling(producers: EconomyProducerDef[]): number {
  if (producers.length === 0) return 50
  const good = producers.filter((p) => { const c = p.cost_coefficient ?? 1.15; return c >= 1.08 && c <= 1.25 }).length
  return 50 + 50 * good / producers.length
}

function analyzeProgressionPacing(data: EconomyData): number {
  const density = (data.producers.length + data.upgrades.length) / 2
  if (density < 2)  return 40
  if (density < 5)  return 65
  if (density < 10) return 85
  return 90
}

function getProductionByResource(producers: EconomyProducerDef[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const p of producers) {
    const res = p.produces ?? p.resource ?? ''
    if (res) result[res] = (result[res] ?? 0) + (p.rate ?? 0)
  }
  return result
}

function calcEconomyConfidence(data: EconomyData, simulationHistory: unknown[]): number {
  let conf = 0.5
  if (data.resources.length > 0)    conf += 0.1
  if (data.producers.length > 0)    conf += 0.1
  if (simulationHistory.length > 10)  conf += 0.2
  if (simulationHistory.length > 100) conf += 0.1
  return Math.min(conf, 1.0)
}
