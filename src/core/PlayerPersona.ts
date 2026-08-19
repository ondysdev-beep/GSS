// PlayerPersona.ts — přímý port GDScript PlayerPersona.gd
// Deterministické profily chování hráče pro simulaci.

import type { RNGInstance } from './SimRNG'
import { createRNG } from './SimRNG'
import { initState, simulateTick } from './TickEngine'
import type { GSSGraph } from '../types/graph'
import { NodeType } from '../types/graph'

export type PersonaStrategy = 'roi' | 'cheapest' | 'priority' | 'random'

export interface Persona {
  name: string
  cadence: number          // sekundy mezi rozhodnutími
  strategy: PersonaStrategy
  budget_pct: number       // max % poolu k utrácení (0–1)
  reserve_min: number      // nikdy neutrat pod tuto částku
  priority_list: string[]  // seřazené ID uzlů pro strategii priority
  aggression: number       // 0.0 (pasivní) – 1.0 (agresivní)
}

export interface PersonaPurchase {
  time: number
  action: 'spend'
  pool_id: string
  drain_id: string
  amount: number
}

export interface PersonaState {
  next_decision_time: number
  total_spent: number
  purchases: PersonaPurchase[]
  milestones: Record<string, number>  // pool_id → první čas dosažení prahu
}

// ==================== PRESETS ====================

export function defaultPersona(): Persona {
  return {
    name: 'Default',
    cadence: 5.0,
    strategy: 'roi',
    budget_pct: 0.5,
    reserve_min: 0.0,
    priority_list: [],
    aggression: 0.5,
  }
}

export function presetCasual(): Persona {
  return { name: 'Casual', cadence: 10.0, strategy: 'cheapest', budget_pct: 0.2, reserve_min: 20.0, priority_list: [], aggression: 0.2 }
}

export function presetGrinder(): Persona {
  return { name: 'Grinder', cadence: 3.0, strategy: 'roi', budget_pct: 0.6, reserve_min: 5.0, priority_list: [], aggression: 0.7 }
}

export function presetMinMaxer(): Persona {
  return { name: 'Min-Maxer', cadence: 2.0, strategy: 'priority', budget_pct: 0.9, reserve_min: 0.0, priority_list: [], aggression: 1.0 }
}

export function getAllPresets(): Persona[] {
  return [presetCasual(), presetGrinder(), presetMinMaxer()]
}

export function findPreset(name: string): Persona | null {
  return getAllPresets().find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null
}

// ==================== STAV PERSONY ====================

export function initPersonaState(persona: Persona): PersonaState {
  return {
    next_decision_time: persona.cadence,
    total_spent: 0.0,
    purchases: [],
    milestones: {},
  }
}

// ==================== TICK ====================

/**
 * Zavolat každý tick. Pokud je čas na rozhodnutí, upraví pools in-place a
 * zaznamená akci. Vrací true pokud byla provedena akce.
 */
export function personaTick(
  persona: Persona,
  state: PersonaState,
  elapsed: number,
  pools: Record<string, { amount: number }>,
  graph: GSSGraph,
  rng: RNGInstance,
): boolean {
  if (elapsed < state.next_decision_time) return false
  state.next_decision_time += persona.cadence

  // Najdi drains (co může hráč "utrácet na")
  const drains = graph.nodes.filter((n) => n.type === NodeType.DRAIN)
  if (drains.length === 0) return false

  // Vyber cílový drain dle strategie
  const targetDrain = pickDrain(persona.strategy, drains, pools, persona, graph, rng)
  if (!targetDrain) return false

  const drainId = String(targetDrain.id)
  const sourcePoolId = findDrainSourcePool(drainId, graph, pools)
  if (!sourcePoolId) return false

  const pool = pools[sourcePoolId]
  const available = Math.max(0, pool.amount - persona.reserve_min)
  let spend = available * persona.budget_pct * persona.aggression

  // Deterministický šum
  const noise = rng.randfRange(0.8, 1.2)
  spend = Math.min(spend * noise, available)

  if (spend < 0.01) return false

  pool.amount -= spend

  state.purchases.push({
    time: Math.round(elapsed * 1000) / 1000,
    action: 'spend',
    pool_id: sourcePoolId,
    drain_id: drainId,
    amount: Math.round(spend * 10000) / 10000,
  })
  state.total_spent += spend

  return true
}

/** Zkontroluj a zaznamenej milníky (pool prahy). */
export function checkMilestones(
  state: PersonaState,
  elapsed: number,
  pools: Record<string, { amount: number }>,
  thresholds: Record<string, number>,
): void {
  for (const pid of Object.keys(thresholds)) {
    if (state.milestones[pid] !== undefined) continue
    if (pools[pid] && pools[pid].amount >= thresholds[pid]) {
      state.milestones[pid] = Math.round(elapsed * 1000) / 1000
    }
  }
}

// ==================== PERSONA SIMULATION RUNNER ====================
//
// Multi-Persona Dashboard (nová funkce): spouští graf přes TickEngine
// stejně jako ScenarioRunner.runScenario, ale navíc na každém ticku volá
// personaTick() — persona tak aktivně "utrácí" z poolů podle své strategie
// nad rámec automatických DRAIN uzlů, což dává realističtější obrázek
// chování konkrétního typu hráče v čase.
//
// Záměrně NEnahrazuje `_adjustDrainRates` heuristiku v
// `ScenarioRunner.buildSimulationContext` (používanou pro `fairness` metriku
// v HealthScoreCalculator) — jde o jinou potřebu (rychlá proxy metrika pro
// health score vs. plnohodnotná vizualizace chování v čase) a její záměna
// by tiše změnila Health Score u všech existujících grafů.

export interface PersonaRunFrame {
  time: number
  total_wealth: number
}

export interface PersonaRunResult {
  persona: Persona
  time_series: PersonaRunFrame[]
  total_spent: number
  purchase_count: number
}

export interface PersonaScenario {
  duration: number
  dt: number
  sampling_interval: number
  seed?: number
}

export function runPersonaSimulation(
  graph: GSSGraph,
  persona: Persona,
  scenario: PersonaScenario,
): PersonaRunResult {
  const seed = scenario.seed ?? graph.simulation_seed ?? 42
  const rng: RNGInstance = createRNG(seed)

  let state = initState(graph)
  const personaState = initPersonaState(persona)
  const timeSeries: PersonaRunFrame[] = []

  let lastSample = -scenario.sampling_interval
  let totalTicks = 0

  while (totalTicks * scenario.dt < scenario.duration) {
    state = simulateTick(state, graph, scenario.dt, rng)
    totalTicks++
    const elapsed = totalTicks * scenario.dt

    personaTick(persona, personaState, elapsed, state.pools, graph, rng)

    if (elapsed - lastSample >= scenario.sampling_interval || elapsed >= scenario.duration) {
      let wealth = 0
      for (const pool of Object.values(state.pools)) wealth += pool.amount
      timeSeries.push({
        time: Math.round(elapsed * 1000) / 1000,
        total_wealth: Math.round(wealth * 10000) / 10000,
      })
      lastSample = elapsed
    }
  }

  return {
    persona,
    time_series: timeSeries,
    total_spent: Math.round(personaState.total_spent * 10000) / 10000,
    purchase_count: personaState.purchases.length,
  }
}

/** Spustí simulaci pro Casual/Grinder/Min-Maxer presety najednou. */
export function runAllPersonaSimulations(
  graph: GSSGraph,
  scenario: PersonaScenario,
): PersonaRunResult[] {
  return getAllPresets().map((persona) => runPersonaSimulation(graph, persona, scenario))
}

// ==================== STRATEGIE ====================

function pickDrain(
  strategy: PersonaStrategy,
  drains: GSSGraph['nodes'],
  pools: Record<string, { amount: number }>,
  persona: Persona,
  graph: GSSGraph,
  rng: RNGInstance,
): GSSGraph['nodes'][0] | null {
  switch (strategy) {
    case 'cheapest': return strategyCheapest(drains, pools, graph)
    case 'priority': return strategyPriority(drains, persona, graph, pools)
    case 'random': {
      if (drains.length === 0) return null
      const idx = rng.randiRange(0, drains.length - 1)
      return drains[idx]
    }
    default: return strategyROI(drains, pools, graph)
  }
}

function strategyCheapest(
  drains: GSSGraph['nodes'],
  pools: Record<string, { amount: number }>,
  graph: GSSGraph,
): GSSGraph['nodes'][0] | null {
  let best: GSSGraph['nodes'][0] | null = null
  let bestAmount = -1
  for (const drain of drains) {
    const srcPid = findDrainSourcePool(String(drain.id), graph, pools)
    if (!srcPid) continue
    const amt = pools[srcPid].amount
    if (amt > bestAmount) { bestAmount = amt; best = drain }
  }
  return best
}

function strategyROI(
  drains: GSSGraph['nodes'],
  pools: Record<string, { amount: number }>,
  graph: GSSGraph,
): GSSGraph['nodes'][0] | null {
  let best: GSSGraph['nodes'][0] | null = null
  let bestRate = -1
  for (const drain of drains) {
    const data = drain.data as unknown as Record<string, unknown>
    const rate = typeof data.rate === 'number' ? data.rate : 1.0
    const srcPid = findDrainSourcePool(String(drain.id), graph, pools)
    if (!srcPid) continue
    if (pools[srcPid].amount > 0 && rate > bestRate) { bestRate = rate; best = drain }
  }
  return best
}

function strategyPriority(
  drains: GSSGraph['nodes'],
  persona: Persona,
  graph: GSSGraph,
  pools: Record<string, { amount: number }>,
): GSSGraph['nodes'][0] | null {
  for (const targetId of persona.priority_list) {
    for (const drain of drains) {
      if (String(drain.id) === targetId) {
        const srcPid = findDrainSourcePool(String(drain.id), graph, pools)
        if (srcPid && pools[srcPid].amount > 0) return drain
      }
    }
  }
  return strategyROI(drains, pools, graph)
}

// ==================== HELPER ====================

function findDrainSourcePool(
  drainId: string,
  graph: GSSGraph,
  pools: Record<string, { amount: number }>,
): string | null {
  for (const conn of graph.connections) {
    if (String(conn.to_node) === drainId) {
      const fromId = String(conn.from_node)
      if (pools[fromId] !== undefined) return fromId
    }
  }
  return null
}
