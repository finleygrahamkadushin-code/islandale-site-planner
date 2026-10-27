import { describe, expect, test } from 'vitest'
import { contourLevels, isoSegments, terrainContours } from './contours'
import { loadIslandale } from './islandale'
import { terrainBounds } from './terrain'
import type { Terrain } from './types'

const FT = 0.3048
// a plane rising 1 m per metre eastward
const ramp: Terrain = { lon0: 0, lat0: 0, spacing: 1, nx: 11, ny: 6, x0: 0, n0: 0, z: Array.from({ length: 66 }, (_, k) => k % 11) }

describe('isoSegments', () => {
  test('a level on a ramp is a straight north-south line at that height', () => {
    const segs = isoSegments({ nx: 11, ny: 6, x0: 0, n0: 0, spacing: 1, at: (i, j) => ramp.z[j * 11 + i] }, 3.5)
    expect(segs).toHaveLength(5)
    for (const [x1, , x2] of segs) {
      expect(x1).toBeCloseTo(3.5)
      expect(x2).toBeCloseTo(3.5)
    }
  })
})

describe('terrain contours', () => {
  test('levels sit on every 2 ft step between the lowest and highest ground, every fifth an index line', () => {
    const levels = contourLevels(0.1, 10.9, 2 * FT)
    expect(levels[0].ft).toBe(2)
    expect(levels.every((l, i) => i === 0 || Math.abs(l.ft - levels[i - 1].ft - 2) < 1e-9)).toBe(true)
    expect(levels.filter((l) => l.index).map((l) => l.ft)).toEqual([10, 20, 30])
  })

  test('every Islandale contour has segments, all at its own height', () => {
    const { terrain } = loadIslandale()
    const b = terrainBounds(terrain)
    const lines = terrainContours(terrain, 2 * FT)
    expect(lines.length).toBe(contourLevels(b.minZ, b.maxZ, 2 * FT).length)
    for (const l of lines) expect(l.segments.length).toBeGreaterThan(0)
  })
})
