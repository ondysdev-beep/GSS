// TickEngine.ts — Canonical simulation tick engine
// Pure functions — no side effects, no DOM references.
// Tick order (identical to GDScript original, extended with 3 new steps
// that are no-ops for graphs without these node types — fully backward
// compatible, no behavior change for existing graphs):
//   1. Timers        → exact-interval pulses into connected targets
//   2. Sources       → produce resources, distribute to connected targets
//   3. Converters    → consume inputs, produce outputs
//   4. Formula nodes → evaluate expression, produce computed amount
//   5. Player Actions→ stochastic player-triggered production
//   6. Drains        → consume from connected pools
//   7. Gates         → evaluate condition, update open/closed state
//   8. Chance nodes  → tracking only (routing happens inline in distribute)

import type { RNGInstance } from './SimRNG'
import { NodeType } from '../types/graph'
import type { GSSGraph, GSSConnection } from '../types/graph'
import type {
  SimState,
  PoolState,
  ChanceRollStats,
  ConverterBuffer,
  SplitterRuntime,
  TimerRuntime,
} from '../types/simulation'
import { evaluateFormula } from './FormulaEvaluator'

export const TICK_SPEC_VERSION = 1 as const

// Bezpečnostní pojistka proti degenerovaným kombinacím dt/interval u Timer
// uzlu (oprava B2) — viz komentář u Step 1 níže pro důvod.
const MAX_TIMER_PULSES_PER_TICK = 10_000

export function getTickSpecDescription(): Array<{ step: number; name: string; detail: string }> {
  return [
    {
      step: 1,
      name: 'Timers',
      detail:
        'Each Timer node accumulates elapsed time; when it reaches its configured interval, it fires an exact pulse of `amount` and resets (carrying over any remainder).',
    },
    {
      step: 2,
      name: 'Sources',
      detail:
        'Each Source node produces resources at its rate × dt and distributes to all connected targets (fan-out = duplicate to each connection).',
    },
    {
      step: 3,
      name: 'Converters',
      detail:
        'Each Converter consumes from its input buffer and connected input pools, then produces output at the configured ratio and distributes downstream.',
    },
    {
      step: 4,
      name: 'Formula nodes',
      detail:
        'Each Formula node evaluates its expression (variables: resource totals + `tick`) and distributes the result — clamped to ≥0 — as `output_resource`.',
    },
    {
      step: 5,
      name: 'Player Actions',
      detail:
        'Each Player Action node fires stochastically with per-tick probability dt/cadence (seeded RNG), simulating a player triggering it roughly every `cadence` seconds on average.',
    },
    {
      step: 6,
      name: 'Drains',
      detail:
        'Each Drain consumes resources from connected input pools at its rate × dt. Pools cannot go below zero.',
    },
    {
      step: 7,
      name: 'Gates',
      detail:
        'Each Gate evaluates its condition (operator + threshold) against the total of a named resource across all pools. State becomes open or closed.',
    },
    {
      step: 8,
      name: 'Chance Tracking',
      detail:
        'Chance nodes route flow probabilistically during distribution (inline). This step tracks cumulative success/failure counts.',
    },
  ]
}

export function getSemanticsNotes(): string[] {
  return [
    'Fan-out: By default, flow is DUPLICATED to every output connection. Use a Splitter node for proportional division (equal or weighted).',
    'Cycles: Graphs may contain cycles. Feedback loops are allowed but flagged as INFO by GraphValidator.',
    'Determinism: All randomness uses SimRNG (seeded). Identical seed + graph + scenario = identical results.',
    'Gate evaluation: Gates read pool totals AFTER drains have consumed, so gates reflect end-of-tick state.',
    'Splitter: Divides incoming flow across N outputs. Equal mode = flow/N. Weighted mode = proportional to comma-separated weights.',
    'Capacity: Pools have a max capacity. Overflow is silently discarded.',
  ]
}

// ==================== State initialization ====================

export function initState(graph: GSSGraph): SimState {
  const pools: Record<string, PoolState> = {}
  const gate_states: Record<string, boolean> = {}
  const converter_buffers: Record<string, ConverterBuffer> = {}
  const chance_rolls: Record<string, ChanceRollStats> = {}
  const splitter_data: Record<string, SplitterRuntime> = {}
  const timer_data: Record<string, TimerRuntime> = {}

  for (const node of graph.nodes) {
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>

    switch (node.type) {
      case NodeType.POOL:
        pools[nid] = {
          resource: (data.resource as string) ?? '',
          amount: (data.initial_amount as number) ?? 0,
          capacity: (data.capacity as number) ?? 100,
        }
        break
      case NodeType.CONVERTER:
        converter_buffers[nid] = { input_buffer: 0 }
        break
      case NodeType.GATE:
        gate_states[nid] = false
        break
      case NodeType.CHANCE:
        chance_rolls[nid] = {
          successes: 0,
          total: 0,
          success_chance: (data.success_chance as number) ?? 50,
        }
        break
      case NodeType.SPLITTER:
        splitter_data[nid] = {
          split_mode: ((data.split_mode as number) ?? 0) as 0 | 1,
          output_count: (data.output_count as number) ?? 2,
          weights: _parseWeights((data.weights as string) ?? '1,1'),
        }
        break
      case NodeType.TIMER:
        timer_data[nid] = { accumulated: 0 }
        break
    }
  }

  const state: SimState = { tick: 0, pools, gate_states, converter_buffers, chance_rolls, splitter_data, timer_data }

  // Pre-evaluate gates based on initial pool amounts so gates open at t=0 if condition is met
  for (const node of graph.nodes) {
    if (node.type !== NodeType.GATE) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const variable = (data.variable as string) ?? ''
    const operator = (data.operator as number) ?? 0
    const target = (data.value as number) ?? 0
    const current = _getTotalResource(variable, state.pools)
    state.gate_states[nid] = _evaluateCondition(current, operator, target)
  }

  return state
}

// ==================== Canonical tick (pure — returns new state) ====================

// `rng` is a required, explicit dependency (audit R-06): every call site
// must supply its own isolated createRNG(seed) instance. There is no
// fallback to a global/shared RNG — that was the source of the
// non-determinism bug this signature previously guarded against (DEVLOG
// fix 1.5). Passing the RNG explicitly also makes it impossible for two
// concurrent simulations (e.g. Monte Carlo runs) to influence each other.
export function simulateTick(state: SimState, graph: GSSGraph, delta = 1.0, rng: RNGInstance): SimState {
  // Deep-copy state so original is never mutated
  const s: SimState = {
    tick: state.tick + 1,
    pools: _deepCopyPools(state.pools),
    gate_states: { ...state.gate_states },
    converter_buffers: _deepCopyConverterBuffers(state.converter_buffers),
    chance_rolls: _deepCopyChanceRolls(state.chance_rolls),
    splitter_data: { ...state.splitter_data },
    timer_data: _deepCopyTimerData(state.timer_data),
  }

  const nodes = graph.nodes
  const conns = graph.connections

  // Step 1: Timers — exact-interval pulses
  for (const node of nodes) {
    if (node.type !== NodeType.TIMER) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const resource = (data.resource as string) ?? ''
    const amount = (data.amount as number) ?? 1.0
    const interval = Math.max((data.interval as number) ?? 60, 0.001)

    const timer = s.timer_data[nid]
    if (!timer) continue
    timer.accumulated += delta

    // Fire once per elapsed interval (handles delta > interval without loss).
    // Capped (oprava B2): `interval` má v UI minimum 0.001s a `dt` nemá
    // horní limit — bez pojistky by např. dt=100000 + interval=0.001
    // znamenalo 100 milionů iterací v jediném simulateTick() volání
    // (naměřeno ~1.6s zamrznutí UI na jeden tick, násobeno počtem běhů
    // v Monte Carlu). Tohle je degenerovaná konfigurace, ne reálný use
    // case — po dosažení stropu se přebytečný čas jen zahodí (accumulated
    // se srazí na 0), aby další tick pokračoval čistě, místo aby simulace
    // vůbec neskončila.
    let pulses = 0
    while (timer.accumulated >= interval && pulses < MAX_TIMER_PULSES_PER_TICK) {
      timer.accumulated -= interval
      _distributeToConnected(nid, resource, amount, conns, s, rng)
      pulses++
    }
    if (pulses >= MAX_TIMER_PULSES_PER_TICK) {
      timer.accumulated = 0
    }
  }

  // Step 2: Sources
  for (const node of nodes) {
    if (node.type !== NodeType.SOURCE) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const resource = (data.resource as string) ?? ''
    const rate = (data.rate as number) ?? 1.0
    const produced = rate * delta
    _distributeToConnected(nid, resource, produced, conns, s, rng)
  }

  // Step 3: Converters
  for (const node of nodes) {
    if (node.type !== NodeType.CONVERTER) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const inputResource = (data.input_resource as string) ?? ''
    const inputAmount = (data.input_amount as number) ?? 1.0
    const outputResource = (data.output_resource as string) ?? ''
    const outputAmount = (data.output_amount as number) ?? 1.0
    const cycleTime = (data.cycle_time as number) ?? 1.0

    const cycles = delta / cycleTime
    const needed = inputAmount * cycles
    let consumed = 0

    if (s.converter_buffers[nid]) {
      const buf = s.converter_buffers[nid]
      const fromBuf = Math.min(needed, buf.input_buffer)
      buf.input_buffer -= fromBuf
      consumed += fromBuf
    }

    if (consumed < needed) {
      consumed += _consumeFromConnected(nid, inputResource, needed - consumed, conns, s)
    }

    const actualCycles = inputAmount > 0 ? consumed / inputAmount : 0
    const produced = outputAmount * actualCycles

    if (produced > 0) {
      _distributeToConnected(nid, outputResource, produced, conns, s, rng)
    }
  }

  // Step 4: Formula nodes — compute value from a safe expression, produce it
  // Oprava B5: dřív se `_distinctResourceNames(nodes)` (a s ním `_getTotalResource`
  // pro každé jméno) přepočítávalo pro KAŽDÝ Formula uzel zvlášť, i když je
  // výsledek v rámci jednoho ticku vždy stejný — O(F×N) místo O(N) práce
  // navíc. Teď se počítá jednou, a jen pokud graf vůbec nějaký Formula uzel má.
  const formulaNodes = nodes.filter((n) => n.type === NodeType.FORMULA)
  if (formulaNodes.length > 0) {
    const resourceNames = _distinctResourceNames(nodes)
    const sharedVariables: Record<string, number> = { tick: s.tick }
    for (const resName of resourceNames) {
      sharedVariables[resName] = _getTotalResource(resName, s.pools)
    }

    for (const node of formulaNodes) {
      const nid = String(node.id)
      const data = node.data as unknown as Record<string, unknown>
      const expression = (data.expression as string) ?? '0'
      const outputResource = (data.output_resource as string) ?? ''

      let produced = 0
      try {
        produced = evaluateFormula(expression, sharedVariables) * delta
      } catch {
        // Neplatný výraz — GraphValidator na to upozorní; za běhu simulace
        // produkujeme 0 místo pádu celé simulace kvůli jednomu špatnému uzlu.
        produced = 0
      }
      produced = Math.max(0, produced)

      if (produced > 0) {
        _distributeToConnected(nid, outputResource, produced, conns, s, rng)
      }
    }
  }

  // Step 5: Player Actions — stochastic trigger, average cadence
  for (const node of nodes) {
    if (node.type !== NodeType.PLAYER_ACTION) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const resource = (data.resource as string) ?? ''
    const amount = (data.amount as number) ?? 1.0
    const cadence = Math.max((data.cadence as number) ?? 5.0, 0.001)

    const fireChance = Math.min(1, delta / cadence)
    if (rng.randf() < fireChance) {
      _distributeToConnected(nid, resource, amount, conns, s, rng)
    }
  }

  // Step 6: Drains
  for (const node of nodes) {
    if (node.type !== NodeType.DRAIN) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const resource = (data.resource as string) ?? ''
    const rate = (data.rate as number) ?? 1.0
    _consumeFromConnected(nid, resource, rate * delta, conns, s)
  }

  // Step 7: Gates
  for (const node of nodes) {
    if (node.type !== NodeType.GATE) continue
    const nid = String(node.id)
    const data = node.data as unknown as Record<string, unknown>
    const variable = (data.variable as string) ?? ''
    const operator = (data.operator as number) ?? 0
    const target = (data.value as number) ?? 0
    const current = _getTotalResource(variable, s.pools)
    s.gate_states[nid] = _evaluateCondition(current, operator, target)
  }

  // Step 8: Chance tracking — no-op (routing happens inline in distribute)

  return s
}

// ==================== Distribution (fan-out = duplicate) ====================

function _distributeToConnected(
  fromId: string,
  resource: string,
  amount: number,
  conns: GSSConnection[],
  s: SimState,
  rng: RNGInstance,
): void {
  for (const conn of conns) {
    if (String(conn.from_node) !== fromId) continue
    const toId = String(conn.to_node)

    if (s.gate_states[toId] === false) continue

    if (s.chance_rolls[toId] !== undefined) {
      _routeThroughChance(toId, resource, amount, conns, s, rng)
      continue
    }

    if (s.splitter_data[toId] !== undefined) {
      _routeThroughSplitter(toId, resource, amount, conns, s, rng)
      continue
    }

    if (s.converter_buffers[toId] !== undefined) {
      s.converter_buffers[toId].input_buffer += amount
      continue
    }

    if (s.pools[toId] !== undefined) {
      const pool = s.pools[toId]
      if (pool.resource === resource || pool.resource === '') {
        pool.resource = resource
        const space = pool.capacity - pool.amount
        pool.amount += Math.min(amount, space)
      }
    }
  }
}

// ==================== Chance routing ====================

function _routeThroughChance(
  chanceId: string,
  resource: string,
  amount: number,
  conns: GSSConnection[],
  s: SimState,
  rng: RNGInstance,
): void {
  const stats = s.chance_rolls[chanceId]
  const successPct = stats.success_chance
  const roll = rng.randf()
  const success = roll <= successPct / 100

  stats.total += 1
  if (success) stats.successes += 1

  const outputPort = success ? 0 : 1
  let distributed = false

  for (const conn of conns) {
    if (String(conn.from_node) !== chanceId) continue
    if (conn.from_port !== outputPort) continue
    const targetId = String(conn.to_node)
    if (s.pools[targetId] !== undefined) {
      const pool = s.pools[targetId]
      if (pool.resource === resource || pool.resource === '') {
        pool.resource = resource
        const space = pool.capacity - pool.amount
        pool.amount += Math.min(amount, space)
        distributed = true
      }
    }
  }

  // Fallback: try any connected pool on the SAME port — never cross to the opposite output
  if (!distributed) {
    for (const conn of conns) {
      if (String(conn.from_node) !== chanceId) continue
      if (conn.from_port !== outputPort) continue
      const targetId = String(conn.to_node)
      if (s.pools[targetId] !== undefined) {
        const pool = s.pools[targetId]
        if (pool.resource === resource || pool.resource === '') {
          pool.resource = resource
          const space = pool.capacity - pool.amount
          pool.amount += Math.min(amount, space)
          break
        }
      }
    }
  }
}

// ==================== Splitter routing ====================

function _routeThroughSplitter(
  splitterId: string,
  resource: string,
  amount: number,
  conns: GSSConnection[],
  s: SimState,
  rng: RNGInstance,
): void {
  const sdata = s.splitter_data[splitterId]
  const outConns = conns
    .filter((c) => String(c.from_node) === splitterId)
    .sort((a, b) => a.from_port - b.from_port)

  if (outConns.length === 0) return

  const numOutputs = outConns.length
  const shares: number[] = []

  if (sdata.split_mode === 0) {
    const share = amount / numOutputs
    for (let i = 0; i < numOutputs; i++) shares.push(share)
  } else {
    let totalWeight = 0
    for (let i = 0; i < numOutputs; i++) {
      const w = sdata.weights[i] ?? 1.0
      totalWeight += w
    }
    if (totalWeight <= 0) totalWeight = numOutputs
    for (let i = 0; i < numOutputs; i++) {
      const w = sdata.weights[i] ?? 1.0
      shares.push(amount * (w / totalWeight))
    }
  }

  for (let i = 0; i < numOutputs; i++) {
    const conn = outConns[i]
    const targetId = String(conn.to_node)
    const share = shares[i]

    if (s.gate_states[targetId] === false) continue

    if (s.chance_rolls[targetId] !== undefined) {
      _routeThroughChance(targetId, resource, share, conns, s, rng)
      continue
    }
    if (s.splitter_data[targetId] !== undefined) {
      _routeThroughSplitter(targetId, resource, share, conns, s, rng)
      continue
    }
    if (s.converter_buffers[targetId] !== undefined) {
      s.converter_buffers[targetId].input_buffer += share
      continue
    }
    if (s.pools[targetId] !== undefined) {
      const pool = s.pools[targetId]
      if (pool.resource === resource || pool.resource === '') {
        pool.resource = resource
        const space = pool.capacity - pool.amount
        pool.amount += Math.min(share, space)
      }
    }
  }
}

// ==================== Consumption ====================

function _consumeFromConnected(
  toId: string,
  resource: string,
  amount: number,
  conns: GSSConnection[],
  s: SimState,
): number {
  let consumed = 0
  for (const conn of conns) {
    if (String(conn.to_node) !== toId) continue
    const fromId = String(conn.from_node)
    if (s.gate_states[fromId] === false) continue
    if (s.pools[fromId] !== undefined) {
      const pool = s.pools[fromId]
      if (pool.resource === resource) {
        const take = Math.min(amount - consumed, pool.amount)
        pool.amount -= take
        consumed += take
        if (consumed >= amount) break
      }
    }
  }
  return consumed
}

// ==================== Helpers ====================

function _getTotalResource(resource: string, pools: Record<string, PoolState>): number {
  let total = 0
  for (const pid in pools) {
    if (pools[pid].resource === resource) total += pools[pid].amount
  }
  return total
}

function _evaluateCondition(current: number, operator: number, target: number): boolean {
  switch (operator) {
    case 0: return current > target
    case 1: return current >= target
    case 2: return current < target
    case 3: return current <= target
    case 4: return Math.abs(current - target) < 0.001
    case 5: return Math.abs(current - target) >= 0.001
    default: return false
  }
}

function _parseWeights(weightsStr: string): number[] {
  const weights = weightsStr.split(',').map((w) => {
    const val = parseFloat(w.trim())
    return isFinite(val) && val > 0 ? val : 1.0
  })
  return weights.length > 0 ? weights : [1.0]
}

// ==================== Deep copy helpers ====================

function _deepCopyPools(pools: Record<string, PoolState>): Record<string, PoolState> {
  const out: Record<string, PoolState> = {}
  for (const k in pools) out[k] = { ...pools[k] }
  return out
}

function _deepCopyConverterBuffers(
  bufs: Record<string, ConverterBuffer>,
): Record<string, ConverterBuffer> {
  const out: Record<string, ConverterBuffer> = {}
  for (const k in bufs) out[k] = { ...bufs[k] }
  return out
}

function _deepCopyChanceRolls(
  rolls: Record<string, ChanceRollStats>,
): Record<string, ChanceRollStats> {
  const out: Record<string, ChanceRollStats> = {}
  for (const k in rolls) out[k] = { ...rolls[k] }
  return out
}

function _deepCopyTimerData(
  timers: Record<string, TimerRuntime>,
): Record<string, TimerRuntime> {
  const out: Record<string, TimerRuntime> = {}
  for (const k in timers) out[k] = { ...timers[k] }
  return out
}

/** Distinct resource names referenced by POOL/SOURCE/DRAIN nodes — used as
 * the variable set available to Formula expressions (mirrors Gate's
 * existing `variable` → resource-total lookup). */
function _distinctResourceNames(nodes: GSSGraph['nodes']): string[] {
  const names = new Set<string>()
  for (const node of nodes) {
    const data = node.data as unknown as Record<string, unknown>
    const resource = data.resource as string | undefined
    if (resource) names.add(resource)
  }
  return [...names]
}
