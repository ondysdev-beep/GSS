// CSV exporter — long format: one (time, pool_id, value) row per pool per
// sampled frame. Excel/Sheets friendly for pivot tables. The wide format
// (one column per pool) is ScenarioRunner.reportToCSV.

import type { GSSGraph } from '../../types/graph'
import type { RunReport } from '../../types/simulation'
import { reportToLongCSV } from '../ScenarioRunner'

export function exportCSV(
  _graph: GSSGraph,
  report: RunReport,
): string {
  return reportToLongCSV(report)
}
