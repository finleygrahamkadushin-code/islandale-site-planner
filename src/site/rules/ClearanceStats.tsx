import { useMemo } from 'react'
import { usePlanStore } from '../../store/planStore'
import { clearanceRows } from '../../ui/selectionStats'

/**
 * The inspector's clearance rows (5E, old selection rows): To shore, To lot
 * line and To nearest for the one selected object, in the warning colour when
 * inside the buffer or setback. Worked out when the plan, setbacks or layers
 * change, never during a drag (the plan only changes on release).
 */
export function ClearanceStats({ id }: { readonly id: string }) {
  const plan = usePlanStore((s) => s.plan)
  const site = usePlanStore((s) => s.site)
  const setbacks = usePlanStore((s) => s.setbacks)
  const layers = usePlanStore((s) => s.layers)
  const single = usePlanStore((s) => s.selection.length === 1)
  const o = plan.objects[id]
  const rows = useMemo(() => (o && single ? clearanceRows(o, plan, site, setbacks, layers) : []), [o, single, plan, site, setbacks, layers])
  if (!rows.length) return null
  return (
    <dl className="clearance-stats stats small" data-testid="clearance-stats">
      {rows.map((r) => (
        <div key={r.label} className={r.warn ? 'clearance-row warn' : 'clearance-row'} data-testid="clearance-row">
          {/* the text already says what it measures to ("80'-1\" to shore"), so the label is for screen readers */}
          <dt className="sr-only">{r.label}</dt>
          <dd>{r.text}</dd>
        </div>
      ))}
    </dl>
  )
}
