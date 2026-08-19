// NodeInspector.tsx — Postranní panel pro editaci vlastností vybraného uzlu

import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { NodeType } from '../../types/graph'
import type { NodeData } from '../../types/graph'
import { NODE_TYPE_COLORS } from './NodeTypes'
import { validateFormulaSyntax } from '../../core/FormulaEvaluator'

// ==================== Pomocné UI komponenty ====================

interface FieldProps {
  label: string
  children: ReactNode
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}

interface TextInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function TextInput({ value, onChange, placeholder }: TextInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="px-2 py-1.5 bg-bg border border-border rounded text-xs text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
    />
  )
}

interface NumberInputProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}

function NumberInput({ value, onChange, min, max, step = 1 }: NumberInputProps) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className="px-2 py-1.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
    />
  )
}

interface SelectInputProps {
  value: number
  options: { value: number; label: string }[]
  onChange: (v: number) => void
}

function SelectInput({ value, options, onChange }: SelectInputProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="px-2 py-1.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

// ==================== Formuláře pro jednotlivé typy uzlů ====================

function PoolFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={(data.resource as string) ?? ''} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Capacity">
        <NumberInput value={(data.capacity as number) ?? 100} onChange={(v) => onChange('capacity', v)} min={0.01} step={10} />
      </Field>
      <Field label="Initial Amount">
        <NumberInput value={(data.initial_amount as number) ?? 0} onChange={(v) => onChange('initial_amount', v)} min={0} step={1} />
      </Field>
    </>
  )
}

function SourceFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={(data.resource as string) ?? ''} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Rate (per tick)">
        <NumberInput value={(data.rate as number) ?? 10} onChange={(v) => onChange('rate', v)} min={0} step={1} />
      </Field>
    </>
  )
}

function ConverterFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Input Resource">
        <TextInput value={(data.input_resource as string) ?? ''} onChange={(v) => onChange('input_resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Input Amount">
        <NumberInput value={(data.input_amount as number) ?? 1} onChange={(v) => onChange('input_amount', v)} min={0.01} step={0.5} />
      </Field>
      <Field label="Output Resource">
        <TextInput value={(data.output_resource as string) ?? ''} onChange={(v) => onChange('output_resource', v)} placeholder="XP" />
      </Field>
      <Field label="Output Amount">
        <NumberInput value={(data.output_amount as number) ?? 1} onChange={(v) => onChange('output_amount', v)} min={0.01} step={0.5} />
      </Field>
      <Field label="Cycle Time (ticks)">
        <NumberInput value={(data.cycle_time as number) ?? 1} onChange={(v) => onChange('cycle_time', v)} min={0.01} step={0.5} />
      </Field>
    </>
  )
}

function DrainFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={(data.resource as string) ?? ''} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Rate (per tick)">
        <NumberInput value={(data.rate as number) ?? 5} onChange={(v) => onChange('rate', v)} min={0} step={1} />
      </Field>
    </>
  )
}

const OPERATOR_OPTIONS = [
  { value: 0, label: '> greater than' },
  { value: 1, label: '≥ greater or equal' },
  { value: 2, label: '< less than' },
  { value: 3, label: '≤ less or equal' },
  { value: 4, label: '= equals' },
  { value: 5, label: '≠ not equals' },
]

function GateFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Variable (Pool ID)">
        <TextInput value={(data.variable as string) ?? ''} onChange={(v) => onChange('variable', v)} placeholder="pool1" />
      </Field>
      <Field label="Operator">
        <SelectInput value={(data.operator as number) ?? 0} options={OPERATOR_OPTIONS} onChange={(v) => onChange('operator', v)} />
      </Field>
      <Field label="Threshold">
        <NumberInput value={(data.value as number) ?? 0} onChange={(v) => onChange('value', v)} step={1} />
      </Field>
    </>
  )
}

function ChanceFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <Field label={`Success Chance: ${(data.success_chance as number) ?? 50}%`}>
      <input
        type="range"
        min={0}
        max={100}
        value={(data.success_chance as number) ?? 50}
        onChange={(e) => onChange('success_chance', parseInt(e.target.value))}
        className="w-full accent-accent h-1.5 cursor-pointer"
      />
    </Field>
  )
}

const SPLIT_MODE_OPTIONS = [
  { value: 0, label: 'Equal split' },
  { value: 1, label: 'Weighted split' },
]

function SplitterFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Split Mode">
        <SelectInput value={(data.split_mode as number) ?? 0} options={SPLIT_MODE_OPTIONS} onChange={(v) => onChange('split_mode', v)} />
      </Field>
      <Field label="Output Count">
        <NumberInput value={(data.output_count as number) ?? 2} onChange={(v) => onChange('output_count', v)} min={2} max={8} step={1} />
      </Field>
      <Field label="Weights (comma-separated)">
        <TextInput value={(data.weights as string) ?? '1,1'} onChange={(v) => onChange('weights', v)} placeholder="1,1,1" />
      </Field>
    </>
  )
}

function TimerFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={(data.resource as string) ?? ''} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Amount per pulse">
        <NumberInput value={(data.amount as number) ?? 100} onChange={(v) => onChange('amount', v)} min={0} step={1} />
      </Field>
      <Field label="Interval (seconds)">
        <NumberInput value={(data.interval as number) ?? 60} onChange={(v) => onChange('interval', v)} min={0.001} step={1} />
      </Field>
    </>
  )
}

function FormulaFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const expression = (data.expression as string) ?? ''
  const error = expression.trim() !== '' ? validateFormulaSyntax(expression) : null
  return (
    <>
      <Field label="Expression">
        <TextInput value={expression} onChange={(v) => onChange('expression', v)} placeholder="level * 1.2" />
      </Field>
      {error && (
        <div className="text-[10px] text-danger">Invalid expression: {error.message}</div>
      )}
      <div className="text-[10px] text-muted">
        Available variables: resource names (summed across all pools) + <code>tick</code>. Supports +, -, *, /, parentheses.
      </div>
      <Field label="Output Resource">
        <TextInput value={(data.output_resource as string) ?? ''} onChange={(v) => onChange('output_resource', v)} placeholder="XP" />
      </Field>
    </>
  )
}

function PlayerActionFields({ data, onChange }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={(data.resource as string) ?? ''} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Amount per action">
        <NumberInput value={(data.amount as number) ?? 10} onChange={(v) => onChange('amount', v)} min={0} step={1} />
      </Field>
      <Field label="Average cadence (seconds)">
        <NumberInput value={(data.cadence as number) ?? 5} onChange={(v) => onChange('cadence', v)} min={0.001} step={1} />
      </Field>
      <div className="text-[10px] text-muted">
        Simulates a player triggering this roughly once every that many seconds (stochastic, not exact like Timer).
      </div>
    </>
  )
}

// ==================== Hlavní komponenta ====================

const TYPE_LABELS: Record<number, string> = {
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

interface NodeInspectorProps {
  selectedNodeId: string | null
}

export function NodeInspector({ selectedNodeId }: NodeInspectorProps) {
  const { graph, updateNode } = useGraphStore()

  const node = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  const updateField = useCallback(
    (key: string, value: unknown) => {
      if (!node) return
      updateNode(node.id, {
        data: { ...node.data, [key]: value } as NodeData,
      })
    },
    [node, updateNode],
  )

  const updateLabel = useCallback(
    (label: string) => {
      if (!node) return
      updateNode(node.id, { label })
    },
    [node, updateNode],
  )

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-xs p-4 text-center">
        Click a node to edit its properties
      </div>
    )
  }

  const color = NODE_TYPE_COLORS[node.type] ?? '#6b7280'
  const typeLabel = TYPE_LABELS[node.type] ?? 'Uzel'
  const data = node.data as unknown as Record<string, unknown>

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto h-full">
      {/* Hlavička */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color }}>
          {typeLabel}
        </span>
        <span className="text-muted text-[9px] ml-auto font-mono">{node.id}</span>
      </div>

      {/* Název uzlu */}
      <Field label="Node Name">
        <TextInput value={node.label} onChange={updateLabel} placeholder="Name..." />
      </Field>

      {/* Pole dle typu */}
      {node.type === NodeType.POOL      && <PoolFields      data={data} onChange={updateField} />}
      {node.type === NodeType.SOURCE    && <SourceFields    data={data} onChange={updateField} />}
      {node.type === NodeType.CONVERTER && <ConverterFields data={data} onChange={updateField} />}
      {node.type === NodeType.DRAIN     && <DrainFields     data={data} onChange={updateField} />}
      {node.type === NodeType.GATE      && <GateFields      data={data} onChange={updateField} />}
      {node.type === NodeType.CHANCE    && <ChanceFields    data={data} onChange={updateField} />}
      {node.type === NodeType.SPLITTER  && <SplitterFields  data={data} onChange={updateField} />}
      {node.type === NodeType.TIMER         && <TimerFields         data={data} onChange={updateField} />}
      {node.type === NodeType.FORMULA       && <FormulaFields       data={data} onChange={updateField} />}
      {node.type === NodeType.PLAYER_ACTION && <PlayerActionFields  data={data} onChange={updateField} />}
    </div>
  )
}
