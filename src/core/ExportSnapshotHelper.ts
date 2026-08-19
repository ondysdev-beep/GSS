// ExportSnapshotHelper.ts — port GDScript ExportSnapshotHelper.gd
// Deterministické snapshoty simulace pro regresní testování.
// Spustí fixní simulaci, zachytí pool hodnoty + statistiky pro porovnání verzí.

import { TICK_SPEC_VERSION, simulateTick, initState } from './TickEngine'
import { createRNG } from './SimRNG'
import type { GSSGraph } from '../types/graph'
import type { PoolState } from '../types/simulation'

export const SNAPSHOT_TICKS = 60
export const SNAPSHOT_DT    = 1.0

export interface PoolSnapshot  { resource: string; amount: number }
export interface ChanceSnapshot { successes: number; total: number }

export interface SimSnapshot {
  tick_spec_version: number
  source_file: string
  seed: number
  ticks: number
  dt: number
  pools: Record<string, PoolSnapshot>
  gates: Record<string, boolean>
  chance_rolls: Record<string, ChanceSnapshot>
  export_lengths: Record<string, number>   // pro porovnání exportů
}

export interface SnapshotDiff {
  match: boolean
  diffs: string[]
}

// ==================== GENEROVÁNÍ ====================

export function generateSnapshot(graph: GSSGraph, sourceName = 'unknown'): SimSnapshot {
  const seed = graph.simulation_seed ?? 42
  const rng = createRNG(seed)

  let state = initState(graph)

  for (let i = 0; i < SNAPSHOT_TICKS; i++) {
    state = simulateTick(state, graph, SNAPSHOT_DT, rng)
  }

  // Pool snapshot (seřazeno pro determinismus)
  const poolSnapshot: Record<string, PoolSnapshot> = {}
  for (const pid of Object.keys(state.pools).sort()) {
    const p = state.pools[pid] as PoolState & { resource?: string }
    poolSnapshot[pid] = {
      resource: p.resource ?? '',
      amount:   Math.round(p.amount * 10000) / 10000,
    }
  }

  // Gate snapshot (seřazeno)
  const gateSnapshot: Record<string, boolean> = {}
  for (const gid of Object.keys(state.gate_states).sort()) {
    gateSnapshot[gid] = state.gate_states[gid]
  }

  // Chance roll snapshot (seřazeno)
  const chanceSnapshot: Record<string, ChanceSnapshot> = {}
  for (const cid of Object.keys(state.chance_rolls).sort()) {
    const cr = state.chance_rolls[cid]
    chanceSnapshot[cid] = { successes: cr.successes, total: cr.total }
  }

  return {
    tick_spec_version: TICK_SPEC_VERSION,
    source_file: sourceName,
    seed,
    ticks: SNAPSHOT_TICKS,
    dt: SNAPSHOT_DT,
    pools: poolSnapshot,
    gates: gateSnapshot,
    chance_rolls: chanceSnapshot,
    export_lengths: {},  // Vyplní volající pokud potřebuje porovnání exportů
  }
}

// ==================== POROVNÁNÍ ====================

export function compareSnapshots(saved: SimSnapshot, fresh: SimSnapshot): SnapshotDiff {
  const diffs: string[] = []

  // Porovnat pool hodnoty
  for (const pid of Object.keys(fresh.pools)) {
    if (!(pid in saved.pools)) {
      diffs.push(`Pool '${pid}' is new (not in the saved snapshot)`)
      continue
    }
    const savedAmt = saved.pools[pid].amount
    const newAmt   = fresh.pools[pid].amount
    if (Math.abs(savedAmt - newAmt) > 0.01) {
      diffs.push(`Pool '${pid}' amount changed: ${savedAmt.toFixed(4)} → ${newAmt.toFixed(4)}`)
    }
  }
  for (const pid of Object.keys(saved.pools)) {
    if (!(pid in fresh.pools)) diffs.push(`Pool '${pid}' is missing from the new snapshot`)
  }

  // Porovnat délky exportů
  for (const [lang, savedLen] of Object.entries(saved.export_lengths)) {
    const newLen = fresh.export_lengths[lang] ?? 0
    if (savedLen !== newLen) {
      diffs.push(`Export length changed for '${lang}': ${savedLen} → ${newLen}`)
    }
  }

  return { match: diffs.length === 0, diffs }
}

// ==================== JSON SERIALIZACE ====================

export function snapshotToJSON(snap: SimSnapshot): string {
  return JSON.stringify(snap, null, '\t')
}

export function snapshotFromJSON(json: string): SimSnapshot {
  return JSON.parse(json) as SimSnapshot
}
