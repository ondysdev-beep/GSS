import { describe, it, expect } from 'vitest'
import { detectPlatform } from '../index'
import { tauriPlatform } from '../tauri'
import { webPlatform } from '../web'

describe('detectPlatform — Fáze 3: build-time i runtime výběr adaptéru', () => {
  it('forcedEnv "web" vrací webPlatform bez ohledu na window', () => {
    expect(detectPlatform('web')).toBe(webPlatform)
  })

  it('forcedEnv "tauri" vrací tauriPlatform bez ohledu na window', () => {
    expect(detectPlatform('tauri')).toBe(tauriPlatform)
  })

  it('bez forcedEnv a bez __TAURI_INTERNALS__ v window spadne na webPlatform (jsdom prostředí testů)', () => {
    expect(detectPlatform()).toBe(webPlatform)
  })

  it('bez forcedEnv, ale s __TAURI_INTERNALS__ v window, vrací tauriPlatform', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
    expect(detectPlatform()).toBe(tauriPlatform)
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })
})
