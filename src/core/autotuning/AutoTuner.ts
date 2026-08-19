// AutoTuner.ts — port GDScript AutoTuner.gd
// Hill climbing / simulated annealing / random search / grid search optimizer.

import {
  type TuningParameter,
  setValue, perturb, setNormalized,
} from './TuningParameter'
import { createRNG } from '../SimRNG'
import type { RNGInstance } from '../SimRNG'
import {
  type TuningGoal,
  evaluateGoal,
  goalMaximizeHealthScore, goalTimeToFirstUpgrade, goalMinimizeExploitability, goalBalancedProgression,
} from './TuningGoal'
import {
  type TuningConstraint,
  validateValue, validateSimResult,
  constraintNoDeadlock, constraintNoRunaway,
  type ConstraintCheckResult,
} from './TuningConstraint'
import {
  type TuningResult, type IterationResult,
  createTuningResult, addIteration, finalizeResult,
} from './TuningResult'

export type OptimizationMethod = 'HILL_CLIMBING' | 'SIMULATED_ANNEALING' | 'RANDOM_SEARCH' | 'GRID_SEARCH'

export interface AutoTunerConfig {
  max_iterations: number
  convergence_threshold: number
  convergence_patience: number
  optimization_method: OptimizationMethod
  initial_temperature: number
  cooling_rate: number
  min_temperature: number
  simulation_duration: number
  simulation_seed: number
}

export type SimFunction = (duration: number, seed: number) => SimResult

export interface SimResult {
  total_value_earned: number
  duration_seconds: number
  wealth_history: Array<{ time: number; value: number }>
  events: Array<{ timestamp: number }>
  total_purchases: number
  final_production_rate: Record<string, number>
}

export type IterationCallback = (iter: number, score: number, bestScore: number) => void

export interface CancellationToken {
  readonly cancelled: boolean
}

export function defaultConfig(): AutoTunerConfig {
  return {
    max_iterations: 100,
    convergence_threshold: 0.001,
    convergence_patience: 10,
    optimization_method: 'HILL_CLIMBING',
    initial_temperature: 1.0,
    cooling_rate: 0.95,
    min_temperature: 0.01,
    simulation_duration: 3600,
    simulation_seed: -1,
  }
}

// ==================== MAIN RUN ====================

export async function runAutoTuner(
  params: TuningParameter[],
  goals: TuningGoal[],
  constraints: TuningConstraint[],
  config: AutoTunerConfig = defaultConfig(),
  simFn: SimFunction | null = null,
  onIteration: IterationCallback | null = null,
  cancellation?: CancellationToken,
): Promise<TuningResult> {
  let result = createTuningResult()
  result = { ...result, goals_total: goals.length }

  // Save originals
  const originalParams: TuningResult['original_parameters'] = {}
  for (const p of params) originalParams[p.id] = { ...p }
  result = { ...result, original_parameters: originalParams }

  let mutableParams = params.map((p) => ({ ...p }))
  let savedState: Record<string, number> = {}

  const saveBest = () => {
    savedState = {}
    for (const p of mutableParams) savedState[p.id] = p.current_value
  }

  const restoreBest = () => {
    mutableParams = mutableParams.map((p) =>
      savedState[p.id] !== undefined ? setValue(p, savedState[p.id]) : p,
    )
  }

  const evaluate = (iteration: number): [IterationResult, TuningResult] => {
    const iterResult: IterationResult = {
      iteration,
      parameters: {},
      goal_scores: {},
      constraint_checks: [],
      total_score: 0,
      all_constraints_satisfied: true,
      simulation_time_ms: 0,
    }

    const t0 = performance.now()
    for (const p of mutableParams) iterResult.parameters[p.id] = p.current_value

    // Run sim
    const simResult = simFn
      ? simFn(config.simulation_duration, config.simulation_seed)
      : mockSim(config.simulation_duration)

    // Check constraints
    for (const c of constraints) {
      let check: ConstraintCheckResult
      if (!c.parameter_id) {
        check = validateSimResult(c, simResult)
      } else {
        const pVal = mutableParams.find((p) => p.id === c.parameter_id)?.current_value ?? 0
        check = validateValue(c, pVal)
      }
      iterResult.constraint_checks.push(check)
      if (!check.valid) {
        iterResult.all_constraints_satisfied = false
        if (check.is_hard) {
          result = { ...result, constraint_violations: [...result.constraint_violations, check], all_constraints_satisfied: false }
        }
      }
    }

    // Evaluate goals
    let totalScore = 0
    let totalWeight = 0
    for (const goal of goals) {
      const metricVal = getMetricValue(goal, simResult)
      const evaluation = evaluateGoal(goal, metricVal)
      iterResult.goal_scores[goal.id] = evaluation
      totalScore += evaluation.weighted_score
      totalWeight += goal.weight
    }
    iterResult.total_score = totalWeight > 0 ? totalScore / totalWeight : 0
    iterResult.simulation_time_ms = performance.now() - t0

    return [iterResult, result]
  }

  // Create deterministic RNG from config seed
  const rng = createRNG(config.simulation_seed >= 0 ? config.simulation_seed : Date.now() & 0xFFFFFFFF)
  const ct = cancellation ?? { cancelled: false }

  // Choose method
  switch (config.optimization_method) {
    case 'HILL_CLIMBING':
      [mutableParams, result] = await runHillClimbing(mutableParams, goals, constraints, config, evaluate, saveBest, result, onIteration, rng, ct)
      break
    case 'SIMULATED_ANNEALING':
      [mutableParams, result] = await runSimAnnealing(mutableParams, goals, constraints, config, evaluate, saveBest, result, onIteration, rng, ct)
      break
    case 'RANDOM_SEARCH':
      [mutableParams, result] = await runRandomSearch(mutableParams, goals, constraints, config, evaluate, saveBest, result, onIteration, rng, ct)
      break
    case 'GRID_SEARCH':
      [mutableParams, result] = await runGridSearch(mutableParams, goals, constraints, config, evaluate, saveBest, result, onIteration, rng, ct)
      break
  }

  restoreBest()

  // Finalize
  const bestParams: TuningResult['best_parameters'] = {}
  for (const p of mutableParams) bestParams[p.id] = { ...p }
  result = { ...result, best_parameters: bestParams }

  let satisfied = 0
  for (const goalId of Object.keys(result.best_goal_results)) {
    if (result.best_goal_results[goalId]?.satisfied) satisfied++
  }
  const satRate = goals.length > 0 ? satisfied / goals.length : 0
  result = { ...result, goals_satisfied: satisfied, goal_satisfaction_rate: satRate }
  result = finalizeResult(result)
  return result
}

// ==================== METHODS ====================

type EvalFn = (iter: number) => [IterationResult, TuningResult]

async function runHillClimbing(
  params: TuningParameter[], _goals: TuningGoal[], _constraints: TuningConstraint[],
  config: AutoTunerConfig, evaluate: EvalFn,
  saveBest: () => void, result: TuningResult,
  onIteration: IterationCallback | null,
  rng: RNGInstance,
  ct: CancellationToken,
): Promise<[TuningParameter[], TuningResult]> {
  let bestScore = -Infinity
  let noImprovement = 0

  for (let i = 0; i < config.max_iterations; i++) {
    if (ct.cancelled) break
    if (i % 5 === 0) await new Promise<void>((r) => setTimeout(r, 0))
    const [iterResult, newResult] = evaluate(i)
    result = addIteration(newResult, iterResult)

    if (iterResult.all_constraints_satisfied) {
      if (iterResult.total_score > bestScore) {
        bestScore = iterResult.total_score
        noImprovement = 0
        saveBest()
      } else {
        noImprovement++
      }
    }

    onIteration?.(i, iterResult.total_score, bestScore)
    if (noImprovement >= config.convergence_patience) break

    // Find best param to adjust
    let bestParam: TuningParameter | null = null
    let bestDir: 1 | -1 = 1
    let bestImprovement = 0

    for (const p of params.filter((x) => !x.is_locked)) {
      const original = p.current_value

      const pUp = perturb(p, 1)
      const idx = params.indexOf(p)
      params[idx] = pUp
      const [upRes] = evaluate(-1)
      const upScore = upRes.all_constraints_satisfied ? upRes.total_score : -Infinity
      params[idx] = setValue(p, original)

      const pDown = perturb(p, -1)
      params[idx] = pDown
      const [downRes] = evaluate(-1)
      const downScore = downRes.all_constraints_satisfied ? downRes.total_score : -Infinity
      params[idx] = setValue(p, original)

      if (upScore > bestScore && upScore - bestScore > bestImprovement) {
        bestParam = p; bestDir = 1; bestImprovement = upScore - bestScore
      }
      if (downScore > bestScore && downScore - bestScore > bestImprovement) {
        bestParam = p; bestDir = -1; bestImprovement = downScore - bestScore
      }
    }

    if (bestParam) {
      const idx = params.findIndex((x) => x.id === bestParam!.id)
      if (idx >= 0) params[idx] = perturb(params[idx], bestDir)
    } else if (rng.randf() < 0.1) {
      randomPerturbation(params, 0.2, rng)
    }
  }
  return [params, result]
}

async function runSimAnnealing(
  params: TuningParameter[], _goals: TuningGoal[], _constraints: TuningConstraint[],
  config: AutoTunerConfig, evaluate: EvalFn,
  saveBest: () => void, result: TuningResult,
  onIteration: IterationCallback | null,
  rng: RNGInstance,
  ct: CancellationToken,
): Promise<[TuningParameter[], TuningResult]> {
  let temperature = config.initial_temperature
  let bestScore = -Infinity
  let currentScore = -Infinity

  const [initResult] = evaluate(0)
  result = addIteration(result, initResult)
  currentScore = initResult.all_constraints_satisfied ? initResult.total_score : -Infinity
  bestScore = currentScore
  if (currentScore > -Infinity) saveBest()

  for (let i = 1; i < config.max_iterations; i++) {
    if (ct.cancelled) break
    if (i % 5 === 0) await new Promise<void>((r) => setTimeout(r, 0))
    const unlocked = params.filter((p) => !p.is_locked)
    if (unlocked.length === 0) break
    const p = unlocked[Math.floor(rng.randf() * unlocked.length)]
    const idx = params.findIndex((x) => x.id === p.id)
    const original = p.current_value
    const dir = rng.randf() > 0.5 ? 1 : -1
    const magnitude = (0.5 + rng.randf() * 1.5) * temperature
    params[idx] = perturb(params[idx], dir as 1 | -1, magnitude)

    const [iterResult] = evaluate(i)
    result = addIteration(result, iterResult)
    const newScore = iterResult.all_constraints_satisfied ? iterResult.total_score : -Infinity

    let accept = newScore > currentScore
    if (!accept && currentScore !== -Infinity) {
      const probability = Math.exp((newScore - currentScore) / temperature)
      accept = rng.randf() < probability
    }

    if (accept) {
      currentScore = newScore
      if (newScore > bestScore) { bestScore = newScore; saveBest() }
    } else {
      params[idx] = setValue(params[idx], original)
    }

    onIteration?.(i, currentScore, bestScore)
    temperature = Math.max(config.min_temperature, temperature * config.cooling_rate)
  }
  return [params, result]
}

async function runRandomSearch(
  params: TuningParameter[], _goals: TuningGoal[], _constraints: TuningConstraint[],
  config: AutoTunerConfig, evaluate: EvalFn,
  saveBest: () => void, result: TuningResult,
  onIteration: IterationCallback | null,
  rng: RNGInstance,
  ct: CancellationToken,
): Promise<[TuningParameter[], TuningResult]> {
  let bestScore = -Infinity
  for (let i = 0; i < config.max_iterations; i++) {
    if (ct.cancelled) break
    if (i % 5 === 0) await new Promise<void>((r) => setTimeout(r, 0))
    for (let j = 0; j < params.length; j++) {
      if (!params[j].is_locked) params[j] = setNormalized(params[j], rng.randf())
    }
    const [iterResult] = evaluate(i)
    result = addIteration(result, iterResult)
    if (iterResult.all_constraints_satisfied && iterResult.total_score > bestScore) {
      bestScore = iterResult.total_score; saveBest()
    }
    onIteration?.(i, iterResult.total_score, bestScore)
  }
  return [params, result]
}

async function runGridSearch(
  params: TuningParameter[], _goals: TuningGoal[], _constraints: TuningConstraint[],
  config: AutoTunerConfig, evaluate: EvalFn,
  saveBest: () => void, result: TuningResult,
  onIteration: IterationCallback | null,
  _rng: RNGInstance,
  ct: CancellationToken,
): Promise<[TuningParameter[], TuningResult]> {
  const STEPS = 5
  const tunable = params.filter((p) => !p.is_locked).slice(0, 3)
  if (tunable.length === 0) return [params, result]

  const total = Math.min(Math.pow(STEPS, tunable.length), config.max_iterations)
  let bestScore = -Infinity

  for (let combo = 0; combo < total; combo++) {
    if (ct.cancelled) break
    if (combo % 5 === 0) await new Promise<void>((r) => setTimeout(r, 0))
    let temp = combo
    for (let k = 0; k < tunable.length; k++) {
      const stepIdx = temp % STEPS
      temp = Math.floor(temp / STEPS)
      const tIdx = params.findIndex((x) => x.id === tunable[k].id)
      if (tIdx >= 0) params[tIdx] = setNormalized(params[tIdx], stepIdx / (STEPS - 1))
    }
    const [iterResult] = evaluate(combo)
    result = addIteration(result, iterResult)
    if (iterResult.all_constraints_satisfied && iterResult.total_score > bestScore) {
      bestScore = iterResult.total_score; saveBest()
    }
    onIteration?.(combo, iterResult.total_score, bestScore)
  }
  return [params, result]
}

// ==================== HELPERS ====================

function randomPerturbation(params: TuningParameter[], magnitude: number, rng: RNGInstance): void {
  for (let i = 0; i < params.length; i++) {
    if (params[i].is_locked || rng.randf() >= 0.3) continue
    const dir = rng.randf() > 0.5 ? 1 : -1
    params[i] = perturb(params[i], dir as 1 | -1, magnitude)
  }
}

function getMetricValue(goal: TuningGoal, simResult: SimResult): number {
  switch (goal.metric_type) {
    case 'TIME_TO_FIRST_UPGRADE':
      return simResult.events.length > 0 ? simResult.events[0].timestamp : simResult.duration_seconds
    case 'EARNINGS_RATE':
      return simResult.duration_seconds > 0 ? simResult.total_value_earned / simResult.duration_seconds : 0
    case 'GROWTH_MULTIPLIER': {
      const h = simResult.wealth_history
      if (h.length < 2) return 1
      return h[0].value > 0 ? h[h.length - 1].value / h[0].value : 0
    }
    case 'PURCHASES_PER_HOUR':
      return simResult.duration_seconds > 0 ? simResult.total_purchases / (simResult.duration_seconds / 3600) : 0
    default: return 0
  }
}

function mockSim(duration: number): SimResult {
  // mockSim is a fallback stub — uses simple deterministic values instead of Math.random()
  return {
    total_value_earned: 50000,
    duration_seconds: duration,
    wealth_history: [{ time: 0, value: 0 }, { time: duration, value: 50000 }],
    events: [],
    total_purchases: 25,
    final_production_rate: {},
  }
}

// ==================== STANDARD PRESETS ====================

export function createStandardTuner(): { goals: TuningGoal[]; constraints: TuningConstraint[] } {
  return {
    goals: [
      goalMaximizeHealthScore(0.7),
      goalTimeToFirstUpgrade(60),
      goalMinimizeExploitability(),
      goalBalancedProgression(2.0),
    ],
    constraints: [constraintNoDeadlock(), constraintNoRunaway()],
  }
}
