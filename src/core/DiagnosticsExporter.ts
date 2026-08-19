// DiagnosticsExporter.ts — port GDScript DiagnosticsExporter.gd
// Exportuje diagnostický bundle pro bug reporty / sdílení.

import { TICK_SPEC_VERSION } from './TickEngine'
import type { GSSGraph } from '../types/graph'
import type { RunReport, ValidationIssue } from '../types/simulation'

export interface DiagnosticsBundle {
  gss_version: string
  tick_spec_version: number
  export_time: string
  system: SystemInfo
  graph: Partial<GSSGraph>
  validation: ValidationIssue[]
  run_reports: RunReportSummary[]
  extra: Record<string, unknown>
}

export interface SystemInfo {
  user_agent: string
  platform: string
  language: string
  screen: string
  memory_mb: number | null
}

export interface RunReportSummary {
  scenario_name: string
  seed_used: number
  tick_spec_version: number
  total_ticks: number
  elapsed: number
  final_values: Record<string, number>
  chance_stats: Record<string, { successes: number; total: number }>
}

export function buildDiagnosticsBundle(
  graph: GSSGraph,
  runReports: RunReport[] = [],
  validationIssues: ValidationIssue[] = [],
  extra: Record<string, unknown> = {},
): DiagnosticsBundle {
  return {
    gss_version: '3.0',
    tick_spec_version: TICK_SPEC_VERSION,
    export_time: new Date().toISOString(),
    system: getSystemInfo(),
    graph: sanitizeGraph(graph),
    validation: validationIssues,
    run_reports: runReports.map(summarizeReport),
    extra,
  }
}

export function bundleToJSON(bundle: DiagnosticsBundle): string {
  return JSON.stringify(bundle, null, '\t')
}

// ==================== HELPERS ====================

function getSystemInfo(): SystemInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const screen = typeof window !== 'undefined'
    ? `${window.screen.width}x${window.screen.height}`
    : 'unknown'

  const memMb = (nav as unknown as { deviceMemory?: number } | null)?.deviceMemory ?? null

  return {
    user_agent: nav?.userAgent ?? 'unknown',
    platform:   nav?.platform  ?? 'unknown',
    language:   nav?.language  ?? 'unknown',
    screen,
    memory_mb: memMb ? memMb * 1024 : null,
  }
}

function sanitizeGraph(graph: GSSGraph): Partial<GSSGraph> {
  const g = { ...graph } as Partial<GSSGraph> & Record<string, unknown>
  delete g['_user_notes']
  delete g['_local_path']
  return g
}

function summarizeReport(report: RunReport): RunReportSummary {
  return {
    scenario_name:    report.scenario.name,
    seed_used:        report.seed_used,
    tick_spec_version: report.tick_spec_version,
    total_ticks:      report.summary.total_ticks,
    elapsed:          report.summary.elapsed,
    final_values:     report.summary.final_values,
    chance_stats:     report.chance_stats,
  }
}
