import { describe, expect, test } from 'vitest'
import { curvePosts, edgePosts, offsetOutline, perimeterLength, perimeterSamples } from './outline'
import { buildSlab } from './slab'
import { pointInPolygon } from './foundation'
import { bounds } from './geom'
import type { LocalPoint } from './footprint'

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
