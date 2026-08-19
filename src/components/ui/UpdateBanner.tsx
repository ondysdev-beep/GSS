// UpdateBanner.tsx — real auto-update flow (desktop only).
//
// Nahrazuje starý čistě-informativní banner (core/UpdateChecker.ts +
// VITE_VERSION_MANIFEST_URL), který jen odkazoval na itch.io ke stažení.
// Tohle appku skutečně stáhne a nainstaluje, přes platform.checkForAppUpdate()/
// installAppUpdate() (Tauri updater plugin, viz platform/tauri.ts).
//
// Na webu (`platform.name === 'web'`) se nic nekontroluje ani nezobrazuje —
// web nemá "nainstalovaný" stav, refresh vždy dá nejnovější verzi.
// UpdateChecker.ts zůstává jako je (APP_VERSION/ITCH_URL se používají i
// jinde), jen se z něj přestala volat checkForUpdates() v App.tsx.

import { useState, useEffect } from 'react'
import { platform } from '../../platform'
import type { AppUpdateInfo } from '../../platform'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; info: AppUpdateInfo }
  | { phase: 'downloading'; info: AppUpdateInfo; downloaded: number; total: number }
  | { phase: 'error'; message: string }

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (platform.name !== 'tauri') return
    platform.checkForAppUpdate()
      .then((info) => { if (info) setState({ phase: 'available', info }) })
      .catch(() => {}) // Tichý fail — kontrola aktualizace nesmí appku nikdy blokovat/rušit
  }, [])

  if (platform.name !== 'tauri' || dismissed || state.phase === 'idle') return null

  async function startUpdate() {
    if (state.phase !== 'available') return
    const info = state.info
    setState({ phase: 'downloading', info, downloaded: 0, total: 0 })
    try {
      await platform.installAppUpdate((downloaded, total) => {
        setState({ phase: 'downloading', info, downloaded, total })
      })
      // installAppUpdate() appku restartuje samo — tenhle řádek se v
      // úspěšném případě prakticky nikdy nestihne provést.
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-accent/10 border-b border-accent/30 text-xs shrink-0">
      {state.phase === 'available' && (
        <span className="text-accent flex items-center gap-3">
          🆕 GSS v{state.info.version} is available
          {state.info.notes && <span className="text-white/50 hidden sm:inline">{state.info.notes}</span>}
          <button
            onClick={startUpdate}
            className="px-2 py-0.5 bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors"
          >
            Update now
          </button>
        </span>
      )}

      {state.phase === 'downloading' && (
        <span className="text-accent">
          ⬇ Downloading update…{' '}
          {state.total > 0 && (
            <span className="text-white/50">
              {Math.round((state.downloaded / state.total) * 100)}%
            </span>
          )}
          {' '}— GSS will restart automatically.
        </span>
      )}

      {state.phase === 'error' && (
        <span className="text-danger">Update failed: {state.message}</span>
      )}

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notification"
        className="text-white/40 hover:text-white ml-4"
      >
        ✕
      </button>
    </div>
  )
}
