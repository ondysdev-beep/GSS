// useAutoSave.test.ts — covers the pure persistence functions used for
// crash recovery (audit R-18: "prioritize... persistence, autosave,
// recovery"). This is the exact mechanism ErrorBoundary's "Restart GSS"
// button relies on, so its failure modes matter more than most.

import { describe, it, expect, beforeEach } from 'vitest'
import { loadAutoSave, clearAutoSave } from '../useAutoSave'

const AUTOSAVE_KEY = 'gss_autosave'

describe('useAutoSave persistence helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loadAutoSave returns null when nothing was saved', () => {
    expect(loadAutoSave()).toBeNull()
  })

  it('loadAutoSave round-trips a saved graph', () => {
    const graph = { name: 'Test Graph', nodes: [{ id: 'n1' }], connections: [] }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(graph))
    expect(loadAutoSave()).toEqual(graph)
  })

  it('loadAutoSave returns null (not a crash) on corrupted JSON', () => {
    // Simulates a truncated/corrupted write — e.g. the app was killed
    // mid-write. This is exactly the scenario ErrorBoundary's recovery
    // path must not itself crash on.
    localStorage.setItem(AUTOSAVE_KEY, '{not valid json')
    expect(loadAutoSave()).toBeNull()
  })

  it('clearAutoSave removes the saved entry', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ nodes: [] }))
    clearAutoSave()
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
    expect(loadAutoSave()).toBeNull()
  })

  it('clearAutoSave does not throw when nothing was saved', () => {
    expect(() => clearAutoSave()).not.toThrow()
  })
})
