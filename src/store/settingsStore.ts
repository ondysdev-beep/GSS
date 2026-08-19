// settingsStore.ts — Persistent user preferences

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppSettings {
  // Editor
  snapToGrid: boolean
  gridSize: number          // px, used when snapToGrid=true
  showMinimap: boolean
  autoSaveIntervalMs: number  // 0 = disabled

  // Simulation defaults
  defaultDuration: number
  defaultDt: number
  defaultSeed: number

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
    { name: 'gss_settings' },
  ),
)
