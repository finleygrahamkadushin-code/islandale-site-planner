/**
 * Plan-sheet helpers that read the sheet model: the edges an arc runs
 * along, and where openings fall along a straight wall edge. Pure.
 */
import type { SheetArc, SheetEdge, SheetOpening } from '../types'
import type { Pt } from '../svgDims'

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
