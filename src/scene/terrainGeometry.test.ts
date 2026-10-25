import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../site/islandale'
import { buildTerrainGeometry } from './terrainGeometry'

describe('terrain geometry', () => {
  test('has one vertex per sample and two triangles per cell', () => {
    const t = loadIslandaleTerrain()
    const g = buildTerrainGeometry(t)
    expect(g.getAttribute('position').count).toBe(t.nx * t.ny)
    expect(g.getIndex()?.count).toBe((t.nx - 1) * (t.ny - 1) * 6)
    const ny = g.getAttribute('normal').getY(Math.floor((t.nx * t.ny) / 2))
    expect(ny).toBeGreaterThan(0)
  })
})
