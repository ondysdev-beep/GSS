// EconomyModule.ts — port GDScript EconomyModule.gd
// Jednoduchý idle economy systém: zdroje, producenty, tick simulace.

export interface EconomyResource {
  name: string
  value: number
  max_value: number   // -1 = neomezeno
  min_value: number
}

export interface EconomyProducer {
  name: string
  output_resource: string
  rate: number
  enabled: boolean
  cost_resource: string
  cost_rate: number
}

export interface EconomyState {
  resources: Record<string, EconomyResource>
  producers: Record<string, EconomyProducer>
}

export function createEconomyState(): EconomyState {
  return { resources: {}, producers: {} }
}

// ==================== ZDROJE ====================

export function addResource(
  state: EconomyState,
  id: string,
  name: string,
  initialValue = 0,
): EconomyState {
  return {
    ...state,
    resources: {
      ...state.resources,
      [id]: { name, value: initialValue, max_value: -1, min_value: 0 },
    },
  }
}

export function removeResource(state: EconomyState, id: string): EconomyState {
  const resources = { ...state.resources }
  delete resources[id]
  return { ...state, resources }
}

export function getResourceValue(state: EconomyState, id: string): number {
  return state.resources[id]?.value ?? 0
}

export function setResourceValue(state: EconomyState, id: string, value: number): EconomyState {
  if (!state.resources[id]) return state
  return {
    ...state,
    resources: { ...state.resources, [id]: { ...state.resources[id], value } },
  }
}

// ==================== PRODUCENTY ====================

export function addProducer(
  state: EconomyState,
  id: string,
  name: string,
  outputResource: string,
  rate = 1,
): EconomyState {
  return {
    ...state,
    producers: {
      ...state.producers,
      [id]: { name, output_resource: outputResource, rate, enabled: true, cost_resource: '', cost_rate: 0 },
    },
  }
}

export function removeProducer(state: EconomyState, id: string): EconomyState {
  const producers = { ...state.producers }
  delete producers[id]
  return { ...state, producers }
}

export function getTotalProductionRate(state: EconomyState, resourceId: string): number {
  let total = 0
  for (const prod of Object.values(state.producers)) {
    if (prod.output_resource === resourceId && prod.enabled) total += prod.rate
  }
  return total
}

// ==================== TICK ====================

export function simulateTick(state: EconomyState, delta: number): [EconomyState, Record<string, number>] {
  const changes: Record<string, number> = {}
  const resources = { ...state.resources }

  for (const prod of Object.values(state.producers)) {
    if (!prod.enabled || !prod.output_resource || !resources[prod.output_resource]) continue
    const produced = prod.rate * delta
    const res = resources[prod.output_resource]
    let newValue = res.value + produced
    if (res.max_value >= 0) newValue = Math.min(newValue, res.max_value)
    resources[prod.output_resource] = { ...res, value: newValue }
    changes[prod.output_resource] = (changes[prod.output_resource] ?? 0) + produced
  }

  return [{ ...state, resources }, changes]
}

// ==================== SERIALIZACE ====================

export function economyToJSON(state: EconomyState): string {
  return JSON.stringify(state, null, 2)
}

export function economyFromJSON(json: string): EconomyState {
  return JSON.parse(json) as EconomyState
}
