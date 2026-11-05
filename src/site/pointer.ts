import { create } from 'zustand'
import { FT_PER_M } from './units'

/**
 * The pointer readout (4B, old cursor elevation and slope): the ground
 * under the pointer, with earthworks applied, as feet NAVD88 and the
 * steepest slope in percent. The pointer's site point is view state.
 */

/** Half the span the slope is read over, metres (about 1.6 ft each way). */
const SLOPE_HALF_SPAN_M = 0.5

export interface GroundReadout {
  readonly elevFt: number
  readonly slopePct: number
}

export function groundReadout(ground: (x: number, n: number) => number, x: number, n: number): GroundReadout {
  const h = SLOPE_HALF_SPAN_M
  const dzdx = (ground(x + h, n) - ground(x - h, n)) / (2 * h)
  const dzdn = (ground(x, n + h) - ground(x, n - h)) / (2 * h)
  const slope = Math.hypot(dzdx, dzdn) * 100
  return { elevFt: ground(x, n) * FT_PER_M, slopePct: slope < 1e-9 ? 0 : slope }
}

/** Where the pointer is on the ground (site metres), or null off the ground. */
export const usePointerGround = create<{ readonly at: { readonly x: number; readonly n: number } | null; readonly setAt: (at: { x: number; n: number } | null) => void }>((set) => ({
  at: null,
  setAt: (at) => set({ at }),
}))
