import { describe, it, expect } from 'vitest'
import { validate, hasErrors, hasWarnings } from '../GraphValidator'
import type { GSSGraph } from '../../types/graph'

const EMPTY_GRAPH: GSSGraph = {
  version: '3.0',
  tick_spec_version: 1,
  name: 'Empty',
  description: '',
  created_at: '2024-01-01T00:00:00Z',
  modified_at: '2024-01-01T00:00:00Z',
  simulation_seed: 42,
  nodes: [],
  connections: [],
}

const VALID_MINIMAL: GSSGraph = {
  ...EMPTY_GRAPH,
  name: 'Minimal',
  nodes: [
    { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: 0, label: 'Pool', position: { x: 100, y: 0 }, data: { resource: 'Gold', capacity: 100 } },
  ],
  connections: [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
}

describe('GraphValidator', () => {
  it('empty graph returns EMPTY_GRAPH error', () => {
    const issues = validate(EMPTY_GRAPH)
    expect(hasErrors(issues)).toBe(true)
    expect(issues.some((i) => i.code === 'EMPTY_GRAPH')).toBe(true)
  })

  it('valid minimal graph has no errors', () => {
    const issues = validate(VALID_MINIMAL)
    const errors = issues.filter((i) => i.severity === 'ERROR')
    expect(errors).toHaveLength(0)
  })

  it('duplicate node IDs produce DUPLICATE_ID error', () => {
    const graph: GSSGraph = {
      ...VALID_MINIMAL,
      nodes: [
        ...VALID_MINIMAL.nodes,
        { id: 'src1', type: 0, label: 'Dup', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 50 } },
      ],
    }
    const issues = validate(graph)
    expect(issues.some((i) => i.code === 'DUPLICATE_ID')).toBe(true)
  })

  it('orphan node (no connections) produces ORPHAN_NODE warning', () => {
    const graph: GSSGraph = {
      ...VALID_MINIMAL,
      nodes: [
        ...VALID_MINIMAL.nodes,
        { id: 'orphan', type: 0, label: 'Orphan', position: { x: 300, y: 0 }, data: { resource: 'Mana', capacity: 50 } },
      ],
    }
    const issues = validate(graph)
    expect(hasWarnings(issues)).toBe(true)
    expect(issues.some((i) => i.code === 'ORPHAN_NODE' && i.nodeId === 'orphan')).toBe(true)
  })

  it('missing connection target produces MISSING_TARGET error', () => {
    const graph: GSSGraph = {
      ...VALID_MINIMAL,
      connections: [{ from_node: 'src1', to_node: 'nonexistent', from_port: 0, to_port: 0 }],
    }
    const issues = validate(graph)
    expect(issues.some((i) => i.code === 'MISSING_TARGET')).toBe(true)
  })

  it('pool with negative capacity produces NEGATIVE_VALUE error', () => {
    const graph: GSSGraph = {
      ...VALID_MINIMAL,
      nodes: [
        { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
        { id: 'pool1', type: 0, label: 'Pool', position: { x: 100, y: 0 }, data: { resource: 'Gold', capacity: -10 } },
      ],
    }
    const issues = validate(graph)
    expect(issues.some((i) => i.code === 'NEGATIVE_VALUE')).toBe(true)
  })

  it('chance node with probability outside [0,1] produces CHANCE_RANGE error', () => {
    const graph: GSSGraph = {
      ...VALID_MINIMAL,
      nodes: [
        ...VALID_MINIMAL.nodes,
        { id: 'ch1', type: 5, label: 'Chance', position: { x: 200, y: 0 }, data: { success_chance: 150 } },
      ],
      connections: [
        ...VALID_MINIMAL.connections,
        { from_node: 'pool1', to_node: 'ch1', from_port: 0, to_port: 0 },
      ],
    }
    const issues = validate(graph)
    expect(issues.some((i) => i.code === 'CHANCE_RANGE')).toBe(true)
  })
})

describe('GraphValidator — robustnost vůči nedůvěryhodnému vstupu (regrese B1)', () => {
  it('nespadne na uzlu bez pole "data" (např. z AI Generatoru / Community Library)', () => {
    const graph = {
      version: '3.0', tick_spec_version: 1, name: 'x', description: '',
      created_at: '', modified_at: '', simulation_seed: 1,
      nodes: [{ id: 'a', type: 0, label: 'Pool', position: { x: 0, y: 0 } }],
      connections: [],
    } as unknown as GSSGraph
    expect(() => validate(graph)).not.toThrow()
  })
})
