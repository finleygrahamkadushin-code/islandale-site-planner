import { pointInPolygon } from '../buildings/foundation'
import { elevationAt } from './terrain'
import type { SitePoint, Terrain } from './types'

const FT = 0.3048
/** Legacy earthOf() defaults for a sunk floor: 3 ft clear round the walls, a 2:1 (run:rise) bank. */
export const SINK_MARGIN_FT = 3
export const BANK_RUN_PER_RISE = 2
/** The cut sits this far under the floor (legacy slab), metres. */
const SLAB_M = 0.15
/** Fine grid for the cut patch, metres; divides the 2 m terrain spacing. */
export const PATCH_SPACING_M = 0.5

/** A building floor set into the slope: its enclosed outlines (site metres) and its floor elevation. */
export interface Cut {
  readonly polys: readonly (readonly SitePoint[])[]
  readonly floor: number
}

export type Ground = (x: number, n: number) => number

/** Signed distance to the union of outlines: negative inside, metres. */
export function signedDistance(polys: readonly (readonly SitePoint[])[], x: number, n: number): number {
  let best = Infinity
  let inside = false
  for (const poly of polys) {
    if (pointInPolygon(poly, x, n)) inside = true
    poly.forEach((a, i) => (best = Math.min(best, segDist(x, n, a, poly[(i + 1) % poly.length]))))
  }
  return inside ? -best : best
}

/** The cut surface of one sunk floor at a point: flat to the margin, then a bank rising at 1 in 2. */
export function cutSurface(c: Cut, x: number, n: number): number {
  const sd = signedDistance(c.polys, x, n) - SINK_MARGIN_FT * FT
  return c.floor - SLAB_M + Math.max(0, sd) / BANK_RUN_PER_RISE
}

/** Displayed ground: the survey, lowered wherever a sunk floor cuts into it (never filled). */
export function groundWithCuts(t: Terrain, cuts: readonly Cut[]): Ground {
  if (!cuts.length) return (x, n) => elevationAt(t, x, n)
  return (x, n) => {
    let z = elevationAt(t, x, n)
    for (const c of cuts) z = Math.min(z, cutSurface(c, x, n))
    return z
  }
}

/** Terrain cells (column and row ranges, inclusive of the start, exclusive of the end) a patch must replace. */
export interface CellRect {
  readonly c0: number
  readonly c1: number
  readonly r0: number
  readonly r1: number
}

/**
 * The block of terrain cells round a cut that can reach below the survey:
 * the outlines grown by the margin and by the longest bank the drop needs.
 */
export function cutCells(t: Terrain, c: Cut): CellRect {
  const pts = c.polys.flat()
  const drop = Math.max(0, Math.max(...pts.map(([x, n]) => elevationAt(t, x, n))) - (c.floor - SLAB_M))
  const reach = SINK_MARGIN_FT * FT + drop * BANK_RUN_PER_RISE + t.spacing
  const xs = pts.map((p) => p[0])
  const ns = pts.map((p) => p[1])
  const col = (x: number) => (x - t.x0) / t.spacing
  const row = (n: number) => (n - t.n0) / t.spacing
  return {
    c0: clampInt(Math.floor(col(Math.min(...xs) - reach)), 0, t.nx - 1),
    c1: clampInt(Math.ceil(col(Math.max(...xs) + reach)), 0, t.nx - 1),
    r0: clampInt(Math.floor(row(Math.min(...ns) - reach)), 0, t.ny - 1),
    r1: clampInt(Math.ceil(row(Math.max(...ns) + reach)), 0, t.ny - 1),
  }
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function segDist(px: number, pn: number, a: SitePoint, b: SitePoint): number {
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  const l2 = dx * dx + dn * dn || 1
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pn - a[1]) * dn) / l2))
  return Math.hypot(px - (a[0] + t * dx), pn - (a[1] + t * dn))
}
