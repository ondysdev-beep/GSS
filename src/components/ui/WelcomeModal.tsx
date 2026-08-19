// WelcomeModal.tsx — první-spuštění onboarding (reakce na produktovou obavu
// z auditu i z externí recenze: appka má 4 hlavní taby + 6 Library sub-tabů
// + 10 typů uzlů a nový uživatel otevře prázdný editor bez vodítka, co
// dělat jako první).
//
// Záměrně MINIMÁLNÍ — jeden krok, dvě volby, žádný nový "onboarding
// systém" ani duplicitní šablonovací logika. "Start from a template" jen
// otevře existující TemplateWizardModal (Fáze 6), nic nového se
// nevymýšlí. Zobrazí se přesně jednou — flag v localStorage — a jen
// tehdy, když je graf skutečně prázdný (návratný uživatel s obnoveným
// autosave grafem ho neuvidí, i kdyby se flag ztratil).

import { useState } from 'react'
import { TemplateWizardModal } from './TemplateWizardModal'

const SEEN_KEY = 'gss_welcome_seen'

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // localStorage nedostupné (privátní režim atd.) — radši nezobrazovat opakovaně
  }
}

function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Nevadí — v nejhorším případě se příště zobrazí znovu.
  }
}

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
}

export function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  const [wizardOpen, setWizardOpen] = useState(false)

  if (!open) return null

  function dismiss() {
    markWelcomeSeen()
    onClose()
  }

  function startFromTemplate() {
    markWelcomeSeen()
    setWizardOpen(true)
  }

  return (
    <>
      {/* Když se otevře wizard, samotný welcome overlay se skryje — jinak by
          zůstal (vyšší z-index) navrchu a blokoval interakci s wizardem. */}
      {!wizardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 text-center">
            <div className="text-accent font-black text-lg tracking-[0.2em] uppercase mb-1">GSS</div>
            <h2 id="welcome-title" className="text-sm font-semibold text-white mb-2">
              Welcome to GSS
            </h2>
            <p className="text-xs text-white/50 mb-5 leading-relaxed">
              Build a graph of your economy or system, run the simulation, and
              catch problems before your players do. The fastest way to start
              is from a ready-made template.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={startFromTemplate}
                className="px-4 py-2.5 text-xs font-semibold bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
              >
                🪄 Start from a template
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                Start with a blank canvas
              </button>
            </div>
          </div>
        </div>
      )}

      <TemplateWizardModal
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); onClose() }}
      />
    </>
  )
}
