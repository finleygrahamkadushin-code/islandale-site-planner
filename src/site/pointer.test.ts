import { describe, expect, test } from 'vitest'
import { FT_PER_M } from './units'
import { groundReadout } from './pointer'

describe('pointer readout (4B, old cursor elevation and slope)', () => {
  test('elevation in feet NAVD88 and slope in percent on a known plane', () => {
    // rises 10 cm per metre east and 0 north: a 10 % slope
    const plane = (x: number) => 2 + 0.1 * x
    const r = groundReadout((x) => plane(x), 5, 7)
    expect(r.elevFt).toBeCloseTo(plane(5) * FT_PER_M, 6)
    expect(r.slopePct).toBeCloseTo(10, 6)
  })

  test('slope is the steepest way, whatever its direction', () => {
    const r = groundReadout((x, n) => 0.03 * x + 0.04 * n, 0, 0)
    expect(r.slopePct).toBeCloseTo(5, 6)
  })

  test('flat ground reads 0 %', () => {
    expect(groundReadout(() => 3, 1, 1).slopePct).toBe(0)
  })
})
