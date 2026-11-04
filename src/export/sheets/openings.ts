import type { LocalPoint } from '../../buildings/footprint'
import { massPoly, massToBuilding, type Mass } from '../../buildings/masses'
import { fitMass, wallLabel } from '../../buildings/openingEdits'
import type { OpeningPiece, PlacedOpening } from '../../buildings/openingLayout'
import type { SheetArc, SheetEdge, SheetOpening, SheetOpeningPiece } from './types'

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

type Piece = SheetOpeningPiece & { readonly fromA: number }

function piecesOf(m: Mass, poly: readonly LocalPoint[], c: PlacedOpening): Piece[] {
  return c.pieces.flatMap((p): Piece[] => {
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
        fromA: span.t0,
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

/** "Main · curved wall" on a curve; else the first piece's wall, then any it turns onto. */
function wallOf(params: Params, mi: number, pieces: readonly SheetOpeningPiece[], onCurve: boolean): string {
  if (onCurve) return wallLabel(params, mi, 'along')
  const label = wallLabel(params, mi, pieces[0].edge)
  const more = pieces.slice(1).map((p) => wallLabel(params, mi, p.edge).split(' · ').pop())
  return more.length ? `${label}, turning onto ${more.join(', ')}` : label
}

/**
 * Every drawn opening of a part, each split into its straight pieces,
 * building frame. `edges` are the part's sheet edges (which are curve);
 * `around` the distance round its outline from P1 to each vertex.
 */
export function openingsOf(params: Params, m: Mass, mi: number, arcs: readonly SheetArc[], edges: readonly SheetEdge[], around: readonly number[]): UntaggedOpening[] {
  if (m.cuts.length === 0) return []
  const poly = massPoly(m)
  const partCurves = edges.some((e) => e.curved)
  return fitMass(params, mi).openings.flatMap((c): UntaggedOpening[] => {
    if (c.hidden) return []
    const pieces = piecesOf(m, poly, c)
    const first = pieces[0]
    const last = pieces[pieces.length - 1]
    if (!first || !last) return []
    const onCurve = pieces.some((p) => edges[p.edge]?.curved)
    // an along-cut's x is already round the outline from vertex 0 (P1); any other opening's first end is found from its first piece
    const aroundFt = c.along ? c.x : partCurves ? (around[first.edge] ?? 0) + first.fromA : null
    return [
      {
        kind: c.kind,
        wall: wallOf(params, mi, pieces, onCurve),
        a: first.a,
        b: last.b,
        pieces: pieces.map(({ fromA: _, ...p }) => p),
        arc: arcOfPieces(pieces, arcs),
        onCurve,
        widthFt: c.w,
        fromLeftFt: onCurve ? null : c.along ? last.fromLeftFt : c.x,
        aroundFt,
        sillFt: c.sill,
        headFt: c.sill + c.h,
      },
    ]
  })
}
