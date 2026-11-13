import { usePlanStore } from '../store/planStore'
import type { ObjectId } from '../store/types'
import { useFocusRequest } from '../scene/cameraFocus'
import { announce } from '../ui/announce'
import { useAddMode } from './addMode'
import { pickedIds } from './groups'
import { isolationNow } from './isolate'

/**
 * Selecting one object from the keyboard (R10.1, command search's "Select …").
 * It picks as a click does (a group member brings its whole group, except
 * inside the group open in isolation). With Add to selection on (R10.2) it
 * adds, or takes out what is already selected, so the keyboard can build a
 * selection one entry at a time. The camera flies to it and the result is
 * announced.
 */
export function selectByKeyboard(id: ObjectId): void {
  const s = usePlanStore.getState()
  const o = s.plan.objects[id]
  if (!o) return
  const ids = pickedIds(s.plan, [id], isolationNow()?.group ?? null)
  const what = ids.length > 1 ? `${o.name} and its group, ${ids.length} objects` : o.name
  if (!useAddMode.getState().on) {
    s.select(ids)
    useFocusRequest.getState().flyTo(id)
    announce(`Selected ${what}`)
    return
  }
  const taking = ids.every((k) => s.selection.includes(k))
  const next = taking ? s.selection.filter((k) => !ids.includes(k)) : [...s.selection, ...ids.filter((k) => !s.selection.includes(k))]
  s.select(next)
  if (!taking) useFocusRequest.getState().flyTo(id)
  announce(`${taking ? 'Removed' : 'Added'} ${what}: ${next.length} selected`)
}
