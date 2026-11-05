import { normalizeDeg } from '../site/units'
import { TURN_KEYS } from '../buildings/parts/partKeys'
import type { PlanState } from '../store/planStore'
import type { ToolId } from '../store/toolActions'
import { TAB_TOOLS, useTaskTab } from '../layout/tabs'
import { useLibraryOpen } from './libraryOpen'

/** The key that switches to each tool (old planner V, P, C, M; plus L for the library). */
const TOOL_KEYS: Readonly<Record<string, ToolId>> = { v: 'select', l: 'place', p: 'paint', c: 'connect', m: 'measure' }

/**
 * The tool keys. A key only switches to a tool the current tab has; S
 * toggles Snap. While placing, R turns the ghost a quarter (Shift the other
 * way) and Q / E turn it 5°. Escape drops a half-made measurement, then
 * ends Place, Paint, Connect or Measure. Returns whether the key was a tool
 * key. Modifier keys are left to the caller.
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
  if (e.key === 'Escape') {
    if (s.measuring?.a) {
      s.dropMeasurePoint()
      return true
    }
    if (s.painting || s.connecting || s.measuring) {
      s.setTool('select')
      return true
    }
    return false
  }
  if (key === 's') {
    s.setSnap(!s.snap)
    s.showToast(s.snap ? 'Snap off' : 'Snap on: 1 ft moves, 5° turns')
    return true
  }
  const tool = TOOL_KEYS[key]
  if (!tool || !TAB_TOOLS[useTaskTab.getState().tab].includes(tool)) return false
  if (tool === 'place') library.setOpen(!library.open)
  else if (tool === 'select') {
    library.setOpen(false)
    s.setTool('select')
  } else {
    const on = (tool === 'paint' && s.painting) || (tool === 'connect' && !!s.connecting) || (tool === 'measure' && !!s.measuring)
    s.setTool(on ? 'select' : tool)
  }
  return true
}
