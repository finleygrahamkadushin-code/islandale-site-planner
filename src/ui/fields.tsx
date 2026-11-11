import { useEffect, useState, type ReactNode } from 'react'
import { readNumber } from './numInput'

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

/**
 * A number committed on blur or Enter. A number out of bounds (the field's own,
 * or ±NUM_FIELD_LIMIT) or not a number is refused with a message under the
 * field; Escape puts the shown value back. Emptying it clears to the default
 * when the field has one.
 */
export function NumField({
  label,
  unit,
  value,
  disabled,
  min,
  max,
  step = 0.5,
  digits = 1,
  onCommit,
  onClear,
}: {
  label: ReactNode
  unit: string
  value: number
  disabled?: boolean
  min?: number
  max?: number
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
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDraft(shown)
    setError(null)
  }, [shown])
  const cancel = () => {
    setDraft(shown)
    setError(null)
  }
  const commit = () => {
    // nothing typed: the shown text may be rounded, so it is no new value
    if (draft === shown) return setError(null)
    if (draft.trim() === '' && onClear) {
      cancel()
      onClear()
      return
    }
    const r = readNumber(draft, { min, max, unit })
    if ('error' in r) return setError(r.error)
    setError(null)
    if (r.value !== value) onCommit(r.value)
    else setDraft(shown)
  }
  return (
    <label className={`field num${error ? ' bad' : ''}`}>
      <span className="muted small">
        {label} <em>{unit}</em>
      </span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') cancel()
        }}
      />
      {error && <em className="err">{error}</em>}
    </label>
  )
}
