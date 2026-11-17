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

describe("the Gathering prow's back gable", () => {
  test('is filled across its whole width, both sides of the ridge', async () => {
    const schemes = (await import('../../../data/islandale/schemes.json')).default
    const { buildingMasses, massPoly } = await import('../masses')
    const { roofParamsOf } = await import('./roof')
    const o = schemes.schemes[0].objects.find((x) => x.name === 'Gathering prow') as unknown as Record<string, unknown>
    const m = buildingMasses(o)[0]
    const g = buildRoof(massPoly(m), roofParamsOf(m, null)).gables.positions
    const xs = g.filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBeLessThan(-4.9)
    expect(Math.max(...xs)).toBeGreaterThan(4.9)
  })
})

describe('a butterfly valley that falls to drain', () => {
  const plan = box(19, 11.5)
  const at = (fall?: number) => buildRoof(plan, { type: 'butterfly', pitch: 3, ridge: 'z', overhangFt: 1.5, valleyFall: fall })
  /** Heights of the roof's points on the valley line (x = 0), keyed by z. */
  const valley = (fall?: number) => {
    const p = at(fall).roof.positions
    const out = new Map<string, number>()
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) < 1e-6) out.set(p[i + 2].toFixed(3), p[i + 1])
    return [...out.entries()].map(([z, y]) => [Number(z), y]).sort((a, b) => a[0] - b[0])
  }

  test('without a fall the valley stays level at the eave', () => {
    for (const [, y] of valley()) expect(y).toBeCloseTo(0, 9)
  })

  test('with a fall it meets the eave at the back (−z) and is higher at the front by the fall', () => {
    const v = valley(0.5)
    expect(v[0][1]).toBeCloseTo(0, 9)
    expect(v[v.length - 1][1]).toBeCloseTo(0.5 * FT, 9)
  })

  test('the gable ends follow the sloped valley, and every roof face still faces up', () => {
    const r = at(0.5)
    for (let i = 0; i < r.roof.normals.length; i += 3) expect(r.roof.normals[i + 1]).toBeGreaterThan(0)
    const g = r.gables.positions
    const ys = (zSign: number) => g.filter((_, i) => i % 3 === 1 && Math.sign(g[i + 1]) === zSign && Math.abs(g[i - 1]) < 1e-6)
    expect(Math.min(...ys(1))).toBeGreaterThan(0)
  })
})
