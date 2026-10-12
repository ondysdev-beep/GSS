// NumericInput.tsx — number field that only commits valid values.
//
// `type="number"` inputs bound directly to a store value used to write 0 for
// intermediate states ("", "0.") or accept out-of-range values (dt = 0 froze
// the app). This keeps the typed text locally and calls `onCommit` only for
// finite values within [min, max]; invalid text is outlined in red and reverts
// on blur.

import { useEffect, useState } from 'react'

interface NumericInputProps {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  integer?: boolean
  className?: string
  title?: string
}

export function NumericInput({ value, onCommit, min, max, step, integer, className = '', title }: NumericInputProps) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText((prev) => (Number(prev) === value && prev.trim() !== '' ? prev : String(value)))
  }, [value])

  const accept = (raw: string): number | null => {
    let v = parseFloat(raw)
    if (!Number.isFinite(v)) return null
    if (integer) v = Math.trunc(v)
    if (min !== undefined && v < min) return null
    if (max !== undefined && v > max) return null
    return v
  }
  const valid = accept(text) !== null

  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      title={title ?? (min !== undefined || max !== undefined ? `Allowed range: ${min ?? '−∞'} – ${max ?? '∞'}` : undefined)}
      onChange={(e) => {
        setText(e.target.value)
        const v = accept(e.target.value)
        if (v !== null) onCommit(v)
      }}
      onBlur={() => setText(String(value))}
      className={`${className} ${valid ? '' : '!border-danger'}`}
    />
  )
}
