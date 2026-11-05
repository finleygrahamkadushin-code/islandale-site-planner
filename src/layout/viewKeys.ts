import type { PlanState } from '../store/planStore'
import { DISPLAY_STYLES } from '../store/types'
import { useFocusRequest } from '../scene/cameraFocus'
import { useInteriorView } from '../interiors/editor/interiorView'
import { useOpenSections } from '../ui/InspectorSection'
import { useTaskTab } from './tabs'

/**
 * The old planner's view and selection keys (4B): 1–4 pick the display
 * style; with something selected, F flies the camera to it; with one
 * cabin selected, I opens its floor plan and W its Openings. Returns
 * whether the key was one of these. Modifier keys are left to the caller.
 */
export function viewKey(e: Pick<KeyboardEvent, 'key'>, s: PlanState): boolean {
  const style = DISPLAY_STYLES[Number(e.key) - 1]
  if (/^[1-9]$/.test(e.key) && style) {
    s.setDisplayStyle(style.id)
    return true
  }
  const key = e.key.toLowerCase()
  if (key === 'f' && s.selection.length) {
    useFocusRequest.getState().flyTo(s.selection[0])
    return true
  }
  const cabin = s.selection.length === 1 && s.plan.objects[s.selection[0]]?.type === 'house' ? s.selection[0] : null
  if (key === 'i' && cabin) {
    useInteriorView.getState().open(cabin)
    return true
  }
  if (key === 'w' && cabin) {
    if (useTaskTab.getState().tab !== 'site') useTaskTab.getState().setTab('build')
    useOpenSections.getState().setOpen('openings', true)
    return true
  }
  return false
}
