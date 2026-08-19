// platform/web.ts — webová implementace. Žádné Tauri API, jen browser
// standardy (File API, Blob download, localStorage).
//
// FREE/PRO na webu je čistě build-time rozhodnutí (VITE_EDITION env
// proměnná nastavená při `npm run build:web`) — žádný runtime licenční
// klíč nikde v GSS (ani na desktopu) neexistuje.

import type {
  PlatformAdapter, OpenFileResult, AppUpdateInfo,
} from './types'
import { PlatformUnsupportedError } from './types'

const AI_KEY_STORAGE = 'gss_ai_api_key'

function openFile(extensions: string[]): Promise<OpenFileResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = extensions.map((e) => `.${e}`).join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => resolve({ path: file.name, content: String(reader.result ?? '') })
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
      reader.readAsText(file)
    }
    // Pokud uživatel dialog zavře bez výběru, žádná událost nepřijde —
    // to je standardní chování <input type="file"> napříč prohlížeči,
    // volající kód (Toolbar/DiffViewerPanel) na "zrušeno" beztak nečeká
    // na promise, takže tohle nezpůsobí zaseknutý stav.
    input.click()
  })
}

async function saveFile(_extensions: string[], defaultName: string, content: string): Promise<string | null> {
  // Prohlížeč nemá "cestu k souboru" jako desktop — save je vždy stažení
  // do složky Downloads. Stejný Blob+<a download> vzor, jaký už používá
  // Web Share export v ExportPanel.tsx (žádná nová technika, jen sdílená).
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  a.click()
  URL.revokeObjectURL(url)
  return defaultName
}

async function getBuildVariant(): Promise<'free' | 'pro'> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.VITE_EDITION === 'pro' ? 'pro' : 'free'
}

async function hasAnthropicApiKey(): Promise<boolean> {
  return !!localStorage.getItem(AI_KEY_STORAGE)
}

async function saveAnthropicApiKey(key: string): Promise<void> {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('API key cannot be empty.')
  localStorage.setItem(AI_KEY_STORAGE, trimmed)
}

async function clearAnthropicApiKey(): Promise<void> {
  localStorage.removeItem(AI_KEY_STORAGE)
}

async function generateEconomyGraph(_prompt: string): Promise<string> {
  // Anthropic API neposkytuje CORS hlavičky pro přímé volání z prohlížeče —
  // na desktopu tohle řešil Rust (žádný CORS problém mimo browser). Dokud
  // není nasazený proxy endpoint (viz sdk/README.md sekce "Web verze"),
  // AI Generator na webu záměrně chybí, ne že by tiše nefungoval.
  throw new PlatformUnsupportedError('AI Economy Generator (requires a CORS proxy)', 'web')
}

async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  // Web nemá žádný "nainstalovaný" stav k aktualizaci — načtení stránky
  // vždy dá nejnovější nasazenou verzi. Vrátit null (žádná dostupná
  // aktualizace) je tu skutečná odpověď, ne placeholder.
  return null
}

async function installAppUpdate(): Promise<void> {
  throw new PlatformUnsupportedError('app auto-update (the web version is always current after a refresh)', 'web')
}

export const webPlatform: PlatformAdapter = {
  name: 'web',
  openFile,
  saveFile,
  getBuildVariant,
  hasAnthropicApiKey,
  saveAnthropicApiKey,
  clearAnthropicApiKey,
  generateEconomyGraph,
  checkForAppUpdate,
  installAppUpdate,
}
