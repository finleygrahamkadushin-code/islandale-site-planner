import { pointInPolygon } from '../../buildings/foundation/foundation'
import type { SitePoint } from '../types'
import { closestOnSeg } from './setbacks'

/**
 * Edge-to-edge distances between segments and polygons in the site frame
 * (5E). Pure: site metres in and out. The clearances and the setback rows
 * measure a building's outline with these, so a wall that comes closer
 * than its corners is caught.
 */

export type Poly = readonly SitePoint[]

/** Shortest distance between two polygons' edges; 0 where they cross or one sits inside the other. */
export function polyDistance(a: Poly, b: Poly): { d: number; from: SitePoint; to: SitePoint } {
  const inside = a.find(([x, n]) => pointInPolygon(b, x, n)) ?? b.find(([x, n]) => pointInPolygon(a, x, n))
  if (inside) return { d: 0, from: inside, to: inside }
  let best = { d: Infinity, from: a[0], to: b[0] }
  forEdges(a, (a0, a1) =>
    forEdges(b, (b0, b1) => {
      const hit = segDistance(a0, a1, b0, b1)
      if (hit.d < best.d) best = hit
    }),
  )
  return best
}

/** Shortest distance between segments a0–a1 and b0–b1, with the nearest point on each. */
export function segDistance(a0: SitePoint, a1: SitePoint, b0: SitePoint, b1: SitePoint): { d: number; from: SitePoint; to: SitePoint } {
  const cross = crossing(a0, a1, b0, b1)
  if (cross) return { d: 0, from: cross, to: cross }
  const onB0 = closestOnSeg(a0[0], a0[1], b0, b1)
  const onB1 = closestOnSeg(a1[0], a1[1], b0, b1)
  const onA0 = closestOnSeg(b0[0], b0[1], a0, a1)
  const onA1 = closestOnSeg(b1[0], b1[1], a0, a1)
  const options = [
    { d: onB0.d, from: a0, to: onB0.at },
    { d: onB1.d, from: a1, to: onB1.at },
    { d: onA0.d, from: onA0.at, to: b0 },
    { d: onA1.d, from: onA1.at, to: b1 },
  ]
  return options.reduce((m, c) => (c.d < m.d ? c : m))
}

function crossing(a0: SitePoint, a1: SitePoint, b0: SitePoint, b1: SitePoint): SitePoint | null {
  const rx = a1[0] - a0[0]
  const rn = a1[1] - a0[1]
  const sx = b1[0] - b0[0]
  const sn = b1[1] - b0[1]
  const den = rx * sn - rn * sx
  if (Math.abs(den) < 1e-12) return null
  const qx = b0[0] - a0[0]
  const qn = b0[1] - a0[1]
  const t = (qx * sn - qn * sx) / den
  const u = (qx * rn - qn * rx) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return [a0[0] + t * rx, a0[1] + t * rn]
}

export function forEdges(poly: Poly, f: (p: SitePoint, q: SitePoint) => void): void {
  for (let i = 0; i < poly.length; i++) f(poly[i], poly[(i + 1) % poly.length])
}
