// NodeTypes.tsx — Custom ReactFlow node components for all 10 GSS node types

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { NodeData } from '../../types/graph'
import { useSettingsStore } from '../../store/settingsStore'
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from './nodeCatalog'

export { NODE_TYPE_COLORS, NODE_TYPE_LABELS }

/** Source handle IDs of the Chance node — the handle decides the connection's from_port. */
export const CHANCE_SUCCESS_HANDLE = 'out-0'
export const CHANCE_FAILURE_HANDLE = 'out-1'

// ==================== Shared primitives ====================

interface GSSNodeData {
  gssType: number
  label: string
  data: NodeData
  fillPct?: number       // 0–1, set by FlowOverlay during sim
  isActive?: boolean     // gate open / chance fired
  liveValue?: string     // current tick value shown as overlay
}

interface BaseNodeProps {
  color: string
  typeLabel: string
  label: string
  subtitle?: string
  fillPct?: number
  handles?: 'source-only' | 'target-only' | 'both' | 'chance' | 'none'
  badge?: string
  liveValue?: string
}

/** Node data that is never undefined (imported/malformed nodes may lack `data`). */
function dataOf<T>(data: GSSNodeData): Partial<T> {
  return (data.data ?? {}) as unknown as Partial<T>
}

function NodeShell({ color, typeLabel, label, subtitle, fillPct, handles = 'both', badge, liveValue }: BaseNodeProps) {
  const showSubtitles = useSettingsStore((s) => s.settings.showNodeSubtitles)
  const handleStyle = { background: color, borderColor: '#0a0a14' }
  return (
    <div
      className="relative rounded-lg border-2 bg-card min-w-[120px] max-w-[180px] shadow-lg select-none"
      style={{ borderColor: color }}
    >
      {/* Type badge */}
      <div
        className="px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase rounded-t-md text-center"
        style={{ background: color, color: '#0a0a14' }}
      >
        {badge ?? typeLabel}
      </div>

      {/* Fill bar (shown during simulation) */}
      {fillPct !== undefined && (
        <div className="h-1 w-full bg-border overflow-hidden">
          <div
            className="h-full transition-all duration-200"
            style={{ width: `${Math.min(100, fillPct * 100).toFixed(1)}%`, background: color }}
          />
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-1">
          <div className="text-white text-xs font-semibold truncate">{label}</div>
          {liveValue !== undefined && (
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{ background: `${color}30`, color }}
            >{liveValue}</span>
          )}
        </div>
        {showSubtitles && subtitle && (
          <div className="text-muted text-[10px] truncate mt-0.5">{subtitle}</div>
        )}
      </div>

      {/* ReactFlow handles */}
      {(handles === 'target-only' || handles === 'both' || handles === 'chance') && (
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-2" style={handleStyle} />
      )}
      {(handles === 'source-only' || handles === 'both') && (
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-2" style={handleStyle} />
      )}
      {handles === 'chance' && (
        <>
          {/* Dva výstupy: port 0 = úspěch, port 1 = neúspěch (dřív šel v editoru vytvořit jen port 0). */}
          <Handle id={CHANCE_SUCCESS_HANDLE} type="source" position={Position.Right} title="Success (output 1)"
            className="!w-2.5 !h-2.5 !border-2" style={{ ...handleStyle, top: '35%', background: '#22c55e' }} />
          <Handle id={CHANCE_FAILURE_HANDLE} type="source" position={Position.Right} title="Failure (output 2)"
            className="!w-2.5 !h-2.5 !border-2" style={{ ...handleStyle, top: '75%', background: '#ef4444' }} />
          <span className="absolute right-2 text-[8px] text-green-400 pointer-events-none" style={{ top: 'calc(35% - 6px)' }}>✓</span>
          <span className="absolute right-2 text-[8px] text-red-400 pointer-events-none" style={{ top: 'calc(75% - 6px)' }}>✗</span>
        </>
      )}
    </div>
  )
}

// ==================== Pool node ====================

const PoolNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ resource: string; capacity: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[0]}
      typeLabel="POOL"
      label={data.label}
      subtitle={`${d.resource ?? ''} · cap ${d.capacity ?? 100}`}
      fillPct={data.fillPct}
      liveValue={data.liveValue}
      handles="both"
    />
  )
})
PoolNode.displayName = 'PoolNode'

// ==================== Source node ====================

const SourceNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ resource: string; rate: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[1]}
      typeLabel="SOURCE"
      label={data.label}
      subtitle={`${d.resource ?? ''} +${d.rate ?? 0}/s`}
      handles="source-only"
    />
  )
})
SourceNode.displayName = 'SourceNode'

// ==================== Converter node ====================

const ConverterNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ input_resource: string; input_amount: number; output_resource: string; output_amount: number; cycle_time: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[2]}
      typeLabel="CONVERTER"
      label={data.label}
      subtitle={`${d.input_amount ?? 0} ${d.input_resource ?? ''} → ${d.output_amount ?? 0} ${d.output_resource ?? ''} / ${d.cycle_time ?? 1}s`}
      handles="both"
    />
  )
})
ConverterNode.displayName = 'ConverterNode'

// ==================== Drain node ====================

const DrainNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ resource: string; rate: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[3]}
      typeLabel="DRAIN"
      label={data.label}
      subtitle={`${d.resource ?? ''} -${d.rate ?? 0}/s`}
      handles="target-only"
    />
  )
})
DrainNode.displayName = 'DrainNode'

// ==================== Gate node ====================

const GATE_OP_LABELS: Record<number, string> = { 0: '>', 1: '≥', 2: '<', 3: '≤', 4: '=', 5: '≠' }

const GateNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ variable: string; operator: number; value: number }>(data)
  const op = GATE_OP_LABELS[d.operator ?? 0] ?? '>'
  // Stav otevřeno/zavřeno je známý jen během replaye simulace — dřív se bez
  // simulace vždy ukazovalo "✗", jako by byl gate zavřený.
  const badge = data.isActive === undefined ? 'GATE' : data.isActive ? 'GATE ✓ OPEN' : 'GATE ✗ CLOSED'
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[4]}
      typeLabel="GATE"
      label={data.label}
      subtitle={`${d.variable ?? ''} ${op} ${d.value ?? 0}`}
      badge={badge}
      handles="both"
    />
  )
})
GateNode.displayName = 'GateNode'

// ==================== Chance node ====================

const ChanceNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ success_chance: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[5]}
      typeLabel="CHANCE"
      label={data.label}
      subtitle={`${d.success_chance ?? 50}% success`}
      handles="chance"
    />
  )
})
ChanceNode.displayName = 'ChanceNode'

// ==================== Splitter node ====================

const SplitterNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ split_mode: number; weights: string }>(data)
  const modeLabel = d.split_mode === 1 ? `Weighted ${d.weights ?? '1,1'}` : 'Equal'
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[7]}
      typeLabel="SPLITTER"
      label={data.label}
      subtitle={`${modeLabel} · splits across all outputs`}
      handles="both"
    />
  )
})
SplitterNode.displayName = 'SplitterNode'

// ==================== Timer node ====================

const TimerNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ resource: string; amount: number; interval: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[8]}
      typeLabel="TIMER"
      label={data.label}
      subtitle={`+${d.amount ?? 0} ${d.resource ?? ''} / ${d.interval ?? 60}s`}
      liveValue={data.liveValue}
      handles="source-only"
    />
  )
})
TimerNode.displayName = 'TimerNode'

// ==================== Formula node ====================

const FormulaNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ expression: string; output_resource: string }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[9]}
      typeLabel="FORMULA"
      label={data.label}
      subtitle={`${d.expression ?? '0'} → ${d.output_resource ?? ''} /s`}
      liveValue={data.liveValue}
      handles="source-only"
    />
  )
})
FormulaNode.displayName = 'FormulaNode'

// ==================== Player Action node ====================

const PlayerActionNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = dataOf<{ resource: string; amount: number; cadence: number }>(data)
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[10]}
      typeLabel="PLAYER ACTION"
      label={data.label}
      subtitle={`+${d.amount ?? 0} ${d.resource ?? ''} · ~${d.cadence ?? 5}s`}
      liveValue={data.liveValue}
      handles="source-only"
    />
  )
})
PlayerActionNode.displayName = 'PlayerActionNode'

// ==================== Registry ====================

export const customNodeTypes = {
  pool:      PoolNode,
  source:    SourceNode,
  converter: ConverterNode,
  drain:     DrainNode,
  gate:      GateNode,
  chance:    ChanceNode,
  splitter:  SplitterNode,
  timer:         TimerNode,
  formula:       FormulaNode,
  player_action: PlayerActionNode,
}
