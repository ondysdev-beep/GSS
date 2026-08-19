// ScenarioComparer.ts — přímý port GDScript ScenarioComparer.gd
// A/B porovnání dvou RunReport — delty, growth rates, winner summary

import { TICK_SPEC_VERSION } from './TickEngine'
import type { RunReport, CompareReport } from '../types/simulation'

export function compareReports(reportA: RunReport, reportB: RunReport): CompareReport {
  const sumA = reportA.summary
  const sumB = reportB.summary

  const finalA = sumA.final_values
  const finalB = sumB.final_values
  const tttA   = sumA.time_to_threshold
  const tttB   = sumB.time_to_threshold

  // Sjednotit všechny pool IDs
  const allPools = new Set([...Object.keys(finalA), ...Object.keys(finalB)])

  const poolDiffs: CompareReport['pool_diffs'] = {}
  let aBetter = 0
  let bBetter = 0

  for (const pid of allPools) {
    const fa = finalA[pid] ?? 0
    const fb = finalB[pid] ?? 0
    const delta = fb - fa
    const pct   = Math.abs(fa) > 0.0001 ? (delta / fa * 100) : 0

    const ta = tttA[pid] ?? -1
    const tb = tttB[pid] ?? -1
    let tttDelta = 0
    if (ta >= 0 && tb >= 0) tttDelta = tb - ta
    else if (ta >= 0) tttDelta = Infinity
    else if (tb >= 0) tttDelta = -Infinity

    poolDiffs[pid] = {
      final_a:   fa,
      final_b:   fb,
      delta:     Math.round(delta * 10000) / 10000,
      pct_change: Math.round(pct   * 100)   / 100,
      ttt_a: ta,
      ttt_b: tb,
      ttt_delta: tttDelta,
    }

    if (fb > fa + 0.01) bBetter++
    else if (fa > fb + 0.01) aBetter++
  }

  // Chance diffs
  const chanceA = reportA.chance_stats
  const chanceB = reportB.chance_stats
  const allChance = new Set([...Object.keys(chanceA), ...Object.keys(chanceB)])
  const chanceDiffs: CompareReport['chance_diffs'] = {}

  for (const cid of allChance) {
    const ca = chanceA[cid] ?? { successes: 0, total: 0 }
    const cb = chanceB[cid] ?? { successes: 0, total: 0 }
    const rateA = ca.total > 0 ? (ca.successes / ca.total) * 100 : 0
    const rateB = cb.total > 0 ? (cb.successes / cb.total) * 100 : 0
    chanceDiffs[cid] = {
      successes_a: ca.successes,
      successes_b: cb.successes,
      delta: Math.round((rateB - rateA) * 100) / 100,
    }
  }

  // Growth rates (final / elapsed)
  const elapsedA = sumA.elapsed || 60
  const elapsedB = sumB.elapsed || 60
  const growthRates: CompareReport['growth_rates'] = {}

  for (const pid of allPools) {
    const grA = (finalA[pid] ?? 0) / Math.max(0.001, elapsedA)
    const grB = (finalB[pid] ?? 0) / Math.max(0.001, elapsedB)
    growthRates[pid] = {
      rate_a: Math.round(grA * 10000) / 10000,
      rate_b: Math.round(grB * 10000) / 10000,
      delta:  Math.round((grB - grA) * 10000) / 10000,
    }
  }

  // Winner summary
  const nameA = reportA.scenario.name || 'A'
  const nameB = reportB.scenario.name || 'B'
  let winnerSummary: string
  if (aBetter > bBetter) {
    winnerSummary = `${nameA} wins (${aBetter}/${allPools.size} pools higher)`
  } else if (bBetter > aBetter) {
    winnerSummary = `${nameB} wins (${bBetter}/${allPools.size} pools higher)`
  } else {
    winnerSummary = `Tie (${aBetter} pools each)`
  }

  return {
    tick_spec_version: TICK_SPEC_VERSION,
    scenario_a: nameA,
    scenario_b: nameB,
    pool_diffs: poolDiffs,
    chance_diffs: chanceDiffs,
    growth_rates: growthRates,
    winner_summary: winnerSummary,
  }
}

export function compareToCSV(report: CompareReport): string {
  const pids = Object.keys(report.pool_diffs).sort()
  const header = 'pool,final_a,final_b,delta,pct_change,ttt_a,ttt_b,ttt_delta'
  const rows = pids.map((pid) => {
    const d = report.pool_diffs[pid]
    return `${pid},${d.final_a.toFixed(4)},${d.final_b.toFixed(4)},${d.delta.toFixed(4)},${d.pct_change.toFixed(2)},${d.ttt_a.toFixed(1)},${d.ttt_b.toFixed(1)},${d.ttt_delta === Infinity ? 'Inf' : d.ttt_delta === -Infinity ? '-Inf' : d.ttt_delta.toFixed(1)}`
  })
  return [header, ...rows].join('\n')
}
