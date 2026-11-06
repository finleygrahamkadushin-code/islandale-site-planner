import { buildingMasses, deckObjectMass, massBuildingPoly } from '../buildings/masses'
import { num } from '../buildings/footprint'
import type { PlanObject } from '../store/types'
import { ringArea, ringEdges } from './parcel'
import type { Parcel } from './types'
import { FT_PER_M } from './units'

/**
 * The lot facts the Site tab shows (4B, old site header stats and lot
 * coverage): the assessor lot area, the shoreline length, and the building
 * footprint that counts as lot coverage (see coverageOf). Pure: parcel and
 * objects in, square feet and feet out.
 */

export interface LotFacts {
  readonly lotSqFt: number
  readonly shorelineFt: number
  readonly coveredSqFt: number
  readonly coveragePct: number
}

/** Types that cover the ground: cabins (every main wall and wing), standalone decks, sheds and shops. */
const SIMPLE_COVER = new Set(['shed', 'shop'])

/** Square feet of ground under one object's buildings and decks (0 for anything else). */
export function coverOf(o: PlanObject): number {
  if (o.type === 'house') return buildingMasses(o.params).reduce((sum, m) => sum + ringArea(massBuildingPoly(m)), 0)
  if (o.type === 'deck') return ringArea(massBuildingPoly(deckObjectMass(o.params)))
  if (SIMPLE_COVER.has(o.type)) return num(o.params.w, 0) * num(o.params.d, 0)
  return 0
}

/**
 * Square feet one object counts towards lot coverage (5E, the old rule):
 * a cabin's closed masses only (main walls and closed wings, ground area,
 * not times floors), plus standalone decks, sheds and shops. Porches, deck
 * wings, stairs and ramps on a cabin don't count.
 */
export function coverageOf(o: PlanObject): number {
  if (o.type !== 'house') return coverOf(o)
  return buildingMasses(o.params)
    .filter((m) => !m.open)
    .reduce((sum, m) => sum + ringArea(massBuildingPoly(m)), 0)
}

/** Ground the visible objects count towards lot coverage, square feet. */
export function coveredSqFt(objects: readonly PlanObject[]): number {
  return objects.filter((o) => !o.hidden).reduce((sum, o) => sum + coverageOf(o), 0)
}

export function lotFacts(parcel: Parcel, objects: readonly PlanObject[]): LotFacts {
  const { first, last } = parcel.shorelineEdges
  const shorelineM = ringEdges(parcel.ring)
    .slice(first, last + 1)
    .reduce((sum, [[x1, n1], [x2, n2]]) => sum + Math.hypot(x2 - x1, n2 - n1), 0)
  const covered = coveredSqFt(objects)
  return { lotSqFt: parcel.lotSqFt, shorelineFt: shorelineM * FT_PER_M, coveredSqFt: covered, coveragePct: (covered / parcel.lotSqFt) * 100 }
}
