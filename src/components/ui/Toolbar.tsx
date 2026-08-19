// Toolbar.tsx — Horní lišta nástrojů: nový graf, otevřít, uložit, nastavení simulace

import { useState, useEffect, useCallback } from 'react'
import { platform } from '../../platform'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { exportGSSJson } from '../../core/exporters/json'
import type { GSSGraph } from '../../types/graph'
import { TEMPLATE_LIST, getTemplate } from '../../core/GraphTemplates'
import { ConfirmDialog } from './ConfirmDialog'
import { TemplateWizardModal } from './TemplateWizardModal'
import { AIGeneratorModal } from './AIGeneratorModal'

interface ToolbarProps {
  onRun: () => void
  isRunning: boolean
}

export function Toolbar({ onRun, isRunning }: ToolbarProps) {
  const { graph, isDirty, setGraph, newGraph, setName, undo, redo, canUndo, canRedo } = useGraphStore()
  const { scenario, setScenario } = useSimulationStore()
  const [status, setStatus] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [confirmNewOpen, setConfirmNewOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false)

  // Varovat při zavíraní okna s neulozenými změnami
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (isDirty) { e.preventDefault(); e.returnValue = '' }
  }, [isDirty])
  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [handleBeforeUnload])

  // Keyboard shortcuts: Ctrl+Z/Y (undo/redo), Ctrl+R (run), Ctrl+N (new)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); onRun() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); handleNew() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, onRun])

  async function handleOpen() {
    try {
      const result = await platform.openFile(['gss', 'json'])
      if (!result) return
      const parsed = JSON.parse(result.content) as GSSGraph
      setGraph(parsed)
      setStatus(`Opened: ${parsed.name}`)
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleSave() {
    try {
      const content = exportGSSJson(graph)
      const savedName = await platform.saveFile(['gss'], `${graph.name.replace(/\s+/g, '_')}.gss`, content)
      if (!savedName) return
      setStatus(`Saved: ${savedName.split(/[\\/]/).pop()}`)
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function handleNew() {
    if (graph.nodes.length > 0) {
      setConfirmNewOpen(true)
      return
    }
    newGraph()
    setStatus('New graph created')
    setTimeout(() => setStatus(null), 2000)
  }

  function confirmNew() {
    setConfirmNewOpen(false)
    newGraph()
    setStatus('New graph created')
    setTimeout(() => setStatus(null), 2000)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border shrink-0 flex-wrap">
      {/* Název grafu */}
      <div className="flex items-center gap-1 mr-2">
        {editingName ? (
          <input
            type="text"
            value={graph.name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
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
                onClick={() => {
                  const g = getTemplate(t.id)
                  if (g) { setGraph(g); useSimulationStore.getState().reset() }
                  setShowTemplates(false)
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
      <button onClick={() => setAiGeneratorOpen(true)} className="toolbar-btn text-accent/90" title="AI Economy Generator">
        ✨ AI
      </button>
      <button onClick={handleNew} className="toolbar-btn">New</button>
      <button onClick={handleOpen} className="toolbar-btn">Open</button>
      <button onClick={handleSave} className="toolbar-btn">Save</button>

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
        <span className="text-[10px] text-muted">Seed:</span>
        <input
          type="number"
          value={scenario.seed_override}
          onChange={(e) => setScenario({ seed_override: parseInt(e.target.value) || 0 })}
          className="w-20 px-2 py-0.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted">Duration:</span>
        <input
          type="number"
          value={scenario.duration}
          onChange={(e) => setScenario({ duration: parseInt(e.target.value) || 60 })}
          min={1}
          max={100000}
          className="w-20 px-2 py-0.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div className="w-px h-4 bg-border" />

      {/* Spustit simulaci */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className="px-3 py-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs rounded font-semibold transition-colors"
      >
        {isRunning ? '⏳ Running…' : '▶ Run'}
      </button>

      {/* Stavový řádek */}
      {status && (
        <span className="text-[10px] text-muted ml-auto">{status}</span>
      )}

      <ConfirmDialog
        open={confirmNewOpen}
        title="Discard current graph?"
        message="Any unsaved changes to the current graph will be lost. This cannot be undone."
        confirmLabel="Discard & create new"
        onConfirm={confirmNew}
        onCancel={() => setConfirmNewOpen(false)}
      />
      <TemplateWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <AIGeneratorModal
        open={aiGeneratorOpen}
        onClose={() => setAiGeneratorOpen(false)}
        onOpenSettings={() => document.dispatchEvent(new CustomEvent('gss:open-settings', { detail: 'ai' }))}
      />
    </div>
  )
}
