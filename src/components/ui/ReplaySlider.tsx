// ReplaySlider — scrubs through simulation time_series with Play/Pause/Step/Speed

import { useEffect } from 'react'
import { useSimulationStore } from '../../store/simulationStore'

const SPEEDS = [0.5, 1, 2, 5] as const

export function ReplaySlider() {
  const reportA        = useSimulationStore((s) => s.reportA)
  const replayTick     = useSimulationStore((s) => s.replayTick)
  const isPlaying      = useSimulationStore((s) => s.isPlaying)
  const playbackSpeed  = useSimulationStore((s) => s.playbackSpeed)
  const setReplayTick  = useSimulationStore((s) => s.setReplayTick)
  const setPlaying     = useSimulationStore((s) => s.setPlaying)
  const setPlaybackSpeed = useSimulationStore((s) => s.setPlaybackSpeed)

  // Auto-advance when playing
  useEffect(() => {
    if (!isPlaying || !reportA) return
    const ts      = reportA.time_series
    const maxTime = ts[ts.length - 1].time
    const dt      = reportA.scenario.dt
    const ms      = (dt / playbackSpeed) * 1000
    const timer   = setInterval(() => {
      const current = useSimulationStore.getState().replayTick
      const next = current + dt
      if (next >= maxTime) { setPlaying(false); setReplayTick(maxTime); return }
      setReplayTick(next)
    }, ms)
    return () => clearInterval(timer)
  }, [isPlaying, playbackSpeed, reportA, setReplayTick, setPlaying])

  if (!reportA || reportA.time_series.length === 0) return null

  const ts      = reportA.time_series
  const maxTime = ts[ts.length - 1].time
  const frame   = ts.find((f) => f.time >= replayTick) ?? ts[ts.length - 1]
  const dt      = reportA.scenario.dt
  const pct     = maxTime > 0 ? (replayTick / maxTime) * 100 : 0

  const maxVals: Record<string, number> = {}
  for (const f of ts)
    for (const [id, v] of Object.entries(f.pools))
      if (!maxVals[id] || v > maxVals[id]) maxVals[id] = v

  return (
    <div className="flex flex-col gap-2 p-3 border-t border-border bg-card">
      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Play/Pause */}
        <button
          onClick={() => {
            if (replayTick >= maxTime) setReplayTick(0)
            setPlaying(!isPlaying)
          }}
          className="w-7 h-7 flex items-center justify-center rounded bg-accent/20 hover:bg-accent/30 text-accent transition-colors text-sm"
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Step back */}
        <button
          onClick={() => setReplayTick(Math.max(0, replayTick - dt))}
          className="w-6 h-6 flex items-center justify-center rounded bg-card border border-border hover:border-white/30 text-white/50 hover:text-white transition-colors text-xs"
          title="Step back"
          aria-label="Step back"
        >‹</button>

        {/* Step forward */}
        <button
          onClick={() => setReplayTick(Math.min(maxTime, replayTick + dt))}
          className="w-6 h-6 flex items-center justify-center rounded bg-card border border-border hover:border-white/30 text-white/50 hover:text-white transition-colors text-xs"
          title="Step forward"
          aria-label="Step forward"
        >›</button>

        {/* Stop / reset */}
        <button
          onClick={() => { setPlaying(false); setReplayTick(0) }}
          className="w-6 h-6 flex items-center justify-center rounded bg-card border border-border hover:border-white/30 text-white/50 hover:text-white transition-colors text-xs"
          title="Reset to start"
          aria-label="Reset to start"
        >⏮</button>

        {/* Time display */}
        <span className="flex-1 text-center font-mono text-[10px] text-muted">
          t = <span className="text-white">{frame.time.toFixed(1)}</span> / {maxTime.toFixed(0)} s
        </span>

        {/* Speed selector */}
        <div className="flex gap-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setPlaybackSpeed(s)}
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                playbackSpeed === s
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-card border border-border text-white/40 hover:text-white/70'
              }`}
            >{s}×</button>
          ))}
        </div>
      </div>

      {/* Progress bar / scrubber */}
      <div className="relative">
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-none"
            style={{ width: `${pct.toFixed(2)}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={maxTime}
          step={dt}
          value={replayTick}
          onChange={(e) => { setPlaying(false); setReplayTick(Number(e.target.value)) }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-1"
        />
      </div>

      {/* Pool snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
        {Object.entries(frame.pools).map(([id, amount]) => {
          const p = maxVals[id] > 0 ? amount / maxVals[id] : 0
          return (
            <div key={id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[9px] text-muted">
                <span className="truncate max-w-[80px]">{id}</span>
                <span className="font-mono text-white/70">{amount.toFixed(1)}</span>
              </div>
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-150"
                  style={{ width: `${Math.min(100, p * 100).toFixed(1)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
