import { describe, expect, test } from 'vitest'
import { layoutStair, risersFor, runFt, stairMath } from './connectStair'
import { ftIn, reverseSpec, specEnds } from './connectSpec'

const FT = 0.3048
const IN = 0.0254
const flat = () => 0

describe('stair math', () => {
  test('risers are 7 in or less: 36 in takes 6, 42 in takes 6, 43 in takes 7, under half an inch none', () => {
    expect(risersFor(36 * IN)).toBe(6)
    expect(risersFor(42 * IN)).toBe(6)
    expect(risersFor(43 * IN)).toBe(7)
    expect(risersFor(0.4 * IN)).toBe(0)
  })

  test('stairMath gives 11 in treads and the run for the risers', () => {
    const m = stairMath(-36 * IN)
    expect(m).toMatchObject({ risers: 6, riserIn: 6, treadIn: 11, treads: 5, runIn: 66 })
    expect(m.runFt).toBeCloseTo(5.5, 9)
    expect(runFt(6)).toBeGreaterThanOrEqual(5.5)
  })

  test('ftIn writes feet and inches', () => {
    expect(ftIn(154)).toBe('12 ft 10 in')
    expect(ftIn(24)).toBe('2 ft')
    expect(ftIn(7)).toBe('7 in')
  })
})

describe('layoutStair', () => {
  test('a gap within a foot of the run stretches the treads instead of adding a sliver pad', () => {
    // Arrange: 36 in rise needs 5.5 ft; the foot is 6 ft away
    const T: [number, number] = [0, 0]
    const F: [number, number] = [6 * FT, 0]

    // Act
    const L = layoutStair(T, F, 36 * IN, 0, { widthFt: 4 })

    // Assert
    expect(L.type).toBe('straight')
    expect(L.pad).toBeNull()
    expect(L.specs).toHaveLength(1)
    expect(L.specs[0].w).toBeCloseTo(6, 5)
    const E = specEnds(L.specs[0], flat)
    expect(Math.hypot(E.B[0] - F[0], E.B[1] - F[1])).toBeLessThan(0.001)
  })

  test('a long gap gets a level pad, a landing up to 8 ft and a boardwalk beyond', () => {
    const short = layoutStair([0, 0], [10 * FT, 0], 36 * IN, 0, { widthFt: 4 })
    const long = layoutStair([0, 0], [20 * FT, 0], 36 * IN, 0, { widthFt: 4 })
    expect(short.pad).toEqual({ kind: 'landing', lenFt: 4.5 })
    expect(long.pad).toEqual({ kind: 'boardwalk', lenFt: 14.5 })
    expect(long.specs[1].ends).toEqual({ zA: 0, zB: 0 })
  })

  test('a top on an edge slides along it so the straight run heads square off the edge toward the foot', () => {
    // Arrange: an east-facing edge from (0,-5) to (0,5); the foot is east and 2 m north of the picked top
    const edge = { a: [0, -5] as const, b: [0, 5] as const }

    // Act
    const L = layoutStair([0, -3], [8 * FT, 2], 36 * IN, 0, { widthFt: 4, dir: [1, 0], edge })

    // Assert
    expect(L.T[0]).toBeCloseTo(0, 9)
    expect(L.T[1]).toBeCloseTo(2, 9)
    expect(L.specs[0].rotation).toBe(0)
  })

  test('reverseSpec runs the same piece the other way', () => {
    const L = layoutStair([0, 0], [6 * FT, 0], 36 * IN, 0, { widthFt: 4 })
    const r = reverseSpec(L.specs[0])
    expect(r.rotation).toBe(180)
    expect(r.ends).toEqual({ zA: L.specs[0].ends.zB, zB: L.specs[0].ends.zA })
    expect(r.position).toEqual(L.specs[0].position)
  })
})
