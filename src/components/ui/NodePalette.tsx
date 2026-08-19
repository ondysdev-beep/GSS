// NodePalette.tsx — Levý panel s typy uzlů, kliknutím přidá uzel do středu canvasu
import { useGraphStore } from '../../store/graphStore'
import type { GSSNode } from '../../types/graph'

interface NodeDef {
  type: 0 | 1 | 2 | 3 | 4 | 5 | 7 | 8 | 9 | 10
  label: string
  icon: string
  color: string
  hint: string
  defaultData: GSSNode['data']
}

const NODE_DEFS: NodeDef[] = [
  {
    type: 1,
    label: 'Source',
    icon: '⬆',
    color: '#22c55e',
    hint: 'Generates resources at rate/s',
    defaultData: { resource: 'Gold', rate: 5 },
  },
  {
    type: 0,
    label: 'Pool',
    icon: '▣',
    color: '#3b82f6',
    hint: 'Resource storage with capacity',
    defaultData: { resource: 'Gold', capacity: 100, initial_amount: 0 },
  },
  {
    type: 3,
    label: 'Drain',
    icon: '⬇',
    color: '#ef4444',
    hint: 'Consumes resources at rate/s',
    defaultData: { resource: 'Gold', rate: 2 },
  },
  {
    type: 2,
    label: 'Converter',
    icon: '⇄',
    color: '#f97316',
    hint: 'Converts one resource type to another',
    defaultData: { input_resource: 'Gold', input_amount: 5, output_resource: 'XP', output_amount: 1, cycle_time: 1 },
  },
  {
    type: 4,
    label: 'Gate',
    icon: '◈',
    color: '#a855f7',
    hint: 'Conditional flow control (GT/LT/EQ…)',
    defaultData: { variable: 'pool1', operator: 0, value: 50 },
  },
  {
    type: 5,
    label: 'Chance',
    icon: '⚄',
    color: '#eab308',
    hint: 'Probability branch (0–100%)',
    defaultData: { success_chance: 50 },
  },
  {
    type: 7,
    label: 'Splitter',
    icon: '⑂',
    color: '#06b6d4',
    hint: 'Splits flow into multiple outputs',
    defaultData: { split_mode: 0, output_count: 2, weights: '1,1' },
  },
  {
    type: 8,
    label: 'Timer',
    icon: '⏱',
    color: '#14b8a6',
    hint: 'Exact pulse every N seconds (e.g. daily reward)',
    defaultData: { resource: 'Gold', amount: 100, interval: 60 },
  },
  {
    type: 9,
    label: 'Formula',
    icon: 'ƒ',
    color: '#ec4899',
    hint: 'Computed output from a safe expression (e.g. level * 1.2)',
    defaultData: { expression: 'tick * 1', output_resource: 'Gold' },
  },
  {
    type: 10,
    label: 'Player Action',
    icon: '☝',
    color: '#84cc16',
    hint: 'Simulated player-triggered action, average cadence',
    defaultData: { resource: 'Gold', amount: 10, cadence: 5 },
  },
]

let _counter = 1

export function NodePalette() {
  const addNode = useGraphStore((s) => s.addNode)
  const graph   = useGraphStore((s) => s.graph)

  function handleAdd(def: NodeDef) {
    const id = `node_${Date.now()}_${_counter++}`
    const baseX = 120 + (graph.nodes.length % 5) * 160
    const baseY = 100 + Math.floor(graph.nodes.length / 5) * 120
    const node: GSSNode = {
      id,
      type: def.type,
      label: `${def.label} ${_counter}`,
      position: { x: baseX, y: baseY },
      data: { ...def.defaultData } as GSSNode['data'],
    }
    addNode(node)
  }

  return (
    <div className="flex flex-col w-[72px] shrink-0 bg-card border-r border-border overflow-y-auto py-2 gap-0.5">
      <div className="px-1 pb-1">
        <span className="block text-center text-[8px] uppercase tracking-widest text-white/20 font-semibold">Nodes</span>
      </div>
      {NODE_DEFS.map((def) => (
        <button
          key={def.type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/gss-nodetype', def.type.toString())
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => handleAdd(def)}
          title={`${def.label} — ${def.hint}`}
          className="flex flex-col items-center gap-0.5 py-2 mx-1 rounded hover:bg-white/5 transition-colors group cursor-grab active:cursor-grabbing"
        >
          <span
            className="text-lg leading-none w-8 h-8 flex items-center justify-center rounded-md border border-white/10 group-hover:border-white/20 transition-colors"
            style={{ color: def.color, background: `${def.color}15` }}
          >
            {def.icon}
          </span>
          <span className="text-[8px] text-white/40 group-hover:text-white/70 transition-colors font-medium">
            {def.label}
          </span>
        </button>
      ))}
    </div>
  )
}
