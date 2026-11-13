import { emptyMesh, type MeshData } from '../geom'
import type { RailStyle } from '../rails/railEdits'
import { beam, box, prismX } from './stairMesh'
import { CABLE_CLEAR_M, INFILL_CLEAR_M } from '../rails/railStyles'

/** Stair and ramp wing handrails stand 0.9 m over the nosing line or slope (legacy railH). */
export const WING_RAIL_M = 0.9
/** Posts along a handrail are at most this far apart. */
const POST_GAP_M = 1.2
/** A handrail shorter than this is not drawn. */
const MIN_RAIL_M = 0.25
/** With a door at the top, the handrail starts this much further down and has no top post. */
export const CLEAR_TOP_M = 0.3
/** A joined handrail's newel stands this far in from the host edge. */
const JOIN_IN_M = 0.03
/** Vertical bars: wood balusters and steel pickets, square. */
const BALUSTER_M = 0.015
const PICKET_M = 0.012
const CABLE_M = 0.006
/** The lowest cable or glass edge over the nosing line (the triangle under a stair rail may be larger than 4 in). */
const GLASS_BASE_M = 0.1

/** Rail section: 0.06 for wood and glass, 0.035 for steel and cable (legacy rT). */
export const railSection = (style: RailStyle): number => (style === 'steel' || style === 'cable' ? 0.035 : 0.06)

/** One side's handrail, as the info for tests and the part inspector. */
export interface StairRailInfo {
  /** -1 the left side (edge 3), +1 the right (edge 1). */
  readonly side: -1 | 1
  readonly za: number
  readonly zb: number
  /** Post positions along z. */
  readonly posts: readonly number[]
  /** Wood balusters or steel pickets: their count, their z, their width. */
  readonly balusters: number
  readonly infill: readonly number[]
  readonly infillW: number
  /** Cables: their centres' heights over the nosing line. */
  readonly cables: readonly number[]
  readonly skipped: boolean
  /** Carried on over the landing to the railing at the top (Join). */
  readonly joined?: boolean
}

export interface HandrailCtx {
  readonly w: number
  readonly H: number
  readonly rT: number
  readonly style: RailStyle
  readonly clearTop: boolean
  /** The top curve at x (where the host is met). */
  readonly zt: (x: number) => number
}

export interface Handrail {
  readonly info: StairRailInfo
  readonly frame: MeshData | null
  readonly glass: MeshData | null
}

/**
 * Port of the stair-geom rails(): along one side at x = ±(w/2 − 0.03), a
 * top rail rT square along line(z) + H from za (5 cm past the host, or the
 * top nosing; 0.3 m further with a door at the top) to zb, posts at most
 * 1.2 m apart from the surface up (no top post with clearTop), and the
 * style's infill, laid out bay by bay between the posts so no opening is
 * over 3.5 in (R3.7, the 4 in sphere rule): wood balusters, steel pickets
 * (deliberate change: the legacy two steel rails left 10 to 12 in
 * openings), cables no more than 3 in apart up to the rail, or a glass pane.
 */
export function handrail(c: HandrailCtx, sg: -1 | 1, zMin: number, zMax: number, line: (z: number) => number, surf: (z: number) => number, join = false): Handrail {
  const xr = sg * (c.w / 2 - 0.03)
  const za = Math.max(zMin, c.zt(xr) + 0.05) + (c.clearTop ? CLEAR_TOP_M : 0)
  const zb = zMax
  if (zb - za < MIN_RAIL_M) return { info: { side: sg, za, zb, posts: [], balusters: 0, infill: [], infillW: 0, cables: [], skipped: true }, frame: null, glass: null }
  const { H, rT } = c
  const gb = emptyMesh()
  beam(gb, xr, za, line(za) + H, zb, line(zb) + H, rT, rT)
  // Join (PLAN.md): a newel at the host edge meets the railing's end post; where the rail starts back from
  // the host (a curved host, R3.4's floor fill) the top rail carries on level over the gap to it
  const zj = c.zt(xr) + JOIN_IN_M
  const joined = join && !c.clearTop
  if (joined) {
    if (za - zj > rT) beam(gb, xr, zj, line(za) + H, za, line(za) + H, rT, rT)
    box(gb, xr - rT / 2, xr + rT / 2, line(za), line(za) + H, zj - rT / 2, zj + rT / 2)
  }
  const m = Math.max(1, Math.ceil((zb - za) / POST_GAP_M - 1e-9))
  const posts: number[] = []
  for (let k = c.clearTop ? 1 : 0; k <= m; k++) {
    const zq = Math.min(zb - rT / 2, Math.max(za + rT / 2, za + ((zb - za) * k) / m))
    posts.push(zq)
    box(gb, xr - rT / 2, xr + rT / 2, surf(zq), line(zq) + H, zq - rT / 2, zq + rT / 2)
  }
  const bars = c.style === 'wood' || c.style === 'steel'
  const barW = c.style === 'wood' ? BALUSTER_M : PICKET_M
  const infill = bars ? bayBars(za, posts, rT, barW) : []
  for (const zq of infill) box(gb, xr - barW / 2, xr + barW / 2, surf(zq), line(zq) + H - rT / 2, zq - barW / 2, zq + barW / 2)
  const cables = c.style === 'cable' ? cableOffsets(H - rT / 2) : []
  for (const y of cables) beam(gb, xr, za, line(za) + y, zb, line(zb) + y, CABLE_M, CABLE_M)
  const glass =
    c.style === 'glass'
      ? prismX(
          emptyMesh(),
          [
            [za, line(za) + GLASS_BASE_M],
            [zb, line(zb) + GLASS_BASE_M],
            [zb, line(zb) + H - 0.08],
            [za, line(za) + H - 0.08],
          ],
          xr - 0.006,
          xr + 0.006,
        )
      : null
  return { info: { side: sg, za, zb, posts, balusters: infill.length, infill, infillW: bars ? barW : 0, cables, skipped: false, joined }, frame: gb, glass }
}

/**
 * Bars of width w along each bay, evenly, so no clear gap is over 3.5 in:
 * from the rail's start (za, open at a door) to the first post, then
 * between each pair of posts (width rT).
 */
function bayBars(za: number, posts: readonly number[], rT: number, w: number): number[] {
  const ends = [[za, 0] as const, ...posts.map((p) => [p, rT] as const)]
  return ends.slice(1).flatMap(([q, wq], k) => {
    const [p, wp] = ends[k]
    const lo = p + wp / 2
    const clear = q - wq / 2 - lo
    if (clear <= INFILL_CLEAR_M) return []
    const n = Math.ceil((clear - INFILL_CLEAR_M) / (INFILL_CLEAR_M + w) - 1e-9)
    const gap = (clear - n * w) / (n + 1)
    return Array.from({ length: n }, (_, j) => lo + (j + 1) * gap + j * w + w / 2)
  })
}

/** Cable centres over the nosing line, evenly from it up to the rail's underside (span), no gap over 3 in. */
function cableOffsets(span: number): number[] {
  const n = Math.ceil((span - CABLE_CLEAR_M) / (CABLE_CLEAR_M + CABLE_M) - 1e-9)
  const gap = (span - n * CABLE_M) / (n + 1)
  return Array.from({ length: n }, (_, k) => (k + 1) * gap + k * CABLE_M + CABLE_M / 2)
}
