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
