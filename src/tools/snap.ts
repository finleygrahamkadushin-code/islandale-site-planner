import { ftToM, normalizeDeg } from '../site/units'

/**
 * Snapping, as the old planner's snapPos and snapAng do it: positions land
 * on a 1 ft grid in the site frame, turns on 5° steps. Callers decide when
 * snapping is on (the Snap toggle, and Shift held for a free drag). Part
 * handles snap in 1 in steps in the building frame instead (partHandles).
 */

export const SNAP_FT = 1
export const SNAP_DEG = 5

const STEP_M = ftToM(SNAP_FT)

/** A site coordinate (metres) on the nearest 1 ft grid line. */
export function snapSiteM(m: number): number {
  const snapped = Math.round(m / STEP_M) * STEP_M
  return snapped === 0 ? 0 : snapped
}

/** A site point (metres) on the 1 ft grid. */
export function snapPoint(p: { readonly x: number; readonly n: number }): { x: number; n: number } {
  return { x: snapSiteM(p.x), n: snapSiteM(p.n) }
}

/** A turn (degrees) on the nearest 5° step, in (-180, 180]. */
export function snapDeg(deg: number): number {
  const snapped = normalizeDeg(Math.round(deg / SNAP_DEG) * SNAP_DEG)
  return snapped === 0 ? 0 : snapped
}
