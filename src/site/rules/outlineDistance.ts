import { pointInPolygon } from '../../buildings/foundation/foundation'
import { isShorelineEdge } from '../parcel'
import type { Parcel, SitePoint } from '../types'
import { ftToM } from '../units'
import { forEdges, segDistance, type Poly } from './polyGeom'
import { isBankedEdge, pointInLot } from './setbacks'

/**
 * How far a rule outline is from the shore and the lot lines, edge to edge
 * (review R2.3). The old planner measured from the outline's corners only,
 * so a wall bowing toward the shore between two far corners was missed.
 * Pure: parcel and outline polygons (site metres) in, metres out.
 */

export interface OutlineHit {
  /** Plain distance, metres. */
  readonly d: number
  /** Nearest point on the outline. */
  readonly from: SitePoint
  /** Nearest point on the parcel line. */
  readonly to: SitePoint
}

export interface OutlineShoreHit extends OutlineHit {
  /** Distance past the top of bank on the banked east shore (d otherwise), metres; negative when over it. */
  readonly past: number
  readonly banked: boolean
}

type Edge = readonly [index: number, a: SitePoint, b: SitePoint]

interface RankedHit extends OutlineHit {
  readonly edge: number
  readonly rank: number
}

const ringEdges = (parcel: Parcel, shore: boolean): Edge[] =>
  parcel.ring.flatMap((a, i): Edge[] => (isShorelineEdge(parcel, i) === shore ? [[i, a, parcel.ring[(i + 1) % parcel.ring.length]]] : []))

/** The nearest parcel edge to the outline by `rank` (smaller is nearer), edge to edge; 0 where they cross or the edge runs inside. */
function nearestEdge(polys: readonly Poly[], edges: readonly Edge[], rank: (d: number, edge: number) => number): RankedHit | null {
  let best: RankedHit | null = null
  const consider = (d: number, from: SitePoint, to: SitePoint, edge: number) => {
    const r = rank(d, edge)
    if (!best || r < best.rank) best = { d, from, to, edge, rank: r }
  }
  for (const poly of polys) {
    for (const [edge, a, b] of edges) {
      // a parcel edge whose end sits inside the outline runs under the building
      const inside = [a, b].find(([x, n]) => pointInPolygon(poly, x, n))
      if (inside) consider(0, inside, inside, edge)
      forEdges(poly, (p, q) => {
        const hit = segDistance(p, q, a, b)
        consider(hit.d, hit.from, hit.to, edge)
      })
    }
  }
  return best
}

/** The outline's nearest approach to the shoreline, ranked by distance past the top of bank (as `nearestShore` ranks a point). */
export function outlineShore(parcel: Parcel, polys: readonly Poly[], bankFt: number): OutlineShoreHit | null {
  const bankM = ftToM(bankFt)
  const hit = nearestEdge(polys, ringEdges(parcel, true), (d, edge) => (isBankedEdge(parcel, edge) ? d - bankM : d))
  if (!hit) return null
  return { d: hit.d, from: hit.from, to: hit.to, past: hit.rank, banked: isBankedEdge(parcel, hit.edge) }
}

/** The outline's nearest approach to a side or rear lot line. */
export function outlineLotLine(parcel: Parcel, polys: readonly Poly[]): OutlineHit | null {
  const hit = nearestEdge(polys, ringEdges(parcel, false), (d) => d)
  return hit && { d: hit.d, from: hit.from, to: hit.to }
}

/** Whether the whole outline is inside the lot: every corner in, and no wall crossing or touching the parcel line. */
export function outlineInLot(parcel: Parcel, polys: readonly Poly[]): boolean {
  if (!polys.every((poly) => poly.every(([x, n]) => pointInLot(parcel, x, n)))) return false
  const all = [...ringEdges(parcel, true), ...ringEdges(parcel, false)]
  return (nearestEdge(polys, all, (d) => d)?.d ?? Infinity) > 0
}
