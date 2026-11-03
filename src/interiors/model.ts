import * as G from './geom'
import type { Pt } from './geom'
import { anchorAt, fitRoom } from './rooms'
import {
  OPENING_DEFAULTS,
  OPENING_KINDS,
  ROOM_COLORS,
  TYPE_LABELS,
  type Floor,
  type Furniture,
  type Opening,
  type OpeningKind,
  type Room,
  type RoomType,
} from './types'

/**
 * Reading and tidying a cabin's stored floors (old INT.model: sanitise,
 * migrate, cleanFloor). Everything here returns new objects; nothing
 * changes the plan it is given.
 */

/** Rooms smaller than this are dropped, square feet. */
export const MIN_ROOM_AREA = 1
/** Openings keep this much clear of an edge's ends in total, feet. */
const EDGE_CLEAR = 0.2

type Raw = Record<string, unknown>
const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numOr = (v: unknown, d: number): number => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const okId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const isPts = (P: unknown): P is readonly (readonly number[])[] =>
  Array.isArray(P) && P.length >= 3 && P.every((p) => Array.isArray(p) && fin(Number(p[0])) && fin(Number(p[1])))

export const isRoomType = (t: unknown): t is RoomType => typeof t === 'string' && t in ROOM_COLORS
const isKind = (k: unknown): k is OpeningKind => (OPENING_KINDS as readonly unknown[]).includes(k)

/** Hands out ids above every id in a cabin's floors, as the old planner's counter does. */
export function idCounter(floors: readonly unknown[]): () => number {
  let max = 0
  for (const f of floors) {
    if (!isRecord(f)) continue
    for (const k of ['rooms', 'openings', 'furniture'])
      for (const it of Array.isArray(f[k]) ? (f[k] as unknown[]) : []) if (isRecord(it) && okId(it.id)) max = Math.max(max, it.id)
  }
  return () => ++max
}

/** Rotate a polygon to start at its back-left corner (least z, then least x), so a rectangle's edge 0 is its back. */
export function canonStart(P: readonly Pt[]): Pt[] {
  let k = 0
  for (let i = 1; i < P.length; i++) {
    const p = P[i]
    const q = P[k]
    if (p[1] < q[1] - 1e-6 || (Math.abs(p[1] - q[1]) <= 1e-6 && p[0] < q[0])) k = i
  }
  return [...P.slice(k), ...P.slice(0, k)]
}

export function cleanRoom(r: unknown, nextId: () => number): Room | null {
  if (!isRecord(r) || !isPts(r.pts)) return null
  const P = G.simplify(G.roundPts(G.ensureCCW(r.pts.map((p) => [Number(p[0]), Number(p[1])]))))
  if (!P.length || G.sarea(P) <= 0 || G.area(P) < MIN_ROOM_AREA) return null
  const type: RoomType = isRoomType(r.type) ? r.type : 'hall'
  const name = String(r.name == null || r.name === '' ? TYPE_LABELS[type] : r.name).slice(0, 40)
  return { id: okId(r.id) ? r.id : nextId(), name, type, pts: P }
}

export function cleanOpening(op: unknown, nextId: () => number): Opening | null {
  if (!isRecord(op)) return null
  const room = Number(op.room)
  const edge = Number(op.edge)
  if (!okId(room) || !Number.isInteger(edge) || edge < 0) return null
  const kind: OpeningKind = isKind(op.kind) ? op.kind : 'door'
  return {
    id: okId(op.id) ? op.id : nextId(),
    room,
    edge,
    pos: clamp(numOr(op.pos, 0.5), 0, 1),
    width: clamp(numOr(op.width, OPENING_DEFAULTS[kind]), 1, 20),
    kind,
    flip: !!op.flip,
    out: !!op.out,
  }
}

export function cleanFurniture(f: unknown, nextId: () => number): Furniture | null {
  if (!isRecord(f) || typeof f.type !== 'string' || !f.type) return null
  const x = Number(f.x)
  const z = Number(f.z)
  if (!fin(x) || !fin(z)) return null
  let rot = numOr(f.rot, 0) % 360
  if (rot < 0) rot += 360
  rot = r4(rot)
  if (rot >= 360) rot = 0
  return {
    ...f,
    id: okId(f.id) ? f.id : nextId(),
    type: f.type,
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
    rot,
    w: clamp(numOr(f.w, 2), 0.5, 30),
    d: clamp(numOr(f.d, 2), 0.5, 30),
    mirror: !!f.mirror,
  }
}

const roomsOf = (rooms: unknown): Room[] => (Array.isArray(rooms) ? rooms : []).filter((r): r is Room => isRecord(r) && isPts(r.pts))

/**
 * A floor with every item cleaned, ids unique, each opening fitted to its
 * edge (narrowed to leave 0.1 ft each end) and nudged to the nearest free
 * spot when it overlaps another on the same edge (old cleanFloor).
 */
export function cleanFloor(f: Floor | Raw, nextId: () => number): Floor {
  const seen = new Set<number>()
  const uniq = <T extends { id: number }>(it: T): T => {
    const out = seen.has(it.id) ? { ...it, id: nextId() } : it
    seen.add(out.id)
    return out
  }
  const rooms = (Array.isArray(f.rooms) ? f.rooms : []).flatMap((r) => cleanRoom(r, nextId) ?? []).map(uniq)
  const byId = new Map(rooms.map((r) => [r.id, r]))
  const placed = new Map<string, [number, number][]>()
  const openings: Opening[] = []
  for (const raw of Array.isArray(f.openings) ? f.openings : []) {
    const op = cleanOpening(raw, nextId)
    if (!op) continue
    const room = byId.get(op.room)
    if (!room || op.edge >= room.pts.length) continue
    const len = G.edges(room.pts)[op.edge].len
    const w = op.width > len - EDGE_CLEAR ? Math.round((len - EDGE_CLEAR) * 100) / 100 : op.width
    if (w < 1) continue
    const lo = w / 2
    const hi = len - w / 2
    let s = clamp(op.pos * len, lo, hi)
    const key = `${op.room}:${op.edge}`
    const taken = placed.get(key) ?? []
    const hits = (c: number) => taken.some(([s0, s1]) => c - w / 2 < s1 - 1e-6 && c + w / 2 > s0 + 1e-6)
    if (hits(s)) {
      const cands = taken.flatMap(([s0, s1]) => [s1 + w / 2, s0 - w / 2]).filter((c) => c >= lo - 1e-9 && c <= hi + 1e-9 && !hits(c))
      if (!cands.length) continue
      s = cands.reduce((best, c) => (Math.abs(c - s) < Math.abs(best - s) ? c : best))
    }
    taken.push([s - w / 2, s + w / 2])
    placed.set(key, taken)
    openings.push(uniq({ ...op, width: w, pos: r4(clamp(s / len, w / 2 / len, 1 - w / 2 / len)) }))
  }
  const furniture = (Array.isArray(f.furniture) ? f.furniture : []).flatMap((it) => cleanFurniture(it, nextId) ?? []).map(uniq)
  const flats = Array.isArray(f.flats) ? { flats: f.flats as Pt[] } : {}
  return { name: typeof f.name === 'string' ? f.name : 'Main floor', rooms, openings, furniture, ...flats }
}

export const newFloor = (name = 'Main floor'): Floor => ({ name, rooms: [], openings: [], furniture: [] })

/**
 * The cabin's floors as plan data, migrated from the old planner's older
 * forms the way its ensureFloors does: rectangle rooms {x, z, w, d} become
 * polygons fitted to the walls, and openings placed by side (n, e, s, w)
 * are anchored to the edge they sit on. A cabin with no floors gets an
 * empty main floor. The stored params are not changed; an edit writes the
 * migrated form back.
 */
export function readFloors(params: Record<string, unknown>): Floor[] {
  const stored = Array.isArray(params.floors) && params.floors.length ? (params.floors as unknown[]) : [newFloor()]
  const nextId = idCounter(stored)
  return stored.map((f0, fi): Floor => {
    const f: Raw = isRecord(f0) ? f0 : {}
    const name = typeof f.name === 'string' && f.name ? f.name : fi === 0 ? 'Main floor' : 'Upper floor'
    const rooms = Array.isArray(f.rooms) ? (f.rooms as unknown[]) : []
    const openings = Array.isArray(f.openings) ? (f.openings as unknown[]) : []
    const fast = rooms.every((r) => isRecord(r) && Array.isArray(r.pts)) && !openings.some((op) => isRecord(op) && op.side != null)
    const base = { ...f, name, rooms, openings, furniture: Array.isArray(f.furniture) ? f.furniture : [] }
    return cleanFloor(fast ? base : migrateFloor(params, fi, base, nextId), nextId)
  })
}

function migrateFloor(params: Record<string, unknown>, fi: number, f: Raw & { rooms: unknown[]; openings: unknown[] }, nextId: () => number): Raw {
  const legacy = new Map<number, { x: number; z: number; w: number; d: number }>()
  const rooms: Room[] = []
  for (const r of f.rooms) {
    if (!isRecord(r)) continue
    let rr: Raw = r
    if (!Array.isArray(r.pts)) {
      const x = Number(r.x)
      const z = Number(r.z)
      const w = Number(r.w)
      const d = Number(r.d)
      if (![x, z, w, d].every(fin) || w <= 0 || d <= 0) continue
      const type: RoomType = isRoomType(r.type) ? r.type : 'hall'
      const rect = G.rectPoly(x, z, w, d)
      const fit = fitRoom(params, fi, rect, type, okId(r.id) ? r.id : null, rooms)
      const { x: _x, z: _z, w: _w, d: _d, ...rest } = r
      rr = { ...rest, type, pts: fit.polys[0] ?? rect }
      if (okId(r.id)) legacy.set(r.id, { x, z, w, d })
    }
    const s = cleanRoom(rr, nextId)
    if (s) rooms.push(s)
  }
  const openings: Raw[] = []
  for (const op of f.openings) {
    if (!isRecord(op)) continue
    if (op.side == null) {
      openings.push(op)
      continue
    }
    const room = rooms.find((r) => r.id === Number(op.room))
    if (!room) continue
    let L = legacy.get(room.id)
    if (!L) {
      const b = G.bbox([room.pts])
      L = { x: (b.x1 + b.x2) / 2, z: (b.z1 + b.z2) / 2, w: b.w, d: b.d }
    }
    const kind: OpeningKind = isKind(op.kind) ? op.kind : 'door'
    const width = clamp(numOr(op.width, OPENING_DEFAULTS[kind]), 1, 20)
    const horiz = op.side === 'n' || op.side === 's'
    if (!horiz && op.side !== 'e' && op.side !== 'w') continue
    const len = horiz ? L.w : L.d
    const s = clamp(numOr(op.pos, 0.5) * len, Math.min(width / 2, len / 2), Math.max(len - width / 2, len / 2))
    const pt: Pt = horiz ? [L.x - L.w / 2 + s, op.side === 'n' ? L.z - L.d / 2 : L.z + L.d / 2] : [op.side === 'w' ? L.x - L.w / 2 : L.x + L.w / 2, L.z - L.d / 2 + s]
    const hingeOld: Pt = horiz ? [pt[0] - width / 2, pt[1]] : [pt[0], pt[1] - width / 2]
    const an = anchorAt(room, pt)
    if (!(an.d <= 1)) continue
    const E = G.edges(room.pts)[an.edge]
    const at = (t: number): Pt => [E.a[0] + E.dir[0] * t, E.a[1] + E.dir[1] * t]
    const a = at(an.pos * E.len - width / 2)
    const b = at(an.pos * E.len + width / 2)
    const { side: _side, ...rest } = op
    openings.push({ ...rest, edge: an.edge, pos: r4(an.pos), width, kind, out: false, flip: Math.hypot(hingeOld[0] - b[0], hingeOld[1] - b[1]) < Math.hypot(hingeOld[0] - a[0], hingeOld[1] - a[1]) })
  }
  return { ...f, rooms, openings }
}

export { roomsOf }
