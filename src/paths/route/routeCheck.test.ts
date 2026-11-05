import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../../store/types'
import type { Ground } from '../pieces'
import { checkPieces, type PieceVerdict } from './routeCheck'
import { routeItems } from './routeCollect'
import { routeGraph } from './routeGraph'
import { FT, pad } from './routeTestKit'

const flat: Ground = () => 0
const risingEast =
  (s: number): Ground =>
  (x) =>
    x * s

function verdicts(objects: PlanObject[], ground: Ground): ReadonlyMap<string, PieceVerdict> {
  return checkPieces(routeGraph(routeItems(objects, ground), []))
}
const codes = (v: PieceVerdict | undefined) => (v?.issues ?? []).map((i) => i.code)

describe('running slope', () => {
  test('a walk on 1:25 ground passes', () => {
    // Arrange
    const walk = pad('w', 'walk', 20, 4, 0, 0)

    // Act
    const v = verdicts([walk], risingEast(1 / 25)).get('w')

    // Assert
    expect(v?.verdict).toBe('pass')
    expect(v?.slope).toBeCloseTo(0.04, 3)
  })

  test('a walk on 1:20 ground passes', () => {
    const v = verdicts([pad('w', 'walk', 20, 4, 0, 0)], risingEast(1 / 20)).get('w')
    expect(v?.ok).toBe(true)
  })

  test('a walk on 1:10 ground fails as too steep for a walk, with the old wording', () => {
    // Act
    const v = verdicts([pad('w', 'walk', 20, 4, 0, 0)], risingEast(1 / 10)).get('w')!

    // Assert
    expect(v.verdict).toBe('fail')
    expect(codes(v)).toEqual(['walk-slope'])
    expect(v.issues[0].text).toBe('Walk running slope 10.0 % over 20 ft exceeds 1:20 (5 %); steeper than 1:20 is a ramp — ADA 403.3 / A117.1 403.3, ADA 405')
    expect(v.issues[0].fix).toBe('10.0 % over 20 ft — turn this into a ramp, or lengthen it to 40 ft for 1:20 (a ramp would need 24 ft at 1:12)')
  })

  test('a ramp steeper than 1:12 fails', () => {
    // Arrange: 12 ft rising 1.5 ft is 1:8
    const ramp = pad('r', 'ramp', 12, 4, 0, 0, 0, { ends: { zA: 0, zB: 1.5 * FT }, rail: true })

    // Act
    const v = verdicts([ramp], flat).get('r')!

    // Assert
    expect(codes(v)).toContain('ramp-slope')
    expect(v.issues.find((i) => i.code === 'ramp-slope')?.short).toBe('ramp 12.5 % > 8.33 %')
  })

  test('a ramp rising more than 30 in fails for its rise, and wants handrails over 6 in', () => {
    const ramp = pad('r', 'ramp', 48, 4, 0, 0, 0, { ends: { zA: 0, zB: 3 * FT }, rail: false })
    const v = verdicts([ramp], flat).get('r')!
    expect(codes(v)).toEqual(expect.arrayContaining(['ramp-rise', 'handrail']))
    expect(codes(v)).not.toContain('ramp-slope')
  })

  test('a landing on sloping ground passes: it takes its higher end at both ends', () => {
    const v = verdicts([pad('l', 'landing', 5, 5, 0, 0)], risingEast(1 / 10)).get('l')!
    expect(v.ok).toBe(true)
  })
})

describe('width and cross slope', () => {
  test('a 30 in walk fails as too narrow', () => {
    const v = verdicts([pad('w', 'walk', 10, 2.5, 0, 0)], flat).get('w')!
    expect(codes(v)).toEqual(['width'])
    expect(v.issues[0].text).toBe('Clear width 30 in is under 36 in — ADA 403.5.1, 405.5 / A117.1 403.5.1, 405.5')
  })

  test('a walk across a 1:20 side slope fails its cross slope', () => {
    // the ground rises north; the walk runs east
    const v = verdicts([pad('w', 'walk', 10, 4, 0, 0)], (_x, n) => n / 20).get('w')!
    expect(codes(v)).toEqual(['cross-slope'])
  })
})

describe('stairs and joins', () => {
  test('a stair is not checked: never part of an accessible route', () => {
    const v = verdicts([pad('s', 'stair', 8, 4, 0, 0, 0, { ends: { zA: 0, zB: 1 } })], flat).get('s')!
    expect(v.verdict).toBe('n/a')
    expect(v.note).toMatch(/never part of an accessible route/)
  })

  test('a 3 in step between two walks fails at the joined ends', () => {
    // Arrange: a boardwalk 3 in up meets a walk on the ground
    const a = pad('a', 'walk', 10, 4, -10 * FT * 0.5, 0)
    const b = pad('b', 'boardwalk', 10, 4, 10 * FT * 0.5, 0, 0, { ends: { zA: 3 * 0.0254, zB: 3 * 0.0254 } })

    // Act
    const v = verdicts([a, b], flat)

    // Assert
    expect(codes(v.get('a'))).toEqual(['step'])
    expect(v.get('a')!.issues[0].text).toMatch(/^Step of 3 in at end B/)
    expect(v.get('b')!.issues[0].join).toEqual({ end: 'A', z: 0 })
  })

  test('an end 2 ft short of the next piece is a gap', () => {
    const a = pad('a', 'walk', 10, 4, -10 * FT * 0.5 - 0.3, 0)
    const b = pad('b', 'walk', 10, 4, 10 * FT * 0.5 + 0.3, 0)
    expect(codes(verdicts([a, b], flat).get('a'))).toEqual(['gap'])
  })

  test('a 1:12 ramp with level landings at both ends and rails passes', () => {
    // Arrange: landing (5 ft) · ramp (12 ft, 1 ft up) · landing (5 ft), end to end along x
    const L = 5 * FT
    const R = 12 * FT
    const bottom = pad('lo', 'landing', 5, 5, L / 2, 0, 0, { ends: { zA: 0, zB: 0 } })
    const ramp = pad('r', 'ramp', 12, 4, L + R / 2, 0, 0, { ends: { zA: 0, zB: FT }, rail: true })
    const top = pad('hi', 'landing', 5, 5, L + R + L / 2, 0, 0, { ends: { zA: FT, zB: FT } })

    // Act
    const v = verdicts([bottom, ramp, top], flat)

    // Assert
    expect(v.get('r')?.issues).toEqual([])
    expect([...v.values()].every((x) => x.ok)).toBe(true)
  })

  test('a lone ramp needs a landing at its top and bottom', () => {
    const v = verdicts([pad('r', 'ramp', 12, 4, 0, 0, 0, { ends: { zA: 0, zB: FT }, rail: true })], flat).get('r')!
    expect(codes(v)).toEqual(['landing-bottom', 'landing-top'])
  })
})
