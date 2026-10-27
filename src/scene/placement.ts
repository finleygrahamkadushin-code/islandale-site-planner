import { elevationAt } from '../site/terrain'
import type { Terrain } from '../site/types'
import { ftToM } from '../site/units'
import { localToSite, num, siteFootprint, type LocalPoint } from '../buildings/footprint'
import { buildingBounds, buildingMasses } from '../buildings/masses'
import type { SitePoint } from '../site/types'
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
  const corners = BUILDING_TYPES.has(o.type) ? boundsCorners(o) : siteFootprint(o)
  let zmax = -Infinity
  for (const [x, n] of corners) zmax = Math.max(zmax, elevationAt(t, x, n))
  if (!Number.isFinite(zmax)) zmax = elevationAt(t, o.position.x, o.position.n)
  return zmax + ftToM(num(o.params.lift, 0))
}

const BUILDING_TYPES = new Set(['house', 'shop', 'shed'])

/** Corners of the box round a cabin and all its wings, site metres (legacy corners(o) via bbox(o)). */
function boundsCorners(o: PlanObject): SitePoint[] {
  const b = buildingBounds(buildingMasses(o.params))
  const box: LocalPoint[] = [[b.minx, b.minz], [b.maxx, b.minz], [b.maxx, b.maxz], [b.minx, b.maxz]]
  return box.map((p) => localToSite(o.position, o.rotation, p))
}

export function heightM(o: PlanObject): number {
  return ftToM(Math.max(0.05, num(o.params.h, 0.2)))
}
