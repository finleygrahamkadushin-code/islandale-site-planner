import { envelopeOf } from './envelope'
import * as G from './geom'
import type { Poly, Pt } from './geom'
import { CIRCULATION, TYPE_LABELS, WALL, type Floor, type Opening, type Room, type RoomType } from './types'

/**
 * What a floor plan's rooms mean, worked out from the data (old INT.model:
 * fitRoom, partitionSegments, openingGeom, roomInfo, floorStats).
 */

type Params = Record<string, unknown>
type Seg = readonly [Pt, Pt]

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]
const along = (p: Pt, d: Pt, s: number): Pt => [p[0] + d[0] * s, p[1] + d[1] * s]
const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/** Is the line through a (direction dir) the same line as segment p→q? */
function collinear(a: Pt, dir: Pt, p: Pt, q: Pt): boolean {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1])
  if (len < 1e-9) return false
  const d2: Pt = [(q[0] - p[0]) / len, (q[1] - p[1]) / len]
  if (Math.abs(cross(dir, d2)) >= 0.01) return false
  return Math.abs(cross(d2, sub(a, p))) < G.ON
}

function mergeRanges(rs: readonly (readonly [number, number])[], gap: number): [number, number][] {
  const out: [number, number][] = []
  for (const r of [...rs].sort((x, y) => x[0] - y[0])) {
    const l = out[out.length - 1]
    if (l && r[0] <= l[1] + gap) l[1] = Math.max(l[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/** Stretches (0–1 along a→b) where the edge lies on the envelope's outline. */
function boundaryRanges(a: Pt, b: Pt, segs: readonly Seg[]): [number, number][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1e-9) return []
  const dir: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const out: [number, number][] = []
  for (const [p, q] of segs) {
    if (!collinear(a, dir, p, q)) continue
    let t0 = dot(sub(p, a), dir) / len
    let t1 = dot(sub(q, a), dir) / len
    if (t0 > t1) [t0, t1] = [t1, t0]
    t0 = Math.max(0, t0)
    t1 = Math.min(1, t1)
    if (t1 - t0 > 1e-6) out.push([t0, t1])
  }
  return mergeRanges(out, 1e-6)
}

const onBoundary = (c: Pt, dir: Pt, segs: readonly Seg[]) => segs.some(([p, q]) => collinear(c, dir, p, q) && G.distToSeg(c, p, q).d < G.ON)

const boxesOverlap = (A: G.Box, B: G.Box) => A.x1 <= B.x2 + 1e-6 && B.x1 <= A.x2 + 1e-6 && A.z1 <= B.z2 + 1e-6 && B.z1 <= A.z2 + 1e-6

function canonStart(P: readonly Pt[]): Pt[] {
  let k = 0
  for (let i = 1; i < P.length; i++) {
    const p = P[i]
    const q = P[k]
    if (p[1] < q[1] - 1e-6 || (Math.abs(p[1] - q[1]) <= 1e-6 && p[0] < q[0])) k = i
  }
  return [...P.slice(k), ...P.slice(0, k)]
}

export interface Fit {
  /** What is left of the drawn shape: inside the walls (or, for a porch, the open parts) and clear of the other rooms. */
  readonly polys: Poly[]
  /** Another room left a hole in it. */
  readonly hole: boolean
  /** Some of the drawn shape was cut away. */
  readonly clipped: boolean
}

/** Trim a drawn room to the walls and to its neighbours (old fitRoom). */
export function fitRoom(params: Params, fi: number, pts: readonly Pt[], type: RoomType, exceptId: number | null, rooms: readonly Room[]): Fit {
  if (pts.length < 3) return { polys: [], hole: false, clipped: true }
  const env = envelopeOf(params, fi)
  const P = G.ensureCCW(pts)
  let pieces = G.intersectRegion(P, type === 'porch' ? env.openTiles : env.tiles)
  const pb = G.bbox([P])
  for (const R of rooms) {
    if (R.id === exceptId || R.pts.length < 3) continue
    if (!pieces.length) break
    if (boxesOverlap(pb, G.bbox([R.pts]))) pieces = G.subtractRegion(pieces, R.pts)
  }
  const U = G.unionPieces(pieces)
  const polys = U.outer
    .map((L) => G.simplify(G.roundPts(L)))
    .filter((L) => L.length >= 3 && G.area(L) >= 1)
    .map(canonStart)
  return {
    polys,
    hole: U.holes.some((h) => G.area(h) >= 0.5),
    clipped: Math.abs(polys.reduce((s, L) => s + G.area(L), 0) - G.area(P)) > 0.5,
  }
}

/** Interior walls: room edges inside the envelope and off its outline, merged where they line up (old partitionSegments). */
export function partitionSegments(params: Params, fi: number, rooms: readonly Room[]): { readonly a: Pt; readonly b: Pt }[] {
  const env = envelopeOf(params, fi)
  const list = rooms.filter((r) => r.type !== 'porch' && r.pts.length >= 3)
  const inside = (p: Pt) => env.tiles.some((T) => G.pointInPoly(T, p[0], p[1]) || (G.nearestEdge(T, p)?.d ?? Infinity) < G.TOL)
  const groups: { th: number; u: Pt; c: number; iv: [number, number][] }[] = []
  for (const r of list)
    for (const E of G.edges(r.pts)) {
      if (E.len < 0.05) continue
      let keep: [number, number][] = [[0, 1]]
      for (const [c0, c1] of boundaryRanges(E.a, E.b, env.edges))
        keep = keep.flatMap(([k0, k1]): [number, number][] => [[k0, Math.min(k1, c0)], [Math.max(k0, c1), k1]]).filter(([k0, k1]) => k1 - k0 > 1e-9)
      for (const [k0, k1] of keep) {
        const p = along(E.a, E.dir, k0 * E.len)
        const q = along(E.a, E.dir, k1 * E.len)
        if (!inside([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2])) continue
        let th = Math.atan2(E.dir[1], E.dir[0])
        if (th < 0) th += Math.PI
        if (th > Math.PI - 0.002) th -= Math.PI
        let grp = groups.find((g) => Math.abs(g.th - th) < 0.002 && Math.abs(g.c - cross(g.u, p)) < 0.05)
        if (!grp) {
          const u: Pt = [Math.cos(th), Math.sin(th)]
          grp = { th, u, c: cross(u, p), iv: [] }
          groups.push(grp)
        }
        const s0 = dot(grp.u, p)
        const s1 = dot(grp.u, q)
        grp.iv.push([Math.min(s0, s1), Math.max(s0, s1)])
      }
    }
  const out: { a: Pt; b: Pt }[] = []
  for (const grp of groups) {
    const n: Pt = [-grp.u[1], grp.u[0]]
    for (const [s0, s1] of mergeRanges(grp.iv, 0.05)) {
      if (s1 - s0 <= 0.05) continue
      const pt = (s: number): Pt => [r4(grp.u[0] * s + n[0] * grp.c), r4(grp.u[1] * s + n[1] * grp.c)]
      out.push({ a: pt(s0), b: pt(s1) })
    }
  }
  return out
}

export interface Anchor {
  readonly edge: number
  readonly pos: number
  readonly d: number
}

/** The room edge nearest a point, with the point's place along it. */
export function anchorAt(room: Pick<Room, 'pts'>, pt: Pt): Anchor {
  const n = room.pts.length >= 3 ? G.nearestEdge(room.pts, pt) : null
  return n ? { edge: n.i, pos: n.t, d: n.d } : { edge: 0, pos: 0.5, d: Infinity }
}

export interface OpeningGeom {
  readonly room: number
  readonly edge: number
  readonly len: number
  readonly dir: Pt
  readonly nin: Pt
  /** Ends and centre of the opening on the room's edge. */
  readonly a: Pt
  readonly b: Pt
  readonly c: Pt
  /** On the envelope's outline (an outside wall). */
  readonly exterior: boolean
  /** The room on the other side, if any. */
  readonly neighbour: number | null
  /** Wall thickness there. */
  readonly t: number
  /** The wall band across the room edge: from off0 to off1 along the inward normal's opposite. */
  readonly off0: number
  readonly off1: number
  readonly hinge: Pt
  readonly jamb: Pt
  /** Direction the door swings into. */
  readonly swing: Pt
}

export function openingGeom(params: Params, fi: number, op: Opening, rooms: readonly Room[]): OpeningGeom | null {
  const room = rooms.find((r) => r.id === op.room)
  if (!room || room.pts.length < 3 || !(op.edge >= 0) || op.edge >= room.pts.length) return null
  const E = G.edges(room.pts)[op.edge]
  if (E.len < 1e-9) return null
  const s = op.pos * E.len
  const a = along(E.a, E.dir, s - op.width / 2)
  const b = along(E.a, E.dir, s + op.width / 2)
  const c = along(E.a, E.dir, s)
  const env = envelopeOf(params, fi)
  const exterior = onBoundary(c, E.dir, env.edges)
  const neighbour =
    rooms.find((R) => R.id !== room.id && R.pts.length >= 3 && G.edges(R.pts).some((F) => dot(F.dir, E.dir) < 0 && Math.abs(cross(F.dir, E.dir)) < 0.01 && G.distToSeg(c, F.a, F.b).d < G.ON))?.id ?? null
  // on a curved wall the room edge is a chord: stretch the opening across the smooth wall band
  let off0 = exterior ? 0 : -WALL.int / 2
  let off1 = exterior ? WALL.ext : WALL.int / 2
  const smooth = env.smooth
  if (exterior && smooth) {
    const sag = (p: Pt) => {
      let d = Infinity
      let ins = false
      for (const L of smooth) {
        d = Math.min(d, G.distToBoundary(L, p))
        if (G.pointInPoly(L, p[0], p[1])) ins = true
      }
      return d > 1 ? 0 : ins ? d : -d
    }
    const sg = [a, c, b].map(sag)
    off0 = -Math.max(0, ...sg)
    off1 = WALL.ext - Math.min(0, ...sg)
  }
  return {
    room: room.id,
    edge: op.edge,
    len: E.len,
    dir: E.dir,
    nin: E.nin,
    a,
    b,
    c,
    exterior,
    neighbour,
    t: exterior ? WALL.ext : WALL.int,
    off0,
    off1,
    hinge: op.flip ? b : a,
    jamb: op.flip ? a : b,
    swing: op.out ? [-E.nin[0], -E.nin[1]] : E.nin,
  }
}

export interface RoomInfo {
  readonly id: number
  readonly area: number
  readonly obb: G.Obb | null
  readonly label: Pt | null
  /** The room inside its walls (half an interior wall, a whole exterior wall), or null if that folds. */
  readonly net: Poly | null
  readonly edges: readonly { readonly exterior: boolean; readonly len: number }[]
}

export function roomInfo(params: Params, fi: number, room: Room): RoomInfo {
  const env = envelopeOf(params, fi)
  const edges = G.edges(room.pts).map((E) => ({ exterior: onBoundary(along(E.a, E.dir, E.len / 2), E.dir, env.edges), len: E.len }))
  return {
    id: room.id,
    area: G.area(room.pts),
    obb: G.obb(room.pts),
    label: G.labelPoint(room.pts),
    net: G.offsetPoly(room.pts, edges.map((e) => (e.exterior ? WALL.ext : WALL.int / 2))),
    edges,
  }
}

/** Where each opening sits, so it can be put back after its rooms change. */
export interface OpeningPlace {
  readonly c: Pt
  readonly nin: Pt
  readonly dir: Pt
}

export function captureOpenings(params: Params, fi: number, floor: Floor): Map<number, OpeningPlace> {
  const m = new Map<number, OpeningPlace>()
  for (const op of floor.openings) {
    const gm = openingGeom(params, fi, op, floor.rooms)
    if (gm) m.set(op.id, { c: gm.c, nin: gm.nin, dir: gm.dir })
  }
  return m
}

/**
 * Openings moved to the edges they sat on before the rooms changed: their
 * own room if it still has an edge within 0.75 ft, else the nearest room's;
 * an opening with no edge near is dropped (old reanchorOpenings).
 */
export function reanchorOpenings(params: Params, fi: number, floor: Floor, cap: Map<number, OpeningPlace>): Opening[] {
  return floor.openings.flatMap((op) => {
    const k = cap.get(op.id)
    if (!k) return [op]
    let room = floor.rooms.find((r) => r.id === op.room)
    let an = room ? anchorAt(room, k.c) : null
    if (!an || !(an.d <= 0.75)) {
      room = undefined
      an = null
      for (const r of floor.rooms) {
        const t = anchorAt(r, k.c)
        if (t.d <= 0.75 && (!an || t.d < an.d)) {
          an = t
          room = r
        }
      }
    }
    if (!room || !an) return []
    let next: Opening = { ...op, room: room.id, edge: an.edge, pos: r4(an.pos) }
    const gm = openingGeom(params, fi, next, floor.rooms)
    if (gm) {
      if (dot(gm.nin, k.nin) < 0) next = { ...next, out: !next.out }
      if (dot(gm.dir, k.dir) < 0) next = { ...next, flip: !next.flip }
    }
    return [next]
  })
}

export function furnitureInRoom(floor: Floor, room: Room) {
  return floor.furniture.filter((it) => G.pointInPoly(room.pts, it.x, it.z))
}

export interface FloorStats {
  readonly envArea: number
  readonly roomsArea: number
  readonly unassigned: number
  readonly porchArea: number
  readonly circArea: number
  readonly circPct: number
  readonly nRooms: number
}

export function floorStats(params: Params, fi: number, floor: Floor): FloorStats {
  const env = envelopeOf(params, fi)
  let roomsArea = 0
  let porchArea = 0
  let circArea = 0
  let nRooms = 0
  for (const r of floor.rooms) {
    const a = G.area(r.pts)
    if (r.type === 'porch') {
      porchArea += a
      continue
    }
    roomsArea += a
    nRooms++
    if (CIRCULATION.includes(r.type)) circArea += a
  }
  return {
    envArea: env.area,
    roomsArea,
    unassigned: Math.max(0, env.area - roomsArea),
    porchArea,
    circArea,
    circPct: roomsArea > 0 ? Math.round((100 * circArea) / roomsArea) : 0,
    nRooms,
  }
}

/** "Bedroom", then "Bedroom 2", "Bedroom 3"… on the floor. */
export function newRoomName(floor: Floor, type: RoomType): string {
  const n = floor.rooms.filter((r) => r.type === type).length
  return (TYPE_LABELS[type] ?? 'Room') + (n > 0 ? ` ${n + 1}` : '')
}
