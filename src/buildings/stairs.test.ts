import { describe, expect, test } from 'vitest'
import { stairLayout, stairMath } from './stairs'

const IN = 0.0254

describe('stairMath (legacy rule: risers of 7 in or less, 11 in treads)', () => {
  test('a 3 ft drop gives 6 risers of 6 in and 5 treads', () => {
    const s = stairMath(36 * IN)
    expect(s.risers).toBe(6)
    expect(s.riserIn).toBeCloseTo(6)
    expect(s.treads).toBe(5)
    // the legacy run is one tread per riser, the last one on the ground
    expect(s.runIn).toBe(66)
  })
  test('no riser is ever over 7 in', () => {
    for (let inches = 1; inches < 140; inches += 0.7) expect(stairMath(inches * IN).riserIn).toBeLessThanOrEqual(7 + 1e-9)
  })
  test('under half an inch needs no stair', () => {
    expect(stairMath(0.3 * IN).risers).toBe(0)
  })
})

describe('stairLayout', () => {
  test('starts at the floor on the -z end and steps down outward to the ground', () => {
    const s = stairLayout({ widthFt: 5, nominalRunFt: 5, floor: 10, groundAt: () => 10 - 36 * IN })
    expect(s.steps).toHaveLength(5)
    expect(s.steps[0].z0).toBeCloseTo(-2.5)
    expect(s.steps[0].top).toBeCloseTo(10 - 6 * IN)
    const last = s.steps[s.steps.length - 1]
    expect(last.z1).toBeCloseTo(-2.5 + 55 / 12)
    expect(last.top).toBeCloseTo(10 - 30 * IN)
    expect(s.footZ).toBeCloseTo(-2.5 + 66 / 12)
  })
  test('settles the riser count on the ground at its own foot, on a slope', () => {
    // ground 18 in below the floor edge, falling 3 in per foot outward
    const ground = (z: number) => 5 - 18 * IN - Math.max(0, z + 2) * 3 * IN
    const s = stairLayout({ widthFt: 4, nominalRunFt: 4, floor: 5, groundAt: ground })
    expect(s.drop).toBeCloseTo(5 - ground(s.footZ), 2)
    expect(s.math.risers).toBe(stairMath(s.drop).risers)
  })
  test('no drop, no steps', () => {
    expect(stairLayout({ widthFt: 4, nominalRunFt: 4, floor: 5, groundAt: () => 5.2 }).steps).toEqual([])
  })
})
