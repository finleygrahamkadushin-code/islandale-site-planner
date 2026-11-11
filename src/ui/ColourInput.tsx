import { useEffect, useRef } from 'react'

/**
 * A colour well that commits once, when the picker closes (the native change
 * event, as the old panel listens), not on every shade dragged through: one
 * paint, one undo step. Give it a key that includes the value, so it is
 * remounted when the value changes elsewhere (undo, another object).
 */
export function ColourInput({
  value,
  disabled,
  testId,
  label,
  onCommit,
}: {
  readonly value: string
  readonly disabled: boolean
  readonly testId: string
  readonly label: string
  readonly onCommit: (color: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onChange = () => el.value.toLowerCase() !== value.toLowerCase() && commit.current(el.value)
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [value])
  return <input ref={ref} type="color" defaultValue={value} disabled={disabled} data-testid={testId} aria-label={label} />
}
