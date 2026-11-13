const IN = 0.0254

/**
 * The planner's stair rule (legacy walk-model numbers, kept: decision 2 in
 * PLAN-REVIEW-FIXES.md): risers of 7 in or less and treads of 11 in or more,
 * the IBC 1011.5.2 commercial numbers, stricter than the IRC's 7¾ in / 10 in.
 */
export const MAX_RISER_IN = 7
export const TREAD_IN = 11
/** Path-piece stair handrails (5C); stair and ramp wings use WING_RAIL_M. */
export const HANDRAIL_IN = 34

/** stair-geom limits: a riser of at most 7 in, a tread of at least 11 in (metres). */
export const RISER_MAX_M = MAX_RISER_IN * IN
export const TREAD_MIN_M = TREAD_IN * IN

/** A flight of stairs rises at most 12 ft between landings (IBC 1011.8); a stair wing has no landings. */
export const FLIGHT_RISE_MAX_M = 144 * IN
/** A flight of four or more risers needs a handrail (IRC R311.7.8). */
export const HANDRAIL_RISERS = 4
/** A ramp run rises at most 30 in between landings (IBC 1012.4); a ramp wing is one run. */
export const RAMP_RUN_RISE_MAX_M = 30 * IN
/** A ramp rising more than 6 in needs handrails (IBC 1012.8). */
export const RAMP_HANDRAIL_RISE_M = 6 * IN

export interface StairMath {
  readonly risers: number
  readonly riserIn: number
  readonly treads: number
  readonly runIn: number
}

/**
 * Treads a stair of n risers has: one fewer than its risers, as the top
 * riser lands on the floor (R3.4; the old planner counted one per riser).
 */
export const treadsFor = (risers: number): number => Math.max(0, risers - 1)

/**
 * The stair-connect form of the legacy stairMath(): riser count and sizes
 * for a drop in metres, with fixed 11 in treads (Connect and path pieces, 5C).
 */
export function stairMath(riseM: number): StairMath {
  const riseIn = Math.abs(riseM) / IN
  const risers = riseIn < 0.5 ? 0 : Math.ceil(riseIn / MAX_RISER_IN - 1e-9)
  const treads = treadsFor(risers)
  return { risers, riserIn: risers ? riseIn / risers : 0, treads, runIn: treads * TREAD_IN }
}

/** A stair wing's risers: count, rise and tread (metres), and whether they meet 7 in / 11 in. */
export interface StairGeomMath {
  readonly n: number
  readonly rise: number
  readonly tread: number
  readonly ok: boolean
}

/**
 * The stair-geom form of the legacy stairMath(): the run is fixed (the
 * wing's depth) and is split evenly into the n - 1 treads under n risers
 * (R3.4: the old planner split it into n), so a short wing only flags
 * ok = false rather than growing. One riser has no tread below the top:
 * its tread is the whole run.
 */
export function stairGeomMath(dropM: number, runM: number): StairGeomMath {
  const drop = Math.max(0, dropM || 0)
  const run = Math.max(0, runM || 0)
  const n = drop < 0.5 * IN ? 0 : Math.ceil(drop / RISER_MAX_M - 1e-9)
  const rise = n ? drop / n : 0
  const tread = n > 1 ? run / treadsFor(n) : run
  return { n, rise, tread, ok: n === 0 || (tread >= TREAD_MIN_M - 1e-9 && rise <= RISER_MAX_M + 1e-9) }
}
