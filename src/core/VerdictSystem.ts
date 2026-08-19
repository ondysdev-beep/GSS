// VerdictSystem.ts — přímý port GDScript VerdictSystem.gd
// Určuje finální verdikt (SAFE/CAUTION/UNSAFE/CRITICAL) z health skóre a failure detektorů

import { calculateHealthScore } from './HealthScoreCalculator'
import { analyzeContext } from './FailureDetectors'
import type {
  HealthScore,
  Verdict,
  VerdictReport,
  VerdictState,
  FailureReport,
  SimulationContext,
} from '../types/simulation'

// ==================== VERDICT Z HEALTH SKÓRE ====================

function verdictFromHealthScore(score: HealthScore): VerdictState {
  if (score.total >= 75) return 'SAFE'
  if (score.total >= 50) return 'CAUTION'
  if (score.total >= 25) return 'UNSAFE'
  return 'CRITICAL'
}

// ==================== VERDICT KOMBINACE ====================

export function determineVerdict(
  healthScore: HealthScore,
  failureReport: FailureReport,
  ctx: SimulationContext,
): Verdict {
  const healthVerdict = verdictFromHealthScore(healthScore)

  let state: VerdictState
  if (failureReport.has_critical) {
    state = 'CRITICAL'
  } else if (failureReport.has_unsafe) {
    if (healthVerdict === 'SAFE' || healthVerdict === 'CAUTION') {
      state = 'UNSAFE'
    } else {
      state = healthVerdict
    }
  } else {
    state = healthVerdict
  }

  return {
    state,
    confidence_score: calcConfidence(ctx, failureReport),
    simulation_cycles: ctx.cycle_count,
    edge_cases_tested: countEdgeCases(ctx),
    sample_coverage: calcCoverage(ctx),
  }
}

// ==================== KOMPLETNÍ REPORT ====================

export function generateVerdictReport(ctx: SimulationContext): VerdictReport {
  const failureReport = analyzeContext(ctx)
  const healthScore   = calculateHealthScore(ctx)
  const verdict       = determineVerdict(healthScore, failureReport, ctx)

  return {
    verdict,
    health_score: healthScore,
    failure_report: failureReport,
    simulation_info: {
      cycles:             ctx.cycle_count,
      duration:           ctx.total_duration,
      resources_tracked:  Object.keys(ctx.resource_history).length,
      gates_tracked:      Object.keys(ctx.gate_times).length,
      archetypes_tested:  Object.keys(ctx.player_distribution).length,
    },
  }
}

// ==================== POMOCNÉ VÝPOČTY ====================

function calcConfidence(ctx: SimulationContext, fr: FailureReport): number {
  let confidence = 0
  let factors    = 0

  // Délka simulace
  confidence += Math.min(ctx.cycle_count / 1000, 1)
  factors++

  // Množství dat
  const keys = Object.keys(ctx.resource_history)
  let dataConf = 0.5
  if (keys.length > 0) {
    const avg = keys.reduce((s, k) => s + ctx.resource_history[k].length, 0) / keys.length
    dataConf = Math.min(avg / 100, 1)
  }
  confidence += dataConf
  factors++

  // Edge case pokrytí
  confidence += Math.min(countEdgeCases(ctx) / 10, 1)
  factors++

  // Jasnost failure detekce
  confidence += fr.failures.length > 0 ? 0.9 : 0.7
  factors++

  // Pokrytí archetypů
  const archetypeCount = Object.keys(ctx.player_distribution).length
  confidence += archetypeCount >= 3 ? 1 : archetypeCount >= 1 ? 0.7 : 0.5
  factors++

  return confidence / factors
}

function calcCoverage(ctx: SimulationContext): number {
  let covered = 0
  if (Object.keys(ctx.resource_history).length > 0) covered++
  if (ctx.state_transitions.length > 0) covered++
  if (Object.keys(ctx.gate_times).length > 0) covered++
  if (Object.keys(ctx.player_distribution).length > 0) covered++
  if (ctx.cycle_count >= 100) covered++
  return covered / 5
}

function countEdgeCases(ctx: SimulationContext): number {
  let count = 0

  for (const h of Object.values(ctx.resource_history)) {
    if (h.length === 0) continue
    if (Math.min(...h) <= 0.01) count++
    if (Math.max(...h) > 1_000_000) count++
  }

  for (const data of Object.values(ctx.gate_times)) {
    const { actual_time: a, expected_time: e } = data
    if (e > 0 && a / e > 2) count++
    if (e > 0 && a / e < 0.5) count++
  }

  const vals = Object.values(ctx.player_distribution)
  if (vals.length >= 2) {
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    if (max > 0 && min / max < 0.2) count++
  }

  return count
}
