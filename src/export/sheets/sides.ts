/**
 * How each elevation looks at the building, in the building frame (feet,
 * x right, z front, y up: the right-handed frame three.js rotates a
 * building's group in). The viewer stands outside the named side facing
 * the building; `u` runs left to right as they see it, `depth` grows toward
 * them, so the nearest face has the largest depth.
 */
import type { LocalPoint } from '../../buildings/footprint'
import type { ElevationSide } from './types'

export const SIDES: readonly ElevationSide[] = ['front', 'right', 'back', 'left']

export const SIDE_LABEL: Readonly<Record<ElevationSide, string>> = {
  front: 'Front elevation',
  right: 'Right elevation',
  back: 'Back elevation',
  left: 'Left elevation',
}

/** Horizontal position on the elevation, feet, left to right as seen. */
export function sideU(side: ElevationSide, [x, z]: LocalPoint): number {
  if (side === 'front') return x
  if (side === 'right') return -z
  if (side === 'back') return -x
  return z
}

/** Distance toward the viewer, feet. */
export function sideDepth(side: ElevationSide, [x, z]: LocalPoint): number {
  if (side === 'front') return z
  if (side === 'right') return x
  if (side === 'back') return -z
  return -x
}

/** Unit vector (building frame x, z) from the building toward the viewer. */
export function sideFacing(side: ElevationSide): LocalPoint {
  if (side === 'front') return [0, 1]
  if (side === 'right') return [1, 0]
  if (side === 'back') return [0, -1]
  return [-1, 0]
}
