import { buildingMasses, deckObjectMass, massBuildingPoly } from '../buildings/masses'
import { localToSite, siteFootprint, type LocalPoint } from '../buildings/footprint'
import type { Ground } from '../site/earthworks/earthworksTypes'
import type { SitePoint } from '../site/types'
import { pointInPolygon } from '../site/geom2d'
import type { PlanObject } from '../store/types'

/**
 * Contact shadows (4E): a soft darkening of the ground under each building,
 * built as a thin mesh draped on the ground (no new shader), strongest under
 * the walls and fading out past them. Pure: outlines and ground in, arrays out.
 */

/** How far past the walls the shadow fades out, metres. */
export const SHADOW_REACH_M = 1.4
/** Opacity right under the walls. */
export const SHADOW_STRENGTH = 0.42
/** Grid spacing of the draped mesh, metres. */
export const SHADOW_CELL_M = 0.35
/** Lift over the ground so it never fights with it, metres. */
export const SHADOW_LIFT_M = 0.02

/** Object types that stand on the ground and cast a contact shadow. */
const CASTS = new Set(['house', 'deck', 'shed', 'shop'])

export const castsContactShadow = (o: PlanObject): boolean => CASTS.has(o.type) && !o.hidden

/** The outlines (site metres) an object casts, every wing included. */
export function shadowOutlines(o: PlanObject): SitePoint[][] {
  const toSite = (poly: readonly LocalPoint[]) => poly.map((q) => localToSite(o.position, o.rotation, q))
  if (o.type === 'house') return buildingMasses(o.params).map((m) => toSite(massBuildingPoly(m)))
  if (o.type === 'deck') return [toSite(massBuildingPoly(deckObjectMass(o.params)))]
  return [[...siteFootprint(o)]]
}

/** Nearest edge, inline in the loop as `p - (a + t d)` with `|| 1`: not bit-for-bit `site/geom2d`'s pointSegmentDistance. */
function edgeDistance(poly: readonly SitePoint[], x: number, n: number): number {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, an] = poly[j]
    const [bx, bn] = poly[i]
    const dx = bx - ax
    const dn = bn - an
    const len2 = dx * dx + dn * dn || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / len2))
    best = Math.min(best, Math.hypot(x - (ax + t * dx), n - (an + t * dn)))
  }
  return best
}

/** Shadow opacity at a point: full inside any outline, fading to nothing `SHADOW_REACH_M` outside. */
export function shadowAlpha(polys: readonly (readonly SitePoint[])[], x: number, n: number): number {
  let near = Infinity
  for (const p of polys) {
    if (pointInPolygon(p, x, n)) return SHADOW_STRENGTH
    near = Math.min(near, edgeDistance(p, x, n))
  }
  const t = Math.max(0, Math.min(1, near / SHADOW_REACH_M))
  return SHADOW_STRENGTH * (1 - t) * (1 - t)
}

export interface ShadowMesh {
  /** x, height, -n per vertex (three.js frame). */
  readonly positions: Float32Array
  /** r, g, b, a per vertex: black, with the shadow's opacity. */
  readonly colors: Float32Array
  readonly indices: Uint32Array
}

/** One draped mesh for one object's outlines, over their box plus the fade. */
export function shadowMesh(polys: readonly (readonly SitePoint[])[], ground: Ground, cell = SHADOW_CELL_M): ShadowMesh {
  const pts = polys.flat()
  const x0 = Math.min(...pts.map((p) => p[0])) - SHADOW_REACH_M
  const x1 = Math.max(...pts.map((p) => p[0])) + SHADOW_REACH_M
  const n0 = Math.min(...pts.map((p) => p[1])) - SHADOW_REACH_M
  const n1 = Math.max(...pts.map((p) => p[1])) + SHADOW_REACH_M
  const nx = Math.max(2, Math.ceil((x1 - x0) / cell) + 1)
  const nn = Math.max(2, Math.ceil((n1 - n0) / cell) + 1)
  const positions = new Float32Array(nx * nn * 3)
  const colors = new Float32Array(nx * nn * 4)
  for (let j = 0; j < nn; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((x1 - x0) * i) / (nx - 1)
      const n = n0 + ((n1 - n0) * j) / (nn - 1)
      const k = j * nx + i
      positions.set([x, ground(x, n) + SHADOW_LIFT_M, -n], k * 3)
      colors[k * 4 + 3] = shadowAlpha(polys, x, n)
    }
  }
  const idx: number[] = []
  for (let j = 0; j + 1 < nn; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1
      // skip cells with no shadow at any corner
      if (colors[a * 4 + 3] + colors[b * 4 + 3] + colors[c * 4 + 3] + colors[d * 4 + 3] === 0) continue
      idx.push(a, c, b, b, c, d)
    }
  }
  return { positions, colors, indices: Uint32Array.from(idx) }
}
