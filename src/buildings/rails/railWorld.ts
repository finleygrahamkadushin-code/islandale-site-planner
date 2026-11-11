import { routePoints } from '../decks/boardwalk'
import { localToSite, num, type LocalPoint } from '../footprint'
import { pointInPolygon } from '../../site/geom2d'
import { buildingMasses, deckObjectMass, massBuildingPoly, massPoly, massToBuilding, type Mass } from '../masses'
import { layoutOpenings } from '../openings/openingLayout'
import type { P2, StairTop } from './railOpenings'
import { edgeFree, isRailable } from './railRules'
import { SLAB_M } from './rails'
import type { Ground } from '../../site/earthworks/earthworks'
import type { Terrain } from '../../site/types'
import { ftToM, M_PER_FT as FT } from '../../site/units'
import type { ObjectId, PlanObject } from '../../store/types'
import { baseElevation } from '../../scene/placement'

/**
 * Everything on the site that opens a building's rails, in site metres:
 * doors, walk-piece and bridge ends, enclosed walls, and the free deck
 * edges other decks can abut. Pure, built from the plan's objects and the
 * displayed ground, so the scene and the store's rail resolver agree.
 */

/** A door or slider on an enclosed wall. */
export interface DoorItem {
  readonly owner: ObjectId
  readonly mi: number
  readonly edge: number
  /** Jambs on the wall line, centre, outward unit normal, width (m) and floor surface. */
  readonly a: P2
  readonly b: P2
  readonly c: P2
  readonly nrm: P2
  readonly w: number
  readonly z: number
  /** Metres along its wall edge from the edge's first vertex. */
  readonly u0: number
  readonly u1: number
  readonly name: string
}

/** A walk piece's or bridge's end. */
export interface EndItem {
  readonly owner: ObjectId
  readonly kind: 'piece' | 'bridge'
  readonly at: P2
  readonly z: number
  readonly w: number
  readonly name: string
}

/** A free deck or porch edge, for decks that abut. */
export interface DeckEdgeItem {
  readonly owner: ObjectId
  readonly a: P2
  readonly b: P2
  readonly z: number
}

/** One building's or standalone deck's rail-relevant parts. */
export interface RailOwner {
  readonly o: PlanObject
  readonly masses: readonly Mass[]
  readonly standalone: boolean
  /** Elevation of the building floor (a standalone deck: its top), metres. */
  readonly base: number
  readonly doors: readonly DoorItem[]
  readonly walls: readonly (readonly P2[])[]
  readonly deckEdges: readonly DeckEdgeItem[]
}

export interface RailWorld {
  readonly ground: Ground
  readonly terrain: Terrain
  readonly owners: readonly RailOwner[]
  readonly ends: readonly EndItem[]
}

const WALK_KINDS = ['walk', 'ramp', 'stair', 'landing', 'boardwalk'] as const
const WALK_WIDTH_FT: Record<string, number> = { walk: 20, ramp: 12, stair: 8, landing: 5, boardwalk: 16 }
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A mass-local point (feet) of a building → site metres. */
export const massSite = (o: PlanObject, m: Mass, p: LocalPoint): P2 => localToSite(o.position, o.rotation, massToBuilding(m, p))

/** The walking surface of a mass: building floor + level + slab (legacy surfaceZ); a standalone deck's top. */
export const surfaceZ = (owner: Pick<RailOwner, 'base' | 'standalone'>, m: Mass): number => (owner.standalone ? owner.base : owner.base + ftToM(m.lvl) + SLAB_M)

/** A stair or ramp wing's top centre, axis (top → foot) and width, site metres (legacy accessTop). */
export function stairTopOf(o: PlanObject, m: Mass): StairTop {
  const c = massSite(o, m, [0, -m.d / 2])
  const f = massSite(o, m, [0, m.d / 2])
  const l = Math.hypot(f[0] - c[0], f[1] - c[1]) || 1
  return { c, axis: [(f[0] - c[0]) / l, (f[1] - c[1]) / l], w: ftToM(m.w) }
}

/** Legacy isWalkPiece: a path pad (a walk kind, or a narrow or ribbon pad that is not a drive or parking). */
export function isWalkPiece(o: PlanObject): boolean {
  if (o.type !== 'pad') return false
  const p = o.params
  if ((WALK_KINDS as readonly unknown[]).includes(p.kind)) return true
  if (p.kind) return false
  if (num(p.cars, 0) > 0) return false
  if (/drive|park|trailer/i.test(o.name || '')) return false
  const d = num(p.d, 0)
  return p.shape === 'ribbon' || (d > 0 && d < 8)
}

/** Legacy walkEnds: a path piece's two end points and their surface elevations. */
export function walkEnds(o: PlanObject, ground: Ground): { at: P2; z: number }[] {
  const p = o.params
  const kinded = (WALK_KINDS as readonly unknown[]).includes(p.kind)
  const kind = kinded ? (p.kind as string) : 'walk'
  const pts = Array.isArray(p.pts) ? (p.pts as number[][]).filter((q) => q.length >= 2) : []
  const w = num(p.w, 0) > 0 ? num(p.w, 0) : (WALK_WIDTH_FT[kind] ?? 20)
  const line: LocalPoint[] = !kinded && p.shape === 'ribbon' && pts.length >= 2 ? pts.map((q) => [q[0], q[1]]) : [[-w / 2, 0], [w / 2, 0]]
  const A = localToSite(o.position, o.rotation, line[0])
  const B = localToSite(o.position, o.rotation, line[line.length - 1])
  const gA = ground(A[0], A[1])
  const gB = ground(B[0], B[1])
  let zA = gA
  let zB = gB
  if (kind !== 'walk') {
    const e = isRecord(p.ends) ? p.ends : {}
    const top = Math.max(gA, gB) + ftToM(num(p.lift, 0))
    zA = typeof e.zA === 'number' ? e.zA : kind === 'boardwalk' ? top : gA
    zB = typeof e.zB === 'number' ? e.zB : kind === 'boardwalk' ? top : gB
    if (kind === 'landing') zA = zB = Math.max(zA, zB)
  }
  return [
    { at: A, z: zA },
    { at: B, z: zB },
  ]
}

function endsOf(o: PlanObject, ground: Ground): EndItem[] {
  if (isWalkPiece(o)) {
    const w = ftToM(num(o.params.d, 0) > 0 ? num(o.params.d, 0) : 4)
    const name = o.name || (typeof o.params.kind === 'string' ? o.params.kind : 'path')
    return walkEnds(o, ground).map((e) => ({ owner: o.id, kind: 'piece', at: e.at, z: e.z, w, name }))
  }
  if (o.type === 'bridge') {
    const route = routePoints(o)
    if (route.length < 2) return []
    const w = ftToM(num(o.params.w, 6))
    return [route[0], route[route.length - 1]].map((q) => ({ owner: o.id, kind: 'bridge', at: [q[0], q[1]], z: q[2], w, name: o.name || 'Bridge' }))
  }
  return []
}

/** Every drawn door and slider of an enclosed mass, as the walls lay them out. */
function doorsOf(o: PlanObject, masses: readonly Mass[], base: number): DoorItem[] {
  const closed = masses.filter((m) => !m.open).map(massBuildingPoly)
  return masses.flatMap((m, mi) => {
    if (m.open || !m.cuts.length) return []
    const poly = massPoly(m)
    const buried = (p: LocalPoint) => {
      const [bx, bz] = massToBuilding(m, p)
      return closed.some((q) => pointInPolygon(q, bx, bz))
    }
    const z = base + ftToM(m.lvl) + SLAB_M
    return layoutOpenings(poly, m.cuts, { wallHeightFt: m.h, buried }).openings.flatMap((op) => {
      if ((op.kind !== 'door' && op.kind !== 'slider') || op.hidden) return []
      return op.pieces.map((pc): DoorItem => {
        const A = poly[pc.edge]
        const B = poly[(pc.edge + 1) % poly.length]
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
        const t: LocalPoint = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
        const c: LocalPoint = [pc.centre[0], pc.centre[2]]
        const ja: LocalPoint = [c[0] - (t[0] * pc.w) / 2, c[1] - (t[1] * pc.w) / 2]
        const jb: LocalPoint = [c[0] + (t[0] * pc.w) / 2, c[1] + (t[1] * pc.w) / 2]
        const along = (q: LocalPoint) => ((q[0] - A[0]) * t[0] + (q[1] - A[1]) * t[1]) * FT
        const cs = massSite(o, m, c)
        const ns = massSite(o, m, [c[0] + pc.normal[0], c[1] + pc.normal[1]])
        const nl = Math.hypot(ns[0] - cs[0], ns[1] - cs[1]) || 1
        const [u0, u1] = [along(ja), along(jb)].sort((x, y) => x - y)
        return {
          owner: o.id,
          mi,
          edge: pc.edge,
          a: massSite(o, m, ja),
          b: massSite(o, m, jb),
          c: cs,
          nrm: [(ns[0] - cs[0]) / nl, (ns[1] - cs[1]) / nl],
          w: ftToM(pc.w),
          z,
          u0,
          u1,
          name: op.kind === 'slider' ? 'Slider' : 'Door',
        }
      })
    })
  })
}

/** A building or standalone deck with what it lends the rails of other objects. */
export function railOwner(o: PlanObject, terrain: Terrain, ground: Ground): RailOwner | null {
  if (o.type !== 'house' && o.type !== 'deck') return null
  const standalone = o.type === 'deck'
  const masses = standalone ? [deckObjectMass(o.params)] : buildingMasses(o.params)
  const base = standalone ? baseElevation(terrain, o, ground) + ftToM(Math.max(0, num(o.params.h, 0))) : baseElevation(terrain, o)
  const owner = { base, standalone }
  const deckEdges = masses.flatMap((m, mi) => {
    if (!isRailable(m)) return []
    const P = massPoly(m)
    return P.flatMap((p, i): DeckEdgeItem[] =>
      standalone || edgeFree(masses, mi, i) ? [{ owner: o.id, a: massSite(o, m, p), b: massSite(o, m, P[(i + 1) % P.length]), z: surfaceZ(owner, m) }] : [],
    )
  })
  return {
    o,
    masses,
    standalone,
    base,
    doors: standalone ? [] : doorsOf(o, masses, base),
    walls: standalone ? [] : masses.filter((m) => !m.open).map((m) => massPoly(m).map((p) => massSite(o, m, p))),
    deckEdges,
  }
}

/** The rail world of a plan's (visible) objects. */
export function railWorld(objects: readonly PlanObject[], terrain: Terrain, ground: Ground): RailWorld {
  return {
    ground,
    terrain,
    owners: objects.flatMap((o) => railOwner(o, terrain, ground) ?? []),
    ends: objects.flatMap((o) => endsOf(o, ground)),
  }
}

/** Whether an object takes part in rails (a building, standalone deck, path pad or bridge). */
export const opensRails = (o: PlanObject): boolean => !o.hidden && (o.type === 'house' || o.type === 'deck' || o.type === 'pad' || o.type === 'bridge')
