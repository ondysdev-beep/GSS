// AIGeneratorModal.tsx — AI Economy Generator (Fáze 7 nových funkcí).
//
// Stejný overlay pattern jako TemplateWizardModal/ConfirmDialog. Pokud
// uživatel nemá nastavený API klíč, panel ho rovnou nasměruje do Settings
// → AI Generator místo prázdného formuláře, který by stejně jen selhal.

import { useState, useEffect, useRef } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { hasAnthropicApiKey, generateEconomyGraph, EconomyGenerationError } from '../../core/EconomyGenerator'
import { useGuardedReplace } from './useGuardedReplace'

interface AIGeneratorModalProps {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
}

const EXAMPLE_PROMPTS = [
  'Idle mobile game with a soft currency, a premium currency, and an upgrade that boosts production',
  'RPG loot economy: enemies drop loot with rarity tiers (common/rare/legendary)',
  'Gacha system with pity counter approximation and two currencies',
]

export function AIGeneratorModal({ open, onClose, onOpenSettings }: AIGeneratorModalProps) {
  const setGraph = useGraphStore((s) => s.setGraph)
  const resetSim = useSimulationStore((s) => s.reset)

  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { guard, dialog: confirmDialog } = useGuardedReplace()

  // Oprava B3: zavření modalu (backdrop klik / ✕) během běžícího generování
  // dřív nezrušilo probíhající `await generateEconomyGraph(...)` — když
  // request později doběhl, `setGraph()` potichu přepsal aktuální graf,
  // i když uživatel dialog už dávno zavřel. `cancelledRef` označí výsledek
  // jako zahozený namísto skutečného zrušení requestu (Tauri invoke ani
  // fetch tady AbortController nepodporují) — nejmenší oprava, co stačí.
  //
  // Číslo požadavku navíc: když uživatel dialog zavře, znovu otevře a spustí
  // nové generování dřív, než doběhne staré, starý výsledek už nesmí vyhrát
  // (samotný boolean se novým generováním vynuloval).
  const cancelledRef = useRef(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (open) hasAnthropicApiKey().then(setKeyConfigured).catch(() => setKeyConfigured(false))
  }, [open])

  // Potvrzovací dialog musí přežít zavření modalu (zavírá se hned po vygenerování).
  if (!open) return confirmDialog

  function handleClose() {
    cancelledRef.current = true
    requestIdRef.current++
    setPrompt('')
    setError(null)
    setLoading(false)
    onClose()
  }

  async function generate() {
    if (!prompt.trim()) return
    cancelledRef.current = false
    const requestId = ++requestIdRef.current
    const isStale = () => cancelledRef.current || requestId !== requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const graph = await generateEconomyGraph(prompt.trim())
      if (isStale()) return  // dialog mezitím zavřen / spuštěn novější požadavek — výsledek zahodit
      handleClose()
      guard(() => {
        setGraph(graph)
        resetSim()
      }, `Replace the current graph with "${graph.name}"?`)
    } catch (err) {
      if (isStale()) return
      setError(err instanceof EconomyGenerationError ? err.message : `Generation failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (!isStale()) setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-generator-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="ai-generator-title" className="text-sm font-semibold text-white">✨ AI Economy Generator</h2>
          <button onClick={handleClose} aria-label="Close" className="text-white/30 hover:text-white text-lg leading-none">✕</button>
        </div>

        {keyConfigured === false ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/50">
              The AI generator needs your own Anthropic API key (GSS has no AI backend of its own — see settings).
            </p>
            <button
              onClick={() => { handleClose(); onOpenSettings() }}
              className="self-start px-3 py-1.5 text-xs bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors"
            >
              Open Settings → AI Generator
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] text-muted">Describe the economy you want to generate:</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={EXAMPLE_PROMPTS[0]}
              disabled={loading}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-accent/50 transition-colors resize-none disabled:opacity-50"
            />

            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  disabled={loading}
                  className="px-2 py-1 text-[9px] text-white/40 hover:text-white/70 border border-border rounded transition-colors disabled:opacity-50"
                >
                  {ex.length > 40 ? ex.slice(0, 40) + '…' : ex}
                </button>
              ))}
            </div>

            {error && <div className="text-[10px] text-danger">{error}</div>}

            <div className="flex justify-end">
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="px-4 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors disabled:opacity-40"
              >
                {loading ? 'Generating…' : 'Generate graph'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
