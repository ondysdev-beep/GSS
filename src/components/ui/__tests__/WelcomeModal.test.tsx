// WelcomeModal.test.tsx — ověřuje klíčový požadavek onboardingu: zobrazit
// se JEN JEDNOU, ne při každém spuštění (viz komentář v App.tsx a zadání).

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeModal, hasSeenWelcome } from '../WelcomeModal'

describe('WelcomeModal — onboarding se zobrazí jen jednou', () => {
  beforeEach(() => localStorage.clear())

  it('hasSeenWelcome() vrací false, dokud uživatel obrazovku nezavře', () => {
    expect(hasSeenWelcome()).toBe(false)
  })

  it('kliknutí na "Začít s prázdným plátnem" označí obrazovku jako viděnou', () => {
    render(<WelcomeModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /blank canvas/i }))
    expect(hasSeenWelcome()).toBe(true)
  })

  it('kliknutí na "Začít od šablony" také označí obrazovku jako viděnou', () => {
    render(<WelcomeModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Start from a template/i }))
    expect(hasSeenWelcome()).toBe(true)
  })

  it('open=false nevykreslí nic (žádný pád, žádný vedlejší efekt)', () => {
    const { container } = render(<WelcomeModal open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(hasSeenWelcome()).toBe(false)
  })

  it('otevření Template Wizardu ze onboardingu zavře i samotný WelcomeModal', () => {
    const onClose = () => { closed = true }
    let closed = false
    render(<WelcomeModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Start from a template/i }))
    // Wizard se otevřel — welcome overlay by měl zmizet (nahrazen wizardem),
    // ale onClose se zavolá až při zavření/dokončení wizardu, ne hned.
    expect(screen.queryByText(/Welcome to GSS/i)).not.toBeInTheDocument()
    expect(closed).toBe(false) // ještě neprošel wizardem
  })
})
