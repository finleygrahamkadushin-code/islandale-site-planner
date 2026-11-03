import { describe, expect, test } from 'vitest'
import { signedArea } from './footprint'
import { blobDefault, organicFit, organicOutline, organicScale, polyOffset, ribbonOutline, ribbonSides, shapeParamKey } from './organic'

const area = (P: readonly (readonly [number, number])[]) => Math.abs(signedArea(P))
const box = (P: readonly (readonly [number, number])[]) => {
  const xs = P.map((p) => p[0])
  const zs = P.map((p) => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), minz: Math.min(...zs), maxz: Math.max(...zs) }
}

describe('organic outlines (legacy organicPoly)', () => {
  test('an ellipse fills its box with πab, wound positive, starting at the back centre', () => {
    const P = organicOutline({ shape: 'ellipse', w: 30, d: 20 })
    expect(area(P)).toBeCloseTo(Math.PI * 15 * 10, -0.5)
    expect(signedArea(P)).toBeGreaterThan(0)
    expect(P[0][0]).toBeCloseTo(0, 6)
    expect(P[0][1]).toBeCloseTo(-10, 6)
    expect(box(P).w).toBeCloseTo(30, 0)
  })

  test('chords run about 1.5 ft, between 32 and 96 points', () => {
    expect(organicOutline({ shape: 'ellipse', w: 6, d: 6 })).toHaveLength(32)
    expect(organicOutline({ shape: 'ellipse', w: 200, d: 200 })).toHaveLength(96)
    const P = organicOutline({ shape: 'ellipse', w: 40, d: 30 })
    const perim = P.reduce((s, p, i) => s + Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1]), 0)
    expect(perim / P.length).toBeGreaterThan(1.3)
    expect(perim / P.length).toBeLessThan(1.7)
  })

  test("a kidney's bite pulls the back centre in, deeper with bend, inside the same box", () => {
    const soft = organicOutline({ shape: 'kidney', w: 30, d: 20, bend: 0.2 })
    const deep = organicOutline({ shape: 'kidney', w: 30, d: 20, bend: 0.6 })
    expect(soft[0][0]).toBeCloseTo(0, 6)
    expect(soft[0][1]).toBeGreaterThan(-10 + 0.5)
    expect(deep[0][1]).toBeGreaterThan(soft[0][1])
    expect(box(deep).w).toBeCloseTo(30, 0)
    expect(box(deep).d).toBeCloseTo(20, 0)
  })

  test("a teardrop's point sharpens with point and it starts at its back centre", () => {
    const blunt = organicOutline({ shape: 'teardrop', w: 16, d: 24, point: 0 })
    const sharp = organicOutline({ shape: 'teardrop', w: 16, d: 24, point: 1 })
    expect(area(sharp)).toBeLessThan(area(blunt))
    expect(sharp[0][1]).toBeCloseTo(box(sharp).minz, 6)
    expect(signedArea(sharp)).toBeGreaterThan(0)
  })

  test('a blob passes through its control points', () => {
    const pts = [[0, -10], [9, -6], [10, 4], [-2, 9], [-9, 2]]
    const P = organicOutline({ shape: 'blob', w: 20, d: 20, pts })
    for (const [x, z] of pts) {
      const near = Math.min(...P.map((p) => Math.hypot(p[0] - x, p[1] - z)))
      expect(near).toBeLessThan(1)
    }
    expect(signedArea(P)).toBeGreaterThan(0)
  })

  test('a blob with no points uses the old default blob over its box', () => {
    const P = organicOutline({ shape: 'blob', w: 20, d: 10 })
    const D = blobDefault(20, 10)
    expect(Math.min(...P.map((p) => Math.hypot(p[0] - D[2][0], p[1] - D[2][1])))).toBeLessThan(0.8)
  })
})

describe('ribbons', () => {
  test("a ribbon's edges sit half its width either side of the centreline", () => {
    const s = ribbonSides({ w: 40, d: 6, pts: [[-20, 0], [0, 6], [20, 0]] })
    s.C.forEach((c, i) => {
      expect(Math.hypot(s.L[i][0] - c[0], s.L[i][1] - c[1])).toBeCloseTo(3, 6)
      expect(Math.hypot(s.R[i][0] - c[0], s.R[i][1] - c[1])).toBeCloseTo(3, 6)
    })
    expect(signedArea(ribbonOutline({ w: 40, d: 6, pts: [[-20, 0], [0, 6], [20, 0]] }))).toBeGreaterThan(0)
  })

  test("a ribbon's w is its centreline length (orgFit) and a new w scales the centreline (orgScale)", () => {
    const m = { shape: 'ribbon', w: 10, d: 4, pts: [[0, 0], [30, 0], [30, 40]] }
    const fit = organicFit(m, [])!
    expect(fit.w).toBeGreaterThan(65)
    expect(fit.d).toBe(4)
    expect(organicScale({ ...m, w: 20 }, 40, 4)).toEqual([[0, 0], [60, 0], [60, 80]])
  })
})

describe('editing shapes', () => {
  test('a new width and depth scale a blob about its centre; unchanged gives null', () => {
    const m = { shape: 'blob', w: 20, d: 10, pts: [[0, -5], [10, 0], [0, 5], [-10, 0]] }
    expect(organicScale(m, 40, 10)).toEqual([[0, -5], [20, 0], [0, 5], [-20, 0]])
    expect(organicScale(m, 20, 10)).toBeNull()
    expect(organicScale({ shape: 'ellipse', w: 20, d: 10 }, 30, 10)).toBeNull()
  })

  test("a blob's box is read back from its curve", () => {
    const m = { shape: 'blob', w: 1, d: 1, pts: [[0, -5], [10, 0], [0, 5], [-10, 0]] }
    const fit = organicFit(m, organicOutline(m))!
    expect(fit.w).toBeGreaterThan(19)
    expect(fit.d).toBeGreaterThan(9)
  })

  test('the extra field per shape', () => {
    expect(shapeParamKey('kidney')).toBe('bend')
    expect(shapeParamKey('teardrop')).toBe('point')
    expect(shapeParamKey('para')).toBe('skew')
    expect(shapeParamKey('trap')).toBe('taper')
  })

  test('polyOffset grows and shrinks a curve by about k', () => {
    const P = organicOutline({ shape: 'ellipse', w: 20, d: 20 })
    expect(box(polyOffset(P, 1)).w).toBeCloseTo(22, 0)
    expect(box(polyOffset(P, -1)).w).toBeCloseTo(18, 0)
  })
})
