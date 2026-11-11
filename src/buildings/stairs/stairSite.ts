import { buildingMasses, massToBuilding, type Mass } from '../masses'
import { localToSite, type LocalPoint } from '../footprint'
import { railStyleOf } from '../rails/railEdits'
import { planWingStair, stairAxis, wingDropAtFoot, wingHost, type AccessSite } from './stairWing'
import { FLIGHT_RISE_MAX_M, RAMP_RUN_RISE_MAX_M, RISER_MAX_M, stairGeomMath, TREAD_MIN_M } from './stairs'
import { withWing } from '../parts/wingEdits'
import type { StairInfo } from './stairPlan'
import { ftToM, M_PER_FT as FT } from '../../site/units'
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

/** Ramps: one foot of run per inch of rise (1:12). */
const RAMP_RUN_PER_RISE = 12
/** Each pass re-measures the drop at the new foot; a stair down falling ground takes a few. */
const FIT_PASSES = 12
const round3 = (v: number) => Math.round(v * 1000) / 1000
/** Up to the next 0.001 ft, so a stored run is never a hair short of the one that fits. */
const ceil3 = (v: number) => Math.ceil(v * 1000 - 1e-6) / 1000

/** The drop at access wing mi's foot when it is trial: the cabin's floor stands on the highest ground under its bounds, wings included, so measure the trial cabin. */
function trialDrop(world: RailWorld, o: PlanObject, mi: number, trial: Mass): number {
  const to: PlanObject = { ...o, params: withWing(o.params, mi, (w) => ({ ...w, d: trial.d, dx: trial.dx, dz: trial.dz })) }
  return wingDropAtFoot(trial, accessSite(world, to, trial, mi))
}

/**
 * Fit to code (deliberate addition, PLAN.md): the run, and the centre that
 * keeps the top where it is, that give access wing mi 11 in treads under
 * 7 in risers (a ramp 1:12), re-measuring the drop at each new foot. The
 * wing is checked as it will be stored (run rounded up, centre rounded to
 * 0.001 ft), so one click fits. Null for any other mass, when the run
 * already fits, or when no run can: the rise is more than one flight takes
 * (12 ft, a ramp 30 in) or the ground falls away faster than the stair.
 */
export function fitStairRun(world: RailWorld, o: PlanObject, mi: number): { readonly d: number; readonly dx: number; readonly dz: number } | null {
  if (o.type !== 'house') return null
  const masses = buildingMasses(o.params)
  const m = masses[mi]
  if (!m || (m.kind !== 'stair' && m.kind !== 'ramp')) return null
  const ramp = m.kind === 'ramp'
  const { top, down } = stairAxis(m)
  const place = (d: number): Mass => {
    const stored = ceil3(d)
    return { ...m, d: stored, dx: round3(top[0] + (down[0] * stored) / 2), dz: round3(top[1] + (down[1] * stored) / 2) }
  }
  const tooHigh = (drop: number) => drop > (ramp ? RAMP_RUN_RISE_MAX_M : FLIGHT_RISE_MAX_M) + 1e-9
  const fits = (trial: Mass, drop: number) => (ramp ? drop <= (trial.d * FT) / RAMP_RUN_PER_RISE + 1e-9 : stairGeomMath(drop, trial.d * FT).ok)
  const needed = (drop: number) => (ramp ? (drop * RAMP_RUN_PER_RISE) / FT : (Math.max(1, Math.ceil(drop / RISER_MAX_M - 1e-9)) * TREAD_MIN_M) / FT)
  let drop = trialDrop(world, o, mi, m)
  if (tooHigh(drop) || fits(m, drop)) return null
  let d = m.d
  for (let k = 0; k < FIT_PASSES; k++) {
    d = Math.max(d, Math.ceil(needed(drop) * 12 - 1e-6) / 12)
    const trial = place(d)
    drop = trialDrop(world, o, mi, trial)
    if (tooHigh(drop)) return null
    if (fits(trial, drop)) return { d: trial.d, dx: trial.dx, dz: trial.dz }
  }
  return null
}
