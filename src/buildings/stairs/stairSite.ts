import { buildingMasses, massToBuilding, type Mass } from '../masses'
import { localToSite, type LocalPoint } from '../footprint'
import { railStyleOf } from '../rails/railEdits'
import { planWingStair, stairAxis, wingDropAtFoot, wingHost, type AccessSite } from './stairWing'
import { RISER_MAX_M, TREAD_MIN_M } from './stairs'
import { withWing } from '../parts/wingEdits'
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

/** Whether access wing mi meets another part of the building at its top (a host edge within 1.5 ft); false for any other mass. */
export function stairAttached(o: PlanObject, mi: number): boolean {
  if (o.type !== 'house') return false
  const masses = buildingMasses(o.params)
  const m = masses[mi]
  if (!m || (m.kind !== 'stair' && m.kind !== 'ramp')) return false
  return wingHost(masses, mi) !== null
}

const FT = 0.3048
/** Ramps: one foot of run per inch of rise (1:12). */
const RAMP_RUN_PER_RISE = 12
const FIT_PASSES = 4

/**
 * Fit to code (deliberate addition, PLAN.md): the run, and the centre that
 * keeps the top where it is, that give access wing mi 11 in treads under
 * 7 in risers (a ramp 1:12), re-measuring the drop at each new foot. Null
 * for any other mass, or when the run already fits.
 */
export function fitStairRun(world: RailWorld, o: PlanObject, mi: number): { readonly d: number; readonly dx: number; readonly dz: number } | null {
  if (o.type !== 'house') return null
  const masses = buildingMasses(o.params)
  const m = masses[mi]
  if (!m || (m.kind !== 'stair' && m.kind !== 'ramp')) return null
  const { top, down } = stairAxis(m)
  const place = (d: number): Mass => ({ ...m, d, dx: top[0] + (down[0] * d) / 2, dz: top[1] + (down[1] * d) / 2 })
  // the cabin's floor stands on the highest ground under its bounds, wings included, so measure the trial cabin
  const needed = (trial: Mass): number => {
    const to: PlanObject = { ...o, params: withWing(o.params, mi, (w) => ({ ...w, d: trial.d, dx: trial.dx, dz: trial.dz })) }
    const drop = wingDropAtFoot(trial, accessSite(world, to, trial, mi))
    if (m.kind === 'ramp') return (drop * RAMP_RUN_PER_RISE) / FT
    const n = Math.max(1, Math.ceil(drop / RISER_MAX_M - 1e-9))
    return (n * TREAD_MIN_M) / FT
  }
  let d = m.d
  for (let k = 0; k < FIT_PASSES; k++) {
    const next = Math.ceil(needed(place(d)) * 12 - 1e-6) / 12
    if (Math.abs(next - d) < 1e-6) break
    d = Math.max(d, next)
  }
  if (d <= m.d + 1e-6) return null
  const fit = place(d)
  const r = (v: number) => Math.round(v * 1000) / 1000
  return { d: r(d), dx: r(fit.dx), dz: r(fit.dz) }
}
