// SampleGalleryPanel.tsx — Galerie 12 vzorových projektů s načítáním
import { useState } from 'react'
import { SAMPLES, getCategories, loadSample } from '../../core/SampleGallery'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import type { GSSGraph } from '../../types/graph'
import type { SampleMeta } from '../../core/SampleGallery'

const CATEGORY_COLORS: Record<string, string> = {
  Idle:     'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RPG:      'bg-blue-500/20   text-blue-400   border-blue-500/30',
  Gacha:    'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Mobile:   'bg-green-500/20  text-green-400  border-green-500/30',
  F2P:      'bg-pink-500/20   text-pink-400   border-pink-500/30',
  Strategy: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Survival: 'bg-red-500/20    text-red-400    border-red-500/30',
}

function CategoryBadge({ cat }: { cat: string }) {
  const cls = CATEGORY_COLORS[cat] ?? 'bg-border text-muted border-border'
  return (
    <span className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded border ${cls}`}>
      {cat}
    </span>
  )
}

export function SampleGalleryPanel({ onClose }: { onClose?: () => void }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setGraph  = useGraphStore((s) => s.setGraph)
  const resetSim  = useSimulationStore((s) => s.reset)

  const categories = getCategories()
  const filtered = activeCategory
    ? SAMPLES.filter((s) => s.category === activeCategory)
    : SAMPLES

  async function handleLoad(sample: SampleMeta) {
    if (loading) return
    setLoading(sample.file)
    setError(null)
    try {
      const data = await loadSample(sample.file) as GSSGraph
      setGraph(data)
      resetSim()
      onClose?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/80">Sample Projects ({SAMPLES.length})</h2>
        {onClose && (
          <button onClick={onClose} className="text-muted hover:text-white text-lg leading-none">×</button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activeCategory === null ? 'bg-accent text-white' : 'text-muted hover:text-white hover:bg-border'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeCategory === cat ? 'bg-accent text-white' : 'text-muted hover:text-white hover:bg-border'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">{error}</div>
      )}

      {/* Sample grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 overflow-auto">
        {filtered.map((sample) => (
          <div
            key={sample.file}
            className="flex flex-col gap-2 p-3 bg-card rounded-lg border border-border hover:border-accent/50 transition-colors cursor-pointer group"
            onClick={() => handleLoad(sample)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{sample.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-white group-hover:text-accent transition-colors">
                    {sample.name}
                  </div>
                  <div className="text-[9px] text-muted">{sample.nodes} nodes</div>
                </div>
              </div>
              <CategoryBadge cat={sample.category} />
            </div>

            <p className="text-[10px] text-muted leading-relaxed">{sample.description}</p>

            <div className="text-[9px] text-white/40 italic border-t border-border/50 pt-1.5">
              {sample.expected}
            </div>

            <button
              disabled={loading === sample.file}
              className="mt-auto px-2 py-1 text-[10px] bg-accent/20 hover:bg-accent text-accent hover:text-white rounded transition-colors disabled:opacity-50 w-full"
            >
              {loading === sample.file ? '⏳ Loading…' : '↗ Load project'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
