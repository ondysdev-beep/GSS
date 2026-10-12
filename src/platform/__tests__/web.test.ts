import { describe, it, expect, beforeEach, vi } from 'vitest'
import { webPlatform } from '../web'
import { PlatformUnsupportedError } from '../types'

describe('webPlatform — AI klíč se na webu neukládá (AI Generator tam nefunguje)', () => {
  beforeEach(() => localStorage.clear())

  it('AI Generator je na webu označený jako nepodporovaný', () => {
    expect(webPlatform.supportsAiGenerator).toBe(false)
  })

  it('hasAnthropicApiKey vrací vždy false', async () => {
    localStorage.setItem('gss_ai_api_key', 'sk-ant-legacy')
    expect(await webPlatform.hasAnthropicApiKey()).toBe(false)
  })

  it('saveAnthropicApiKey klíč neuloží do localStorage a vyhodí PlatformUnsupportedError', async () => {
    await expect(webPlatform.saveAnthropicApiKey('sk-ant-test123')).rejects.toBeInstanceOf(PlatformUnsupportedError)
    expect(localStorage.getItem('gss_ai_api_key')).toBeNull()
  })

  it('clearAnthropicApiKey uklidí klíč uložený staršími verzemi', async () => {
    localStorage.setItem('gss_ai_api_key', 'sk-ant-legacy')
    await webPlatform.clearAnthropicApiKey()
    expect(localStorage.getItem('gss_ai_api_key')).toBeNull()
  })
})

describe('webPlatform — FREE/PRO je čistě build-time (žádný runtime licenční klíč)', () => {
  it('getBuildVariant čte VITE_EDITION, výchozí je "free"', async () => {
    expect(await webPlatform.getBuildVariant()).toBe('free')
  })
})

describe('webPlatform — AI Generator (zatím nepodporováno kvůli CORS)', () => {
  it('generateEconomyGraph vyhazuje jasnou PlatformUnsupportedError, ne tichý pád', async () => {
    await expect(webPlatform.generateEconomyGraph('x')).rejects.toBeInstanceOf(PlatformUnsupportedError)
  })
})

describe('webPlatform — saveFile (Blob download)', () => {
  it('vytvoří <a download> element a spustí stažení', async () => {
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement')
    createElementSpy.mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    // jsdom neimplementuje URL.createObjectURL/revokeObjectURL — v reálném
    // prohlížeči existují, tady je jen minimální polyfill pro test.
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.useFakeTimers()

    const result = await webPlatform.saveFile(['gss'], 'test.gss', '{"foo":"bar"}')
    expect(result).toBe('test.gss')
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    // URL se uvolní až po spuštění stahování, ne okamžitě
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    vi.useRealTimers()
    createElementSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})

describe('webPlatform — openFile (File API)', () => {
  it('vrátí obsah vybraného souboru', async () => {
    const file = new File(['{"name":"test graph"}'], 'graph.gss', { type: 'application/json' })

    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement')
    createElementSpy.mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'input') {
        Object.defineProperty(el, 'files', { value: [file], configurable: true })
        setTimeout(() => (el as HTMLInputElement).onchange?.(new Event('change')), 0)
        el.click = () => {}
      }
      return el
    })

    const result = await webPlatform.openFile(['gss', 'json'])
    expect(result?.path).toBe('graph.gss')
    expect(result?.content).toBe('{"name":"test graph"}')

    createElementSpy.mockRestore()
  })
})

describe('webPlatform — app update (web nemá co kontrolovat)', () => {
  it('checkForAppUpdate vrací null — web je vždy aktuální po refreshi', async () => {
    expect(await webPlatform.checkForAppUpdate()).toBeNull()
  })

  it('installAppUpdate vyhazuje jasnou PlatformUnsupportedError', async () => {
    await expect(webPlatform.installAppUpdate()).rejects.toBeInstanceOf(PlatformUnsupportedError)
  })
})
