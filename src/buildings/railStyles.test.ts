import { describe, expect, test } from 'vitest'
import { bounds, triangleCount } from './geom'
import { RAIL_STYLES } from './railEdits'
import { buildRail, GUARD_HEIGHT_M } from './railStyles'

const run = [[[0, 0], [20, 0], [20, 10]] as const]

describe('buildRail', () => {
  test('every drawn style tops out at 36 in above the walking surface', () => {
    for (const style of ['wood', 'steel', 'cable', 'glass'] as const) {
      const g = buildRail(run, 0.5, style)!
      expect(triangleCount(g.frame), style).toBeGreaterThan(0)
      expect(bounds(g.frame).max[1], style).toBeCloseTo(0.5 + GUARD_HEIGHT_M, 3)
      expect(bounds(g.frame).min[1], style).toBeCloseTo(0.5, 3)
    }
    expect(GUARD_HEIGHT_M).toBeCloseTo(36 * 0.0254)
  })
  test("'none' draws nothing", () => {
    expect(buildRail(run, 0, 'none')).toBeNull()
  })
  test('only glass has panes, inside the frame', () => {
    const glass = buildRail(run, 0, 'glass')!
    expect(triangleCount(glass.glass!)).toBe(2 * 12)
    expect(bounds(glass.glass!).max[1]).toBeLessThan(GUARD_HEIGHT_M)
    for (const style of RAIL_STYLES.filter((s) => s !== 'glass' && s !== 'none')) expect(buildRail(run, 0, style)!.glass).toBeNull()
  })
  test('steel has pickets every 11 cm, cable seven cables, so each draws more than a bare frame', () => {
    const tris = (s: 'steel' | 'cable' | 'glass') => triangleCount(buildRail(run, 0, s)!.frame)
    expect(tris('steel')).toBeGreaterThan(tris('glass'))
    expect(tris('cable')).toBeGreaterThan(tris('glass'))
  })
})
