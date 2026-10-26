import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../site/islandale'
import { elevationAt } from '../site/terrain'
import { ftToM } from '../site/units'
import { baseElevation } from './placement'
import type { PlanObject } from '../store/types'

const t = loadIslandaleTerrain()
const obj = (type: string, params: Record<string, unknown>): PlanObject => ({
  id: 'x', type, name: 'x', position: { x: -1.5, n: 0.5 }, rotation: 35, params, locked: false, hidden: false, labelVisible: true,
})

describe('object placement on the terrain', () => {
  test('a pad sits on the ground at its centre', () => {
    const o = obj('pad', { w: 10, d: 10 })
    expect(baseElevation(t, o)).toBeCloseTo(elevationAt(t, -1.5, 0.5), 9)
  })

  test('a building sits on its highest corner plus its lift', () => {
    const o = obj('house', { w: 28, d: 26, lift: 0.9 })
    const base = baseElevation(t, o)
    expect(base).toBeGreaterThanOrEqual(elevationAt(t, -1.5, 0.5) + ftToM(0.9) - 1e-9)
    const flat = baseElevation(t, obj('house', { w: 28, d: 26, lift: 0 }))
    expect(base - flat).toBeCloseTo(ftToM(0.9), 9)
  })
})
