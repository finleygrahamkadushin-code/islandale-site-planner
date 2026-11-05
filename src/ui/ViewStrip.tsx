import { usePlanStore } from '../store/planStore'
import { SAVED_VIEWS } from '../scene/views'
import { Tip } from '../guide/Tip'

/** Saved camera views along the bottom of the 3D view, and the Roofs off switch. */
export function ViewStrip() {
  const requestView = usePlanStore((s) => s.requestView)
  const current = usePlanStore((s) => s.viewRequest?.id)
  const roofsOff = usePlanStore((s) => s.roofsOff)
  const setRoofsOff = usePlanStore((s) => s.setRoofsOff)
  return (
    <nav className="viewstrip" aria-label="Saved views">
      {SAVED_VIEWS.map((v) => (
        <Tip key={v.id} label={v.hint}>
          <button className={current === v.id ? 'on' : ''} onClick={() => requestView(v.id)}>
            {v.label}
          </button>
        </Tip>
      ))}
      <Tip label="Hide the roofs to see the rooms inside">
        <button className={roofsOff ? 'on' : ''} aria-pressed={roofsOff} data-testid="roofs-off" onClick={() => setRoofsOff(!roofsOff)}>
          Roofs off
        </button>
      </Tip>
    </nav>
  )
}
