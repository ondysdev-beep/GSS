// useAutoSave.ts — Auto-saves graph to localStorage every 30s when dirty

import { useEffect, useRef } from 'react'
import { useGraphStore } from '../store/graphStore'

const AUTOSAVE_KEY  = 'gss_autosave'
const AUTOSAVE_MS   = 30_000

export function useAutoSave() {
  const graph   = useGraphStore((s) => s.graph)
  const isDirty = useGraphStore((s) => s.isDirty)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDirty) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(graph))
      } catch {
        // localStorage full or unavailable
      }
    }, AUTOSAVE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [graph, isDirty])
}

export function loadAutoSave(): object | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearAutoSave() {
  try { localStorage.removeItem(AUTOSAVE_KEY) } catch { /* noop */ }
}
