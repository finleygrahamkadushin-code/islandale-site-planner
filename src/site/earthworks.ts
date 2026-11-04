import { pointInPolygon } from '../buildings/foundation'
import { siteFootprint } from '../buildings/footprint'
import type { PlanObject } from '../store/types'
import { elevationAt } from './terrain'
import type { SitePoint, Terrain } from './types'
import { siteEarthworks } from './earthworksField'
import type { CellRect, EarthOp, Ground } from './earthworksTypes'
import { pondLevelOf } from './earthworksSpec'

export type { BermLine, BuildingEarthOp, CellRect, CourtCut, EarthField, EarthOp, Ground, PondEarthOp, PondWater, SiteEarthworks } from './earthworksTypes'
export { EARTH_CLASS } from './earthworksTypes'
export { fieldHeight, opReach, siteEarthworks } from './earthworksField'
export { sdPoly } from './earthworksPasses'
export type { EarthEdge, EarthSpec, MainOutline, SideSpec, WallMaterial } from './earthworksSpec'
export { earthEdges, earthSides, earthSpec, pondDepthM, pondLevelOf, POND_FREEBOARD_M, rimLow } from './earthworksSpec'
export type { RetainingWall } from './earthworksWalls'
export { WALL_MIN_RETAIN_M, WALL_THICKNESS_M } from './earthworksWalls'
export type { EarthTint, TintKind } from './earthworksTint'
export { EARTH_TINTS, earthTintAt, sampleTint } from './earthworksTint'

const FT = 0.3048
/** Legacy earthOf() defaults for a sunk floor: 3 ft clear round the walls, a 2:1 (run:rise) bank. */
export const SINK_MARGIN_FT = 3
export const BANK_RUN_PER_RISE = 2
/** The cut sits this far under the floor (legacy slab), metres. */
const SLAB_M = 0.15
/** Fine grid for contour sampling over a patch, metres; divides the 2 m terrain spacing. */
export const PATCH_SPACING_M = 0.5

/**
 * Ground reshaped round some outlines: a building's masses at its floor, or
 * a pond's outline at its level. With `op` it is one object's full
 * earthworks (berms, fill, courts, walls, ponds); without, a plain sunk
 * floor cut flat to a 3 ft margin and banked at 2:1.
 */
export interface Cut {
  readonly polys: readonly (readonly SitePoint[])[]
  readonly floor: number
  readonly op?: EarthOp
  /** How far past the outlines the ground can change, metres (terrain spacing included). */
  readonly reach?: number
}

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

/** The cut surface of one plain sunk floor at a point: flat to the margin, then a bank rising at 1 in 2. */
export function cutSurface(c: Cut, x: number, n: number): number {
  const sd = signedDistance(c.polys, x, n) - SINK_MARGIN_FT * FT
  return c.floor - SLAB_M + Math.max(0, sd) / BANK_RUN_PER_RISE
}

/**
 * Displayed ground: the survey (bilinear unless `survey` says otherwise,
 * e.g. surfaceElevationAt for the drawn triangles) with every cut's
 * earthworks: the full legacy passes for cuts that carry their object, a
 * plain cut (never filled) for the rest.
 */
export function groundWithCuts(t: Terrain, cuts: readonly Cut[], survey: (t: Terrain, x: number, n: number) => number = elevationAt): Ground {
  const ops = cuts.flatMap((c) => (c.op ? [c.op] : []))
  const plain = cuts.filter((c) => !c.op)
  const works = ops.length ? siteEarthworks(t, ops) : null
  const drawn = survey !== elevationAt
  if (!works && !plain.length) return (x, n) => survey(t, x, n)
  return (x, n) => {
    let z = works?.sample(x, n, drawn) ?? survey(t, x, n)
    for (const c of plain) z = Math.min(z, cutSurface(c, x, n))
    return z
  }
}

/**
 * The block of terrain cells round a cut that its earthworks can reach:
 * the outlines grown by `reach`, or for a plain cut by the margin and the
 * longest bank its drop needs.
 */
export function cutCells(t: Terrain, c: Cut): CellRect {
  const pts = c.polys.flat()
  const reach = c.reach ?? plainReach(t, c, pts)
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

function plainReach(t: Terrain, c: Cut, pts: readonly SitePoint[]): number {
  const drop = Math.max(0, Math.max(...pts.map(([x, n]) => elevationAt(t, x, n))) - (c.floor - SLAB_M))
  return SINK_MARGIN_FT * FT + drop * BANK_RUN_PER_RISE + t.spacing
}

/**
 * A pond's water level on a ground: its lowest rim point, less 0.06 m
 * (legacy pondLevelBase). Read it from the ground before the pond's own
 * bowl is dug, as `SiteEarthworks.ponds` does.
 */
export function pondLevel(o: PlanObject, ground: Ground): number {
  return pondLevelOf(siteFootprint(o), ground)
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function segDist(px: number, pn: number, a: SitePoint, b: SitePoint): number {
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  const l2 = dx * dx + dn * dn || 1
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pn - a[1]) * dn) / l2))
  return Math.hypot(px - (a[0] + t * dx), pn - (a[1] + t * dn))
}
