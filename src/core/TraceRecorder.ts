// TraceRecorder.ts — Tick-by-tick trace recorder for ReplayUI
// Configurable sampling interval. Zero overhead when disabled.
// Ported from TraceRecorder.gd

import type { SimState, TickTrace } from '../types/simulation'

export interface TraceRecorderOptions {
  enabled: boolean
  sampleInterval: number  // record every N ticks (1 = every tick)
}

export class TraceRecorder {
  private _enabled: boolean
  private _sampleInterval: number
  private _traces: TickTrace[] = []

  constructor(options: TraceRecorderOptions = { enabled: true, sampleInterval: 1 }) {
    this._enabled = options.enabled
    this._sampleInterval = Math.max(1, options.sampleInterval)
  }

  reset(): void {
    this._traces = []
  }

  record(state: SimState): void {
    if (!this._enabled) return
    if (state.tick % this._sampleInterval !== 0) return

    this._traces.push({
      tick: state.tick,
      pools: Object.fromEntries(
        Object.entries(state.pools).map(([k, v]) => [k, { ...v }]),
      ),
      gate_states: { ...state.gate_states },
      chance_rolls: Object.fromEntries(
        Object.entries(state.chance_rolls).map(([k, v]) => [k, { ...v }]),
      ),
    })
  }

  getTraces(): TickTrace[] {
    return this._traces
  }

  getTraceAtTick(tick: number): TickTrace | undefined {
    return this._traces.find((t) => t.tick === tick)
  }

  get length(): number {
    return this._traces.length
  }

  toJSON(): string {
    return JSON.stringify({ traces: this._traces }, null, 2)
  }

  static fromJSON(json: string): TraceRecorder {
    const recorder = new TraceRecorder({ enabled: true, sampleInterval: 1 })
    const parsed = JSON.parse(json) as { traces: TickTrace[] }
    recorder._traces = parsed.traces ?? []
    return recorder
  }
}
