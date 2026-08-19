// TemplateWizardModal.tsx — Template Wizard (Fáze 6 nových funkcí).
//
// Doplňuje existující rychlý "+Template" dropdown (Toolbar.tsx), který
// zůstává beze změny pro rychlé jednokrokové vložení. Wizard je pro
// uživatele, kteří chtějí šablonu rovnou přizpůsobit — přejmenovat hlavní
// resource a zvolit měřítko — než ji vloží do editoru. Styl sjednocen s
// ConfirmDialog/SettingsModal (stejný overlay pattern, žádný nový modal
// framework).

import { useState } from 'react'
import { TEMPLATE_LIST, getTemplate } from '../../core/GraphTemplates'
import { customizeTemplate, type TemplateScale } from '../../core/TemplateCustomizer'
import { useGraphStore } from '../../store/graphStore'
import { useSimulationStore } from '../../store/simulationStore'

interface TemplateWizardModalProps {
  open: boolean
  onClose: () => void
}

const SCALE_OPTIONS: { value: TemplateScale; label: string; hint: string }[] = [
  { value: 'small', label: 'Small', hint: '×0.5 — slower pace, shorter games' },
  { value: 'medium', label: 'Medium', hint: '×1 — default template values' },
  { value: 'large', label: 'Large', hint: '×2 — faster pace, longer progression' },
]

export function TemplateWizardModal({ open, onClose }: TemplateWizardModalProps) {
  const setGraph = useGraphStore((s) => s.setGraph)
  const resetSim = useSimulationStore((s) => s.reset)

  const [step, setStep] = useState<1 | 2>(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resourceName, setResourceName] = useState('')
  const [scale, setScale] = useState<TemplateScale>('medium')

  if (!open) return null

  const selected = selectedId ? TEMPLATE_LIST.find((t) => t.id === selectedId) ?? null : null

  function pickTemplate(id: string) {
    const meta = TEMPLATE_LIST.find((t) => t.id === id)
    setSelectedId(id)
    setResourceName(meta?.primaryResource ?? '')
    setStep(2)
  }

  function apply() {
    if (!selected) return
    const base = getTemplate(selected.id)
    if (!base) return
    const graph = customizeTemplate(base, {
      renameFrom: selected.primaryResource,
      renameTo: resourceName.trim() || selected.primaryResource,
      scale,
    })
    setGraph(graph)
    resetSim()
    handleClose()
  }

  function handleClose() {
    setStep(1)
    setSelectedId(null)
    setResourceName('')
    setScale('medium')
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-wizard-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="template-wizard-title" className="text-sm font-semibold text-white">
            Template Wizard {step === 2 && selected ? `— ${selected.name}` : ''}
          </h2>
          <button onClick={handleClose} aria-label="Close wizard" className="text-white/30 hover:text-white text-lg leading-none">✕</button>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-1.5 max-h-80 overflow-auto">
            <p className="text-[10px] text-muted mb-1">Step 1 of 2 — pick a base template by genre:</p>
            {TEMPLATE_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => pickTemplate(t.id)}
                className="text-left p-2.5 rounded border border-border hover:border-accent/50 hover:bg-accent/10 transition-colors"
              >
                <div className="text-xs text-white font-medium">{t.name}</div>
                <div className="text-[10px] text-muted mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && selected && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] text-muted">Step 2 of 2 — customize the template for your game:</p>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted uppercase tracking-widest">Main resource name</label>
              <input
                type="text"
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                placeholder={selected.primaryResource}
                className="px-2 py-1.5 bg-bg border border-border rounded text-xs text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <span className="text-[9px] text-muted">Replaces "{selected.primaryResource}" in every node of the template.</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-muted uppercase tracking-widest">Economy scale</label>
              <div className="flex gap-1.5">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setScale(opt.value)}
                    title={opt.hint}
                    className={`flex-1 px-2 py-1.5 text-[10px] rounded border transition-colors ${
                      scale === opt.value
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-border text-white/50 hover:border-white/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-between mt-2">
              <button
                onClick={() => setStep(1)}
                className="px-3 py-1.5 text-xs rounded border border-border text-white/70 hover:text-white hover:bg-border transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={apply}
                className="px-3 py-1.5 text-xs rounded bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                Create graph
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
