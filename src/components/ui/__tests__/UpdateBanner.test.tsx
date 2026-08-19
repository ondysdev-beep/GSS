// UpdateBanner.test.tsx — ověřuje klíčové chování: na webu se banner
// vůbec nevykreslí (nic ke kontrole), na desktopu ukáže dostupnou
// aktualizaci a umožní "Update now".

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UpdateBanner } from '../UpdateBanner'
import { platform } from '../../../platform'

vi.mock('../../../platform', async () => {
  const actual = await vi.importActual<typeof import('../../../platform')>('../../../platform')
  return {
    ...actual,
    platform: {
      ...actual.platform,
      name: 'tauri',
      checkForAppUpdate: vi.fn(),
      installAppUpdate: vi.fn(),
    },
  }
})

const mockedCheck = vi.mocked(platform.checkForAppUpdate)
const mockedInstall = vi.mocked(platform.installAppUpdate)

describe('UpdateBanner', () => {
  beforeEach(() => {
    mockedCheck.mockReset()
    mockedInstall.mockReset()
  })

  it('nevykreslí nic, dokud kontrola nenajde aktualizaci', async () => {
    mockedCheck.mockResolvedValue(null)
    const { container } = render(<UpdateBanner />)
    await waitFor(() => expect(mockedCheck).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('zobrazí dostupnou aktualizaci a umožní kliknout "Update now"', async () => {
    mockedCheck.mockResolvedValue({ version: '3.4.0', notes: 'Bug fixes' })
    mockedInstall.mockResolvedValue(undefined)
    render(<UpdateBanner />)

    expect(await screen.findByText(/3\.4\.0/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Update now/i }))

    await waitFor(() => expect(mockedInstall).toHaveBeenCalled())
  })

  it('selhání instalace ukáže chybu, nespadne', async () => {
    mockedCheck.mockResolvedValue({ version: '3.4.0', notes: '' })
    mockedInstall.mockRejectedValue(new Error('network error'))
    render(<UpdateBanner />)

    fireEvent.click(await screen.findByRole('button', { name: /Update now/i }))
    expect(await screen.findByText(/Update failed/i)).toBeInTheDocument()
  })

  it('zavření křížkem banner skryje', async () => {
    mockedCheck.mockResolvedValue({ version: '3.4.0', notes: '' })
    render(<UpdateBanner />)

    fireEvent.click(await screen.findByRole('button', { name: /Dismiss update notification/i }))
    expect(screen.queryByText(/3\.4\.0/)).not.toBeInTheDocument()
  })

  it('chyba při samotné kontrole aktualizace appku neshodí (tichý fail)', async () => {
    mockedCheck.mockRejectedValue(new Error('offline'))
    const { container } = render(<UpdateBanner />)
    await waitFor(() => expect(mockedCheck).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
