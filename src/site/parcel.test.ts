import { describe, expect, test } from 'vitest'
import { loadIslandaleParcel } from './islandale'
import { isShorelineEdge, ringArea, ringEdges } from './parcel'
import { sqFtToAcres, sqMToSqFt } from './units'

const LEGACY = { lotSqFt: 20847, acres: '0.48' }

describe('Islandale parcel', () => {
  const p = loadIslandaleParcel()

  test('carries the assessor lot area from the legacy file', () => {
    expect(p.lotSqFt).toBe(LEGACY.lotSqFt)
    expect(sqFtToAcres(p.lotSqFt).toFixed(2)).toBe(LEGACY.acres)
  })

  test('ring area agrees with the assessor area to within 1%', () => {
    const sqft = sqMToSqFt(ringArea(p.ring))
    expect(Math.abs(sqft - LEGACY.lotSqFt) / LEGACY.lotSqFt).toBeLessThan(0.01)
    expect(sqFtToAcres(sqft).toFixed(2)).toBe(LEGACY.acres)
  })

  test('ring is a closed polygon of finite metres', () => {
    expect(p.ring.length).toBeGreaterThan(3)
    for (const [x, n] of p.ring) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(n)).toBe(true)
      expect(Math.abs(x)).toBeLessThan(120)
      expect(Math.abs(n)).toBeLessThan(100)
    }
    expect(ringEdges(p.ring)).toHaveLength(p.ring.length)
  })

  test('shoreline edges are a valid range inside the ring', () => {
    const { first, last } = p.shorelineEdges
    expect(first).toBeGreaterThanOrEqual(0)
    expect(last).toBeGreaterThan(first)
    expect(last).toBeLessThan(p.ring.length)
    expect(isShorelineEdge(p, first)).toBe(true)
    expect(isShorelineEdge(p, last)).toBe(true)
    expect(isShorelineEdge(p, first - 1)).toBe(false)
    expect(isShorelineEdge(p, last + 1)).toBe(false)
  })

  test('shoelace area is exact on a known square', () => {
    expect(ringArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(100)
  })
})
