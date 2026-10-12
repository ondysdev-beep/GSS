// NodeInspector.tsx — Postranní panel pro editaci vlastností vybraného uzlu

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { NodeType } from '../../types/graph'
import type { NodeData } from '../../types/graph'
import { NODE_TYPE_COLORS, NODE_TYPE_NAMES } from './nodeCatalog'
import { validateFormulaSyntax } from '../../core/FormulaEvaluator'

// ==================== Pomocné UI komponenty ====================

interface FieldProps {
  label: string
  children: ReactNode
  hint?: string
}

function Field({ label, children, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted uppercase tracking-widest">{label}</label>
      {children}
      {hint && <span className="text-[9px] text-muted leading-snug">{hint}</span>}
    </div>
  )
}

interface TextInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** id of a <datalist> with suggestions */
  list?: string
}

function TextInput({ value, onChange, placeholder, list }: TextInputProps) {
  return (
    <input
      type="text"
      value={value}
      list={list}
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

/**
 * Číselné pole s lokálním textovým stavem: dřív se každý mezistav ("", "-",
 * "0.") okamžitě převedl na 0 a zapsal do grafu (nešlo pole smazat a napsat
 * novou hodnotu, kapacita na chvíli 0 → chyba validace). Hodnota se zapíše jen
 * když je to platné číslo v povoleném rozsahu; jinak se pole zvýrazní.
 */
function NumberInput({ value, onChange, min, max, step = 1 }: NumberInputProps) {
  const [text, setText] = useState(String(value))
  // Externí změna (undo, jiný uzel) přepíše text, ale nerozbije rozepsanou hodnotu.
  useEffect(() => {
    setText((prev) => (Number(prev) === value && prev.trim() !== '' ? prev : String(value)))
  }, [value])

  const parsed = parseFloat(text)
  const valid = Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)

  return (
    <input
      type="number"
      value={text}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        const n = parseFloat(t)
        if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n)
      }}
      onBlur={() => setText(String(value))}
      min={min}
      max={max}
      step={step}
      title={min !== undefined || max !== undefined ? `Allowed range: ${min ?? '−∞'} – ${max ?? '∞'}` : undefined}
      className={`px-2 py-1.5 bg-bg border rounded text-xs text-white focus:outline-none transition-colors ${valid ? 'border-border focus:border-accent' : 'border-danger'}`}
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
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="px-2 py-1.5 bg-bg border border-border rounded text-xs text-white focus:outline-none focus:border-accent transition-colors"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

type FieldsProps = { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void }

const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const s = (v: unknown) => (typeof v === 'string' ? v : '')

// ==================== Formuláře pro jednotlivé typy uzlů ====================

function PoolFields({ data, onChange }: FieldsProps) {
  const capacity = n(data.capacity, 100)
  return (
    <>
      <Field label="Resource">
        <TextInput value={s(data.resource)} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Capacity">
        <NumberInput value={capacity} onChange={(v) => onChange('capacity', v)} min={0.01} step={10} />
      </Field>
      <Field label="Initial Amount" hint={n(data.initial_amount, 0) > capacity ? 'Above capacity — the pool starts at its capacity.' : undefined}>
        <NumberInput value={n(data.initial_amount, 0)} onChange={(v) => onChange('initial_amount', v)} min={0} step={1} />
      </Field>
    </>
  )
}

function SourceFields({ data, onChange }: FieldsProps) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={s(data.resource)} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Rate (per second)">
        <NumberInput value={n(data.rate, 1)} onChange={(v) => onChange('rate', v)} min={0} step={1} />
      </Field>
    </>
  )
}

function ConverterFields({ data, onChange }: FieldsProps) {
  return (
    <>
      <Field label="Input Resource">
        <TextInput value={s(data.input_resource)} onChange={(v) => onChange('input_resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Input Amount (per cycle)">
        <NumberInput value={n(data.input_amount, 1)} onChange={(v) => onChange('input_amount', v)} min={0.01} step={0.5} />
      </Field>
      <Field label="Output Resource">
        <TextInput value={s(data.output_resource)} onChange={(v) => onChange('output_resource', v)} placeholder="XP" />
      </Field>
      <Field label="Output Amount (per cycle)">
        <NumberInput value={n(data.output_amount, 1)} onChange={(v) => onChange('output_amount', v)} min={0.01} step={0.5} />
      </Field>
      <Field label="Cycle Time (seconds)">
        <NumberInput value={n(data.cycle_time, 1)} onChange={(v) => onChange('cycle_time', v)} min={0.01} step={0.5} />
      </Field>
    </>
  )
}

function DrainFields({ data, onChange }: FieldsProps) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={s(data.resource)} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Rate (per second)">
        <NumberInput value={n(data.rate, 1)} onChange={(v) => onChange('rate', v)} min={0} step={1} />
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

function GateFields({ data, onChange, resourceNames }: FieldsProps & { resourceNames: string[] }) {
  const variable = s(data.variable)
  const unknown = variable.trim() !== '' && !resourceNames.includes(variable)
  return (
    <>
      {/* Gate porovnává CELKOVÉ množství resource napříč všemi pooly podle
          jména — dřív popisek tvrdil "Pool ID", takže gate s ID poolu se
          nikdy neotevřel. */}
      <Field
        label="Resource (total of all pools)"
        hint={unknown ? `No node uses a resource named "${variable}".` : 'Open gates pass flow through; closed gates block it.'}
      >
        <TextInput value={variable} onChange={(v) => onChange('variable', v)} placeholder="Gold" list="gss-resource-names" />
      </Field>
      <Field label="Operator">
        <SelectInput value={n(data.operator, 0)} options={OPERATOR_OPTIONS} onChange={(v) => onChange('operator', v)} />
      </Field>
      <Field label="Threshold">
        <NumberInput value={n(data.value, 0)} onChange={(v) => onChange('value', v)} step={1} />
      </Field>
    </>
  )
}

function ChanceFields({ data, onChange }: FieldsProps) {
  const chance = n(data.success_chance, 50)
  return (
    <Field label={`Success Chance: ${chance}%`} hint="Success → green output (port 0), failure → red output (port 1).">
      <input
        type="range"
        min={0}
        max={100}
        value={chance}
        onChange={(e) => onChange('success_chance', parseInt(e.target.value, 10))}
        className="w-full accent-accent h-1.5 cursor-pointer"
      />
    </Field>
  )
}

const SPLIT_MODE_OPTIONS = [
  { value: 0, label: 'Equal split' },
  { value: 1, label: 'Weighted split' },
]

function SplitterFields({ data, onChange }: FieldsProps) {
  return (
    <>
      <Field label="Split Mode">
        <SelectInput value={n(data.split_mode, 0)} options={SPLIT_MODE_OPTIONS} onChange={(v) => onChange('split_mode', v)} />
      </Field>
      <Field label="Output Count" hint="Flow is divided across ALL connected outputs; this is the number of weights you plan to use.">
        <NumberInput value={n(data.output_count, 2)} onChange={(v) => onChange('output_count', Math.round(v))} min={1} max={16} step={1} />
      </Field>
      <Field label="Weights (comma-separated)" hint="Applied to outputs in connection order; missing weights count as 1.">
        <TextInput value={typeof data.weights === 'string' ? data.weights : '1,1'} onChange={(v) => onChange('weights', v)} placeholder="1,1,1" />
      </Field>
    </>
  )
}

function TimerFields({ data, onChange }: FieldsProps) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={s(data.resource)} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Amount per pulse">
        <NumberInput value={n(data.amount, 100)} onChange={(v) => onChange('amount', v)} min={0} step={1} />
      </Field>
      <Field label="Interval (seconds)">
        <NumberInput value={n(data.interval, 60)} onChange={(v) => onChange('interval', v)} min={0.001} step={1} />
      </Field>
    </>
  )
}

function FormulaFields({ data, onChange }: FieldsProps) {
  const expression = s(data.expression)
  const error = expression.trim() !== '' ? validateFormulaSyntax(expression) : null
  return (
    <>
      <Field label="Expression (per second)">
        <TextInput value={expression} onChange={(v) => onChange('expression', v)} placeholder="level * 1.2" />
      </Field>
      {error && (
        <div className="text-[10px] text-danger">Invalid expression: {error.message}</div>
      )}
      <div className="text-[10px] text-muted">
        Available variables: resource names (summed across all pools) + <code>tick</code>. Supports +, -, *, /, parentheses.
        The result is a rate per second; negative results produce nothing.
      </div>
      <Field label="Output Resource">
        <TextInput value={s(data.output_resource)} onChange={(v) => onChange('output_resource', v)} placeholder="XP" />
      </Field>
    </>
  )
}

function PlayerActionFields({ data, onChange }: FieldsProps) {
  return (
    <>
      <Field label="Resource">
        <TextInput value={s(data.resource)} onChange={(v) => onChange('resource', v)} placeholder="Gold" />
      </Field>
      <Field label="Amount per action">
        <NumberInput value={n(data.amount, 10)} onChange={(v) => onChange('amount', v)} min={0} step={1} />
      </Field>
      <Field label="Average cadence (seconds)">
        <NumberInput value={n(data.cadence, 5)} onChange={(v) => onChange('cadence', v)} min={0.001} step={1} />
      </Field>
      <div className="text-[10px] text-muted">
        Simulates a player triggering this roughly once every that many seconds (stochastic, not exact like Timer).
      </div>
    </>
  )
}

// ==================== Hlavní komponenta ====================

interface NodeInspectorProps {
  selectedNodeId: string | null
}

export function NodeInspector({ selectedNodeId }: NodeInspectorProps) {
  const { graph, updateNode } = useGraphStore()

  const node = selectedNodeId
    ? graph.nodes.find((x) => x.id === selectedNodeId) ?? null
    : null

  const resourceNames = useMemo(() => {
    const names = new Set<string>()
    for (const x of graph.nodes) {
      const d = (x.data ?? {}) as unknown as Record<string, unknown>
      for (const key of ['resource', 'output_resource']) {
        if (typeof d[key] === 'string' && d[key]) names.add(d[key] as string)
      }
    }
    return [...names].sort()
  }, [graph.nodes])

  const updateField = useCallback(
    (key: string, value: unknown) => {
      if (!node) return
      // mergeKey: psaní do jednoho pole = jeden krok undo (ne krok na každou klávesu)
      updateNode(node.id, {
        data: { ...((node.data ?? {}) as unknown as Record<string, unknown>), [key]: value } as unknown as NodeData,
      }, `node:${node.id}:${key}`)
    },
    [node, updateNode],
  )

  const updateLabel = useCallback(
    (label: string) => {
      if (!node) return
      updateNode(node.id, { label }, `node:${node.id}:label`)
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
  const typeLabel = NODE_TYPE_NAMES[node.type] ?? 'Unknown node'
  const data = (node.data ?? {}) as unknown as Record<string, unknown>

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto h-full">
      <datalist id="gss-resource-names">
        {resourceNames.map((r) => <option key={r} value={r} />)}
      </datalist>

      {/* Hlavička */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color }}>
          {typeLabel}
        </span>
        <span className="text-muted text-[9px] ml-auto font-mono truncate max-w-[90px]" title={node.id}>{node.id}</span>
      </div>

      {/* Název uzlu */}
      <Field label="Node Name">
        <TextInput value={node.label ?? ''} onChange={updateLabel} placeholder="Name..." />
      </Field>

      {/* Pole dle typu — `key` resetuje lokální stav polí při přepnutí uzlu */}
      <div key={node.id} className="flex flex-col gap-3">
        {node.type === NodeType.POOL      && <PoolFields      data={data} onChange={updateField} />}
        {node.type === NodeType.SOURCE    && <SourceFields    data={data} onChange={updateField} />}
        {node.type === NodeType.CONVERTER && <ConverterFields data={data} onChange={updateField} />}
        {node.type === NodeType.DRAIN     && <DrainFields     data={data} onChange={updateField} />}
        {node.type === NodeType.GATE      && <GateFields      data={data} onChange={updateField} resourceNames={resourceNames} />}
        {node.type === NodeType.CHANCE    && <ChanceFields    data={data} onChange={updateField} />}
        {node.type === NodeType.SPLITTER  && <SplitterFields  data={data} onChange={updateField} />}
        {node.type === NodeType.TIMER         && <TimerFields         data={data} onChange={updateField} />}
        {node.type === NodeType.FORMULA       && <FormulaFields       data={data} onChange={updateField} />}
        {node.type === NodeType.PLAYER_ACTION && <PlayerActionFields  data={data} onChange={updateField} />}
      </div>
    </div>
  )
}
