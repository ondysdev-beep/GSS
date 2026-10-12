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

function IssueRow({ issue, label }: { issue: ValidationIssue; label?: string }) {
  const style = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.INFO
  const dot   = SEVERITY_DOT[issue.severity]  ?? SEVERITY_DOT.INFO
  // Uživatel zná uzly podle názvu, ne podle interního ID (node_<timestamp>_<n>).
  const message = issue.nodeId && label ? issue.message.split(`'${issue.nodeId}'`).join(`'${label}'`) : issue.message
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 rounded border text-xs ${style}`}>
      <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span>
        {issue.nodeId && (
          <span className="font-semibold mr-1.5">[{label ?? issue.nodeId}]</span>
        )}
        {message}
      </span>
    </div>
  )
}

export function IssuesPanel() {
  const graph = useGraphStore((s) => s.graph)
  // null = uživatel panel ještě nepřepnul: rozbalený jen když jsou chyby.
  // Samotná varování (např. právě vložený, ještě nezapojený uzel) jsou při
  // stavbě grafu normální a nemají zabírat místo pod editorem.
  const [expanded, setExpanded] = useState<boolean | null>(null)
  // Prázdný graf není "chyba" k zobrazení pod editorem — jen se nedá spustit.
  const issues = useMemo(() => (graph.nodes.length === 0 ? [] : validate(graph)), [graph])
  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of graph.nodes) {
      if (typeof n.label === 'string' && n.label.trim()) m.set(String(n.id), n.label.trim())
    }
    return m
  }, [graph.nodes])

  if (issues.length === 0) return null

  const errors   = issues.filter((i) => i.severity === 'ERROR')
  const warnings = issues.filter((i) => i.severity === 'WARNING')
  const infos    = issues.filter((i) => i.severity === 'INFO')
  const collapsed = !(expanded ?? errors.length > 0)

  return (
    <div className="flex flex-col gap-1 mt-2 px-3">
      <button
        onClick={() => setExpanded(collapsed)}
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
            <IssueRow key={`${issue.code}-${issue.nodeId}-${i}`} issue={issue} label={issue.nodeId ? labels.get(issue.nodeId) : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
