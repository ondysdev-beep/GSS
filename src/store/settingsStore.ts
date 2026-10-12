// settingsStore.ts — Persistent user preferences

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppSettings {
  // Editor
  snapToGrid: boolean
  gridSize: number          // px, used when snapToGrid=true
  showMinimap: boolean
  autoSaveIntervalMs: number  // 0 = disabled

  // Simulation defaults (applied to the scenario at startup and when changed in Settings)
  defaultDuration: number   // simulated seconds
  defaultDt: number         // seconds per tick
  defaultSeed: number       // 0 = random seed / project seed

  // Appearance
  edgeStyle: 'default' | 'straight' | 'step'
  showNodeSubtitles: boolean

  // Performance
  performanceMode: boolean   // disables flow labels, heatmap glow, minimap during sim
}

interface SettingsStore {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  reset: () => void
}

const DEFAULTS: AppSettings = {
  snapToGrid: false,
  gridSize: 20,
  showMinimap: true,
  autoSaveIntervalMs: 30_000,
  defaultDuration: 60,
  defaultDt: 1.0,
  defaultSeed: 42,
  edgeStyle: 'default',
  showNodeSubtitles: true,
  performanceMode: false,
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: { ...DEFAULTS },
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: { ...DEFAULTS } }),
    }),
    {
      name: 'gss_settings',
      version: 1,
      // Hluboké sloučení s výchozími hodnotami: výchozí `persist` merge je
      // mělký, takže uložený objekt `settings` z dřívější verze nahradil celý
      // objekt a nově přidaná nastavení (např. performanceMode) byla undefined.
      merge: (persisted, current) => {
        const saved = (persisted as { settings?: Partial<AppSettings> } | undefined)?.settings
        return {
          ...(current as SettingsStore),
          settings: { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) },
        }
      },
      migrate: (persisted) => persisted as SettingsStore,
    },
  ),
)

/** Current settings outside React (e.g. initial store values, timers). */
export function getSettings(): AppSettings {
  return useSettingsStore.getState().settings
}
