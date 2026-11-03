import { emptyMesh, type MeshData } from './geom'
import type { RailStyle } from './railEdits'
import { beam, box, prismX } from './stairMesh'

/** Stair and ramp wing handrails stand 0.9 m over the nosing line or slope (legacy railH). */
export const WING_RAIL_M = 0.9
/** Posts along a handrail are at most this far apart. */
const POST_GAP_M = 1.2
/** A handrail shorter than this is not drawn. */
const MIN_RAIL_M = 0.25
/** With a door at the top, the handrail starts this much further down and has no top post. */
export const CLEAR_TOP_M = 0.3
const BALUSTER_GAP_M = 0.1
const BALUSTER_M = 0.015

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
  readonly balusters: number
  readonly skipped: boolean
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
 * style's infill: wood balusters every 0.1 m, two steel rails, cables every
 * 0.08 m, or a glass pane.
 */
export function handrail(c: HandrailCtx, sg: -1 | 1, zMin: number, zMax: number, line: (z: number) => number, surf: (z: number) => number): Handrail {
  const xr = sg * (c.w / 2 - 0.03)
  const za = Math.max(zMin, c.zt(xr) + 0.05) + (c.clearTop ? CLEAR_TOP_M : 0)
  const zb = zMax
  if (zb - za < MIN_RAIL_M) return { info: { side: sg, za, zb, posts: [], balusters: 0, skipped: true }, frame: null, glass: null }
  const { H, rT } = c
  const gb = emptyMesh()
  beam(gb, xr, za, line(za) + H, zb, line(zb) + H, rT, rT)
  const m = Math.max(1, Math.ceil((zb - za) / POST_GAP_M - 1e-9))
  const posts: number[] = []
  for (let k = c.clearTop ? 1 : 0; k <= m; k++) {
    const zq = Math.min(zb - rT / 2, Math.max(za + rT / 2, za + ((zb - za) * k) / m))
    posts.push(zq)
    box(gb, xr - rT / 2, xr + rT / 2, surf(zq), line(zq) + H, zq - rT / 2, zq + rT / 2)
  }
  let balusters = 0
  if (c.style === 'wood') {
    for (let k = 1; ; k++) {
      const zq = za + BALUSTER_GAP_M * k
      if (zq > zb - 0.05) break
      if (posts.some((p) => Math.abs(p - zq) < 0.06)) continue
      balusters++
      box(gb, xr - BALUSTER_M / 2, xr + BALUSTER_M / 2, surf(zq), line(zq) + H - rT / 2, zq - BALUSTER_M / 2, zq + BALUSTER_M / 2)
    }
  } else if (c.style === 'steel') {
    for (const f of [0.35, 0.65]) beam(gb, xr, za, line(za) + H * f, zb, line(zb) + H * f, 0.02, 0.02)
  } else if (c.style === 'cable') {
    for (let y = 0.1; y < H - 0.08; y += 0.08) beam(gb, xr, za, line(za) + y, zb, line(zb) + y, 0.006, 0.006)
  }
  const glass =
    c.style === 'glass'
      ? prismX(
          emptyMesh(),
          [
            [za, line(za) + 0.1],
            [zb, line(zb) + 0.1],
            [zb, line(zb) + H - 0.08],
            [za, line(za) + H - 0.08],
          ],
          xr - 0.006,
          xr + 0.006,
        )
      : null
  return { info: { side: sg, za, zb, posts, balusters, skipped: false }, frame: gb, glass }
}
