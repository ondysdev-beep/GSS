// CommandPalette.tsx — Ctrl+K fuzzy search for all actions

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'
import { GITHUB_URL } from '../../core/UpdateChecker'

export interface PaletteAction {
  id: string
  label: string
  description?: string
  icon: string
  category: string
  shortcut?: string
  run: () => void
}

interface Props {
  onRun: () => void
  onTabChange: (tab: string) => void
  onLibTabChange: (tab: string) => void
}

export function CommandPalette({ onRun, onTabChange, onLibTabChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { newGraph, undo, redo, canUndo, canRedo } = useGraphStore()
  const reset = useSimulationStore((s) => s.reset)

  // Build action list
  const ACTIONS: PaletteAction[] = [
    { id: 'run', icon: '▶', category: 'Simulation', label: 'Run Simulation', shortcut: 'Ctrl+R', run: () => { onRun(); setOpen(false) } },
    { id: 'reset-sim', icon: '↺', category: 'Simulation', label: 'Reset Simulation Results', run: () => { reset(); setOpen(false) } },
    { id: 'new', icon: '⊕', category: 'Graph', label: 'New Graph', shortcut: 'Ctrl+N', run: () => { newGraph(); setOpen(false) } },
    { id: 'undo', icon: '↩', category: 'Graph', label: 'Undo', shortcut: 'Ctrl+Z', run: () => { undo(); setOpen(false) }, description: canUndo ? 'Available' : 'Nothing to undo' },
    { id: 'redo', icon: '↪', category: 'Graph', label: 'Redo', shortcut: 'Ctrl+Y', run: () => { redo(); setOpen(false) }, description: canRedo ? 'Available' : 'Nothing to redo' },
    { id: 'tab-editor', icon: '⬡', category: 'Navigate', label: 'Go to Editor', run: () => { onTabChange('editor'); setOpen(false) } },
    { id: 'tab-analysis', icon: '◎', category: 'Navigate', label: 'Go to Analysis', run: () => { onTabChange('analysis'); setOpen(false) } },
    { id: 'tab-tuner', icon: '⚙', category: 'Navigate', label: 'Go to AutoTuner', run: () => { onTabChange('tuner'); setOpen(false) } },
    { id: 'tab-library', icon: '⊖', category: 'Navigate', label: 'Go to Library', run: () => { onTabChange('library'); setOpen(false) } },
    { id: 'lib-samples', icon: '📂', category: 'Library', label: 'Browse Sample Projects', run: () => { onTabChange('library'); onLibTabChange('samples'); setOpen(false) } },
    { id: 'lib-export', icon: '↗', category: 'Library', label: 'Export Graph', run: () => { onTabChange('library'); onLibTabChange('export'); setOpen(false) } },
    { id: 'lib-license', icon: '🔑', category: 'Library', label: 'Manage License', run: () => { onTabChange('library'); onLibTabChange('license'); setOpen(false) } },
    { id: 'github', icon: '⭐', category: 'Links', label: 'Star GSS on GitHub', description: GITHUB_URL, run: () => { window.open(GITHUB_URL, '_blank'); setOpen(false) } },
    { id: 'itch', icon: '🎮', category: 'Links', label: 'Get PRO on itch.io', description: 'neopryus.itch.io', run: () => { window.open('https://neopryus.itch.io/idle-economy-simulator', '_blank'); setOpen(false) } },
  ]

  // Fuzzy filter
  const q = query.toLowerCase().trim()
  const filtered = q
    ? ACTIONS.filter((a) =>
      a.label.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q),
    )
    : ACTIONS

  // Keyboard listener for Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQuery('')
        setCursor(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
      setCursor(0)
    }
  }, [open])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); filtered[cursor]?.run() }
  }, [filtered, cursor])

  if (!open) return null

  // Group by category
  const groups: Record<string, PaletteAction[]> = {}
  for (const a of filtered) {
    if (!groups[a.category]) groups[a.category] = []
    groups[a.category].push(a)
  }

  let globalIdx = 0

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-white/30 text-sm">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
          />
          <kbd className="text-[10px] text-white/20 border border-white/10 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-white/30">No results for "{query}"</div>
          ) : (
            Object.entries(groups).map(([category, actions]) => (
              <div key={category}>
                <div className="px-4 py-1 text-[9px] uppercase tracking-widest text-white/20 font-semibold">
                  {category}
                </div>
                {actions.map((action) => {
                  const idx = globalIdx++
                  return (
                    <button
                      key={action.id}
                      onClick={action.run}
                      onMouseEnter={() => setCursor(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${cursor === idx ? 'bg-accent/10 text-white' : 'text-white/70 hover:text-white'
                        }`}
                    >
                      <span className="w-5 text-center text-sm shrink-0 opacity-70">{action.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{action.label}</div>
                        {action.description && (
                          <div className="text-[10px] text-white/30 truncate">{action.description}</div>
                        )}
                      </div>
                      {action.shortcut && (
                        <kbd className="text-[9px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 shrink-0">
                          {action.shortcut}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border">
          <span className="text-[9px] text-white/20">↑↓ navigate</span>
          <span className="text-[9px] text-white/20">↵ select</span>
          <span className="text-[9px] text-white/20">Esc close</span>
          <span className="ml-auto text-[9px] text-white/20">Ctrl+K to toggle</span>
        </div>
      </div>
    </div>
  )
}
