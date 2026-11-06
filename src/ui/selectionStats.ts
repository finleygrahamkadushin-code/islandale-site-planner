import { siteFootprint } from '../buildings/footprint'
import { baseElevation } from '../scene/placement'
import { coverOf } from '../site/lotFacts'
import { ringArea } from '../site/parcel'
import { elevationAt } from '../site/terrain'
import { clearances, lotText, nearestText, shoreText } from '../site/rules/clearances'
import type { Site, Terrain } from '../site/types'
import { FT_PER_M } from '../site/units'
import type { Layers, Plan, PlanObject, Setbacks } from '../store/types'

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

/** One clearance row under the stats line (5E): To shore, To lot line, To nearest. */
export interface ClearanceRow {
  readonly label: 'To shore' | 'To lot line' | 'To nearest'
  readonly text: string
  /** Inside the buffer or setback, or across the lot line. */
  readonly warn: boolean
}

/** The selection's clearance rows, in the old planner's words; a row is left out when there is nothing to measure to. */
export function clearanceRows(o: PlanObject, plan: Plan, site: Site, setbacks: Setbacks, layers?: Layers): readonly ClearanceRow[] {
  const c = clearances(o, plan, site, setbacks, layers)
  return [
    ...(c.shore ? [{ label: 'To shore', text: shoreText(c.shore, setbacks), warn: c.shore.insideBuffer } as const] : []),
    ...(c.lot ? [{ label: 'To lot line', text: lotText(c.lot), warn: c.lot.insideSetback || c.lot.crossesLot } as const] : []),
    ...(c.nearest ? [{ label: 'To nearest', text: nearestText(c.nearest), warn: false } as const] : []),
  ]
}
