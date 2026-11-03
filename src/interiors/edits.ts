import * as G from './geom'
import type { Poly, Pt } from './geom'
import { cleanFloor } from './model'
import { captureOpenings, fitRoom, newRoomName, reanchorOpenings, type OpeningPlace } from './rooms'
import { OPENING_DEFAULTS, type Floor, type Furniture, type FurnitureBase, type Opening, type OpeningKind, type Room, type RoomType } from './types'

/**
 * Floor plan edits as pure functions, ported from the old interior
 * editor's commits (commitRoom, commitSplit, doMerge, finishVertex,
 * finishEdge, commitMove, deleteRoom, dblEdit). Each returns the new floor
 * and what to select, or the old editor's message when it refuses.
 */

type Params = Record<string, unknown>

export type EditResult =
  | { readonly ok: true; readonly floor: Floor; readonly select?: Selection }
  | { readonly ok: false; readonly message: string }

export interface Selection {
  readonly room?: number
  readonly opening?: number
  readonly furniture?: number
}

/** Rooms drawn smaller than this are refused, square feet. */
const MIN_DRAWN_AREA = 4
/** A moved room must keep at least this share of its area. */
const MIN_MOVED_SHARE = 0.5
/** Room corners closer than this to a dragged wall move with it, feet. */
const ON_WALL = 0.05

const r2 = (v: number) => Math.round(v * 100) / 100
const fail = (message: string): EditResult => ({ ok: false, message })
const done = (floor: Floor, nextId: () => number, select?: Selection): EditResult => ({ ok: true, floor: cleanFloor(floor, nextId), select })

const withRoom = (floor: Floor, id: number, f: (r: Room) => Room): Floor => ({ ...floor, rooms: floor.rooms.map((r) => (r.id === id ? f(r) : r)) })

/** Re-anchor every opening to where it sat before the rooms changed. */
const reanchor = (params: Params, fi: number, floor: Floor, cap: Map<number, OpeningPlace>): Floor => ({ ...floor, openings: reanchorOpenings(params, fi, floor, cap) })

export function addRoom(params: Params, fi: number, floor: Floor, pts: readonly Pt[], type: RoomType, name: string, nextId: () => number): EditResult {
  if (!(G.area(pts) >= MIN_DRAWN_AREA)) return fail('Too small for a room')
  const res = fitRoom(params, fi, pts, type, null, floor.rooms)
  if (res.hole) return fail("A room can't wrap around another room — draw it in two parts.")
  if (!res.polys.length) return fail('Nothing left to fill there — rooms can’t overlap or leave the walls.')
  let k = 1
  const made = res.polys.flatMap((P, i): Room[] => (i > 0 && G.area(P) < MIN_DRAWN_AREA ? [] : [{ id: nextId(), name: (i ? `${name} ${++k}` : name).slice(0, 40), type, pts: P }]))
  return done({ ...floor, rooms: [...floor.rooms, ...made] }, nextId, { room: made[0].id })
}

/** How many edges of P the segment a–b crosses. */
function crossings(P: readonly Pt[], a: Pt, b: Pt): number {
  let n = 0
  for (let i = 0; i < P.length; i++) if (G.segIntersect(a, b, P[i], P[(i + 1) % P.length])) n++
  return n
}

/** Split every room the line a–b crosses right across (or the one room both ends lie in). */
export function splitRooms(params: Params, fi: number, floor: Floor, a: Pt, b: Pt, nextId: () => number): EditResult {
  let targets = floor.rooms.filter((r) => crossings(r.pts, a, b) >= 2)
  if (!targets.length) {
    const r = floor.rooms.find((r) => G.pointInPoly(r.pts, a[0], a[1]) && G.pointInPoly(r.pts, b[0], b[1]))
    if (r) targets = [r]
  }
  const plans = targets.flatMap((r) => {
    const s = G.splitByLine(r.pts, a, b)
    if (!s.left.length || !s.right.length || G.area(s.left[0]) < MIN_DRAWN_AREA || G.area(s.right[0]) < MIN_DRAWN_AREA) return []
    return [{ r, pieces: [...s.left, ...s.right].filter((P) => G.area(P) >= 1).sort((p, q) => G.area(q) - G.area(p)) }]
  })
  if (!plans.length) return fail('Drag the line right across a room to split it')
  const cap = captureOpenings(params, fi, floor)
  let next = floor
  const made: Room[] = []
  for (const { r, pieces } of plans) {
    next = withRoom(next, r.id, (x) => ({ ...x, pts: pieces[0] }))
    for (const P of pieces.slice(1)) {
      const nr: Room = { id: nextId(), name: newRoomName(next, r.type), type: r.type, pts: P }
      next = { ...next, rooms: [...next.rooms, nr] }
      made.push(nr)
    }
  }
  const small = [...made].sort((p, q) => G.area(p.pts) - G.area(q.pts))[0]
  return done(reanchor(params, fi, next, cap), nextId, small ? { room: small.id } : undefined)
}

/** Merge room b into room a; they must share a wall. Openings in the wall between them go. */
export function mergeRooms(params: Params, fi: number, floor: Floor, aid: number, bid: number, nextId: () => number): EditResult {
  const A = floor.rooms.find((r) => r.id === aid)
  const B = floor.rooms.find((r) => r.id === bid)
  if (!A || !B || aid === bid) return fail('Pick two rooms to merge')
  const U = G.unionPieces([...G.toPieces(A.pts), ...G.toPieces(B.pts)])
  if (U.outer.length !== 1 || U.holes.length) return fail('Rooms must share a wall to merge')
  const cap = captureOpenings(params, fi, floor)
  const shared = G.sharedSegments(A.pts, B.pts)
  const openings = floor.openings
    .filter((op) => {
      if (op.room !== aid && op.room !== bid) return true
      const e = cap.get(op.id)
      return !(e && shared.some((s) => G.distToSeg(e.c, s.a, s.b).d < G.ON))
    })
    .map((op) => (op.room === bid ? { ...op, room: aid } : op))
  const next: Floor = { ...floor, rooms: floor.rooms.filter((r) => r.id !== bid).map((r) => (r.id === aid ? { ...r, pts: U.outer[0] } : r)), openings }
  return done(reanchor(params, fi, next, cap), nextId, { room: aid })
}

/** Remove a room with its openings and the furniture standing in it. */
export function deleteRoom(floor: Floor, id: number, nextId: () => number): EditResult {
  const r = floor.rooms.find((x) => x.id === id)
  if (!r) return fail('No such room')
  return done(
    {
      ...floor,
      rooms: floor.rooms.filter((x) => x.id !== id),
      openings: floor.openings.filter((op) => op.room !== id),
      furniture: floor.furniture.filter((it) => !G.pointInPoly(r.pts, it.x, it.z)),
    },
    nextId,
    {},
  )
}

/** Move a room (with its furniture and openings) by dx, dz feet. */
export function moveRoom(params: Params, fi: number, floor: Floor, id: number, dx: number, dz: number, nextId: () => number): EditResult {
  const r = floor.rooms.find((x) => x.id === id)
  if (!r) return fail('No such room')
  const res = fitRoom(params, fi, G.translate(r.pts, dx, dz), r.type, id, floor.rooms)
  if (!res.polys.length || res.hole || G.area(res.polys[0]) < MIN_MOVED_SHARE * G.area(r.pts)) return fail('No room there')
  const cap = captureOpenings(params, fi, floor)
  for (const op of floor.openings) {
    const e = op.room === id ? cap.get(op.id) : undefined
    if (e) cap.set(op.id, { ...e, c: [e.c[0] + dx, e.c[1] + dz] })
  }
  const inRoom = new Set(floor.furniture.filter((it) => G.pointInPoly(r.pts, it.x, it.z)).map((it) => it.id))
  const next: Floor = {
    ...withRoom(floor, id, (x) => ({ ...x, pts: res.polys[0] })),
    furniture: floor.furniture.map((it) => (inRoom.has(it.id) ? { ...it, x: r2(it.x + dx), z: r2(it.z + dz) } : it)),
  }
  return done(reanchor(params, fi, next, cap), nextId, { room: id })
}

/** Put corner i of a room at p (its outline may already hold a corner just inserted on an edge). */
export function moveCorner(params: Params, fi: number, floor: Floor, id: number, pts: readonly Pt[], i: number, p: Pt, nextId: () => number): EditResult {
  const moved = pts.map((q, k): Pt => (k === i ? [r2(p[0]), r2(p[1])] : [q[0], q[1]]))
  const r = floor.rooms.find((x) => x.id === id)
  if (!r) return fail('No such room')
  const res = fitRoom(params, fi, moved, r.type, id, floor.rooms)
  if (!res.polys.length || res.hole) return fail("That corner can't go there")
  const cap = captureOpenings(params, fi, floor)
  return done(reanchor(params, fi, withRoom(floor, id, (x) => ({ ...x, pts: res.polys[0] })), cap), nextId, { room: id })
}

/** A room outline with a new corner on edge i at q (none when q is within 0.1 ft of a corner). */
export function withCornerOnEdge(pts: readonly Pt[], i: number, q: Pt): Pt[] | null {
  const a = pts[i]
  const b = pts[(i + 1) % pts.length]
  const qq: Pt = [r2(q[0]), r2(q[1])]
  if (Math.hypot(qq[0] - a[0], qq[1] - a[1]) < 0.1 || Math.hypot(qq[0] - b[0], qq[1] - b[1]) < 0.1) return null
  return [...pts.slice(0, i + 1), qq, ...pts.slice(i + 1)] as Pt[]
}

export function removeCorner(params: Params, fi: number, floor: Floor, id: number, i: number, nextId: () => number): EditResult {
  const r = floor.rooms.find((x) => x.id === id)
  if (!r) return fail('No such room')
  if (r.pts.length <= 3) return fail('A room needs at least 3 corners')
  const res = fitRoom(params, fi, r.pts.filter((_, k) => k !== i), r.type, id, floor.rooms)
  if (!res.polys.length || res.hole) return fail("That corner can't be removed")
  const cap = captureOpenings(params, fi, floor)
  return done(reanchor(params, fi, withRoom(floor, id, (x) => ({ ...x, pts: res.polys[0] })), cap), nextId, { room: id })
}

/** The rooms (and which of their corners) lying on edge `edge` of room `id`: they move with it. */
export function wallMovers(floor: Floor, id: number, edge: number): Map<number, number[]> {
  const r = floor.rooms.find((x) => x.id === id)
  const movers = new Map<number, number[]>()
  if (!r) return movers
  const a = r.pts[edge]
  const b = r.pts[(edge + 1) % r.pts.length]
  for (const x of floor.rooms) {
    const idx = x.pts.flatMap((v, k) => (G.distToSeg(v, a, b).d < ON_WALL ? [k] : []))
    if (idx.length) movers.set(x.id, idx)
  }
  return movers
}

/** The rooms as they look with a wall moved by `del` feet along its inward normal (for the drag preview). */
export function movedWall(floor: Floor, id: number, edge: number, del: number): Room[] {
  const r = floor.rooms.find((x) => x.id === id)
  if (!r) return [...floor.rooms]
  const nin = G.edges(r.pts)[edge].nin
  const movers = wallMovers(floor, id, edge)
  return floor.rooms.map((x) => {
    const idx = movers.get(x.id)
    return idx ? { ...x, pts: x.pts.map((q, k): Pt => (idx.includes(k) ? [r2(q[0] + nin[0] * del), r2(q[1] + nin[1] * del)] : q)) } : x
  })
}

/** Move one wall of a room, and the rooms on the other side of it, by `del` feet (old finishEdge). */
export function moveWall(params: Params, fi: number, floor: Floor, id: number, edge: number, del: number, nextId: () => number): EditResult {
  const movers = wallMovers(floor, id, edge)
  const rooms = movedWall(floor, id, edge, del)
  const fitted: Room[] = []
  for (const x of rooms) {
    if (!movers.has(x.id)) {
      fitted.push(x)
      continue
    }
    const res = fitRoom(params, fi, x.pts, x.type, x.id, [])
    if (!res.polys.length) return fail("That wall can't go there")
    fitted.push({ ...x, pts: res.polys[0] })
  }
  const cap = captureOpenings(params, fi, floor)
  return done(reanchor(params, fi, { ...floor, rooms: fitted }, cap), nextId, { room: id })
}

export function setRoom(floor: Floor, id: number, patch: { readonly name?: string; readonly type?: RoomType }, nextId: () => number): EditResult {
  if (!floor.rooms.some((r) => r.id === id)) return fail('No such room')
  return done(withRoom(floor, id, (r) => ({ ...r, ...patch, name: (patch.name ?? r.name).slice(0, 40) })), nextId, { room: id })
}

// ---------- openings

/** A new opening of `kind` at t (0–1) along a room edge, as wide as fits (old openingAt). */
export function newOpening(room: Room, edge: number, t: number, kind: OpeningKind): Omit<Opening, 'id'> | null {
  const len = G.edges(room.pts)[edge]?.len ?? 0
  let w = OPENING_DEFAULTS[kind]
  if (w > len - 0.2) w = Math.floor((len - 0.2) * 2) / 2
  if (w < 1) return null
  const pos = w >= len ? 0.5 : Math.max(w / 2 / len, Math.min(1 - w / 2 / len, t))
  return { room: room.id, edge, pos, width: w, kind, flip: false, out: false }
}

export function addOpening(floor: Floor, op: Omit<Opening, 'id'>, nextId: () => number): EditResult {
  const id = nextId()
  const res = done({ ...floor, openings: [...floor.openings, { ...op, id }] }, nextId, { opening: id })
  return res.ok && !res.floor.openings.some((o) => o.id === id) ? fail('No space on that wall') : res
}

export function updateOpening(floor: Floor, id: number, patch: Partial<Omit<Opening, 'id'>>, nextId: () => number): EditResult {
  if (!floor.openings.some((o) => o.id === id)) return fail('No such opening')
  return done({ ...floor, openings: floor.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }, nextId, { opening: id })
}

export function deleteOpening(floor: Floor, id: number, nextId: () => number): EditResult {
  return done({ ...floor, openings: floor.openings.filter((o) => o.id !== id) }, nextId, {})
}

// ---------- furniture

export function addFurniture(floor: Floor, it: FurnitureBase, nextId: () => number): EditResult {
  const id = nextId()
  return done({ ...floor, furniture: [...floor.furniture, { ...it, id } as Furniture] }, nextId, { furniture: id })
}

export function updateFurniture(floor: Floor, id: number, patch: Partial<Furniture>, nextId: () => number): EditResult {
  if (!floor.furniture.some((f) => f.id === id)) return fail('No such piece')
  return done({ ...floor, furniture: floor.furniture.map((f) => (f.id === id ? ({ ...f, ...patch, id } as Furniture) : f)) }, nextId, { furniture: id })
}

export function deleteFurniture(floor: Floor, id: number, nextId: () => number): EditResult {
  return done({ ...floor, furniture: floor.furniture.filter((f) => f.id !== id) }, nextId, {})
}

/** A copy 1 ft down and right of the original, selected. */
export function duplicateFurniture(floor: Floor, id: number, nextId: () => number): EditResult {
  const f = floor.furniture.find((x) => x.id === id)
  if (!f) return fail('No such piece')
  return addFurniture(floor, { ...f, x: r2(f.x + 1), z: r2(f.z + 1) }, nextId)
}

export type { Poly }
