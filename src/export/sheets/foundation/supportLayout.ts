/**
 * Where a plan's support spacing dimensions go, building-frame feet. The
 * posts of each support are read in rows along its own axes; each distinct
 * row (and column) gets one chain, from the outline's face through every
 * post to the far face, so a regular grid takes two chains, not one per
 * post. Pure, so it is checked in node.
 */
import { supportPoints } from './supports'
import type { SheetBuilding, SheetSupport } from '../types'
import type { LabelledDim, Pen } from '../plan/planLayout'
import { dimensionLine, textWidthFt, type DimOpts, type Pt } from '../svgDims'

/** Posts this close across a row's line are on one row, feet (3 in). */
const ROW_FT = 0.25
/** Two chains whose stops all agree within this are the same chain, feet (a quarter inch). */
const SAME_FT = 1 / 48
/** A chain runs this far beside its row, into the grid, feet. */
const CHAIN_OFFSET_FT = 1
/** A piece too short for its words has them set this many text heights further out. */
const SHORT_TEXT_OUT = 1.3
/** A piece shorter than these words is too short for its own. */
const TYPICAL_TEXT = `0'-00"`

type Frame = { readonly u: Pt; readonly v: Pt }

const dot = (p: Pt, d: Pt) => p[0] * d[0] + p[1] * d[1]
const frameOf = (axisDeg: number): Frame => {
  const a = (axisDeg * Math.PI) / 180
  return { u: [Math.cos(a), Math.sin(a)], v: [-Math.sin(a), Math.cos(a)] }
}
const fromFrame = (f: Frame, u: number, v: number): Pt => [f.u[0] * u + f.v[0] * v, f.u[1] * u + f.v[1] * v]

/** Where the line v = const (in the frame) crosses the outline, as u along it, sorted. */
function crossings(outline: readonly Pt[], f: Frame, v: number): number[] {
  const us: number[] = []
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]
    const va = dot(a, f.v)
    const vb = dot(b, f.v)
    if ((va > v) === (vb > v)) return
    const t = (v - va) / (vb - va)
    us.push(dot(a, f.u) + (dot(b, f.u) - dot(a, f.u)) * t)
  })
  return us.sort((p, q) => p - q)
}

/** Points grouped into rows across `f.v`, each row's u values sorted, rows in order of v. */
function rowsOf(points: readonly Pt[], f: Frame): { readonly v: number; readonly us: number[] }[] {
  const sorted = [...points].sort((p, q) => dot(p, f.v) - dot(q, f.v))
  const rows: { v: number; us: number[] }[] = []
  for (const p of sorted) {
    const v = dot(p, f.v)
    const last = rows[rows.length - 1]
    if (last && v - last.v <= ROW_FT) last.us.push(dot(p, f.u))
    else rows.push({ v, us: [dot(p, f.u)] })
  }
  return rows.map((r) => ({ v: r.v, us: r.us.sort((p, q) => p - q) }))
}

/** A chain's stops along its row: the outline's face before the first post, every post, the face after the last. */
function chainStops(outline: readonly Pt[], f: Frame, v: number, us: readonly number[]): number[] {
  const faces = crossings(outline, f, v)
  const before = faces.filter((u) => u < us[0] - SAME_FT).pop()
  const after = faces.find((u) => u > us[us.length - 1] + SAME_FT)
  return [...(before === undefined ? [] : [before]), ...us, ...(after === undefined ? [] : [after])]
}

const sameStops = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((u, i) => Math.abs(u - b[i]) <= SAME_FT)

/** One chain per distinct row of points along f.u, set beside its row toward the rest of the grid. */
function rowChains(points: readonly Pt[], outline: readonly Pt[], f: Frame, minPoints: number, opts: DimOpts, pen: Pen): LabelledDim[][] {
  const rows = rowsOf(points, f)
  const done: number[][] = []
  return rows.flatMap((row, k): LabelledDim[][] => {
    if (row.us.length < minPoints) return []
    const stops = chainStops(outline, f, row.v, row.us)
    if (stops.length < 2 || done.some((d) => sameStops(d, stops))) return []
    done.push(stops)
    // into the grid: toward the next row, or back toward the last on the far row
    const sign = k < rows.length - 1 || rows.length === 1 ? 1 : -1
    const normal: Pt = [f.v[0] * sign, f.v[1] * sign]
    const roomy = textWidthFt(TYPICAL_TEXT, pen.text)
    return [
      stops.slice(1).map((u, i) => {
        const d = dimensionLine(fromFrame(f, stops[i], row.v), fromFrame(f, u, row.v), CHAIN_OFFSET_FT, { ...opts, normal })
        return d.text.value >= roomy ? d : { ...d, text: { ...d.text, x: d.text.x + normal[0] * pen.text * SHORT_TEXT_OUT, y: d.text.y + normal[1] * pen.text * SHORT_TEXT_OUT } }
      }),
    ]
  })
}

/** The points a support's spacing is dimensioned between: its posts, or its mast (located on its own). */
function locatedPoints(s: SheetSupport): { readonly points: Pt[]; readonly min: number } {
  if (s.posts.length) return { points: s.posts.map((p) => p.at), min: 2 }
  if (s.mast) return { points: [s.mast.at], min: 1 }
  return { points: [], min: 1 }
}

/** Spacing chains for every support of the building whose part is on this plan, each chain its pieces in order: rows along each support's own x, then its columns. */
export function supportChains(b: SheetBuilding, opts: DimOpts, pen: Pen): LabelledDim[][] {
  return b.supports.flatMap((s) => {
    const part = b.parts.find((p) => p.massIndex === s.massIndex)
    const { points, min } = locatedPoints(s)
    if (!part || !points.length) return []
    const f = frameOf(s.axisDeg)
    const turned: Frame = { u: f.v, v: [-f.u[0], -f.u[1]] }
    return [...rowChains(points, part.outline, f, min, opts, pen), ...rowChains(points, part.outline, turned, min, opts, pen)]
  })
}

export const supportDims = (b: SheetBuilding, opts: DimOpts, pen: Pen): LabelledDim[] => supportChains(b, opts, pen).flat()

/** Every point a building's supports reach on the plan, for its extent. */
export const supportExtentPoints = (b: SheetBuilding): Pt[] => supportPoints(b.supports.filter((s) => b.parts.some((p) => p.massIndex === s.massIndex)))
