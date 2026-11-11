import { describe, it, expect } from 'vitest'
import { formatNumber, formatMultiplier } from '../formatNumber'

describe('formatNumber', () => {
  it('keeps small numbers readable', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(0.5)).toBe('0.5')
    expect(formatNumber(42)).toBe('42')
    expect(formatNumber(999)).toBe('999')
  })
  it('uses K/M/B/T suffixes', () => {
    expect(formatNumber(1234)).toBe('1.23K')
    expect(formatNumber(3_400_000)).toBe('3.4M')
    expect(formatNumber(5.6e9)).toBe('5.6B')
    expect(formatNumber(7.8e12)).toBe('7.8T')
    expect(formatNumber(-2500)).toBe('-2.5K')
  })
  it('rolls over to the next suffix instead of showing 1000K', () => {
    expect(formatNumber(999_960)).toBe('1M')
  })
  it('switches to scientific notation past trillions', () => {
    expect(formatNumber(1.234e15)).toBe('1.23e15')
  })
})

describe('formatMultiplier', () => {
  it('formats multipliers', () => {
    expect(formatMultiplier(1)).toBe('1')
    expect(formatMultiplier(1.5)).toBe('1.5')
    expect(formatMultiplier(1.331)).toBe('1.33')
    expect(formatMultiplier(25.25)).toBe('25.3')
  })
})
