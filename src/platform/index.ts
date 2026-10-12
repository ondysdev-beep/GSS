// platform/index.ts — vybere správný adaptér podle prostředí.
//
// `VITE_PLATFORM` je build-time proměnná (nastavovaná `npm run build:web`).
// Když není nastavená (`npm run dev`/`npm run build` pro desktop), spadne
// výběr na detekci za běhu (`__TAURI_INTERNALS__`).
//
// Pozn.: oba adaptéry se importují staticky, takže `@tauri-apps/*` moduly
// jsou i ve webovém bundlu (jen se nevolají) — `detectPlatform()` musí umět
// vrátit kterýkoli adaptér (testy), takže je bundler nemůže vyřadit.
import type { PlatformAdapter } from './types'
import { tauriPlatform } from './tauri'
import { webPlatform } from './web'

const buildTimePlatform = import.meta.env.VITE_PLATFORM as 'tauri' | 'web' | undefined

/** Exportováno zvlášť (ne jen jako interní detail `platform` singletonu) kvůli testovatelnosti bez nutnosti module-reload triků. */
export function detectPlatform(forcedEnv?: 'tauri' | 'web'): PlatformAdapter {
  const env = forcedEnv ?? buildTimePlatform
  if (env === 'web') return webPlatform
  if (env === 'tauri') return tauriPlatform
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  return isTauri ? tauriPlatform : webPlatform
}

export const platform: PlatformAdapter = detectPlatform()

export type { PlatformAdapter, OpenFileResult, AppUpdateInfo } from './types'
export { PlatformUnsupportedError } from './types'
