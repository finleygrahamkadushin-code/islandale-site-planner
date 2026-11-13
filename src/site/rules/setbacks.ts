import { pointInPolygon } from '../geom2d'
import { isShorelineEdge } from '../parcel'
import type { Parcel, SitePoint } from '../types'
import { ftToM } from '../units'
import type { Setbacks } from '../../store/types'

/**
 * Setback distances (5E, old `nearestOnEdges` / `pointInLot`). Pure: parcel
 * and a point in, metres out. The water's edge is the parcel's approximate
 * high-water line (`highWater.ts`, decision 1), or its lot line along the
 * water when it has none; ground between the lot line and the high-water
 * line is at the water (0 from it). The east shore (from edges up to
 * EAST_BANK_LAST_EDGE) is banked, so its setback is measured from the top of
 * bank, which stays `bankFt` in from the lot line, a fixed place on the
 * ground (Finley, Nov 13). The south-west shore after it, the "to shore"
 * distances and the tree zones are measured from the water's edge.
 */

/**
 * Last ring edge of the east (banked) shore; the edges after it, to the
 * shoreline's end, are the gentle south-west shore. Edge 120 runs from ring
 * vertex 120 (12.92, -34.23) to vertex 121 (12.82, -34.36), the lot's
 * southernmost point, where the line along the water stops running down the
 * east side and turns north-west (edges 121 and 122) along the beach. The
 * index comes from the old planner; parcel.json does not mark it.
 */
export const EAST_BANK_LAST_EDGE = 120
/** Tree protection zones, feet from the water: no removal, then limited removal. Assumed (review R2.8): no code section named; see ruleSources. */
export const TREE_ZONE_1_FT = 35
export const TREE_ZONE_2_FT = 110

export interface EdgeHit {
  /** Plain distance to the nearest edge, metres. */
  readonly d: number
  /** Ring edge index. */
  readonly edge: number
  /** Nearest point on that edge. */
  readonly at: SitePoint
}

export interface ShoreHit extends EdgeHit {
  /** Distance past the top of bank (d less the bank offset on the east shore), metres; may be negative. */
  readonly past: number
  /** True when the nearest shore edge is on the banked east shore. */
  readonly banked: boolean
}

export const isBankedEdge = (parcel: Parcel, edge: number): boolean =>
  isShorelineEdge(parcel, edge) && edge <= EAST_BANK_LAST_EDGE

/** A stretch of the water's edge, from the shoreline ring edge it was walked in from (or is). */
export interface WaterSeg {
  readonly a: SitePoint
  readonly b: SitePoint
  readonly edge: number
}

const waterCache = new WeakMap<Parcel, readonly WaterSeg[]>()

/** The water's edge the shore distances measure to: the high-water line's segments, or the lot line's shoreline edges. */
export function waterSegments(parcel: Parcel): readonly WaterSeg[] {
  const hit = waterCache.get(parcel)
  if (hit) return hit
  const hw = parcel.highWater
  const segs: WaterSeg[] = []
  if (hw) hw.edges.forEach((edge, k) => segs.push({ a: hw.pts[k], b: hw.pts[k + 1], edge }))
  else forEdges(parcel, true, (edge, a, b) => segs.push({ a, b, edge }))
  waterCache.set(parcel, segs)
  return segs
}

const stripCache = new WeakMap<Parcel, readonly SitePoint[] | null>()

/** The ground between the lot line along the water and the high-water line, as one ring; null when the parcel has no high-water line. */
function belowHighWaterRing(parcel: Parcel): readonly SitePoint[] | null {
  if (stripCache.has(parcel)) return stripCache.get(parcel)!
  const hw = parcel.highWater
  const { first, last } = parcel.shorelineEdges
  const strip = hw ? [...parcel.ring.slice(first, last + 2), ...[...hw.pts].reverse()] : null
  stripCache.set(parcel, strip)
  return strip
}

/**
 * Whether a point is at or below high water: between the lot line along the
 * water and the high-water line, or off the lot on the water side (nearest a
 * shoreline edge). Only with a high-water line; without one the lot line
 * along the water is the water's edge, as before.
 */
export function belowHighWater(parcel: Parcel, x: number, n: number): boolean {
  const strip = belowHighWaterRing(parcel)
  if (!strip) return false
  if (pointInPolygon(strip, x, n)) return true
  if (pointInPolygon(parcel.ring, x, n)) return false
  let best = Infinity
  let shore = false
  parcel.ring.forEach((a, i) => {
    const d = closestOnSeg(x, n, a, parcel.ring[(i + 1) % parcel.ring.length]).d
    if (d < best) {
      best = d
      shore = isShorelineEdge(parcel, i)
    }
  })
  return shore
}

/** Plain distance from a point to the water's edge, metres; 0 below high water (Infinity without a shoreline). */
export function waterDistance(parcel: Parcel, x: number, n: number): number {
  if (belowHighWater(parcel, x, n)) return 0
  let d = Infinity
  for (const s of waterSegments(parcel)) d = Math.min(d, closestOnSeg(x, n, s.a, s.b).d)
  return d
}

export function pointInLot(parcel: Parcel, x: number, n: number): boolean {
  return pointInPolygon(parcel.ring, x, n)
}

/** Distance past the top of bank on the east shore: `bankFt` in from the lot line there, metres (Infinity without a banked shore). */
function pastTopOfBank(parcel: Parcel, x: number, n: number, bankM: number): number {
  let past = Infinity
  forEdges(parcel, true, (edge, a, b) => {
    if (edge <= EAST_BANK_LAST_EDGE) past = Math.min(past, closestOnSeg(x, n, a, b).d - bankM)
  })
  return past
}

/**
 * The nearer shore, ranked by distance past the bank (as the old planner
 * ranks it): on the east shore past the top of bank, `bankFt` in from the lot
 * line; on the south-west shore from the water's edge. `d` and `at` are the
 * water's edge on that shore; below high water the point is at it (`d` 0).
 */
export function nearestShore(parcel: Parcel, x: number, n: number, bankFt: number): ShoreHit | null {
  const pastBank = pastTopOfBank(parcel, x, n, ftToM(bankFt))
  const below = belowHighWater(parcel, x, n)
  let bankWater: EdgeHit | null = null
  let swWater: EdgeHit | null = null
  for (const s of waterSegments(parcel)) {
    const { d, at } = closestOnSeg(x, n, s.a, s.b)
    if (s.edge <= EAST_BANK_LAST_EDGE) {
      if (!bankWater || d < bankWater.d) bankWater = { d, edge: s.edge, at }
    } else if (!swWater || d < swWater.d) swWater = { d, edge: s.edge, at }
  }
  const swPast = swWater ? (below ? 0 : swWater.d) : Infinity
  const banked = !!bankWater && pastBank <= swPast
  const water = banked ? bankWater : swWater
  if (!water) return null
  const d = below ? 0 : water.d
  return { d, edge: water.edge, at: below ? [x, n] : water.at, past: banked ? pastBank : d, banked }
}

/** Nearest side or rear lot line (every edge that isn't shoreline). */
export function nearestLotLine(parcel: Parcel, x: number, n: number): EdgeHit | null {
  let best: EdgeHit | null = null
  forEdges(parcel, false, (edge, a, b) => {
    const { d, at } = closestOnSeg(x, n, a, b)
    if (!best || d < best.d) best = { d, edge, at }
  })
  return best
}

export type SetbackBand = 'outside' | 'shore' | 'side' | 'clear'

/** Which band a ground point falls in: outside the lot, in the shoreline buffer, in the side setback, or clear to build. */
export function setbackBand(parcel: Parcel, setbacks: Setbacks, x: number, n: number): SetbackBand {
  if (!pointInLot(parcel, x, n)) return 'outside'
  const sh = nearestShore(parcel, x, n, setbacks.bankFt)
  if (sh && sh.past < ftToM(setbacks.shoreFt)) return 'shore'
  const ln = nearestLotLine(parcel, x, n)
  if (ln && ln.d < ftToM(setbacks.sideFt)) return 'side'
  return 'clear'
}

/** Tree protection zone at a point: 1 (0–35 ft from the water's edge), 2 (35–110 ft) or 0. Plain distance, no bank offset. */
export function treeZone(parcel: Parcel, x: number, n: number): 0 | 1 | 2 {
  const d = waterDistance(parcel, x, n)
  if (d < ftToM(TREE_ZONE_1_FT)) return 1
  if (d < ftToM(TREE_ZONE_2_FT)) return 2
  return 0
}

function forEdges(parcel: Parcel, shore: boolean, f: (edge: number, a: SitePoint, b: SitePoint) => void): void {
  const ring = parcel.ring
  for (let i = 0; i < ring.length; i++) {
    if (isShorelineEdge(parcel, i) !== shore) continue
    f(i, ring[i], ring[(i + 1) % ring.length])
  }
}

export function closestOnSeg(px: number, pn: number, a: SitePoint, b: SitePoint): { d: number; at: SitePoint } {
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  const l2 = dx * dx + dn * dn
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pn - a[1]) * dn) / l2)) : 0
  const at: SitePoint = [a[0] + t * dx, a[1] + t * dn]
  return { d: Math.hypot(px - at[0], pn - at[1]), at }
}
