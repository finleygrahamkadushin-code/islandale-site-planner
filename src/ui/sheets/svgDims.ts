/**
 * Dimension-line geometry for the drawing sheets, in drawing units (feet)
 * with SVG's axes: x right, y down. A plan is building-frame (x, z); an
 * elevation is (u, -y). Pure, so the sheets only draw what these return.
 */
import { localToSite } from '../../buildings/footprint'

export type Pt = readonly [number, number]

export interface Segment {
  readonly a: Pt
  readonly b: Pt
}

export type DimSide = 'top' | 'bottom' | 'left' | 'right'

export interface DimOpts {
  /** Unit normal the line is offset along; default the right-hand normal of a→b in a y-up frame, outward for an outline whose signedArea is positive. */
  readonly normal?: Pt
  /** Gap between the object and the start of each extension line. */
  readonly gapFt: number
  /** How far the extension lines run past the dimension line. */
  readonly overshootFt: number
  /** Half the length of each 45° tick. */
  readonly tickFt: number
  /** Distance from the dimension line to the middle of the text, away from the object. */
  readonly textOffsetFt: number
}

export interface DimLine {
  readonly ext1: Segment
  readonly ext2: Segment
  readonly line: Segment
  readonly ticks: readonly [Segment, Segment]
  /** Text centre, its turn in degrees (SVG rotate, within (-90, 90] so it reads upright) and the measured length. */
  readonly text: { readonly x: number; readonly y: number; readonly angleDeg: number; readonly value: number }
}

const add = (p: Pt, v: Pt, k = 1): Pt => [p[0] + v[0] * k, p[1] + v[1] * k]
const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]]
const len = (v: Pt): number => Math.hypot(v[0], v[1])
const unit = (v: Pt): Pt => {
  const l = len(v)
  return l > 1e-9 ? [v[0] / l, v[1] / l] : [1, 0]
}

/** The normal to the right of a→b with y up (the left of it as SVG draws y down): outward when signedArea > 0. */
export function rightNormal(a: Pt, b: Pt): Pt {
  const [dx, dy] = unit(sub(b, a))
  return [dy, -dx]
}

/** Outward normal of an outline edge from the sign of the outline's signedArea. */
export function outwardNormal(area: number, a: Pt, b: Pt): Pt {
  const n = rightNormal(a, b)
  return area >= 0 ? n : [-n[0], -n[1]]
}

/** Keep a text angle within (-90°, 90°] so it never reads upside down. */
export function uprightAngle(deg: number): number {
  let d = ((deg % 360) + 360) % 360
  if (d > 180) d -= 360
  if (d > 90) d -= 180
  if (d <= -90) d += 180
  return d
}

/** A dimension from a to b, offset along the normal by offsetFt: extension lines, the line, ticks and text. */
export function dimensionLine(a: Pt, b: Pt, offsetFt: number, opts: DimOpts): DimLine {
  const n = opts.normal ?? rightNormal(a, b)
  const dir = unit(sub(b, a))
  const a1 = add(a, n, offsetFt)
  const b1 = add(b, n, offsetFt)
  const reach = offsetFt + opts.overshootFt * Math.sign(offsetFt || 1)
  const ext = (p: Pt): Segment => ({ a: add(p, n, opts.gapFt * Math.sign(offsetFt || 1)), b: add(p, n, reach) })
  const t: Pt = [((dir[0] - dir[1]) / Math.SQRT2) * opts.tickFt, ((dir[0] + dir[1]) / Math.SQRT2) * opts.tickFt]
  const tick = (p: Pt): Segment => ({ a: sub(p, t), b: add(p, t) })
  const mid: Pt = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2]
  const centre = add(mid, n, opts.textOffsetFt * Math.sign(offsetFt || 1))
  const angleDeg = uprightAngle((Math.atan2(dir[1], dir[0]) * 180) / Math.PI)
  return {
    ext1: ext(a),
    ext2: ext(b),
    line: { a: a1, b: b1 },
    ticks: [tick(a1), tick(b1)],
    text: { x: centre[0], y: centre[1], angleDeg, value: len(sub(b, a)) },
  }
}

/** Which side of the drawing a normal faces, for staggering lines that would collide. */
export function sideOf(n: Pt): DimSide {
  if (Math.abs(n[1]) >= Math.abs(n[0])) return n[1] < 0 ? 'top' : 'bottom'
  return n[0] < 0 ? 'left' : 'right'
}

/** The span a segment covers along a side: x for top and bottom, y for left and right. */
export function spanAlong(side: DimSide, a: Pt, b: Pt): readonly [number, number] {
  const i = side === 'top' || side === 'bottom' ? 0 : 1
  return [Math.min(a[i], b[i]), Math.max(a[i], b[i])]
}

export interface Placed {
  readonly side: DimSide
  readonly lo: number
  readonly hi: number
  readonly level: number
}

/** The lowest stagger level on a side whose overlapping lines (within padFt) leave it free. */
export function staggerLevel(placed: readonly Placed[], side: DimSide, lo: number, hi: number, padFt: number): number {
  const used = new Set(placed.filter((p) => p.side === side && p.lo < hi + padFt && p.hi > lo - padFt).map((p) => p.level))
  let level = 0
  while (used.has(level)) level++
  return level
}

/** Even-odd test of a point against a closed outline. */
export function insidePolygon(poly: readonly Pt[], [x, y]: Pt): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Distance from a point to a segment. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const d = sub(b, a)
  const l2 = d[0] * d[0] + d[1] * d[1]
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0
  return len(sub(p, add(a, d, t)))
}

/**
 * Unit normal of a→b pointing out of the outline, for an opening on a wall
 * line: turned to agree with the outward normal of the nearest outline edge,
 * so an opening cut straight across a curved wall still faces out.
 */
export function normalAwayFrom(poly: readonly Pt[], a: Pt, b: Pt): Pt {
  const n = rightNormal(a, b)
  if (poly.length < 3) return n
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const edges = poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as const)
  const [ea, eb] = edges.reduce((best, e) => (toSegment(mid, e[0], e[1]) < toSegment(mid, best[0], best[1]) ? e : best))
  const twiceArea = edges.reduce((s, [p, q]) => s + p[0] * q[1] - q[0] * p[1], 0)
  const out = outwardNormal(twiceArea, ea, eb)
  return n[0] * out[0] + n[1] * out[1] < 0 ? [-n[0], -n[1]] : n
}

/** The point halfway along a polyline, pushed onto the circle it follows. */
export function arcMidpoint(points: readonly Pt[], centre: Pt, radius: number): Pt {
  const total = points.slice(1).reduce((s, p, i) => s + len(sub(p, points[i])), 0)
  let left = total / 2
  let mid = points[0]
  for (let i = 1; i < points.length; i++) {
    const step = len(sub(points[i], points[i - 1]))
    if (step >= left) {
      mid = add(points[i - 1], unit(sub(points[i], points[i - 1])), left)
      break
    }
    left -= step
  }
  return add(centre, unit(sub(mid, centre)), radius)
}

/** A small cross marking a centre. */
export function centreMark(c: Pt, halfFt: number): readonly [Segment, Segment] {
  return [
    { a: [c[0] - halfFt, c[1]], b: [c[0] + halfFt, c[1]] },
    { a: [c[0], c[1] - halfFt], b: [c[0], c[1] + halfFt] },
  ]
}

/** A filled arrowhead at `to`, pointing from `from`, as polygon points. */
export function arrowHead(from: Pt, to: Pt, sizeFt: number): readonly Pt[] {
  const d = unit(sub(to, from))
  const n: Pt = [-d[1], d[0]]
  const base = add(to, d, -sizeFt)
  return [to, add(base, n, sizeFt * 0.35), add(base, n, -sizeFt * 0.35)]
}

/** Rough width of a line of text, for laying out labels: about 0.55 em a character. */
export function textWidthFt(text: string, sizeFt: number): number {
  return text.length * 0.55 * sizeFt
}

/** Values moved apart, lowest kept, each at least `gap` above the one below it; returned in the input order. */
export function spreadApart(values: readonly number[], gap: number): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(values.length)
  let last = -Infinity
  for (const [v, i] of order) {
    last = Math.max(v, last + gap)
    out[i] = last
  }
  return out
}

/** Bounds of every end and the text centre of some dimension lines. */
export function dimBounds(dims: readonly DimLine[]): { minx: number; maxx: number; miny: number; maxy: number } | null {
  const pts = dims.flatMap((d) => [d.ext1.a, d.ext1.b, d.ext2.a, d.ext2.b, [d.text.x, d.text.y] as Pt])
  if (!pts.length) return null
  return {
    minx: Math.min(...pts.map((p) => p[0])),
    maxx: Math.max(...pts.map((p) => p[0])),
    miny: Math.min(...pts.map((p) => p[1])),
    maxy: Math.max(...pts.map((p) => p[1])),
  }
}

/** Paper points to drawing feet at a scale in paper inches per foot. */
export const ptToFt = (pt: number, scale: number): number => pt / 72 / scale

/**
 * Which way site north points on a plan sheet (x right, building z down),
 * in degrees clockwise from straight up. North's components along the
 * building's x and z come from where localToSite sends those axes.
 */
export function northOnSheetDeg(rotationDeg: number): number {
  const at = (p: Pt) => localToSite({ x: 0, n: 0 }, rotationDeg, p)
  const o = at([0, 0])
  const nx = at([1, 0])[1] - o[1]
  const nz = at([0, 1])[1] - o[1]
  return (Math.atan2(nx, -nz) * 180) / Math.PI
}
