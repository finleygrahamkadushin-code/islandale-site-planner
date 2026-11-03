import { useEffect, useState } from 'react'

/** Text input that commits on blur or Enter, so typing is not an undo step per keystroke; empty is refused unless allowed. */
export function TextField({ label, value, disabled, allowEmpty, onCommit }: { label: string; value: string; disabled?: boolean; allowEmpty?: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const v = draft.trim()
    if ((v || allowEmpty) && v !== value) onCommit(v)
    else setDraft(value)
  }
  return (
    <label className="field">
      <span className="muted small">{label}</span>
      <input value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}

export function NumField({
  label,
  unit,
  value,
  disabled,
  min,
  step = 0.5,
  digits = 1,
  onCommit,
  onClear,
}: {
  label: string
  unit: string
  value: number
  disabled?: boolean
  min?: number
  /** The spinner step. */
  step?: number
  /** Decimals shown for a value that is not whole. */
  digits?: number
  onCommit: (v: number) => void
  /** Emptying the field: back to the default, when the field has one. */
  onClear?: () => void
}) {
  const shown = Number.isInteger(value) ? String(value) : String(+value.toFixed(digits))
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])
  const commit = () => {
    // nothing typed: the shown text may be rounded, so it is no new value
    if (draft === shown) return
    if (draft.trim() === '' && onClear) {
      setDraft(shown)
      onClear()
      return
    }
    const v = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(v) && v !== value && (min === undefined || v >= min)) onCommit(v)
    else setDraft(shown)
  }
  return (
    <label className="field">
      <span className="muted small">
        {label} <em>{unit}</em>
      </span>
      <input type="number" step={step} value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}
