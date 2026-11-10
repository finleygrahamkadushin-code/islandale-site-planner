import { buildingMasses, massPoly, massToBuilding, type Mass } from '../../buildings/masses'
import { wallPlan, wallSpecsOf } from '../../buildings/walls/wallShell'
import { enclosedOn, envelopeOf, floorAtLevel } from '../envelope'
import * as G from '../geom'
import type { Pt } from '../geom'
import { WALL, type Floor, type RoomType } from '../types'

/**
 * The parts of a cabin's interior that must sit inside its walls (6K · K1):
 * the region inside the exterior walls on each floor, the room floors, and
 * the partitions merged into one plan shape per height band. Everything is
 * clipped to the wall ring inset by half a wall (a glass wall's full
 * thickness), so edges stay buried in the walls and never reach the siding.
 * Building feet, y up from the main floor.
 */

/** A plan shape extruded from y0 up to y1. */
export interface Prism {
  readonly outer: readonly Pt[]
  readonly holes: readonly (readonly Pt[])[]
  readonly y0: number
  readonly y1: number
  readonly part: 'wall' | 'header' | 'sill' | 'floor'
  readonly color: string
}

/** One solid stretch of a partition: from s0 to s1 along the line a + u·s, between heights y0 and y1 above its base. */
export interface PartitionPiece {
  readonly a: Pt
  readonly u: Pt
  readonly s0: number
  readonly s1: number
  readonly y0: number
  readonly y1: number
  /** Whether this stretch runs the partition's full height (not a header or sill). */
  readonly full: boolean
}

/** Room floor finish thickness, feet. */
export const FLOOR_FT = 0.06
const WOOD_FLOOR = '#b99c78'
const TILE_FLOOR = '#d6d1c7'
const WET: readonly RoomType[] = ['bath', 'kitchen', 'laundry', 'mudroom', 'entry', 'utility', 'garage']
/** Pieces smaller than this (feet²) are clipping noise. */
const AREA_EPS = 1e-4
/** Finished shapes smaller than this (feet², a third of a foot by an inch) are slivers left by clipping and are dropped. */
const SLIVER_FT2 = 0.03

type Params = Record<string, unknown>

const enclosedMasses = (params: Params, fi: number): { m: Mass; i: number }[] =>
  enclosedOn(
    buildingMasses(params).flatMap((m, i) => (massPoly(m).length >= 3 ? [{ m, i }] : [])),
    fi,
  )

const toBuilding = (m: Mass, P: readonly (readonly [number, number])[]): Pt[] =>
  P.map((p) => {
    const [x, z] = massToBuilding(m, [p[0], p[1]])
    return [x, z]
  })

/** Each enclosed mass's wall ring inset by half a wall (glass: the whole skin), in the building frame. */
export function innerOutlines(params: Params, fi: number): Pt[][] {
  return enclosedMasses(params, fi).flatMap(({ m, i }) => {
    const poly = massPoly(m)
    const specs = wallSpecsOf(params, i, poly.length)
    const half = (e: number) => {
      const s = specs[e]
      if (!s) return WALL.ext / 2
      return s.kind === 'glass' ? s.thicknessFt : s.thicknessFt / 2
    }
    const ring = toBuilding(m, wallPlan(poly, half).inner)
    return ring.length >= 3 && G.area(ring) > AREA_EPS ? [G.ensureCCW(ring)] : []
  })
}

/** The region inside the walls on floor fi as convex tiles that don't overlap. */
export function innerTiles(params: Params, fi: number): Pt[][] {
  const rings = innerOutlines(params, fi)
  return rings.length ? G.disjointTiles(rings) : []
}

/** Where something at plan point p on floor fi stands: a raised wing's own level when that level is on this floor, else fi storeys up. */
export function baseHeight(params: Params, fi: number, p: Pt, storeyFt: number): number {
  const wing = buildingMasses(params).find(
    (m) => !m.main && !m.open && m.lvl > 0 && floorAtLevel(m.lvl) === fi && G.pointInPoly(toBuilding(m, massPoly(m)), p[0], p[1]),
  )
  return wing ? wing.lvl : fi * storeyFt
}

/** Convex pieces (overlapping or not) → outlines with their holes. */
export function shapesOf(pieces: readonly Pt[][]): { outer: Pt[]; holes: Pt[][] }[] {
  const P = pieces.filter((p) => p.length >= 3 && G.area(p) > AREA_EPS)
  if (!P.length) return []
  // unionPieces merges pieces that meet edge to edge, so overlapping strips are made disjoint first
  const U = G.unionPieces(G.disjointTiles(P))
  const out = U.outer.filter((L) => G.area(L) >= SLIVER_FT2).map((outer) => ({ outer, holes: [] as Pt[][] }))
  for (const h of U.holes) {
    const c = G.labelPoint(h) ?? h[0]
    const host = out.find((s) => G.pointInPoly(s.outer, c[0], c[1]))
    if (host) host.holes.push(h)
  }
  return out
}

/** A prism's plan area, feet², holes taken out. */
export const prismArea = (s: Pick<Prism, 'outer' | 'holes'>): number => G.area(s.outer) - s.holes.reduce((a, h) => a + G.area(h), 0)

/** Room floors on floor fi: each room clipped to the inner region (earlier rooms win), plus the bare rest on the main floor, less the given holes. */
export function floorPrisms(params: Params, fi: number, floor: Floor, holes: readonly Pt[][], storeyFt: number): Prism[] {
  const tiles = innerTiles(params, fi)
  if (!tiles.length) return []
  const taken: Pt[][] = []
  const out: Prism[] = []
  const minus = (pieces: Pt[][], cuts: readonly Pt[][]) => cuts.reduce((acc, C) => G.subtractRegion(acc, C), pieces)
  const push = (pieces: Pt[][], color: string) => {
    for (const s of shapesOf(pieces)) {
      const at = G.labelPoint(s.outer) ?? s.outer[0]
      const y0 = baseHeight(params, fi, at, storeyFt)
      out.push({ ...s, y0, y1: y0 + FLOOR_FT, part: 'floor', color })
    }
  }
  for (const r of floor.rooms) {
    if (r.type === 'porch' || r.pts.length < 3) continue
    const room = r.pts as Pt[]
    push(minus(minus(G.intersectRegion(room, tiles), taken), holes), WET.includes(r.type) ? TILE_FLOOR : WOOD_FLOOR)
    taken.push(room)
  }
  if (fi === 0) push(minus(minus(tiles.slice(), taken), holes), WOOD_FLOOR)
  return out
}

const along = (a: Pt, u: Pt, s: number): Pt => [a[0] + u[0] * s, a[1] + u[1] * s]

/** A partition stretch as a plan rectangle, WALL.int wide on its line. */
function strip(pc: PartitionPiece): Pt[] {
  const h = WALL.int / 2
  const n: Pt = [-pc.u[1] * h, pc.u[0] * h]
  const p = along(pc.a, pc.u, pc.s0)
  const q = along(pc.a, pc.u, pc.s1)
  return G.ensureCCW([
    [p[0] + n[0], p[1] + n[1]],
    [q[0] + n[0], q[1] + n[1]],
    [q[0] - n[0], q[1] - n[1]],
    [p[0] - n[0], p[1] - n[1]],
  ])
}

/**
 * Partition stretches as prisms: one merged, clipped shape per height band,
 * each band less the plan of every earlier band it overlaps in height, so
 * no two faces coincide. Full-height bands go first.
 */
export function partitionPrisms(params: Params, fi: number, pieces: readonly PartitionPiece[], base: (pc: PartitionPiece) => number, color: string): Prism[] {
  const tiles = innerTiles(params, fi)
  if (!tiles.length || !pieces.length) return []
  const bands = new Map<string, PartitionPiece[]>()
  for (const pc of pieces) {
    const k = `${base(pc).toFixed(3)}|${pc.y0.toFixed(3)}|${pc.y1.toFixed(3)}`
    bands.set(k, [...(bands.get(k) ?? []), pc])
  }
  const order = [...bands.values()].sort((p, q) => Number(q[0].full) - Number(p[0].full) || q[0].y1 - q[0].y0 - (p[0].y1 - p[0].y0))
  const done: { lo: number; hi: number; strips: Pt[][] }[] = []
  const out: Prism[] = []
  for (const band of order) {
    const b = band[0]
    const lo = base(b) + b.y0
    const hi = base(b) + b.y1
    const strips = band.map(strip)
    let cut = strips.flatMap((S) => G.intersectRegion(S, tiles))
    for (const d of done) if (d.lo < hi - 1e-6 && d.hi > lo + 1e-6) cut = d.strips.reduce((acc, S) => G.subtractRegion(acc, S), cut)
    done.push({ lo, hi, strips })
    const part = b.full ? 'wall' : b.y0 > 0.001 ? 'header' : 'sill'
    for (const s of shapesOf(cut)) out.push({ ...s, y0: lo, y1: hi, part, color })
  }
  return out
}

/** Whether point p is within tol of the floor's exterior outline (the chords the rooms are drawn to). */
export function nearEnvelope(params: Params, fi: number, p: Pt, tol: number): boolean {
  return envelopeOf(params, fi).edges.some(([a, b]) => G.distToSeg(p, a, b).d <= tol)
}
