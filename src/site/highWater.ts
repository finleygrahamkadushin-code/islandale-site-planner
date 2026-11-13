import { pointInPolygon } from './geom2d'
import type { Parcel, SitePoint } from './types'
import { ftToM } from './units'

/**
 * The approximate high-water line (Finley's decision, Nov 13): the shoreline
 * buffer is measured from where the bare ground (the LiDAR grid, no
 * earthworks) reaches 8 ft NAVD88, mean higher high water at Lopez, not from
 * the assessor's lot line along the water, which lies below it along most
 * of the shore. Not surveyed: the legal ordinary high water mark can only
 * come from a survey, and may be further landward.
 */

/** The high-water line: one polyline along the shore; segment k (pts[k] to pts[k + 1]) was walked in from ring edge edges[k]. */
export interface HighWaterLine {
  readonly pts: readonly SitePoint[]
  readonly edges: readonly number[]
  /** Samples that kept the lot line because no 8 ft ground was found inland. */
  readonly fallbacks: number
}

/** Mean higher high water at Lopez, feet NAVD88: the level the high-water line follows. */
export const HIGH_WATER_FT = 8
export const HIGH_WATER_M = ftToM(HIGH_WATER_FT)

/** How the line is drawn and named in the view and on the site sheet. */
export const HIGH_WATER_LABEL = `approximate high-water line (${HIGH_WATER_FT} ft NAVD88, from the terrain; not surveyed)`

/** The lot line is sampled this often along the shore, metres. */
const SAMPLE_M = 0.5
/** Each look inland steps this far, metres. */
const STEP_M = 0.25
/** How far a sample looks for 8 ft ground before keeping its neighbours' line, metres. */
export const MAX_WALK_M = 30
/** Directions a sample looks in: every 10°. */
const DIRECTIONS = 36
/** A point this close to the lot line counts as on it, metres (the shoreline's end corners sit on the side lot lines). */
const ON_LINE_M = 0.05

const nearRing = (ring: readonly SitePoint[], x: number, n: number): boolean =>
  ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0]
    const dn = b[1] - a[1]
    const l2 = dx * dx + dn * dn
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (n - a[1]) * dn) / l2)) : 0
    return Math.hypot(x - a[0] - t * dx, n - a[1] - t * dn) < ON_LINE_M
  })

const RAYS: readonly SitePoint[] = Array.from({ length: DIRECTIONS }, (_, k) => [Math.cos((2 * Math.PI * k) / DIRECTIONS), Math.sin((2 * Math.PI * k) / DIRECTIONS)])

/**
 * The nearest ground in the lot that reaches `level`, from a point on the lot
 * line: the point itself when it is already there, else the nearest first
 * crossing along 36 directions (an edge's own inward normal can run along
 * the inside of the next shore at a sharp corner and find 8 ft far away).
 * Null when none is found within MAX_WALK_M.
 */
function nearestHigh(ring: readonly SitePoint[], ground: (x: number, n: number) => number, p: SitePoint, level: number): SitePoint | null {
  const z0 = ground(p[0], p[1])
  if (z0 >= level) return p
  let best: { readonly at: SitePoint; readonly t: number } | null = null
  for (const [dx, dn] of RAYS) {
    let prev = z0
    for (let t = STEP_M; t <= MAX_WALK_M + 1e-9 && (!best || t < best.t + STEP_M); t += STEP_M) {
      const z = ground(p[0] + dx * t, p[1] + dn * t)
      if (z >= level) {
        const hit = t - (STEP_M * (z - level)) / (z - prev || 1)
        const at: SitePoint = [p[0] + dx * hit, p[1] + dn * hit]
        // high ground outside the lot (a neighbour's, or past a spit) does not count
        if ((!best || hit < best.t) && (pointInPolygon(ring, at[0], at[1]) || nearRing(ring, at[0], at[1]))) best = { at, t: hit }
        break
      }
      prev = z
    }
  }
  return best?.at ?? null
}

/**
 * The high-water line along the parcel's shoreline edges: each edge sampled
 * every half metre (its last corner too, for the shoreline's last edge), and
 * each sample moved to the nearest ground in the lot at 8 ft, or kept on the
 * lot line where the lot line is at or above 8 ft. So the line is whichever
 * of the two is further landward at each point, one polyline with a point
 * per sample, running from the shoreline's first corner to its last (each
 * moved to its nearest 8 ft ground, so the ends sit at or just inside the
 * side lot lines). A sample that finds no 8 ft ground within MAX_WALK_M takes
 * the line between its neighbours (`fallbacks` counts them; Islandale has
 * none).
 */
export function highWaterLine(parcel: Parcel, ground: (x: number, n: number) => number, level = HIGH_WATER_M): HighWaterLine {
  const { ring } = parcel
  const { first, last } = parcel.shorelineEdges
  const found: (SitePoint | null)[] = []
  const lotLine: SitePoint[] = []
  const edges: number[] = []
  const add = (p: SitePoint) => {
    found.push(nearestHigh(ring, ground, p, level))
    lotLine.push(p)
  }
  for (let e = first; e <= last; e++) {
    const a = ring[e]
    const b = ring[(e + 1) % ring.length]
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_M))
    // a segment belongs to the edge its first point was sampled on
    for (let s = 0; s < steps; s++) {
      edges.push(e)
      add([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps])
    }
    if (e === last) add(b)
  }
  return { pts: fillGaps(found, lotLine), edges, fallbacks: found.filter((q) => !q).length }
}

/**
 * A sample whose walk found no 8 ft ground takes the straight line between
 * the nearest samples either side that did (the only one, at an end), so the
 * line stays continuous through a sharp corner; with none found anywhere,
 * the lot line.
 */
function fillGaps(found: readonly (SitePoint | null)[], lotLine: readonly SitePoint[]): SitePoint[] {
  const ok = found.flatMap((p, k) => (p ? [k] : []))
  if (!ok.length) return [...lotLine]
  return found.map((p, k) => {
    if (p) return p
    const before = ok.filter((i) => i < k).at(-1)
    const after = ok.find((i) => i > k)
    if (before === undefined) return found[after!]!
    if (after === undefined) return found[before]!
    const t = (k - before) / (after - before)
    const a = found[before]!
    const b = found[after]!
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  })
}
