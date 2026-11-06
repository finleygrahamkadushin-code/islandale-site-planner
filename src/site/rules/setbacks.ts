import { pointInPolygon } from '../../buildings/foundation/foundation'
import { isShorelineEdge } from '../parcel'
import type { Parcel, SitePoint } from '../types'
import { ftToM } from '../units'
import type { Setbacks } from '../../store/types'

/**
 * Setback distances (5E, old `nearestOnEdges` / `pointInLot`). Pure: parcel
 * and a point in, metres out. Shoreline edges are the parcel's
 * `shorelineEdges`; the east shore (edges up to EAST_BANK_LAST_EDGE) is
 * banked, so its setback is measured from the top of bank, `bankFt` in from
 * the water. The south-west shore after it is measured from the water.
 */

/** Last ring edge of the east (banked) shore; the edges after it, to the shoreline's end, are the gentle south-west shore. */
export const EAST_BANK_LAST_EDGE = 120
/** Tree protection zones, feet from the water: no removal, then limited removal. */
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

export function pointInLot(parcel: Parcel, x: number, n: number): boolean {
  return pointInPolygon(parcel.ring, x, n)
}

/** Nearest shoreline edge, ranked by distance past the bank (as the old planner ranks it). */
export function nearestShore(parcel: Parcel, x: number, n: number, bankFt: number): ShoreHit | null {
  const bankM = ftToM(bankFt)
  let best: ShoreHit | null = null
  forEdges(parcel, true, (edge, a, b) => {
    const { d, at } = closestOnSeg(x, n, a, b)
    const banked = edge <= EAST_BANK_LAST_EDGE
    const past = banked ? d - bankM : d
    if (!best || past < best.past) best = { d, edge, at, past, banked }
  })
  return best
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

/** Tree protection zone at a point: 1 (0–35 ft from the water), 2 (35–110 ft) or 0. Plain distance, no bank offset. */
export function treeZone(parcel: Parcel, x: number, n: number): 0 | 1 | 2 {
  const sh = nearestShore(parcel, x, n, 0)
  if (!sh) return 0
  if (sh.d < ftToM(TREE_ZONE_1_FT)) return 1
  if (sh.d < ftToM(TREE_ZONE_2_FT)) return 2
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
