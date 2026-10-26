import { describe, expect, test } from 'vitest'
import terrainJson from '../../data/islandale/terrain.json'
import { loadIslandaleTerrain } from './islandale'
import { elevationAt, samplePosition, terrainBounds } from './terrain'
import { mToFt } from './units'

const LEGACY = { nx: 121, ny: 101, spacing: 2, samples: 121 * 101 }

describe('Islandale terrain grid', () => {
  const t = loadIslandaleTerrain()

  test('matches the legacy grid size and 2 m spacing', () => {
    expect(t.nx).toBe(LEGACY.nx)
    expect(t.ny).toBe(LEGACY.ny)
    expect(t.spacing).toBe(LEGACY.spacing)
    expect(t.z).toHaveLength(LEGACY.samples)
    expect(terrainJson.z).toHaveLength(LEGACY.samples)
  })

  test('is centred on the site origin like the legacy planner', () => {
    expect(t.x0).toBe(-120)
    expect(t.n0).toBe(-100)
    const b = terrainBounds(t)
    expect(b.maxX).toBe(120)
    expect(b.maxN).toBe(100)
  })

  test('keeps the legacy elevations, which are metres NAVD88', () => {
    expect(t.z[0]).toBe(terrainJson.z[0])
    expect(terrainJson.meta.units.z).toBe('m')
    const b = terrainBounds(t)
    // the lot runs from the beach (about 4 ft) up to about 46 ft
    expect(mToFt(b.minZ)).toBeGreaterThan(3)
    expect(mToFt(b.maxZ)).toBeGreaterThan(40)
    expect(mToFt(b.maxZ)).toBeLessThan(50)
  })

  test('returns the sample value exactly at a grid node', () => {
    const [x, n] = samplePosition(t, 40, 25)
    expect(elevationAt(t, x, n)).toBeCloseTo(t.z[25 * t.nx + 40], 9)
  })

  test('interpolates bilinearly between nodes', () => {
    const [x, n] = samplePosition(t, 10, 10)
    const k = 10 * t.nx + 10
    const expected = (t.z[k] + t.z[k + 1] + t.z[k + t.nx] + t.z[k + t.nx + 1]) / 4
    expect(elevationAt(t, x + 1, n + 1)).toBeCloseTo(expected, 9)
  })

  test('clamps points outside the grid to its edge', () => {
    expect(Number.isFinite(elevationAt(t, 5000, -5000))).toBe(true)
    expect(elevationAt(t, -1e6, -1e6)).toBeCloseTo(t.z[0], 6)
  })
})
