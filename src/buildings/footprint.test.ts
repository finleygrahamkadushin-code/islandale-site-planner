import { describe, expect, test } from 'vitest'
import { localFootprint, localToSite, siteToLocal, signedArea } from './footprint'

describe('footprint shapes (port of the legacy massPoly)', () => {
  test('rect is a centred box, counter-clockwise', () => {
    const poly = localFootprint({ w: 20, d: 10 })
    expect(poly).toEqual([[-10, -5], [10, -5], [10, 5], [-10, 5]])
    expect(signedArea(poly)).toBe(200)
  })

  test('octagon touches the box at the axes (legacy k factor)', () => {
    const poly = localFootprint({ w: 20, d: 20, shape: 'oct' })
    expect(poly).toHaveLength(8)
    const maxX = Math.max(...poly.map((p) => p[0]))
    expect(maxX).toBeCloseTo(10, 6)
  })

  test('trap narrows the back by taper, para skews the back', () => {
    expect(localFootprint({ w: 20, d: 10, shape: 'trap', taper: 0.5 })).toEqual([[-5, -5], [5, -5], [10, 5], [-10, 5]])
    expect(localFootprint({ w: 20, d: 10, shape: 'para', skew: 2 })).toEqual([[-8, -5], [12, -5], [10, 5], [-10, 5]])
  })

  test('poly uses its own points and makes them counter-clockwise', () => {
    const cw = [[-5, 5], [5, 5], [5, -5], [-5, -5]]
    const poly = localFootprint({ w: 10, d: 10, shape: 'poly', pts: cw })
    expect(signedArea(poly)).toBeGreaterThan(0)
    expect(poly).toHaveLength(4)
  })

  test('every footprint shape is wound counter-clockwise (positive signed area)', () => {
    const shapes = ['rect', 'hex', 'oct', 'tri', 'trap', 'para', 'half', 'ellipse', 'kidney', 'teardrop', 'blob', 'ribbon']
    for (const shape of shapes) {
      const poly = localFootprint({ w: 24, d: 16, shape, taper: 0.5, skew: 3 })
      expect(signedArea(poly), shape).toBeGreaterThan(0)
    }
  })

  test('triangle keeps the front edge as edge 0', () => {
    const tri = localFootprint({ w: 20, d: 10, shape: 'tri' })
    expect(tri).toEqual([[10, 5], [-10, 5], [0, -5]])
  })

  test('curved shapes come back as smooth outlines wound like the rest', () => {
    for (const shape of ['ellipse', 'kidney', 'teardrop', 'blob', 'ribbon']) {
      const poly = localFootprint({ w: 24, d: 16, shape })
      expect(poly.length).toBeGreaterThanOrEqual(32)
      expect(signedArea(poly)).toBeGreaterThan(0)
    }
  })
})

describe('local ↔ site transform (legacy localToWorld)', () => {
  test('at rotation 0 the front (+z) points south and feet become metres', () => {
    const [x, n] = localToSite({ x: 1, n: 2 }, 0, [10, 10])
    expect(x).toBeCloseTo(1 + 3.048, 9)
    expect(n).toBeCloseTo(2 - 3.048, 9)
  })

  test('rotation is counter-clockwise seen from above', () => {
    const [x, n] = localToSite({ x: 0, n: 0 }, 90, [10, 0])
    expect(x).toBeCloseTo(0, 9)
    expect(n).toBeCloseTo(3.048, 9)
  })

  test('siteToLocal inverts localToSite', () => {
    const pos = { x: -3.2, n: 7.1 }
    const local = [7.5, -4.25] as const
    const back = siteToLocal(pos, 158, localToSite(pos, 158, local))
    expect(back[0]).toBeCloseTo(local[0], 9)
    expect(back[1]).toBeCloseTo(local[1], 9)
  })
})
