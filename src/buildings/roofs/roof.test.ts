import { describe, expect, test } from 'vitest'
import { buildRoof, normaliseRoof, offsetPolygon, roofForm, ROOF_TYPES, type RoofParams } from './roof'
import { prowRoof } from './fittedRoof'
import { localFootprint, signedArea, type LocalPoint } from '../footprint'
import type { MeshData } from '../geom'
import { M_PER_FT as FT } from '../../site/units'

const box = (w: number, d: number): LocalPoint[] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
const params = (type: string, ridge: 'x' | 'z', overhangFt = 0, pitch = 6): RoofParams => ({ type, pitch, ridge, overhangFt })
const riseFt = (poly: readonly LocalPoint[], p: RoofParams) => buildRoof(poly, p).rise / FT

/** Each roof triangle's slope as rise per 12 of run, read from its normal. */
function pitches(m: MeshData): number[] {
  const out: number[] = []
  for (let i = 0; i < m.normals.length; i += 9) {
    const [nx, ny, nz] = [m.normals[i], m.normals[i + 1], m.normals[i + 2]]
    out.push((12 * Math.hypot(nx, nz)) / ny)
  }
  return out
}

describe('roof rise over a box (40 × 20 ft at 6:12)', () => {
  const plan = box(40, 20)

  test('hip: 5 ft whichever way the ridge runs', () => {
    expect(riseFt(plan, params('hip', 'x'))).toBeCloseTo(5, 6)
    expect(riseFt(plan, params('hip', 'z'))).toBeCloseTo(5, 6)
  })

  test('hip: every face keeps the set pitch, whichever way the ridge runs', () => {
    for (const ridge of ['x', 'z'] as const) {
      const ps = pitches(buildRoof(plan, params('hip', ridge)).roof)
      expect(ps.length).toBeGreaterThan(0)
      for (const p of ps) expect(p).toBeCloseTo(6, 6)
    }
  })

  test('hip: the overhang adds its own run (22 × 42 ft at the eave → 5.5 ft)', () => {
    expect(riseFt(plan, params('hip', 'x', 1))).toBeCloseTo(5.5, 6)
    expect(riseFt(plan, params('hip', 'z', 1))).toBeCloseTo(5.5, 6)
  })

  test('gable: half the span across the ridge times the pitch', () => {
    expect(riseFt(plan, params('gable', 'x'))).toBeCloseTo(5, 6)
    expect(riseFt(plan, params('gable', 'z'))).toBeCloseTo(10, 6)
  })

  test('shed: the whole span across the ridge times the pitch', () => {
    expect(riseFt(plan, params('shed', 'x'))).toBeCloseTo(10, 6)
    expect(riseFt(plan, params('shed', 'z'))).toBeCloseTo(20, 6)
  })

  test('pyramid: the inradius times the pitch, ridge ignored', () => {
    expect(riseFt(plan, params('pyramid', 'x'))).toBeCloseTo(5, 6)
    expect(riseFt(plan, params('pyramid', 'z'))).toBeCloseTo(5, 6)
    expect(riseFt(plan, params('pyramid', 'x', 2))).toBeCloseTo(6, 6)
  })

  test('flat: a 0.3 m slab whatever the pitch', () => {
    expect(buildRoof(plan, params('flat', 'x', 1, 12)).rise).toBeCloseTo(0.3, 9)
  })
})

describe('the overhang grows every footprint outward', () => {
  test('offsetPolygon on each box shape encloses more area than the walls', () => {
    for (const shape of ['rect', 'hex', 'oct', 'tri', 'trap', 'para', 'half']) {
      const poly = localFootprint({ w: 24, d: 16, shape, taper: 0.5, skew: 3 })
      expect(signedArea(offsetPolygon(poly, 2)), shape).toBeGreaterThan(signedArea(poly))
    }
  })
})

describe('the box roofs (R11.7)', () => {
  const outlines: Record<string, LocalPoint[]> = {
    rectangle: box(20, 12),
    square: box(10, 10),
    'L shape': [[0, 0], [20, 0], [20, 8], [8, 8], [8, 16], [0, 16]],
    triangle: [[0, 0], [12, 0], [4, 9]],
  }

  test('only gable, hip, shed, gambrel and butterfly (as buildRoof normalises the type) reach the box path, so it has no prow case', () => {
    const boxed = new Set<string>()
    for (const poly of Object.values(outlines)) for (const t of [...ROOF_TYPES, 'green', 'nonsense', '']) if (roofForm(t, poly) === 'box') boxed.add(normaliseRoof(t))
    expect([...boxed].sort()).toEqual(['butterfly', 'gable', 'gambrel', 'hip', 'shed'])
  })

  test('a prow roof on a rectangle is the fitted prow, not a box roof', () => {
    const poly = box(20, 12)
    expect(roofForm('prow', poly)).toBe('prow')
    const p = { ...params('prow', 'z', 1.5), tipPost: false } as RoofParams
    expect(buildRoof(poly, p)).toEqual(prowRoof(poly, p.pitch, p.ridge, p.overhangFt, undefined))
  })
})
