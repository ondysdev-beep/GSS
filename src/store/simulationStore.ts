// simulationStore.ts — Zustand store for simulation state and results

import { create } from 'zustand'
import type {
  RunReport,
  Scenario,
  VerdictReport,
  CompareReport,
  MCReport,
  ValidationIssue,
} from '../types/simulation'
import { defaultScenario } from '../types/simulation'

interface SimulationStore {
  // Scenario konfigurace
  scenario: Scenario

  // Stav běhu
  isRunning: boolean
  progress: number       // 0–1

  // Výsledky
  reportA: RunReport | null
  reportB: RunReport | null         // pro A/B porovnání
  compareReport: CompareReport | null
  verdictReport: VerdictReport | null
  mcReport: MCReport | null

  // Replay
  replayTick: number
  isPlaying: boolean
  playbackSpeed: number   // 1 = real-time, 2 = 2x, etc.

  // Validační problémy a chyby
  issues: ValidationIssue[]
  error: string | null

  // Akce
  setScenario: (s: Partial<Scenario>) => void
  setRunning: (running: boolean) => void
  setProgress: (progress: number) => void
  setReportA: (r: RunReport) => void
  setReportB: (r: RunReport) => void
  setCompareReport: (r: CompareReport | null) => void
  setVerdictReport: (r: VerdictReport | null) => void
  setMCReport: (r: MCReport | null) => void
  setReplayTick: (tick: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setIssues: (issues: ValidationIssue[]) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  scenario: defaultScenario(),
  isRunning: false,
  progress: 0,
  reportA: null,
  reportB: null,
  compareReport: null,
  verdictReport: null,
  mcReport: null,
  replayTick: 0,
  isPlaying: false,
  playbackSpeed: 1,
  issues: [],
  error: null,

  setScenario: (s) => set((st) => ({ scenario: { ...st.scenario, ...s } })),
  setRunning: (isRunning) => set({ isRunning }),
  setProgress: (progress) => set({ progress }),
  setReportA: (r) => set({ reportA: r, replayTick: 0, isPlaying: false, error: null }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setReportB: (r) => set({ reportB: r }),
  setCompareReport: (r) => set({ compareReport: r }),
  setVerdictReport: (r) => set({ verdictReport: r }),
  setMCReport: (r) => set({ mcReport: r }),
  setReplayTick: (replayTick) => set({ replayTick }),

  setIssues: (issues) => set({ issues }),
  setError: (error) => set({ error, isRunning: false }),
  reset: () => set({
    isRunning: false,
    progress: 0,
    reportA: null,
    reportB: null,
    compareReport: null,
    verdictReport: null,
    mcReport: null,
    replayTick: 0,
    isPlaying: false,
    playbackSpeed: 1,
    issues: [],
    error: null,
  }),
}))
