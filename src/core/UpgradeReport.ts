// UpgradeReport.ts — after a run: how each Upgrade paced out, how long its
// next level takes to pay for itself, and where the progression hits a wall
// ("level 6 took 7× longer than level 5").
//
// Payback is an estimate: the extra production of the upgrade's own currency
// that the next level adds, at the levels reached at the end of the run, with
// converters assumed to have enough input. Upgrades that boost something else
// (another resource, pool capacity) have no payback in their own currency.

import type { GSSGraph } from '../types/graph'
import { NodeType } from '../types/graph'
import type { RunReport } from '../types/simulation'
import { upgradeBoosts, upgradeCost } from './TickEngine'
import { evaluateFormula } from './FormulaEvaluator'
import { runScenario } from './ScenarioRunner'

/** The same run without the play schedule (player never leaves) — pure economy pacing. */
function nonstopRun(graph: GSSGraph, report: RunReport): RunReport {
  const { play_schedule: _s, ...rest } = graph
  void _s
  return runScenario(rest, { ...report.scenario, seed_override: report.seed_used })
}
import { formatDuration, formatNumber } from './formatNumber'

/** A level that takes this many times longer than the previous one is a "price wall". */
export const PRICE_WALL_RATIO = 5

export type UpgradeNoteKind = 'never_bought' | 'price_wall' | 'stalled' | 'slow_payback' | 'no_gain'

export interface UpgradeNote {
  kind: UpgradeNoteKind
  severity: 'warning' | 'info'
  message: string
}

export interface UpgradeInsight {
  id: string
  label: string
  resource: string
  level: number
  /** 0 = no limit */
  max_level: number
  maxed: boolean
  /** Simulated time of the last purchase, -1 = never bought. */
  last_bought: number
  /** Cost of the next level (null when maxed). */
  next_cost: number | null
  /** Extra `resource` per second the next level adds (null = cannot be estimated). */
  extra_per_second: number | null
  /** next_cost / extra_per_second (null = cannot be estimated). */
  payback_seconds: number | null
  notes: UpgradeNote[]
}

type Data = Record<string, unknown>
const dataOf = (n: GSSGraph['nodes'][number]): Data => (n.data ?? {}) as unknown as Data
const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Production of `resource` per second by node `n` at boost 1, or null when
 * the node does not produce it. Formulas are evaluated with the final pools.
 */
function baseProduction(n: GSSGraph['nodes'][number], resource: string, vars: Record<string, number>): number | null {
  const d = dataOf(n)
  switch (n.type) {
    case NodeType.SOURCE:
      return str(d.resource) === resource ? num(d.rate, 1) : null
    case NodeType.TIMER:
      return str(d.resource) === resource ? num(d.amount, 1) / Math.max(num(d.interval, 60), 0.001) : null
    case NodeType.PLAYER_ACTION:
      return str(d.resource) === resource ? num(d.amount, 1) / Math.max(num(d.cadence, 5), 0.001) : null
    case NodeType.CONVERTER: {
      if (str(d.output_resource) !== resource) return null
      const cycle = num(d.cycle_time, 1)
      return cycle > 0 ? num(d.output_amount, 1) / cycle : null
    }
    case NodeType.FORMULA: {
      if (str(d.output_resource) !== resource) return null
      try { return Math.max(0, evaluateFormula(str(d.expression) || '0', vars)) } catch { return null }
    }
    default:
      return null
  }
}

export function analyzeUpgrades(graph: GSSGraph, report: RunReport): UpgradeInsight[] {
  const levels = report.summary.upgrade_levels ?? {}
  const times = report.summary.upgrade_times ?? {}
  const elapsed = report.summary.elapsed
  // Cenové zdi se měří na běhu BEZ přestávek: s plánem hraní hráč po návratu
  // nakoupí desítky úrovní najednou a další běžná úroveň by pak vypadala jako
  // zeď. Tempo samotné ekonomiky ukáže jen nepřerušený běh.
  const pacing = graph.play_schedule ? nonstopRun(graph, report) : report
  const pacingTimes = pacing.summary.upgrade_times ?? {}
  const pacingLevels = pacing.summary.upgrade_levels ?? {}
  const pacingElapsed = pacing.summary.elapsed

  // Proměnné pro Formula uzly: součty zdrojů na konci běhu.
  const vars: Record<string, number> = {}
  const resourceOfPool = new Map<string, string>()
  for (const n of graph.nodes) if (n.type === NodeType.POOL) resourceOfPool.set(String(n.id), str(dataOf(n).resource))
  for (const [pid, amount] of Object.entries(report.summary.final_values)) {
    const r = resourceOfPool.get(pid)
    if (r) vars[r] = (vars[r] ?? 0) + amount
  }
  vars.tick = report.summary.total_ticks

  const nodeById = new Map(graph.nodes.map((n) => [String(n.id), n]))
  const boostNow = upgradeBoosts(graph, levels)
  const out: UpgradeInsight[] = []

  for (const node of graph.nodes) {
    if (node.type !== NodeType.UPGRADE) continue
    const id = String(node.id)
    const d = dataOf(node)
    const resource = str(d.resource)
    const baseCost = num(d.base_cost, 10)
    const growth = num(d.cost_growth, 1.15)
    const maxLevel = Math.max(0, Math.floor(num(d.max_level, 0)))
    const level = levels[id] ?? 0
    const maxed = maxLevel > 0 && level >= maxLevel
    const bought = times[id] ?? []
    const nextCost = maxed ? null : upgradeCost(baseCost, growth, level)

    // Přínos další úrovně: rozdíl produkce cílů při úrovni L a L+1 (ostatní upgrady beze změny).
    let extra: number | null = null
    if (!maxed) {
      const boostNext = upgradeBoosts(graph, { ...levels, [id]: level + 1 })
      for (const conn of graph.connections) {
        if (String(conn.from_node) !== id) continue
        const target = nodeById.get(String(conn.to_node))
        if (!target) continue
        const base = baseProduction(target, resource, vars)
        if (base === null) continue
        const tid = String(target.id)
        extra = (extra ?? 0) + base * ((boostNext.get(tid) ?? 1) - (boostNow.get(tid) ?? 1))
      }
    }
    const payback = nextCost !== null && extra !== null && extra > 0 ? nextCost / extra : null

    const notes: UpgradeNote[] = []
    const label = node.label || id
    if (level === 0 && nextCost !== null) {
      notes.push({
        kind: 'never_bought', severity: 'warning',
        message: `Never bought in this run — the first level costs ${formatNumber(nextCost)} ${resource}.`,
      })
    }

    // Cenová zeď: úroveň, která trvala ≥ 5× déle než předchozí.
    const pacingBought = pacingTimes[id] ?? []
    const pacingLevel = pacingLevels[id] ?? 0
    const gaps: number[] = []
    let prev = 0
    for (const t of pacingBought) { gaps.push(t - prev); prev = t }
    const minWall = Math.max(10 * report.scenario.dt, pacingElapsed * 0.05)
    let worst: { level: number; ratio: number; gap: number; before: number } | null = null
    let lastGap = 0
    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i]
      if (lastGap > 0 && g >= minWall && g >= PRICE_WALL_RATIO * lastGap) {
        const ratio = g / lastGap
        if (!worst || ratio > worst.ratio) worst = { level: i + 1, ratio, gap: g, before: lastGap }
      }
      if (g > 0) lastGap = g
    }
    if (worst) {
      notes.push({
        kind: 'price_wall', severity: 'warning',
        message: `Price wall: level ${worst.level} took ${Math.round(worst.ratio)}× longer than level ${worst.level - 1} (${formatDuration(worst.gap)} vs ${formatDuration(worst.before)}).`,
      })
    }
    // Zaseknutí: na další úroveň se čeká už mnohem déle, než trvala poslední.
    const pacingMaxed = maxLevel > 0 && pacingLevel >= maxLevel
    if (!pacingMaxed && pacingLevel > 0 && lastGap > 0) {
      const waiting = pacingElapsed - pacingBought[pacingBought.length - 1]
      if (waiting >= minWall && waiting >= PRICE_WALL_RATIO * lastGap) {
        notes.push({
          kind: 'stalled', severity: 'warning',
          message: `Stalled: level ${pacingLevel + 1} was still out of reach after ${formatDuration(waiting)} — ${Math.round(waiting / lastGap)}× longer than level ${pacingLevel} took.`,
        })
      }
    }

    if (nextCost !== null && extra !== null) {
      if (!(extra > 0)) {
        notes.push({ kind: 'no_gain', severity: 'warning', message: `The next level adds no ${resource} production, so it never pays for itself.` })
      } else if (payback !== null && payback > elapsed && elapsed > 0) {
        notes.push({
          kind: 'slow_payback', severity: 'info',
          message: `The next level earns its price back only after ≈${formatDuration(payback)} of production — longer than this whole run.`,
        })
      }
    }

    out.push({
      id, label, resource, level, max_level: maxLevel, maxed,
      last_bought: bought.length > 0 ? bought[bought.length - 1] : -1,
      next_cost: nextCost,
      extra_per_second: extra,
      payback_seconds: payback,
      notes,
    })
  }
  return out
}
