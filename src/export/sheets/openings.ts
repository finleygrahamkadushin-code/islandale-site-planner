import type { LocalPoint } from '../../buildings/footprint'
import { massPoly, massToBuilding, type Mass } from '../../buildings/masses'
import { fitMass, wallLabel } from '../../buildings/openingEdits'
import type { OpeningPiece, PlacedOpening } from '../../buildings/openingLayout'
import type { SheetArc, SheetOpening, SheetOpeningPiece } from './types'

/** An opening before the building numbers it. */
export type UntaggedOpening = Omit<SheetOpening, 'tag'>

type Params = Record<string, unknown>

const lerp = (a: LocalPoint, b: LocalPoint, t: number): LocalPoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Whether edge i is one of an arc's edges, the run wrapping through vertex 0 when fromEdge > toEdge. */
export const edgeInArc = (i: number, a: Pick<SheetArc, 'fromEdge' | 'toEdge'>): boolean =>
  a.fromEdge <= a.toEdge ? i >= a.fromEdge && i <= a.toEdge : i >= a.fromEdge || i <= a.toEdge

/** Distances of a piece's ends from its edge's vertex a, mass frame. */
function pieceSpan(poly: readonly LocalPoint[], p: OpeningPiece): { t0: number; t1: number; len: number } | null {
  const a = poly[p.edge]
  const b = poly[(p.edge + 1) % poly.length]
  if (!a || !b) return null
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1e-9) return null
  const mid = ((p.centre[0] - a[0]) * (b[0] - a[0]) + (p.centre[2] - a[1]) * (b[1] - a[1])) / len
  return { t0: Math.max(0, mid - p.w / 2), t1: Math.min(len, mid + p.w / 2), len }
}

function piecesOf(m: Mass, poly: readonly LocalPoint[], c: PlacedOpening): SheetOpeningPiece[] {
  return c.pieces.flatMap((p): SheetOpeningPiece[] => {
    const span = pieceSpan(poly, p)
    if (!span) return []
    const a = poly[p.edge]
    const b = poly[(p.edge + 1) % poly.length]
    return [
      {
        edge: p.edge,
        a: massToBuilding(m, lerp(a, b, span.t0 / span.len)),
        b: massToBuilding(m, lerp(a, b, span.t1 / span.len)),
        fromLeftFt: span.len - span.t1,
      },
    ]
  })
}

/** The arc every piece lies on, if there is one. */
function arcOfPieces(pieces: readonly SheetOpeningPiece[], arcs: readonly SheetArc[]): number | null {
  if (!pieces.length) return null
  const k = arcs.findIndex((arc) => pieces.every((p) => edgeInArc(p.edge, arc)))
  return k < 0 ? null : k
}

/**
 * From the curve's left end as seen from outside (the far end of its last
 * edge: walking the outline runs right to left from outside) to the
 * opening's left end, along the curve.
 */
function fromLeftOnArc(arc: SheetArc, lens: readonly number[], last: SheetOpeningPiece): number {
  const n = lens.length
  const before: number[] = []
  for (let i = arc.fromEdge; i !== last.edge; i = (i + 1) % n) before.push(lens[i])
  const reach = before.reduce((s, l) => s + l, 0) + (lens[last.edge] - last.fromLeftFt)
  return Math.max(0, arc.lengthFt - reach)
}

function wallOf(params: Params, mi: number, pieces: readonly SheetOpeningPiece[], arc: SheetArc | null): string {
  const first = pieces[0]
  if (arc) {
    const edges = pieces.map((p) => p.edge + 1)
    const span = edges.length > 1 ? `edges ${edges[0]}–${edges[edges.length - 1]}` : `edge ${edges[0]}`
    return `${wallLabel(params, mi, 'along')}, ${span}`
  }
  const label = wallLabel(params, mi, first.edge)
  const more = pieces.slice(1).map((p) => wallLabel(params, mi, p.edge).split(' · ').pop())
  return more.length ? `${label}, turning onto ${more.join(', ')}` : label
}

/** Every drawn opening of a part, each split into its straight pieces, building frame. */
export function openingsOf(params: Params, m: Mass, mi: number, arcs: readonly SheetArc[]): UntaggedOpening[] {
  if (m.cuts.length === 0) return []
  const poly = massPoly(m)
  const lens = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]
    return Math.hypot(b[0] - a[0], b[1] - a[1])
  })
  return fitMass(params, mi).openings.flatMap((c): UntaggedOpening[] => {
    if (c.hidden) return []
    const pieces = piecesOf(m, poly, c)
    const first = pieces[0]
    const last = pieces[pieces.length - 1]
    if (!first || !last) return []
    const k = c.along ? arcOfPieces(pieces, arcs) : null
    const arc = k === null ? null : arcs[k]
    return [
      {
        kind: c.kind,
        wall: wallOf(params, mi, pieces, arc),
        a: first.a,
        b: last.b,
        pieces,
        arc: k,
        widthFt: c.w,
        fromLeftFt: arc ? fromLeftOnArc(arc, lens, last) : c.along ? first.fromLeftFt : c.x,
        sillFt: c.sill,
        headFt: c.sill + c.h,
      },
    ]
  })
}
