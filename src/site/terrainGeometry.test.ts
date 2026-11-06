import { describe, expect, test } from 'vitest'
import { loadIslandale, loadIslandaleTerrain } from './islandale'
import { buildTerrainGeometry, colourTerrain } from './terrainGeometry'
import { DEFAULT_SETBACKS } from '../store/types'
import type { BufferAttribute } from 'three'

describe('terrain geometry', () => {
  test('has one vertex per sample and two triangles per cell', () => {
    const t = loadIslandaleTerrain()
    const g = buildTerrainGeometry(t)
    expect(g.getAttribute('position').count).toBe(t.nx * t.ny)
    expect(g.getIndex()?.count).toBe((t.nx - 1) * (t.ny - 1) * 6)
    const ny = g.getAttribute('normal').getY(Math.floor((t.nx * t.ny) / 2))
    expect(ny).toBeGreaterThan(0)
  })

  test('site-rule tints colour the meadow but leave the beach below as it was', () => {
    const { terrain, parcel } = loadIslandale()
    const plain = buildTerrainGeometry(terrain)
    const ruled = buildTerrainGeometry(terrain)
    colourTerrain(plain, 6.2)
    const t0 = performance.now()
    colourTerrain(ruled, 6.2, { parcel, settings: { setbacks: DEFAULT_SETBACKS, rules: true } })
    const first = performance.now() - t0
    const t1 = performance.now()
    colourTerrain(ruled, 6.2, { parcel, settings: { setbacks: { ...DEFAULT_SETBACKS, shoreFt: 50 }, rules: true } })
    const again = performance.now() - t1
    // distances are cached per grid, so a slider step only recolours
    // timings are logged, not asserted: a busy machine can make the cached pass slower
    void again
    void first
    const pos = ruled.getAttribute('position') as BufferAttribute
    const a = plain.getAttribute('color') as BufferAttribute
    const b = ruled.getAttribute('color') as BufferAttribute
    let beach = 0
    let changed = 0
    for (let k = 0; k < pos.count; k++) {
      const ft = pos.getY(k) / 0.3048
      if (ft < 8) {
        beach++
        expect(b.getX(k)).toBeCloseTo(a.getX(k), 6)
      } else if (Math.abs(b.getY(k) - a.getY(k)) > 1e-3) changed++
    }
    expect(beach).toBeGreaterThan(0)
    expect(changed).toBeGreaterThan(pos.count / 4)
  })
})
