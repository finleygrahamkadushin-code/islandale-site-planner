import { describe, expect, test } from 'vitest'
import type { Pt } from '../svgDims'
import { bankTicks, distToLine, hatchWhere, stipple, waterLines } from './siteHatch'
import { insidePoly } from './siteGeom'

const extent = { x: -20, y: -20, w: 40, h: 40 }
const inCircle = (r: number) => ([x, y]: Pt) => Math.hypot(x, y) < r

describe('hatchWhere', () => {
  test('hatch lines stop on the band’s true edge, to well under a hundredth of a foot', () => {
    const segs = hatchWhere(inCircle(10), extent, 1, 45, 0.2)
    expect(segs.length).toBeGreaterThan(10)
    for (const [x1, y1, x2, y2] of segs) {
      expect(Math.abs(Math.hypot(x1, y1) - 10)).toBeLessThan(0.01)
      expect(Math.abs(Math.hypot(x2, y2) - 10)).toBeLessThan(0.01)
    }
  })

  test('lines run at the angle asked, the spacing apart, and stay in the extent', () => {
    const segs = hatchWhere(() => true, extent, 2, 0, 0.5)
    const ys = [...new Set(segs.map(([, y]) => Math.round(y * 1000) / 1000))].sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(2)
    for (const [x1, y1, x2, y2] of segs) {
      expect(y1).toBeCloseTo(y2)
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(extent.x - 1e-6)
        expect(x).toBeLessThanOrEqual(extent.x + extent.w + 1e-6)
        expect(y).toBeGreaterThanOrEqual(extent.y - 1e-6)
      }
    }
  })

  test('a band with a hole leaves the hole bare', () => {
    const ring = ([x, y]: Pt) => Math.hypot(x, y) < 10 && Math.hypot(x, y) > 5
    const segs = hatchWhere(ring, extent, 0.7, 30, 0.1)
    for (const [x1, y1, x2, y2] of segs) expect(ring([(x1 + x2) / 2, (y1 + y2) / 2])).toBe(true)
  })
})

describe('waterLines', () => {
  const shore: Pt[] = Array.from({ length: 41 }, (_, i) => [i - 20, 0])
  const land = ([, y]: Pt) => y < 0

  test('copies of the shore off in the water, at their offsets', () => {
    const lines = waterLines(shore, land, [2, 5])
    expect(lines).toHaveLength(2)
    for (const [i, off] of [[0, 2], [1, 5]] as const) {
      for (const p of lines[i]) {
        expect(land(p)).toBe(false)
        expect(distToLine(p, shore)).toBeCloseTo(off)
      }
    }
  })
})

describe('bankTicks', () => {
  test('ticks point to the side nearer the water, alternating long and short', () => {
    const bank: Pt[] = [
      [0, 0],
      [30, 0],
    ]
    const water = (p: Pt) => Math.abs(p[1] - 10)
    const ticks = bankTicks(bank, water, 3, 1)
    expect(ticks.length).toBe(10)
    for (const [, y1, , y2] of ticks) {
      expect(y1).toBe(0)
      expect(y2).toBeGreaterThan(0)
    }
    expect(ticks[0][3]).toBeCloseTo(1)
    expect(ticks[1][3]).toBeCloseTo(0.55)
  })
})

describe('stipple', () => {
  test('about one dot per area asked, all inside, the same every time', () => {
    const square: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const dots = stipple(square, 1, 42)
    expect(dots.length).toBeGreaterThan(80)
    expect(dots.length).toBeLessThanOrEqual(121)
    expect(dots.every((p) => insidePoly(square, p))).toBe(true)
    expect(stipple(square, 1, 42)).toEqual(dots)
  })
})
