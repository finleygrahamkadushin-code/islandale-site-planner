import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../site/islandale'
import { elevationAt } from '../site/terrain'
import { FT_PER_M } from '../site/units'
import type { PlanObject } from '../store/types'
import { selectionStats } from './selectionStats'

const { terrain } = loadIslandale()
const obj = (type: string, params: Record<string, unknown>): PlanObject => ({ id: 'x', type, name: 'X', position: { x: 5, n: -5 }, rotation: 0, params, locked: false, hidden: false, labelVisible: true })

describe('selection stats (4B)', () => {
  test('a 20 x 16 cabin covers 320 sq ft, and its floor is at or above the lowest ground under it', () => {
    const s = selectionStats(obj('house', { w: 20, d: 16, h: 9 }), terrain)
    expect(s.areaSqFt).toBeCloseTo(320, 6)
    expect(s.floorFt).toBeGreaterThanOrEqual(s.lowestGroundFt - 1e-6)
    expect(s.lowestGroundFt).toBeLessThanOrEqual(elevationAt(terrain, 5, -5) * FT_PER_M + 1e-6)
  })

  test('anything else counts its footprint box, so an 18 ft tree shows 324 sq ft', () => {
    expect(selectionStats(obj('tree', { w: 18, d: 18, h: 30, tree: true }), terrain).areaSqFt).toBeCloseTo(324, 3)
  })
})
