import { CURVED_SHAPES, type LocalPoint } from '../../buildings/footprint'
import { edgeName, type Mass } from '../../buildings/masses'
import { FIT } from '../../buildings/openingLayout'
import { edgeInArc } from './openings'
import type { WallSpec } from '../../buildings/wallShell'
import type { CurveKind, FittedArc, SheetEdge, SheetPoint } from './types'

/**
 * How a part's outline is read on the sheets once its arcs are known: which
 * edges are curve (never dimensioned one by one), which vertices are labelled
 * corners, and the stations round its curves a draftsman plots it from.
 * Every distance round the outline is measured from P1 (vertex 0) in the
 * P1 → P2 direction, as along-cut openings are.
 */

/** Stations on a curve, every this many feet round from P1. */
export const STATION_FT = 2
/** A station this close to a labelled corner is left out, feet. */
const STATION_CLEAR_FT = 0.5

export const curveKindOf = (shape: string): CurveKind | null => ((CURVED_SHAPES as readonly string[]).includes(shape) ? (shape as CurveKind) : null)

const dist = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Distance round a closed outline from vertex 0 to each vertex, then the whole perimeter last. */
export function aroundOf(outline: readonly LocalPoint[]): number[] {
  const out = [0]
  outline.forEach((a, i) => out.push(out[i] + dist(a, outline[(i + 1) % outline.length])))
  return out
}

/** How far the outline turns at vertex i, degrees, 0 for straight on. */
function turnAt(outline: readonly LocalPoint[], i: number): number {
  const n = outline.length
  const p = outline[(i - 1 + n) % n]
  const v = outline[i]
  const q = outline[(i + 1) % n]
  const a = Math.atan2(v[1] - p[1], v[0] - p[0])
  const b = Math.atan2(q[1] - v[1], q[0] - v[0])
  return Math.abs((Math.atan2(Math.sin(b - a), Math.cos(b - a)) * 180) / Math.PI)
}

const sharp = (outline: readonly LocalPoint[], i: number) => turnAt(outline, i) >= FIT.softTurnDeg

/**
 * The outline's edges. An edge is curve when it is a chord of an arc, a
 * chord of a smooth run left between two arcs, or any chord of a curved
 * footprint save a straight end between two sharp corners (a ribbon's).
 * `walls` gives each edge's wall (empty on a part with no walls).
 */
export function edgesOf(m: Mass, outline: readonly LocalPoint[], arcs: readonly FittedArc[], smooth: readonly boolean[], walls: readonly WallSpec[] = []): SheetEdge[] {
  const n = outline.length
  const organic = curveKindOf(m.shape) !== null
  return outline.map((a, i) => {
    const b = outline[(i + 1) % n]
    const k = arcs.findIndex((arc) => edgeInArc(i, arc))
    const curved = k >= 0 || !!smooth[i] || (organic && !(sharp(outline, i) && sharp(outline, (i + 1) % n)))
    const wall = walls[i]
    return { index: i, a, b, lengthFt: dist(a, b), name: edgeName(m, i), arc: k < 0 ? null : k, curved, thicknessFt: wall?.thicknessFt ?? 0, glass: wall?.kind === 'glass' }
  })
}

/** A vertex is a labelled corner unless it lies inside one curve: P1 always, the ends of arcs, and wherever the outline turns sharply. */
function isCorner(outline: readonly LocalPoint[], edges: readonly SheetEdge[], i: number): boolean {
  const before = edges[(i - 1 + edges.length) % edges.length]
  const after = edges[i]
  return i === 0 || !before.curved || !after.curved || before.arc !== after.arc || sharp(outline, i)
}

/**
 * Labelled corners, and stations every STATION_FT round the curves, in order
 * round the outline from P1. A curved footprint gets stations all round its
 * curve, its arcs being a close fit to it; a straight-sided shape only where
 * no arc draws a curve, as an arc fitted to one is the curve it was drawn as.
 */
export function pointsOf(outline: readonly LocalPoint[], edges: readonly SheetEdge[], organic: boolean): SheetPoint[] {
  if (outline.length < 3 || edges.length !== outline.length) return outline.map((at, i) => ({ label: `P${i + 1}`, at, aroundFt: 0, vertex: i }))
  const around = aroundOf(outline)
  const perimeter = around[outline.length]
  const corners = outline.flatMap((at, i): SheetPoint[] => (isCorner(outline, edges, i) ? [{ label: `P${i + 1}`, at, aroundFt: around[i], vertex: i }] : []))
  const clear = (s: number) => [...corners.map((c) => c.aroundFt), perimeter].every((c) => Math.abs(c - s) >= STATION_CLEAR_FT)
  const stations: Omit<SheetPoint, 'label'>[] = []
  let e = 0
  for (let s = STATION_FT; s < perimeter; s += STATION_FT) {
    while (e < edges.length - 1 && around[e + 1] <= s) e++
    const edge = edges[e]
    if (!edge.curved || (!organic && edge.arc !== null) || !clear(s) || edge.lengthFt <= 0) continue
    const t = (s - around[e]) / edge.lengthFt
    stations.push({ at: [edge.a[0] + (edge.b[0] - edge.a[0]) * t, edge.a[1] + (edge.b[1] - edge.a[1]) * t], aroundFt: s, vertex: null })
  }
  const labelled = stations.map((p, k): SheetPoint => ({ ...p, label: `S${k + 1}` }))
  return [...corners, ...labelled].sort((p, q) => p.aroundFt - q.aroundFt)
}

/** A stretch of curve: consecutive curved edges, the whole outline when every edge is curve. */
export interface CurveRun {
  readonly fromEdge: number
  readonly toEdge: number
  readonly lengthFt: number
  /** How many arcs it is drawn with. */
  readonly arcCount: number
  readonly whole: boolean
}

/** Every stretch of curve in the outline, in order from P1. */
export function curveRuns(edges: readonly SheetEdge[]): CurveRun[] {
  const n = edges.length
  if (n === 0) return []
  const arcCount = (run: readonly SheetEdge[]) => new Set(run.flatMap((e) => (e.arc === null ? [] : [e.arc]))).size
  if (edges.every((e) => e.curved)) return [{ fromEdge: 0, toEdge: n - 1, lengthFt: edges.reduce((s, e) => s + e.lengthFt, 0), arcCount: arcCount(edges), whole: true }]
  // start just after a straight edge, so a curve through P1 stays whole
  const start = (edges.findIndex((e) => !e.curved) + 1) % n
  const runs: SheetEdge[][] = []
  for (let k = 0; k < n; k++) {
    const e = edges[(start + k) % n]
    const last = runs[runs.length - 1]
    if (!e.curved) continue
    const prev = edges[(e.index - 1 + n) % n]
    if (last && prev.curved && last[last.length - 1] === prev) last.push(e)
    else runs.push([e])
  }
  return runs
    .map((run) => ({ fromEdge: run[0].index, toEdge: run[run.length - 1].index, lengthFt: run.reduce((s, e) => s + e.lengthFt, 0), arcCount: arcCount(run), whole: false }))
    .sort((a, b) => a.fromEdge - b.fromEdge)
}

/** "P5–P16": the labelled corners at the ends of a run of edges. */
export const spanLabel = (n: number, fromEdge: number, toEdge: number): string => `P${fromEdge + 1}–P${((toEdge + 1) % n) + 1}`
