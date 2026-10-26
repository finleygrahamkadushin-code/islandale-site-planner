import { elevationAt } from '../site/terrain'
import type { Terrain } from '../site/types'
import { ftToM } from '../site/units'
import { num, siteFootprint } from '../buildings/footprint'
import type { PlanObject } from '../store/types'

/** Object types that sit flat on the ground at their centre, like the legacy planner's pads. */
const FLAT_TYPES = new Set(['pad', 'garden', 'septic', 'meadow', 'boulder', 'tree'])

/**
 * Elevation of an object's base, metres: pads and trees take the ground at
 * their centre; buildings take the highest ground under their footprint plus
 * their lift, as the legacy planner did.
 */
export function baseElevation(t: Terrain, o: PlanObject): number {
  if (FLAT_TYPES.has(o.type)) return elevationAt(t, o.position.x, o.position.n)
  const corners = siteFootprint(o)
  let zmax = -Infinity
  for (const [x, n] of corners) zmax = Math.max(zmax, elevationAt(t, x, n))
  if (!Number.isFinite(zmax)) zmax = elevationAt(t, o.position.x, o.position.n)
  return zmax + ftToM(num(o.params.lift, 0))
}

export function heightM(o: PlanObject): number {
  return ftToM(Math.max(0.05, num(o.params.h, 0.2)))
}
