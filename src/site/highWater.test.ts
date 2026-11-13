import { describe, expect, test } from 'vitest'
import { HIGH_WATER_FT, HIGH_WATER_M, highWaterLine, MAX_WALK_M } from './highWater'
import { loadIslandale } from './islandale'
import { elevationAt } from './terrain'
import { pointInPolygon } from './geom2d'
import { closestOnSeg } from './rules/setbacks'
import type { Parcel } from './types'
import { ftToM } from './units'

/** A 20 × 40 m lot whose bottom edge (edge 0, n = 0, x from 0 to 20) is the shoreline. */
const lot: Parcel = {
  ring: [
    [0, 0],
    [20, 0],
    [20, 40],
    [0, 40],
  ],
  lotSqFt: 0,
  shorelineEdges: { first: 0, last: 0 },
}

describe('the approximate high-water line (8 ft NAVD88 contour of the terrain)', () => {
  test('a sample whose straight look inland finds no 8 ft ground takes the nearest at an angle, so there is no gap', () => {
    // a low trench straight in from the middle of the shore
    const line = highWaterLine(lot, (x, n) => (Math.abs(x - 10) < 0.01 ? 0 : 0.1 * n))
    expect(line.fallbacks).toBe(0)
    const mid = line.pts.find(([x]) => Math.abs(x - 10) < 0.6)!
    expect(mid[1]).toBeCloseTo(24.384, 1)
  })

  test('samples with no 8 ft ground within reach take the nearest found point beside them, so there is no gap', () => {
    // only a strip along the west side rises; samples near the east end find nothing within 30 m
    const line = highWaterLine(lot, (x, n) => (x < 1 ? 0.1 * n : 0))
    expect(line.fallbacks).toBeGreaterThan(0)
    expect(line.pts.length).toBe(line.edges.length + 1)
    // the east end found nothing: its points repeat the last point found, on the risen strip
    expect(line.pts.at(-1)).toEqual(line.pts.at(-2))
    expect(line.pts.at(-1)![0]).toBeLessThan(1)
  })

  test('the level is 8 ft NAVD88', () => {
    expect(HIGH_WATER_FT).toBe(8)
    expect(HIGH_WATER_M).toBeCloseTo(ftToM(8), 12)
  })

  test('on a slope rising from the water, the line is the 8 ft contour, landward of the lot line', () => {
    // 0.1 m up for every metre north: 8 ft (2.4384 m) is 24.384 m in from the lot line
    const line = highWaterLine(lot, (_x, n) => 0.1 * n)
    for (const [, n] of line.pts) expect(n).toBeCloseTo(24.384, 2)
  })

  test('where the lot line is at or above 8 ft, the line is the lot line', () => {
    const line = highWaterLine(lot, () => 3)
    for (const [, n] of line.pts) expect(n).toBe(0)
  })

  test('one continuous line: the contour along the low stretch, the lot line where it is higher, joined', () => {
    // ground rising north and east: the lot line reaches 8 ft at x = 8.128 m; west of that the contour runs inland
    const slope = (x: number, n: number) => 0.1 * n + 0.3 * x
    const line = highWaterLine(lot, slope)
    expect(line.pts.length).toBe(line.edges.length + 1)
    for (const [x, n] of line.pts) expect(slope(x, n)).toBeGreaterThanOrEqual(2.4384 - 1e-6)
    for (const [x, n] of line.pts) if (x >= 8.2) expect(n).toBe(0)
    expect(Math.max(...line.pts.map(([, n]) => n))).toBeGreaterThan(2)
    // no gaps: each point is near the next
    for (let k = 1; k < line.pts.length; k++) expect(Math.hypot(line.pts[k][0] - line.pts[k - 1][0], line.pts[k][1] - line.pts[k - 1][1])).toBeLessThan(1)
  })

  test("the ends: the shoreline's first and last corners, moved to their nearest 8 ft ground", () => {
    const line = highWaterLine(lot, (_x, n) => 0.1 * n)
    expect(line.pts[0][0]).toBeCloseTo(0, 9)
    expect(line.pts.at(-1)![0]).toBeCloseTo(20, 9)
    expect(line.pts[0][1]).toBeCloseTo(24.384, 2)
    expect(line.pts.at(-1)![1]).toBeCloseTo(24.384, 2)
    expect(new Set(line.edges)).toEqual(new Set([0]))
  })

  test(`ground under 8 ft for ${MAX_WALK_M} m in everywhere: the lot line is kept`, () => {
    const line = highWaterLine(lot, () => 0)
    for (const [, n] of line.pts) expect(n).toBe(0)
    expect(line.fallbacks).toBe(line.pts.length)
  })

  test('Islandale: one line along the whole shoreline, at 8 ft or on the lot line, never seaward of the lot', () => {
    const { parcel, terrain } = loadIslandale()
    const line = highWaterLine(parcel, (x, n) => elevationAt(terrain, x, n))
    const { first, last } = parcel.shorelineEdges
    expect(line.edges[0]).toBe(first)
    expect(line.edges.at(-1)).toBe(last)
    expect(line.fallbacks).toBe(0)
    for (const [x, n] of line.pts) expect(elevationAt(terrain, x, n)).toBeGreaterThanOrEqual(HIGH_WATER_M - 0.02)
    // continuous: no point more than 2 m from the next (the samples are 0.5 m apart along the lot line)
    for (let k = 1; k < line.pts.length; k++) expect(Math.hypot(line.pts[k][0] - line.pts[k - 1][0], line.pts[k][1] - line.pts[k - 1][1])).toBeLessThan(2)
    // never seaward of the lot: every point is in the lot or on its line
    const toRing = (x: number, n: number) => Math.min(...parcel.ring.map((a, i) => closestOnSeg(x, n, a, parcel.ring[(i + 1) % parcel.ring.length]).d))
    for (const [x, n] of line.pts) expect(pointInPolygon(parcel.ring, x, n) || toRing(x, n) < 0.06).toBe(true)
  })
})
