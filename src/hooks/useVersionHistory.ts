// useVersionHistory.ts — Stores up to 20 graph snapshots in localStorage

import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import type { GSSGraph } from '../types/graph'

const HISTORY_KEY  = 'gss_version_history'
const MAX_VERSIONS = 20
const AUTO_SNAPSHOT_MS = 5 * 60_000

export interface VersionSnapshot {
  timestamp: string
  label: string
  graph: GSSGraph
}

let lastSnapshotJson: string | null = null

/**
 * Takes an automatic snapshot every 5 minutes while the graph has unsaved
 * changes that differ from the previous snapshot. (The old implementation was
 * a debounce — it only fired after 5 minutes WITHOUT any edit, so during
 * active work no snapshot was ever taken.)
 */
export function useVersionHistory() {
  useEffect(() => {
    const timer = setInterval(() => {
      const { graph, isDirty } = useGraphStore.getState()
      if (!isDirty) return
      const json = JSON.stringify(graph)
      if (json === lastSnapshotJson) return
      lastSnapshotJson = json
      saveSnapshot(graph, `${graph.name} — auto`)
    }, AUTO_SNAPSHOT_MS)
    return () => clearInterval(timer)
  }, [])
}

export function saveSnapshot(graph: GSSGraph, label?: string): void {
  try {
    const existing = loadHistory()
    const snap: VersionSnapshot = {
      timestamp: new Date().toISOString(),
      label: label ?? graph.name,
      graph,
    }
    const updated = [snap, ...existing].slice(0, MAX_VERSIONS)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  } catch { /* noop (localStorage full/unavailable) */ }
}

export function loadHistory(): VersionSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    // Poškozené/ručně upravené položky přeskočit, ať nespadne panel historie.
    return Array.isArray(parsed)
      ? parsed.filter((s): s is VersionSnapshot =>
        !!s && typeof s === 'object' && typeof s.timestamp === 'string' &&
        !!s.graph && Array.isArray(s.graph.nodes))
      : []
  } catch {
    return []
  }
}

export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY) } catch { /* noop */ }
}
