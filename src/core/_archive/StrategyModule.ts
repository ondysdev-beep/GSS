// StrategyModule.ts — port GDScript StrategyModule.gd
// Správa výrobních řetězců, přidělování pracovníků, detekce bottlenecků.

export interface ChainInput  { resource: string; amount: number }
export interface ChainOutput { resource: string; amount: number }

export interface ProductionChain {
  id: string
  name: string
  inputs: ChainInput[]
  outputs: ChainOutput[]
  time: number             // čas cyklu v sekundách
  workers_required: number
}

export interface WorkerData {
  total: number
  assigned: Record<string, number>  // chain_id → count
}

export interface StrategyData {
  production_chains: ProductionChain[]
  workers: WorkerData
  resources: Record<string, number>
}

export interface StrategyBottleneck {
  type: 'worker_shortage' | 'resource_shortage'
  severity: 'low' | 'medium' | 'high'
  needed?: number
  available?: number
  resource?: string
  production?: number
  consumption?: number
  deficit?: number
}

export interface ProductionSummary {
  production_rates: Record<string, number>
  consumption_rates: Record<string, number>
  net_rates: Record<string, number>
  active_chains: number
  total_workers_used: number
}

export function createStrategyData(): StrategyData {
  return {
    production_chains: [],
    workers: { total: 10, assigned: {} },
    resources: {},
  }
}

// ==================== ŘETĚZCE ====================

export function addChain(state: StrategyData, chain: Omit<ProductionChain, 'id'> & { id?: string }): StrategyData {
  const id = chain.id ?? `chain_${Date.now()}`
  return {
    ...state,
    production_chains: [...state.production_chains, { ...chain, id } as ProductionChain],
  }
}

export function removeChain(state: StrategyData, chainId: string): StrategyData {
  const workers = { ...state.workers, assigned: { ...state.workers.assigned } }
  delete workers.assigned[chainId]
  return {
    ...state,
    production_chains: state.production_chains.filter((c) => c.id !== chainId),
    workers,
  }
}

export function getChain(state: StrategyData, chainId: string): ProductionChain | null {
  return state.production_chains.find((c) => c.id === chainId) ?? null
}

export function updateChain(state: StrategyData, chainId: string, updates: Partial<ProductionChain>): StrategyData {
  return {
    ...state,
    production_chains: state.production_chains.map((c) =>
      c.id === chainId ? { ...c, ...updates } : c,
    ),
  }
}

// ==================== PRACOVNÍCI ====================

export function getAvailableWorkers(workers: WorkerData): number {
  const used = Object.values(workers.assigned).reduce((s, n) => s + n, 0)
  return workers.total - used
}

export function assignWorkers(state: StrategyData, chainId: string, count: number): StrategyData {
  const available = getAvailableWorkers(state.workers)
  const current = state.workers.assigned[chainId] ?? 0
  const maxAssignable = available + current
  const clamped = Math.max(0, Math.min(count, maxAssignable))
  return {
    ...state,
    workers: {
      ...state.workers,
      assigned: { ...state.workers.assigned, [chainId]: clamped },
    },
  }
}

// ==================== DETEKCE BOTTLENECKŮ ====================

export function detectBottlenecks(state: StrategyData): StrategyBottleneck[] {
  const bottlenecks: StrategyBottleneck[] = []

  // Nedostatek pracovníků
  let totalNeeded = 0
  for (const chain of state.production_chains) {
    const assigned = state.workers.assigned[chain.id] ?? 0
    if (assigned > 0) totalNeeded += chain.workers_required
  }
  if (totalNeeded > state.workers.total) {
    bottlenecks.push({
      type: 'worker_shortage',
      severity: totalNeeded > state.workers.total * 1.5 ? 'high' : 'medium',
      needed: totalNeeded,
      available: state.workers.total,
    })
  }

  // Nedostatek zdrojů
  const production: Record<string, number> = {}
  const consumption: Record<string, number> = {}

  for (const chain of state.production_chains) {
    const assigned = state.workers.assigned[chain.id] ?? 0
    if (assigned <= 0) continue
    const efficiency = chain.workers_required > 0
      ? Math.min(assigned / chain.workers_required, 1)
      : 0
    const cyclesPerSec = chain.time > 0 ? efficiency / chain.time : 0

    for (const inp of chain.inputs) {
      consumption[inp.resource] = (consumption[inp.resource] ?? 0) + inp.amount * cyclesPerSec
    }
    for (const out of chain.outputs) {
      production[out.resource] = (production[out.resource] ?? 0) + out.amount * cyclesPerSec
    }
  }

  for (const [resource, cons] of Object.entries(consumption)) {
    const prod = production[resource] ?? 0
    if (cons > prod * 1.1) {
      const deficit = cons - prod
      const ratio = deficit / cons
      bottlenecks.push({
        type: 'resource_shortage',
        resource,
        production: prod,
        consumption: cons,
        deficit,
        severity: ratio > 0.5 ? 'high' : ratio > 0.2 ? 'medium' : 'low',
      })
    }
  }

  return bottlenecks
}

// ==================== ANALÝZA ====================

export function getProductionSummary(state: StrategyData): ProductionSummary {
  const prod: Record<string, number> = {}
  const cons: Record<string, number> = {}
  let activeChains = 0
  let totalWorkersUsed = 0

  for (const chain of state.production_chains) {
    const assigned = state.workers.assigned[chain.id] ?? 0
    if (assigned <= 0) continue
    activeChains++
    totalWorkersUsed += assigned
    const efficiency = chain.workers_required > 0
      ? Math.min(assigned / chain.workers_required, 1)
      : 0
    const cyclesPerSec = chain.time > 0 ? efficiency / chain.time : 0

    for (const inp of chain.inputs)  cons[inp.resource] = (cons[inp.resource] ?? 0) + inp.amount * cyclesPerSec
    for (const out of chain.outputs) prod[out.resource] = (prod[out.resource] ?? 0) + out.amount * cyclesPerSec
  }

  const allResources = new Set([...Object.keys(prod), ...Object.keys(cons)])
  const net: Record<string, number> = {}
  for (const r of allResources) net[r] = (prod[r] ?? 0) - (cons[r] ?? 0)

  return {
    production_rates: prod,
    consumption_rates: cons,
    net_rates: net,
    active_chains: activeChains,
    total_workers_used: totalWorkersUsed,
  }
}

// ==================== DEMO DATA ====================

export function loadDemoChains(): StrategyData {
  let state = createStrategyData()
  state = addChain(state, { id: 'logging',  name: 'Logging Camp',        inputs: [],                                                  outputs: [{ resource: 'wood',      amount: 2 }], time: 3, workers_required: 2 })
  state = addChain(state, { id: 'sawmill',  name: 'Sawmill',             inputs: [{ resource: 'wood', amount: 1 }],                   outputs: [{ resource: 'planks',    amount: 2 }], time: 4, workers_required: 1 })
  state = addChain(state, { id: 'workshop', name: 'Furniture Workshop',  inputs: [{ resource: 'planks', amount: 3 }],                 outputs: [{ resource: 'furniture', amount: 1 }], time: 8, workers_required: 2 })
  state = addChain(state, { id: 'mine',     name: 'Iron Mine',           inputs: [],                                                  outputs: [{ resource: 'iron_ore',  amount: 1 }], time: 5, workers_required: 3 })
  state = addChain(state, { id: 'smelter',  name: 'Smelter',             inputs: [{ resource: 'iron_ore', amount: 2 }, { resource: 'wood', amount: 1 }], outputs: [{ resource: 'iron_bar', amount: 1 }], time: 6, workers_required: 2 })

  state.workers.total = 10
  state.workers.assigned = { logging: 2, sawmill: 1, workshop: 0, mine: 3, smelter: 2 }
  return state
}
