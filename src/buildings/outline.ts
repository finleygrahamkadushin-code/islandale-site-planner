import { pointInPolygon } from './foundation/foundation'
import { signedArea, type LocalPoint } from './footprint'

/**
 * Port of the legacy `polyOffset`: move every edge of an outline by `d`
 * (positive grows, negative shrinks) with clamped mitres, so smooth
 * many-vertex outlines and non-convex ones both work. Any units.
 */
export function offsetOutline(poly: readonly LocalPoint[], d: number): LocalPoint[] {
  const n = poly.length
  if (n < 3 || d === 0) return [...poly]
  const s = signedArea(poly) > 0 ? 1 : -1
  const normals = poly.map((a, i) => {
    const b = poly[(i + 1) % n]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(s * (b[1] - a[1])) / l, (-s * (b[0] - a[0])) / l] as const
  })
  return poly.map((p, i) => {
    const n0 = normals[(i + n - 1) % n]
    const n1 = normals[i]
    let mx = n0[0] + n1[0]
    let mz = n0[1] + n1[1]
    const ml = Math.hypot(mx, mz)
    if (ml < 1e-6) return [p[0] + n1[0] * d, p[1] + n1[1] * d] as const
    mx /= ml
    mz /= ml
    const c = Math.max(0.5, mx * n1[0] + mz * n1[1])
    return [p[0] + (mx * d) / c, p[1] + (mz * d) / c] as const
  })
}

export function perimeterLength(poly: readonly LocalPoint[]): number {
  let L = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    L += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return L
}

/** Evenly spaced points round a closed outline, about `spacing` apart (legacy perimSamples). */
export function perimeterSamples(poly: readonly LocalPoint[], spacing: number): LocalPoint[] {
  const L = perimeterLength(poly)
  const k = Math.max(4, Math.round(L / spacing))
  const out: LocalPoint[] = []
  let edge = 0
  let start = 0
  for (let j = 0; j < k; j++) {
    const u = (L * j) / k
    for (;;) {
      const a = poly[edge]
      const b = poly[(edge + 1) % poly.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (u <= start + len || edge === poly.length - 1) {
        const f = len > 0 ? (u - start) / len : 0
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
        break
      }
      start += len
      edge++
    }
  }
  return out
}

/**
 * Post layout for a curved or many-sided floor (legacy curvePosts): a ring
 * every `spacing` just inside the edge, plus an interior grid that keeps
 * clear of the ring.
 */
export function curvePosts(poly: readonly LocalPoint[], spacing: number, inset: number): LocalPoint[] {
  const ring = perimeterSamples(offsetOutline(poly, -inset), spacing)
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  const inner = offsetOutline(poly, -inset - spacing * 0.5)
  const pts = [...ring]
  for (let x = x0 + spacing; x < x1; x += spacing) {
    for (let z = z0 + spacing; z < z1; z += spacing) {
      if (!pointInPolygon(inner, x, z)) continue
      if (ring.some((q) => Math.hypot(q[0] - x, q[1] - z) < spacing * 0.6)) continue
      pts.push([x, z])
    }
  }
  return pts
}

/** Points along each edge of an outline: the corners plus enough in between to keep gaps under `maxGap`. */
export function edgePosts(poly: readonly LocalPoint[], maxGap: number): LocalPoint[] {
  const pts: LocalPoint[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxGap))
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  })
  return pts
}
