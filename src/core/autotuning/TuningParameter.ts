// TuningParameter.ts — port GDScript TuningParameter.gd

export type ParameterType = 'PRODUCER_RATE' | 'PRODUCER_COST' | 'COST_COEFFICIENT' | 'UPGRADE_VALUE' | 'UPGRADE_COST' | 'STARTING_BALANCE' | 'RESOURCE_VALUE' | 'CUSTOM'
export type ScaleType     = 'LINEAR' | 'LOGARITHMIC' | 'EXPONENTIAL'

export interface TuningParameter {
  id: string
  name: string
  description: string
  parameter_type: ParameterType
  scale_type: ScaleType
  target_id: string
  target_property: string
  current_value: number
  original_value: number
  min_value: number
  max_value: number
  step_size: number
  is_locked: boolean
  sensitivity: number
}

let _paramCounter = 0

export function createParam(id = '', name = ''): TuningParameter {
  return {
    id:             id || `param_${Date.now()}_${_paramCounter++}`,
    name,
    description:    '',
    parameter_type: 'PRODUCER_RATE',
    scale_type:     'LINEAR',
    target_id:      '',
    target_property: '',
    current_value:  0,
    original_value: 0,
    min_value:      0,
    max_value:      Infinity,
    step_size:      1,
    is_locked:      false,
    sensitivity:    1,
  }
}

// ==================== OPERATIONS ====================

export function setValue(p: TuningParameter, value: number): TuningParameter {
  let v = Math.max(p.min_value, Math.min(p.max_value, value))
  if (p.step_size > 0) v = Math.round(v / p.step_size) * p.step_size
  return { ...p, current_value: v }
}

export function getNormalized(p: TuningParameter): number {
  if (p.max_value <= p.min_value) return 0.5
  return (p.current_value - p.min_value) / (p.max_value - p.min_value)
}

export function setNormalized(p: TuningParameter, norm: number): TuningParameter {
  return setValue(p, p.min_value + norm * (p.max_value - p.min_value))
}

function getSuggestedStep(p: TuningParameter): number {
  switch (p.scale_type) {
    case 'LOGARITHMIC':  return p.current_value * 0.1
    case 'EXPONENTIAL':  return p.current_value * 0.05
    default:             return p.step_size
  }
}

export function perturb(p: TuningParameter, direction: 1 | -1, magnitude = 1): TuningParameter {
  const step = getSuggestedStep(p) * magnitude
  return setValue(p, p.current_value + step * direction)
}

export function resetToOriginal(p: TuningParameter): TuningParameter {
  return { ...p, current_value: p.original_value }
}

export function getChangeFromOriginal(p: TuningParameter): number {
  if (p.original_value === 0) return p.current_value === 0 ? 0 : Infinity
  return (p.current_value - p.original_value) / p.original_value
}

// ==================== FACTORY ====================

interface ProducerDef { id: string; name?: string; rate?: number; cost?: number; cost_coefficient?: number }
interface UpgradeDef  { id: string; name?: string; value?: number; cost?: number }

export function fromProducer(producer: ProducerDef): TuningParameter[] {
  const pid = producer.id
  const pname = producer.name ?? pid
  const params: TuningParameter[] = []

  const rate = producer.rate ?? 1
  params.push({
    ...createParam('', `${pname} Rate`),
    parameter_type: 'PRODUCER_RATE', scale_type: 'LINEAR',
    target_id: pid, target_property: 'rate',
    current_value: rate, original_value: rate,
    min_value: 0.01, max_value: rate * 100, step_size: rate * 0.1, sensitivity: 0.8,
  })

  const cost = producer.cost ?? 10
  params.push({
    ...createParam('', `${pname} Cost`),
    parameter_type: 'PRODUCER_COST', scale_type: 'LOGARITHMIC',
    target_id: pid, target_property: 'cost',
    current_value: cost, original_value: cost,
    min_value: 1, max_value: cost * 1000, step_size: 1, sensitivity: 0.9,
  })

  if (producer.cost_coefficient !== undefined) {
    const coeff = producer.cost_coefficient
    params.push({
      ...createParam('', `${pname} Cost Scaling`),
      parameter_type: 'COST_COEFFICIENT', scale_type: 'EXPONENTIAL',
      target_id: pid, target_property: 'cost_coefficient',
      current_value: coeff, original_value: coeff,
      min_value: 1.01, max_value: 2.0, step_size: 0.01, sensitivity: 0.95,
    })
  }
  return params
}

export function fromUpgrade(upgrade: UpgradeDef): TuningParameter[] {
  const uid = upgrade.id
  const uname = upgrade.name ?? uid
  const params: TuningParameter[] = []

  const value = upgrade.value ?? 2
  params.push({
    ...createParam('', `${uname} Value`),
    parameter_type: 'UPGRADE_VALUE', scale_type: 'EXPONENTIAL',
    target_id: uid, target_property: 'value',
    current_value: value, original_value: value,
    min_value: 1.01, max_value: 100, step_size: 0.1, sensitivity: 0.7,
  })

  if (upgrade.cost && upgrade.cost > 0) {
    const cost = upgrade.cost
    params.push({
      ...createParam('', `${uname} Cost`),
      parameter_type: 'UPGRADE_COST', scale_type: 'LOGARITHMIC',
      target_id: uid, target_property: 'cost',
      current_value: cost, original_value: cost,
      min_value: 1, max_value: cost * 100, step_size: 1, sensitivity: 0.6,
    })
  }
  return params
}

export function extractAllFromEconomy(economyConfig: Record<string, unknown>): TuningParameter[] {
  const all: TuningParameter[] = []
  const producers = (economyConfig['producers'] ?? []) as ProducerDef[]
  const upgrades  = (economyConfig['upgrades']  ?? []) as UpgradeDef[]
  const balances  = (economyConfig['starting_balances'] ?? {}) as Record<string, number>

  for (const p of producers) all.push(...fromProducer(p))
  for (const u of upgrades)  all.push(...fromUpgrade(u))

  for (const [resId, amount] of Object.entries(balances)) {
    all.push({
      ...createParam('', `Starting ${resId}`),
      parameter_type: 'STARTING_BALANCE', scale_type: 'LOGARITHMIC',
      target_id: resId, target_property: 'starting_balance',
      current_value: amount, original_value: amount,
      min_value: 0, max_value: amount * 100, step_size: 1, sensitivity: 0.5,
    })
  }
  return all
}
