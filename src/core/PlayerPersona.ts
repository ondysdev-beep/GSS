// PlayerPersona.ts — přímý port GDScript PlayerPersona.gd
// Deterministické profily chování hráče pro simulaci.

import type { RNGInstance } from './SimRNG'
import { createRNG } from './SimRNG'
import { initState, simulateTick } from './TickEngine'
import { validateScenarioTiming, resolveSeed, scenarioTickCount } from './ScenarioRunner'
import type { GSSGraph } from '../types/graph'
import { NodeType } from '../types/graph'
import type { Persona, PersonaStrategy } from '../types/simulation'

// Jediná definice typů persony žije v types/simulation.ts (dřív byla
// zduplikovaná zde s odlišnými komentáři k jednotkám).
export type { Persona, PersonaStrategy }

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
  validateScenarioTiming(scenario)
  const seed = resolveSeed(scenario.seed, graph.simulation_seed)
  // Simulace a rozhodování persony mají ODDĚLENÉ RNG proudy — dřív sdílely
  // jeden, takže každý hod persony posunul náhodu simulace a různé persony
  // tak neviděly stejnou ekonomiku (srovnání mezi nimi míchalo šum).
  const rng: RNGInstance = createRNG(seed)
  const personaRng: RNGInstance = createRNG((seed ^ 0x9e3779b9) >>> 0)

  let state = initState(graph)
  const personaState = initPersonaState(persona)
  const timeSeries: PersonaRunFrame[] = [{ time: 0, total_wealth: _totalWealth(state.pools) }]

  const ticks = scenarioTickCount(scenario.duration, scenario.dt)
  let lastSample = 0

  for (let totalTicks = 1; totalTicks <= ticks; totalTicks++) {
    state = simulateTick(state, graph, scenario.dt, rng)
    const elapsed = totalTicks * scenario.dt

    personaTick(persona, personaState, elapsed, state.pools, graph, personaRng)

    if (elapsed - lastSample >= scenario.sampling_interval - 1e-9 || totalTicks === ticks) {
      timeSeries.push({
        time: Math.round(elapsed * 1000) / 1000,
        total_wealth: _totalWealth(state.pools),
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

function _totalWealth(pools: Record<string, { amount: number }>): number {
  let wealth = 0
  for (const pool of Object.values(pools)) wealth += pool.amount
  return Math.round(wealth * 10000) / 10000
}

/** Spustí simulaci pro Casual/Grinder/Min-Maxer presety najednou. */
export function runAllPersonaSimulations(
  graph: GSSGraph,
  scenario: PersonaScenario,
): PersonaRunResult[] {
  return getAllPresets().map((persona) => runPersonaSimulation(graph, persona, scenario))
}

// ==================== STRATEGIE ====================
//
// Drain = "nákup", jeho `rate` = cena/intenzita útraty.
//   cheapest → nejlevnější dostupný nákup (nejnižší rate)
//   roi      → nejdražší/nejsilnější dostupný nákup (nejvyšší rate — proxy
//              pro největší dopad, GSS nemá explicitní model návratnosti)
//   priority → první dostupný drain z priority_list, jinak roi
//   random   → náhodný drain (seeded RNG persony)

function pickDrain(
  strategy: PersonaStrategy,
  drains: GSSGraph['nodes'],
  pools: Record<string, { amount: number }>,
  persona: Persona,
  graph: GSSGraph,
  rng: RNGInstance,
): GSSGraph['nodes'][0] | null {
  switch (strategy) {
    case 'cheapest': return strategyByRate(drains, pools, graph, 'lowest')
    case 'priority': return strategyPriority(drains, persona, graph, pools)
    case 'random': {
      if (drains.length === 0) return null
      const idx = rng.randiRange(0, drains.length - 1)
      return drains[idx]
    }
    default: return strategyByRate(drains, pools, graph, 'highest')
  }
}

function drainRate(drain: GSSGraph['nodes'][0]): number {
  const data = (drain.data ?? {}) as unknown as Record<string, unknown>
  return typeof data.rate === 'number' && Number.isFinite(data.rate) ? data.rate : 1.0
}

function strategyByRate(
  drains: GSSGraph['nodes'],
  pools: Record<string, { amount: number }>,
  graph: GSSGraph,
  pick: 'lowest' | 'highest',
): GSSGraph['nodes'][0] | null {
  let best: GSSGraph['nodes'][0] | null = null
  let bestRate = 0
  for (const drain of drains) {
    const srcPid = findDrainSourcePool(String(drain.id), graph, pools)
    if (!srcPid || pools[srcPid].amount <= 0) continue
    const rate = drainRate(drain)
    if (best === null || (pick === 'lowest' ? rate < bestRate : rate > bestRate)) {
      bestRate = rate
      best = drain
    }
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
  return strategyByRate(drains, pools, graph, 'highest')
}

// ==================== HELPER ====================

/** First pool feeding the drain — directly, or through Gate nodes in between. */
function findDrainSourcePool(
  drainId: string,
  graph: GSSGraph,
  pools: Record<string, { amount: number }>,
): string | null {
  const gateIds = new Set(graph.nodes.filter((n) => n.type === NodeType.GATE).map((n) => String(n.id)))
  const visited = new Set<string>([drainId])
  const queue = [drainId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const conn of graph.connections) {
      if (String(conn.to_node) !== current) continue
      const fromId = String(conn.from_node)
      if (pools[fromId] !== undefined) return fromId
      if (gateIds.has(fromId) && !visited.has(fromId)) {
        visited.add(fromId)
        queue.push(fromId)
      }
    }
  }
  return null
}
