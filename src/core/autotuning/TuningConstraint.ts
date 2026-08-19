// TuningConstraint.ts — port GDScript TuningConstraint.gd

export type ConstraintType = 'MIN_VALUE' | 'MAX_VALUE' | 'RANGE' | 'NO_DEADLOCK' | 'NO_RUNAWAY' | 'POSITIVE' | 'NON_NEGATIVE' | 'INTEGER' | 'CUSTOM'

export interface TuningConstraint {
  id: string
  name: string
  description: string
  constraint_type: ConstraintType
  parameter_id: string
  min_value: number
  max_value: number
  is_hard_constraint: boolean
  violation_penalty: number
  custom_validator?: (v: number) => boolean
}

export interface ConstraintCheckResult {
  constraint_id: string
  constraint_name: string
  parameter_id: string
  value?: number
  valid: boolean
  violation_message: string
  is_hard?: boolean
  penalty?: number
}

let _cCounter = 0

export function createConstraint(id = '', name = ''): TuningConstraint {
  return {
    id:                 id || `constraint_${Date.now()}_${_cCounter++}`,
    name,
    description:        '',
    constraint_type:    'RANGE',
    parameter_id:       '',
    min_value:          0,
    max_value:          Infinity,
    is_hard_constraint: true,
    violation_penalty:  100,
  }
}

export function validateValue(c: TuningConstraint, value: number): ConstraintCheckResult {
  const result: ConstraintCheckResult = {
    constraint_id:     c.id,
    constraint_name:   c.name,
    parameter_id:      c.parameter_id,
    value,
    valid:             true,
    violation_message: '',
  }

  switch (c.constraint_type) {
    case 'MIN_VALUE':
      if (value < c.min_value) { result.valid = false; result.violation_message = `Value ${value.toFixed(2)} is below minimum ${c.min_value.toFixed(2)}` }
      break
    case 'MAX_VALUE':
      if (value > c.max_value) { result.valid = false; result.violation_message = `Value ${value.toFixed(2)} exceeds maximum ${c.max_value.toFixed(2)}` }
      break
    case 'RANGE':
      if (value < c.min_value || value > c.max_value) { result.valid = false; result.violation_message = `Value ${value.toFixed(2)} outside range [${c.min_value.toFixed(2)}, ${c.max_value.toFixed(2)}]` }
      break
    case 'POSITIVE':
      if (value <= 0) { result.valid = false; result.violation_message = `Value ${value.toFixed(2)} must be positive` }
      break
    case 'NON_NEGATIVE':
      if (value < 0) { result.valid = false; result.violation_message = `Value ${value.toFixed(2)} must be non-negative` }
      break
    case 'INTEGER':
      if (value !== Math.floor(value)) { result.valid = false; result.violation_message = `Value ${value.toFixed(2)} must be an integer` }
      break
    case 'CUSTOM':
      if (c.custom_validator && !c.custom_validator(value)) { result.valid = false; result.violation_message = `Custom validation failed for value ${value.toFixed(2)}` }
      break
  }

  if (!result.valid) {
    result.is_hard  = c.is_hard_constraint
    result.penalty  = c.is_hard_constraint ? Infinity : c.violation_penalty
  }
  return result
}

interface SimResult { wealth_history?: Array<{ value: number }> }

export function validateSimResult(c: TuningConstraint, simResult: SimResult | null): ConstraintCheckResult {
  const result: ConstraintCheckResult = {
    constraint_id:     c.id,
    constraint_name:   c.name,
    parameter_id:      '',
    valid:             true,
    violation_message: '',
  }

  if (!simResult) return result
  const history = simResult.wealth_history ?? []

  switch (c.constraint_type) {
    case 'NO_DEADLOCK':
      if (history.length >= 10) {
        const last10 = history.slice(-10).map((h) => h.value)
        const allSame = last10.every((v) => Math.abs(v - last10[0]) < 0.001)
        if (allSame && last10[0] < 1_000_000) {
          result.valid = false
          result.violation_message = 'Economy appears deadlocked'
        }
      }
      break
    case 'NO_RUNAWAY':
      if (history.length >= 2) {
        const first = history[0].value
        const last  = history[history.length - 1].value
        if (first > 0 && last / first > 1_000_000) {
          result.valid = false
          result.violation_message = 'Runaway growth detected (>1M multiplier)'
        }
      }
      break
  }

  if (!result.valid) {
    result.is_hard = c.is_hard_constraint
    result.penalty = c.is_hard_constraint ? Infinity : c.violation_penalty
  }
  return result
}

// ==================== FACTORY ====================

export function constraintPositiveRate(paramId: string): TuningConstraint {
  return { ...createConstraint('', 'Positive Rate'), description: 'Production rate must be positive', constraint_type: 'POSITIVE', parameter_id: paramId }
}

export function constraintCostRange(paramId: string, minCost: number, maxCost: number): TuningConstraint {
  return { ...createConstraint('', 'Cost Range'), description: 'Cost must be within reasonable bounds', constraint_type: 'RANGE', parameter_id: paramId, min_value: minCost, max_value: maxCost }
}

export function constraintNoDeadlock(): TuningConstraint {
  return { ...createConstraint('', 'No Deadlock'), description: 'Economy must not enter deadlock state', constraint_type: 'NO_DEADLOCK' }
}

export function constraintNoRunaway(): TuningConstraint {
  return { ...createConstraint('', 'No Runaway Growth'), description: 'Economy must not have infinite growth', constraint_type: 'NO_RUNAWAY' }
}

export function constraintMultiplierRange(paramId: string, minMult = 1.0, maxMult = 10.0): TuningConstraint {
  return { ...createConstraint('', 'Multiplier Range'), description: 'Multiplier must be within reasonable bounds', constraint_type: 'RANGE', parameter_id: paramId, min_value: minMult, max_value: maxMult }
}
