import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../store/types'
import { pieceEnds, type Ground } from './pieces'
import { autoRoute, autoRouteFromDriveway } from './routeAuto'
import { switchPlan } from './routeAutoPlan'
import { routeAnchors, routeItems, routeObstacles } from './routeCollect'
import type { PieceSpec } from './routeSpec'
import { FT, flatTerrain, obj } from './routeTestKit'
import { routeReport } from './routeVerdict'

const flat: Ground = () => 0
const asObject = (s: PieceSpec, i: number): PlanObject =>
  obj(`auto-${i}`, 'pad', `Route · ${i + 1}`, s.position.x, s.position.n, s.rotation, { kind: s.kind, w: s.w, d: s.d, ends: s.ends, surface: s.surface, rail: s.rail, ...(s.lift !== undefined ? { lift: s.lift } : {}) })
/** Each piece's ends, in route order. */
const endsOf = (pieces: readonly PieceSpec[], ground: Ground) => pieces.map((s, i) => pieceEnds(asObject(s, i), ground))

describe('auto route', () => {
  test('on level ground lays walks end to end from the start to the goal', () => {
    // Act
    const r = autoRoute({ from: { x: 0, n: 0 }, to: { x: 20, n: 0 }, ground: flat })

    // Assert
    expect(r.pieces.every((s) => s.kind === 'walk')).toBe(true)
    const E = endsOf(r.pieces, flat)
    // lengths are kept to 1e-4 ft
    expect(E[0].A[0]).toBeCloseTo(0, 3)
    expect(E[E.length - 1].B[0]).toBeCloseTo(20, 3)
    for (let i = 1; i < E.length; i++) expect(Math.hypot(E[i].A[0] - E[i - 1].B[0], E[i].A[1] - E[i - 1].B[1])).toBeLessThan(1e-3)
    expect(r.pieces.every((s) => s.w <= 30 + 1e-9)).toBe(true)
  })

  test('up a 1:10 slope lays 1:12 ramps of at most 30 in rise with landings between them', () => {
    // Arrange
    const ground: Ground = (x) => x / 10

    // Act
    const r = autoRoute({ from: { x: 0, n: 0 }, to: { x: 30, n: 0 }, ground })

    // Assert
    const ramps = r.pieces.filter((s) => s.kind === 'ramp')
    expect(ramps.length).toBeGreaterThan(0)
    for (const s of ramps) {
      const rise = Math.abs(s.ends.zB - s.ends.zA)
      expect(rise / (s.w * FT)).toBeLessThanOrEqual(1 / 12 + 1e-6)
      expect(rise).toBeLessThanOrEqual(30 * 0.0254 + 1e-6)
    }
    expect(r.pieces.some((s) => s.kind === 'landing')).toBe(true)
    const last = endsOf(r.pieces, ground).at(-1)!
    expect(Math.hypot(last.B[0] - 30, last.B[1])).toBeLessThan(0.01)
    expect(last.zB).toBeCloseTo(3, 3)
  })

  test('keeps whole-degree rotations on an off-angle leg and still closes on the goal', () => {
    const r = autoRoute({ from: { x: 0, n: 0 }, to: { x: 15, n: 4.1 }, ground: flat })
    expect(r.pieces.every((s) => Number.isInteger(s.rotation))).toBe(true)
    const last = endsOf(r.pieces, flat).at(-1)!
    expect(Math.hypot(last.B[0] - 15, last.B[1] - 4.1)).toBeLessThan(0.01)
  })

  test('goes round an obstacle in the way with a dogleg', () => {
    const block = [[8, -3], [12, -3], [12, 3], [8, 3]] as const
    const r = autoRoute({ from: { x: 0, n: 0 }, to: { x: 20, n: 0 }, ground: flat, obstacles: [block] })
    expect(r.corner).not.toBeNull()
    expect(Math.abs(r.corner!.n)).toBeGreaterThan(3)
  })

  test('plans a switchback where a straight ramp will not fit', () => {
    // 30 m along, 2.5 m up: a straight 1:12 run needs 30 m plus its landings
    const sw = switchPlan(30, 2.5, 4 * FT)
    expect(sw).not.toBeNull()
    expect(sw!.slope).toBeLessThanOrEqual(1 / 12)
  })

  test('reaches a cabin door from the driveway, and the check passes the route it laid', () => {
    // Arrange: a 20 × 16 ft cabin with a door on its first wall, and a parking pad 20 m away
    const terrain = flatTerrain()
    const cabin = obj('H', 'house', 'Cabin', 0, 0, 0, { w: 20, d: 16, h: 9, cuts: [{ id: 1, kind: 'door', edge: 0, x: 8, w: 3 }] })
    const parking = obj('P', 'pad', 'Parking', 0, 20, 0, { w: 20, d: 18, cars: 2 })
    const objects = [cabin, parking]
    const door = routeAnchors(objects, terrain, flat, routeItems(objects, flat)).find((a) => a.type === 'door')!

    // Act
    const r = autoRouteFromDriveway(parking, door, flat, { obstacles: routeObstacles(objects, terrain, flat) })
    const laid = [...objects, ...r.pieces.map(asObject)]
    const rep = routeReport(laid, terrain, flat)

    // Assert
    const last = endsOf(r.pieces, flat).at(-1)!
    expect(Math.hypot(last.B[0] - door.x, last.B[1] - door.n)).toBeLessThan(0.01)
    expect(last.zB).toBeCloseTo(door.z, 3)
    expect(rep.routes[0].text).toMatch(/^Cabin: reachable, \d+ ft, max \d+\.\d %$/)
    expect(rep.summary.failing).toBe(0)
  })
})
