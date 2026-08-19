// TuningResult.ts — port GDScript TuningResult.gd

import type { ConstraintCheckResult } from './TuningConstraint'
import type { GoalEvalResult } from './TuningGoal'
import type { TuningParameter } from './TuningParameter'

export type ResultStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'TIMEOUT' | 'CANCELLED'

export interface IterationResult {
  iteration: number
  parameters: Record<string, number>
  goal_scores: Record<string, GoalEvalResult>
  constraint_checks: ConstraintCheckResult[]
  total_score: number
  all_constraints_satisfied: boolean
  simulation_time_ms: number
}

export interface ParameterChange {
  param_id: string
  param_name: string
  original: number
  final: number
  change_pct: number
}

export interface TuningResult {
  status: ResultStatus
  start_time: string
  end_time: string
  duration_seconds: number
  iterations: IterationResult[]
  best_iteration: number
  total_iterations: number
  best_parameters: Record<string, TuningParameter>
  best_score: number
  best_goal_results: Record<string, GoalEvalResult>
  original_parameters: Record<string, TuningParameter>
  parameter_changes: ParameterChange[]
  constraint_violations: ConstraintCheckResult[]
  all_constraints_satisfied: boolean
  goals_satisfied: number
  goals_total: number
  goal_satisfaction_rate: number
}

export function createTuningResult(): TuningResult {
  return {
    status:                  'FAILED',
    start_time:              new Date().toISOString(),
    end_time:                '',
    duration_seconds:        0,
    iterations:              [],
    best_iteration:          -1,
    total_iterations:        0,
    best_parameters:         {},
    best_score:              0,
    best_goal_results:       {},
    original_parameters:     {},
    parameter_changes:       [],
    constraint_violations:   [],
    all_constraints_satisfied: true,
    goals_satisfied:         0,
    goals_total:             0,
    goal_satisfaction_rate:  0,
  }
}

export function addIteration(result: TuningResult, iter: IterationResult): TuningResult {
  const iterations = [...result.iterations, iter]
  return { ...result, iterations, total_iterations: iterations.length }
}

export function finalizeResult(result: TuningResult): TuningResult {
  const endTime = new Date().toISOString()
  const startMs = new Date(result.start_time).getTime()
  const endMs   = new Date(endTime).getTime()
  const duration = (endMs - startMs) / 1000

  // Best iteration
  let bestScore = -Infinity
  let bestIter  = -1
  for (let i = 0; i < result.iterations.length; i++) {
    const it = result.iterations[i]
    if (it.all_constraints_satisfied && it.total_score > bestScore) {
      bestScore = it.total_score
      bestIter  = i
    }
  }

  const bestGoalResults = bestIter >= 0 ? result.iterations[bestIter].goal_scores : {}

  // Parameter changes
  const changes: ParameterChange[] = []
  for (const [paramId, bestParam] of Object.entries(result.best_parameters)) {
    const original = bestParam.original_value
    const final_   = bestParam.current_value
    const changePct = original !== 0
      ? ((final_ - original) / original) * 100
      : (final_ !== 0 ? (final_ > 0 ? 100 : -100) : 0)
    if (Math.abs(changePct) > 0.1) {
      changes.push({ param_id: paramId, param_name: bestParam.name, original, final: final_, change_pct: changePct })
    }
  }
  changes.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))

  // Status
  let status: ResultStatus
  if (!result.all_constraints_satisfied) status = 'FAILED'
  else if (result.goal_satisfaction_rate >= 1.0) status = 'SUCCESS'
  else if (result.goal_satisfaction_rate > 0) status = 'PARTIAL'
  else status = 'FAILED'

  return {
    ...result,
    end_time:         endTime,
    duration_seconds: duration,
    best_iteration:   bestIter,
    best_score:       bestScore > -Infinity ? bestScore : 0,
    best_goal_results: bestGoalResults,
    parameter_changes: changes,
    status,
  }
}

export function getImprovementCurve(result: TuningResult): Array<{ iteration: number; score: number; best_so_far: number }> {
  const curve: Array<{ iteration: number; score: number; best_so_far: number }> = []
  let runningBest = -Infinity
  for (const iter of result.iterations) {
    if (iter.all_constraints_satisfied && iter.total_score > runningBest) runningBest = iter.total_score
    curve.push({ iteration: iter.iteration, score: iter.total_score, best_so_far: runningBest > -Infinity ? runningBest : 0 })
  }
  return curve
}

export function getSummaryText(result: TuningResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════',
    `              AUTO-TUNING RESULT: ${result.status}`,
    '═══════════════════════════════════════════════════════',
    '',
    `Duration: ${result.duration_seconds.toFixed(1)}s | Iterations: ${result.total_iterations}`,
    `Best Score: ${result.best_score.toFixed(3)} | Goals: ${result.goals_satisfied}/${result.goals_total} (${(result.goal_satisfaction_rate * 100).toFixed(0)}%)`,
    '',
  ]
  if (result.parameter_changes.length > 0) {
    lines.push('─── TOP PARAMETER CHANGES ───')
    for (const c of result.parameter_changes.slice(0, 5)) {
      const arrow = c.change_pct > 0 ? '↑' : '↓'
      lines.push(`  ${c.param_name}: ${c.original.toFixed(2)} → ${c.final.toFixed(2)} (${arrow}${Math.abs(c.change_pct).toFixed(1)}%)`)
    }
    lines.push('')
  }
  if (result.constraint_violations.length > 0) {
    lines.push('─── CONSTRAINT VIOLATIONS ───')
    for (const v of result.constraint_violations) {
      lines.push(`  ✗ ${v.constraint_name}: ${v.violation_message}`)
    }
    lines.push('')
  }
  lines.push('═══════════════════════════════════════════════════════')
  return lines.join('\n')
}
