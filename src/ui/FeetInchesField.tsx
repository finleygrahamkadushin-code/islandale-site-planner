import { useEffect, useState } from 'react'
import { formatLengthField, readLength } from './feetInches'
import { NUM_FIELD_LIMIT } from './numInput'

interface Props {
  readonly label: string
  readonly value: number
  readonly disabled?: boolean
  readonly min?: number
  readonly max?: number
  readonly onCommit: (ft: number) => void
}

/** A length typed in feet and inches (2' 9 1/2", 33 in or 2.75), shown and snapped to the quarter inch, committed on blur or Enter. */
export function FeetInchesField({ label, value, disabled, min = 0, max = NUM_FIELD_LIMIT, onCommit }: Props) {
  const shown = formatLengthField(value)
  const [draft, setDraft] = useState(shown)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDraft(shown)
    setError(null)
  }, [shown])

  const commit = () => {
    // the shown value typed back clears any error from an earlier try
    if (draft.trim() === shown) {
      setError(null)
      return
    }
    const r = readLength(draft, min, max)
    if ('error' in r) {
      setError(r.error)
      return
    }
    setError(null)
    const ft = r.ft
    if (Math.abs(ft - value) > 1e-6) onCommit(ft)
    else setDraft(shown)
  }

  return (
    <label className={`field ft-in${error ? ' bad' : ''}`}>
      <span className="muted small">{label}</span>
      <input
        value={draft}
        disabled={disabled}
        aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(shown)
            setError(null)
          }
        }}
      />
      {error && <em className="err">{error}</em>}
    </label>
  )
}
