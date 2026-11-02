import type { LocalPoint } from '../../buildings/footprint'
import type { SheetArc } from './types'

/**
 * Curves in an outline. The app stores a curved wall as many short straight
 * edges; a drawing dimensions it as one arc (centre, radius, sweep), the way
 * it would be laid out on site. A run of at least MIN_EDGES short edges,
 * each turning the same way by a similar small angle, is fitted with a
 * circle and kept when every vertex lies within MAX_FIT_FT of it.
 */
const MIN_EDGES = 4
const MAX_EDGE_FT = 4
const MAX_TURN_DEG = 30
/** A vertex turning less than this is straight, not part of a curve. */
const MIN_TURN_DEG = 0.25
/** Neighbouring turns are "similar" within this many degrees, or within this share of the larger. */
const SIMILAR_DEG = 1.5
const SIMILAR_SHARE = 0.5
const MAX_FIT_FT = 0.1
const REFINE_STEPS = 12

interface Circle {
  readonly cx: number
  readonly cz: number
  readonly r: number
}

const DEG = 180 / Math.PI
const dist = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Solve a 3 × 3 system by Cramer's rule; null when it is singular. */
function solve3(m: readonly (readonly number[])[], r: readonly number[]): [number, number, number] | null {
  const det = (a: readonly (readonly number[])[]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const d = det(m)
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null
  const col = (k: number) => det(m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v))))
  return [col(0) / d, col(1) / d, col(2) / d]
}

/** Algebraic (Kasa) circle fit, about the points' mean for good conditioning. */
function kasaFit(pts: readonly LocalPoint[]): Circle | null {
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const mz = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const sum = (f: (u: number, v: number) => number) => pts.reduce((s, [x, z]) => s + f(x - mx, z - mz), 0)
  const suu = sum((u) => u * u)
  const suv = sum((u, v) => u * v)
  const svv = sum((_, v) => v * v)
  const su = sum((u) => u)
  const sv = sum((_, v) => v)
  const sw = sum((u, v) => u * u + v * v)
  const swu = sum((u, v) => (u * u + v * v) * u)
  const swv = sum((u, v) => (u * u + v * v) * v)
  // u² + v² = 2a·u + 2b·v + c, least squares in (a, b, c)
  const s = solve3([[2 * suu, 2 * suv, su], [2 * suv, 2 * svv, sv], [2 * su, 2 * sv, pts.length]], [swu, swv, sw])
  if (!s) return null
  const [a, b, c] = s
  const r2 = c + a * a + b * b
  return r2 > 0 ? { cx: a + mx, cz: b + mz, r: Math.sqrt(r2) } : null
}

/** Gauss-Newton on the geometric distance, from the algebraic fit. */
function refine(pts: readonly LocalPoint[], start: Circle): Circle {
  let c = start
  for (let it = 0; it < REFINE_STEPS; it++) {
    const jtj = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    const jtr = [0, 0, 0]
    for (const [x, z] of pts) {
      const d = Math.hypot(x - c.cx, z - c.cz) || 1e-9
      const row = [-(x - c.cx) / d, -(z - c.cz) / d, -1]
      const res = d - c.r
      for (let i = 0; i < 3; i++) {
        jtr[i] -= row[i] * res
        for (let j = 0; j < 3; j++) jtj[i][j] += row[i] * row[j]
      }
    }
    const step = solve3(jtj, jtr)
    if (!step) break
    c = { cx: c.cx + step[0], cz: c.cz + step[1], r: c.r + step[2] }
    if (Math.hypot(...step) < 1e-10) break
  }
  return c
}

function fitCircle(pts: readonly LocalPoint[]): { circle: Circle; error: number } | null {
  const k = kasaFit(pts)
  if (!k) return null
  const circle = refine(pts, k)
  if (!(circle.r > 0) || !Number.isFinite(circle.r)) return null
  const error = Math.max(...pts.map((p) => Math.abs(dist(p, [circle.cx, circle.cz]) - circle.r)))
  return { circle, error }
}

/** Signed turn at the start of edge i (from edge i - 1), degrees; NaN where an open chain has no previous edge. */
function turnsOf(pts: readonly LocalPoint[], closed: boolean, count: number): number[] {
  const dir = Array.from({ length: count }, (_, i) => {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    return Math.atan2(b[1] - a[1], b[0] - a[0])
  })
  return dir.map((d, i) => {
    if (i === 0 && !closed) return NaN
    const p = dir[(i - 1 + count) % count]
    return Math.atan2(Math.sin(d - p), Math.cos(d - p)) * DEG
  })
}

const similar = (t: number, p: number) => Math.sign(t) === Math.sign(p) && Math.abs(t - p) <= Math.max(SIMILAR_DEG, SIMILAR_SHARE * Math.max(Math.abs(t), Math.abs(p)))

/** Candidate runs of edge indices (in walking order), each edge joining the one before into a curve. */
function candidateRuns(lens: readonly number[], turns: readonly number[], closed: boolean): number[][] {
  const count = lens.length
  const short = (i: number) => lens[i] > 1e-6 && lens[i] < MAX_EDGE_FT
  const bends = (t: number) => Math.abs(t) >= MIN_TURN_DEG && Math.abs(t) < MAX_TURN_DEG
  const joins = (i: number, prevTurn: number | null) => {
    const prev = (i - 1 + count) % count
    if (!short(i) || !short(prev) || !bends(turns[i])) return false
    return prevTurn === null || similar(turns[i], prevTurn)
  }
  // a closed outline is walked from an edge that starts no curve, so a curve through vertex 0 stays whole
  let start = 0
  if (closed) {
    const breaks = lens.map((_, i) => !joins(i, null))
    start = breaks.indexOf(true)
    if (start < 0) return [lens.map((_, i) => i)]
  }
  const runs: number[][] = []
  let cur: number[] = []
  let prevTurn: number | null = null
  for (let k = 0; k < count; k++) {
    const i = (start + k) % count
    if (cur.length > 0 && joins(i, prevTurn)) {
      cur.push(i)
      prevTurn = turns[i]
      continue
    }
    if (cur.length) runs.push(cur)
    cur = [i]
    prevTurn = null
  }
  if (cur.length) runs.push(cur)
  return runs.filter((r) => r.length >= MIN_EDGES)
}

function arcOf(pts: readonly LocalPoint[], lens: readonly number[], run: readonly number[]): SheetArc | null {
  const verts = [pts[run[0]], ...run.map((i) => pts[(i + 1) % pts.length])]
  const fit = fitCircle(verts)
  if (!fit || fit.error >= MAX_FIT_FT) return null
  const { circle, error } = fit
  const sweep = run.reduce((s, i) => s + 2 * Math.asin(Math.min(1, lens[i] / (2 * circle.r))), 0) * DEG
  return {
    fromEdge: run[0],
    toEdge: run[run.length - 1],
    centre: [circle.cx, circle.cz],
    radiusFt: circle.r,
    sweepDeg: sweep,
    lengthFt: run.reduce((s, i) => s + lens[i], 0),
    chordFt: dist(verts[0], verts[verts.length - 1]),
    fitErrorFt: error,
  }
}

/** The best arc in a run: the whole run, else the run trimmed of an odd edge at either end. */
function bestArc(pts: readonly LocalPoint[], lens: readonly number[], run: readonly number[]): SheetArc | null {
  for (let trim = 0; run.length - trim >= MIN_EDGES; trim++) {
    for (let head = 0; head <= trim; head++) {
      const arc = arcOf(pts, lens, run.slice(head, run.length - (trim - head)))
      if (arc) return arc
    }
  }
  return null
}

/**
 * Circular arcs in an outline (feet), as runs of its edges: edge i runs from
 * vertex i to i + 1. A closed outline's arc may run through vertex 0, so its
 * fromEdge can be larger than its toEdge; a ring of edges that is all curve
 * is one arc of every edge. Sweep is the turn along the arc, always positive.
 */
export function fitArcs(outline: readonly LocalPoint[], closed: boolean): SheetArc[] {
  const count = closed ? outline.length : outline.length - 1
  if (outline.length < 3 || count < MIN_EDGES) return []
  const lens = Array.from({ length: count }, (_, i) => dist(outline[i], outline[(i + 1) % outline.length]))
  const turns = turnsOf(outline, closed, count)
  return candidateRuns(lens, turns, closed)
    .map((run) => bestArc(outline, lens, run))
    .filter((a): a is SheetArc => a !== null)
    .sort((a, b) => a.fromEdge - b.fromEdge)
}
