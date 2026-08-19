// platform/index.ts — vybere správný adaptér podle prostředí.
//
// `VITE_PLATFORM` je build-time proměnná (nastavovaná `npm run build:web`,
// viz Fáze 4) — díky tomu, že jde o `import.meta.env.*` hodnotu, ji Vite
// při buildu nahradí doslovným řetězcem a bundler pak dokáže z výsledného
// web bundlu úplně vyloučit `tauri.ts` i celé `@tauri-apps/*` závislosti
// (mrtvá větev po constant-foldingu). Když proměnná není nastavená (dnešní
// `npm run dev`/`npm run build` pro desktop, beze změny), spadne to na
// detekci za běhu — nic se pro současný Tauri flow neláme.
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
