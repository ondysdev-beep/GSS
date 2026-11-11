// TickEngine.ts — Canonical simulation tick engine
// Pure functions — no side effects, no DOM references.
// Tick order (identical to GDScript original, extended with 3 new steps
// that are no-ops for graphs without these node types):
//   1. Timers        → exact-interval pulses into connected targets
//   2. Sources       → produce resources, distribute to connected targets
//   3. Converters    → consume inputs, produce outputs
//   4. Formula nodes → evaluate expression, produce computed amount
//   5. Player Actions→ stochastic player-triggered production
//   6. Drains        → consume from connected pools
//   7. Gates         → evaluate condition, update open/closed state
//   8. Chance nodes  → tracking only (routing happens inline in distribute)
//
// Tick spec v2 (vs. v1): Gates relay flow (v1 silently dropped anything sent
// into a Gate, so Gates had no effect at all), consumers can pull from pools
// through an open Gate, Chance nodes can route into any node type (not only
// pools), routing loops are cut after MAX_ROUTE_DEPTH hops instead of
// overflowing the stack, pools never lose resources on inflow when they are
// over capacity, and converter input buffers only accept the configured input
// resource and hold at most one tick's worth of input.

import type { RNGInstance } from './SimRNG'
import { NodeType } from '../types/graph'
import type { GSSGraph, GSSConnection, GSSNode } from '../types/graph'
import type {
  SimState,
  PoolState,
  ChanceRollStats,
  ConverterBuffer,
  SplitterRuntime,
  TimerRuntime,
} from '../types/simulation'
import { evaluateFormula } from './FormulaEvaluator'

export const TICK_SPEC_VERSION = 2 as const

// Bezpečnostní pojistka proti degenerovaným kombinacím dt/interval u Timer
// a Player Action uzlů (oprava B2) — viz komentář u Step 1 níže.
const MAX_TIMER_PULSES_PER_TICK = 10_000

// Pojistka proti nekonečné rekurzi ve smyčkách mezi routovacími uzly
// (Gate → Gate, Splitter → Splitter, Chance → Chance …). Tok, který by šel
// hlouběji, se zahodí — validátor takové smyčky hlásí jako WARNING.
export const MAX_ROUTE_DEPTH = 64

// Hloubka sama nestačí: smyčka, ve které se tok větví (Splitter se dvěma
// výstupy, z nichž oba vedou zpět, Gate s duplicitním spojem…), by do hloubky
// 64 prošla až 2^64 cest a simulace by zamrzla. Proto má každé jedno vstoupení
// toku do grafu (a každé jedno odebírání) navíc strop na celkový počet skoků.
// Běžné grafy se k němu ani nepřiblíží; tok nad stropem se zahodí stejně jako
// tok nad MAX_ROUTE_DEPTH.
export const MAX_ROUTE_HOPS = 2048

// Upgrade uzel: pojistka proti nekonečnému nakupování (cena roste pomalu nebo
// klesá) a strop násobitele, aby složený bonus nepřetekl do Infinity/NaN.
const MAX_UPGRADE_PURCHASES_PER_TICK = 1000
const MAX_UPGRADE_MULTIPLIER = 1e15

/** Price of the next level of an Upgrade node that is currently at `level`. */
export function upgradeCost(baseCost: number, growth: number, level: number): number {
  return baseCost * Math.pow(growth, level)
}

/** Production/capacity multiplier of an Upgrade node at `level` (bonus in %, mode 0 = additive, 1 = compound). */
export function upgradeMultiplier(bonusPct: number, mode: number, level: number): number {
  if (!(level > 0)) return 1
  const m = mode === 1 ? Math.pow(1 + bonusPct / 100, level) : 1 + (bonusPct / 100) * level
  if (Number.isNaN(m)) return 1
  return Math.min(Math.max(0, m), MAX_UPGRADE_MULTIPLIER)
}

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
        'Each Converter consumes from its input buffer and connected input pools (also through open Gates), then produces output at the configured ratio and distributes downstream.',
    },
    {
      step: 4,
      name: 'Formula nodes',
      detail:
        'Each Formula node evaluates its expression (variables: resource totals + `tick`) as a per-second rate, multiplies it by dt and distributes the result — clamped to ≥0 — as `output_resource`.',
    },
    {
      step: 5,
      name: 'Player Actions',
      detail:
        'Each Player Action node fires on average dt/cadence times per tick (whole part guaranteed, remainder as a seeded-RNG probability), simulating a player triggering it roughly every `cadence` seconds.',
    },
    {
      step: 6,
      name: 'Drains',
      detail:
        'Each Drain consumes resources from connected input pools (also through open Gates) at its rate × dt. Pools cannot go below zero.',
    },
    {
      step: 7,
      name: 'Upgrades',
      detail:
        'Each Upgrade node buys as many levels as it can afford from the pools connected into it (level n+1 costs base_cost × cost_growth^n). The bonus of the new levels applies from the next tick: it multiplies the production of the nodes the Upgrade is connected to (or the capacity of connected pools).',
    },
    {
      step: 8,
      name: 'Gates',
      detail:
        'Each Gate evaluates its condition (operator + threshold) against the total of a named resource across all pools. State becomes open or closed.',
    },
    {
      step: 9,
      name: 'Chance Tracking',
      detail:
        'Chance nodes route flow probabilistically during distribution (inline). This step tracks cumulative success/failure counts.',
    },
  ]
}

export function getSemanticsNotes(): string[] {
  return [
    'Fan-out: By default, flow is DUPLICATED to every output connection. Use a Splitter node for proportional division (equal or weighted).',
    'Gates: an open Gate relays any flow sent into it to all of its outputs; a closed Gate blocks it. Drains and Converters can also pull from pools through an open Gate.',
    'Gate variable: the Gate compares the TOTAL of a resource (by resource name, summed over all pools), not a single pool.',
    'Chance: a successful roll routes the flow to output port 0, a failed roll to output port 1.',
    'Cycles: Graphs may contain cycles. Feedback loops are allowed but flagged by GraphValidator; loops made only of routing nodes (Gate/Splitter/Chance) are cut after 64 hops.',
    'Determinism: All randomness uses SimRNG (seeded). Identical seed + graph + scenario = identical results.',
    'Gate evaluation: Gates read pool totals AFTER drains have consumed, so gates reflect end-of-tick state.',
    'Splitter: Divides incoming flow across its connected outputs (ordered by output port). Equal mode = flow/N. Weighted mode = proportional to comma-separated weights.',
    'Converter: only accepts its configured input resource, and its input buffer holds at most one tick (or one cycle) of input — any surplus pushed into it is discarded.',
    'Capacity: Pools have a max capacity. Overflow is silently discarded.',
    'Upgrades: connections from an Upgrade carry no resources — they only apply its bonus. Several Upgrades on one node multiply. Upgrades are bought in node order, so an earlier Upgrade has priority over a shared currency.',
  ]
}

// ==================== Defensive data access ====================

type DataRecord = Record<string, unknown>

/** Node data as a plain record — never undefined, even for malformed/imported nodes. */
function nodeData(node: GSSNode): DataRecord {
  const data = node.data as unknown
  return data && typeof data === 'object' ? (data as DataRecord) : {}
}

/** A finite number, or the fallback (also for strings/NaN/undefined from untrusted JSON). */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function portOf(conn: GSSConnection): number {
  const p = Number(conn.from_port)
  return Number.isFinite(p) ? p : 0
}

// ==================== State initialization ====================

export function initState(graph: GSSGraph): SimState {
  const pools: Record<string, PoolState> = {}
  const gate_states: Record<string, boolean> = {}
  const converter_buffers: Record<string, ConverterBuffer> = {}
  const chance_rolls: Record<string, ChanceRollStats> = {}
  const splitter_data: Record<string, SplitterRuntime> = {}
  const timer_data: Record<string, TimerRuntime> = {}
  const upgrade_levels: Record<string, number> = {}

  for (const node of graph.nodes) {
    const nid = String(node.id)
    const data = nodeData(node)

    switch (node.type) {
      case NodeType.POOL: {
        const capacity = num(data.capacity, 100)
        pools[nid] = {
          resource: str(data.resource),
          // Pool nikdy nezačíná nad kapacitou ani pod nulou.
          amount: Math.min(Math.max(0, num(data.initial_amount, 0)), Math.max(0, capacity)),
          capacity,
        }
        break
      }
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
          success_chance: num(data.success_chance, 50),
        }
        break
      case NodeType.SPLITTER:
        splitter_data[nid] = {
          split_mode: num(data.split_mode, 0) === 1 ? 1 : 0,
          output_count: num(data.output_count, 2),
          weights: _parseWeights(str(data.weights, '1,1')),
        }
        break
      case NodeType.TIMER:
        timer_data[nid] = { accumulated: 0 }
        break
      case NodeType.UPGRADE:
        upgrade_levels[nid] = 0
        break
    }
  }

  const state: SimState = { tick: 0, pools, gate_states, converter_buffers, chance_rolls, splitter_data, timer_data, upgrade_levels }

  // Pre-evaluate gates based on initial pool amounts so gates open at t=0 if condition is met
  evaluateGates(state, graph)

  return state
}

/** Re-evaluates every Gate's open/closed state against the current pool totals (mutates `state`). */
export function evaluateGates(state: SimState, graph: GSSGraph): void {
  for (const node of graph.nodes) {
    if (node.type !== NodeType.GATE) continue
    const data = nodeData(node)
    const current = _getTotalResource(str(data.variable), state.pools)
    state.gate_states[String(node.id)] = _evaluateCondition(current, num(data.operator, 0), num(data.value, 0))
  }
}

/**
 * Applies scenario `initial_overrides` (pool_id → starting amount) to a
 * freshly initialized state: amounts are clamped to [0, capacity] and gates
 * are re-evaluated so that tick 1 already sees the overridden totals.
 */
export function applyInitialOverrides(
  state: SimState,
  graph: GSSGraph,
  overrides: Record<string, number> | undefined,
): void {
  if (!overrides) return
  let changed = false
  for (const [poolId, amount] of Object.entries(overrides)) {
    const pool = state.pools[poolId]
    if (!pool || typeof amount !== 'number' || !Number.isFinite(amount)) continue
    pool.amount = Math.min(Math.max(0, amount), Math.max(0, pool.capacity))
    changed = true
  }
  if (changed) evaluateGates(state, graph)
}

// ==================== Canonical tick (pure — returns new state) ====================

interface TickContext {
  s: SimState
  rng: RNGInstance
  delta: number
  outgoing: Map<string, GSSConnection[]>
  incoming: Map<string, GSSConnection[]>
  nodeById: Map<string, GSSNode>
  /** Skoky spotřebované aktuálním doručením/odebíráním (viz MAX_ROUTE_HOPS). */
  hops: number
  /** Node ID → multiplier from the Upgrade nodes connected to it (missing = 1). */
  boost: Map<string, number>
}

function _buildContext(s: SimState, graph: GSSGraph, delta: number, rng: RNGInstance): TickContext {
  const outgoing = new Map<string, GSSConnection[]>()
  const incoming = new Map<string, GSSConnection[]>()
  for (const conn of graph.connections) {
    const from = String(conn.from_node)
    const to = String(conn.to_node)
    let out = outgoing.get(from)
    if (!out) outgoing.set(from, (out = []))
    out.push(conn)
    let inc = incoming.get(to)
    if (!inc) incoming.set(to, (inc = []))
    inc.push(conn)
  }
  const nodeById = new Map<string, GSSNode>()
  for (const node of graph.nodes) nodeById.set(String(node.id), node)

  // Bonusy z úrovní koupených v předchozích tickách.
  const boost = upgradeBoosts(graph, s.upgrade_levels)
  return { s, rng, delta, outgoing, incoming, nodeById, hops: 0, boost }
}

/**
 * Node ID → combined multiplier from the Upgrade nodes connected to it, for
 * the given upgrade levels (e.g. `summary.upgrade_levels` or a frame's
 * `upgrades`). Nodes without a boost are missing from the map.
 */
export function upgradeBoosts(
  graph: Pick<GSSGraph, 'nodes' | 'connections'>,
  levels: Record<string, number> | undefined,
): Map<string, number> {
  const boost = new Map<string, number>()
  if (!levels) return boost
  const multipliers = new Map<string, number>()
  for (const node of graph.nodes) {
    if (node.type !== NodeType.UPGRADE) continue
    const nid = String(node.id)
    const data = nodeData(node)
    const m = upgradeMultiplier(num(data.bonus_per_level, 10), num(data.bonus_mode, 0), levels[nid] ?? 0)
    if (m !== 1) multipliers.set(nid, m)
  }
  if (multipliers.size === 0) return boost
  for (const conn of graph.connections) {
    const m = multipliers.get(String(conn.from_node))
    if (m === undefined) continue
    const to = String(conn.to_node)
    boost.set(to, Math.min((boost.get(to) ?? 1) * m, MAX_UPGRADE_MULTIPLIER))
  }
  return boost
}

function _boostOf(id: string, ctx: TickContext): number {
  return ctx.boost.get(id) ?? 1
}

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
    upgrade_levels: { ...state.upgrade_levels },
  }

  const nodes = graph.nodes
  const ctx = _buildContext(s, graph, delta, rng)

  // Upgrade napojený na Pool zvětšuje jeho kapacitu (základ = kapacita z dat uzlu).
  for (const [targetId, m] of ctx.boost) {
    const pool = s.pools[targetId]
    const node = ctx.nodeById.get(targetId)
    if (pool && node) pool.capacity = num(nodeData(node).capacity, 100) * m
  }

  // Step 1: Timers — exact-interval pulses
  for (const node of nodes) {
    if (node.type !== NodeType.TIMER) continue
    const nid = String(node.id)
    const data = nodeData(node)
    const resource = str(data.resource)
    const amount = num(data.amount, 1.0) * _boostOf(nid, ctx)
    const interval = Math.max(num(data.interval, 60), 0.001)

    const timer = s.timer_data[nid]
    if (!timer) continue
    timer.accumulated += delta

    // Fire once per elapsed interval (handles delta > interval without loss).
    // Capped (oprava B2): `interval` má v UI minimum 0.001s a `dt` nemá
    // horní limit — bez pojistky by např. dt=100000 + interval=0.001
    // znamenalo 100 milionů iterací v jediném simulateTick() volání.
    // Po dosažení stropu se přebytečný čas zahodí (accumulated se srazí
    // na 0), aby další tick pokračoval čistě.
    let pulses = 0
    while (timer.accumulated >= interval && pulses < MAX_TIMER_PULSES_PER_TICK) {
      timer.accumulated -= interval
      _distributeToConnected(nid, resource, amount, ctx)
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
    const data = nodeData(node)
    _distributeToConnected(nid, str(data.resource), num(data.rate, 1.0) * delta * _boostOf(nid, ctx), ctx)
  }

  // Step 3: Converters
  for (const node of nodes) {
    if (node.type !== NodeType.CONVERTER) continue
    const nid = String(node.id)
    const data = nodeData(node)
    const inputResource = str(data.input_resource)
    const inputAmount = num(data.input_amount, 1.0)
    const outputResource = str(data.output_resource)
    const outputAmount = num(data.output_amount, 1.0)
    const cycleTime = num(data.cycle_time, 1.0)

    // Nekladný cyklus/vstup = neplatná konfigurace (validátor ji hlásí) —
    // dřív vedla k Infinity/zápornému `needed` a k růstu bufferu.
    if (cycleTime <= 0 || inputAmount <= 0) continue

    const needed = inputAmount * (delta / cycleTime)
    let consumed = 0

    const buf = s.converter_buffers[nid]
    if (buf) {
      const fromBuf = Math.min(needed, buf.input_buffer)
      buf.input_buffer -= fromBuf
      consumed += fromBuf
    }

    if (consumed < needed) {
      consumed += _consumeFromConnected(nid, inputResource, needed - consumed, ctx, 0)
    }

    const produced = outputAmount * (consumed / inputAmount) * _boostOf(nid, ctx)
    if (produced > 0) {
      _distributeToConnected(nid, outputResource, produced, ctx)
    }
  }

  // Step 4: Formula nodes — compute value from a safe expression, produce it
  // Oprava B5: proměnné se počítají jednou za tick, ne pro každý Formula uzel.
  const formulaNodes = nodes.filter((n) => n.type === NodeType.FORMULA)
  if (formulaNodes.length > 0) {
    const sharedVariables: Record<string, number> = {}
    for (const resName of _distinctResourceNames(nodes)) {
      sharedVariables[resName] = _getTotalResource(resName, s.pools)
    }
    // `tick` má přednost před případným resource stejného jména.
    sharedVariables.tick = s.tick

    for (const node of formulaNodes) {
      const data = nodeData(node)
      let produced = 0
      try {
        produced = evaluateFormula(str(data.expression, '0'), sharedVariables) * delta * _boostOf(String(node.id), ctx)
      } catch {
        // Neplatný výraz — GraphValidator na to upozorní; za běhu simulace
        // produkujeme 0 místo pádu celé simulace kvůli jednomu špatnému uzlu.
        produced = 0
      }
      if (produced > 0) {
        _distributeToConnected(String(node.id), str(data.output_resource), produced, ctx)
      }
    }
  }

  // Step 5: Player Actions — stochastic trigger, average cadence
  for (const node of nodes) {
    if (node.type !== NodeType.PLAYER_ACTION) continue
    const nid = String(node.id)
    const data = nodeData(node)
    const resource = str(data.resource)
    const amount = num(data.amount, 1.0) * _boostOf(nid, ctx)
    const cadence = Math.max(num(data.cadence, 5.0), 0.001)

    // Očekávaný počet spuštění za tick = dt / cadence. Celá část je jistá,
    // zbytek je pravděpodobnost — při dt > cadence se tak už neztrácí akce
    // (dřív max. 1 spuštění za tick). Pro dt ≤ cadence je chování i spotřeba
    // RNG beze změny (jeden hod s pravděpodobností dt/cadence).
    const expected = delta / cadence
    const guaranteed = Math.floor(expected)
    let fires = guaranteed + (rng.randf() < expected - guaranteed ? 1 : 0)
    fires = Math.min(fires, MAX_TIMER_PULSES_PER_TICK)
    for (let i = 0; i < fires; i++) {
      _distributeToConnected(nid, resource, amount, ctx)
    }
  }

  // Step 6: Drains
  for (const node of nodes) {
    if (node.type !== NodeType.DRAIN) continue
    const data = nodeData(node)
    _consumeFromConnected(String(node.id), str(data.resource), num(data.rate, 1.0) * delta, ctx, 0)
  }

  // Step 7: Upgrades — buy every level that is affordable now (bonus from the next tick)
  for (const node of nodes) {
    if (node.type !== NodeType.UPGRADE || !s.upgrade_levels) continue
    const nid = String(node.id)
    const data = nodeData(node)
    const resource = str(data.resource)
    const baseCost = num(data.base_cost, 10)
    const growth = num(data.cost_growth, 1.15)
    const maxLevel = Math.floor(num(data.max_level, 0))
    // Nulová cena by znamenala nekonečně mnoho úrovní zdarma (validátor hlásí chybu).
    if (!resource || !(baseCost > 0) || !(growth > 0)) continue

    let level = s.upgrade_levels[nid] ?? 0
    for (let bought = 0; bought < MAX_UPGRADE_PURCHASES_PER_TICK; bought++) {
      if (maxLevel > 0 && level >= maxLevel) break
      const cost = upgradeCost(baseCost, growth, level)
      if (!(cost > 0) || !Number.isFinite(cost)) break
      ctx.hops = 0
      // Relativní tolerance: součty plovoucích čísel (0.1 + 0.2…) nesmí nákup o chlup minout.
      if (_availableFromConnected(nid, resource, ctx, 0, new Set()) < cost * (1 - 1e-9)) break
      _consumeFromConnected(nid, resource, cost, ctx, 0)
      level++
    }
    s.upgrade_levels[nid] = level
  }

  // Step 8: Gates
  evaluateGates(s, graph)

  // Step 9: Chance tracking — no-op (routing happens inline in distribute)

  return s
}

// ==================== Distribution (fan-out = duplicate) ====================

function _distributeToConnected(fromId: string, resource: string, amount: number, ctx: TickContext): void {
  if (!(amount > 0)) return
  for (const conn of ctx.outgoing.get(fromId) ?? []) {
    ctx.hops = 0
    _deliver(String(conn.to_node), resource, amount, ctx, 0)
  }
}

/** Delivers `amount` of `resource` into node `targetId`, routing through Gate/Chance/Splitter nodes. */
function _deliver(targetId: string, resource: string, amount: number, ctx: TickContext, depth: number): void {
  if (!(amount > 0) || depth > MAX_ROUTE_DEPTH || ++ctx.hops > MAX_ROUTE_HOPS) return
  const s = ctx.s

  // Gate: open → relay to all outputs, closed → block
  const gateOpen = s.gate_states[targetId]
  if (gateOpen !== undefined) {
    if (!gateOpen) return
    for (const conn of ctx.outgoing.get(targetId) ?? []) {
      _deliver(String(conn.to_node), resource, amount, ctx, depth + 1)
    }
    return
  }

  if (s.chance_rolls[targetId] !== undefined) {
    _routeThroughChance(targetId, resource, amount, ctx, depth)
    return
  }

  if (s.splitter_data[targetId] !== undefined) {
    _routeThroughSplitter(targetId, resource, amount, ctx, depth)
    return
  }

  const buf = s.converter_buffers[targetId]
  if (buf !== undefined) {
    const node = ctx.nodeById.get(targetId)
    const data = node ? nodeData(node) : {}
    const inputResource = str(data.input_resource)
    if (inputResource !== '' && inputResource !== resource) return
    const inputAmount = num(data.input_amount, 1.0)
    const cycleTime = num(data.cycle_time, 1.0)
    // Buffer pojme nejvýš jeden tick (nebo jeden cyklus, pokud je větší) vstupu.
    const limit = cycleTime > 0 ? Math.max(inputAmount, inputAmount * (ctx.delta / cycleTime)) : inputAmount
    buf.input_buffer = Math.min(buf.input_buffer + amount, Math.max(0, limit))
    return
  }

  const pool = s.pools[targetId]
  if (pool !== undefined && (pool.resource === resource || pool.resource === '')) {
    pool.resource = resource
    pool.amount += Math.min(amount, Math.max(0, pool.capacity - pool.amount))
  }
}

// ==================== Chance routing ====================

function _routeThroughChance(chanceId: string, resource: string, amount: number, ctx: TickContext, depth: number): void {
  const stats = ctx.s.chance_rolls[chanceId]
  // Striktní `<`: randf() vrací [0, 1), takže 0 % nikdy neuspěje a 100 % vždy.
  const success = ctx.rng.randf() < stats.success_chance / 100

  stats.total += 1
  if (success) stats.successes += 1

  // Port 0 = success, port 1 = failure. Tok se nikdy nepřelije na opačný
  // výstup — pokud cíl na zvoleném portu tok nepřijme, tok se ztratí.
  const outputPort = success ? 0 : 1
  for (const conn of ctx.outgoing.get(chanceId) ?? []) {
    if (portOf(conn) !== outputPort) continue
    _deliver(String(conn.to_node), resource, amount, ctx, depth + 1)
  }
}

// ==================== Splitter routing ====================

function _routeThroughSplitter(splitterId: string, resource: string, amount: number, ctx: TickContext, depth: number): void {
  const sdata = ctx.s.splitter_data[splitterId]
  const outConns = [...(ctx.outgoing.get(splitterId) ?? [])].sort((a, b) => portOf(a) - portOf(b))
  if (outConns.length === 0) return

  const numOutputs = outConns.length
  const shares: number[] = []

  if (sdata.split_mode === 0) {
    const share = amount / numOutputs
    for (let i = 0; i < numOutputs; i++) shares.push(share)
  } else {
    let totalWeight = 0
    for (let i = 0; i < numOutputs; i++) totalWeight += sdata.weights[i] ?? 1.0
    if (totalWeight <= 0) totalWeight = numOutputs
    for (let i = 0; i < numOutputs; i++) {
      shares.push(amount * ((sdata.weights[i] ?? 1.0) / totalWeight))
    }
  }

  for (let i = 0; i < numOutputs; i++) {
    _deliver(String(outConns[i].to_node), resource, shares[i], ctx, depth + 1)
  }
}

// ==================== Consumption ====================

/**
 * Consumes up to `amount` of `resource` from pools connected INTO `toId`.
 * An open Gate between the pool and the consumer is transparent (the
 * consumer pulls through it); a closed Gate blocks.
 */
function _consumeFromConnected(toId: string, resource: string, amount: number, ctx: TickContext, depth: number): number {
  if (depth === 0) ctx.hops = 0
  if (!(amount > 0) || depth > MAX_ROUTE_DEPTH || ++ctx.hops > MAX_ROUTE_HOPS) return 0
  let consumed = 0
  for (const conn of ctx.incoming.get(toId) ?? []) {
    if (consumed >= amount) break
    const fromId = String(conn.from_node)

    const gateOpen = ctx.s.gate_states[fromId]
    if (gateOpen !== undefined) {
      if (gateOpen) consumed += _consumeFromConnected(fromId, resource, amount - consumed, ctx, depth + 1)
      continue
    }

    const pool = ctx.s.pools[fromId]
    if (pool !== undefined && pool.resource === resource) {
      const take = Math.min(amount - consumed, pool.amount)
      if (take > 0) {
        pool.amount -= take
        consumed += take
      }
    }
  }
  return consumed
}

/**
 * How much of `resource` a consumer could take right now from the pools
 * connected into it (also through open Gates) — like _consumeFromConnected,
 * but without taking anything. Each pool counts once.
 */
function _availableFromConnected(toId: string, resource: string, ctx: TickContext, depth: number, seen: Set<string>): number {
  if (depth > MAX_ROUTE_DEPTH || ++ctx.hops > MAX_ROUTE_HOPS) return 0
  let available = 0
  for (const conn of ctx.incoming.get(toId) ?? []) {
    const fromId = String(conn.from_node)
    if (seen.has(fromId)) continue
    seen.add(fromId)

    const gateOpen = ctx.s.gate_states[fromId]
    if (gateOpen !== undefined) {
      if (gateOpen) available += _availableFromConnected(fromId, resource, ctx, depth + 1, seen)
      continue
    }

    const pool = ctx.s.pools[fromId]
    if (pool !== undefined && pool.resource === resource) available += Math.max(0, pool.amount)
  }
  return available
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

/** Distinct resource names referenced by nodes' `resource` field — used as
 * the variable set available to Formula expressions (mirrors Gate's
 * existing `variable` → resource-total lookup). */
function _distinctResourceNames(nodes: GSSGraph['nodes']): string[] {
  const names = new Set<string>()
  for (const node of nodes) {
    const resource = nodeData(node).resource
    if (typeof resource === 'string' && resource) names.add(resource)
  }
  return [...names]
}
