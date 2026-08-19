import { describe, it, expect } from 'vitest'
import { evaluateFormula, validateFormulaSyntax } from '../FormulaEvaluator'

describe('evaluateFormula', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14)
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20)
    expect(evaluateFormula('10 / 4', {})).toBe(2.5)
  })

  it('resolves variables', () => {
    expect(evaluateFormula('level * 1.2', { level: 10 })).toBeCloseTo(12)
    expect(evaluateFormula('gold + xp', { gold: 5, xp: 3 })).toBe(8)
  })

  it('unknown variables default to 0', () => {
    expect(evaluateFormula('unknown_var + 5', {})).toBe(5)
  })

  it('handles unary minus', () => {
    expect(evaluateFormula('-5 + 10', {})).toBe(5)
    expect(evaluateFormula('-(2 + 3)', {})).toBe(-5)
  })

  it('throws FormulaError on invalid syntax', () => {
    expect(() => evaluateFormula('2 +', {})).toThrow()
    expect(() => evaluateFormula('((2 + 3)', {})).toThrow()
    expect(() => evaluateFormula('2 $ 3', {})).toThrow()
  })

  it('throws on division producing non-finite result', () => {
    expect(() => evaluateFormula('1 / 0', {})).toThrow()
  })

  it('never executes arbitrary JS — no access to global objects', () => {
    // "constructor" etc. are just treated as unknown variables (→ 0),
    // never as a way to reach out to JS internals — there is no eval/Function.
    expect(evaluateFormula('constructor + 1', {})).toBe(1)
  })
})

describe('validateFormulaSyntax', () => {
  it('returns null for valid expressions', () => {
    expect(validateFormulaSyntax('level * 1.2 + tick')).toBeNull()
  })

  it('returns an error for invalid expressions', () => {
    expect(validateFormulaSyntax('level * ')).not.toBeNull()
  })
})
