import type { Extent } from './Page'
import type { Scale, SheetBuilding } from './types'

/** The class of a clean copy's svg (the dimensioned drawings keep `.sheet-svg`). */
export const CLEAN_SVG_CLASS = 'clean-svg'

/** Clear paper round a clean copy's drawing, inches. */
export const CLEAN_MARGIN_IN = 0.25

/** The clear paper round a clean copy, in drawing feet at a scale. */
export const cleanMarginFt = (scale: Scale): number => CLEAN_MARGIN_IN / scale

/**
 * A clean plan's reach: the building's own bounds (eaves and steps included)
 * and a little clear paper. With no dimensions to hold, it usually fits a
 * larger scale than the dimensioned plan.
 */
export function cleanPlanExtent(b: SheetBuilding, scale: Scale): Extent {
  const m = cleanMarginFt(scale)
  const { minx, maxx, minz, maxz } = b.bounds
  return { x: minx - m, y: minz - m, w: maxx - minx + 2 * m, h: maxz - minz + 2 * m }
}
