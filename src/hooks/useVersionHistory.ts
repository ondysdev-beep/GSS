// useVersionHistory.ts — Stores up to 20 graph snapshots in localStorage

import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import type { GSSGraph } from '../types/graph'

const HISTORY_KEY  = 'gss_version_history'
const MAX_VERSIONS = 20

export interface VersionSnapshot {
  timestamp: string
  label: string
  graph: GSSGraph
}

export function useVersionHistory() {
  const graph   = useGraphStore((s) => s.graph)
  const isDirty = useGraphStore((s) => s.isDirty)

  // Save snapshot whenever simulation runs (isDirty flips to false after manual save)
  // We snapshot on graph name change or every 5 minutes of being dirty
  useEffect(() => {
    if (!isDirty) return
    const timer = setTimeout(() => {
      try {
        const existing = loadHistory()
        const snap: VersionSnapshot = {
          timestamp: new Date().toISOString(),
          label: graph.name,
          graph,
        }
        const updated = [snap, ...existing].slice(0, MAX_VERSIONS)
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
      } catch { /* noop */ }
    }, 5 * 60_000) // 5 minutes
    return () => clearTimeout(timer)
  }, [graph, isDirty])
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
  } catch { /* noop */ }
}

export function loadHistory(): VersionSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY) } catch { /* noop */ }
}
