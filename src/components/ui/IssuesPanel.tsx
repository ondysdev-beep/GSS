// IssuesPanel — validation error/warning list below the graph editor.
//
// Validuje se živě nad aktuálním grafem (levné, čistá funkce) — dřív se
// zobrazovaly problémy z posledního spuštění simulace, které po opravě grafu
// zůstávaly viset až do dalšího běhu.

import { useMemo, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { validate } from '../../core/GraphValidator'
import type { ValidationIssue } from '../../types/simulation'

const SEVERITY_STYLE: Record<string, string> = {
  ERROR:   'text-red-400 bg-red-400/10 border-red-400/20',
  WARNING: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  INFO:    'text-blue-400 bg-blue-400/10 border-blue-400/20',
}

const SEVERITY_DOT: Record<string, string> = {
  ERROR:   'bg-red-400',
  WARNING: 'bg-yellow-400',
  INFO:    'bg-blue-400',
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const style = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.INFO
  const dot   = SEVERITY_DOT[issue.severity]  ?? SEVERITY_DOT.INFO
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 rounded border text-xs ${style}`}>
      <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span>
        {issue.nodeId && (
          <span className="font-mono font-semibold mr-1.5">[{issue.nodeId}]</span>
        )}
        {issue.message}
      </span>
    </div>
  )
}

export function IssuesPanel() {
  const graph = useGraphStore((s) => s.graph)
  const [collapsed, setCollapsed] = useState(false)
  // Prázdný graf není "chyba" k zobrazení pod editorem — jen se nedá spustit.
  const issues = useMemo(() => (graph.nodes.length === 0 ? [] : validate(graph)), [graph])

  if (issues.length === 0) return null

  const errors   = issues.filter((i) => i.severity === 'ERROR')
  const warnings = issues.filter((i) => i.severity === 'WARNING')
  const infos    = issues.filter((i) => i.severity === 'INFO')

  return (
    <div className="flex flex-col gap-1 mt-2 px-3">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-3 text-[10px] text-muted mb-1 text-left"
        aria-expanded={!collapsed}
      >
        <span>{collapsed ? '▸' : '▾'} Validation</span>
        {errors.length   > 0 && <span className="text-red-400">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
        {warnings.length > 0 && <span className="text-yellow-400">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
        {infos.length    > 0 && <span className="text-blue-400">{infos.length} info</span>}
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {[...errors, ...warnings, ...infos].map((issue, i) => (
            <IssueRow key={`${issue.code}-${issue.nodeId}-${i}`} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}
