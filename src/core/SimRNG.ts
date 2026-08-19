// SimRNG.ts — Deterministic seeded RNG using Mulberry32 algorithm
// All simulation-affecting randomness MUST go through this module.
// Produces identical sequences for the same seed across all runs.
//
// Usage:
//   SimRNG.setSeed(12345)               // before each run
//   const roll = SimRNG.randf()         // instead of Math.random()
//   SimRNG.setSeedForRun(base, index)   // Monte Carlo
//   const rng = createRNG(42)           // isolated instance for pipelines

// ==================== RNG INSTANCE (self-contained, no shared state) ====================

export interface RNGInstance {
  randf(): number
  randfRange(from: number, to: number): number
  randiRange(from: number, to: number): number
  randi(): number
  readonly currentSeed: number
}

function _mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

export function createRNG(seed: number): RNGInstance {
  const _seed = seed >>> 0
  const _fn = _mulberry32(_seed)
  return {
    get currentSeed(): number { return _seed },
    randf(): number { return _fn() },
    randfRange(from: number, to: number): number { return from + _fn() * (to - from) },
    randiRange(from: number, to: number): number { return Math.floor(from + _fn() * (to - from + 1)) },
    randi(): number { return Math.floor(_fn() * 4294967296) },
  }
}

// ==================== GLOBAL SINGLETON (backward compatibility) ====================

let _currentSeed = 0
let _rngFn: () => number = _mulberry32(0)

export const SimRNG = {
  get currentSeed(): number {
    return _currentSeed
  },

  setSeed(seed: number): void {
    _currentSeed = seed >>> 0
    _rngFn = _mulberry32(_currentSeed)
  },

  setSeedForRun(baseSeed: number, runIndex: number): void {
    SimRNG.setSeed((baseSeed + runIndex) >>> 0)
  },

  randf(): number {
    return _rngFn()
  },

  randfRange(from: number, to: number): number {
    return from + SimRNG.randf() * (to - from)
  },

  randiRange(from: number, to: number): number {
    return Math.floor(from + SimRNG.randf() * (to - from + 1))
  },

  randi(): number {
    return Math.floor(SimRNG.randf() * 4294967296)
  },

  generateSeed(): number {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    }
    return (Date.now() ^ (Date.now() * 0x100000001)) >>> 0
  },
} as const
