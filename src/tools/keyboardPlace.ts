import { usePlanStore, type PlanState } from '../store/planStore'
import { viewCentre } from '../scene/cameraFocus'
import { announce, positionWords } from '../ui/announce'
import { libraryItem } from './library'
import { snapPoint } from './snap'
import { arrowStep } from './arrowSteps'

/**
 * Placing from the keyboard (R10.1). "Place …" in command search, or a
 * library pick made with the keyboard, starts the ghost where the view
 * looks; the arrows move it on the compass (up is north) 1 ft a press, Shift
 * 5 ft, as they nudge a selection; Q / E / R turn it (toolKeys); Enter puts it
 * down through `placeItem`, so snapping, locks and the undo step are the
 * pointer's; Escape stops (toolKeys). Each step is announced.
 */

const HOW_TO = 'Arrow keys move it 1 foot (Shift 5), Q, E and R turn it, Enter puts it down, Escape stops.'

const onGrid = (p: { x: number; n: number }, s: PlanState) => (s.snap ? snapPoint(p) : p)

/** Start placing a library item with its ghost at the view's centre, and say how to go on. */
export function startPlacingAtView(itemId: string): void {
  const s = usePlanStore.getState()
  s.setTool('place', itemId)
  const centre = viewCentre()
  const at = centre ? onGrid(centre, s) : null
  const placing = usePlanStore.getState().placing
  if (at && placing) s.setPlacing({ ...placing, at })
  const where = at ? ` at ${positionWords(at)}` : ''
  announce(`Placing ${libraryItem(itemId).name}${where}. ${HOW_TO}`)
}

/** The arrows and Enter while placing; returns whether the key was one of them. */
export function placeKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>, s: PlanState): boolean {
  const placing = s.placing
  if (!placing) return false
  const step = arrowStep(e)
  if (step) {
    const from = placing.at ?? onGrid(viewCentre() ?? { x: 0, n: 0 }, s)
    const at = { x: from.x + step[0], n: from.n + step[1] }
    s.setPlacing({ ...placing, at })
    announce(`Ghost at ${positionWords(at)}`)
    return true
  }
  if (e.key !== 'Enter') return false
  const at = placing.at ?? onGrid(viewCentre() ?? { x: 0, n: 0 }, s)
  // placeItem refuses a locked layer with the pointer's toast, and placing stays on
  const id = s.placeItem(placing.item, at, placing.rotation)
  const o = id ? usePlanStore.getState().plan.objects[id] : undefined
  if (o) announce(`Placed ${o.name} at ${positionWords(o.position)}`)
  return true
}
