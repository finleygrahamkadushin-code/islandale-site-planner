import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../site/islandale'
import { elevationAt } from '../site/terrain'
import { FT_PER_M } from '../site/units'
import type { PlanObject } from '../store/types'
import { clearanceRows, selectionStats } from './selectionStats'
import { planFromScheme } from '../store/fromLegacy'
import { loadSchemes, schemeById } from '../site/schemes'
import { DEFAULT_SETBACKS } from '../store/types'

const site = loadIslandale()
const { terrain } = site
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

describe('clearance rows (5E)', () => {
  const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
  const prow = plan.objects['C-0']

  test("the Gathering prow reads to shore, to lot line and to nearest, none in warning at the default setbacks", () => {
    const rows = clearanceRows(prow, plan, site, DEFAULT_SETBACKS)
    expect(rows.map((r) => r.label)).toEqual(['To shore', 'To lot line', 'To nearest'])
    // to shore is to the approximate high-water line (item 11; 80'-1" to the lot line before); past bank is from the top of bank, 45 ft in from the lot line, unchanged
    expect(rows[0].text).toBe(`69'-9" to shore · 35'-1" past bank`)
    expect(rows.some((r) => r.warn)).toBe(false)
  })

  test('the strict 50 ft setback puts the prow inside the buffer, in warning', () => {
    const rows = clearanceRows(prow, plan, site, { ...DEFAULT_SETBACKS, shoreFt: 50 })
    expect(rows[0]).toMatchObject({ warn: true, text: expect.stringMatching(/inside buffer$/) })
  })

  test('a lone object has no nearest row', () => {
    const solo = { ...plan, objects: { [prow.id]: prow }, order: [prow.id] }
    expect(clearanceRows(prow, solo, site, DEFAULT_SETBACKS).map((r) => r.label)).toEqual(['To shore', 'To lot line'])
  })
})
