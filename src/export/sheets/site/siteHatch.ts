/**
 * Line textures for the site plan, as plain vector segments (no masks or
 * patterns, so they print crisp in any PDF): hatching clipped to a setback
 * band by the rule itself, water lines off the shore, and the tick marks of
 * a bank. Sheet feet. Pure.
 */
import type { Extent } from '../Page'
import type { Pt } from '../svgDims'
import { distToSegment, insidePoly, type Seg4 } from './siteGeom'

/** Bisection steps when finding where a hatch line enters or leaves its band: 2^-14 of a step. */
const EDGE_STEPS = 14

/**
 * Parallel hatch lines `spacing` apart at `angleDeg` (sheet, clockwise from
 * the x axis) over the extent, kept only where `inside` holds: each line is
 * sampled every `step` and every change refined by bisection, so a hatch
 * stops on the band's true edge to well under a printed hair.
 */
export function hatchWhere(inside: (p: Pt) => boolean, extent: Extent, spacing: number, angleDeg: number, step: number): Seg4[] {
  const a = (angleDeg * Math.PI) / 180
  const d: Pt = [Math.cos(a), Math.sin(a)]
  const m: Pt = [-d[1], d[0]]
  const corners: Pt[] = [
    [extent.x, extent.y],
    [extent.x + extent.w, extent.y],
    [extent.x, extent.y + extent.h],
    [extent.x + extent.w, extent.y + extent.h],
  ]
  const along = corners.map(([x, y]) => x * d[0] + y * d[1])
  const across = corners.map(([x, y]) => x * m[0] + y * m[1])
  const s0 = Math.min(...along)
  const s1 = Math.max(...along)
  const at = (t: number, s: number): Pt => [m[0] * t + d[0] * s, m[1] * t + d[1] * s]
  const inBox = ([x, y]: Pt) => x >= extent.x && x <= extent.x + extent.w && y >= extent.y && y <= extent.y + extent.h
  const test = (t: number, s: number) => {
    const p = at(t, s)
    return inBox(p) && inside(p)
  }
  const edge = (t: number, lo: number, hi: number, loIn: boolean) => {
    let a0 = lo
    let b0 = hi
    for (let i = 0; i < EDGE_STEPS; i++) {
      const mid = (a0 + b0) / 2
      if (test(t, mid) === loIn) a0 = mid
      else b0 = mid
    }
    return (a0 + b0) / 2
  }
  const out: Seg4[] = []
  // lines sit on whole multiples of the spacing, so neighbouring drawings' hatches line up
  for (let t = Math.ceil(Math.min(...across) / spacing) * spacing; t <= Math.max(...across); t += spacing) {
    let prevS = s0
    let prevIn = test(t, s0)
    let start = prevIn ? s0 : NaN
    for (let s = s0 + step; s <= s1 + step; s += step) {
      const sc = Math.min(s, s1)
      const now = test(t, sc)
      if (now !== prevIn) {
        const e = edge(t, prevS, sc, prevIn)
        if (now) start = e
        else out.push([...at(t, start), ...at(t, e)] as Seg4)
      }
      prevS = sc
      prevIn = now
      if (sc === s1) break
    }
    if (prevIn) out.push([...at(t, start), ...at(t, s1)] as Seg4)
  }
  return out.filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) > step * 0.05)
}

/** Shortest distance from a point to a polyline. */
export function distToLine(p: Pt, line: readonly Pt[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(p, line[i - 1], line[i]))
  return best
}

/** Unit normals at each vertex of a polyline (the average of its two edges'), to the left of the direction of travel. */
function vertexNormals(line: readonly Pt[]): Pt[] {
  return line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(line.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    return [-dy / l, dx / l]
  })
}

/**
 * Water lines off a shoreline: copies of it `offsets` out into the water
 * (the side `inLand` says is not land), broken wherever a copy would cross
 * back over land or come nearer the shore than most of its offset, the way
 * a draughtsman draws ripples parallel to the bank.
 */
export function waterLines(shore: readonly Pt[], inLand: (p: Pt) => boolean, offsets: readonly number[]): Pt[][] {
  if (shore.length < 2) return []
  const normals = vertexNormals(shore)
  // which side of the shore is water: the side most probe points fall off the land
  const probe = shore.filter((_, i) => i % 4 === 0)
  const leftWet = probe.filter((p, i) => !inLand([p[0] + normals[i * 4][0] * 0.5, p[1] + normals[i * 4][1] * 0.5])).length >= probe.length / 2
  const sign = leftWet ? 1 : -1
  return offsets.flatMap((off) => {
    const runs: Pt[][] = []
    let run: Pt[] = []
    shore.forEach((p, i) => {
      const q: Pt = [p[0] + normals[i][0] * off * sign, p[1] + normals[i][1] * off * sign]
      const ok = !inLand(q) && distToLine(q, shore) > off * 0.7
      if (ok) run.push(q)
      else if (run.length) {
        runs.push(run)
        run = []
      }
    })
    if (run.length) runs.push(run)
    return runs.filter((r) => r.length >= 3)
  })
}

/**
 * The ticks of a bank symbol: short strokes off a line every `spacing`,
 * toward the side `toward` says is downhill (nearer the water), each
 * `length` long, alternating long and short as a top-of-bank line is drawn.
 */
export function bankTicks(line: readonly Pt[], toward: (p: Pt) => number, spacing: number, length: number): Seg4[] {
  const out: Seg4[] = []
  let carry = spacing / 2
  let k = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l === 0) continue
    const u: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
    const n: Pt = [-u[1], u[0]]
    let s = carry
    for (; s <= l; s += spacing) {
      const p: Pt = [a[0] + u[0] * s, a[1] + u[1] * s]
      const plus: Pt = [p[0] + n[0], p[1] + n[1]]
      const minus: Pt = [p[0] - n[0], p[1] - n[1]]
      const sgn = toward(plus) < toward(minus) ? 1 : -1
      const len = k++ % 2 === 0 ? length : length * 0.55
      out.push([p[0], p[1], p[0] + n[0] * sgn * len, p[1] + n[1] * sgn * len])
    }
    carry = s - l
  }
  return out
}

/**
 * Gravel stipple: evenly scattered dots inside a polygon, about one per
 * `areaPer` square feet, jittered on a grid so they never clump, and the
 * same every time for the same seed.
 */
export function stipple(poly: readonly Pt[], areaPer: number, seed: number): Pt[] {
  if (poly.length < 3) return []
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const step = Math.sqrt(areaPer)
  let s = seed >>> 0 || 1
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const out: Pt[] = []
  for (let y = Math.min(...ys); y < Math.max(...ys); y += step) {
    for (let x = Math.min(...xs); x < Math.max(...xs); x += step) {
      const p: Pt = [x + rand() * step, y + rand() * step]
      if (insidePoly(poly, p)) out.push(p)
    }
  }
  return out
}
