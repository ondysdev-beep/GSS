// Simulation state and result types — mirrors Godot GSS GDScript format exactly

// ==================== RUNTIME STATE ====================

// Per-pool runtime state
export interface PoolState {
  resource: string
  amount: number
  capacity: number
}

// Per-chance node cumulative stats
export interface ChanceRollStats {
  successes: number
  total: number
  success_chance: number  // 0–100
}

// Converter input buffer
export interface ConverterBuffer {
  input_buffer: number
}

// Splitter runtime data (pre-parsed weights)
export interface SplitterRuntime {
  split_mode: 0 | 1
  output_count: number
  weights: number[]
}

// Timer runtime accumulator — tracks seconds elapsed since the last pulse
// (interval may not evenly divide dt, so this must persist between ticks).
export interface TimerRuntime {
  accumulated: number
}

// Complete simulation state at one tick
export interface SimState {
  tick: number
  pools: Record<string, PoolState>
  gate_states: Record<string, boolean>
  converter_buffers: Record<string, ConverterBuffer>
  chance_rolls: Record<string, ChanceRollStats>
  splitter_data: Record<string, SplitterRuntime>
  timer_data: Record<string, TimerRuntime>
}

// One sampled tick of trace data (for ReplayUI — lighter than full SimState)
export interface TickTrace {
  tick: number
  pools: Record<string, PoolState>
  gate_states: Record<string, boolean>
  chance_rolls: Record<string, ChanceRollStats>
}

// Full simulation result returned to UI
export interface SimulationResult {
  ticks: number
  duration_ms: number
  trace: TickTrace[]
  final_state: SimState
  seed: number
  tick_spec_version: number
}

// Validation issue (from GraphValidator)
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface ValidationIssue {
  code: string
  severity: IssueSeverity
  message: string
  nodeId: string
}

// Free tier hard limits — enough to explore, not enough for real projects
export const FREE_TIER_LIMITS = {
  MAX_NODES: 15,   // was 20 — feel the limit on real projects
  MAX_TICKS: 120,  // was 60  — enough to see trends, not full analysis
} as const

// ==================== SCENARIO ====================

export interface Scenario {
  name: string
  duration: number           // total sim seconds
  dt: number                 // tick delta (default 1.0)
  sampling_interval: number  // how often to record time series
  seed_override: number      // 0 = use project seed
  initial_overrides: Record<string, number>  // pool_id → starting amount
  persona: string            // persona name ('' = none)
  thresholds: Record<string, number>  // pool_id → threshold for time-to-threshold
}

export function defaultScenario(): Scenario {
  return {
    name: 'Default',
    duration: 60,
    dt: 1.0,
    sampling_interval: 1.0,
    seed_override: 0,
    initial_overrides: {},
    persona: '',
    thresholds: {},
  }
}

// ==================== RUN REPORT ====================

// One frame in the time-series trace
export interface TimeSeriesFrame {
  time: number
  pools: Record<string, number>     // pool_id → amount
  gates: Record<string, boolean>    // gate_id → open/closed
}

export interface RunSummary {
  final_values: Record<string, number>
  min_values: Record<string, number>
  max_values: Record<string, number>
  time_to_threshold: Record<string, number>  // -1 if never reached
  total_ticks: number
  elapsed: number
}

export interface ChanceStat {
  successes: number
  total: number
}

export interface RunReport {
  tick_spec_version: number
  scenario: Scenario
  time_series: TimeSeriesFrame[]
  summary: RunSummary
  chance_stats: Record<string, ChanceStat>
  seed_used: number
  persona?: PersonaReport
  trace?: { sample_count: number; sampling_interval: number }
}

// ==================== PERSONA ====================

export interface PersonaReport {
  name: string
  total_spent: number
  purchase_count: number
  purchases: unknown[]
  milestones: unknown[]
}

export type PersonaStrategy = 'roi' | 'cheapest' | 'priority' | 'random'

export interface Persona {
  name: string
  cadence: number      // how often persona acts (every N ticks)
  strategy: PersonaStrategy
  budget_pct: number   // fraction of pool to spend
  reserve_min: number  // minimum to keep in pool
  priority_list: string[]
  aggression: number   // 0–1
}

// ==================== COMPARE REPORT ====================

export interface PoolDiff {
  final_a: number
  final_b: number
  delta: number
  pct_change: number
  ttt_a: number
  ttt_b: number
  ttt_delta: number
}

export interface CompareReport {
  tick_spec_version: number
  scenario_a: string
  scenario_b: string
  pool_diffs: Record<string, PoolDiff>
  chance_diffs: Record<string, { successes_a: number; successes_b: number; delta: number }>
  growth_rates: Record<string, { rate_a: number; rate_b: number; delta: number }>
  winner_summary: string
}

// ==================== SWEEP REPORT ====================

export interface SweepResult {
  param_values: Record<string, number>
  metric_value: number
}

export interface SweepSensitivity {
  correlation: number
  elasticity: number
  slope: number
}

export interface TornadoEntry {
  param_key: string
  impact: number
}

export interface SweepReport {
  tick_spec_version: number
  config: {
    params: SweepParam[]
    scenario: Scenario
    target_pool: string
    target_metric: 'final_value' | 'min_value' | 'max_value' | 'time_to_threshold'
  }
  results: SweepResult[]
  sensitivity: Record<string, SweepSensitivity>
  tornado: TornadoEntry[]
}

export interface SweepParam {
  node_id: string
  field: string
  min: number
  max: number
  steps: number
}

// ==================== HEALTH SCORE & VERDICT ====================

export interface HealthScore {
  stability: number      // 0–100, weight 0.30
  convergence: number    // 0–100, weight 0.25
  fairness: number       // 0–100, weight 0.20
  exploitability: number // 0–100, weight 0.15
  recovery: number       // 0–100, weight 0.10
  total: number          // weighted total
}

export type VerdictState = 'SAFE' | 'CAUTION' | 'UNSAFE' | 'CRITICAL'

export interface Verdict {
  state: VerdictState
  confidence_score: number    // 0–1
  simulation_cycles: number
  edge_cases_tested: number
  sample_coverage: number     // 0–1
}

export type FailureType = 'NONE' | 'INFINITE_GROWTH' | 'ECONOMY_COLLAPSE' | 'DEADLOCK' | 'HARD_BOTTLENECK'
export type FailureSeverity = 'NONE' | 'UNSAFE' | 'CRITICAL'

export interface CriticalFailure {
  type: FailureType
  severity: FailureSeverity
  message: string
  details: Record<string, unknown>
}

export interface FailureReport {
  failures: CriticalFailure[]
  has_critical: boolean
  has_unsafe: boolean
  worst_severity: FailureSeverity
}

export interface VerdictReport {
  verdict: Verdict
  health_score: HealthScore
  failure_report: FailureReport
  simulation_info: {
    cycles: number
    duration: number
    resources_tracked: number
    gates_tracked: number
    archetypes_tested: number
  }
}

// ==================== SIMULATION CONTEXT (pro analýzu) ====================

export interface SimulationContext {
  resource_history: Record<string, number[]>   // pool_id → [amount per tick]
  gate_times: Record<string, { actual_time: number; expected_time: number; alternative_paths: number }>
  player_distribution: Record<string, number>  // archetype → final value
  state_transitions: Array<{ from: string; requirements: string[] }>
  cycle_count: number
  total_duration: number
}

// ==================== MONTE CARLO ====================

export interface MCPoolStats {
  mean: number
  std: number
  min: number
  max: number
  p10: number
  p50: number
  p90: number
}

export interface MCReport {
  tick_spec_version: number
  iterations: number
  seed_base: number
  scenario: Scenario
  pool_stats: Record<string, MCPoolStats>
  chance_stats: Record<string, { mean_success_rate: number; std: number }>
}
