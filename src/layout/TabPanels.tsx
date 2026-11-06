import { usePlanStore } from '../store/planStore'
import { hasFloorPlan, NO_PLAN_TEXT, readFloors } from '../interiors/model'
import { usePresent } from '../present/present'
import { useInteriorView } from '../interiors/editor/interiorView'

/**
 * The side-panel contents only the Interior and Present tabs have (4B).
 * Interior: open the selected cabin's floor plan, with its floors and rooms
 * counted. Present: where the saved views are, until Present mode (4D).
 */

export function InteriorTabPanel() {
  const cabin = usePlanStore((s) => {
    const id = s.selection.length === 1 ? s.selection[0] : null
    const o = id ? s.plan.objects[id] : undefined
    return o?.type === 'house' ? o : null
  })
  if (!cabin) {
    return (
      <section className="panel" aria-label="Interior" data-testid="interior-tab">
        <header>
          <strong>Interior</strong>
        </header>
        <p className="muted">Pick a cabin in the view to open its floor plan.</p>
      </section>
    )
  }
  const floors = readFloors(cabin.params)
  const rooms = floors.reduce((sum, f) => sum + f.rooms.length, 0)
  return (
    <section className="panel" aria-label="Interior" data-testid="interior-tab">
      <header>
        <strong>{cabin.name}</strong>
        <span className="muted small">
          {floors.length} {floors.length === 1 ? 'floor' : 'floors'} · {rooms} {rooms === 1 ? 'room' : 'rooms'}
        </span>
      </header>
      {!hasFloorPlan(cabin.params) && (
        <p className="muted small" data-testid="no-floor-plan">
          {NO_PLAN_TEXT}
        </p>
      )}
      <button type="button" data-testid="open-interior" onClick={() => useInteriorView.getState().open(cabin.id)}>
        Open floor plan (I)
      </button>
    </section>
  )
}

export function PresentTabPanel() {
  return (
    <section className="panel" aria-label="Present" data-testid="present-tab">
      <header>
        <strong>Present</strong>
      </header>
      <p className="muted">Show the plan full screen with no editing controls: the saved views along the bottom, the sun moving from morning to golden hour, a slow orbit and a picture of any view. Escape leaves.</p>
      <button type="button" className="primary" onClick={() => usePresent.getState().enter()} data-testid="start-presenting">
        Start presenting
      </button>
    </section>
  )
}
