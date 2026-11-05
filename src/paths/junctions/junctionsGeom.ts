import { CURVED_SHAPES } from '../../buildings/footprint'
import { buildingMasses } from '../../buildings/masses'
import type { Ground } from '../../site/earthworks/earthworks'
import type { Terrain } from '../../site/types'
import type { ObjectId, PlanObject } from '../../store/types'
import { LEVEL_M, TOL_M, type HostEdge, type Junction } from './junctions'
import { hostEdges, isHost, siteJunctions } from './junctionsSite'
import { PATH_KINDS, pieceEnds, pieceWidth, type PathKind } from '../pieces'

/**
 * Where things physically meet (old ext:join-geom): a threshold plate
 * under each door something lands on, a filler strip across the gap
 * between abutting decks, and a short tab at a path piece's end that runs
 * under the door sill or deck boards it meets. Plain geometry, site
 * metres: a four-corner outline, the top elevation and the thickness; the
 * scene turns them into meshes. Pure.
 */

type P2 = readonly [number, number]
const FT = 0.3048

/** Threshold plate: across the wall (0.2 m) plus 0.1 m outside, 3 cm thick, 1 cm proud of the floor, at least 0.9 m wide. */
const WALL_M = 0.2
const PLATE_DEPTH_M = WALL_M + 0.1
const PLATE_IN_M = (WALL_M - 0.1) / 2
const PLATE_H_M = 0.03
const PLATE_PROUD_M = 0.01
const PLATE_MIN_W_M = 0.9
/** Filler strip: 5 cm thick, 4 mm under the deck surface, 10 cm wider than the gap. */
const FILLER_H_M = 0.05
const FILLER_DROP_M = 0.004
const FILLER_MIN_GAP_M = 0.01
/** Piece tab: 0.25 m past the end (and 2 cm back under the piece), 5 cm thick, 1 cm under the surface. */
export const TAB_M = 0.25
const TAB_BACK_M = 0.02
const TAB_H_M = 0.05
const TAB_DROP_M = 0.01
/** A walk's top sits 2 cm over the ground. */
const WALK_LIFT_M = 0.02

const DOOR_KINDS: readonly Junction['kind'][] = ['piece', 'stair-wing', 'ramp-wing', 'bridge']

export interface JoinSlab {
  readonly kind: 'threshold' | 'filler' | 'tab'
  /** The object it is drawn with: the building, the lower-id deck, or the piece. */
  readonly ownerId: ObjectId
  /** Corners, site metres, in order round the slab. */
  readonly outline: readonly P2[]
  /** Top surface, metres NAVD88. */
  readonly topZ: number
  readonly thickness: number
  readonly mi?: number
  readonly end?: 'A' | 'B'
}

/** A rectangle round centre c: ±len/2 along unit u, ±depth/2 along unit v. */
function rect(c: P2, u: P2, v: P2, len: number, depth: number): P2[] {
  const at = (s: number, t: number): P2 => [c[0] + u[0] * s + v[0] * t, c[1] + u[1] * s + v[1] * t]
  return [at(-len / 2, -depth / 2), at(len / 2, -depth / 2), at(len / 2, depth / 2), at(-len / 2, depth / 2)]
}

function unitAlong(e: HostEdge): P2 {
  const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1
  return [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L]
}

const edgeOf = (E: readonly HostEdge[], j: Junction) => E.find((e) => e.mi === j.edge.mi && e.i === j.edge.i)

/** A threshold plate under each door of a building that something lands on (legacy platesFor). */
export function thresholdPlates(o: PlanObject, J: readonly Junction[], E: readonly HostEdge[]): JoinSlab[] {
  if (o.type !== 'house') return []
  const masses = buildingMasses(o.params)
  const seen = new Set<string>()
  return J.flatMap((j): JoinSlab[] => {
    const m = masses[j.edge.mi]
    const e = edgeOf(E, j)
    if (!j.door || !e || !m || m.open || !DOOR_KINDS.includes(j.kind) || (CURVED_SHAPES as readonly string[]).includes(m.shape)) return []
    const key = `${j.edge.mi}:${j.edge.i}:${j.door.u0.toFixed(3)}`
    if (seen.has(key)) return []
    seen.add(key)
    const u = unitAlong(e)
    const um = (j.door.u0 + j.door.u1) / 2
    const c: P2 = [e.a[0] + u[0] * um - e.nrm[0] * PLATE_IN_M, e.a[1] + u[1] * um - e.nrm[1] * PLATE_IN_M]
    const w = Math.max(PLATE_MIN_W_M, j.door.u1 - j.door.u0)
    return [{ kind: 'threshold', ownerId: o.id, mi: j.edge.mi, outline: rect(c, u, e.nrm, w, PLATE_DEPTH_M), topZ: e.z + PLATE_PROUD_M, thickness: PLATE_H_M }]
  })
}

/** A filler strip across the gap where another deck's edge runs level along this one's; the lower id draws it (legacy fillersFor). */
export function fillerStrips(o: PlanObject, J: readonly Junction[], E: readonly HostEdge[]): JoinSlab[] {
  return J.flatMap((j): JoinSlab[] => {
    if (j.kind !== 'deck-abut' || j.other.id === o.id || j.other.id < o.id) return []
    if (!(j.gapM > FILLER_MIN_GAP_M && j.gapM <= TOL_M + 0.01) || Math.abs(j.dz) > LEVEL_M) return []
    const e = edgeOf(E, j)
    if (!e) return []
    const u = unitAlong(e)
    const um = (j.u0 + j.u1) / 2
    const c: P2 = [e.a[0] + u[0] * um + (e.nrm[0] * j.gapM) / 2, e.a[1] + u[1] * um + (e.nrm[1] * j.gapM) / 2]
    return [{ kind: 'filler', ownerId: o.id, mi: j.edge.mi, outline: rect(c, u, e.nrm, j.u1 - j.u0, j.gapM + 0.1), topZ: j.zHere - FILLER_DROP_M, thickness: FILLER_H_M }]
  })
}

/** Plates and fillers of one building or standalone deck. */
export function hostJoinery(o: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground): JoinSlab[] {
  if (!isHost(o)) return []
  const E = hostEdges(o, terrain, ground)
  const J = siteJunctions(o, objects, terrain, ground)
  return [...thresholdPlates(o, J, E), ...fillerStrips(o, J, E)]
}

const isTabPiece = (o: PlanObject) => o.type === 'pad' && (PATH_KINDS as readonly unknown[]).includes(o.params.kind)

/** Which ends of a path piece get a tab: a pinned end that meets a building's or deck's edge (legacy pieceTabs). */
export function pieceTabEnds(piece: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground): { A: boolean; B: boolean } {
  const ends = typeof piece.params.ends === 'object' && piece.params.ends !== null ? (piece.params.ends as Record<string, unknown>) : {}
  const want = { A: Number.isFinite(ends.zA), B: Number.isFinite(ends.zB) }
  if (!isTabPiece(piece) || (!want.A && !want.B)) return { A: false, B: false }
  const met = objects
    .filter((h) => h.id !== piece.id && isHost(h) && !h.hidden)
    .flatMap((h) => siteJunctions(h, objects, terrain, ground))
    .filter((j) => j.kind === 'piece' && j.other.id === piece.id)
    .map((j) => j.other.end)
  return { A: want.A && met.includes('A'), B: want.B && met.includes('B') }
}

/** The tab slab at one end of a piece. */
export function pieceTab(piece: PlanObject, end: 'A' | 'B', ground: Ground): JoinSlab {
  const E = pieceEnds(piece, ground)
  const L = Math.hypot(E.B[0] - E.A[0], E.B[1] - E.A[1]) || 1
  const sg = end === 'A' ? -1 : 1
  const out: P2 = [(sg * (E.B[0] - E.A[0])) / L, (sg * (E.B[1] - E.A[1])) / L]
  const side: P2 = [-out[1], out[0]]
  const p = end === 'A' ? E.A : E.B
  const mid = (TAB_M - TAB_BACK_M) / 2
  const c: P2 = [p[0] + out[0] * mid, p[1] + out[1] * mid]
  const kind: PathKind = E.kind
  const top = (kind === 'walk' ? (end === 'A' ? E.gA : E.gB) + WALK_LIFT_M : end === 'A' ? E.zA : E.zB) - TAB_DROP_M
  return { kind: 'tab', ownerId: piece.id, end, outline: rect(c, out, side, TAB_M + TAB_BACK_M, pieceWidth(piece) * FT), topZ: top, thickness: TAB_H_M }
}

/** The tabs a path piece draws. */
export function pieceTabs(piece: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground): JoinSlab[] {
  const t = pieceTabEnds(piece, objects, terrain, ground)
  return (['A', 'B'] as const).filter((e) => t[e]).map((e) => pieceTab(piece, e, ground))
}
