// platform/tauri.ts — desktop implementace. Tenký wrapper nad Tauri API,
// které dnes komponenty volaly přímo — chování je 1:1 stejné jako dřív,
// jen přesunuté sem, aby komponenty nemusely vědět, že běží na Tauri.

import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { check as checkTauriUpdate, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import type {
  PlatformAdapter, OpenFileResult, AppUpdateInfo,
} from './types'

async function openFile(extensions: string[]): Promise<OpenFileResult | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'GSS Graph', extensions }],
  })
  if (!selected || typeof selected !== 'string') return null
  const content = await invoke<string>('open_file', { path: selected })
  return { path: selected, content }
}

async function saveFile(extensions: string[], defaultName: string, content: string): Promise<string | null> {
  const savePath = await save({
    filters: [{ name: 'GSS Graph', extensions }],
    defaultPath: defaultName,
  })
  if (!savePath) return null
  await invoke('save_file', { path: savePath, content })
  return savePath
}

async function getBuildVariant(): Promise<'free' | 'pro'> {
  const variant = await invoke<string>('get_build_variant')
  return variant === 'pro' ? 'pro' : 'free'
}

async function hasAnthropicApiKey(): Promise<boolean> {
  return invoke<boolean>('has_anthropic_api_key')
}

async function saveAnthropicApiKey(key: string): Promise<void> {
  await invoke('save_anthropic_api_key', { key })
}

async function clearAnthropicApiKey(): Promise<void> {
  await invoke('clear_anthropic_api_key')
}

async function generateEconomyGraph(prompt: string): Promise<string> {
  return invoke<string>('generate_economy_graph', { prompt })
}

// Drží referenci na Update objekt mezi check → install voláním. Tauri
// updateru vrací plugin z `check()` samotný objekt s metodou
// `.downloadAndInstall()` — to musí být TA SAMA instance, ne nový dotaz,
// takže si ji tady schováváme jako modulový stav (jednoduché a dostačující,
// appka v jednu chvíli řeší jen jednu aktualizaci).
let pendingUpdate: Update | null = null

async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  const update = await checkTauriUpdate()
  if (!update) {
    pendingUpdate = null
    return null
  }
  pendingUpdate = update
  return { version: update.version, notes: update.body ?? '' }
}

async function installAppUpdate(onProgress?: (downloaded: number, total: number) => void): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('No update available — call checkForAppUpdate() first.')
  }
  let downloaded = 0
  let total = 0
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      onProgress?.(downloaded, total)
    }
  })
  pendingUpdate = null
  await relaunch()
}

export const tauriPlatform: PlatformAdapter = {
  name: 'tauri',
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
