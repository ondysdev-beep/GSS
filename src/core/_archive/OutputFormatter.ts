// OutputFormatter.ts — port GDScript OutputFormatter.gd
// Formátování výstupů Decision Core pro lidi i structured export.

import type { VerdictReport, HealthScore } from '../types/simulation'
import type { Recommendation }            from './RecommendationEngine'

// ==================== ASCII BAR HELPERS ====================

export function createProgressBar(value: number, maxValue: number, width = 40): string {
  const ratio  = Math.max(0, Math.min(1, value / maxValue))
  const filled = Math.round(ratio * width)
  const empty  = width - filled
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']'
}

export function createMiniBar(value: number, width = 10): string {
  const ratio  = Math.max(0, Math.min(1, value / 100))
  const filled = Math.round(ratio * width)
  const empty  = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

function verdictIcon(state: string): string {
  switch (state) {
    case 'SAFE':     return '🟢'
    case 'CAUTION':  return '🟡'
    case 'UNSAFE':   return '🟠'
    case 'CRITICAL': return '🔴'
    default:         return '⚪'
  }
}

// ==================== SECTION FORMATTERS ====================

function formatVerdictSection(verdict: VerdictReport['verdict']): string {
  return [
    '┌─────────────────────────────────────────────────────────────┐',
    '│                         VERDICT                             │',
    '└─────────────────────────────────────────────────────────────┘',
    '',
    `  ${verdictIcon(verdict.state)}  ${verdict.state}`,
    '',
    `  Confidence: ${(verdict.confidence_score * 100).toFixed(0)}%`,
    '',
  ].join('\n')
}

function formatHealthSection(health: HealthScore): string {
  const total = health.total
  return [
    '┌─────────────────────────────────────────────────────────────┐',
    '│                      HEALTH SCORE                           │',
    '└─────────────────────────────────────────────────────────────┘',
    '',
    `  Total: ${total.toFixed(0)}/100  [${createProgressBar(total, 100)}]`,
    '',
    '  Sub-Scores:',
    `  ├─ Stability:      ${createMiniBar(health.stability)} ${health.stability.toFixed(0)}`,
    `  ├─ Convergence:    ${createMiniBar(health.convergence)} ${health.convergence.toFixed(0)}`,
    `  ├─ Fairness:       ${createMiniBar(health.fairness)} ${health.fairness.toFixed(0)}`,
    `  ├─ Exploitability: ${createMiniBar(health.exploitability)} ${health.exploitability.toFixed(0)}`,
    `  └─ Recovery:       ${createMiniBar(health.recovery)} ${health.recovery.toFixed(0)}`,
    '',
  ].join('\n')
}

function formatFailuresSection(failures: VerdictReport['failure_report']['failures']): string {
  const lines = [
    '┌─────────────────────────────────────────────────────────────┐',
    '│                   CRITICAL FAILURES                         │',
    '└─────────────────────────────────────────────────────────────┘',
    '',
  ]
  if (failures.length === 0) {
    lines.push('  ✓ No critical failures detected.', '')
    return lines.join('\n')
  }
  for (const f of failures) {
    const icon = f.severity === 'CRITICAL' ? '🔴' : '🟠'
    lines.push(`  ${icon} [${f.severity}] ${f.type}`, `     ${f.message}`, '')
  }
  return lines.join('\n')
}

function formatRecommendationsSection(recommendations: Recommendation[]): string {
  const lines = [
    '┌─────────────────────────────────────────────────────────────┐',
    '│                   RECOMMENDATIONS                           │',
    '└─────────────────────────────────────────────────────────────┘',
    '',
  ]
  if (recommendations.length === 0) {
    lines.push('  No recommendations at this time.', '')
    return lines.join('\n')
  }
  lines.push(`  Showing ${recommendations.length} recommendation(s):`, '')
  recommendations.forEach((rec, i) => {
    lines.push(
      `  [${i + 1}] ${rec.target_parameter}`,
      `      Current:    ${String(rec.current_value)}`,
      `      Suggest:    ${String(rec.suggested_value)}`,
      `      Impact:     +${rec.expected_improvement.toFixed(0)} to health score`,
      `      Trade-off:  ${rec.trade_off || 'None'}`,
      `      Confidence: ${(rec.confidence * 100).toFixed(0)}%`,
      '',
    )
  })
  return lines.join('\n')
}

// ==================== FULL REPORT ====================

export function formatFullReport(
  verdictReport: VerdictReport,
  recommendations: Recommendation[],
): string {
  return [
    '═══════════════════════════════════════════════════════════════',
    '                    GAME SYSTEMS SIMULATOR',
    '                      DECISION CORE REPORT',
    '═══════════════════════════════════════════════════════════════',
    '',
    formatVerdictSection(verdictReport.verdict),
    formatHealthSection(verdictReport.health_score),
    formatFailuresSection(verdictReport.failure_report.failures),
    formatRecommendationsSection(recommendations),
    '═══════════════════════════════════════════════════════════════',
    '                         END OF REPORT',
    '═══════════════════════════════════════════════════════════════',
  ].join('\n')
}

// ==================== SUMMARY (clipboard-friendly) ====================

export function formatSummary(
  verdictReport: VerdictReport,
  recommendations: Recommendation[],
): string {
  const v = verdictReport.verdict
  const h = verdictReport.health_score
  const lines = [
    `VERDICT: ${v.state} (${(v.confidence_score * 100).toFixed(0)}% confidence)`,
    `HEALTH: ${h.total.toFixed(0)}/100`,
    `FAILURES: ${verdictReport.failure_report.failures.length} detected`,
    `RECOMMENDATIONS: ${recommendations.length}`,
  ]
  if (recommendations.length > 0) {
    const r = recommendations[0]
    lines.push(
      '',
      'TOP RECOMMENDATION:',
      `  ${r.target_parameter}: ${String(r.current_value)} → ${String(r.suggested_value)}`,
      `  Impact: +${r.expected_improvement.toFixed(0)} pts | Confidence: ${(r.confidence * 100).toFixed(0)}%`,
    )
  }
  return lines.join('\n')
}

// ==================== STRUCTURED EXPORT ====================

export function toReportDictionary(
  verdictReport: VerdictReport,
  recommendations: Recommendation[],
): Record<string, unknown> {
  return {
    verdict: {
      state:      verdictReport.verdict.state,
      confidence: verdictReport.verdict.confidence_score,
    },
    health_score: {
      total:          verdictReport.health_score.total,
      stability:      verdictReport.health_score.stability,
      convergence:    verdictReport.health_score.convergence,
      fairness:       verdictReport.health_score.fairness,
      exploitability: verdictReport.health_score.exploitability,
      recovery:       verdictReport.health_score.recovery,
    },
    failures: verdictReport.failure_report.failures.map((f) => ({
      type:     f.type,
      severity: f.severity,
      message:  f.message,
    })),
    recommendations: recommendations.map((r) => ({
      target_parameter:     r.target_parameter,
      current_value:        r.current_value,
      suggested_value:      r.suggested_value,
      expected_improvement: r.expected_improvement,
      trade_off:            r.trade_off,
      confidence:           r.confidence,
    })),
    metadata: {
      generated_at: new Date().toISOString(),
      version:      '3.0.0',
    },
  }
}

export function toReportJSON(verdictReport: VerdictReport, recommendations: Recommendation[]): string {
  return JSON.stringify(toReportDictionary(verdictReport, recommendations), null, '  ')
}
