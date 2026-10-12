// platform/web.ts — webová implementace. Žádné Tauri API, jen browser
// standardy (File API, Blob download).
//
// FREE/PRO na webu je čistě build-time rozhodnutí (VITE_EDITION env
// proměnná nastavená při `npm run build:web`) — žádný runtime licenční
// klíč nikde v GSS (ani na desktopu) neexistuje.

import type {
  PlatformAdapter, OpenFileResult, AppUpdateInfo,
} from './types'
import { PlatformUnsupportedError } from './types'

// Klíč, pod kterým starší verze ukládaly Anthropic API klíč do localStorage.
// AI Generator na webu nefunguje (chybí CORS proxy), takže tam klíč nemá co
// dělat — clearAnthropicApiKey() ho jen uklidí.
const LEGACY_AI_KEY_STORAGE = 'gss_ai_api_key'

const MIME_TYPES: Record<string, string> = {
  gss: 'application/json',
  json: 'application/json',
  csv: 'text/csv',
  cs: 'text/plain',
  gd: 'text/plain',
  ts: 'text/plain',
  html: 'text/html',
}

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
    // Zavření dialogu bez výběru: moderní prohlížeče posílají událost
    // "cancel" — promise se pak vyřeší na null místo věčného čekání.
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

async function saveFile(extensions: string[], defaultName: string, content: string): Promise<string | null> {
  // Prohlížeč nemá "cestu k souboru" jako desktop — save je vždy stažení
  // do složky Downloads.
  const ext = defaultName.split('.').pop()?.toLowerCase() ?? extensions[0] ?? ''
  const blob = new Blob([content], { type: `${MIME_TYPES[ext] ?? 'application/octet-stream'};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Uvolnit až po spuštění stahování — okamžitý revoke stahování v některých
  // prohlížečích (Firefox, Safari) přerušil.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return defaultName
}

async function getBuildVariant(): Promise<'free' | 'pro'> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return env?.VITE_EDITION === 'pro' ? 'pro' : 'free'
}

async function hasAnthropicApiKey(): Promise<boolean> {
  return false
}

async function saveAnthropicApiKey(_key: string): Promise<void> {
  // Dřív se klíč ukládal do localStorage (čitelný každým skriptem na stránce),
  // přestože ho web nikdy nemohl použít.
  throw new PlatformUnsupportedError('AI Economy Generator (requires a CORS proxy)', 'web')
}

async function clearAnthropicApiKey(): Promise<void> {
  try { localStorage.removeItem(LEGACY_AI_KEY_STORAGE) } catch { /* noop */ }
}

async function generateEconomyGraph(_prompt: string): Promise<string> {
  // Anthropic API neposkytuje CORS hlavičky pro přímé volání z prohlížeče —
  // na desktopu tohle řeší Rust (žádný CORS problém mimo browser). Dokud
  // není nasazený proxy endpoint, AI Generator na webu záměrně chybí.
  throw new PlatformUnsupportedError('AI Economy Generator (requires a CORS proxy)', 'web')
}

async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  // Web nemá žádný "nainstalovaný" stav k aktualizaci — načtení stránky
  // vždy dá nejnovější nasazenou verzi.
  return null
}

async function installAppUpdate(): Promise<void> {
  throw new PlatformUnsupportedError('app auto-update (the web version is always current after a refresh)', 'web')
}

export const webPlatform: PlatformAdapter = {
  name: 'web',
  supportsAiGenerator: false,
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
