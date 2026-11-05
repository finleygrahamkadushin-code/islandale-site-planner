import { normalizeDeg } from '../site/units'
import { TURN_KEYS } from '../buildings/parts/partKeys'
import type { PlanState } from '../store/planStore'
import { useLibraryOpen } from './libraryOpen'

/**
 * The tool keys (old planner V, P, C; plus L for the library and S for
 * Snap). While placing, R turns the ghost a quarter (Shift the other way)
 * and Q / E turn it 5°; Escape ends Place, Paint or Connect. Returns
 * whether the key was a tool key. Modifier keys are left to the caller.
 */
export function toolKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>, s: PlanState): boolean {
  const key = e.key.toLowerCase()
  const library = useLibraryOpen.getState()
  if (s.placing) {
    if (e.key === 'Escape') {
      s.setTool('select')
      return true
    }
    const turn = TURN_KEYS[key]
    if (turn !== undefined) {
      const by = key === 'r' && e.shiftKey ? -turn : turn
      s.setPlacing({ ...s.placing, rotation: normalizeDeg(s.placing.rotation + by) })
      return true
    }
  }
  if ((s.painting || s.connecting) && e.key === 'Escape') {
    s.setTool('select')
    return true
  }
  switch (key) {
    case 'v':
      library.setOpen(false)
      s.setTool('select')
      return true
    case 'l':
      library.setOpen(!library.open)
      return true
    case 's':
      s.setSnap(!s.snap)
      s.showToast(s.snap ? 'Snap off' : 'Snap on: 1 ft moves, 5° turns')
      return true
    case 'p':
      s.setTool(s.painting ? 'select' : 'paint')
      return true
    case 'c':
      s.setTool(s.connecting ? 'select' : 'connect')
      return true
    default:
      return false
  }
}
