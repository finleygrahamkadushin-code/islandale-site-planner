import { describe, expect, test } from 'vitest'
import { bounds, triangleCount } from '../geom'
import { RAIL_STYLES } from './railEdits'
import { buildRail, CABLE_M, CABLE_TOP_M, cableHeights, GUARD_HEIGHT_M, picketCount, STEEL_BOTTOM_Y_M, STEEL_PICKET_M, WOOD_BALUSTER_M, WOOD_BALUSTER_PITCH_M } from './railStyles'

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
  test('steel has pickets, cable its cables, so each draws more than a bare frame', () => {
    const tris = (s: 'steel' | 'cable' | 'glass') => triangleCount(buildRail(run, 0, s)!.frame)
    expect(tris('steel')).toBeGreaterThan(tris('glass'))
    expect(tris('cable')).toBeGreaterThan(tris('glass'))
  })
})

describe('infill leaves no gap a 4 in sphere passes (R3.7)', () => {
  const IN = 0.0254
  const FOUR = 4 * IN
  test('wood balusters: under 4 in clear', () => {
    expect(WOOD_BALUSTER_PITCH_M - WOOD_BALUSTER_M).toBeLessThan(FOUR)
  })
  test('steel pickets: under 4 in clear on every run length, not 4.3 in on short ones', () => {
    for (let total = 0.3; total < 12; total += 0.037) {
      const n = picketCount(total)
      expect(total / n - STEEL_PICKET_M, `run ${total.toFixed(3)} m`).toBeLessThan(FOUR)
    }
  })
  test('steel: the gap under the bottom rail is under 4 in', () => {
    expect(STEEL_BOTTOM_Y_M).toBeLessThan(FOUR)
  })
  test('cable: every gap, the one under the top rail included, is 3 in or less (cables stretch)', () => {
    const ys = cableHeights(0)
    const edges = [0, ...ys.flatMap((y) => [y - CABLE_M / 2, y + CABLE_M / 2]), GUARD_HEIGHT_M - CABLE_TOP_M]
    for (let k = 0; k + 1 < edges.length; k += 2) expect(edges[k + 1] - edges[k]).toBeLessThanOrEqual(3 * IN + 1e-9)
  })
})
