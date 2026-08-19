// LicensePanel.web.test.tsx — Fáze 4: ověřuje, že se LicensePanel na webu
// vykreslí bez pádu a NEukazuje itch.io key-entry formulář, který by tam
// neměl smysl (na webu je FREE/PRO build-time volba, ne runtime klíč).
//
// Poznámka: toto je jsdom test (simulovaný DOM), ne test ve skutečném
// prohlížeči — network omezení v tomto prostředí neumožnila stáhnout
// Playwright Chromium pro plnohodnotný browser test webového buildu.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LicensePanel } from '../ui/LicensePanel'

vi.mock('../../platform', async () => {
  const actual = await vi.importActual<typeof import('../../platform')>('../../platform')
  return { ...actual, platform: { ...actual.platform, name: 'web' } }
})

describe('LicensePanel — web edition (Fáze 4)', () => {
  it('vykreslí se bez pádu a nezobrazí key-entry formulář na webu', async () => {
    render(<LicensePanel />)
    expect(await screen.findByText(/FREE build/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/XXXX-XXXX-XXXX-XXXX/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Activate$/i })).not.toBeInTheDocument()
  })

  it('pořád ukazuje srovnání FREE vs PRO funkcí', async () => {
    render(<LicensePanel />)
    expect(await screen.findByText(/PRO ⭐/)).toBeInTheDocument()
  })
})
