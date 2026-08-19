import { describe, it, expect } from 'vitest'
import { validate } from '../GraphValidator'
import type { GSSGraph } from '../../types/graph'

function graphWith(node: GSSGraph['nodes'][number]): GSSGraph {
  return {
    version: '3.0',
    tick_spec_version: 1,
    name: 'Validator Test',
    description: '',
    created_at: '2024-01-01T00:00:00Z',
    modified_at: '2024-01-01T00:00:00Z',
    simulation_seed: 1,
    nodes: [node],
    connections: [],
  }
}

describe('GraphValidator — Timer', () => {
  it('flags non-positive interval as ERROR', () => {
    const g = graphWith({ id: 't1', type: 8, label: 'Timer', position: { x: 0, y: 0 }, data: { resource: 'Gold', amount: 10, interval: 0 } })
    const issues = validate(g)
    expect(issues.some((i) => i.code === 'NEGATIVE_VALUE' && i.severity === 'ERROR')).toBe(true)
  })

  it('does not flag a valid Timer', () => {
    const g = graphWith({ id: 't1', type: 8, label: 'Timer', position: { x: 0, y: 0 }, data: { resource: 'Gold', amount: 10, interval: 60 } })
    const issues = validate(g)
    expect(issues.some((i) => i.nodeId === 't1' && i.severity === 'ERROR')).toBe(false)
  })
})

describe('GraphValidator — Formula', () => {
  it('flags an invalid expression as ERROR', () => {
    const g = graphWith({ id: 'f1', type: 9, label: 'Formula', position: { x: 0, y: 0 }, data: { expression: '2 +', output_resource: 'Gold' } })
    const issues = validate(g)
    expect(issues.some((i) => i.code === 'FORMULA_SYNTAX')).toBe(true)
  })

  it('flags an empty expression as ERROR', () => {
    const g = graphWith({ id: 'f1', type: 9, label: 'Formula', position: { x: 0, y: 0 }, data: { expression: '', output_resource: 'Gold' } })
    const issues = validate(g)
    expect(issues.some((i) => i.code === 'FORMULA_EMPTY')).toBe(true)
  })

  it('does not flag a valid expression', () => {
    const g = graphWith({ id: 'f1', type: 9, label: 'Formula', position: { x: 0, y: 0 }, data: { expression: 'level * 1.2', output_resource: 'XP' } })
    const issues = validate(g)
    expect(issues.some((i) => i.nodeId === 'f1' && i.severity === 'ERROR')).toBe(false)
  })
})

describe('GraphValidator — Player Action', () => {
  it('flags non-positive cadence as ERROR', () => {
    const g = graphWith({ id: 'a1', type: 10, label: 'Action', position: { x: 0, y: 0 }, data: { resource: 'Wood', amount: 5, cadence: -1 } })
    const issues = validate(g)
    expect(issues.some((i) => i.code === 'NEGATIVE_VALUE' && i.severity === 'ERROR')).toBe(true)
  })

  it('does not flag a valid Player Action', () => {
    const g = graphWith({ id: 'a1', type: 10, label: 'Action', position: { x: 0, y: 0 }, data: { resource: 'Wood', amount: 5, cadence: 3 } })
    const issues = validate(g)
    expect(issues.some((i) => i.nodeId === 'a1' && i.severity === 'ERROR')).toBe(false)
  })
})
