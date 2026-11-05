import type { LocalPoint } from '../../../buildings/footprint'
import type { Mass } from '../../../buildings/masses'
import { enclosedOn, PLAN_TOL } from '../../../interiors/envelope'
import { FURNITURE, furnitureCorners } from '../../../interiors/furniture/furniture'
import * as G from '../../../interiors/geom'
import type { Poly, Pt } from '../../../interiors/geom'
import { STOREY_FT } from '../../../interiors/scene3d/interior3d'
import { readFloors } from '../../../interiors/model'
import { openingGeom, partitionSegments } from '../../../interiors/rooms'
import { TYPE_LABELS, WALL, type Floor, type Room } from '../../../interiors/types'
import type { SheetFloor, SheetFurniture, SheetInteriorOpening, SheetPart, SheetPartition, SheetRoom } from '../types'

/**
 * A cabin's rooms for the floor plans, read through the interior editor's
 * own model (readFloors, partitionSegments, openingGeom) in the building
 * frame the sheets use. The editor works on an envelope whose curves are
 * simplified to chords, so on a curved cabin some of its "partitions" and
 * openings are really the outside wall; here everything is tested against
 * the walls the sheets draw (the parts' true outlines, as thick as the 3D
 * shell builds them), and what lies in the outside wall is left to the
 * walls' own drawing.
 */

/** Partitions are sampled this often along their length to find where they leave the walls, feet: under the shortest piece kept, and well under any wall's thickness, so no stretch in or out of a wall is missed. */
const STEP_FT = 0.2
/** Halvings used to place where a partition meets the walls' inside face (to well under 1/64 in). */
const BISECT = 14
/** A chord of a curved wall sits at most PLAN_TOL inside it; anything that close to the walls' inside face counts as the wall. */
const SAG_FT = PLAN_TOL + 0.05
/** Partition pieces shorter than this, once clipped to the walls, are dropped, feet (a stub inside the wall's corner). */
const MIN_PIECE_FT = 0.25
/** A partition end this close to another partition meets it, feet. */
const MEETS_FT = 0.05

/** One stretch of the walls' outside face, with the wall's thickness behind it. */
interface Face {
  readonly a: Pt
  readonly b: Pt
  readonly t: number
}

/** The walls a floor's rooms sit inside: their outside face (holes included) and the wall behind each stretch of it. */
export interface WallZone {
  readonly outer: readonly Poly[]
  readonly holes: readonly Poly[]
  readonly faces: readonly Face[]
  /** Inside the walls' inside faces, as convex tiles. */
  readonly clear: readonly Poly[]
  /** Each walled part's own wall, outside face and inside face: where parts overlap, one's wall runs across the other's floor, and the plan draws it there. */
  readonly bands: readonly { readonly outside: Poly; readonly inside: Poly }[]
}

const toPt = (p: LocalPoint): Pt => [p[0], p[1]]
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** The union of the walled parts' outlines, each stretch of it with the thickness of the part's wall it lies on. */
export function wallZone(parts: readonly SheetPart[]): WallZone {
  const walled = parts.filter((p) => p.outline.length >= 3)
  if (!walled.length) return { outer: [], holes: [], faces: [], clear: [], bands: [] }
  const U = G.unionPieces(G.disjointTiles(walled.map((p) => G.ensureCCW(p.outline.map(toPt)))))
  const edges = walled.flatMap((p) => p.edges.map((e) => ({ a: toPt(e.a), b: toPt(e.b), t: e.thicknessFt })))
  const faces = [...U.outer, ...U.holes].flatMap((L) =>
    L.map((a, i): Face => {
      const b = L[(i + 1) % L.length]
      const m = lerp(a, b, 0.5)
      let t = 0
      let best = Infinity
      for (const e of edges) {
        const d = G.distToSeg(m, e.a, e.b).d
        if (d < best) {
          best = d
          t = e.t
        }
      }
      return { a, b, t }
    }),
  )
  const clear = G.disjointTiles(walled.map((p) => G.ensureCCW((p.inner.length >= 3 ? p.inner : p.outline).map(toPt))))
  const bands = walled.filter((p) => p.inner.length >= 3).map((p) => ({ outside: p.outline.map(toPt), inside: p.inner.map(toPt) }))
  return { outer: U.outer, holes: U.holes, faces, clear, bands }
}

const inside = (z: WallZone, p: Pt) => z.outer.some((L) => G.pointInPoly(L, p[0], p[1])) && !z.holes.some((L) => G.pointInPoly(L, p[0], p[1]))
const nearestFace = (z: WallZone, p: Pt) => {
  let best = { d: Infinity, t: 0 }
  for (const f of z.faces) {
    const d = G.distToSeg(p, f.a, f.b).d
    if (d < best.d) best = { d, t: f.t }
  }
  return best
}
/** How far a point is in from the walls' inside face (negative within the walls); -Infinity outside them. */
export function clearOfWalls(z: WallZone, p: Pt): number {
  if (!inside(z, p)) return -Infinity
  let d = Infinity
  for (const f of z.faces) d = Math.min(d, G.distToSeg(p, f.a, f.b).d - f.t)
  return d
}
/** Within some part's own wall, where the plan draws it. */
const inBand = (z: WallZone, p: Pt) => z.bands.some((b) => G.pointInPoly(b.outside, p[0], p[1]) && !G.pointInPoly(b.inside, p[0], p[1]))

/** Within the outside wall, or so close to it (as a chord of a curved wall is) that it is the wall. */
function inWall(z: WallZone, p: Pt): boolean {
  if (!inside(z, p)) return nearestFace(z, p).d < SAG_FT
  return clearOfWalls(z, p) < SAG_FT
}
/** A segment lying along the outside wall: its ends, quarters and middle all in it. */
const alongWall = (z: WallZone, a: Pt, b: Pt) => [0, 0.25, 0.5, 0.75, 1].every((t) => inWall(z, lerp(a, b, t)))

/** The stretches (0–1 along a→b) of a segment clear of the walls (the outside wall, and any part's wall across another's floor), each end placed on a wall's inside face by halving. */
export function clearStretches(z: WallZone, a: Pt, b: Pt): [number, number][] {
  const n = Math.max(2, Math.ceil(len(a, b) / STEP_FT))
  const clear = (t: number) => {
    const p = lerp(a, b, t)
    return clearOfWalls(z, p) >= 0 && !inBand(z, p)
  }
  const edgeAt = (lo: number, hi: number, loClear: boolean) => {
    for (let k = 0; k < BISECT; k++) {
      const mid = (lo + hi) / 2
      if (clear(mid) === loClear) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const out: [number, number][] = []
  let start: number | null = clear(0) ? 0 : null
  for (let i = 1; i <= n; i++) {
    const t0 = (i - 1) / n
    const t1 = i / n
    const now = clear(t1)
    if (start === null && now) start = edgeAt(t0, t1, false)
    else if (start !== null && !now) {
      out.push([start, edgeAt(t0, t1, true)])
      start = null
    }
  }
  if (start !== null) out.push([start, 1])
  return out
}

/** The editor's partitions, clipped to the walls' inside face, ends that meet another partition run on half its thickness so corners close. */
export function sheetPartitions(z: WallZone, segs: readonly { readonly a: Pt; readonly b: Pt }[]): SheetPartition[] {
  const t = WALL.int
  const pieces = segs.flatMap(({ a, b }) => {
    const L = len(a, b)
    if (L < 1e-6 || alongWall(z, a, b)) return []
    return clearStretches(z, a, b).flatMap(([t0, t1]) =>
      (t1 - t0) * L < MIN_PIECE_FT ? [] : [{ a: lerp(a, b, t0), b: lerp(a, b, t1), aAtWall: t0 > 1e-9, bAtWall: t1 < 1 - 1e-9 }],
    )
  })
  const meets = (p: Pt, self: number) => pieces.some((q, j) => j !== self && G.distToSeg(p, q.a, q.b).d < MEETS_FT)
  return pieces.map((s, i) => {
    const L = len(s.a, s.b)
    const u: Pt = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]
    const runA = !s.aAtWall && meets(s.a, i) ? t / 2 : 0
    const runB = !s.bAtWall && meets(s.b, i) ? t / 2 : 0
    return { a: [s.a[0] - u[0] * runA, s.a[1] - u[1] * runA], b: [s.b[0] + u[0] * runB, s.b[1] + u[1] * runB], thicknessFt: t, aAtWall: s.aAtWall, bAtWall: s.bAtWall }
  })
}

/**
 * A room inside its walls: what of it lies inside the walls' inside face,
 * less half a partition along each edge it shares with the rest of the
 * floor; a porch room is all floor.
 */
export function netRoom(z: WallZone, pts: readonly Pt[]): Poly | null {
  const P = G.ensureCCW(pts)
  const box = G.bbox([P])
  const near = z.clear.filter((t) => {
    const b = G.bbox([t])
    return b.x1 <= box.x2 && box.x1 <= b.x2 && b.z1 <= box.z2 && box.z1 <= b.z2
  })
  let pieces = G.intersectRegion(P, near)
  const h = WALL.int / 2
  for (const e of G.edges(P)) {
    if (e.len < 1e-6 || alongWall(z, e.a, e.b)) continue
    // a strip half a partition deep inside the edge, run on past its ends so the corners go too
    const a: Pt = [e.a[0] - e.dir[0] * h, e.a[1] - e.dir[1] * h]
    const b: Pt = [e.b[0] + e.dir[0] * h, e.b[1] + e.dir[1] * h]
    const strip: Poly = [a, b, [b[0] + e.nin[0] * h, b[1] + e.nin[1] * h], [a[0] + e.nin[0] * h, a[1] + e.nin[1] * h]]
    pieces = G.subtractRegion(pieces, strip)
  }
  const loops = G.unionPieces(pieces).outer.map((L) => G.simplify(G.roundPts(L, 0.001), 0.005)).filter((L) => L.length >= 3)
  return loops.length ? loops.reduce((best, L) => (G.area(L) > G.area(best) ? L : best)) : null
}

function sheetRoom(z: WallZone, room: Room): SheetRoom {
  const porch = room.type === 'porch'
  const net = porch ? G.ensureCCW(room.pts) : netRoom(z, room.pts)
  const shape = net ?? room.pts
  const box = G.obb(shape)
  const label = G.labelPoint(shape) ?? G.centroid(room.pts) ?? room.pts[0]
  return {
    id: room.id,
    name: room.name,
    type: TYPE_LABELS[room.type] ?? room.type,
    porch,
    outline: room.pts.map(toPt),
    net: net ?? [],
    netAreaSqFt: net ? G.area(net) : 0,
    widthFt: box?.w ?? 0,
    depthFt: box?.d ?? 0,
    label,
  }
}

function sheetOpenings(params: Record<string, unknown>, fi: number, floor: Floor, z: WallZone): SheetInteriorOpening[] {
  const nameOf = (id: number | null) => (id === null ? null : (floor.rooms.find((r) => r.id === id)?.name ?? null))
  return floor.openings.flatMap((op): SheetInteriorOpening[] => {
    const g = openingGeom(params, fi, op, floor.rooms)
    // one in the outside wall is the walls' own opening
    if (!g || g.exterior || alongWall(z, g.a, g.b)) return []
    const room = nameOf(g.room) ?? ''
    const to = nameOf(g.neighbour)
    return [
      {
        kind: op.kind,
        a: g.a,
        b: g.b,
        hinge: g.hinge,
        jamb: g.jamb,
        swing: g.swing,
        widthFt: op.width,
        thicknessFt: g.t,
        room,
        to,
        swingsInto: op.kind === 'door' ? (op.out ? to : room) : null,
        inPartWall: inBand(z, g.c),
      },
    ]
  })
}

const sheetFurniture = (floor: Floor): SheetFurniture[] =>
  floor.furniture.map((f) => ({
    type: f.type,
    label: FURNITURE[f.type]?.label ?? f.type,
    at: [f.x, f.z],
    rotDeg: f.rot,
    widthFt: f.w,
    depthFt: f.d,
    mirror: f.mirror,
    corners: furnitureCorners(f),
  }))

const isEmpty = (f: Floor) => !f.rooms.length && !f.openings.length && !f.furniture.length

/**
 * A cabin's floors as the sheets draw them, lowest first, each against the
 * walls of the parts that enclose it; none for a cabin with nothing drawn
 * inside, or for a standalone deck.
 */
export function sheetFloors(params: Record<string, unknown>, masses: readonly Mass[], parts: readonly SheetPart[], standalone: boolean): SheetFloor[] {
  if (standalone) return []
  const floors = readFloors(params)
  if (floors.every(isEmpty)) return []
  const list = parts.flatMap((p) => (masses[p.massIndex] ? [{ m: masses[p.massIndex], i: p.massIndex, p }] : []))
  return floors.map((floor, fi) => {
    const enclosed = enclosedOn(list, fi).map((e) => e.p)
    const z = wallZone(enclosed)
    return {
      index: fi,
      name: floor.name,
      levelFt: fi * STOREY_FT,
      enclosedParts: enclosed.map((p) => p.massIndex),
      rooms: floor.rooms.map((r) => sheetRoom(z, r)),
      partitions: sheetPartitions(z, partitionSegments(params, fi, floor.rooms)),
      openings: sheetOpenings(params, fi, floor, z),
      furniture: sheetFurniture(floor),
    }
  })
}
