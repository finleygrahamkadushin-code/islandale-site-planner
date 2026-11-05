import { siteFootprint } from '../buildings/footprint'
import { baseElevation } from '../scene/placement'
import { coverOf } from '../site/lotFacts'
import { ringArea } from '../site/parcel'
import { elevationAt } from '../site/terrain'
import type { Terrain } from '../site/types'
import { FT_PER_M } from '../site/units'
import type { PlanObject } from '../store/types'

/**
 * The one-line summary at the top of the inspector (4B, old selection
 * stats): ground the object covers (every wall and wing for a cabin, its
 * footprint box otherwise), its floor elevation and the lowest surveyed
 * ground under it, in feet NAVD88.
 */
export interface SelectionStats {
  readonly areaSqFt: number
  readonly floorFt: number
  readonly lowestGroundFt: number
}

export function selectionStats(o: PlanObject, terrain: Terrain): SelectionStats {
  const outline = siteFootprint(o)
  const cover = coverOf(o)
  const areaSqFt = cover > 0 ? cover : ringArea(outline) * FT_PER_M * FT_PER_M
  const lowest = Math.min(elevationAt(terrain, o.position.x, o.position.n), ...outline.map(([x, n]) => elevationAt(terrain, x, n)))
  return { areaSqFt, floorFt: baseElevation(terrain, o) * FT_PER_M, lowestGroundFt: lowest * FT_PER_M }
}
