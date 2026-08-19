// TuningGoal.ts — port GDScript TuningGoal.gd

export type GoalType   = 'MAXIMIZE' | 'MINIMIZE' | 'TARGET' | 'RANGE'
export type MetricType = 'TIME_TO_FIRST_UPGRADE' | 'TIME_TO_MILESTONE' | 'EARNINGS_RATE' | 'GROWTH_MULTIPLIER' | 'HEALTH_SCORE' | 'STABILITY_SCORE' | 'CONVERGENCE_SCORE' | 'FAIRNESS_SCORE' | 'EXPLOITABILITY_SCORE' | 'SESSION_LENGTH' | 'PURCHASES_PER_HOUR' | 'RESOURCE_BALANCE' | 'CUSTOM'

export interface TuningGoal {
  id: string
  name: string
  description: string
  goal_type: GoalType
  metric_type: MetricType
  custom_metric_name: string
  target_value: number
  min_value: number
  max_value: number
  weight: number
  tolerance: number
  profile_filter: string
}

export interface GoalEvalResult {
  goal_id: string
  goal_name: string
  metric: string
  actual: number
  target: number
  satisfied: boolean
  score: number
  deviation: number
  weighted_score: number
}

let _goalCounter = 0

export function createGoal(id = '', name = ''): TuningGoal {
  return {
    id:                 id || `goal_${Date.now()}_${_goalCounter++}`,
    name,
    description:        '',
    goal_type:          'TARGET',
    metric_type:        'HEALTH_SCORE',
    custom_metric_name: '',
    target_value:       0,
    min_value:          0,
    max_value:          0,
    weight:             1,
    tolerance:          0.1,
    profile_filter:     '',
  }
}

export function evaluateGoal(goal: TuningGoal, actualValue: number): GoalEvalResult {
  const result: GoalEvalResult = {
    goal_id:        goal.id,
    goal_name:      goal.name,
    metric:         goal.metric_type === 'CUSTOM' ? goal.custom_metric_name : goal.metric_type.toLowerCase(),
    actual:         actualValue,
    target:         goal.target_value,
    satisfied:      false,
    score:          0,
    deviation:      0,
    weighted_score: 0,
  }

  switch (goal.goal_type) {
    case 'MAXIMIZE':
      result.satisfied = actualValue >= goal.target_value
      result.score     = goal.target_value > 0 ? Math.min(actualValue / goal.target_value, 1) : 1
      result.deviation = actualValue < goal.target_value ? goal.target_value - actualValue : 0
      break

    case 'MINIMIZE':
      result.satisfied = actualValue <= goal.target_value
      if (actualValue <= 0)          result.score = 1
      else if (goal.target_value <= 0) result.score = 0
      else                           result.score = Math.min(goal.target_value / actualValue, 1)
      result.deviation = actualValue > goal.target_value ? actualValue - goal.target_value : 0
      break

    case 'TARGET': {
      const tolAbs = goal.target_value * goal.tolerance
      result.deviation = Math.abs(actualValue - goal.target_value)
      result.satisfied = result.deviation <= tolAbs
      result.score     = tolAbs > 0 ? Math.max(0, 1 - result.deviation / tolAbs) : (result.deviation === 0 ? 1 : 0)
      break
    }

    case 'RANGE': {
      const rangeSize = goal.max_value - goal.min_value
      if (actualValue >= goal.min_value && actualValue <= goal.max_value) {
        result.satisfied = true; result.score = 1; result.deviation = 0
      } else if (actualValue < goal.min_value) {
        result.deviation = goal.min_value - actualValue
        result.score = rangeSize > 0 ? Math.max(0, 1 - result.deviation / rangeSize) : 0
      } else {
        result.deviation = actualValue - goal.max_value
        result.score = rangeSize > 0 ? Math.max(0, 1 - result.deviation / rangeSize) : 0
      }
      result.target = (goal.min_value + goal.max_value) / 2
      break
    }
  }

  result.weighted_score = result.score * goal.weight
  return result
}

// ==================== FACTORY ====================

export function goalTimeToFirstUpgrade(targetSeconds: number, tolerancePct = 0.2): TuningGoal {
  return { ...createGoal('', 'Time to First Upgrade'), description: 'Target time for new players to afford first upgrade', goal_type: 'TARGET', metric_type: 'TIME_TO_FIRST_UPGRADE', target_value: targetSeconds, tolerance: tolerancePct, weight: 0.9, profile_filter: 'NEWBIE' }
}

export function goalMaximizeHealthScore(minAcceptable = 0.7): TuningGoal {
  return { ...createGoal('', 'Maximize Health Score'), description: 'Achieve highest possible economy health score', goal_type: 'MAXIMIZE', metric_type: 'HEALTH_SCORE', target_value: minAcceptable, weight: 1.0 }
}

export function goalEarningsRateRange(minRate: number, maxRate: number): TuningGoal {
  return { ...createGoal('', 'Earnings Rate Range'), description: 'Keep earnings rate within acceptable bounds', goal_type: 'RANGE', metric_type: 'EARNINGS_RATE', min_value: minRate, max_value: maxRate, weight: 0.8 }
}

export function goalMinimizeExploitability(): TuningGoal {
  return { ...createGoal('', 'Minimize Exploitability'), description: 'Reduce exploit potential in economy', goal_type: 'MINIMIZE', metric_type: 'EXPLOITABILITY_SCORE', target_value: 0.2, weight: 0.7 }
}

export function goalSessionLength(targetMinutes: number): TuningGoal {
  return { ...createGoal('', 'Session Length'), description: 'Target average session length', goal_type: 'TARGET', metric_type: 'SESSION_LENGTH', target_value: targetMinutes * 60, tolerance: 0.25, weight: 0.6 }
}

export function goalBalancedProgression(growthTarget = 2.0): TuningGoal {
  return { ...createGoal('', 'Balanced Progression'), description: 'Achieve steady growth without runaway inflation', goal_type: 'TARGET', metric_type: 'GROWTH_MULTIPLIER', target_value: growthTarget, tolerance: 0.3, weight: 0.85 }
}
