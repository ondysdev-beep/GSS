// NodePalette.tsx — Levý panel s typy uzlů. Kliknutím se uzel přidá do
// viditelné části plátna (mřížka podle počtu uzlů), tažením na konkrétní místo.
// Výchozí data, barvy i názvy jsou sdílené s editorem (nodeCatalog.ts).
import { useGraphStore } from '../../store/graphStore'
import {
  NODE_TYPE_COLORS, NODE_TYPE_HINTS, NODE_TYPE_ICONS, NODE_TYPE_NAMES, NODE_TYPE_ORDER, createNode,
} from '../nodes/nodeCatalog'
import type { NodeTypeValue } from '../../types/graph'

export function NodePalette() {
  const addNode = useGraphStore((s) => s.addNode)
  const nodeCount = useGraphStore((s) => s.graph.nodes.length)

  function handleAdd(type: NodeTypeValue) {
    const position = {
      x: 120 + (nodeCount % 5) * 160,
      y: 100 + Math.floor(nodeCount / 5) * 120,
    }
    addNode(createNode(type, position))
  }

  return (
    <div className="flex flex-col w-[72px] shrink-0 bg-card border-r border-border overflow-y-auto py-2 gap-0.5">
      <div className="px-1 pb-1">
        <span className="block text-center text-[8px] uppercase tracking-widest text-white/20 font-semibold">Nodes</span>
      </div>
      {NODE_TYPE_ORDER.map((type) => {
        const color = NODE_TYPE_COLORS[type]
        return (
          <button
            key={type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/gss-nodetype', type.toString())
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => handleAdd(type)}
            title={`${NODE_TYPE_NAMES[type]} — ${NODE_TYPE_HINTS[type]}`}
            className="flex flex-col items-center gap-0.5 py-2 mx-1 rounded hover:bg-white/5 transition-colors group cursor-grab active:cursor-grabbing"
          >
            <span
              className="text-lg leading-none w-8 h-8 flex items-center justify-center rounded-md border border-white/10 group-hover:border-white/20 transition-colors"
              style={{ color, background: `${color}15` }}
            >
              {NODE_TYPE_ICONS[type]}
            </span>
            <span className="text-[8px] text-white/40 group-hover:text-white/70 transition-colors font-medium text-center leading-tight">
              {NODE_TYPE_NAMES[type]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
