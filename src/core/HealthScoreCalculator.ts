// HealthScoreCalculator.ts — přímý port GDScript HealthScoreCalculator.gd
// 5 sub-skóre (Stability, Convergence, Fairness, Exploitability, Recovery)

import type { HealthScore, SimulationContext } from '../types/simulation'

// Váhy sub-skóre
const W_STABILITY      = 0.30
const W_CONVERGENCE    = 0.25
const W_FAIRNESS       = 0.20
const W_EXPLOITABILITY = 0.15
const W_RECOVERY       = 0.10

export function calculateHealthScore(ctx: SimulationContext): HealthScore {
  const stability      = calcStability(ctx)
  const convergence    = calcConvergence(ctx)
  const fairness       = calcFairness(ctx)
  const exploitability = calcExploitability(ctx)
  const recovery       = calcRecovery(ctx)

  const total =
    stability      * W_STABILITY +
    convergence    * W_CONVERGENCE +
    fairness       * W_FAIRNESS +
    exploitability * W_EXPLOITABILITY +
    recovery       * W_RECOVERY

  return {
    stability,
    convergence,
    fairness,
    exploitability,
    recovery,
    total: clamp(total, 0, 100),
  }
}

// ==================== STABILITY (0.30) ====================
// Měří variance přes čas — nižší CV = vyšší skóre

function calcStability(ctx: SimulationContext): number {
  const keys = Object.keys(ctx.resource_history)
  if (keys.length === 0) return 50

  let total = 0
  let count = 0

  for (const id of keys) {
    const h = ctx.resource_history[id]
    if (h.length < 2) continue
    const mean = arrayMean(h)
    if (mean <= 0) continue
    const std  = arrayStd(h)
    const cv   = std / mean
    total += clamp(100 - cv * 100, 0, 100)
    count++
  }

  return count === 0 ? 50 : total / count
}

// ==================== CONVERGENCE (0.25) ====================
// Zda systém konverguje k rovnováze nebo míří k extrémům

function calcConvergence(ctx: SimulationContext): number {
  const keys = Object.keys(ctx.resource_history)
  if (keys.length === 0) return 50

  let total = 0
  let count = 0

  for (const id of keys) {
    const h = ctx.resource_history[id]
    if (h.length < 10) continue

    const mid        = Math.floor(h.length / 2)
    const firstHalf  = h.slice(0, mid)
    const secondHalf = h.slice(mid)
    const firstStd   = arrayStd(firstHalf)
    const secondStd  = arrayStd(secondHalf)

    let convergenceRatio = 1.0
    if (firstStd > 0) convergenceRatio = secondStd / firstStd

    const lastValues  = h.slice(-5)
    const lastMean    = arrayMean(lastValues)
    const overallMean = arrayMean(h)

    let extremePenalty = 0
    if (overallMean > 0) {
      const devRatio = Math.abs(lastMean - overallMean) / overallMean
      extremePenalty = clamp(devRatio * 50, 0, 50)
    }

    let score = 100
    if (convergenceRatio > 1) score -= (convergenceRatio - 1) * 50
    score -= extremePenalty
    total += clamp(score, 0, 100)
    count++
  }

  return count === 0 ? 50 : total / count
}

// ==================== FAIRNESS (0.20) ====================
// Rozložení výsledků přes archetypy hráčů (Gini koeficient)

function calcFairness(ctx: SimulationContext): number {
  const dist = ctx.player_distribution
  const keys = Object.keys(dist)
  if (keys.length < 2) return 75

  const values = keys.map((k) => dist[k])
  const gini   = calcGini(values)
  let fairness = 100 - gini * 80

  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  if (maxVal > 0 && minVal / maxVal < 0.1) fairness -= 20

  return clamp(fairness, 0, 100)
}

function calcGini(values: number[]): number {
  if (values.length === 0) return 0
  const n      = values.length
  const sorted = [...values].sort((a, b) => a - b)
  let sumDiff  = 0
  let total    = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j])
    }
    total += sorted[i]
  }
  if (total === 0) return 0
  return sumDiff / (2 * n * total)
}

// ==================== EXPLOITABILITY (0.15) ====================
// Odolnost vůči degenerativním strategiím (vyšší = těžší exploitovat)

function calcExploitability(ctx: SimulationContext): number {
  let score = 100

  for (const id of Object.keys(ctx.resource_history)) {
    const h = ctx.resource_history[id]
    if (h.length < 5) continue

    let growthCount = 0
    for (let i = 1; i < h.length; i++) {
      if (h[i] > h[i - 1] * 1.1) growthCount++
    }
    const growthRatio = growthCount / (h.length - 1)
    if (growthRatio > 0.8) score -= 30
  }

  const dist = ctx.player_distribution
  const keys = Object.keys(dist)
  if (keys.length >= 2) {
    const vals    = keys.map((k) => dist[k])
    const maxVal  = Math.max(...vals)
    const exploiterVal = dist['exploiter'] ?? -1
    const optimalVal   = dist['optimal']  ?? maxVal
    if (exploiterVal >= 0 && optimalVal > 0 && exploiterVal > optimalVal * 1.5) {
      score -= (exploiterVal / optimalVal - 1) * 40
    }
  }

  return clamp(score, 0, 100)
}

// ==================== RECOVERY (0.10) ====================
// Schopnost vrátit se do zdravého stavu po perturbaci

function calcRecovery(ctx: SimulationContext): number {
  const keys = Object.keys(ctx.resource_history)
  if (keys.length === 0) return 50

  let total = 0
  let count = 0

  for (const id of keys) {
    const h = ctx.resource_history[id]
    if (h.length < 20) continue

    const perturbations: number[] = []
    for (let i = 1; i < h.length; i++) {
      if (h[i - 1] > 0) {
        const changeRatio = Math.abs(h[i] - h[i - 1]) / h[i - 1]
        if (changeRatio > 0.3) perturbations.push(i)
      }
    }

    if (perturbations.length === 0) {
      total += 80
      count++
      continue
    }

    const baseline = arrayMean(h.slice(0, 10))
    let recoveryCount = 0

    for (const pi of perturbations) {
      const endIdx    = Math.min(pi + 10, h.length)
      const postVals  = h.slice(pi, endIdx)
      if (postVals.length < 3) continue

      const postMean  = arrayMean(postVals)
      const perturbV  = h[pi]
      const distBefore = Math.abs(perturbV - baseline)
      const distAfter  = Math.abs(postMean - baseline)

      if (distAfter < distBefore * 0.7) recoveryCount++
    }

    const recoveryRate = perturbations.length > 0 ? recoveryCount / perturbations.length : 0.5
    total += recoveryRate * 100
    count++
  }

  return count === 0 ? 50 : total / count
}

// ==================== UTILITIES ====================

function arrayMean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function arrayStd(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean   = arrayMean(arr)
  const sumSq  = arr.reduce((s, v) => s + (v - mean) ** 2, 0)
  return Math.sqrt(sumSq / arr.length)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
