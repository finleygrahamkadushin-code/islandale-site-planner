import type { LocalPoint } from './footprint'

export type SupportType = 'posts' | 'skirt' | 'none'

/** Legacy effectiveSupport(): posts for posts / stilts / pilings / mast, a skirt for slab, earth berm hides it, auto by drop. */
export function supportType(support: unknown, dropM: number): SupportType {
  const s = typeof support === 'string' ? support : 'auto'
  if (s === 'earth') return 'none'
  if (['posts', 'stilts', 'pilings', 'mast', 'piers'].includes(s)) return 'posts'
  if (s === 'slab' || s === 'skirt') return 'skirt'
  return dropM > 1.6 ? 'posts' : 'skirt'
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

export function pointInPolygon(poly: readonly LocalPoint[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
