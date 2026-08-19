// GSS Graph Types — matches existing .gss JSON serialization format exactly
// Backward compatible: all old .gss saves load without migration scripts.

export const GSS_FORMAT_VERSION = '3.0' as const

// Node type constants — must match Godot original exactly
export const NodeType = {
  POOL:      0,
  SOURCE:    1,
  CONVERTER: 2,
  DRAIN:     3,
  GATE:      4,
  CHANCE:    5,
  // 6 = reserved
  SPLITTER:  7,
  TIMER:         8,
  FORMULA:       9,
  PLAYER_ACTION: 10,
} as const

export type NodeTypeValue = 0 | 1 | 2 | 3 | 4 | 5 | 7 | 8 | 9 | 10

// Gate operator constants
export const GateOperator = {
  GT:  0,
  GTE: 1,
  LT:  2,
  LTE: 3,
  EQ:  4,
  NEQ: 5,
} as const

export type GateOperatorValue = 0 | 1 | 2 | 3 | 4 | 5

// ==================== Per-type data payloads ====================

export interface PoolData {
  resource: string
  capacity: number
  initial_amount?: number
}

export interface SourceData {
  resource: string
  rate: number
}

export interface ConverterData {
  input_resource: string
  input_amount: number
  output_resource: string
  output_amount: number
  cycle_time: number
}

export interface DrainData {
  resource: string
  rate: number
}

export interface GateData {
  variable: string
  operator: GateOperatorValue
  value: number
}

export interface ChanceData {
  success_chance: number  // 0–100
}

export interface SplitterData {
  split_mode: 0 | 1       // 0=equal, 1=weighted
  output_count: number
  weights: string          // "1,1" comma-separated
}

// Timer: fires an exact deterministic pulse every `interval` seconds
// (e.g. a daily login reward) — distinct from Player Action, which fires
// stochastically around an average cadence.
export interface TimerData {
  resource: string
  amount: number    // produced amount per pulse
  interval: number  // seconds between pulses
}

// Formula: produces `output_resource` at a rate computed each tick from a
// small safe arithmetic expression (see core/FormulaEvaluator.ts — no
// eval()/Function(), since .gss files can be shared/imported from others).
// Variables available: resource names (aggregated across pools, same
// lookup Gate already uses) and `tick`.
export interface FormulaData {
  expression: string
  output_resource: string
}

// Player Action: simulates a player-triggered action (e.g. clicking a
// "gather" button) as a stochastic per-tick trigger with average cadence
// `cadence` seconds — NOT an exact interval like Timer. Batch/deterministic
// simulation only (seeded RNG); there is no live clickable UI trigger yet.
export interface PlayerActionData {
  resource: string
  amount: number   // produced amount when the action fires
  cadence: number  // average seconds between firings
}

export type NodeData =
  | PoolData
  | SourceData
  | ConverterData
  | DrainData
  | GateData
  | ChanceData
  | SplitterData
  | TimerData
  | FormulaData
  | PlayerActionData

// ==================== Core graph structures ====================

export interface GSSNode {
  id: string
  type: NodeTypeValue
  label: string
  position: { x: number; y: number }
  data: NodeData
}

export interface GSSConnection {
  from_node: string
  to_node: string
  from_port: number
  to_port: number
}

// Root .gss file format (JSON) — mirrors Godot GSSGraph exactly
export interface GSSGraph {
  version: string
  tick_spec_version: number
  name: string
  description: string
  created_at: string
  modified_at: string
  simulation_seed: number      // default RNG seed for this project
  nodes: GSSNode[]
  connections: GSSConnection[]
  personas?: import('./simulation').Persona[]
  scenarios?: import('./simulation').Scenario[]
  meta?: Record<string, unknown>
}

// ==================== Type guards ====================

export function isPoolData(_data: NodeData, type: NodeTypeValue): _data is PoolData {
  return type === NodeType.POOL
}

export function isSourceData(_data: NodeData, type: NodeTypeValue): _data is SourceData {
  return type === NodeType.SOURCE
}

export function isConverterData(_data: NodeData, type: NodeTypeValue): _data is ConverterData {
  return type === NodeType.CONVERTER
}

export function isDrainData(_data: NodeData, type: NodeTypeValue): _data is DrainData {
  return type === NodeType.DRAIN
}

export function isGateData(_data: NodeData, type: NodeTypeValue): _data is GateData {
  return type === NodeType.GATE
}

export function isChanceData(_data: NodeData, type: NodeTypeValue): _data is ChanceData {
  return type === NodeType.CHANCE
}

export function isSplitterData(_data: NodeData, type: NodeTypeValue): _data is SplitterData {
  return type === NodeType.SPLITTER
}

export function isTimerData(_data: NodeData, type: NodeTypeValue): _data is TimerData {
  return type === NodeType.TIMER
}

export function isFormulaData(_data: NodeData, type: NodeTypeValue): _data is FormulaData {
  return type === NodeType.FORMULA
}

export function isPlayerActionData(_data: NodeData, type: NodeTypeValue): _data is PlayerActionData {
  return type === NodeType.PLAYER_ACTION
}
