import { buildingMasses, massToBuilding, type Mass } from '../masses'
import { localToSite, type LocalPoint } from '../footprint'
import { railStyleOf } from '../rails/railEdits'
import { planWingStair, type AccessSite } from './stairWing'
import type { StairInfo } from './stairPlan'
import { ftToM } from '../../site/units'
import type { PlanObject } from '../../store/types'
import { baseElevation } from '../../scene/placement'
import { objectRailSite } from '../rails/railSite'
import type { RailWorld } from '../rails/railWorld'

/**
 * A stair or ramp wing's ground, floor, rail style and door-at-the-top
 * answer, from the rail world: the same inputs the scene draws it from,
 * for the part inspector.
 */
export function accessSite(world: RailWorld, o: PlanObject, m: Mass, mi: number): AccessSite {
  return {
    floor: baseElevation(world.terrain, o) + ftToM(m.lvl),
    groundAt: (x, z) => {
      const [sx, sn] = localToSite(o.position, o.rotation, massToBuilding(m, [x, z] as LocalPoint))
      return world.ground(sx, sn)
    },
    railStyle: railStyleOf(o.params, mi),
    clearTop: objectRailSite(world, o).clearTop(mi),
  }
}

/** Risers, rise, tread, slope, handrails and ok for wing mi of a building, or null when it is not a stair or ramp. */
export function stairInfo(world: RailWorld, o: PlanObject, mi: number): StairInfo | null {
  if (o.type !== 'house') return null
  const masses = buildingMasses(o.params)
  const m = masses[mi]
  if (!m || (m.kind !== 'stair' && m.kind !== 'ramp')) return null
  return planWingStair(masses, mi, accessSite(world, o, m, mi))?.info ?? null
}
