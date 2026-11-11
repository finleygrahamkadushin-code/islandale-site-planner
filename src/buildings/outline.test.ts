import { describe, expect, test } from 'vitest'
import { curvePosts, edgePosts, offsetOutline, perimeterLength, perimeterSamples } from './outline'
import { buildSlab } from './slab'
import { pointInPolygon } from '../site/geom2d'
import { bounds } from './geom'
import { signedArea, type LocalPoint } from './footprint'

const square: LocalPoint[] = [[-5, -5], [5, -5], [5, 5], [-5, 5]]
const circle: LocalPoint[] = Array.from({ length: 40 }, (_, i) => [10 * Math.cos((i / 40) * 2 * Math.PI), 10 * Math.sin((i / 40) * 2 * Math.PI)] as const)

describe('offsetOutline', () => {
  test('grows and shrinks a square by the given distance', () => {
    expect(offsetOutline(square, 1)[0][0]).toBeCloseTo(-6)
    expect(offsetOutline(square, -1)[2][1]).toBeCloseTo(4)
  })
  test('works the same on a clockwise outline', () => {
    const cw = [...square].reverse()
    expect(Math.max(...offsetOutline(cw, 1).map((p) => p[0]))).toBeCloseTo(6)
  })
})

describe('post layouts', () => {
  test('perimeter samples are evenly spaced round the outline', () => {
    const pts = perimeterSamples(square, 2.5)
    expect(pts).toHaveLength(16)
    expect(perimeterLength(square)).toBe(40)
  })
  test('curve posts ring a round deck and fill its middle, all inside it', () => {
    const pts = curvePosts(circle, 6, 1)
    expect(pts.length).toBeGreaterThan(10)
    expect(pts.every(([x, z]) => pointInPolygon(circle, x, z))).toBe(true)
    expect(pts.some(([x, z]) => Math.hypot(x, z) < 4)).toBe(true)
  })
  test('edge posts keep gaps under the limit', () => {
    expect(edgePosts([[0, 0], [24, 0], [24, 8], [0, 8]], 10)).toHaveLength(3 + 1 + 3 + 1)
  })
})

describe('buildSlab', () => {
  test('spans from the thickness below up to y 0 and faces up on top', () => {
    const m = buildSlab(square, 0.3)
    const b = bounds(m)
    expect(b.min[1]).toBeCloseTo(-0.3)
    expect(b.max[1]).toBeCloseTo(0)
    const ups = []
    for (let i = 1; i < m.normals.length; i += 3) if (m.positions[i] === 0 && m.normals[i] === 1) ups.push(i)
    expect(ups.length).toBe(6)
  })
  test('side faces point away from the slab', () => {
    const m = buildSlab(square, 0.3)
    for (let i = 0; i < m.normals.length; i += 3) {
      const ny = m.normals[i + 1]
      if (ny !== 0) continue
      const dot = m.positions[i] * m.normals[i] + m.positions[i + 2] * m.normals[i + 2]
      expect(dot).toBeGreaterThan(0)
    }
  })
})

describe('offsetOutline is polyOffset behind its guard (R11.3)', () => {
  /** offsetOutline as it was at 7f48074, before it called polyOffset. */
  function frozenOffsetOutline(poly: readonly LocalPoint[], d: number): LocalPoint[] {
    const n = poly.length
    if (n < 3 || d === 0) return [...poly]
    const s = signedArea(poly) > 0 ? 1 : -1
    const normals = poly.map((a, i) => {
      const b = poly[(i + 1) % n]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      return [(s * (b[1] - a[1])) / l, (-s * (b[0] - a[0])) / l] as const
    })
    return poly.map((p, i) => {
      const n0 = normals[(i + n - 1) % n]
      const n1 = normals[i]
      let mx = n0[0] + n1[0]
      let mz = n0[1] + n1[1]
      const ml = Math.hypot(mx, mz)
      if (ml < 1e-6) return [p[0] + n1[0] * d, p[1] + n1[1] * d] as const
      mx /= ml
      mz /= ml
      const c = Math.max(0.5, mx * n1[0] + mz * n1[1])
      return [p[0] + (mx * d) / c, p[1] + (mz * d) / c] as const
    })
  }
  const rings: Record<string, LocalPoint[]> = {
    square,
    'square, clockwise': [...square].reverse(),
    circle,
    'concave U': [[0, 0], [6, 0], [6, 5], [4, 5], [4, 2], [2, 2], [2, 5], [0, 5]],
    'odd decimals': [[0.1, 0.2], [3.7, -0.4], [4.9, 2.3], [2.2, 4.15], [-0.6, 2.8]],
    'collinear and repeated points': [[0, 0], [2, 0], [4, 0], [4, 0], [4, 4], [0, 4]],
    'zero area': [[0, 0], [2, 2], [4, 4]],
    'two points': [[0, 0], [3, 1]],
    'one point': [[1, 1]],
    empty: [],
  }
  for (const [name, ring] of Object.entries(rings)) {
    test(`gives the old answer on ${name}`, () => {
      for (const d of [0, 1.5, -0.75, 0.3048, -3, 1e-9]) {
        const got = offsetOutline(ring, d)
        const want = frozenOffsetOutline(ring, d)
        expect(got.length).toBe(want.length)
        got.forEach((p, i) => {
          expect(Object.is(p[0], want[i][0]) && Object.is(p[1], want[i][1]), `${name}, d ${d}, point ${i}`).toBe(true)
        })
      }
    })
  }
})
