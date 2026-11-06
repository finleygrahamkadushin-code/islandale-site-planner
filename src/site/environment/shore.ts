import { isoSegments, type Field, type IsoSegment } from '../contours'
import type { Terrain } from '../types'

/**
 * The shore (4E): the foam line where the water meets the ground at the
 * current tide, and driftwood along the high-water band. Pure: terrain and
 * tide in, segments and logs out. The ground's gravel and wet-sand colours
 * are in `../terrainGeometry.ts` (`colourTerrain`).
 */

const FT = 0.3048
/** Driftwood lies along this height, feet NAVD88: just under the meadow's edge, the winter wrack line. */
export const DRIFT_LINE_FT = 9.5
/** About one log every this many metres of shore. */
export const DRIFT_SPACING_M = 7
/** Foam floats this far over the water, metres. */
export const FOAM_LIFT_M = 0.03

const terrainField = (t: Terrain): Field => ({ nx: t.nx, ny: t.ny, x0: t.x0, n0: t.n0, spacing: t.spacing, at: (i, j) => t.z[j * t.nx + i] })

/** Where the water at `tideFt` meets the ground, as segments in the site frame. */
export const foamSegments = (t: Terrain, tideFt: number): IsoSegment[] => isoSegments(terrainField(t), tideFt * FT)

/** A small fixed-seed random generator (mulberry32), so the logs lie the same every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export interface Log {
  readonly x: number
  readonly n: number
  /** Turn about the vertical, radians. */
  readonly yaw: number
  readonly lengthM: number
  readonly radiusM: number
}

/** Driftwood along the wrack line within `bounds` (site metres), one log per `DRIFT_SPACING_M` of shore on average. */
export function driftwood(t: Terrain, bounds: { readonly x0: number; readonly x1: number; readonly n0: number; readonly n1: number }, seed = 7): Log[] {
  const rand = seeded(seed)
  const logs: Log[] = []
  let carry = rand() * DRIFT_SPACING_M
  for (const [ax, an, bx, bn] of isoSegments(terrainField(t), DRIFT_LINE_FT * FT)) {
    const mx = (ax + bx) / 2
    const mn = (an + bn) / 2
    if (mx < bounds.x0 || mx > bounds.x1 || mn < bounds.n0 || mn > bounds.n1) continue
    carry -= Math.hypot(bx - ax, bn - an)
    if (carry > 0) continue
    carry = DRIFT_SPACING_M * (0.5 + rand())
    const along = Math.atan2(bn - an, bx - ax)
    logs.push({ x: mx, n: mn, yaw: along + (rand() - 0.5) * 0.9, lengthM: 1.4 + rand() * 2.8, radiusM: 0.09 + rand() * 0.12 })
  }
  return logs
}
