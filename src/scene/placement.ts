import { elevationAt } from '../site/terrain'
import type { Terrain } from '../site/types'
import { ftToM } from '../site/units'
import { localToSite, num, siteFootprint, type LocalPoint } from '../buildings/footprint'
import { buildingBounds, buildingMasses, massBuildingPoly } from '../buildings/masses'
import type { SitePoint } from '../site/types'
import { earthSpec, opReach, pondDepthM, pondLevelOf, type Cut, type EarthOp, type Ground } from '../site/earthworks/earthworks'
import type { PlanObject } from '../store/types'

/** Object types that sit flat on the ground at their centre, like the legacy planner's pads. */
const FLAT_TYPES = new Set(['pad', 'garden', 'septic', 'meadow', 'boulder', 'tree'])

/**
 * Elevation of an object's base, metres: pads and trees take the ground at
 * their centre (the displayed ground, cuts included, when `ground` is
 * given); buildings take the highest surveyed ground under the box round
 * all their masses, plus their lift, less any sink into the slope, as the
 * legacy planner did (o.floor = grade + lift - earthSinkM).
 */
export function baseElevation(t: Terrain, o: PlanObject, ground?: Ground): number {
  if (FLAT_TYPES.has(o.type)) return ground ? ground(o.position.x, o.position.n) : elevationAt(t, o.position.x, o.position.n)
  const corners = BUILDING_TYPES.has(o.type) ? boundsCorners(o) : siteFootprint(o)
  let zmax = -Infinity
  for (const [x, n] of corners) zmax = Math.max(zmax, elevationAt(t, x, n))
  if (!Number.isFinite(zmax)) zmax = elevationAt(t, o.position.x, o.position.n)
  return zmax + ftToM(num(o.params.lift, 0)) - ftToM(sinkFt(o))
}

/** How far a building is set into the slope (legacy earth.sink), feet. */
export function sinkFt(o: PlanObject): number {
  const e = o.params.earth
  if (!BUILDING_TYPES.has(o.type) || typeof e !== 'object' || e === null) return 0
  return Math.max(0, num((e as Record<string, unknown>).sink, 0))
}

const BUILDING_TYPES = new Set(['house', 'shop', 'shed'])

/** Whether an object reshapes the ground: a building with a berm, a sink or an earth support, or a pond (legacy earthOps). */
export function shapesGround(o: PlanObject): boolean {
  return o.type === 'pond' || earthSpec(o.type, o.params) !== null
}

/** What each earthworks object asks of the ground, in plan order (legacy earthOps). */
export function earthOps(objects: readonly PlanObject[], t: Terrain): EarthOp[] {
  return objects.flatMap((o): EarthOp[] => {
    if (o.type === 'pond') return [{ kind: 'pond', id: o.id, poly: siteFootprint(o), depth: pondDepthM(o.params) }]
    const spec = earthSpec(o.type, o.params)
    if (!spec) return []
    const masses = buildingMasses(o.params)
    const corners = boundsCorners(o).map(([x, n]) => elevationAt(t, x, n))
    return [{
      kind: 'building',
      id: o.id,
      spec,
      polys: masses.filter((m) => m.kind !== 'stair' && m.kind !== 'ramp').map((m) => massBuildingPoly(m).map((p) => localToSite(o.position, o.rotation, p))),
      main: { outline: massBuildingPoly(masses[0]), position: o.position, rotation: o.rotation },
      floor: baseElevation(t, o),
      gradeLow: Math.min(...corners),
    }]
  })
}

/**
 * The ground each earthworks object reshapes, as cuts carrying their
 * object, so groundWithCuts gives the ground the scene draws: sunk floors,
 * fill benches, berms, courts and ponds.
 */
export function earthCuts(objects: readonly PlanObject[], t: Terrain): Cut[] {
  return earthOps(objects, t).map((op) =>
    op.kind === 'pond'
      ? { polys: [op.poly], floor: pondLevelOf(op.poly, (x, n) => elevationAt(t, x, n)), op, reach: opReach(t, op) }
      : { polys: op.polys, floor: op.floor, op, reach: opReach(t, op) },
  )
}

/** The older name for earthCuts, from when only sunk floors cut the ground. */
export const sunkCuts = earthCuts

/** Corners of the box round a cabin and all its wings, site metres (legacy corners(o) via bbox(o)). */
function boundsCorners(o: PlanObject): SitePoint[] {
  const b = buildingBounds(buildingMasses(o.params))
  const box: LocalPoint[] = [[b.minx, b.minz], [b.maxx, b.minz], [b.maxx, b.maxz], [b.minx, b.maxz]]
  return box.map((p) => localToSite(o.position, o.rotation, p))
}

export function heightM(o: PlanObject): number {
  return ftToM(Math.max(0.05, num(o.params.h, 0.2)))
}
