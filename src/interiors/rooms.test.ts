import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import * as G from './geom'
import { readFloors } from './model'
import { anchorAt, captureOpenings, fitRoom, floorStats, furnitureInRoom, newRoomName, openingGeom, partitionSegments, reanchorOpenings, roomInfo, roundedStats } from './rooms'
import { WALL, type Floor, type Opening, type Room, type RoomType } from './types'

type Obj = { name: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes: { id: string; objects: Obj[] }[] }).schemes

/** 30 × 20 ft: x −15…15, z −10…10, with a porch along the back (z 10…20). */
const box = { w: 30, d: 20, h: 9, wings: [{ kind: 'porch', dx: 0, dz: 15, w: 30, d: 10 }] }
const rect = (id: number, x0: number, x1: number, type: RoomType = 'bedroom', z0 = -10, z1 = 10): Room => ({ id, name: `R${id}`, type, pts: G.rectFrom2([x0, z0], [x1, z1]) })
const floorOf = (rooms: Room[], openings: readonly Opening[] = []): Floor => ({ name: 'Main floor', rooms, openings, furniture: [] })
const door = (id: number, room: number, edge: number, pos = 0.5): Opening => ({ id, room, edge, pos, width: 3, kind: 'door', flip: false, out: false })
const edgeAtX = (r: Room, v: number) => G.edges(r.pts).findIndex((e) => Math.abs(e.a[0] - v) < 1e-6 && Math.abs(e.b[0] - v) < 1e-6)

describe('fitting a room', () => {
  test('a room inside the walls fits as drawn, starting at its front-left corner', () => {
    const fit = fitRoom(box, 0, G.rectFrom2([0, 10], [-10, -10]), 'bedroom', null, [])
    expect(fit).toMatchObject({ hole: false, clipped: false })
    expect(fit.polys).toEqual([[[-10, -10], [0, -10], [0, 10], [-10, 10]]])
  })

  test('an indoor room is kept off the porch; a porch room only fills the porch', () => {
    const across = G.rectFrom2([-5, 5], [5, 15])
    expect(G.area(fitRoom(box, 0, across, 'bedroom', null, []).polys[0])).toBeCloseTo(50, 6)
    expect(G.area(fitRoom(box, 0, across, 'porch', null, []).polys[0])).toBeCloseTo(50, 6)
    expect(fitRoom(box, 0, across, 'porch', null, []).polys[0].every((p) => p[1] >= 10)).toBe(true)
  })

  test('a room is cut around its neighbours, but never around itself', () => {
    const A = rect(1, -15, 0)
    expect(G.area(fitRoom(box, 0, G.rectFrom2([-5, -10], [5, 10]), 'bedroom', null, [A]).polys[0])).toBeCloseTo(100, 6)
    expect(G.area(fitRoom(box, 0, G.rectFrom2([-5, -10], [5, 10]), 'bedroom', 1, [A]).polys[0])).toBeCloseTo(200, 6)
  })

  test('a room cut in two by a neighbour gives both pieces; one wrapped around a neighbour reports the hole', () => {
    const mid = rect(1, -2, 2)
    expect(fitRoom(box, 0, G.rectFrom2([-10, -10], [10, 10]), 'bedroom', null, [mid]).polys).toHaveLength(2)
    expect(fitRoom(box, 0, G.rectFrom2([-10, -8], [10, 8]), 'bedroom', null, [rect(2, -1, 1, 'bedroom', -1, 1)]).hole).toBe(true)
  })

  test('fewer than three corners, or a shape with no area, fits to nothing', () => {
    expect(fitRoom(box, 0, [[0, 0], [5, 5]], 'bedroom', null, []).polys).toEqual([])
    expect(fitRoom(box, 0, [[0, 0], [5, 0], [10, 0]], 'bedroom', null, []).polys).toEqual([])
  })
})

describe('partitions', () => {
  test('outside walls are not partitions; a shared wall is one partition, not two', () => {
    const parts = partitionSegments(box, 0, [rect(1, -15, 0), rect(2, 0, 15)])
    expect(parts).toHaveLength(1)
    expect(parts[0].a[0]).toBeCloseTo(0, 9)
    expect(Math.abs(parts[0].a[1] - parts[0].b[1])).toBeCloseTo(20, 9)
  })

  test('walls in line merge into one; porch rooms have none', () => {
    const parts = partitionSegments(box, 0, [rect(1, -15, 0, 'bedroom', -10, 0), rect(2, -15, 0, 'bedroom', 0, 10), rect(3, -10, 10, 'porch', 10, 20)])
    // the wall at x 0 runs the full depth once, the wall at z 0 is the other
    expect(parts).toHaveLength(2)
  })
})

describe('openings on room edges', () => {
  const A = rect(1, -15, 0)
  const B = rect(2, 0, 15)

  test('an opening on an outside wall is exterior and as thick as it; one between rooms knows the room beyond', () => {
    const out = openingGeom(box, 0, door(1, 1, edgeAtX(A, -15)), [A, B])!
    expect(out).toMatchObject({ exterior: true, neighbour: null, t: WALL.ext })
    expect(out.c[0]).toBeCloseTo(-15, 9)
    const mid = openingGeom(box, 0, door(2, 1, edgeAtX(A, 0)), [A, B])!
    expect(mid).toMatchObject({ exterior: false, neighbour: 2, t: WALL.int })
    expect(Math.abs(mid.b[1] - mid.a[1])).toBeCloseTo(3, 9)
  })

  test('a door swings into its room unless set to swing out; flip swaps hinge and jamb', () => {
    const g = openingGeom(box, 0, door(1, 1, edgeAtX(A, 0)), [A])!
    expect(g.swing).toEqual(g.nin)
    const o = openingGeom(box, 0, { ...door(1, 1, edgeAtX(A, 0)), out: true, flip: true }, [A])!
    expect(o.swing).toEqual([-g.nin[0], -g.nin[1]])
    expect(o.hinge).toEqual(g.jamb)
  })

  test('an opening on a missing room or edge has no geometry', () => {
    expect(openingGeom(box, 0, door(1, 9, 0), [A])).toBeNull()
    expect(openingGeom(box, 0, door(1, 1, 7), [A])).toBeNull()
    expect(openingGeom(box, 0, door(1, 1, -1), [A])).toBeNull()
  })

  test('the nearest edge of a room anchors a point, with its place along it', () => {
    expect(anchorAt(A, [-15, 5])).toMatchObject({ d: 0 })
    expect(anchorAt({ pts: [] }, [0, 0])).toEqual({ edge: 0, pos: 0.5, d: Infinity })
  })

  test('openings are put back on the edge they sat on after the rooms change, or dropped when no edge is near', () => {
    const f = floorOf([A, B], [door(10, 1, edgeAtX(A, 0)), door(11, 1, edgeAtX(A, -15))])
    const cap = captureOpenings(box, 0, f)
    // A shrinks to x −15…−5: the door at x 0 now sits on B's left wall, the outside door stays on A
    const A2 = rect(1, -15, -5)
    const moved = reanchorOpenings(box, 0, floorOf([A2, B], f.openings), cap)
    expect(moved.map((o) => o.room)).toEqual([2, 1])
    // and B's left wall faces the other way, so the door is flipped to keep its swing and hinge
    expect(moved[0]).toMatchObject({ out: true, flip: true })
    // with B gone too, the door at x 0 has no wall within 0.75 ft
    expect(reanchorOpenings(box, 0, floorOf([A2], f.openings), cap).map((o) => o.id)).toEqual([11])
  })
})

describe('room info', () => {
  test("a room's area, label and net floor inside its walls (whole outside walls, half the inside ones)", () => {
    const A = rect(1, -15, 0)
    const info = roomInfo(box, 0, A)
    expect(info.area).toBeCloseTo(300, 9)
    expect(info.edges.filter((e) => e.exterior)).toHaveLength(3)
    expect(G.area(info.net!)).toBeCloseTo((15 - WALL.ext - WALL.int / 2) * (20 - 2 * WALL.ext), 6)
    expect(G.pointInPoly(A.pts, info.label![0], info.label![1])).toBe(true)
  })

  test('furniture belongs to the room it stands in', () => {
    const A = rect(1, -15, 0)
    const f: Floor = { ...floorOf([A]), furniture: [{ id: 5, type: 'queen', x: -5, z: 0, rot: 0, w: 5, d: 6.67, mirror: false }, { id: 6, type: 'queen', x: 5, z: 0, rot: 0, w: 5, d: 6.67, mirror: false }] }
    expect(furnitureInRoom(f, A).map((it) => it.id)).toEqual([5])
  })

  test('new rooms are numbered after the ones of their type already there', () => {
    expect(newRoomName(floorOf([]), 'bedroom')).toBe('Bedroom')
    expect(newRoomName(floorOf([rect(1, -15, 0), rect(2, 0, 15)]), 'bedroom')).toBe('Bedroom 3')
  })
})

describe('floor stats', () => {
  test('rooms, porches and halls are counted apart; what the rooms leave is unassigned', () => {
    const st = floorStats(box, 0, floorOf([rect(1, -15, 0), rect(2, 0, 5, 'hall'), rect(3, -15, 15, 'porch', 10, 20)]))
    expect(st).toMatchObject({ nRooms: 2, circPct: 25 })
    expect(st.envArea).toBeCloseTo(600, 9)
    expect(st.roomsArea).toBeCloseTo(400, 9)
    expect(st.porchArea).toBeCloseTo(300, 9)
    expect(st.unassigned).toBeCloseTo(200, 9)
    expect(st.overlap).toBeCloseTo(0, 9)
    expect(st.outside).toBeCloseTo(0, 9)
  })

  test('rooms lying over each other are reported, not hidden behind an unassigned of 0 (R5.1)', () => {
    // the review's case: 760 sf of rooms in a 600 sf cabin
    const st = floorStats(box, 0, floorOf([rect(1, -15, 1), rect(2, -3, 15), rect(3, -3, 5)]))
    expect(st.roomsArea).toBeCloseTo(320 + 360 + 160, 6)
    // together they cover the whole 600 sf: 240 sf is counted more than once
    expect(st.overlap).toBeCloseTo(840 - 600, 6)
    expect(st.unassigned).toBeCloseTo(0, 6)
  })

  test('room area past the outside walls is reported too', () => {
    const st = floorStats(box, 0, floorOf([{ id: 1, name: 'Out', type: 'bedroom', pts: G.rectFrom2([10, -10], [20, 10]) }]))
    expect(st.outside).toBeCloseTo(100, 6)
    expect(st.unassigned).toBeCloseTo(500, 6)
  })

  test('the rounded figures always add up: inside the walls = rooms − overlap − past the walls + unassigned (R5.4)', () => {
    for (const s of all)
      for (const o of s.objects) {
        if (!Array.isArray(o.floors)) continue
        readFloors(o).forEach((f, fi) => {
          const r = roundedStats(floorStats(o, fi, f))
          expect(r.rooms - r.overlap - r.outside + r.unassigned, `${s.id} ${o.name}`).toBe(r.env)
          expect(r.unassigned).toBeGreaterThanOrEqual(0)
        })
      }
  })

  test("C's gathering prow: inside the walls is measured to the curved wall, so its rooms no longer outgrow it (R5.4)", () => {
    const prow = all.find((s) => s.id === 'C')!.objects.find((o) => o.name === 'Gathering prow')!
    const r = roundedStats(floorStats(prow, 0, readFloors(prow)[0]))
    expect(r.env).toBeGreaterThanOrEqual(r.rooms)
    expect(r.outside).toBe(0)
  })
})
