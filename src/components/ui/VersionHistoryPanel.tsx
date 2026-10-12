// VersionHistoryPanel.tsx — Browse and restore graph snapshots

import { useState } from 'react'
import { loadHistory, saveSnapshot, clearHistory } from '../../hooks/useVersionHistory'
import type { VersionSnapshot } from '../../hooks/useVersionHistory'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { ConfirmDialog } from './ConfirmDialog'

type PendingAction =
  | { kind: 'restore'; snap: VersionSnapshot }
  | { kind: 'clear' }

export function VersionHistoryPanel() {
  const [snapshots, setSnapshots] = useState(() => loadHistory())
  const { graph, setGraph }       = useGraphStore()
  const resetSim                  = useSimulationStore((s) => s.reset)
  // Vlastní ConfirmDialog místo nativního confirm() (stejně jako zbytek UI, audit R-17)
  const [pending, setPending]     = useState<PendingAction | null>(null)

  function refresh() { setSnapshots(loadHistory()) }

  function confirmPending() {
    if (!pending) return
    if (pending.kind === 'restore') {
      setGraph(pending.snap.graph)
      resetSim()
    } else {
      clearHistory()
      refresh()
    }
    setPending(null)
  }

  function saveCurrent() {
    saveSnapshot(graph, `${graph.name} — manual`)
    refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Version History</h3>
        <div className="flex gap-1">
          <button
            onClick={saveCurrent}
            className="px-2 py-1 text-[10px] bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors"
          >
            + Save Snapshot
          </button>
          {snapshots.length > 0 && (
            <button
              onClick={() => setPending({ kind: 'clear' })}
              className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 text-white/40 rounded transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Snapshot list */}
      {snapshots.length === 0 ? (
        <div className="text-center py-8 text-white/30 text-sm">
          <div className="text-2xl mb-2">🕐</div>
          No snapshots yet. Click "Save Snapshot" — while you edit, an automatic snapshot is also taken every 5 minutes.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {snapshots.map((snap, i) => {
            const date = new Date(snap.timestamp)
            const nodeCount = snap.graph.nodes?.length ?? 0
            const edgeCount = snap.graph.connections?.length ?? 0
            return (
              <div
                key={`${snap.timestamp}-${i}`}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:border-white/20 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{snap.label}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-white/30 font-mono">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[9px] text-white/20">·</span>
                    <span className="text-[9px] text-white/30">{nodeCount} nodes · {edgeCount} edges</span>
                  </div>
                </div>
                <button
                  onClick={() => setPending({ kind: 'restore', snap })}
                  className="px-2 py-1 text-[10px] bg-white/5 hover:bg-accent/20 hover:text-accent text-white/40 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                >
                  Restore
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[9px] text-white/20 text-center">
        Up to 20 snapshots stored locally. Snapshots persist across sessions.
      </p>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'clear' ? 'Clear all snapshots?' : 'Restore this snapshot?'}
        message={pending?.kind === 'restore'
          ? `"${pending.snap.label}" from ${new Date(pending.snap.timestamp).toLocaleString()} will replace the current graph.`
          : 'All saved snapshots will be deleted. This cannot be undone.'}
        confirmLabel={pending?.kind === 'clear' ? 'Clear all' : 'Restore'}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
