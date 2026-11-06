import { describe, expect, test } from 'vitest'
import { usePlanStore } from '../../store/planStore'
import { elevationAt } from '../terrain'
import { DRIFT_LINE_FT, driftwood, foamSegments, seeded } from './shore'

const terrain = () => usePlanStore.getState().site.terrain
const FT = 0.3048

describe('shore (4E)', () => {
  test('the foam line sits where the ground meets the tide, and moves with it', () => {
    const low = foamSegments(terrain(), 6)
    const high = foamSegments(terrain(), 10)
    expect(low.length).toBeGreaterThan(0)
    for (const [x, n] of low.slice(0, 50)) expect(elevationAt(terrain(), x, n)).toBeCloseTo(6 * FT, 1)
    for (const [x, n] of high.slice(0, 50)) expect(elevationAt(terrain(), x, n)).toBeCloseTo(10 * FT, 1)
    expect(JSON.stringify(low)).not.toBe(JSON.stringify(high))
  })

  test('driftwood lies on the wrack line, the same every time', () => {
    const bounds = { x0: -80, x1: 80, n0: -80, n1: 80 }
    const a = driftwood(terrain(), bounds)
    expect(a.length).toBeGreaterThan(2)
    expect(driftwood(terrain(), bounds)).toEqual(a)
    for (const log of a) {
      expect(elevationAt(terrain(), log.x, log.n)).toBeCloseTo(DRIFT_LINE_FT * FT, 0)
      expect(log.x).toBeGreaterThanOrEqual(-80)
      expect(log.lengthM).toBeGreaterThan(1)
    }
  })

  test('the seeded generator repeats', () => {
    const r1 = seeded(3)
    const r2 = seeded(3)
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
  })
})
