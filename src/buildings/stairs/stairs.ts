const IN = 0.0254

/** Legacy stair rule (walk-model): risers of 7 in or less, 11 in treads. */
export const MAX_RISER_IN = 7
export const TREAD_IN = 11
/** Path-piece stair handrails (5C); stair and ramp wings use WING_RAIL_M. */
export const HANDRAIL_IN = 34

/** stair-geom limits: a riser of at most 7 in, a tread of at least 11 in (metres). */
export const RISER_MAX_M = MAX_RISER_IN * IN
export const TREAD_MIN_M = TREAD_IN * IN

export interface StairMath {
  readonly risers: number
  readonly riserIn: number
  readonly treads: number
  readonly runIn: number
}

/**
 * The stair-connect form of the legacy stairMath(): riser count and sizes
 * for a drop in metres, with fixed 11 in treads (Connect and path pieces, 5C).
 */
export function stairMath(riseM: number): StairMath {
  const riseIn = Math.abs(riseM) / IN
  const risers = riseIn < 0.5 ? 0 : Math.ceil(riseIn / MAX_RISER_IN - 1e-9)
  return { risers, riserIn: risers ? riseIn / risers : 0, treads: Math.max(0, risers - 1), runIn: risers * TREAD_IN }
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
 * wing's depth) and is split evenly into one tread per riser, so a short
 * wing only flags ok = false rather than growing.
 */
export function stairGeomMath(dropM: number, runM: number): StairGeomMath {
  const drop = Math.max(0, dropM || 0)
  const run = Math.max(0, runM || 0)
  const n = drop < 0.5 * IN ? 0 : Math.ceil(drop / RISER_MAX_M - 1e-9)
  const rise = n ? drop / n : 0
  const tread = n ? run / n : run
  return { n, rise, tread, ok: n === 0 || (tread >= TREAD_MIN_M - 1e-9 && rise <= RISER_MAX_M + 1e-9) }
}
