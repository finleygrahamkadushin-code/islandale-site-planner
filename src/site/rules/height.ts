import { massPoly, type Mass } from '../../buildings/masses'
import { buildRoof, normaliseRoof, roofParamsOf } from '../../buildings/roofs/roof'
import { isSculpted, sculptRiseFt } from '../../buildings/roofs/sculptRoof'
import { baseElevation } from '../../scene/placement'
import { elevationAt } from '../terrain'
import type { Terrain } from '../types'
import { ftToM, mToFt } from '../units'
import type { PlanObject } from '../../store/types'
import { hasMasses, ruleMasses, rulePoints } from './ruleOutline'

/**
 * Building height (5E, Finley's decision of Nov 5 2026): from average grade,
 * the mean surveyed ground under the rule outline's points, to the highest
 * roof top. The old planner measured from the floor; SJCC and its hint say
 * average grade. Pure: building and terrain in, feet out.
 */

/** Height limit, feet above average grade (the old planner's SJCC figure; assumed, see ruleSources). */
export const HEIGHT_LIMIT_FT = 35

/** Highest point of a mass's roof above its wall top, metres, from the roof code the scene draws with. */
export function roofRiseM(m: Mass): number {
  const type = normaliseRoof(m.roof)
  if (type === 'none') return 0
  if (isSculpted(type)) return ftToM(sculptRiseFt(m))
  return buildRoof(massPoly(m), roofParamsOf(m, null)).rise
}

/** Top of one mass, metres NAVD88: an open deck is its floor; anything else its wall top plus its roof. */
export function massTopM(m: Mass, floorM: number): number {
  const level = floorM + ftToM(m.lvl)
  if (m.kind === 'stair' || m.kind === 'ramp') return level
  if (m.kind === 'deck' && normaliseRoof(m.roof) === 'none') return level
  return level + ftToM(m.h) + roofRiseM(m)
}

/** Mean surveyed ground under the building's rule outline, metres. */
export function averageGradeM(o: PlanObject, terrain: Terrain): number {
  const pts = rulePoints(o, terrain)
  if (!pts.length) return elevationAt(terrain, o.position.x, o.position.n)
  return pts.reduce((s, [x, n]) => s + elevationAt(terrain, x, n), 0) / pts.length
}

export interface BuildingHeight {
  readonly ft: number
  readonly gradeM: number
  readonly topM: number
}

/**
 * A building's height above average grade, feet. Cabins, sheds and shops
 * (a shed's missing fields from the library) to their highest roof; a pool,
 * which has no masses, to its coping.
 */
export function buildingHeight(o: PlanObject, terrain: Terrain): BuildingHeight {
  const floor = baseElevation(terrain, o)
  const topM = hasMasses(o) ? Math.max(...ruleMasses(o).map((m) => massTopM(m, floor))) : floor
  const gradeM = averageGradeM(o, terrain)
  return { ft: mToFt(topM - gradeM), gradeM, topM }
}
