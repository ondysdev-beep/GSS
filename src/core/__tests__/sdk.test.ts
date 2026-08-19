// sdk.test.ts — dokazuje, že veřejný SDK barrel export (sdk.ts) sám o sobě
// stačí ke spuštění kompletní simulace end-to-end, BEZ importu čehokoli
// jiného z projektu. Pokud tento test projde, znamená to, že by šlo `sdk.ts`
// zítra vytáhnout do samostatného npm balíčku, aniž by chyběl jediný kus
// potřebné funkčnosti.

import { describe, it, expect } from 'vitest'
import {
  NodeType, initState, simulateTick, createRNG, validate, hasErrors,
  runScenario, calculateHealthScore, buildSimulationContext,
  TEMPLATE_LIST, getTemplate, evaluateFormula, diffGraphs,
} from '../sdk'
import type { GSSGraph } from '../sdk'

const GRAPH: GSSGraph = {
  version: '3.0',
  tick_spec_version: 1,
  name: 'SDK smoke test',
  description: '',
  created_at: '2024-01-01T00:00:00Z',
  modified_at: '2024-01-01T00:00:00Z',
  simulation_seed: 1,
  nodes: [
    { id: 'src1', type: NodeType.SOURCE, label: 'Source', position: { x: 0, y: 0 }, data: { resource: 'Gold', rate: 10 } },
    { id: 'pool1', type: NodeType.POOL, label: 'Pool', position: { x: 200, y: 0 }, data: { resource: 'Gold', capacity: 1000 } },
  ],
  connections: [{ from_node: 'src1', to_node: 'pool1', from_port: 0, to_port: 0 }],
}

describe('GSS SDK — end-to-end without any app/UI code', () => {
  it('validates a graph', () => {
    const issues = validate(GRAPH)
    expect(hasErrors(issues)).toBe(false)
  })

  it('runs a raw tick loop using only SDK exports', () => {
    const rng = createRNG(42)
    let state = initState(GRAPH)
    for (let i = 0; i < 10; i++) state = simulateTick(state, GRAPH, 1.0, rng)
    expect(state.pools['pool1'].amount).toBeCloseTo(100, 5)
  })

  it('runs a full scenario and computes a health score', () => {
    const report = runScenario(GRAPH)
    const ctx = buildSimulationContext(report, GRAPH)
    const health = calculateHealthScore(ctx)
    expect(health.total).toBeGreaterThanOrEqual(0)
    expect(health.total).toBeLessThanOrEqual(100)
  })

  it('lists and loads built-in templates', () => {
    expect(TEMPLATE_LIST.length).toBeGreaterThan(0)
    const tpl = getTemplate(TEMPLATE_LIST[0].id)
    expect(tpl).not.toBeNull()
  })

  it('evaluates a formula expression', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14)
  })

  it('diffs two graphs', () => {
    const other: GSSGraph = { ...GRAPH, nodes: [GRAPH.nodes[0]] }
    const diff = diffGraphs(GRAPH, other)
    expect(diff.summary.removed).toBe(1)
  })
})
