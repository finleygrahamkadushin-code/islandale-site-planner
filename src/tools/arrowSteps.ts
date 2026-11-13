import { ftToM } from '../site/units'

const STEP_FT = 1
const SHIFT_STEP_FT = 5

/**
 * What an arrow key moves by, as [east, north] in metres (R10.1). The arrows
 * follow the compass, not the screen: up is north and right is east whichever
 * way the camera faces, 1 ft a press and 5 ft with Shift. The selection's
 * nudge and the ghost while placing both use this, so they always agree.
 */
export function arrowStep(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): [number, number] | null {
  const step = ftToM(e.shiftKey ? SHIFT_STEP_FT : STEP_FT)
  switch (e.key) {
    case 'ArrowUp':
      return [0, step]
    case 'ArrowDown':
      return [0, -step]
    case 'ArrowRight':
      return [step, 0]
    case 'ArrowLeft':
      return [-step, 0]
    default:
      return null
  }
}
