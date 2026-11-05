import { describe, expect, test } from 'vitest'
import { ftToM } from '../site/units'
import { SNAP_DEG, SNAP_FT, snapDeg, snapPoint, snapSiteM } from './snap'

describe('snapping (old planner snapPos / snapAng)', () => {
  test('moves snap to a 1 ft grid in site metres', () => {
    expect(SNAP_FT).toBe(1)
    expect(snapSiteM(0)).toBe(0)
    expect(snapSiteM(0.2)).toBeCloseTo(ftToM(1), 10)
    expect(snapSiteM(0.1)).toBe(0)
    expect(snapSiteM(-3.2)).toBeCloseTo(ftToM(-10), 10)
    expect(snapSiteM(ftToM(12.49))).toBeCloseTo(ftToM(12), 10)
  })

  test('a point snaps on both axes', () => {
    const p = snapPoint({ x: 10.1, n: -3.2 })
    expect(p.x).toBeCloseTo(ftToM(33), 10)
    expect(p.n).toBeCloseTo(ftToM(-10), 10)
  })

  test('turns snap to 5° steps and stay in (-180, 180]', () => {
    expect(SNAP_DEG).toBe(5)
    expect(snapDeg(7)).toBe(5)
    expect(snapDeg(8)).toBe(10)
    expect(snapDeg(-2)).toBe(0)
    expect(snapDeg(178)).toBe(180)
    expect(snapDeg(-178)).toBe(180)
    expect(snapDeg(362)).toBe(0)
  })
})
