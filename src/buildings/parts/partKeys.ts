import { buildingMasses, partName } from '../masses'
import { nudgeLocal } from './partHandles'
import { ftToM } from '../../site/units'
import { pickedPartOf, type PlanState } from '../../store/planStore'

/** What Delete on the main walls says (legacy). */
export const MAIN_DELETE_TEXT = 'Esc to select the whole building, then Delete removes it'
const NUDGE_FT = 1
const NUDGE_SHIFT_FT = 5
/** Q and E turn 5°, R a quarter turn (legacy): the picked wing here, the whole selection in useKeyboardShortcuts. */
export const TURN_KEYS: Readonly<Record<string, number>> = { q: -5, e: 5, r: 90 }
const TURNS = TURN_KEYS
const STEPS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }

/**
 * The picked part's keys (legacy wing-select): Escape drops the part (the
 * building stays selected), Delete removes a wing, arrows nudge a wing in
 * site directions (east, north; Shift 5 ft), Q/E/R turn it. Each change is
 * one undo step through the store, so locks and read-only tabs refuse it
 * with their toasts. Returns whether the key was the part's; the main
 * walls leave arrows and turns to the whole building.
 */
export function partKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>, get: () => PlanState): boolean {
  const s = get()
  const part = pickedPartOf(s)
  if (!part) return false
  if (e.key === 'Escape') {
    s.pickPart(null)
    return true
  }
  const o = s.plan.objects[part.objectId]
  const m = buildingMasses(o.params)[part.mass]
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (part.mass === 0) {
      s.showToast(MAIN_DELETE_TEXT)
      return true
    }
    const before = s.plan
    s.removeWing(part.objectId, part.mass)
    if (get().plan !== before) s.showToast(`Removed ${partName(m, part.mass)}`)
    return true
  }
  if (part.mass === 0) return false
  const step = STEPS[e.key]
  if (step) {
    const d = ftToM(e.shiftKey ? NUDGE_SHIFT_FT : NUDGE_FT)
    const [dx, dz] = nudgeLocal(o.rotation, step[0] * d, step[1] * d)
    s.updateWing(part.objectId, part.mass, { dx: round3(m.dx + dx), dz: round3(m.dz + dz) })
    return true
  }
  const turn = TURNS[e.key.toLowerCase()]
  if (turn !== undefined) {
    s.updateWing(part.objectId, part.mass, { rot: m.rot + turn })
    return true
  }
  return false
}

const round3 = (v: number) => Math.round(v * 1000) / 1000
