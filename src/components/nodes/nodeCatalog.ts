// nodeCatalog.ts — single source of truth for node type metadata used by the
// editor UI (palette, context menu, drag & drop, inspector, minimap).
//
// Dřív měla paleta, kontextové menu i drag&drop vlastní kopie výchozích dat a
// barev, které se rozcházely (drag&drop Timer/Formula/Player Action uzlu
// dokonce vytvořil uzel bez `data` a shodil celou aplikaci).

import type { GSSNode, NodeTypeValue } from '../../types/graph'

export const NODE_TYPE_ORDER: NodeTypeValue[] = [1, 0, 3, 2, 4, 5, 7, 8, 9, 10]

export const NODE_TYPE_COLORS: Record<number, string> = {
  0: '#3b82f6',  // POOL — blue
  1: '#22c55e',  // SOURCE — green
  2: '#eab308',  // CONVERTER — yellow
  3: '#ef4444',  // DRAIN — red
  4: '#a855f7',  // GATE — purple
  5: '#f97316',  // CHANCE — orange
  7: '#6b7280',  // SPLITTER — gray
  8: '#14b8a6',  // TIMER — teal
  9: '#ec4899',  // FORMULA — pink
  10: '#84cc16', // PLAYER_ACTION — lime
}

/** Upper-case badge text shown on the node. */
export const NODE_TYPE_LABELS: Record<number, string> = {
  0: 'POOL',
  1: 'SOURCE',
  2: 'CONVERTER',
  3: 'DRAIN',
  4: 'GATE',
  5: 'CHANCE',
  7: 'SPLITTER',
  8: 'TIMER',
  9: 'FORMULA',
  10: 'PLAYER ACTION',
}

/** Human-readable name (palette, inspector, default node labels). */
export const NODE_TYPE_NAMES: Record<number, string> = {
  0: 'Pool',
  1: 'Source',
  2: 'Converter',
  3: 'Drain',
  4: 'Gate',
  5: 'Chance',
  7: 'Splitter',
  8: 'Timer',
  9: 'Formula',
  10: 'Player Action',
}

export const NODE_TYPE_ICONS: Record<number, string> = {
  0: '▣', 1: '⬆', 2: '⇄', 3: '⬇', 4: '◈', 5: '⚄', 7: '⑂', 8: '⏱', 9: 'ƒ', 10: '☝',
}

export const NODE_TYPE_HINTS: Record<number, string> = {
  0: 'Resource storage with capacity',
  1: 'Generates resources at rate per second',
  2: 'Converts one resource type to another',
  3: 'Consumes resources at rate per second',
  4: 'Passes flow through only while its condition holds (GT/LT/EQ…)',
  5: 'Probability branch: output 1 on success, output 2 on failure',
  7: 'Splits flow into multiple outputs (equal or weighted)',
  8: 'Exact pulse every N seconds (e.g. daily reward)',
  9: 'Computed output from a safe expression (e.g. level * 1.2)',
  10: 'Simulated player-triggered action, average cadence',
}

/**
 * "How it works" text shown in the node inspector. Describes what the tick
 * engine actually does (core/TickEngine.ts) — keep in sync with it and with
 * docs/NODE_REFERENCE.md.
 */
export const NODE_TYPE_DOCS: Record<number, string[]> = {
  0: [
    'Stores one resource, up to its capacity. Anything that would go over capacity is lost.',
    'A pool never pushes anything on its own. Drains and Converters connected from it pull what they need.',
    'If the resource field is empty, the pool takes the first resource that flows into it.',
  ],
  1: [
    'Every tick it produces rate × seconds of its resource and sends it to every connected node.',
    'With two or more connections, each one gets the full amount (it is copied, not divided). Put a Splitter after it to divide the flow.',
  ],
  2: [
    'Every tick it pulls its input resource from the pools connected into it, up to input amount × (seconds ÷ cycle time), and turns it into output in the same ratio.',
    'Partial input gives partial output, so a half-empty pool means half the production.',
    'The output goes to every connected node (copied, not divided). Flow pushed into a converter is buffered, at most one tick’s worth.',
  ],
  3: [
    'Every tick it removes rate × seconds of its resource from the pools connected into it, in connection order.',
    'It only takes what is there: an empty pool simply stops the drain.',
  ],
  4: [
    'Opens when the TOTAL of a resource across all pools meets the condition (for example Gold > 50). The condition is checked when the simulation starts and at the end of every tick, so a change takes effect on the next tick.',
    'Open: flow sent into it passes to all of its outputs, and Drains or Converters behind it can pull through it. Closed: both are blocked.',
  ],
  5: [
    'Rolls once every time flow arrives. On success the whole amount goes out of the green output, on failure out of the red one.',
    'It does not split flow proportionally. For a steady 70 / 30 split use a Splitter in weighted mode.',
    'Rolls use the simulation seed, so the same seed gives the same results.',
  ],
  7: [
    'Divides incoming flow between all of its connections.',
    'Equal mode: each output gets amount ÷ number of outputs. Weighted mode: weights apply in connection order, and missing or invalid weights count as 1.',
  ],
  8: [
    'Sends a fixed amount to every connected node once per interval. The first pulse comes after the first full interval, not at t = 0.',
    'Use it for exact, regular rewards. For irregular player behaviour use Player Action.',
  ],
  9: [
    'Every tick it evaluates the expression as a rate per second and produces result × seconds of its output resource. A negative result produces nothing.',
    'Variables: any resource name (its total across all pools) and tick (the tick number). Supports numbers, + − × ÷ and parentheses. Unknown names count as 0.',
  ],
  10: [
    'Simulates a player action, such as clicking a button: on average once every cadence seconds it sends its amount to every connected node.',
    'The timing is random (seeded). For an exact interval use Timer.',
  ],
}

const DEFAULT_DATA: Record<number, Record<string, unknown>> = {
  0: { resource: 'Gold', capacity: 100, initial_amount: 0 },
  1: { resource: 'Gold', rate: 5 },
  2: { input_resource: 'Gold', input_amount: 5, output_resource: 'XP', output_amount: 1, cycle_time: 1 },
  3: { resource: 'Gold', rate: 2 },
  // Gate porovnává CELKOVÉ množství resource podle jména (ne ID poolu) —
  // dřívější výchozí 'pool1' neodpovídal žádnému resource a gate se nikdy neotevřel.
  4: { variable: 'Gold', operator: 0, value: 50 },
  5: { success_chance: 50 },
  7: { split_mode: 0, output_count: 2, weights: '1,1' },
  8: { resource: 'Gold', amount: 100, interval: 60 },
  9: { expression: 'tick * 1', output_resource: 'Gold' },
  10: { resource: 'Gold', amount: 10, cadence: 5 },
}

/** Fresh copy of the default data for a node type (never shared between nodes). */
export function defaultNodeData(type: number): GSSNode['data'] {
  return { ...(DEFAULT_DATA[type] ?? {}) } as unknown as GSSNode['data']
}

export function isKnownNodeType(type: number): type is NodeTypeValue {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DATA, type)
}

let _nodeCounter = 0

/** Creates a new node with a unique ID, default data and a readable label. */
export function createNode(type: NodeTypeValue, position: { x: number; y: number }): GSSNode {
  _nodeCounter++
  return {
    id: `node_${Date.now()}_${_nodeCounter}`,
    type,
    label: `${NODE_TYPE_NAMES[type] ?? 'Node'} ${_nodeCounter}`,
    position,
    data: defaultNodeData(type),
  }
}

/** Duplicate of a node (deep-copied data, offset position, new ID). */
export function duplicateNode(src: GSSNode): GSSNode {
  _nodeCounter++
  return {
    ...src,
    id: `node_${Date.now()}_${_nodeCounter}`,
    label: `${src.label} (copy)`,
    position: { x: src.position.x + 40, y: src.position.y + 40 },
    data: JSON.parse(JSON.stringify(src.data ?? {})) as GSSNode['data'],
  }
}
