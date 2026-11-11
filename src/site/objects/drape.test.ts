import { describe, expect, test } from 'vitest'
import { localFootprint, localToSite, signedArea, footprintParams, type LocalPoint } from '../../buildings/footprint'
import type { PlanObject } from '../../store/types'
import planFile from '../../../data/plans/islandale.plan.json'
import { buildDrapedPad, drapeCells, DRAPE_LIFT_M } from './drape'
import { loadIslandaleTerrain } from '../islandale'
import { samplePosition, surfaceElevationAt } from '../terrain'
import { M_PER_FT as FT } from '../units'

const rect: LocalPoint[] = [[-10, -2], [10, -2], [10, 2], [-10, 2]]
const ell: LocalPoint[] = [[0, 0], [12, 0], [12, 4], [4, 4], [4, 10], [0, 10]]

/** Plan area of a mesh's upward faces, square feet. */
function topArea(positions: readonly number[], normals: readonly number[]): number {
  let a = 0
  for (let i = 0; i < positions.length; i += 9) {
    if (normals[i + 1] < 0.5) continue
    const [x0, , z0, x1, , z1, x2, , z2] = positions.slice(i, i + 9)
    a += Math.abs((x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)) / 2
  }
  return a / (FT * FT)
}

describe('drapeCells', () => {
  test('cuts a rectangle into cells no wider than the cell size that add up to it', () => {
    const cells = drapeCells(rect, 1.5)
    const area = cells.reduce((s, c) => s + Math.abs(signedArea(c)), 0)
    expect(area).toBeCloseTo(80, 6)
    for (const c of cells) {
      const xs = c.map((p) => p[0])
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1.5 + 1e-9)
    }
  })
  test('keeps a concave outline exactly', () => {
    const area = drapeCells(ell, 1.5).reduce((s, c) => s + Math.abs(signedArea(c)), 0)
    expect(area).toBeCloseTo(signedArea(ell), 6)
  })
})

describe('buildDrapedPad', () => {
  const slope = ([x, z]: LocalPoint) => 0.1 * x * FT + 0.05 * z * FT
  const thick = 0.06

  test('every top vertex sits its thickness above the ground under it', () => {
    const m = buildDrapedPad(ell, slope, thick)
    for (let i = 0; i < m.positions.length; i += 3) {
      if (m.normals[i + 1] < 0.5) continue
      const p: LocalPoint = [m.positions[i] / FT, m.positions[i + 2] / FT]
      expect(m.positions[i + 1]).toBeCloseTo(slope(p) + thick + DRAPE_LIFT_M, 9)
    }
  })
  test('the top covers the outline and bends with the slope instead of staying flat', () => {
    const m = buildDrapedPad(ell, slope, thick)
    expect(topArea(m.positions, m.normals)).toBeCloseTo(signedArea(ell), 3)
    const ys = m.positions.filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.3)
  })
  test('a skirt runs down every edge below the ground', () => {
    const m = buildDrapedPad(rect, () => 0, thick)
    const ys = m.positions.filter((_, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBeLessThan(0)
    const side = m.normals.filter((_, i) => i % 3 === 1).filter((ny) => Math.abs(ny) < 1e-6)
    expect(side.length).toBeGreaterThan(0)
  })
})

describe('Scheme C paths on the Islandale terrain', () => {
  const t = loadIslandaleTerrain()
  const objects = planFile.plan.objects as unknown as Record<string, PlanObject>
  const pads = Object.values(objects).filter((o) => o.type === 'pad')

  test('surfaceElevationAt is the terrain mesh: exact at nodes, linear across each triangle', () => {
    const [x, n] = samplePosition(t, 40, 25)
    expect(surfaceElevationAt(t, x, n)).toBeCloseTo(t.z[25 * t.nx + 40], 9)
    expect(surfaceElevationAt(t, x + 1, n + 1)).toBeCloseTo((t.z[25 * t.nx + 41] + t.z[26 * t.nx + 40]) / 2, 9)
  })

  test.each(pads.map((o) => [o.name, o] as const))('%s hugs the ground everywhere inside it', (_, o) => {
    const poly = localFootprint(footprintParams(o))
    const base = surfaceElevationAt(t, o.position.x, o.position.n)
    const groundAt = (p: LocalPoint) => {
      const [x, n] = localToSite(o.position, o.rotation, p)
      return surfaceElevationAt(t, x, n) - base
    }
    const thick = 0.2 * FT
    const m = buildDrapedPad(poly, groundAt, thick)
    // each top triangle at its centroid and edge midpoints, against the ground there
    let worst = 0
    for (let i = 0; i < m.positions.length; i += 9) {
      if (m.normals[i + 1] < 0.5) continue
      const v = [0, 1, 2].map((k) => m.positions.slice(i + 3 * k, i + 3 * k + 3))
      for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
        const p = [0, 1, 2].map((c) => w[0] * v[0][c] + w[1] * v[1][c] + w[2] * v[2][c])
        const gap = p[1] - (groundAt([p[0] / FT, p[2] / FT]) + thick + DRAPE_LIFT_M)
        worst = Math.max(worst, Math.abs(gap))
      }
    }
    // nothing floats or sinks by more than 2 cm
    expect(worst).toBeLessThan(0.02)
  })
})
