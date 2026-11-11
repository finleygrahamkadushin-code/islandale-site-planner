import type { LocalPoint } from '../footprint'
import { pointInPolygon } from '../../site/geom2d'

export type SupportType = 'posts' | 'skirt' | 'none'

/** Every support the legacy planner offers (SUPPORTS, less 'auto'). */
export const SUPPORT_KINDS = ['slab', 'skirt', 'posts', 'piers', 'pilings', 'earth', 'mast', 'stilts'] as const
export type SupportKind = (typeof SUPPORT_KINDS)[number]

/** Auto supports turn from a skirt to posts once the floor is this far over the low ground, metres (legacy). */
const AUTO_POSTS_DROP_M = 1.6

/**
 * Legacy effectiveSupport(): the support the plan names, or for 'auto' (or
 * anything unknown) posts once the floor is more than 1.6 m over the low
 * ground and a concrete skirt below that.
 */
export function effectiveSupport(support: unknown, dropM: number): SupportKind {
  if (typeof support === 'string' && (SUPPORT_KINDS as readonly string[]).includes(support)) return support as SupportKind
  return dropM > AUTO_POSTS_DROP_M ? 'posts' : 'skirt'
}

/** The support's family: something standing on the ground (posts, piers, pilings, mast, stilts), a skirt (slab, skirt), or nothing (earth). */
export function supportType(support: unknown, dropM: number): SupportType {
  const k = effectiveSupport(support, dropM)
  if (k === 'earth') return 'none'
  return k === 'slab' || k === 'skirt' ? 'skirt' : 'posts'
}

/**
 * Post positions (local feet) on a grid at `spacingFt`, inset by half a post,
 * kept to those inside the footprint, plus the footprint's corners for
 * shaped plans, as the legacy supportPoints() did.
 */
export function postPositions(poly: readonly LocalPoint[], spacingFt: number, postIn: number): LocalPoint[] {
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const minx = Math.min(...xs)
  const maxx = Math.max(...xs)
  const minz = Math.min(...zs)
  const maxz = Math.max(...zs)
  const s = Math.max(3, spacingFt)
  const inset = postIn / 24 + 0.25
  const nx = Math.max(2, Math.round((maxx - minx) / s) + 1)
  const nz = Math.max(2, Math.round((maxz - minz) / s) + 1)
  const pts: LocalPoint[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = minx + inset + ((maxx - minx - 2 * inset) * i) / (nx - 1)
      const z = minz + inset + ((maxz - minz - 2 * inset) * j) / (nz - 1)
      if (pointInPolygon(poly, x, z)) pts.push([x, z])
    }
  }
  const rect = poly.length === 4
  if (!rect) {
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length
    const cz = zs.reduce((a, b) => a + b, 0) / zs.length
    for (const [x, z] of poly) {
      const d = Math.hypot(x - cx, z - cz) || 1
      const k = Math.max(0, 1 - (inset * 1.5) / d)
      const p: LocalPoint = [cx + (x - cx) * k, cz + (z - cz) * k]
      if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < s * 0.45)) pts.push(p)
    }
  }
  return pts
}

