// CSV exporter — (time, pool_id, value) rows, Excel/Sheets compatible

import type { GSSGraph } from '../../types/graph'
import type { RunReport } from '../../types/simulation'
import { reportToCSV } from '../ScenarioRunner'

export function exportCSV(
  _graph: GSSGraph,
  report: RunReport,
): string {
  return reportToCSV(report)
}
