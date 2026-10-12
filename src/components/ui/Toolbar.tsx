// Toolbar.tsx — Horní lišta nástrojů: nový graf, otevřít, uložit, nastavení simulace

import { useState, useEffect, useRef } from 'react'
import { platform } from '../../platform'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { exportGSSJson } from '../../core/exporters/json'
import { normalizeGraph } from '../../core/GraphNormalizer'
import { validate } from '../../core/GraphValidator'
import { TEMPLATE_LIST, getTemplate } from '../../core/GraphTemplates'
import { TemplateWizardModal } from './TemplateWizardModal'
import { AIGeneratorModal } from './AIGeneratorModal'
import { useGuardedReplace } from './useGuardedReplace'
import { safeFileBaseName } from './fileName'
import { NumericInput } from './NumericInput'

interface ToolbarProps {
  onRun: () => void
  isRunning: boolean
}

export function Toolbar({ onRun, isRunning }: ToolbarProps) {
  const { graph, isDirty, setGraph, newGraph, setName, markClean, undo, redo, canUndo, canRedo } = useGraphStore()
  const { scenario, setScenario } = useSimulationStore()
  const [status, setStatus] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false)
  const { guard, dialog: confirmDialog } = useGuardedReplace()
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showStatus(text: string, ms = 3000) {
    setStatus(text)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(null), ms)
  }
  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current) }, [])

  /** Replaces the graph and clears results/issues that belonged to the previous one. */
  function loadGraph(g: Parameters<typeof setGraph>[0]) {
    setGraph(g)
    useSimulationStore.getState().reset()
    useSimulationStore.getState().setIssues(validate(useGraphStore.getState().graph))
  }

  // Varovat při zavíraní okna s neuloženými změnami
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (useGraphStore.getState().isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  function handleNew() {
    guard(() => {
      newGraph()
      useSimulationStore.getState().reset()
      showStatus('New graph created', 2000)
    }, 'Discard current graph?')
  }

  async function handleOpen() {
    try {
      const result = await platform.openFile(['gss', 'json'])
      if (!result) return
      let parsed: unknown
      try {
        parsed = JSON.parse(result.content)
      } catch {
        showStatus('Error: the file is not valid JSON.', 6000)
        return
      }
      // Normalizace (chybějící name/label/data…) — dřív se soubor načetl tak,
      // jak byl, a neúplný graf shodil editor nebo Save.
      const g = normalizeGraph(parsed, result.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Opened Graph')
      guard(() => {
        loadGraph(g)
        const errors = useSimulationStore.getState().issues.filter((i) => i.severity === 'ERROR').length
        showStatus(errors > 0 ? `Opened: ${g.name} — ${errors} validation error(s), see Issues` : `Opened: ${g.name}`, errors > 0 ? 6000 : 3000)
      }, 'Open another graph?')
    } catch (err) {
      showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 6000)
    }
  }

  async function handleSave() {
    try {
      const content = exportGSSJson(graph)
      const savedName = await platform.saveFile(['gss'], `${safeFileBaseName(graph.name)}.gss`, content)
      if (!savedName) return
      // Dřív se po uložení nikdy nezavolalo markClean() → "● Unsaved" a
      // varování při zavírání zůstávaly i po úspěšném uložení.
      markClean()
      showStatus(`Saved: ${savedName.split(/[\\/]/).pop()}`)
    } catch (err) {
      showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 6000)
    }
  }

  // Klávesové zkratky — handlery přes ref, aby listener vždy volal aktuální
  // verzi (dřív `handleNew` chyběl v závislostech efektu → stará closure).
  const handlers = useRef({ undo, redo, onRun, handleNew, handleSave, handleOpen })
  handlers.current = { undo, redo, onRun, handleNew, handleSave, handleOpen }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      const h = handlers.current
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); h.undo() }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); h.redo() }
      else if (key === 'r') { e.preventDefault(); h.onRun() }
      else if (key === 'n') { e.preventDefault(); h.handleNew() }
      else if (key === 's') { e.preventDefault(); void h.handleSave() }
      else if (key === 'o') { e.preventDefault(); void h.handleOpen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border shrink-0 flex-wrap">
      {/* Název grafu */}
      <div className="flex items-center gap-1 mr-2">
        {editingName ? (
          <input
            type="text"
            value={graph.name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (!graph.name.trim()) setName('Untitled Economy'); setEditingName(false) }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            autoFocus
            className="px-2 py-0.5 bg-bg border border-accent rounded text-xs text-white focus:outline-none w-40"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-xs text-white/70 hover:text-white transition-colors truncate max-w-[160px] flex items-center gap-1"
            title="Click to rename"
          >
            {graph.name}
            {isDirty && <span className="text-accent text-[10px]" title="Unsaved changes">●</span>}
          </button>
        )}
      </div>

      <div className="w-px h-4 bg-border" />

      {/* Soubor */}
      <div className="relative">
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className="toolbar-btn"
          title="New graph from template"
        >
          + Template
        </button>
        {showTemplates && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded shadow-lg min-w-[180px]">
            {TEMPLATE_LIST.map((t) => (
              <button
                key={t.id}
                className="w-full text-left px-3 py-1.5 text-xs text-white/80 hover:bg-accent/20 hover:text-white transition-colors"
                title={t.description}
                onClick={() => {
                  setShowTemplates(false)
                  const g = getTemplate(t.id)
                  if (g) guard(() => loadGraph(g), `Replace the current graph with "${t.name}"?`)
                }}
              >
                {t.name}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-accent/20 transition-colors"
                onClick={() => { setShowTemplates(false); setWizardOpen(true) }}
              >
                🪄 Open wizard (customize)…
              </button>
            </div>
          </div>
        )}
      </div>
      {platform.supportsAiGenerator && (
        <button onClick={() => setAiGeneratorOpen(true)} className="toolbar-btn text-accent/90" title="AI Economy Generator">
          ✨ AI
        </button>
      )}
      <button onClick={handleNew} className="toolbar-btn" title="New graph (Ctrl+N)">New</button>
      <button onClick={handleOpen} className="toolbar-btn" title="Open .gss/.json (Ctrl+O)">Open</button>
      <button onClick={handleSave} className="toolbar-btn" title="Save as .gss (Ctrl+S)">Save</button>

      <div className="w-px h-4 bg-border" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="toolbar-btn disabled:opacity-30"
      >↩</button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
        className="toolbar-btn disabled:opacity-30"
      >↪</button>

      <div className="w-px h-4 bg-border" />

      {/* Nastavení simulace */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted" title="0 = use the project seed (or a random one if that is 0)">Seed:</span>
        <NumericInput
          value={scenario.seed_override}
          onCommit={(v) => setScenario({ seed_override: v })}
          min={0}
          max={4294967295}
          integer
          className="w-20 px-2 py-0.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted">Duration (s):</span>
        <NumericInput
          value={scenario.duration}
          onCommit={(v) => setScenario({ duration: v })}
          min={0.01}
          max={1000000}
          className="w-20 px-2 py-0.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div className="w-px h-4 bg-border" />

      {/* Spustit simulaci */}
      <button
        onClick={onRun}
        disabled={isRunning}
        title="Run simulation (Ctrl+R)"
        className="px-3 py-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs rounded font-semibold transition-colors"
      >
        {isRunning ? '⏳ Running…' : '▶ Run'}
      </button>

      {/* Stavový řádek */}
      {status && (
        <span className="text-[10px] text-muted ml-auto">{status}</span>
      )}

      {confirmDialog}
      <TemplateWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} />
      {platform.supportsAiGenerator && (
        <AIGeneratorModal
          open={aiGeneratorOpen}
          onClose={() => setAiGeneratorOpen(false)}
          onOpenSettings={() => document.dispatchEvent(new CustomEvent('gss:open-settings', { detail: 'ai' }))}
        />
      )}
    </div>
  )
}
