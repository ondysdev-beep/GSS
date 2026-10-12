// useAutoSave.ts — Auto-saves the graph to localStorage while it has unsaved changes.
//
// Interval comes from Settings → "Auto-save interval" (0 = disabled). It is a
// real interval, not a debounce: the previous version restarted a 30 s timer
// on every edit, so during continuous editing nothing was ever saved. The
// graph is also saved when the window is hidden/closed (best effort).

import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useSettingsStore } from '../store/settingsStore'

const AUTOSAVE_KEY = 'gss_autosave'

let lastSavedJson: string | null = null

function saveNow(): void {
  const { graph, isDirty } = useGraphStore.getState()
  if (!isDirty) return
  try {
    const json = JSON.stringify(graph)
    if (json === lastSavedJson) return
    localStorage.setItem(AUTOSAVE_KEY, json)
    lastSavedJson = json
  } catch {
    // localStorage full or unavailable
  }
}

export function useAutoSave() {
  const intervalMs = useSettingsStore((s) => s.settings.autoSaveIntervalMs)

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return
    const timer = setInterval(saveNow, Math.max(intervalMs, 1000))
    const onHide = () => { if (document.visibilityState === 'hidden') saveNow() }
    window.addEventListener('pagehide', saveNow)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', saveNow)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [intervalMs])
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
  lastSavedJson = null
}
