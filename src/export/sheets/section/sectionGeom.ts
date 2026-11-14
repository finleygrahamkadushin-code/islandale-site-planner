import type { LocalPoint } from '../../../buildings/footprint'

/**
 * The plain geometry a section is cut with, in building-frame feet: a
 * vertical cut plane through the line `origin + u · dir`, seen looking along
 * `look` (so `u` runs to the viewer's right). A point's depth is how far
 * beyond the plane it lies; a section's drawing is (u, y), y up.
 */

/** A building-frame point in 3D, feet: x, y up (above the main floor), z. */
export type P3 = readonly [number, number, number]
export type Tri = readonly [P3, P3, P3]
/** A point on the section's drawing: u along the cut, y up, feet. */
export type UY = readonly [number, number]
export type Interval = readonly [number, number]

export interface CutLine {
  readonly origin: LocalPoint
  /** Unit vector along the cut, building frame (x, z). */
  readonly dir: LocalPoint
  /** Unit vector the section looks along: `[dir.z, −dir.x]`, so u runs to the viewer's right on a plan drawn z down. */
  readonly look: LocalPoint
}

/** Intervals closer than this are one, and slivers thinner than it are dropped, feet. */
const EPS = 1e-6

export const lookOf = (dir: LocalPoint): LocalPoint => [dir[1], -dir[0]]
export const uOf = (c: CutLine, p: LocalPoint): number => (p[0] - c.origin[0]) * c.dir[0] + (p[1] - c.origin[1]) * c.dir[1]
export const depthOf = (c: CutLine, p: LocalPoint): number => (p[0] - c.origin[0]) * c.look[0] + (p[1] - c.origin[1]) * c.look[1]
/** The plan point at u along the cut and the given depth beyond it. */
export const planAt = (c: CutLine, u: number, depth = 0): LocalPoint => [c.origin[0] + c.dir[0] * u + c.look[0] * depth, c.origin[1] + c.dir[1] * u + c.look[1] * depth]

/** Where the cut line crosses each edge of a closed outline: the edge's index, the u of the crossing and how far along the edge (0–1). */
export function lineCrossings(poly: readonly LocalPoint[], c: CutLine): { readonly edge: number; readonly u: number; readonly t: number }[] {
  const out: { edge: number; u: number; t: number }[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const da = depthOf(c, a)
    const db = depthOf(c, b)
    // half-open, so a vertex on the line counts once
    if (da > 0 === db > 0) return
    const t = da / (da - db)
    out.push({ edge: i, t, u: uOf(c, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) })
  })
  return out.sort((p, q) => p.u - q.u)
}

/** The stretches of the cut line inside a closed outline, low u to high. */
export function lineIntervals(poly: readonly LocalPoint[], c: CutLine): Interval[] {
  if (poly.length < 3) return []
  const us = lineCrossings(poly, c).map((x) => x.u)
  const out: Interval[] = []
  for (let i = 0; i + 1 < us.length; i += 2) if (us[i + 1] - us[i] > EPS) out.push([us[i], us[i + 1]])
  return out
}

/** `from` less every interval of `holes`. */
export function subtractIntervals(from: readonly Interval[], holes: readonly Interval[]): Interval[] {
  return from.flatMap((iv) => {
    let pieces: Interval[] = [iv]
    for (const [h0, h1] of holes) {
      pieces = pieces.flatMap(([a, b]): Interval[] => {
        if (h1 <= a || h0 >= b) return [[a, b]]
        return [...(h0 > a ? [[a, h0] as Interval] : []), ...(h1 < b ? [[h1, b] as Interval] : [])]
      })
    }
    return pieces.filter(([a, b]) => b - a > EPS)
  })
}

const depth3 = (c: CutLine, p: P3) => depthOf(c, [p[0], p[2]])
const uy3 = (c: CutLine, p: P3): UY => [uOf(c, [p[0], p[2]]), p[1]]
const lerp3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Where the cut plane passes through a triangle, as a segment on the drawing; null when it misses or only touches it. */
export function cutTriangle(tri: Tri, c: CutLine): readonly [UY, UY] | null {
  const d = tri.map((p) => depth3(c, p))
  const pts: UY[] = []
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3
    if (d[i] > 0 === d[j] > 0) continue
    pts.push(uy3(c, lerp3(tri[i], tri[j], d[i] / (d[i] - d[j]))))
  }
  if (pts.length < 2) return null
  const [a, b] = pts
  return Math.hypot(b[0] - a[0], b[1] - a[1]) > EPS ? [a, b] : null
}

/** The part of a triangle at or beyond the cut plane (depth ≥ 0), as a polygon of 3D points; empty when it lies wholly in front. */
export function clipBeyond(tri: Tri, c: CutLine): P3[] {
  const out: P3[] = []
  for (let i = 0; i < 3; i++) {
    const p = tri[i]
    const q = tri[(i + 1) % 3]
    const dp = depth3(c, p)
    const dq = depth3(c, q)
    if (dp >= 0) out.push(p)
    if (dp >= 0 !== dq >= 0) out.push(lerp3(p, q, dp / (dp - dq)))
  }
  return out.length >= 3 ? out : []
}

/** A clipped polygon's edges as seen on the drawing. */
export function projectedEdges(poly: readonly P3[], c: CutLine): (readonly [UY, UY])[] {
  return poly.map((p, i) => [uy3(c, p), uy3(c, poly[(i + 1) % poly.length])] as const)
}

/** The highest and lowest y of any segment over u, or null where none covers it. */
export function envelopeAt(segs: readonly (readonly [UY, UY])[], u: number): { readonly top: number; readonly bottom: number } | null {
  let top = -Infinity
  let bottom = Infinity
  for (const [a, b] of segs) {
    const lo = Math.min(a[0], b[0])
    const hi = Math.max(a[0], b[0])
    if (u < lo - EPS || u > hi + EPS) continue
    const ys = hi - lo < EPS ? [a[1], b[1]] : [a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0])]
    for (const y of ys) {
      top = Math.max(top, y)
      bottom = Math.min(bottom, y)
    }
  }
  return Number.isFinite(top) ? { top, bottom } : null
}

/**
 * The upper and lower outline of some segments seen on the drawing: one
 * run per stretch of u they cover without a gap, sampled at every end and
 * every `step` feet between.
 */
export function silhouette(segs: readonly (readonly [UY, UY])[], step: number): { readonly top: UY[]; readonly bottom: UY[] }[] {
  if (!segs.length) return []
  const ends = segs.flatMap(([a, b]) => [a[0], b[0]])
  const lo = Math.min(...ends)
  const hi = Math.max(...ends)
  const grid = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, k) => lo + k * step)
  const us = [...new Set([...ends, ...grid].map((u) => Math.round(u * 1e6) / 1e6))].sort((a, b) => a - b)
  const runs: { top: UY[]; bottom: UY[] }[] = []
  let run: { top: UY[]; bottom: UY[] } | null = null
  for (const u of us) {
    const e = envelopeAt(segs, u)
    // a gap between two samples is a gap only if nothing covers the middle either
    if (!e || (run && !envelopeAt(segs, (run.top[run.top.length - 1][0] + u) / 2))) {
      if (run) runs.push(run)
      run = null
      if (!e) continue
    }
    run ??= { top: [], bottom: [] }
    run.top.push([u, e.top])
    run.bottom.push([u, e.bottom])
  }
  if (run) runs.push(run)
  return runs.filter((r) => r.top.length >= 2)
}

/** The centroid of a closed outline (its vertices' mean when it has no area). */
export function centroidOf(poly: readonly LocalPoint[]): LocalPoint {
  let a = 0
  let cx = 0
  let cz = 0
  poly.forEach(([x1, z1], i) => {
    const [x2, z2] = poly[(i + 1) % poly.length]
    const f = x1 * z2 - x2 * z1
    a += f
    cx += (x1 + x2) * f
    cz += (z1 + z2) * f
  })
  if (Math.abs(a) < 1e-9) return [poly.reduce((s, p) => s + p[0], 0) / (poly.length || 1), poly.reduce((s, p) => s + p[1], 0) / (poly.length || 1)]
  return [cx / (3 * a), cz / (3 * a)]
}
