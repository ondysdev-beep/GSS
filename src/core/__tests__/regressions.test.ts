// regressions.test.ts — regression tests for the audit fixes in the core
// (formula validation, validator robustness, graph normalization, exporters,
// sweeps, failure detectors, persona simulation, auto-tuner, JSON export).

import { describe, it, expect } from 'vitest'
import type { GSSGraph } from '../../types/graph'
import { evaluateFormula, validateFormulaSyntax } from '../FormulaEvaluator'
import { validate } from '../GraphValidator'
import { normalizeGraph } from '../GraphNormalizer'
import { runScenario, validateScenarioTiming, reportToLongCSV } from '../ScenarioRunner'
import { runSweep, splitParamKey } from '../ParameterSweeper'
import { runMonteCarlo } from '../MonteCarloSimulator'
import { buildReport, analyzeContext } from '../FailureDetectors'
import { runPersonaSimulation, presetCasual } from '../PlayerPersona'
import { exportCSharp, csharpClassName } from '../exporters/csharp'
import { exportGDScript } from '../exporters/gdscript'
import { exportTypeScript } from '../exporters/typescript'
import { exportGSSJson } from '../exporters/json'
import { discoverConversionLoops } from '../ExploitDiscovery'
import { diffGraphs } from '../GraphDiffer'
import { runAutoTuner, defaultConfig } from '../autotuning/AutoTuner'
import { createParam } from '../autotuning/TuningParameter'
import { createGoal } from '../autotuning/TuningGoal'
import { stringify } from '../DeterministicJSON'
import { isNewer } from '../UpdateChecker'
import { findBottlenecks } from '../BottleneckAnalyzer'

const at = { x: 0, y: 0 }
function g(nodes: GSSGraph['nodes'], connections: GSSGraph['connections'] = [], name = 'Test'): GSSGraph {
  return { version: '3.0', tick_spec_version: 2, name, description: '', created_at: '', modified_at: '', simulation_seed: 5, nodes, connections }
}
const SIMPLE = g(
  [
    { id: 'src', type: 1, label: 'Src', position: at, data: { resource: 'gold', rate: 10 } },
    { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 1000 } },
  ],
  [{ from_node: 'src', to_node: 'pool', from_port: 0, to_port: 0 }],
)

describe('FormulaEvaluator', () => {
  it('does not flag a valid expression that divides by zero only when all variables are 1', () => {
    expect(validateFormulaSyntax('gold / (tick - 1)')).toBeNull()
  })
  it('rejects malformed numbers instead of silently truncating them', () => {
    expect(validateFormulaSyntax('1.2.3 + 1')).not.toBeNull()
    expect(() => evaluateFormula('.', {})).toThrow()
  })
  it('rejects absurdly deep nesting instead of overflowing the stack', () => {
    expect(validateFormulaSyntax('('.repeat(500) + '1' + ')'.repeat(500))).not.toBeNull()
  })
})

describe('GraphValidator robustness', () => {
  it('does not crash on missing connections or non-numeric values', () => {
    const graph = {
      nodes: [
        { id: 'p', type: 0, label: 'P', position: at, data: { resource: 5, capacity: '-5' } },
        { id: 's', type: 7, label: 'S', position: at, data: { weights: [1, 2] } },
      ],
    } as unknown as GSSGraph
    expect(() => validate(graph)).not.toThrow()
  })
  it('flags unknown node types, initial > capacity and gate variables that are pool IDs', () => {
    const issues = validate(g([
      { id: 'x', type: 6 as never, label: 'X', position: at, data: {} as never },
      { id: 'pool1', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 10, initial_amount: 50 } },
      { id: 'gate', type: 4, label: 'Gate', position: at, data: { variable: 'pool1', operator: 0, value: 5 } },
    ]))
    expect(issues.some((i) => i.code === 'UNKNOWN_NODE_TYPE')).toBe(true)
    expect(issues.some((i) => i.code === 'INITIAL_EXCEEDS_CAPACITY')).toBe(true)
    expect(issues.some((i) => i.code === 'GATE_VARIABLE')).toBe(true)
  })
  it('warns about routing-only loops', () => {
    const issues = validate(g(
      [
        { id: 'a', type: 7, label: 'A', position: at, data: { split_mode: 0, output_count: 2, weights: '1,1' } },
        { id: 'b', type: 7, label: 'B', position: at, data: { split_mode: 0, output_count: 2, weights: '1,1' } },
      ],
      [{ from_node: 'a', to_node: 'b', from_port: 0, to_port: 0 }, { from_node: 'b', to_node: 'a', from_port: 0, to_port: 0 }],
    ))
    expect(issues.some((i) => i.code === 'ROUTING_LOOP')).toBe(true)
  })
})

describe('normalizeGraph', () => {
  it('fills in name, labels, positions, data and connections', () => {
    const graph = normalizeGraph({ nodes: [{ id: 3, type: '1' }, { type: 0, data: { resource: 'gold' } }] })
    expect(graph.name).toBe('Untitled Economy')
    expect(graph.connections).toEqual([])
    expect(graph.nodes[0].id).toBe('3')
    expect(graph.nodes[0].type).toBe(1)
    expect(graph.nodes[0].label).toBe('Source 3')
    expect(graph.nodes[0].data).toEqual({})
    expect(graph.nodes[1].id).toBe('node_2')
    expect(typeof graph.nodes[1].position.x).toBe('number')
  })
  it('rejects data without a nodes array', () => {
    expect(() => normalizeGraph({ hello: 'world' })).toThrow()
  })
})

describe('Scenario timing guards', () => {
  it('rejects dt <= 0 instead of looping forever', () => {
    expect(() => runScenario(SIMPLE, { dt: 0 })).toThrow()
    expect(() => validateScenarioTiming({ duration: 10, dt: -1, sampling_interval: 1 })).toThrow()
    expect(() => runMonteCarlo(SIMPLE, { iterations: 2, scenario: { dt: 0 } })).toThrow()
    expect(() => runPersonaSimulation(SIMPLE, presetCasual(), { duration: 10, dt: 0, sampling_interval: 1 })).toThrow()
  })
  it('includes the starting state as the first time-series frame', () => {
    const report = runScenario(SIMPLE, { duration: 5 })
    expect(report.time_series[0].time).toBe(0)
    expect(report.time_series[0].pools['pool']).toBe(0)
  })
  it('long CSV has one row per pool per frame', () => {
    const csv = reportToLongCSV(runScenario(SIMPLE, { duration: 2 }))
    expect(csv.split('\n')[0]).toBe('time,pool_id,value')
    expect(csv.split('\n')).toHaveLength(1 + 3)
  })
})

describe('ParameterSweeper', () => {
  it('splits keys at the last dot so node IDs may contain dots', () => {
    expect(splitParamKey('node.v2.rate')).toEqual(['node.v2', 'rate'])
  })
  it('sweeps a node whose ID contains a dot', () => {
    const graph = g(
      [
        { id: 'src.1', type: 1, label: 'Src', position: at, data: { resource: 'gold', rate: 1 } },
        { id: 'pool', type: 0, label: 'Pool', position: at, data: { resource: 'gold', capacity: 10000 } },
      ],
      [{ from_node: 'src.1', to_node: 'pool', from_port: 0, to_port: 0 }],
    )
    const report = runSweep(graph, {
      params: [{ node_id: 'src.1', field: 'rate', min: 1, max: 3, steps: 2 }],
      scenario: { duration: 10 }, target_pool: 'pool', target_metric: 'final_value',
    })
    expect(report.results.map((r) => r.metric_value)).toEqual([10, 20, 30])
  })
  it('refuses more than two parameters or too many runs instead of silently ignoring them', () => {
    const p = { node_id: 'src', field: 'rate', min: 1, max: 2, steps: 1 }
    expect(() => runSweep(SIMPLE, { params: [p, p, p], scenario: {}, target_pool: 'pool', target_metric: 'final_value' })).toThrow()
    expect(() => runSweep(SIMPLE, { params: [{ ...p, steps: 100 }, { ...p, steps: 100 }], scenario: {}, target_pool: 'pool', target_metric: 'final_value' })).toThrow()
  })
})

describe('FailureDetectors', () => {
  it('has_unsafe stays true even when a CRITICAL failure comes first', () => {
    const report = buildReport([
      { type: 'INFINITE_GROWTH', severity: 'CRITICAL', message: '', details: {} },
      { type: 'HARD_BOTTLENECK', severity: 'UNSAFE', message: '', details: {} },
    ])
    expect(report.has_critical).toBe(true)
    expect(report.has_unsafe).toBe(true)
    expect(report.worst_severity).toBe('CRITICAL')
  })
  it('detects an economy that loses >90% of its starting wealth', () => {
    const report = analyzeContext({
      resource_history: { pool: [100, 50, 5] }, gate_times: {}, player_distribution: {},
      state_transitions: [], cycle_count: 3, total_duration: 3,
    })
    expect(report.failures.some((f) => f.type === 'ECONOMY_COLLAPSE')).toBe(true)
  })
})

describe('BottleneckAnalyzer overdrain', () => {
  it('counts converter production, so a converter-fed pool is not a false overdrain', () => {
    const graph = g([
      { id: 'conv', type: 2, label: 'C', position: at, data: { input_resource: 'ore', input_amount: 1, output_resource: 'gold', output_amount: 10, cycle_time: 1 } },
      { id: 'src', type: 1, label: 'S', position: at, data: { resource: 'gold', rate: 1 } },
      { id: 'drain', type: 3, label: 'D', position: at, data: { resource: 'gold', rate: 5 } },
    ])
    expect(findBottlenecks(graph, {}, {}).bottlenecks.some((b) => b.type === 'overdrain')).toBe(false)
  })
})

describe('Exporters', () => {
  const tricky = g(
    [
      { id: '1-pool', type: 0, label: 'Pool "A"\nline', position: at, data: { resource: 'go"ld\\', capacity: 0.5 } },
      { id: '1_pool', type: 0, label: 'Pool B', position: at, data: { resource: 'gold', capacity: 100 } },
      { id: 'timer', type: 8, label: 'Daily', position: at, data: { resource: 'gold', amount: 100, interval: 60 } },
      { id: 'f', type: 9, label: 'F', position: at, data: { expression: 'gold * 2', output_resource: 'xp' } },
      { id: 'act', type: 10, label: 'Click', position: at, data: { resource: 'gold', amount: 1, cadence: 3 } },
    ],
    [],
    '2nd "Economy"',
  )
  it('C# uses a valid class name and exports the new node types', () => {
    expect(csharpClassName(tricky)).toBe('_2ndEconomy')
    const cs = exportCSharp(tricky)
    expect(cs).toContain('public class _2ndEconomy : ScriptableObject')
    expect(cs).toContain('new Timer {')
    expect(cs).toContain('new Formula {')
    expect(cs).toContain('new PlayerAction {')
    expect(cs).toContain('"go\\"ld\\\\"')
    expect(cs).toContain('capacity = 0.5f')
  })
  it('GDScript produces unique variable names and escaped group labels', () => {
    const gd = exportGDScript(tricky)
    expect(gd).toContain('@export var _1_pool_capacity')
    expect(gd).toContain('@export var _1_pool_2_capacity')
    expect(gd).not.toContain('\nline')
    expect(gd).toContain('_cadence: float = 3.0')
  })
  it('TypeScript exports every node type with a valid constant name', () => {
    const tsOut = exportTypeScript(tricky)
    expect(tsOut).toContain('export const _2ND_ECONOMY: GSSEconomyConfig')
    expect(tsOut).toContain('timers: [')
    expect(tsOut).toContain('playerActions: [')
  })
  it('GSS JSON export skips undefined values instead of crashing', () => {
    const graph = { ...SIMPLE, meta: undefined, nodes: [{ ...SIMPLE.nodes[0], data: { resource: 'gold', rate: 10, extra: undefined } as never }] }
    const parsed = JSON.parse(exportGSSJson(graph as GSSGraph))
    expect(parsed.nodes[0].data).toEqual({ rate: 10, resource: 'gold' })
  })
})

describe('Misc core fixes', () => {
  it('reports each conversion loop once, not once per resource in it', () => {
    const loops = discoverConversionLoops([
      { id: 'c1', input: 'Gold', output: 'Gems', input_amount: 1, output_amount: 2 },
      { id: 'c2', input: 'Gems', output: 'Gold', input_amount: 1, output_amount: 2 },
    ], ['Gold', 'Gems'])
    expect(loops).toHaveLength(1)
  })
  it('diff reports node renames and changes of Timer/Formula fields as MAJOR', () => {
    const a = g([{ id: 't', type: 8, label: 'Old', position: at, data: { resource: 'gold', amount: 1, interval: 5 } }])
    const b = g([{ id: 't', type: 8, label: 'New', position: at, data: { resource: 'gold', amount: 1, interval: 10 } }])
    const diff = diffGraphs(a, b)
    expect(diff.param_changes.some((c) => c.field === 'label')).toBe(true)
    expect(diff.param_changes.find((c) => c.field === 'interval')?.severity).toBe('MAJOR')
  })
  it('DeterministicJSON keeps NaN as 0 and small numbers intact', () => {
    expect(stringify(NaN)).toBe('0')
    expect(stringify(0.0000005)).toBe('5e-7')
  })
  it('isNewer handles pre-release suffixes and a leading v', () => {
    expect(isNewer('v3.4.0-beta.1', '3.3.0')).toBe(true)
    expect(isNewer('3.3.0', '3.3.0')).toBe(false)
  })
  it('persona simulation is deterministic and starts at t = 0', () => {
    const r = runPersonaSimulation(SIMPLE, presetCasual(), { duration: 10, dt: 1, sampling_interval: 1, seed: 3 })
    expect(r.time_series[0]).toEqual({ time: 0, total_wealth: 0 })
    expect(r.time_series[r.time_series.length - 1].time).toBe(10)
  })
})

describe('AutoTuner core', () => {
  it('passes parameter values to the simulation and reports SUCCESS when goals are met', async () => {
    const param = { ...createParam('rate', 'Rate'), current_value: 1, original_value: 1, min_value: 0, max_value: 10, step_size: 1 }
    const goal = { ...createGoal('earn', 'Earn'), goal_type: 'MAXIMIZE' as const, metric_type: 'EARNINGS_RATE' as const, target_value: 5 }
    const seen: number[] = []
    const result = await runAutoTuner([param], [goal], [], { ...defaultConfig(), max_iterations: 20, simulation_seed: 1 }, (params, duration) => {
      seen.push(params.rate)
      return { total_value_earned: params.rate * duration, duration_seconds: duration, wealth_history: [], events: [], total_purchases: 0, final_production_rate: {} }
    })
    expect(new Set(seen).size).toBeGreaterThan(1)
    expect(result.status).toBe('SUCCESS')
    expect(result.goals_satisfied).toBe(1)
    expect(result.best_parameters.rate.current_value).toBeGreaterThanOrEqual(5)
  })
})
