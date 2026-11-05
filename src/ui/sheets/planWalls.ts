/**
 * How a floor plan reads the walls' thickness from the sheet model: runs of
 * one wall kind to hatch or leave clear, where each part's thickness is
 * dimensioned, and the sheet's note on walls and dimensions. Pure, in
 * building-frame feet.
 */
import { signedArea } from '../../buildings/footprint'
import { formatInches } from '../../export/sheets/format'
import type { SheetBuilding, SheetEdge, SheetOpening, SheetPart } from '../../export/sheets/types'
import { openingStops, pointAlong } from './planDims'
import { normalAwayFrom, outwardNormal, type Pt } from './svgDims'

const IN_PER_FT = 12
/** A wall shorter than this is not picked for the thickness dimension, feet, unless nothing longer is left. */
const MIN_DIM_WALL_FT = 2

/** Consecutive edges of one wall kind, in outline order; `closed` when one kind runs right round. */
export interface WallRun {
  readonly glass: boolean
  readonly edges: readonly number[]
  readonly closed: boolean
}

/** A part's walls as runs of one kind (solid or glass), each starting where the kind changes. */
export function wallRuns(edges: readonly Pick<SheetEdge, 'glass' | 'thicknessFt'>[]): WallRun[] {
  const n = edges.length
  if (n === 0 || edges.every((e) => e.thicknessFt <= 0)) return []
  const start = edges.findIndex((e, i) => e.glass !== edges[(i - 1 + n) % n].glass)
  if (start < 0) return [{ glass: edges[0].glass, edges: edges.map((_, i) => i), closed: true }]
  const runs: { glass: boolean; edges: number[]; closed: false }[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    const last = runs[runs.length - 1]
    if (last && last.glass === edges[i].glass) last.edges.push(i)
    else runs.push({ glass: edges[i].glass, edges: [i], closed: false })
  }
  return runs
}

/** One wall's thickness, dimensioned square across it from the outside face to the inside, with its text inside the room. */
export interface ThicknessMark {
  readonly outer: Pt
  readonly inner: Pt
  /** Unit vector along the wall, for setting the text. */
  readonly along: Pt
  readonly thicknessFt: number
  readonly glass: boolean
}

/** The middle of the widest stretch of an edge clear of openings, as a distance from its vertex a. */
function clearMiddle(e: SheetEdge, part: SheetPart): number {
  const stops = openingStops(e.a, e.b, part.openings)
  if (stops.length < 2) return e.lengthFt / 2
  const along = (p: Pt) => ((p[0] - e.a[0]) * (e.b[0] - e.a[0]) + (p[1] - e.a[1]) * (e.b[1] - e.a[1])) / e.lengthFt
  const holes = part.openings.flatMap((o) => o.pieces.filter((p) => p.edge === e.index).map((p) => [Math.min(along(p.a), along(p.b)), Math.max(along(p.a), along(p.b))] as const))
  const gaps = stops.slice(1).map((t, i) => [stops[i], t] as const)
  const clear = gaps.filter(([lo, hi]) => !holes.some(([h0, h1]) => (lo + hi) / 2 > h0 && (lo + hi) / 2 < h1))
  if (!clear.length) return e.lengthFt / 2
  const [lo, hi] = clear.reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best))
  return (lo + hi) / 2
}

/**
 * One thickness dimension per wall kind in a part, on its longest straight
 * wall of that kind (a curve's longest chord when it has none), in the
 * widest stretch clear of openings.
 */
export function thicknessMarks(part: SheetPart): ThicknessMark[] {
  const walls = part.edges.filter((e) => e.thicknessFt > 0 && e.lengthFt > 0)
  if (!walls.length || part.inner.length !== part.outline.length) return []
  const area = signedArea(part.outline)
  const rank = (e: SheetEdge) => (e.curved ? 0 : 2) + (e.lengthFt >= MIN_DIM_WALL_FT ? 1 : 0)
  return [false, true].flatMap((glass): ThicknessMark[] => {
    const of = walls.filter((e) => e.glass === glass)
    if (!of.length) return []
    const e = of.reduce((best, x) => (rank(x) > rank(best) || (rank(x) === rank(best) && x.lengthFt > best.lengthFt) ? x : best))
    const outer = pointAlong(e.a, e.b, clearMiddle(e, part))
    const out = outwardNormal(area, e.a, e.b)
    const inner: Pt = [outer[0] - out[0] * e.thicknessFt, outer[1] - out[1] * e.thicknessFt]
    const along: Pt = [(e.b[0] - e.a[0]) / e.lengthFt, (e.b[1] - e.a[1]) / e.lengthFt]
    return [{ outer, inner, along, thicknessFt: e.thicknessFt, glass }]
  })
}

export const thicknessText = (ft: number) => formatInches(ft * IN_PER_FT)

const unitOf = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1])
  return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [0, 0]
}

/** Where a thickness dimension's figure goes: just inside the wall's inside face, `textFt` the text height and `overshootFt` its line's run past the faces. */
export function thicknessTextAt(m: ThicknessMark, textFt: number, overshootFt: number): Pt {
  const inward = unitOf(m.outer, m.inner)
  const k = overshootFt + textFt * 0.9
  return [m.inner[0] + inward[0] * k, m.inner[1] + inward[1] * k]
}

/** Where an opening's tag circle goes: inside the wall's inside face at the opening's middle piece, `textFt` the text height. */
export function openingTagAt(o: SheetOpening, part: SheetPart, textFt: number): Pt {
  const middle = o.pieces[Math.floor(o.pieces.length / 2)]
  const n: Pt = middle ? normalAwayFrom(part.outline, middle.a, middle.b) : [0, 0]
  const from: Pt = middle ? [(middle.innerA[0] + middle.innerB[0]) / 2, (middle.innerA[1] + middle.innerB[1]) / 2] : [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]
  return [from[0] - n[0] * textFt * 1.4, from[1] - n[1] * textFt * 1.4]
}

/** The plan's general notes, in short lines: what the dimensions are to, the walls drawn, and that door swings are assumed. */
export function wallNotes(b: SheetBuilding): string[] {
  const walls = b.parts.flatMap((p) => p.edges.filter((e) => e.thicknessFt > 0))
  const sizes = (glass: boolean) => [...new Set(walls.filter((e) => e.glass === glass).map((e) => thicknessText(e.thicknessFt)))].join(', ')
  const solid = sizes(false)
  const glass = sizes(true)
  const doors = b.parts.some((p) => p.openings.some((o) => o.kind === 'door' && o.pieces.length === 1))
  const kinds = solid && glass ? `Walls ${solid} thick, hatched; glass curtain walls ${glass}.` : solid ? `Walls ${solid} thick, hatched.` : `Glass curtain walls ${glass} thick.`
  return [
    ...(walls.length ? ['All dimensions are to the outside face of the walls.', kinds] : []),
    ...(doors ? ['Door swings (dashed) are assumed: the plan does not store them.', 'Drawn opening in, hinged at the right jamb seen from outside.'] : []),
  ]
}
