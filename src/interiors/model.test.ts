import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { addRoom, deleteRoom, mergeRooms, moveRoom, moveWall, splitRooms } from './edits'
import { envelopeOf } from './envelope'
import * as G from './geom'
import { idCounter, readFloors } from './model'
import { fitRoom, floorStats, openingGeom, partitionSegments } from './rooms'
import type { Floor } from './types'

type Obj = { name: string; t: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes
const prow = all.find((s) => s.id === 'C')!.objects.find((o) => o.name === 'Gathering prow')!
// an octagon cabin stored the old planner's older way: rectangle rooms and an opening placed by side
const octagon = {
  w: 28, d: 28, h: 11, shape: 'oct',
  floors: [{
    name: 'Main floor',
    rooms: [{ id: 1, name: 'Kitchen', type: 'kitchen', x: 0, z: -2, w: 14, d: 12 }, { id: 2, name: 'Dining', type: 'dining', x: 0, z: 10, w: 14, d: 8 }],
    openings: [{ id: 3, room: 2, side: 's', pos: 0.5, width: 10, kind: 'slider' }],
    furniture: [],
  }],
}
const box = { w: 30, d: 20, h: 9, floors: [] as unknown[] }

describe('reading floor plans', () => {
  test("C's gathering cabin reads its rooms, openings and furniture from the scheme as they are", () => {
    const [f] = readFloors(prow)
    const raw = (prow.floors as Floor[])[0]
    expect(f.rooms.map((r) => r.name)).toEqual(raw.rooms.map((r) => r.name))
    expect(f.openings).toHaveLength(raw.openings.length)
    expect(f.furniture).toHaveLength(raw.furniture.length)
  })

  test('rectangle rooms become polygons fitted to the walls, and side openings are anchored to an edge', () => {
    const [f] = readFloors(octagon)
    const raw = octagon.floors[0]
    expect(f.rooms).toHaveLength(raw.rooms.length)
    expect(f.rooms.every((r) => r.pts.length >= 3)).toBe(true)
    expect(f.openings.length).toBeGreaterThan(0)
    expect(f.openings.every((op) => Number.isInteger(op.edge) && !('side' in op))).toBe(true)
    // nothing was written back: the stored rooms are still rectangles
    expect((raw.rooms[0] as Record<string, unknown>).pts).toBeUndefined()
  })

  test('a cabin with no plan gets an empty main floor', () => {
    expect(readFloors({ w: 10, d: 10 })).toEqual([{ name: 'Main floor', rooms: [], openings: [], furniture: [] }])
  })
})

describe('the envelope', () => {
  test('a plain box cabin is one tile of its own area', () => {
    const env = envelopeOf(box, 0)
    expect(env.area).toBeCloseTo(600, 6)
    expect(env.loops).toHaveLength(1)
  })

  test("C's gathering cabin's floor matches its main walls; porches and the deck are open, its stair is access", () => {
    const env = envelopeOf(prow, 0)
    expect(env.area).toBeGreaterThan(500)
    expect(env.open.length).toBeGreaterThan(0)
    expect(env.access).toHaveLength(1)
  })
})

describe('fitting and editing rooms', () => {
  const next = idCounter([])
  const empty: Floor = { name: 'Main floor', rooms: [], openings: [], furniture: [] }

  test('a room drawn past the walls is trimmed to them', () => {
    const fit = fitRoom(box, 0, G.rectPoly(12, 0, 16, 10), 'bedroom', null, [])
    expect(fit.clipped).toBe(true)
    // x 4 to 20 cut at the wall at 15
    expect(G.area(fit.polys[0])).toBeCloseTo(11 * 10, 6)
  })

  test('a new room never overlaps one already there, and the walls between them become one partition', () => {
    const a = addRoom(box, 0, empty, G.rectPoly(-7.5, 0, 15, 20), 'living', 'Living', next)
    if (!a.ok) throw new Error(a.message)
    const b = addRoom(box, 0, a.floor, G.rectPoly(0, 0, 20, 20), 'bedroom', 'Bedroom', next)
    if (!b.ok) throw new Error(b.message)
    expect(b.floor.rooms).toHaveLength(2)
    expect(G.area(b.floor.rooms[1].pts)).toBeCloseTo(10 * 20, 6)
    const parts = partitionSegments(box, 0, b.floor.rooms)
    // the shared wall at x 0, and the bedroom's open side at x 10
    expect(parts.map((s) => [s.a[0], s.b[0], Math.abs(s.a[1] - s.b[1])]).sort((x, y) => x[0] - y[0])).toEqual([[0, 0, 20], [10, 10, 20]])
    expect(floorStats(box, 0, b.floor).unassigned).toBeCloseTo(600 - 300 - 200, 6)
  })

  test('split, merge, move a wall, move and delete each keep the rooms inside the walls', () => {
    const a = addRoom(box, 0, empty, G.rectPoly(0, 0, 30, 20), 'living', 'Living', next)
    if (!a.ok) throw new Error(a.message)
    const id = a.floor.rooms[0].id
    const s = splitRooms(box, 0, a.floor, [5, -15], [5, 15], next)
    if (!s.ok) throw new Error(s.message)
    expect(s.floor.rooms.map((r) => G.area(r.pts)).sort((x, y) => x - y)).toEqual([200, 400])
    const small = s.floor.rooms.find((r) => r.id !== id)!
    const big = s.floor.rooms.find((r) => r.id === id)!
    const wall = G.edges(big.pts).findIndex((e) => Math.abs(e.a[0] - 5) < 1e-6 && Math.abs(e.b[0] - 5) < 1e-6)
    // out of the big room (against its inward normal) by 2 ft
    const w = moveWall(box, 0, s.floor, id, wall, -2, next)
    if (!w.ok) throw new Error(w.message)
    expect(w.floor.rooms.map((r) => G.area(r.pts)).sort((x, y) => x - y)).toEqual([160, 440])
    const m = mergeRooms(box, 0, w.floor, id, small.id, next)
    if (!m.ok) throw new Error(m.message)
    expect(m.floor.rooms).toHaveLength(1)
    expect(G.area(m.floor.rooms[0].pts)).toBeCloseTo(600, 6)
    expect(moveRoom(box, 0, m.floor, id, 40, 0, next)).toEqual({ ok: false, message: 'No room there' })
    const d = deleteRoom(m.floor, id, next)
    expect(d.ok && d.floor.rooms).toEqual([])
  })

  test("C's gathering openings lie on their room's edges, some on outside walls and some inside", () => {
    const [f] = readFloors(prow)
    const geoms = f.openings.map((op) => openingGeom(prow, 0, op, f.rooms))
    expect(geoms.every(Boolean)).toBe(true)
    expect(geoms.some((g) => g!.exterior)).toBe(true)
    expect(geoms.some((g) => !g!.exterior)).toBe(true)
  })
})
