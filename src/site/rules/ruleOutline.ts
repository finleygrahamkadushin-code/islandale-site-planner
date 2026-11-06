import { localToSite } from '../../buildings/footprint'
import { buildingMasses, massBuildingPoly, type Mass } from '../../buildings/masses'
import { siteFootprint } from '../../buildings/footprint'
import { baseElevation } from '../../scene/placement'
import { elevationAt } from '../terrain'
import type { SitePoint, Terrain } from '../types'
import { ftToM } from '../units'
import type { PlanObject } from '../../store/types'

/**
 * The outline the site rules measure a building from (5E, old
 * `massesForWidth`): every wall and wing in site coordinates, leaving out
 * stairs and ramps, and decks whose floor is 30 in or less above the lowest
 * ground under them. Shared by the code check and the clearances, so a
 * clearance label and its code-check row always agree. Non-buildings give
 * their own footprint.
 */

/** A deck counts toward setbacks and lot width once it is more than this high, metres (30 in). */
export const RULE_DECK_DROP_M = ftToM(2.5)

export const isRuleBuilding = (o: PlanObject): boolean => o.type === 'house'

export function ruleOutline(o: PlanObject, terrain: Terrain): readonly (readonly SitePoint[])[] {
  if (!isRuleBuilding(o)) return [siteFootprint(o)]
  const floor = baseElevation(terrain, o)
  const polys = buildingMasses(o.params)
    .filter((m) => counts(m, floor, o, terrain))
    .map((m) => massBuildingPoly(m).map((p) => localToSite(o.position, o.rotation, p)))
  return polys.length ? polys : [siteFootprint(o)]
}

/** Every point of the rule outline, flattened. */
export function rulePoints(o: PlanObject, terrain: Terrain): readonly SitePoint[] {
  return ruleOutline(o, terrain).flat()
}

function counts(m: Mass, floor: number, o: PlanObject, terrain: Terrain): boolean {
  if (m.kind === 'stair' || m.kind === 'ramp') return false
  if (m.kind !== 'deck') return true
  const top = floor + ftToM(m.lvl)
  const poly = massBuildingPoly(m).map((p) => localToSite(o.position, o.rotation, p))
  const lowest = Math.min(...poly.map(([x, n]) => elevationAt(terrain, x, n)))
  return top - lowest > RULE_DECK_DROP_M
}
