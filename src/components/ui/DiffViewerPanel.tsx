// DiffViewerPanel.tsx — Economy Diff Viewer (Fáze 1 nových funkcí).
//
// Vizuální A/B diff aktuálního grafu proti druhé verzi (snapshot z historie
// nebo nahraný .gss soubor). Veškerá diff logika je v `GraphDiffer.ts`,
// který už v projektu existoval a nebyl nikde napojen — tento panel je
// tenká UI vrstva nad ním, žádná nová diff logika.
//
// Health score srovnání znovupoužívá existující pipeline
// (runScenario → buildSimulationContext → calculateHealthScore), stejnou,
// jakou používá SimulationDashboard — žádná duplicitní simulační logika.

import { useState, useMemo } from 'react'
import { platform } from '../../platform'
import { useGraphStore } from '../../store/graphStore'
import { loadHistory, type VersionSnapshot } from '../../hooks/useVersionHistory'
import { diffGraphs, formatDiffChange, type DiffSeverity } from '../../core/GraphDiffer'
import { runScenario } from '../../core/ScenarioRunner'
import { buildSimulationContext } from '../../core/ScenarioRunner'
import { calculateHealthScore } from '../../core/HealthScoreCalculator'
import type { GSSGraph } from '../../types/graph'
import type { HealthScore } from '../../types/simulation'

const SEVERITY_COLOR: Record<DiffSeverity, string> = {
  BREAKING: 'text-danger',
  MAJOR: 'text-warning',
  MINOR: 'text-muted',
}

function safeHealthScore(graph: GSSGraph): HealthScore | null {
  try {
    const report = runScenario(graph)
    const ctx = buildSimulationContext(report, graph)
    return calculateHealthScore(ctx)
  } catch {
    // Diffovaný graf nemusí být validní (např. rozpracovaná verze) —
    // health score je bonus, ne blokující požadavek diffu samotného.
    return null
  }
}

export function DiffViewerPanel() {
  const graph = useGraphStore((s) => s.graph)
  const [snapshots] = useState<VersionSnapshot[]>(() => loadHistory())
  const [compareGraph, setCompareGraph] = useState<GSSGraph | null>(null)
  const [compareLabel, setCompareLabel] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const diff = useMemo(() => {
    if (!compareGraph) return null
    try {
      // Obrana do hloubky (B1b): diffGraphs je teď robustní vůči chybějícímu
      // "data", ale toto volání zůstává v useMemo/render fázi, kde by jakákoli
      // BUDOUCÍ výjimka v cizím kódu spadla rovnou do ErrorBoundary místo
      // srozumitelné hlášky. useMemo musí zůstat čistý (žádné setState
      // uvnitř) — chybu proto jen vrátíme jako součást výsledku, ne voláním
      // setError přímo tady.
      return { result: diffGraphs(compareGraph, graph), error: null as string | null }
    } catch (err) {
      return { result: null, error: `Graph comparison failed: ${err}` }
    }
  }, [compareGraph, graph])

  const diffError = diff?.error ?? null
  const diffResult = diff?.result ?? null

  const healthA = useMemo(() => (compareGraph ? safeHealthScore(compareGraph) : null), [compareGraph])
  const healthB = useMemo(() => safeHealthScore(graph), [graph])

  function pickSnapshot(idx: number) {
    const snap = snapshots[idx]
    if (!snap) return
    setCompareGraph(snap.graph)
    setCompareLabel(`${snap.label} (${new Date(snap.timestamp).toLocaleString()})`)
    setError(null)
  }

  async function pickFile() {
    try {
      const result = await platform.openFile(['gss', 'json'])
      if (!result) return
      const parsed = JSON.parse(result.content) as GSSGraph
      setCompareGraph(parsed)
      setCompareLabel(`${parsed.name} (file)`)
      setError(null)
    } catch (err) {
      setError(`Failed to load file: ${err}`)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Economy Diff Viewer</h3>
      </div>

      {/* Výběr porovnávané verze */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-border bg-card">
        <span className="text-[10px] text-muted">Compare current graph against:</span>
        {snapshots.length > 0 && (
          <select
            className="px-2 py-1 text-[10px] bg-bg border border-border rounded text-white/70"
            onChange={(e) => e.target.value !== '' && pickSnapshot(Number(e.target.value))}
            defaultValue=""
          >
            <option value="" disabled>Version history…</option>
            {snapshots.map((s, i) => (
              <option key={s.timestamp} value={i}>
                {s.label} — {new Date(s.timestamp).toLocaleString()}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={pickFile}
          className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 text-white/60 rounded transition-colors"
        >
          Upload file…
        </button>
        {compareLabel && (
          <span className="text-[10px] text-accent ml-auto">vs. {compareLabel}</span>
        )}
      </div>

      {error && <div className="text-[10px] text-danger">{error}</div>}
      {diffError && <div className="text-[10px] text-danger">{diffError}</div>}

      {!compareGraph ? (
        <div className="text-center py-8 text-white/30 text-sm">
          <div className="text-2xl mb-2">⇄</div>
          Select a version from history or upload a second .gss file to compare.
        </div>
      ) : diffResult && (
        <>
          {/* Health score srovnání */}
          {(healthA || healthB) && (
            <div className="grid grid-cols-2 gap-2">
              <HealthScoreCard label="Before" score={healthA} />
              <HealthScoreCard label="After" score={healthB} delta={healthA && healthB ? healthB.total - healthA.total : undefined} />
            </div>
          )}

          {/* Souhrn */}
          <div className="flex gap-3 text-[10px] p-2 rounded bg-card border border-border">
            <span className="text-success">+{diffResult.summary.added} added</span>
            <span className="text-danger">−{diffResult.summary.removed} removed</span>
            <span className="text-warning">~{diffResult.summary.changed} changed</span>
            {diffResult.summary.breaking > 0 && (
              <span className="text-danger font-semibold ml-auto">{diffResult.summary.breaking} breaking change(s)</span>
            )}
          </div>

          {/* Seznam změn */}
          {diffResult.node_changes.length === 0 && diffResult.edge_changes.length === 0 && diffResult.param_changes.length === 0 ? (
            <div className="text-center py-6 text-white/30 text-xs">Graphs are identical.</div>
          ) : (
            <div className="flex flex-col gap-1 max-h-96 overflow-auto">
              {[...diffResult.node_changes, ...diffResult.edge_changes].map((c, i) => (
                <div key={`nc-${i}`} className={`text-[11px] px-2 py-1 rounded bg-card border border-border ${SEVERITY_COLOR[c.severity]}`}>
                  {formatDiffChange(c)}
                </div>
              ))}
              {diffResult.param_changes.map((c, i) => (
                <div key={`pc-${i}`} className={`text-[11px] px-2 py-1 rounded bg-card border border-border ${SEVERITY_COLOR[c.severity]}`}>
                  {c.node_id}.{c.field}: {String(c.old_value)} → {String(c.new_value)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function HealthScoreCard({ label, score, delta }: { label: string; score: HealthScore | null; delta?: number }) {
  return (
    <div className="p-2.5 rounded-lg border border-border bg-card text-center">
      <div className="text-[9px] text-muted uppercase tracking-wider mb-1">{label}</div>
      {score ? (
        <>
          <div className="text-lg font-semibold text-white">{score.total.toFixed(0)}</div>
          {delta !== undefined && (
            <div className={`text-[10px] ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-white/30">could not simulate</div>
      )}
    </div>
  )
}
