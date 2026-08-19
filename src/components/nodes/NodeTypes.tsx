// NodeTypes.tsx — Custom ReactFlow node components for all 7 GSS node types

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { NodeData } from '../../types/graph'

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
  handles?: 'source-only' | 'target-only' | 'both' | 'none'
  badge?: string
  liveValue?: string
}

function NodeShell({ color, typeLabel, label, subtitle, fillPct, handles = 'both', badge, liveValue }: BaseNodeProps) {
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
        {subtitle && (
          <div className="text-muted text-[10px] truncate mt-0.5">{subtitle}</div>
        )}
      </div>

      {/* ReactFlow handles */}
      {(handles === 'target-only' || handles === 'both') && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !border-2"
          style={{ background: color, borderColor: '#0a0a14' }}
        />
      )}
      {(handles === 'source-only' || handles === 'both') && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !border-2"
          style={{ background: color, borderColor: '#0a0a14' }}
        />
      )}
    </div>
  )
}

// ==================== Pool node ====================

const PoolNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { resource?: string; capacity?: number; initial_amount?: number }
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[0]}
      typeLabel="POOL"
      label={data.label}
      subtitle={`${d.resource ?? ''} · cap ${d.capacity ?? 0}`}
      fillPct={data.fillPct}
      liveValue={data.liveValue}
      handles="both"
    />
  )
})
PoolNode.displayName = 'PoolNode'

// ==================== Source node ====================

const SourceNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { resource?: string; rate?: number }
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[1]}
      typeLabel="SOURCE"
      label={data.label}
      subtitle={`${d.resource ?? ''} +${d.rate ?? 0}/tick`}
      handles="source-only"
    />
  )
})
SourceNode.displayName = 'SourceNode'

// ==================== Converter node ====================

const ConverterNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { input_resource?: string; input_amount?: number; output_resource?: string; output_amount?: number; cycle_time?: number }
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[2]}
      typeLabel="CONVERTER"
      label={data.label}
      subtitle={`${d.input_amount ?? 0} ${d.input_resource ?? ''} → ${d.output_amount ?? 0} ${d.output_resource ?? ''}`}
      handles="both"
    />
  )
})
ConverterNode.displayName = 'ConverterNode'

// ==================== Drain node ====================

const DrainNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { resource?: string; rate?: number }
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[3]}
      typeLabel="DRAIN"
      label={data.label}
      subtitle={`${d.resource ?? ''} -${d.rate ?? 0}/tick`}
      handles="target-only"
    />
  )
})
DrainNode.displayName = 'DrainNode'

// ==================== Gate node ====================

const GATE_OP_LABELS: Record<number, string> = { 0: '>', 1: '≥', 2: '<', 3: '≤', 4: '=', 5: '≠' }

const GateNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { variable?: string; operator?: number; value?: number }
  const op = GATE_OP_LABELS[d.operator ?? 0] ?? '>'
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[4]}
      typeLabel="GATE"
      label={data.label}
      subtitle={`${d.variable ?? ''} ${op} ${d.value ?? 0}`}
      badge={data.isActive ? 'GATE ✓' : 'GATE ✗'}
      handles="both"
    />
  )
})
GateNode.displayName = 'GateNode'

// ==================== Chance node ====================

const ChanceNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { success_chance?: number }
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[5]}
      typeLabel="CHANCE"
      label={data.label}
      subtitle={`${d.success_chance ?? 50}% success`}
      handles="both"
    />
  )
})
ChanceNode.displayName = 'ChanceNode'

// ==================== Splitter node ====================

const SplitterNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { split_mode?: number; output_count?: number; weights?: string }
  const modeLabel = d.split_mode === 1 ? 'Weighted' : 'Equal'
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[7]}
      typeLabel="SPLITTER"
      label={data.label}
      subtitle={`${modeLabel} · ${d.output_count ?? 2} outputs`}
      handles="both"
    />
  )
})
SplitterNode.displayName = 'SplitterNode'

// ==================== Timer node ====================

const TimerNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { resource?: string; amount?: number; interval?: number }
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
  const d = data.data as { expression?: string; output_resource?: string }
  return (
    <NodeShell
      color={NODE_TYPE_COLORS[9]}
      typeLabel="FORMULA"
      label={data.label}
      subtitle={`${d.expression ?? '0'} → ${d.output_resource ?? ''}`}
      liveValue={data.liveValue}
      handles="source-only"
    />
  )
})
FormulaNode.displayName = 'FormulaNode'

// ==================== Player Action node ====================

const PlayerActionNode = memo(({ data }: NodeProps<GSSNodeData>) => {
  const d = data.data as { resource?: string; amount?: number; cadence?: number }
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
