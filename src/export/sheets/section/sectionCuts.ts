import type { LocalPoint } from '../../../buildings/footprint'
import { partPoints } from '../model/parts'
import type { Extent } from '../Page'
import { ptToFt } from '../svgDims'
import type { AnyScale, SheetBounds, SheetBuilding, SheetPart } from '../types'
import { centroidOf, depthOf, lookOf, type CutLine } from './sectionGeom'

/**
 * Where a building's two section cuts are: A–A along the main part's longer
 * side and B–B square to it, both through the centroid of its outline, B–B
 * nudged onto a nearby opening; each moved by an offset (feet, along the
 * way it looks) the plan sheet's marks set.
 */

export type CutId = 'A' | 'B'
export const CUT_IDS: readonly CutId[] = ['A', 'B']

export interface SectionCut extends CutLine {
  readonly id: CutId
  readonly kind: 'long' | 'cross'
  /** Feet the cut is moved, along `look`, from the centroid line. */
  readonly offsetFt: number
  /** Its default offset, and how far it may move each way and still cross the building. */
  readonly defaultFt: number
  readonly minFt: number
  readonly maxFt: number
  /** How far the cut line runs each way along `dir` from its origin to cover the building, feet. */
  readonly reach: readonly [number, number]
}

/** Moved offsets by building id; a cut with none sits at its default. */
export type CutOffsets = Readonly<Record<string, Partial<Record<CutId, number>>>>

export const CUT_TITLE: Readonly<Record<CutId, string>> = { A: 'Section A–A (long)', B: 'Section B–B (cross)' }

/** The room a plan gives its cut marks past its dimensions on every side: a bubble, its arrow and a gap, paper points. */
const CUT_MARK_PAD_PT = 26

/** A cut keeps this far inside the building's outermost points, feet (3 in). */
const INSET_FT = 0.25
/** B–B moves onto an opening whose middle is within this share of the main part's length of the centroid. */
const NUDGE_SHARE = 0.25

/** The main part's own x and z axes in the building frame (massToBuilding turns x to (cos, −sin)). */
function axes(p: SheetPart): { readonly x: LocalPoint; readonly z: LocalPoint } {
  const a = (p.rotDeg * Math.PI) / 180
  return { x: [Math.cos(a), -Math.sin(a)], z: [Math.sin(a), Math.cos(a)] }
}

/** Point a direction to the right on the plan (or down it when it is square to the page). */
const rightward = (d: LocalPoint): LocalPoint => (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] < 0) ? [-d[0], -d[1]] : d)

/** The offset of B–B onto the opening on the main part nearest the centroid, when one is near enough; else 0. */
function nudge(main: SheetPart, line: CutLine, lengthFt: number): number {
  const offsets = main.openings.map((o) => depthOf(line, [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]))
  const near = offsets.filter((d) => Math.abs(d) <= lengthFt * NUDGE_SHARE).sort((a, b) => Math.abs(a) - Math.abs(b))
  return near[0] ?? 0
}

function cutOf(b: SheetBuilding, id: CutId, origin: LocalPoint, dir: LocalPoint, defaultFt: number, moved: number | undefined): SectionCut {
  const look = lookOf(dir)
  const base: CutLine = { origin, dir, look }
  const pts = b.parts.flatMap(partPoints)
  const depths = pts.map((p) => depthOf(base, p))
  const alongs = pts.map((p) => (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1])
  const minFt = Math.min(0, ...depths) + INSET_FT
  const maxFt = Math.max(0, ...depths) - INSET_FT
  const offsetFt = Math.min(maxFt, Math.max(minFt, moved ?? defaultFt))
  return {
    id,
    kind: id === 'A' ? 'long' : 'cross',
    origin: [origin[0] + look[0] * offsetFt, origin[1] + look[1] * offsetFt],
    dir,
    look,
    offsetFt,
    defaultFt,
    minFt,
    maxFt,
    reach: [Math.min(0, ...alongs), Math.max(0, ...alongs)],
  }
}

/** A building's two cuts, at their defaults or where the offsets move them. */
export function sectionCuts(b: SheetBuilding, moved: Partial<Record<CutId, number>> = {}): readonly [SectionCut, SectionCut] | null {
  const main = b.parts[0]
  if (!main || main.outline.length < 3) return null
  const c = centroidOf(main.outline)
  const { x, z } = axes(main)
  const longDir = rightward(main.wFt >= main.dFt ? x : z)
  const crossDir = rightward(main.wFt >= main.dFt ? z : x)
  const lengthFt = Math.max(main.wFt, main.dFt)
  const crossDefault = nudge(main, { origin: c, dir: crossDir, look: lookOf(crossDir) }, lengthFt)
  return [cutOf(b, 'A', c, longDir, 0, moved.A), cutOf(b, 'B', c, crossDir, crossDefault, moved.B)]
}

/** The room the cut marks take past a plan's dimensions on each side, feet at the scale. */
export const cutMarkPadFt = (scale: AnyScale): number => ptToFt(CUT_MARK_PAD_PT, scale)

/** A drawing's box grown by `pad` feet on every side. */
export const padExtent = (e: Extent, pad: number): Extent => ({ x: e.x - pad, y: e.y - pad, w: e.w + 2 * pad, h: e.h + 2 * pad })

/** Where a cut's line enters and leaves a box, as u along it, low then high; null when it misses the box. */
export function cutReachIn(c: CutLine, box: SheetBounds): readonly [number, number] | null {
  let lo = -Infinity
  let hi = Infinity
  const axes: readonly (readonly [number, number, number, number])[] = [
    [c.origin[0], c.dir[0], box.minx, box.maxx],
    [c.origin[1], c.dir[1], box.minz, box.maxz],
  ]
  for (const [o, d, min, max] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) return null
      continue
    }
    const t0 = (min - o) / d
    const t1 = (max - o) / d
    lo = Math.max(lo, Math.min(t0, t1))
    hi = Math.min(hi, Math.max(t0, t1))
  }
  return lo <= hi ? [lo, hi] : null
}
