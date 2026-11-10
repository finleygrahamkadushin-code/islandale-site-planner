import { localToSite, siteFootprint } from '../../buildings/footprint'
import { buildingMasses, massBuildingPoly, type Mass } from '../../buildings/masses'
import { baseElevation } from '../../scene/placement'
import { withShedDefaults } from '../objects/shedLibrary'
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
 *
 * Which objects each rule counts (Finley's decision 3, default of Nov 10
 * 2026): cabins, sheds, shops and pools for the shoreline buffer and the
 * height limit; those and standalone decks over 30 in for the side setback
 * and the inside-the-lot row. The lot-width rule still counts cabins only.
 */

/** A deck counts toward setbacks and lot width once it is more than this high, metres (30 in; assumed, see ruleSources). */
export const RULE_DECK_DROP_M = ftToM(2.5)

/** Built like a cabin, out of walls, roofs and wings (the old planner's isBuilding). */
const MASSED_TYPES = new Set(['house', 'shed', 'shop'])
/** Counted for the shoreline buffer and the height limit. */
const STRUCTURE_TYPES = new Set([...MASSED_TYPES, 'pool'])

export const isHouse = (o: PlanObject): boolean => o.type === 'house'
export const hasMasses = (o: PlanObject): boolean => MASSED_TYPES.has(o.type)
export const isRuleStructure = (o: PlanObject): boolean => STRUCTURE_TYPES.has(o.type)

/** A standalone deck's top above the lowest ground under it, metres. */
export function standaloneDeckRiseM(o: PlanObject, terrain: Terrain): number {
  const low = Math.min(...siteFootprint(o).map(([x, n]) => elevationAt(terrain, x, n)))
  return baseElevation(terrain, o) - low
}

export const isHighDeck = (o: PlanObject, terrain: Terrain): boolean => o.type === 'deck' && standaloneDeckRiseM(o, terrain) > RULE_DECK_DROP_M

/** Counted for the side and rear setback and the inside-the-lot row. */
export const countsForSide = (o: PlanObject, terrain: Terrain): boolean => isRuleStructure(o) || isHighDeck(o, terrain)

/** The masses a cabin, shed or shop is built from, a shed's missing fields taken from the library. */
export const ruleMasses = (o: PlanObject): Mass[] => buildingMasses(withShedDefaults(o).params)

export function ruleOutline(o: PlanObject, terrain: Terrain): readonly (readonly SitePoint[])[] {
  if (!hasMasses(o)) return [siteFootprint(o)]
  const floor = baseElevation(terrain, o)
  const polys = ruleMasses(o)
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
