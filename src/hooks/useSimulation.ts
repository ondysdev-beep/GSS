// useSimulation.ts — Napojení graph store na ScenarioRunner + analýzu

import { useCallback } from 'react'
import { runScenario, buildSimulationContext } from '../core/ScenarioRunner'
import { generateVerdictReport } from '../core/VerdictSystem'
import { validate, hasErrors } from '../core/GraphValidator'
import { useGraphStore } from '../store/graphStore'
import { useSimulationStore } from '../store/simulationStore'
import { useLicenseStore } from '../store/licenseStore'
import { FREE_TIER_LIMITS } from '../types/simulation'
import type { RunReport } from '../types/simulation'

export interface UseSimulationReturn {
  run: () => Promise<RunReport | null>
  isRunning: boolean
  reportA: RunReport | null
  replayTick: number
  setReplayTick: (tick: number) => void
  error: string | null
}

export function useSimulation(): UseSimulationReturn {
  const graph = useGraphStore((s) => s.graph)
  const {
    scenario, isRunning, reportA, replayTick, error,
    setRunning, setProgress, setReportA, setVerdictReport,
    setIssues, setError, setReplayTick,
  } = useSimulationStore()
  const license = useLicenseStore((s) => s.license)

  const run = useCallback(async (): Promise<RunReport | null> => {
    if (isRunning) return null

    // Validace grafu
    const issues = validate(graph)
    setIssues(issues)
    if (hasErrors(issues)) {
      setError('Graph contains errors. Fix them before running the simulation.')
      return null
    }

    // Free tier limity
    const isPro = license?.isPro ?? false
    if (!isPro && graph.nodes.length > FREE_TIER_LIMITS.MAX_NODES) {
      setError(`Free tier: max ${FREE_TIER_LIMITS.MAX_NODES} nodes. Upgrade to GSS PRO for unlimited nodes.`)
      return null
    }

    const effectiveDuration = !isPro
      ? Math.min(scenario.duration, FREE_TIER_LIMITS.MAX_TICKS)
      : scenario.duration

    setRunning(true)
    setProgress(0)

    // ScenarioRunner běží synchronně — pustíme ho v setTimeout aby UI mohlo reagovat
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    try {
      const report = runScenario(graph, { ...scenario, duration: effectiveDuration })

      // Spustit analýzu (health skóre + verdict)
      const ctx = buildSimulationContext(report, graph, { ...scenario, duration: effectiveDuration })
      const verdict = generateVerdictReport(ctx)

      setReportA(report)
      setVerdictReport(verdict)
      setRunning(false)
      setProgress(1)
      return report
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [graph, scenario, isRunning, license, setRunning, setProgress, setReportA, setVerdictReport, setIssues, setError])

  return { run, isRunning, reportA, replayTick, setReplayTick, error }
}
