// AutoTuner.ts — port GDScript AutoTuner.gd
// Hill climbing / simulated annealing / random search / grid search optimizer.
//
// Pozn.: AutoTuner záložka v UI (components/ui/AutoTunerPanel.tsx) používá
// vlastní, jednodušší optimalizátor nad RunReport pipeline. Tento modul je
// obecné API (např. pro SDK/skripty) s cíli a constrainty.

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

/**
 * Runs one simulation for the CURRENT parameter values (param.id → value).
 * Dřív simFn parametry vůbec nedostávala, takže každá iterace vrátila
 * totéž a optimalizace neměla na co reagovat.
 */
export type SimFunction = (params: Record<string, number>, duration: number, seed: number) => SimResult

export interface SimResult {
  total_value_earned: number
  duration_seconds: number
  wealth_history: Array<{ time: number; value: number }>
  events: Array<{ timestamp: number }>
  total_purchases: number
  final_production_rate: Record<string, number>
  /** Health sub-scores on the 0–100 scale (HealthScoreCalculator), if the simulation computed them. */
  health?: Partial<Record<'total' | 'stability' | 'convergence' | 'fairness' | 'exploitability' | 'recovery', number>>
  /** Extra named metrics for TIME_TO_MILESTONE / RESOURCE_BALANCE / CUSTOM goals. */
  metrics?: Record<string, number>
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

  const mutableParams = params.map((p) => ({ ...p }))
  let savedState: Record<string, number> | null = null

  const saveBest = () => {
    savedState = {}
    for (const p of mutableParams) savedState[p.id] = p.current_value
  }

  // Create deterministic RNG from config seed (also used as the simulation seed)
  const seed = config.simulation_seed >= 0 ? config.simulation_seed >>> 0 : (Date.now() >>> 0)
  const rng = createRNG(seed)

  const evaluate = (iteration: number): IterationResult => {
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

    const simResult = simFn
      ? simFn({ ...iterResult.parameters }, config.simulation_duration, seed)
      : mockSim(config.simulation_duration)

    for (const c of constraints) {
      let check: ConstraintCheckResult
      if (!c.parameter_id) {
        check = validateSimResult(c, simResult)
      } else {
        const pVal = mutableParams.find((p) => p.id === c.parameter_id)?.current_value ?? 0
        check = validateValue(c, pVal)
      }
      iterResult.constraint_checks.push(check)
      // Jen tvrdé constrainty vyřazují iteraci; měkké se projeví penalizací skóre.
      if (!check.valid && check.is_hard) iterResult.all_constraints_satisfied = false
    }

    let totalScore = 0
    let totalWeight = 0
    for (const goal of goals) {
      const evaluation = evaluateGoal(goal, getMetricValue(goal, simResult))
      iterResult.goal_scores[goal.id] = evaluation
      totalScore += evaluation.weighted_score
      totalWeight += goal.weight
    }
    let score = totalWeight > 0 ? totalScore / totalWeight : 0
    for (const check of iterResult.constraint_checks) {
      if (!check.valid && !check.is_hard) score -= (check.penalty ?? 0) / 100
    }
    iterResult.total_score = score
    iterResult.simulation_time_ms = performance.now() - t0

    return iterResult
  }

  const ct = cancellation ?? { cancelled: false }
  const ctx: MethodContext = { params: mutableParams, config, evaluate, saveBest, onIteration, rng, ct }

  switch (config.optimization_method) {
    case 'HILL_CLIMBING':       result = await runHillClimbing(ctx, result); break
    case 'SIMULATED_ANNEALING': result = await runSimAnnealing(ctx, result); break
    case 'RANDOM_SEARCH':       result = await runRandomSearch(ctx, result); break
    case 'GRID_SEARCH':         result = await runGridSearch(ctx, result); break
  }

  // Obnovit nejlepší nalezený stav; když žádná iterace nesplnila constrainty,
  // vrátit originální hodnoty (dřív zůstaly poslední náhodně posunuté hodnoty).
  const restore: Record<string, number> = savedState ?? Object.fromEntries(params.map((p) => [p.id, p.current_value]))
  const bestParams: TuningResult['best_parameters'] = {}
  for (const p of mutableParams) {
    bestParams[p.id] = restore[p.id] !== undefined ? setValue(p, restore[p.id]) : { ...p }
  }
  result = { ...result, best_parameters: bestParams }

  return finalizeResult(result)
}

// ==================== METHODS ====================

interface MethodContext {
  params: TuningParameter[]
  config: AutoTunerConfig
  evaluate: (iter: number) => IterationResult
  saveBest: () => void
  onIteration: IterationCallback | null
  rng: RNGInstance
  ct: CancellationToken
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0))

async function runHillClimbing(ctx: MethodContext, result: TuningResult): Promise<TuningResult> {
  const { params, config, evaluate, saveBest, onIteration, rng, ct } = ctx
  let bestScore = -Infinity
  let noImprovement = 0

  for (let i = 0; i < config.max_iterations; i++) {
    if (ct.cancelled) break
    if (i % 5 === 0) await yieldToUI()
    const iterResult = evaluate(i)
    result = addIteration(result, iterResult)

    if (iterResult.all_constraints_satisfied && iterResult.total_score > bestScore + config.convergence_threshold) {
      bestScore = iterResult.total_score
      noImprovement = 0
      saveBest()
    } else {
      noImprovement++
    }

    onIteration?.(i, iterResult.total_score, bestScore)
    if (noImprovement >= config.convergence_patience) break

    // Find best param to adjust (probe evaluations are not recorded as iterations)
    let bestIdx = -1
    let bestDir: 1 | -1 = 1
    let bestImprovement = 0
    const current = iterResult.all_constraints_satisfied ? iterResult.total_score : -Infinity

    for (let idx = 0; idx < params.length; idx++) {
      const p = params[idx]
      if (p.is_locked) continue
      for (const dir of [1, -1] as const) {
        params[idx] = perturb(p, dir)
        const probe = evaluate(-1)
        params[idx] = p
        const probeScore = probe.all_constraints_satisfied ? probe.total_score : -Infinity
        if (probeScore - current > bestImprovement) {
          bestIdx = idx; bestDir = dir; bestImprovement = probeScore - current
        }
      }
    }

    if (bestIdx >= 0) {
      params[bestIdx] = perturb(params[bestIdx], bestDir)
    } else if (rng.randf() < 0.1) {
      randomPerturbation(params, 0.2, rng)
    }
  }
  return result
}

async function runSimAnnealing(ctx: MethodContext, result: TuningResult): Promise<TuningResult> {
  const { params, config, evaluate, saveBest, onIteration, rng, ct } = ctx
  let temperature = config.initial_temperature

  const initResult = evaluate(0)
  result = addIteration(result, initResult)
  let currentScore = initResult.all_constraints_satisfied ? initResult.total_score : -Infinity
  let bestScore = currentScore
  if (currentScore > -Infinity) saveBest()

  for (let i = 1; i < config.max_iterations; i++) {
    if (ct.cancelled) break
    if (i % 5 === 0) await yieldToUI()
    const unlocked = params.filter((p) => !p.is_locked)
    if (unlocked.length === 0) break
    const p = unlocked[Math.floor(rng.randf() * unlocked.length)]
    const idx = params.findIndex((x) => x.id === p.id)
    const previous = params[idx]
    const dir = rng.randf() > 0.5 ? 1 : -1
    const magnitude = (0.5 + rng.randf() * 1.5) * temperature
    params[idx] = perturb(previous, dir as 1 | -1, magnitude)

    const iterResult = evaluate(i)
    result = addIteration(result, iterResult)
    const newScore = iterResult.all_constraints_satisfied ? iterResult.total_score : -Infinity

    let accept = newScore > currentScore
    if (!accept && currentScore !== -Infinity && newScore !== -Infinity) {
      accept = rng.randf() < Math.exp((newScore - currentScore) / temperature)
    }

    if (accept) {
      currentScore = newScore
      if (newScore > bestScore) { bestScore = newScore; saveBest() }
    } else {
      params[idx] = previous
    }

    onIteration?.(i, currentScore, bestScore)
    temperature = Math.max(config.min_temperature, temperature * config.cooling_rate)
  }
  return result
}

async function runRandomSearch(ctx: MethodContext, result: TuningResult): Promise<TuningResult> {
  const { params, config, evaluate, saveBest, onIteration, rng, ct } = ctx
  let bestScore = -Infinity
  for (let i = 0; i < config.max_iterations; i++) {
    if (ct.cancelled) break
    if (i % 5 === 0) await yieldToUI()
    for (let j = 0; j < params.length; j++) {
      if (!params[j].is_locked) params[j] = setNormalized(params[j], rng.randf())
    }
    const iterResult = evaluate(i)
    result = addIteration(result, iterResult)
    if (iterResult.all_constraints_satisfied && iterResult.total_score > bestScore) {
      bestScore = iterResult.total_score; saveBest()
    }
    onIteration?.(i, iterResult.total_score, bestScore)
  }
  return result
}

async function runGridSearch(ctx: MethodContext, result: TuningResult): Promise<TuningResult> {
  const { params, config, evaluate, saveBest, onIteration, ct } = ctx
  const STEPS = 5
  const tunable = params.filter((p) => !p.is_locked).slice(0, 3)
  if (tunable.length === 0) return result

  const total = Math.min(Math.pow(STEPS, tunable.length), config.max_iterations)
  let bestScore = -Infinity

  for (let combo = 0; combo < total; combo++) {
    if (ct.cancelled) break
    if (combo % 5 === 0) await yieldToUI()
    let temp = combo
    for (let k = 0; k < tunable.length; k++) {
      const stepIdx = temp % STEPS
      temp = Math.floor(temp / STEPS)
      const tIdx = params.findIndex((x) => x.id === tunable[k].id)
      if (tIdx >= 0) params[tIdx] = setNormalized(params[tIdx], stepIdx / (STEPS - 1))
    }
    const iterResult = evaluate(combo)
    result = addIteration(result, iterResult)
    if (iterResult.all_constraints_satisfied && iterResult.total_score > bestScore) {
      bestScore = iterResult.total_score; saveBest()
    }
    onIteration?.(combo, iterResult.total_score, bestScore)
  }
  return result
}

// ==================== HELPERS ====================

function randomPerturbation(params: TuningParameter[], magnitude: number, rng: RNGInstance): void {
  for (let i = 0; i < params.length; i++) {
    if (params[i].is_locked || rng.randf() >= 0.3) continue
    const dir = rng.randf() > 0.5 ? 1 : -1
    params[i] = perturb(params[i], dir as 1 | -1, magnitude)
  }
}

/** Metric value for a goal; NaN when the simulation did not provide it (the goal then scores 0). */
function getMetricValue(goal: TuningGoal, simResult: SimResult): number {
  const health = (key: keyof NonNullable<SimResult['health']>) => {
    const v = simResult.health?.[key]
    return typeof v === 'number' ? v / 100 : NaN   // 0–1 scale (goalMaximizeHealthScore(0.7) etc.)
  }
  switch (goal.metric_type) {
    case 'TIME_TO_FIRST_UPGRADE':
      return simResult.events.length > 0 ? simResult.events[0].timestamp : simResult.duration_seconds
    case 'EARNINGS_RATE':
      return simResult.duration_seconds > 0 ? simResult.total_value_earned / simResult.duration_seconds : 0
    case 'GROWTH_MULTIPLIER': {
      const h = simResult.wealth_history
      if (h.length < 2) return 1
      return h[0].value > 0 ? h[h.length - 1].value / h[0].value : NaN
    }
    case 'PURCHASES_PER_HOUR':
      return simResult.duration_seconds > 0 ? simResult.total_purchases / (simResult.duration_seconds / 3600) : 0
    case 'SESSION_LENGTH':
      return simResult.duration_seconds
    case 'HEALTH_SCORE':      return health('total')
    case 'STABILITY_SCORE':   return health('stability')
    case 'CONVERGENCE_SCORE': return health('convergence')
    case 'FAIRNESS_SCORE':    return health('fairness')
    // HealthScore.exploitability = ODOLNOST (100 = nejde exploitovat), cíl
    // "Minimize Exploitability" ale pracuje s POTENCIÁLEM exploitu → 1 − odolnost.
    case 'EXPLOITABILITY_SCORE': {
      const resistance = health('exploitability')
      return Number.isFinite(resistance) ? 1 - resistance : NaN
    }
    case 'TIME_TO_MILESTONE':
    case 'RESOURCE_BALANCE':
      return simResult.metrics?.[goal.metric_type.toLowerCase()] ?? NaN
    case 'CUSTOM':
      return simResult.metrics?.[goal.custom_metric_name] ?? NaN
    default: return NaN
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
