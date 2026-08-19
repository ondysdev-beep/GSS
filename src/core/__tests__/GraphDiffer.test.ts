// GraphDiffer.test.ts — GraphDiffer.ts existed unused/untested before this
// update (audit R-05); it now backs the Diff Viewer panel, so it gets
// baseline coverage matching the other core modules.

import { describe, it, expect } from 'vitest'
import { diffGraphs } from '../GraphDiffer'
import type { GSSGraph } from '../../types/graph'

function makeGraph(overrides: Partial<GSSGraph> = {}): GSSGraph {
  return {
    version: '3.0',
    tick_spec_version: 1,
    name: 'Test',
    description: '',
    created_at: '2024-01-01T00:00:00Z',
    modified_at: '2024-01-01T00:00:00Z',
    simulation_seed: 42,
    nodes: [
      { id: 'src1', type: 1, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
      { id: 'pool1', type: 0, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000 } },
    ],
    connections: [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
    ...overrides,
  }
}

describe('diffGraphs', () => {
  it('reports no changes for identical graphs', () => {
    const g = makeGraph()
    const diff = diffGraphs(g, g)
    expect(diff.summary.added).toBe(0)
    expect(diff.summary.removed).toBe(0)
    expect(diff.summary.changed).toBe(0)
  })

  it('detects an added node', () => {
    const a = makeGraph()
    const b = makeGraph({
      nodes: [...a.nodes, { id: 'drain1', type: 3, label: 'Drain', position: { x: 400, y: 0 }, data: { resource: 'Gold', rate: 5 } }],
    })
    const diff = diffGraphs(a, b)
    expect(diff.summary.added).toBe(1)
    expect(diff.node_changes.some((c) => c.type === 'ADDED' && c.node_id === 'drain1')).toBe(true)
  })

  it('detects a removed node as BREAKING', () => {
    const a = makeGraph()
    const b = makeGraph({ nodes: [a.nodes[0]] })
    const diff = diffGraphs(a, b)
    expect(diff.summary.removed).toBe(1)
    expect(diff.summary.breaking).toBeGreaterThan(0)
  })

  it('detects a changed parameter (rate)', () => {
    const a = makeGraph()
    const b = makeGraph({
      nodes: [{ ...a.nodes[0], data: { ...a.nodes[0].data, rate: 20 } }, a.nodes[1]],
    })
    const diff = diffGraphs(a, b)
    expect(diff.param_changes.length).toBeGreaterThan(0)
    expect(diff.param_changes.some((c) => c.field === 'rate' && c.old_value === 10 && c.new_value === 20)).toBe(true)
  })
})

describe('diffGraphs — robustnost vůči nedůvěryhodnému vstupu (regrese B1b)', () => {
  it('nespadne, pokud jedna strana má uzel bez pole "data" (nahraný soubor v Diff Vieweru)', () => {
    const a = makeGraph()
    const b = makeGraph({
      nodes: [{ id: a.nodes[0].id, type: a.nodes[0].type, label: 'x', position: { x: 0, y: 0 } } as unknown as GSSGraph['nodes'][number], a.nodes[1]],
    })
    expect(() => diffGraphs(a, b)).not.toThrow()
  })
})
