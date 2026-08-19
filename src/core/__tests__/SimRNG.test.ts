import { describe, it, expect, beforeEach } from 'vitest'
import { SimRNG } from '../SimRNG'

describe('SimRNG', () => {
  beforeEach(() => {
    SimRNG.setSeed(12345)
  })

  it('same seed produces identical sequence (determinism)', () => {
    SimRNG.setSeed(42)
    const seq1 = Array.from({ length: 10 }, () => SimRNG.randf())

    SimRNG.setSeed(42)
    const seq2 = Array.from({ length: 10 }, () => SimRNG.randf())

    expect(seq1).toEqual(seq2)
  })

  it('different seeds produce different sequences', () => {
    SimRNG.setSeed(1)
    const seq1 = Array.from({ length: 5 }, () => SimRNG.randf())

    SimRNG.setSeed(2)
    const seq2 = Array.from({ length: 5 }, () => SimRNG.randf())

    expect(seq1).not.toEqual(seq2)
  })

  it('randf() returns values in [0, 1)', () => {
    SimRNG.setSeed(99999)
    for (let i = 0; i < 100; i++) {
      const v = SimRNG.randf()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('randiRange(min, max) returns integers within bounds', () => {
    SimRNG.setSeed(777)
    for (let i = 0; i < 50; i++) {
      const v = SimRNG.randiRange(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('setSeedForRun(base, index) = setSeed(base + index)', () => {
    SimRNG.setSeedForRun(1000, 5)
    const seq1 = Array.from({ length: 5 }, () => SimRNG.randf())

    SimRNG.setSeed(1005)
    const seq2 = Array.from({ length: 5 }, () => SimRNG.randf())

    expect(seq1).toEqual(seq2)
  })

  it('currentSeed reflects last setSeed call', () => {
    SimRNG.setSeed(54321)
    expect(SimRNG.currentSeed).toBe(54321)
  })
})
