/**
 * Small geometry for the site plan: joining iso-line segments into
 * polylines, thinning them, and writing them as smooth SVG paths. Pure.
 */
import type { Pt } from '../svgDims'

/** A segment as the iso-line functions give it: [x1, y1, x2, y2]. */
export type Seg4 = readonly [number, number, number, number]

/** Endpoints closer than this are the same point (the iso grids put shared crossings at exactly the same place). */
const JOIN_TOL = 1e-6

const key = (x: number, y: number) => `${Math.round(x / JOIN_TOL)},${Math.round(y / JOIN_TOL)}`

/**
 * Join segments that share endpoints into polylines, longest runs kept
 * whole. A closed loop comes back with its first point repeated at the end.
 * Marching squares can meet four segments at one saddle point; each is then
 * joined to one partner and the rest start new lines, so nothing is lost.
 */
export function chainSegments(segs: readonly Seg4[]): Pt[][] {
  const ends = new Map<string, number[]>()
  const used = new Uint8Array(segs.length)
  segs.forEach(([x1, y1, x2, y2], i) => {
    for (const k of [key(x1, y1), key(x2, y2)]) {
      const list = ends.get(k)
      if (list) list.push(i)
      else ends.set(k, [i])
    }
  })
  const nextFrom = (p: Pt): { i: number; to: Pt } | null => {
    for (const i of ends.get(key(p[0], p[1])) ?? []) {
      if (used[i]) continue
      const [x1, y1, x2, y2] = segs[i]
      const atStart = key(x1, y1) === key(p[0], p[1])
      return { i, to: atStart ? [x2, y2] : [x1, y1] }
    }
    return null
  }
  const lines: Pt[][] = []
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue
    used[s] = 1
    const [x1, y1, x2, y2] = segs[s]
    const fwd: Pt[] = [[x2, y2]]
    for (let n = nextFrom(fwd[fwd.length - 1]); n; n = nextFrom(fwd[fwd.length - 1])) {
      used[n.i] = 1
      fwd.push(n.to)
    }
    const back: Pt[] = [[x1, y1]]
    for (let n = nextFrom(back[back.length - 1]); n; n = nextFrom(back[back.length - 1])) {
      used[n.i] = 1
      back.push(n.to)
    }
    lines.push([...back.reverse(), ...fwd])
  }
  return lines
}

/** Douglas–Peucker: drop points within `tol` of the line through their neighbours, keeping both ends. */
export function simplifyLine(line: readonly Pt[], tol: number): Pt[] {
  if (line.length < 3) return [...line]
  const keep = new Uint8Array(line.length)
  keep[0] = 1
  keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let far = -1
    let dMax = tol
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(line[i], line[a], line[b])
      if (d > dMax) {
        dMax = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return line.filter((_, i) => keep[i])
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

export const isClosed = (line: readonly Pt[]): boolean =>
  line.length > 3 && Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]) < 1e-6

const f = (v: number) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(3).replace(/\.?0+$/, ''))

/** A polyline as straight SVG path data. */
export function linePath(line: readonly Pt[]): string {
  return line.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('')
}

/**
 * A polyline as a smooth SVG path through every point: a centripetal
 * Catmull–Rom spline written as cubic Béziers, so the curve passes exactly
 * through the surveyed crossings and never loops between close points.
 * Closed lines join smoothly at their seam.
 */
export function smoothPath(line: readonly Pt[]): string {
  if (line.length < 3) return linePath(line)
  const closed = isClosed(line)
  const pts = closed ? line.slice(0, -1) : line
  const n = pts.length
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const [c1, c2] = bezierControls(at(i - 1), at(i), at(i + 1), at(i + 2))
    const p2 = at(i + 1)
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

/** Bézier controls for the centripetal Catmull–Rom span p1 → p2 (Yuksel et al.), alpha 0.5. */
function bezierControls(p0: Pt, p1: Pt, p2: Pt, p3: Pt): readonly [Pt, Pt] {
  const d1 = Math.max(Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])), 1e-6)
  const d2 = Math.max(Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])), 1e-6)
  const d3 = Math.max(Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1])), 1e-6)
  // an end point repeated (open line) gives a zero first or last span: fall back to a straight tangent
  const same0 = p0[0] === p1[0] && p0[1] === p1[1]
  const same3 = p3[0] === p2[0] && p3[1] === p2[1]
  const c1: Pt = same0
    ? [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3]
    : [
        (d1 * d1 * p2[0] - d2 * d2 * p0[0] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[0]) / (3 * d1 * (d1 + d2)),
        (d1 * d1 * p2[1] - d2 * d2 * p0[1] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[1]) / (3 * d1 * (d1 + d2)),
      ]
  const c2: Pt = same3
    ? [p2[0] - (p2[0] - p1[0]) / 3, p2[1] - (p2[1] - p1[1]) / 3]
    : [
        (d3 * d3 * p1[0] - d2 * d2 * p3[0] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[0]) / (3 * d3 * (d3 + d2)),
        (d3 * d3 * p1[1] - d2 * d2 * p3[1] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[1]) / (3 * d3 * (d3 + d2)),
      ]
  return [c1, c2]
}

/** A closed polygon as SVG path data. */
export const polyPath = (poly: readonly Pt[]): string => (poly.length ? `${linePath(poly)}Z` : '')

/** Total length of a polyline. */
export function lineLength(line: readonly Pt[]): number {
  let s = 0
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
  return s
}

/** The point a distance along a polyline, and the unit direction there. */
export function pointAlongLine(line: readonly Pt[], dist: number): { readonly at: Pt; readonly dir: Pt } {
  let left = Math.max(0, dist)
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l === 0) continue
    if (left <= l || i === line.length - 1) {
      const t = Math.min(1, left / l)
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
    }
    left -= l
  }
  return { at: line[0] ?? [0, 0], dir: [1, 0] }
}

export interface Box {
  readonly minx: number
  readonly miny: number
  readonly maxx: number
  readonly maxy: number
}

/** Bounds of every point given; null when there are none. */
export function boxOf(points: Iterable<Pt>): Box | null {
  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity
  for (const [x, y] of points) {
    if (x < minx) minx = x
    if (y < miny) miny = y
    if (x > maxx) maxx = x
    if (y > maxy) maxy = y
  }
  return Number.isFinite(minx) ? { minx, miny, maxx, maxy } : null
}

/** Even-odd point in polygon. */
export function insidePoly(poly: readonly Pt[], [x, y]: Pt): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
