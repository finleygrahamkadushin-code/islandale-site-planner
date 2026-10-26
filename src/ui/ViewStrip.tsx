import { usePlanStore } from '../store/planStore'
import { SAVED_VIEWS } from '../scene/views'

/** Saved camera views along the bottom of the 3D view. */
export function ViewStrip() {
  const requestView = usePlanStore((s) => s.requestView)
  const current = usePlanStore((s) => s.viewRequest?.id)
  return (
    <nav className="viewstrip" aria-label="Saved views">
      {SAVED_VIEWS.map((v) => (
        <button key={v.id} className={current === v.id ? 'on' : ''} title={v.hint} onClick={() => requestView(v.id)}>
          {v.label}
        </button>
      ))}
    </nav>
  )
}
