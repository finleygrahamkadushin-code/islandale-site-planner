import { useEffect, useState } from 'react'
import { formatFeetInches, parseFeetInches, snapInch } from './feetInches'

interface Props {
  readonly label: string
  readonly value: number
  readonly disabled?: boolean
  readonly min?: number
  readonly onCommit: (ft: number) => void
}

/** A length typed in feet and inches (2' 9", 33 in or 2.75), snapped to the inch, committed on blur or Enter. */
export function FeetInchesField({ label, value, disabled, min = 0, onCommit }: Props) {
  const shown = formatFeetInches(value)
  const [draft, setDraft] = useState(shown)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDraft(shown)
    setError(null)
  }, [shown])

  const commit = () => {
    if (draft.trim() === shown) return
    const r = parseFeetInches(draft)
    if ('error' in r) {
      setError(r.error)
      return
    }
    if (r.ft < min) {
      setError(`At least ${formatFeetInches(min)}`)
      return
    }
    setError(null)
    const ft = snapInch(r.ft)
    if (Math.abs(ft - value) > 1e-6) onCommit(ft)
    else setDraft(shown)
  }

  return (
    <label className={`field ft-in${error ? ' bad' : ''}`} title={error ?? undefined}>
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
