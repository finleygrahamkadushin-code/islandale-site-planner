/**
 * Plan-sheet helpers that read the sheet model: the edges an arc runs
 * along, and where openings fall along a straight wall edge. Pure.
 */
import { signedArea } from '../../../buildings/footprint'
import { formatArch } from '../format'
import type { SheetArc, SheetEdge, SheetOpening, SheetPart } from '../types'
import { insidePolygon, textWidthFt, type DimLine, type DimSide, type Pt } from '../svgDims'

/** How far an opening's ends may sit off an edge's line and still be on it, feet. */
const ON_LINE_FT = 0.05
/** Stops closer than this are one stop, feet (a quarter inch). */
const SAME_STOP_FT = 1 / 48

/** Edge indices of an arc in order, wrapping through vertex 0 when fromEdge > toEdge. */
export function arcEdgeIndices(edgeCount: number, arc: Pick<SheetArc, 'fromEdge' | 'toEdge'>): number[] {
  if (edgeCount <= 0) return []
  const span = (((arc.toEdge - arc.fromEdge) % edgeCount) + edgeCount) % edgeCount
  return Array.from({ length: span + 1 }, (_, k) => (arc.fromEdge + k) % edgeCount)
}

/** The vertices an arc passes through: the start of each of its edges and the end of the last. */
export function arcPoints(edges: readonly SheetEdge[], arc: Pick<SheetArc, 'fromEdge' | 'toEdge'>): Pt[] {
  const run = arcEdgeIndices(edges.length, arc).map((i) => edges[i])
  return run.length ? [...run.map((e) => e.a), run[run.length - 1].b] : []
}

/**
 * Distances along a straight edge (from a) to each end of every opening
 * piece that lies on it, with 0 and the edge's length, sorted. Empty when no
 * piece is on the edge, so a bare wall gets only its overall dimension.
 */
export function openingStops(a: Pt, b: Pt, openings: readonly Pick<SheetOpening, 'pieces'>[]): number[] {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const length = Math.hypot(dx, dz)
  if (length < SAME_STOP_FT) return []
  const ux = dx / length
  const uz = dz / length
  const along = (p: Pt) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uz
  const off = (p: Pt) => Math.abs((p[0] - a[0]) * uz - (p[1] - a[1]) * ux)
  const onEdge = (p: Pt) => off(p) <= ON_LINE_FT && along(p) >= -ON_LINE_FT && along(p) <= length + ON_LINE_FT
  const ends = openings
    .flatMap((o) => o.pieces)
    .filter((p) => onEdge(p.a) && onEdge(p.b))
    .flatMap((p) => [along(p.a), along(p.b)])
  if (!ends.length) return []
  const sorted = [0, length, ...ends.map((t) => Math.min(length, Math.max(0, t)))].sort((p, q) => p - q)
  return sorted.filter((t, i) => i === 0 || t - sorted[i - 1] >= SAME_STOP_FT)
}

/** The point at distance t along a→b. */
export function pointAlong(a: Pt, b: Pt, t: number): Pt {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [a[0] + ((b[0] - a[0]) * t) / length, a[1] + ((b[1] - a[1]) * t) / length]
}

/** An axis-aligned box on the plan, feet. */
export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** The box a block of text `halfW` by `halfH` takes centred on a point, turned `angleDeg`. */
export function turnedBox(at: Pt, halfW: number, halfH: number, angleDeg: number): Box {
  const r = (angleDeg * Math.PI) / 180
  const ex = Math.abs(Math.cos(r)) * halfW + Math.abs(Math.sin(r)) * halfH
  const ey = Math.abs(Math.sin(r)) * halfW + Math.abs(Math.cos(r)) * halfH
  return { x0: at[0] - ex, y0: at[1] - ey, x1: at[0] + ex, y1: at[1] + ey }
}

/** A block of text as it lies on the plan: its centre, half its width and height, and its turn. */
export interface TurnedText {
  readonly at: Pt
  readonly halfW: number
  readonly halfH: number
  readonly angleDeg: number
}

const upright = (b: Box): TurnedText => ({ at: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], halfW: (b.x1 - b.x0) / 2, halfH: (b.y1 - b.y0) / 2, angleDeg: 0 })

const axesOf = (t: TurnedText): readonly [Pt, Pt] => {
  const r = (t.angleDeg * Math.PI) / 180
  return [
    [Math.cos(r), Math.sin(r)],
    [-Math.sin(r), Math.cos(r)],
  ]
}

/** Half the reach of a turned block along a unit axis. */
const reachAlong = (t: TurnedText, [ax, ay]: Pt): number => {
  const [u, v] = axesOf(t)
  return Math.abs(u[0] * ax + u[1] * ay) * t.halfW + Math.abs(v[0] * ax + v[1] * ay) * t.halfH
}

/** Whether two turned blocks of text share any paper: they do unless one of their four edge directions separates them. */
export function textsOverlap(a: TurnedText, b: TurnedText): boolean {
  const d: Pt = [b.at[0] - a.at[0], b.at[1] - a.at[1]]
  return [...axesOf(a), ...axesOf(b)].every((axis) => Math.abs(d[0] * axis[0] + d[1] * axis[1]) < reachAlong(a, axis) + reachAlong(b, axis))
}

/** A dimension's figure as it lies on the plan, turned with its line. */
export function dimText(d: DimLine, label: string | undefined, size: number): TurnedText {
  const text = label ? `${label} ${formatArch(d.text.value)}` : formatArch(d.text.value)
  return { at: [d.text.x, d.text.y], halfW: textWidthFt(text, size) / 2, halfH: size / 2, angleDeg: d.text.angleDeg }
}

/** The box a dimension's figure takes, turned with it. */
export function dimTextBox(d: DimLine, label: string | undefined, size: number): Box {
  const text = label ? `${label} ${formatArch(d.text.value)}` : formatArch(d.text.value)
  return turnedBox([d.text.x, d.text.y], textWidthFt(text, size) / 2, size / 2, d.text.angleDeg)
}

/** One whole-edge dimension as a row along a side of the drawing: its span there and its length. */
export interface DimRow {
  readonly side: DimSide
  readonly lo: number
  readonly hi: number
  readonly value: number
}

/** Two rows say the same thing when they run the same span of the same side and give the same length (to a quarter inch). */
export const sameRow = (a: DimRow, b: DimRow): boolean =>
  a.side === b.side && Math.abs(a.lo - b.lo) < SAME_STOP_FT && Math.abs(a.hi - b.hi) < SAME_STOP_FT && Math.abs(a.value - b.value) < SAME_STOP_FT

type Figure = DimLine & { readonly label?: string }

/**
 * The dimensions whose figures print clear: a figure that would land on a
 * mark already there (`taken`) or on another dimension's figure is left off,
 * the labelled overall sizes kept first, then the longer of two. In the
 * input's order. The measurement tables carry every figure.
 */
export function clearFigures<T extends Figure>(dims: readonly T[], size: number, taken: readonly Box[]): T[] {
  const rank = (d: T) => (d.label ? Infinity : d.text.value)
  const byRank = dims.map((_, i) => i).sort((i, j) => rank(dims[j]) - rank(dims[i]) || i - j)
  const kept = byRank.reduce<{ readonly texts: readonly TurnedText[]; readonly keep: readonly number[] }>(
    (acc, i) => {
      const text = dimText(dims[i], dims[i].label, size)
      return acc.texts.some((t) => textsOverlap(text, t)) ? acc : { texts: [...acc.texts, text], keep: [...acc.keep, i] }
    },
    { texts: taken.map(upright), keep: [] },
  )
  const keep = new Set(kept.keep)
  return dims.filter((_, i) => keep.has(i))
}

/** The centre of area of an outline (the mean of its points when it has no area). */
export function centroid(poly: readonly Pt[]): Pt {
  const a = signedArea(poly)
  if (Math.abs(a) < 1e-6) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]
  const sum = poly.reduce<Pt>(
    ([cx, cz], [x1, z1], i) => {
      const [x2, z2] = poly[(i + 1) % poly.length]
      const f = x1 * z2 - x2 * z1
      return [cx + (x1 + x2) * f, cz + (z1 + z2) * f]
    },
    [0, 0],
  )
  return [sum[0] / (6 * a), sum[1] / (6 * a)]
}

/** A part's name moves at most this many lines up or down from its centre to clear another mark. */
const LABEL_STEPS = 4
/** Line spacing of the stacked names, in text heights. */
const LABEL_LEADING = 1.3

/** Where a part's name is written, by its massIndex. */
export interface PartLabelSpot {
  readonly massIndex: number
  readonly at: Pt
}

/** The box a part's name takes centred on a point, at text height `size`. */
export const partLabelBox = (name: string, at: Pt, size: number): Box => turnedBox(at, textWidthFt(name, size) / 2, size / 2, 0)

/**
 * Where each part's name goes: its centre, or, when another name or one of
 * the plan's figures (`taken`) is already there, the nearest line up or down
 * that is clear and still inside the part. Larger parts are placed first; a
 * name with no clear line stays at its centre.
 */
export function partLabelSpots(parts: readonly Pick<SheetPart, 'massIndex' | 'name' | 'outline'>[], size: number, taken: readonly Box[]): PartLabelSpot[] {
  const drawn = parts.filter((p) => p.outline.length >= 3)
  const largestFirst = [...drawn].sort((a, b) => Math.abs(signedArea(b.outline)) - Math.abs(signedArea(a.outline)))
  const steps = Array.from({ length: LABEL_STEPS * 2 }, (_, k) => (Math.floor(k / 2) + 1) * (k % 2 ? -1 : 1) * size * LABEL_LEADING)
  const placed = largestFirst.reduce<{ readonly boxes: readonly Box[]; readonly spots: readonly PartLabelSpot[] }>(
    (acc, p) => {
      const c = centroid(p.outline)
      const clear = (at: Pt) => !acc.boxes.some((t) => overlaps(partLabelBox(p.name, at, size), t))
      const moved = steps.map((dy): Pt => [c[0], c[1] + dy]).filter((at) => insidePolygon(p.outline, at))
      const at = [c, ...moved].find(clear) ?? c
      return { boxes: [...acc.boxes, partLabelBox(p.name, at, size)], spots: [...acc.spots, { massIndex: p.massIndex, at }] }
    },
    { boxes: taken, spots: [] },
  )
  return drawn.map((p) => placed.spots.find((s) => s.massIndex === p.massIndex) ?? { massIndex: p.massIndex, at: centroid(p.outline) })
}

/** Where the datum's label is written: its right end, up and left of the mark; `text` the text height. */
export function datumLabelAt(at: Pt, text: number): Pt {
  const r = text * DATUM_RADIUS_TEXT
  return [at[0] - r * 1.6, at[1] - r * 1.6]
}

/** The datum circle's radius, in text heights. */
export const DATUM_RADIUS_TEXT = 0.7
export const DATUM_LABEL = 'DATUM 0,0'

/** The box the datum's label takes (bold, so a little wider than plain text). */
export function datumLabelBox(at: Pt, text: number, small: number): Box {
  const [x, y] = datumLabelAt(at, text)
  return { x0: x - textWidthFt(DATUM_LABEL, small) * 1.1, y0: y - small, x1: x, y1: y + small * 0.3 }
}
