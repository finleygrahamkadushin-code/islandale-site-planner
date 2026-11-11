import { describe, expect, test } from 'vitest'
import {
  addOpening,
  addRoom,
  deleteRoom,
  mergeRooms,
  moveCorner,
  moveRoom,
  moveWall,
  movedWall,
  newOpening,
  removeCorner,
  splitRooms,
  wallMovers,
  withCornerOnEdge,
  type EditResult,
} from './edits'
import * as G from './geom'
import type { Pt } from './geom'
import { idCounter } from './model'
import { openingGeom } from './rooms'
import type { Floor, Room } from './types'

/** A plain 30 × 20 ft cabin: x −15…15, z −10…10. */
const box = { w: 30, d: 20, h: 9, floors: [] as unknown[] }
const empty: Floor = { name: 'Main floor', rooms: [], openings: [], furniture: [] }

const ok = (r: EditResult): Floor => {
  if (!r.ok) throw new Error(r.message)
  return r.floor
}
const areas = (f: Floor) => f.rooms.map((r) => G.area(r.pts)).sort((x, y) => x - y)
const total = (f: Floor) => f.rooms.reduce((s, r) => s + G.area(r.pts), 0)
const room = (f: Floor, name: string): Room => f.rooms.find((r) => r.name === name)!
const at = (r: Room, x: number, z: number) => r.pts.findIndex((p) => p[0] === x && p[1] === z)
/** The edge of a room lying on the line x = v. */
const edgeAtX = (r: Room, v: number) => G.edges(r.pts).findIndex((e) => Math.abs(e.a[0] - v) < 1e-6 && Math.abs(e.b[0] - v) < 1e-6)
/** Area two rooms share. */
const overlap = (a: Room, b: Room) => G.area(a.pts) - G.subtractRegion(G.toPieces(a.pts), b.pts).reduce((s, p) => s + G.area(p), 0)

/** Rooms drawn one after the other, each a rectangle x0…x1, full depth unless z is given. */
function plan(next: () => number, ...rects: [string, number, number, number?, number?][]): Floor {
  return rects.reduce((f, [name, x0, x1, z0 = -10, z1 = 10]) => ok(addRoom(box, 0, f, G.rectFrom2([x0, z0], [x1, z1]), 'bedroom', name, next)), empty)
}

describe('adding rooms', () => {
  test('a room drawn inside the walls is kept as drawn, named and selected', () => {
    const next = idCounter([])
    const r = addRoom(box, 0, empty, G.rectFrom2([-15, -10], [0, 10]), 'living', 'Living', next)
    const f = ok(r)
    expect(f.rooms).toHaveLength(1)
    expect(f.rooms[0]).toMatchObject({ name: 'Living', type: 'living' })
    expect(G.area(f.rooms[0].pts)).toBeCloseTo(300, 6)
    expect(r.ok && r.select).toEqual({ room: f.rooms[0].id })
  })

  test('too small, outside the walls, or on top of another room is refused with the reason', () => {
    const next = idCounter([])
    expect(addRoom(box, 0, empty, G.rectPoly(0, 0, 1, 1), 'bedroom', 'B', next)).toEqual({ ok: false, message: 'Too small for a room' })
    expect(addRoom(box, 0, empty, G.rectPoly(100, 0, 10, 10), 'bedroom', 'B', next)).toMatchObject({ ok: false, message: expect.stringMatching(/rooms can’t overlap/) })
    const f = plan(next, ['A', -15, 15])
    expect(addRoom(box, 0, f, G.rectPoly(0, 0, 10, 10), 'bedroom', 'B', next)).toMatchObject({ ok: false })
  })

  test('a room drawn around another is refused: it would wrap it', () => {
    const next = idCounter([])
    const f = plan(next, ['Core', -2, 2, -2, 2])
    expect(addRoom(box, 0, f, G.rectFrom2([-10, -8], [10, 8]), 'living', 'Ring', next)).toMatchObject({ ok: false, message: expect.stringMatching(/wrap around/) })
  })

  test('a room drawn across another is cut into the parts left over, named in turn', () => {
    const next = idCounter([])
    const f = plan(next, ['Middle', -2, 2])
    const g = ok(addRoom(box, 0, f, G.rectFrom2([-10, -10], [10, 10]), 'bedroom', 'Bed', next))
    expect(g.rooms.map((r) => r.name).sort()).toEqual(['Bed', 'Bed 2', 'Middle'])
    expect(total(g)).toBeCloseTo(400, 6)
  })
})

describe('splitting and merging', () => {
  test('a line right across a room splits it, the smaller piece new and selected', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 15])
    const r = splitRooms(box, 0, f, [5, -12], [5, 12], next)
    const g = ok(r)
    expect(areas(g)).toEqual([200, 400])
    const small = g.rooms.find((x) => G.area(x.pts) < 300)!
    expect(r.ok && r.select).toEqual({ room: small.id })
    expect(g.rooms.find((x) => x.id === f.rooms[0].id)!.pts).toHaveLength(4)
  })

  test('a line that misses or only grazes a room is refused', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0])
    expect(splitRooms(box, 0, f, [5, -12], [5, 12], next)).toEqual({ ok: false, message: 'Drag the line right across a room to split it' })
    // a sliver under 4 sf
    expect(splitRooms(box, 0, f, [-0.1, -12], [-0.1, 12], next)).toMatchObject({ ok: false })
  })

  test('one line splits every room it crosses', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0], ['B', 0, 15])
    const g = ok(splitRooms(box, 0, f, [-16, 0], [16, 0], next))
    expect(g.rooms).toHaveLength(4)
    expect(areas(g)).toEqual([150, 150, 150, 150])
  })

  test('two rooms sharing a wall merge into one; the door between them goes, an outside window stays', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, 0], ['B', 0, 15])
    const A = room(f0, 'A')
    const B = room(f0, 'B')
    const between = ok(addOpening(f0, newOpening(A, edgeAtX(A, 0), 0.5, 'door')!, next))
    const f = ok(addOpening(between, newOpening(B, edgeAtX(B, 15), 0.5, 'window')!, next))
    const g = ok(mergeRooms(box, 0, f, A.id, B.id, next))
    expect(g.rooms).toHaveLength(1)
    expect(G.area(g.rooms[0].pts)).toBeCloseTo(600, 6)
    expect(g.openings.map((o) => o.kind)).toEqual(['window'])
    expect(g.openings[0].room).toBe(A.id)
  })

  test('rooms that do not touch are not merged', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, -5], ['B', 5, 15])
    expect(mergeRooms(box, 0, f, room(f, 'A').id, room(f, 'B').id, next)).toEqual({ ok: false, message: 'Rooms must share a wall to merge' })
    expect(mergeRooms(box, 0, f, room(f, 'A').id, room(f, 'A').id, next)).toMatchObject({ ok: false })
  })
})

describe('moving walls, corners and rooms', () => {
  test('the rooms on a shared wall both move with it, and stay inside the walls', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0], ['B', 0, 15])
    const A = room(f, 'A')
    expect([...wallMovers(f, A.id, edgeAtX(A, 0)).keys()].sort()).toEqual([A.id, room(f, 'B').id].sort())
    // A's inward normal on that wall points to −x, so −3 pushes it 3 ft into B
    const g = ok(moveWall(box, 0, f, A.id, edgeAtX(A, 0), -3, next))
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(360, 6)
    expect(G.area(room(g, 'B').pts)).toBeCloseTo(240, 6)
  })

  test('the drag preview shows the same rooms the move commits', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0], ['B', 0, 15])
    const A = room(f, 'A')
    const pre = movedWall(f, A.id, edgeAtX(A, 0), -3)
    expect(pre.map((r) => G.area(r.pts)).sort((x, y) => x - y)).toEqual([240, 360])
  })

  test('an outside wall dragged past the cabin wall stops at it', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -10, 0])
    const A = room(f, 'A')
    // A's left wall at x −10, inward normal +x: −8 would take it to −18, past the cabin wall at −15
    const g = ok(moveWall(box, 0, f, A.id, edgeAtX(A, -10), -8, next))
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(300, 6)
  })

  test('a corner dragged inside the walls reshapes the room; a door on another wall stays where it was', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, 0])
    const A = room(f0, 'A')
    const f = ok(addOpening(f0, newOpening(A, edgeAtX(A, -15), 0.5, 'door')!, next))
    const before = openingGeom(box, 0, f.openings[0], f.rooms)!.c
    const g = ok(moveCorner(box, 0, f, A.id, A.pts, at(A, 0, 10), [-3, 10], next))
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(300 - (3 * 20) / 2, 6)
    const after = openingGeom(box, 0, g.openings[0], g.rooms)!.c
    expect(after[0]).toBeCloseTo(before[0], 6)
    expect(after[1]).toBeCloseTo(before[1], 6)
  })

  test('a corner added on an edge, then dragged in, makes a five-sided room', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0])
    const A = room(f, 'A')
    const e = edgeAtX(A, 0)
    expect(withCornerOnEdge(A.pts, e, A.pts[e])).toBeNull()
    const pts = withCornerOnEdge(A.pts, e, [0, 0])!
    expect(pts).toHaveLength(5)
    const g = ok(moveCorner(box, 0, f, A.id, pts, e + 1, [-3, 0], next))
    expect(room(g, 'A').pts).toHaveLength(5)
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(300 - 30, 6)
  })

  test('a corner dragged into a neighbour is stopped at the neighbour', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0], ['B', 0, 15])
    const A = room(f, 'A')
    const g = ok(moveCorner(box, 0, f, A.id, A.pts, at(A, 0, 10), [5, 10], next))
    expect(overlap(room(g, 'A'), room(g, 'B'))).toBeLessThan(0.5)
  })

  test('removing a corner takes the room back to the corners left; a triangle keeps its three', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0])
    const A = room(f, 'A')
    const g = ok(removeCorner(box, 0, f, A.id, 0, next))
    expect(room(g, 'A').pts).toHaveLength(3)
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(150, 6)
    expect(removeCorner(box, 0, g, A.id, 0, next)).toEqual({ ok: false, message: 'A room needs at least 3 corners' })
  })

  test('a room moves with its furniture; it cannot leave the cabin', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, -5, -10, 0])
    const A = room(f0, 'A')
    const withBed: Floor = { ...f0, furniture: [{ id: next(), type: 'queen', x: -10, z: -5, rot: 0, w: 5, d: 6.67, mirror: false }] }
    const g = ok(moveRoom(box, 0, withBed, A.id, 5, 5, next))
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(100, 6)
    expect(g.furniture[0]).toMatchObject({ x: -5, z: 0 })
    expect(moveRoom(box, 0, g, A.id, 100, 0, next)).toEqual({ ok: false, message: 'No room there' })
  })

  test('deleting a room takes its openings and the furniture standing in it', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, 0], ['B', 0, 15])
    const A = room(f0, 'A')
    const f1 = ok(addOpening(f0, newOpening(A, edgeAtX(A, -15), 0.5, 'door')!, next))
    const bed = (x: number) => ({ id: next(), type: 'queen', x, z: 0, rot: 0, w: 5, d: 6.67, mirror: false })
    const f: Floor = { ...f1, furniture: [bed(-7), bed(7)] }
    const g = ok(deleteRoom(f, A.id, next))
    expect(g.rooms.map((r) => r.name)).toEqual(['B'])
    expect(g.openings).toEqual([])
    expect(g.furniture.map((it) => it.x)).toEqual([7])
  })
})

describe('openings follow their walls through edits', () => {
  test('after a split, a door keeps its place on the wall and moves to the room it now belongs to', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, 15])
    const A = room(f0, 'A')
    // a door on the front wall (z −10), on the right of the coming split
    const front = G.edges(A.pts).findIndex((e) => Math.abs(e.a[1] + 10) < 1e-6 && Math.abs(e.b[1] + 10) < 1e-6)
    const f = ok(addOpening(f0, newOpening(A, front, 0.8, 'door')!, next))
    const c0 = openingGeom(box, 0, f.openings[0], f.rooms)!.c
    expect(c0[0]).toBeGreaterThan(0)
    const g = ok(splitRooms(box, 0, f, [0, -12], [0, 12], next))
    const gm = openingGeom(box, 0, g.openings[0], g.rooms)!
    expect(gm.c[0]).toBeCloseTo(c0[0], 6)
    expect(gm.c[1]).toBeCloseTo(c0[1], 6)
    const owner = g.rooms.find((r) => r.id === g.openings[0].room)!
    expect(G.pointInPoly(owner.pts, c0[0], c0[1] + 1)).toBe(true)
  })

  test('after a shared wall moves, the door in it is carried along and keeps its swing', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, 0], ['B', 0, 15])
    const A = room(f0, 'A')
    const f = ok(addOpening(f0, newOpening(A, edgeAtX(A, 0), 0.5, 'door')!, next))
    const g0 = openingGeom(box, 0, f.openings[0], f.rooms)!
    // half a foot: within the 0.75 ft the door looks for its wall
    const g = ok(moveWall(box, 0, f, A.id, edgeAtX(A, 0), -0.5, next))
    expect(g.openings).toHaveLength(1)
    const gm = openingGeom(box, 0, g.openings[0], g.rooms)!
    expect(gm.c[0]).toBeCloseTo(0.5, 6)
    expect(gm.c[1]).toBeCloseTo(g0.c[1], 6)
    expect(gm.swing[0] * g0.swing[0] + gm.swing[1] * g0.swing[1]).toBeGreaterThan(0)
  })
})

describe('edits that would break the plan are refused (R5.1, R5.2)', () => {
  test('a wall dragged into another room is refused, not left overlapping it', () => {
    const next = idCounter([])
    // the review probe: A x −15…−7, C x −3…5, A's right wall dragged 8 ft (to x 1, 4 ft into C)
    const f = plan(next, ['A', -15, -7], ['C', -3, 5])
    const A = room(f, 'A')
    const r = moveWall(box, 0, f, A.id, edgeAtX(A, -7), -8, next)
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/another room/) })
  })

  test('a wall dragged up to a neighbour, not into it, is fine', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, -7], ['C', -3, 5])
    const A = room(f, 'A')
    const g = ok(moveWall(box, 0, f, A.id, edgeAtX(A, -7), -4, next))
    expect(G.area(room(g, 'A').pts)).toBeCloseTo(12 * 20, 6)
    expect(overlap(room(g, 'A'), room(g, 'C'))).toBeLessThan(0.5)
  })

  test('a shared wall dragged right through the room beyond is refused', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, 0], ['B', 0, 5])
    const A = room(f, 'A')
    // B is 5 ft wide: 8 ft would turn it inside out over A
    expect(moveWall(box, 0, f, A.id, edgeAtX(A, 0), -8, next)).toMatchObject({ ok: false })
  })

  test('a plan that already overlaps can still have its other walls moved', () => {
    const next = idCounter([])
    const f0 = plan(next, ['A', -15, -5], ['B', 0, 15])
    // B stretched 2 ft over A by hand, as some shipped plans are
    const f: Floor = { ...f0, rooms: f0.rooms.map((r) => (r.name === 'B' ? { ...r, pts: G.rectFrom2([-7, -10], [15, 10]) } : r)) }
    const B = room(f, 'B')
    // B's right wall in by 2 ft
    const g = ok(moveWall(box, 0, f, B.id, edgeAtX(B, 15), 2, next))
    expect(G.area(room(g, 'B').pts)).toBeCloseTo(20 * 20, 6)
  })

  test('a corner dragged across the room into a bow-tie is refused, not cut down to one triangle', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, -7])
    const A = room(f, 'A')
    // 8 × 20 = 160 sf; pull the back-right corner across to the left wall
    const r = moveCorner(box, 0, f, A.id, A.pts, at(A, -7, 10), [-15, -6], next)
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/cross/) })
  })

  test('a corner edit that would cut a room in two is refused, not kept as the first piece', () => {
    const next = idCounter([])
    // a hall right across the cabin; A's back-right corner pulled over it leaves a piece of A on each side
    const f = plan(next, ['A', -15, -2], ['Hall', -2, 2])
    const A = room(f, 'A')
    const r = moveCorner(box, 0, f, A.id, A.pts, at(A, -2, 10), [10, 10], next)
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/in two/) })
  })

  test('a room moved onto a hall that would cut it in two is refused, not kept as the bigger piece', () => {
    const next = idCounter([])
    const f = plan(next, ['A', -15, -5], ['Hall', 0, 2])
    // A (10 ft wide) moved 9 ft right would straddle the 2 ft hall: 6 ft on the left of it, 2 ft on the right
    expect(moveRoom(box, 0, f, room(f, 'A').id, 9, 0, next)).toMatchObject({ ok: false, message: expect.stringMatching(/in two/) })
  })

  test('removing a corner so the room would cross itself is refused', () => {
    const next = idCounter([])
    const U: Pt[] = [[-15, -10], [15, -10], [15, 10], [5, 10], [5, 0], [-5, 0], [-5, 10], [-15, 10]]
    const f = ok(addRoom(box, 0, empty, U, 'living', 'U', next))
    const Ur = room(f, 'U')
    // without the front-right corner, the wall from front-left to back-right cuts across the notch
    const r = removeCorner(box, 0, f, Ur.id, at(Ur, 15, -10), next)
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/cross/) })
  })
})
