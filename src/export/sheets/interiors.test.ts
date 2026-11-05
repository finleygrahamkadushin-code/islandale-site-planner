import { beforeAll, describe, expect, test } from 'vitest'
import type { LocalPoint } from '../../buildings/footprint'
import * as G from '../../interiors/geom'
import type { Pt } from '../../interiors/geom'
import { readFloors } from '../../interiors/model'
import { roomInfo } from '../../interiors/rooms'
import { WALL } from '../../interiors/types'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { floorPlans } from './floorPlans'
import { clearOfWalls, wallZone } from './interiors'
import { sheetBuildings } from './model'
import { sheetTables, tablesCsv } from './table'
import type { SheetBuilding, SheetFloor } from './types'

/**
 * Rooms on the floor plans, from the interior editor's floors: scheme C's
 * cabins as they are, and cabins built in code (every curved footprint,
 * turned, two floors, overlapping parts) to show the rules hold for any.
 */

const SHAPES = ['ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const
const store = () => usePlanStore.getState()
const schemeBuildings = (scheme: string) => {
  store().loadScheme(scheme)
  return sheetBuildings(
    store().plan.order.map((k) => store().plan.objects[k]),
    store().site.terrain,
  )
}

/** A cabin on scheme C's twin-pod spot with the given params in place of its own. */
function cabin(params: Record<string, unknown>, rotation = 0): SheetBuilding {
  store().loadScheme('C')
  const base = store().plan.objects['C-2']
  const o: PlanObject = { ...base, rotation, params: { ...base.params, pts: undefined, wings: [], cuts: [], floors: undefined, ...params } }
  const b = sheetBuildings([o], store().site.terrain)[0]
  if (!b) throw new Error('no sheet building')
  return b
}

const toPt = (p: LocalPoint): Pt => [p[0], p[1]]
const lerp = (a: LocalPoint, b: LocalPoint, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Every partition of a floor clear of the walls the plan draws, end to end. */
function expectClear(b: SheetBuilding, f: SheetFloor) {
  const z = wallZone(b.parts.filter((p) => f.enclosedParts.includes(p.massIndex)))
  for (const s of f.partitions) {
    // the ends run on half a partition where they meet another, so test inside them
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    const k = Math.min(0.49, s.thicknessFt / 2 / L + 1e-3)
    for (const t of [k, 0.25, 0.5, 0.75, 1 - k]) expect(clearOfWalls(z, lerp(s.a, s.b, t))).toBeGreaterThan(-1e-3)
  }
}

/** The main walls' outline cut in two along x = 0: the halves a curved cabin's two rooms are drawn as. */
function halves(b: SheetBuilding): [Pt[], Pt[]] {
  const outline = b.parts[0].outline.map(toPt)
  const { left, right } = G.splitByLine(outline, [0, -100], [0, 100])
  const biggest = (ps: Pt[][]) => ps.reduce((m, p) => (G.area(p) > G.area(m) ? p : m))
  return [biggest(left), biggest(right)]
}

/** The edge of a room lying on x = 0, and one well off it (on the outside wall). */
function edgeOn(pts: readonly Pt[], onSplit: boolean): number {
  const es = G.edges(pts)
  const i = es.findIndex((e) => (Math.abs(e.a[0]) < 1e-3 && Math.abs(e.b[0]) < 1e-3) === onSplit && e.len > (onSplit ? 2 : 0.5))
  if (i < 0) throw new Error('no such edge')
  return i
}

/** A cabin of the given shape whose two rooms are its halves, with a door between them and a window on the outside wall. */
function curvedCabin(shape: string, rotation = 0): SheetBuilding {
  const size = shape === 'ribbon' ? { w: 40, d: 9 } : { w: 32, d: 22 }
  const first = cabin({ shape, ...size }, rotation)
  const [a, b] = halves(first)
  const rooms = [
    { id: 1, name: 'West', type: 'living', pts: a },
    { id: 2, name: 'East', type: 'bedroom', pts: b },
  ]
  const clean = G.ensureCCW(a)
  const openings = [
    { id: 3, room: 1, edge: edgeOn(clean, true), pos: 0.5, width: 3, kind: 'door', flip: false, out: false },
    { id: 4, room: 1, edge: edgeOn(clean, false), pos: 0.5, width: 1, kind: 'window', flip: false, out: false },
  ]
  return cabin({ shape, ...size, floors: [{ name: 'Main floor', rooms, openings, furniture: [] }] }, rotation)
}

beforeAll(() => {
  store().setReadOnly(null)
})

describe('scheme C', () => {
  test('every cabin of C, C2, C3 and C4 has its rooms, partitions and interior doors, all clear of the walls', () => {
    for (const scheme of ['C', 'C2', 'C3', 'C4']) {
      const bs = schemeBuildings(scheme)
      expect(bs).toHaveLength(4)
      for (const b of bs) {
        expect(b.floors).toHaveLength(1)
        const f = b.floors[0]
        expect(f.rooms.length).toBeGreaterThanOrEqual(4)
        expect(f.partitions.length).toBeGreaterThanOrEqual(3)
        expect(f.openings.length).toBeGreaterThanOrEqual(3)
        expectClear(b, f)
        for (const r of f.rooms) {
          // inside its walls, a room is smaller than as drawn, and its words sit inside it
          expect(r.net.length).toBeGreaterThanOrEqual(3)
          if (!r.porch) expect(r.netAreaSqFt).toBeLessThan(G.area(r.outline))
          expect(G.pointInPoly(r.net, r.label[0], r.label[1])).toBe(true)
        }
      }
    }
  })

  test("the prow's rooms: a straight room is its drawn rectangle less a wall or half a partition each side", () => {
    const b = schemeBuildings('C').find((x) => x.id === 'C-0')
    if (!b) throw new Error('no C-0')
    const f = b.floors[0]
    expect(f.rooms.map((r) => r.name)).toEqual(['Entry', 'Powder', 'Pantry', 'Laundry & storage', 'Kitchen', 'Hearth hall', 'Dining · 8', 'Lounge · prow'])
    // on straight walls the editor's own test of which edges are outside walls holds, so the room inside its walls is the
    // drawn room with each edge moved in by the 3D shell's wall there or half a partition
    const params = store().plan.objects['C-0'].params
    const wall = b.parts[0].edges[0].thicknessFt
    const floor = readFloors(params)[0]
    let checked = 0
    for (const room of floor.rooms.filter((r) => r.type !== 'porch')) {
      const offsets = roomInfo(params, 0, room).edges.map((e) => (e.exterior ? wall : WALL.int / 2))
      // (the prow's lounge, with its curved corner, folds under the plain offset)
      const moved = G.offsetPoly(room.pts, offsets)
      if (!moved) continue
      checked++
      expect(f.rooms.find((r) => r.id === room.id)?.netAreaSqFt).toBeCloseTo(G.area(moved), 1)
    }
    expect(checked).toBeGreaterThanOrEqual(7)
    const kitchen = f.rooms.find((r) => r.name === 'Kitchen')
    expect([kitchen?.widthFt, kitchen?.depthFt].map((v) => Math.round((v ?? 0) * 12))).toEqual([198, 110])
    // the doors keep the swing the interior plan sets
    const powder = f.openings.find((o) => o.room === 'Powder')
    expect(powder).toMatchObject({ kind: 'door', to: 'Dining · 8', swingsInto: 'Dining · 8', inPartWall: false })
  })

  test('the Rooms and Interior openings tables, and the CSV, list every room and opening with the floor totals', () => {
    const b = schemeBuildings('C').find((x) => x.id === 'C-0')
    if (!b) throw new Error('no C-0')
    const tables = sheetTables(b)
    const rooms = tables.find((t) => t.title === 'Rooms')
    const openings = tables.find((t) => t.title === 'Interior openings')
    if (!rooms || !openings) throw new Error('no room tables')
    expect(rooms.columns).toEqual(['Room', 'Type', 'Size', 'Area', 'Drawn area'])
    expect(rooms.rows.find((r) => r[0] === 'Kitchen')?.slice(1, 3)).toEqual(['Kitchen', `16'-6" × 9'-2"`])
    const total = rooms.rows.find((r) => r[0] === 'All 8 rooms')
    expect(total?.[3]).toBe(`${Math.round(b.floors[0].rooms.reduce((s, r) => s + r.netAreaSqFt, 0))} sq ft`)
    expect(rooms.rows.some((r) => r[0] === 'Circulation')).toBe(true)
    expect(openings.rows).toHaveLength(b.floors[0].openings.length)
    for (const t of [rooms, openings]) for (const r of t.rows) expect(r).toHaveLength(t.columns.length)
    expect(tablesCsv(b)).toContain('Gathering prow — Rooms')
  })

  test('a standalone deck and a cabin with nothing drawn inside have no floors', () => {
    const deck = schemeBuildings('E').find((x) => x.type === 'deck')
    expect(deck?.floors).toEqual([])
    expect(cabin({ shape: 'rect', w: 20, d: 12 }).floors).toEqual([])
    expect(sheetTables(cabin({ shape: 'rect', w: 20, d: 12 })).some((t) => t.title === 'Rooms')).toBe(false)
  })
})

describe('built in code', () => {
  test('two rooms in a rectangle: the partition stops at the walls, the outside door is the walls\' own', () => {
    const rooms = [
      { id: 1, name: 'Living', type: 'living', pts: [[-10, -5], [2, -5], [2, 5], [-10, 5]] },
      { id: 2, name: 'Bed', type: 'bedroom', pts: [[2, -5], [10, -5], [10, 5], [2, 5]] },
    ]
    const openings = [
      { id: 3, room: 1, edge: 1, pos: 0.5, width: 3, kind: 'door', flip: false, out: false },
      { id: 4, room: 1, edge: 2, pos: 0.5, width: 3, kind: 'door', flip: false, out: false },
    ]
    const b = cabin({ shape: 'rect', w: 20, d: 10, floors: [{ name: 'Main floor', rooms, openings, furniture: [] }] })
    const [f] = b.floors
    const t = b.parts[0].edges[0].thicknessFt
    expect(f.partitions).toHaveLength(1)
    const [p] = f.partitions
    expect([p.a[0], p.b[0]]).toEqual([2, 2])
    expect(Math.min(p.a[1], p.b[1])).toBeCloseTo(-5 + t, 3)
    expect(Math.max(p.a[1], p.b[1])).toBeCloseTo(5 - t, 3)
    expect([p.aAtWall, p.bAtWall]).toEqual([true, true])
    expect(f.openings).toHaveLength(1)
    expect(f.openings[0]).toMatchObject({ kind: 'door', room: 'Living', to: 'Bed', swingsInto: 'Living', thicknessFt: WALL.int })
    const living = f.rooms[0]
    expect(living.netAreaSqFt).toBeCloseTo((12 - t - WALL.int / 2) * (10 - 2 * t), 2)
  })

  for (const shape of SHAPES)
    for (const rotation of [0, 37]) {
      test(`${shape} at ${rotation}°: the chords along the curve are the wall, the partition across it is kept`, () => {
        const b = curvedCabin(shape, rotation)
        const [f] = b.floors
        expect(f.rooms).toHaveLength(2)
        // the editor's envelope is chorded, so it calls many room edges along the curve partitions; none are drawn
        expect(f.partitions.length).toBeGreaterThanOrEqual(1)
        for (const s of f.partitions) {
          expect(Math.abs(s.a[0])).toBeLessThan(0.01)
          expect(Math.abs(s.b[0])).toBeLessThan(0.01)
        }
        expectClear(b, f)
        // the door between the rooms is drawn; the window on the curved outside wall is not (the walls cut their own)
        expect(f.openings.map((o) => o.kind)).toEqual(['door'])
        // inside their walls the two rooms are the walls' inside, less the partition between them
        const inner = G.area(b.parts[0].inner.map(toPt))
        const across = f.partitions.reduce((s, p) => s + Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), 0)
        const net = f.rooms.reduce((s, r) => s + r.netAreaSqFt, 0)
        expect(Math.abs(net - (inner - across * WALL.int)) / inner).toBeLessThan(0.02)
      })
    }

  test('the rooms are in the building frame, the same whatever way the cabin is turned', () => {
    const a = curvedCabin('kidney', 0).floors[0]
    const b = curvedCabin('kidney', 200).floors[0]
    expect(b.rooms.map((r) => r.netAreaSqFt)).toEqual(a.rooms.map((r) => r.netAreaSqFt))
    expect(b.partitions).toEqual(a.partitions)
  })

  test('a door where one part\'s wall runs across another\'s floor is flagged, not drawn, and no partition runs through that wall', () => {
    const wing = { kind: 'wall', shape: 'rect', dx: 12, dz: 0, w: 8, d: 8, h: 9, roof: 'flat' }
    const rooms = [
      { id: 1, name: 'Main', type: 'living', pts: [[-10, -5], [9.7, -5], [9.7, 5], [-10, 5]] },
      { id: 2, name: 'Wing', type: 'bedroom', pts: [[9.7, -4], [16, -4], [16, 4], [9.7, 4]] },
    ]
    const openings = [{ id: 3, room: 1, edge: 1, pos: 0.5, width: 3, kind: 'door', flip: false, out: false }]
    const b = cabin({ shape: 'rect', w: 20, d: 10, wings: [wing], floors: [{ name: 'Main floor', rooms, openings, furniture: [] }] })
    const [f] = b.floors
    expect(f.enclosedParts).toEqual([0, 1])
    expect(f.openings).toHaveLength(1)
    expect(f.openings[0].inPartWall).toBe(true)
    expect(f.partitions.filter((s) => Math.abs(s.a[0] - 9.7) < 0.01)).toEqual([])
    expect(sheetTables(b).find((t) => t.title === 'Interior openings')?.rows[0][0]).toBe('door, not cut')
  })

  test('a cabin of two floors gets a plan of each, with its own rooms, parts and windows', () => {
    const rooms0 = [{ id: 1, name: 'Hall', type: 'hall', pts: [[-10, -6], [10, -6], [10, 6], [-10, 6]] }]
    const rooms1 = [{ id: 2, name: 'Loft', type: 'bedroom', pts: [[-10, -6], [10, -6], [10, 6], [-10, 6]] }]
    const cuts = [
      { id: 1, edge: 2, kind: 'window', x: 4, w: 3, h: 4, sill: 3 },
      { id: 2, edge: 2, kind: 'window', x: 12, w: 3, h: 3, sill: 12 },
    ]
    const porch = { kind: 'porch', open: true, shape: 'rect', dx: 0, dz: 9, w: 12, d: 6, h: 8, roof: 'shed' }
    const b = cabin({
      shape: 'rect',
      w: 20,
      d: 12,
      h: 18,
      cuts,
      wings: [porch],
      floors: [
        { name: 'Main floor', rooms: rooms0, openings: [], furniture: [] },
        { name: 'Loft floor', rooms: rooms1, openings: [], furniture: [] },
      ],
    })
    expect(b.floors.map((f) => [f.name, f.levelFt, f.enclosedParts])).toEqual([
      ['Main floor', 0, [0]],
      ['Loft floor', 9, [0]],
    ])
    const plans = floorPlans(b)
    expect(plans.map((p) => p.title)).toEqual(['Floor plan, Main floor', 'Floor plan, Loft floor'])
    expect(plans.map((p) => p.floor?.rooms.map((r) => r.name))).toEqual([['Hall'], ['Loft']])
    // the porch stands on the main floor; each window is drawn on the storey its sill is in
    expect(plans[0].building.parts.map((p) => p.kind)).toEqual(['wall', 'porch'])
    expect(plans[1].building.parts.map((p) => p.kind)).toEqual(['wall'])
    expect(plans.map((p) => p.building.parts[0].openings.map((o) => o.sillFt))).toEqual([[3], [12]])
    expect(plans[1].building.earthworks).toBeNull()
    // a cabin of one floor keeps its one plan of every part
    const one = cabin({ shape: 'rect', w: 20, d: 12, cuts, floors: [{ name: 'Main floor', rooms: rooms0, openings: [], furniture: [] }] })
    expect(floorPlans(one)).toEqual([{ building: one, floor: one.floors[0], title: 'Floor plan' }])
  })

  test('furniture comes through at its place, turn and size, with its catalogue name', () => {
    const furniture = [{ id: 5, type: 'queen', x: 3, z: 1, rot: 90, w: 5, d: 6.67, mirror: false }]
    const rooms = [{ id: 1, name: 'Bed', type: 'bedroom', pts: [[-10, -5], [10, -5], [10, 5], [-10, 5]] }]
    const b = cabin({ shape: 'rect', w: 20, d: 10, floors: [{ name: 'Main floor', rooms, openings: [], furniture }] })
    const [f] = b.floors[0].furniture
    expect(f).toMatchObject({ type: 'queen', label: 'Queen bed', at: [3, 1], rotDeg: 90, widthFt: 5, depthFt: 6.67 })
    const box = G.bbox([f.corners.map(toPt)])
    expect([box.w, box.d].map((v) => Math.round(v * 100) / 100)).toEqual([6.67, 5])
  })
})
