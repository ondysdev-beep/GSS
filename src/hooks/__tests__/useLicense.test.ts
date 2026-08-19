// useLicense.test.ts — klíčové tvrzení odstranění runtime licenčního
// klíče: `isPro` se vždy znovu odvodí z `platform.getBuildVariant()` při
// každém spuštění, nikdy nedůvěřuje ničemu perzistovanému v localStorage
// (na rozdíl od starého `gss_license_v2` store, který byl triviálně
// upravitelný přes devtools — viz SECURITY.md).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLicense } from '../useLicense'
import { useLicenseStore } from '../../store/licenseStore'
import { platform } from '../../platform'

vi.mock('../../platform', async () => {
  const actual = await vi.importActual<typeof import('../../platform')>('../../platform')
  return { ...actual, platform: { ...actual.platform, getBuildVariant: vi.fn() } }
})

const mockedGetBuildVariant = vi.mocked(platform.getBuildVariant)

describe('useLicense — isPro je vždy odvozeno z buildu, ne z localStorage', () => {
  beforeEach(() => {
    mockedGetBuildVariant.mockReset()
    useLicenseStore.setState({ license: null, isLoading: true })
    localStorage.clear()
  })

  it('FREE build → isPro false, i kdyby v localStorage něco zůstalo z dřívějška', async () => {
    localStorage.setItem('gss_license_v2', JSON.stringify({ state: { license: { isPro: true } } }))
    mockedGetBuildVariant.mockResolvedValue('free')

    const { result } = renderHook(() => useLicense())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isPro).toBe(false)
  })

  it('PRO build → isPro true', async () => {
    mockedGetBuildVariant.mockResolvedValue('pro')

    const { result } = renderHook(() => useLicense())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isPro).toBe(true)
  })

  it('licenseStore se nepersistuje do localStorage (žádný gss_license_v2 zápis)', async () => {
    mockedGetBuildVariant.mockResolvedValue('pro')
    const { result } = renderHook(() => useLicense())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Store samotný o sobě nikdy nezapisuje do localStorage — na rozdíl od
    // staré `persist` middleware verze.
    expect(localStorage.getItem('gss_license_v2')).toBeNull()
  })

  it('chyba při zjišťování build varianty spadne bezpečně na isPro=false, ne pád', async () => {
    mockedGetBuildVariant.mockRejectedValue(new Error('invoke failed'))

    const { result } = renderHook(() => useLicense())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isPro).toBe(false)
  })
})
