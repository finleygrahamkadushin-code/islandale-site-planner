import { describe, expect, test } from 'vitest'
import { stairGeomMath, stairMath } from './stairs'

const IN = 0.0254

describe('stairMath (stair-connect form: risers of 7 in or less, 11 in treads)', () => {
  test('a 3 ft drop gives 6 risers of 6 in and 5 treads', () => {
    const s = stairMath(36 * IN)
    expect(s.risers).toBe(6)
    expect(s.riserIn).toBeCloseTo(6)
    expect(s.treads).toBe(5)
    // n risers need n - 1 treads: the run is 5 × 11 in (R3.4; the old planner ran 6 × 11 in)
    expect(s.runIn).toBe(55)
  })
  test('no riser is ever over 7 in', () => {
    for (let inches = 1; inches < 140; inches += 0.7) expect(stairMath(inches * IN).riserIn).toBeLessThanOrEqual(7 + 1e-9)
  })
  test('under half an inch needs no stair', () => {
    expect(stairMath(0.3 * IN).risers).toBe(0)
  })
})

describe('stairGeomMath (stair-geom form: the run is fixed, the n - 1 treads share it)', () => {
  test('a 3 ft drop over a 4 ft run: 6 risers of 6 in and 5 treads of 9.6 in, flagged short', () => {
    const s = stairGeomMath(36 * IN, 48 * IN)
    expect(s.n).toBe(6)
    expect(s.rise / IN).toBeCloseTo(6)
    expect(s.tread / IN).toBeCloseTo(9.6)
    expect(s.ok).toBe(false)
  })
  test('the same drop over 55 in, five 11 in treads, meets 7 in / 11 in (R3.4)', () => {
    const s = stairGeomMath(36 * IN, 55 * IN)
    expect(s.tread / IN).toBeCloseTo(11)
    expect(s.ok).toBe(true)
  })
  test('one riser has no tread below the top; the whole run is the step down', () => {
    expect(stairGeomMath(5 * IN, 12 * IN)).toMatchObject({ n: 1, ok: true })
  })
  test('a drop just over a whole number of risers takes one more', () => {
    expect(stairGeomMath(14 * IN, 2).n).toBe(2)
    expect(stairGeomMath(14.01 * IN, 2).n).toBe(3)
  })
  test('under half an inch needs no riser and the tread is the whole run', () => {
    expect(stairGeomMath(0.2 * IN, 2)).toEqual({ n: 0, rise: 0, tread: 2, ok: true })
  })
})
