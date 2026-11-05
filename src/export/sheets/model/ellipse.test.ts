import { describe, expect, test } from 'vitest'
import { buildingMasses, massBuildingPoly, type Mass } from '../../../buildings/masses'
import { FOUR_CENTRE_MAX_FT, fourCentre, fourCentreArcs } from './ellipse'

/** An ellipse wing as the sheets read it. */
const ellipseWing = (w: number, d: number, rot: number, dx = 4, dz = -3): Mass =>
  buildingMasses({ w: 10, d: 10, wings: [{ kind: 'wall', shape: 'ellipse', w, d, rot, dx, dz }] })[1]

describe('fourCentre', () => {
  test('meets without a kink and keeps close to the ellipse, for long and nearly round ones', () => {
    for (const [a, b] of [[20, 12], [15, 11], [13, 3.25], [9, 3.5], [6.6, 6.5]]) {
      const fc = fourCentre(a, b)
      expect(fc.r1).toBeGreaterThan((b * b) / a - 1e-9)
      expect(fc.r1).toBeLessThan(b)
      expect(fc.r2).toBeGreaterThan(b)
      // the centres (a − r1, 0) and (0, b − r2) are r2 − r1 apart, so the arcs are tangent where they meet
      expect(Math.hypot(a - fc.r1, b - fc.r2)).toBeCloseTo(fc.r2 - fc.r1, 9)
      expect(fc.errorFt).toBeLessThan(0.015 * a)
    }
  })
})

describe('fourCentreArcs', () => {
  for (const [w, d] of [[30, 22], [22, 30], [18, 7]]) {
    for (const rot of [0, 33, 90, 215]) {
      test(`${w} × ${d} at ${rot}°: four arcs, two radii, round the whole outline, symmetric about the centre`, () => {
        const m = ellipseWing(w, d, rot)
        const outline = massBuildingPoly(m)
        const got = fourCentreArcs(m, outline)
        if (!got) throw new Error('no four-centre arcs')
        const { arcs, errorFt } = got
        expect(arcs).toHaveLength(4)
        expect(errorFt).toBeLessThanOrEqual(FOUR_CENTRE_MAX_FT)
        const covered = arcs.reduce((s, a) => s + ((a.toEdge - a.fromEdge + outline.length) % outline.length) + 1, 0)
        expect(covered).toBe(outline.length)
        expect(arcs.reduce((s, a) => s + a.sweepDeg, 0)).toBeCloseTo(360, 9)
        const radii = arcs.map((a) => a.radiusFt).sort((p, q) => p - q)
        expect(radii[0]).toBeCloseTo(radii[1], 9)
        expect(radii[2]).toBeCloseTo(radii[3], 9)
        expect(radii[0]).toBeLessThan(radii[2])
        // opposite arcs' centres mirror through the ellipse's centre (dx, dz)
        const cx = arcs.reduce((s, a) => s + a.centre[0], 0) / 4
        const cz = arcs.reduce((s, a) => s + a.centre[1], 0) / 4
        expect(cx).toBeCloseTo(4, 9)
        expect(cz).toBeCloseTo(-3, 9)
        for (const a of arcs) for (const i of [a.fromEdge, (a.toEdge + 1) % outline.length]) {
          const v = outline[i]
          expect(Math.abs(Math.hypot(v[0] - a.centre[0], v[1] - a.centre[1]) - a.radiusFt)).toBeLessThanOrEqual(FOUR_CENTRE_MAX_FT)
        }
      })
    }
  }

  test('none for a circle, which one fitted arc draws, or for any other shape', () => {
    const circle = ellipseWing(13, 13, 20)
    expect(fourCentreArcs(circle, massBuildingPoly(circle))).toBeNull()
    const kidney = { ...ellipseWing(20, 12, 0), shape: 'kidney' }
    expect(fourCentreArcs(kidney, massBuildingPoly(kidney))).toBeNull()
  })
})
