/**
 * Label placement for the site plan: text set along a line where it runs
 * fairly straight, kept upright, and kept clear of every label already
 * placed and of the buildings, so nothing on the sheet overprints. Greedy,
 * in the order asked: what matters most is placed first. Sheet feet. Pure.
 */
import { uprightAngle, type Pt } from '../svgDims'
import { distToSegment, insidePoly, lineLength, pointAlongLine } from './siteGeom'

/** Letter spacing the site labels are set with, em. */
export const LABEL_TRACKING_EM = 0.06

/**
 * Width of a site label, in the system sans at this tracking: measured
 * against Chrome's own text widths (capitals about 0.70 em, figures 0.62,
 * bold about a tenth wider), a touch generous so a box never runs short of
 * its letters.
 */
export function labelWidth(text: string, size: number, bold = false): number {
  let em = 0
  for (const ch of text) {
    if (ch === ' ') em += 0.3
    else if ('·\'".,:;()’'.includes(ch)) em += 0.34
    else if (ch === '/' || ch === '-') em += 0.42
    else if (/[0-9]/.test(ch)) em += 0.62
    else if (ch === 'M' || ch === 'W') em += 0.92
    else if (/[a-z]/.test(ch)) em += 0.56
    else em += 0.71
    em += LABEL_TRACKING_EM
  }
  return em * size * (bold ? 1.1 : 1)
}

export interface PlacedLabel {
  readonly text: string
  readonly at: Pt
  /** Degrees clockwise, upright (within ±90°). */
  readonly angleDeg: number
  readonly size: number
  /** Set in bold (building names): wider. */
  readonly bold?: boolean
}

/** A label's box as four corners, padded by `pad` all round. */
export function labelBox(l: PlacedLabel, pad: number): Pt[] {
  const w = labelWidth(l.text, l.size, l.bold) / 2 + pad
  const h = l.size * 0.62 + pad
  const a = (l.angleDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return ([[-w, -h], [w, -h], [w, h], [-w, h]] as const).map(([x, y]): Pt => [l.at[0] + x * c - y * s, l.at[1] + x * s + y * c])
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/** Whether two polygons overlap: a corner of one inside the other, or edges crossing. */
export function polysOverlap(p: readonly Pt[], q: readonly Pt[]): boolean {
  if (p.some((v) => insidePoly(q, v)) || q.some((v) => insidePoly(p, v))) return true
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      if (segsCross(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length])) return true
    }
  }
  return false
}

const boxOfPoly = (p: readonly Pt[]) => {
  const xs = p.map((v) => v[0])
  const ys = p.map((v) => v[1])
  return { minx: Math.min(...xs), maxx: Math.max(...xs), miny: Math.min(...ys), maxy: Math.max(...ys) }
}

/** Keeps the labels placed so far and the shapes they must stay off. */
export class LabelPlacer {
  private readonly taken: { poly: readonly Pt[]; box: ReturnType<typeof boxOfPoly> }[] = []

  constructor(
    obstacles: readonly (readonly Pt[])[],
    private readonly pad: number,
  ) {
    for (const o of obstacles) if (o.length >= 3) this.taken.push({ poly: o, box: boxOfPoly(o) })
  }

  /** Whether a label would sit clear of everything placed and every obstacle, but for `own` (the shape it names, when it sits inside it). */
  fits(l: PlacedLabel, own?: readonly Pt[]): boolean {
    const poly = labelBox(l, this.pad)
    const b = boxOfPoly(poly)
    return !this.taken.some((t) => t.poly !== own && t.box.maxx >= b.minx && t.box.minx <= b.maxx && t.box.maxy >= b.miny && t.box.miny <= b.maxy && polysOverlap(poly, t.poly))
  }

  /** Take the space under a label (or any shape) so later labels keep off it. */
  take(l: PlacedLabel): void {
    const poly = labelBox(l, this.pad)
    this.taken.push({ poly, box: boxOfPoly(poly) })
  }

  /** The first candidate that fits, taken; null when none does. */
  place(candidates: Iterable<PlacedLabel>): PlacedLabel | null {
    for (const c of candidates) {
      if (this.fits(c)) {
        this.take(c)
        return c
      }
    }
    return null
  }
}

export interface AlongOptions {
  readonly size: number
  /** How far apart repeated labels should be along the line, and where the first is tried, feet. */
  readonly every: number
  readonly firstAt?: number
  /** Set the text this far to the left of the line (negative: right), feet; 0 sits it on the line. */
  readonly offset?: number
  /** How far the line may stray from the chord under the label, in text heights. */
  readonly maxSag?: number
  /** At most this many labels on the line. */
  readonly max?: number
  /** Keep the text inside this test (the drawing's frame), corners and all. */
  readonly keepIn?: (p: Pt) => boolean
}

/** The points of a polyline between two distances along it, both ends included. */
function stretch(line: readonly Pt[], from: number, to: number): Pt[] {
  const out: Pt[] = [pointAlongLine(line, from).at]
  let run = 0
  for (let i = 1; i < line.length; i++) {
    run += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
    if (run > from && run < to) out.push(line[i])
  }
  out.push(pointAlongLine(line, to).at)
  return out
}

/**
 * Labels along a polyline: tried every `every / 4` feet from `firstAt`,
 * where the line under the whole label stays within a fraction of the text
 * height of the chord across it (so a traced line's small zig-zags don't
 * count, but a bend does), set along that chord, upright, then the next
 * tried `every` further on.
 */
export function labelsAlong(line: readonly Pt[], text: string, placer: LabelPlacer, o: AlongOptions): PlacedLabel[] {
  const len = lineLength(line)
  const half = labelWidth(text, o.size) / 2
  if (len < half * 2.4) return []
  const out: PlacedLabel[] = []
  const step = Math.max(o.size * 1.5, Math.min(o.every / 4, o.size * 4))
  const sag = o.size * (o.maxSag ?? 0.45)
  for (let s = Math.max(half * 1.2, Math.min(o.firstAt ?? o.every / 2, len / 2)); s <= len - half * 1.2; ) {
    const a = pointAlongLine(line, s - half).at
    const b = pointAlongLine(line, s + half).at
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1])
    const straight = chord > half * 1.7 && stretch(line, s - half, s + half).every((p) => distToSegment(p, a, b) <= sag)
    const dir: Pt = [(b[0] - a[0]) / (chord || 1), (b[1] - a[1]) / (chord || 1)]
    const raw = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI
    const angleDeg = uprightAngle(raw)
    // keep "left" meaning the left of the upright text, whichever way the line was drawn
    const flip = Math.abs(((angleDeg - raw + 540) % 360) - 180) > 90 ? -1 : 1
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    // the side asked for first, then the other side of the line
    const cands = (o.offset ? [o.offset, -o.offset] : [0]).map((v) => {
      const off = v * flip
      return { text, at: [mid[0] + dir[1] * off, mid[1] - dir[0] * off] as Pt, angleDeg, size: o.size }
    })
    const cand = straight ? cands.find((c) => (!o.keepIn || labelBox(c, 0).every(o.keepIn)) && placer.fits(c)) : undefined
    if (cand) {
      placer.take(cand)
      out.push(cand)
      if (o.max && out.length >= o.max) break
      s += o.every
    } else s += step
  }
  return out
}
