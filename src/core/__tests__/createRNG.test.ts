import { describe, it, expect } from 'vitest'
import { createRNG } from '../SimRNG'
import type { RNGInstance } from '../SimRNG'

describe('createRNG (Fix 1.5)', () => {
  it('should return an object implementing RNGInstance interface', () => {
    const rng: RNGInstance = createRNG(42)
    expect(typeof rng.randf).toBe('function')
    expect(typeof rng.randfRange).toBe('function')
    expect(typeof rng.randiRange).toBe('function')
    expect(typeof rng.randi).toBe('function')
    expect(typeof rng.currentSeed).toBe('number')
  })

  it('should produce deterministic sequences for the same seed', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(42)

    const seq1 = Array.from({ length: 20 }, () => rng1.randf())
    const seq2 = Array.from({ length: 20 }, () => rng2.randf())

    expect(seq1).toEqual(seq2)
  })

  it('should produce different sequences for different seeds', () => {
    const rng1 = createRNG(1)
    const rng2 = createRNG(2)

    const seq1 = Array.from({ length: 10 }, () => rng1.randf())
    const seq2 = Array.from({ length: 10 }, () => rng2.randf())

    expect(seq1).not.toEqual(seq2)
  })

  it('should not share state between instances', () => {
    const rng1 = createRNG(100)
    const rng2 = createRNG(100)

    // Advance rng1 by 10 calls
    for (let i = 0; i < 10; i++) rng1.randf()

    // rng2 should still be at the start
    const rng3 = createRNG(100)
    expect(rng2.randf()).toBe(rng3.randf())
  })

  it('randf() should return values in [0, 1)', () => {
    const rng = createRNG(99999)
    for (let i = 0; i < 200; i++) {
      const v = rng.randf()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('randfRange(from, to) should return values within bounds', () => {
    const rng = createRNG(555)
    for (let i = 0; i < 100; i++) {
      const v = rng.randfRange(2.5, 7.5)
      expect(v).toBeGreaterThanOrEqual(2.5)
      expect(v).toBeLessThan(7.5)
    }
  })

  it('randiRange(min, max) should return integers within bounds', () => {
    const rng = createRNG(777)
    for (let i = 0; i < 100; i++) {
      const v = rng.randiRange(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('currentSeed should reflect the seed passed to createRNG', () => {
    const rng = createRNG(54321)
    expect(rng.currentSeed).toBe(54321)
  })
})
