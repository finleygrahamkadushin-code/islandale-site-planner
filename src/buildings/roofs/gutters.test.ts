import { describe, expect, test } from 'vitest'
import { buildRoof, type RoofParams } from './roof'
import { downspoutSpots, eaveRuns, gutterMesh, roofDrainage, DOWNSPOUT_EVERY_M } from './gutters'
import { bounds } from '../geom'
import type { LocalPoint } from '../footprint'
import { M_PER_FT as FT } from '../../site/units'

const box = (w: number, d: number): LocalPoint[] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
const params = (type: string, ridge: 'x' | 'z' = 'x', overhangFt = 1, pitch = 6): RoofParams => ({ type, pitch, ridge, overhangFt })
const roofOf = (poly: readonly LocalPoint[], p: RoofParams) => buildRoof(poly, p).roof
const lengthOf = (r: { a: readonly number[]; b: readonly number[] }) => Math.hypot(r.b[0] - r.a[0], r.b[2] - r.a[2])
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

describe('eave runs: the low, level edges of a sloped roof', () => {
  test('a gable has two eaves, each as long as the roof along its ridge', () => {
    const runs = eaveRuns(roofOf(box(40, 20), params('gable', 'x')))
    expect(runs).toHaveLength(2)
    for (const r of runs) expect(lengthOf(r)).toBeCloseTo(42 * FT, 4)
  })

  test('a hip has an eave on all four sides', () => {
    const runs = eaveRuns(roofOf(box(40, 20), params('hip')))
    expect(runs).toHaveLength(4)
    expect(sum(runs.map(lengthOf))).toBeCloseTo((42 + 22) * 2 * FT, 4)
  })

  test('a shed has one eave, on its low side only', () => {
    const runs = eaveRuns(roofOf(box(20, 10), params('shed', 'x')))
    expect(runs).toHaveLength(1)
    expect(lengthOf(runs[0])).toBeCloseTo(22 * FT, 4)
  })

  test('an eave points away from the roof: outward is level, a unit long and square to the run', () => {
    for (const r of eaveRuns(roofOf(box(40, 20), params('hip')))) {
      const along = [r.b[0] - r.a[0], r.b[2] - r.a[2]]
      expect(Math.hypot(...r.out)).toBeCloseTo(1, 6)
      expect(along[0] * r.out[0] + along[1] * r.out[1]).toBeCloseTo(0, 6)
      // away from the centre of the roof
      const mid = [(r.a[0] + r.b[0]) / 2, (r.a[2] + r.b[2]) / 2]
      expect(mid[0] * r.out[0] + mid[1] * r.out[1]).toBeGreaterThan(0)
    }
  })

  test('a pyramid over an octagon has eight eaves', () => {
    const oct: LocalPoint[] = [...Array(8)].map((_, i) => [9 * Math.cos(((i + 0.5) * Math.PI) / 4), 9 * Math.sin(((i + 0.5) * Math.PI) / 4)] as const)
    expect(eaveRuns(roofOf(oct, params('pyramid')))).toHaveLength(8)
  })

  test('a butterfly has no eaves (its low line is the valley inside), and a flat roof has none', () => {
    expect(eaveRuns(roofOf(box(19, 11.5), params('butterfly', 'z')))).toHaveLength(0)
    expect(eaveRuns(roofOf(box(20, 20), params('flat')))).toHaveLength(0)
  })

  test('a shed fitted to an L-shaped porch still has one straight eave along its front', () => {
    const porch: LocalPoint[] = [[-19, -1], [-8.5, -1], [-5.5, -4], [19, -4], [19, 4], [-19, 4]]
    const runs = eaveRuns(roofOf(porch, params('shed', 'x')))
    expect(runs).toHaveLength(1)
    expect(lengthOf(runs[0])).toBeGreaterThan(38 * FT)
  })
})

describe('downspouts', () => {
  test('one for a short run, at one of its ends', () => {
    const runs = eaveRuns(roofOf(box(20, 10), params('shed')))
    const spots = downspoutSpots(runs)
    expect(spots).toHaveLength(1)
    const ends = [runs[0].a, runs[0].b]
    expect(ends.some((e) => Math.hypot(e[0] - spots[0].at[0], e[2] - spots[0].at[2]) < 1e-6)).toBe(true)
  })

  test('a run takes the end over the lower ground', () => {
    const runs = eaveRuns(roofOf(box(20, 10), params('shed')))
    const spots = downspoutSpots(runs, (x) => -x)
    expect(spots[0].at[0]).toBeGreaterThan(0)
  })

  test('a hip ring shares downspouts: about one for every 12 m of gutter, never one per side', () => {
    const runs = eaveRuns(roofOf(box(40, 20), params('hip')))
    const total = sum(runs.map(lengthOf))
    const spots = downspoutSpots(runs)
    expect(spots).toHaveLength(Math.max(1, Math.round(total / DOWNSPOUT_EVERY_M)))
    expect(spots.length).toBeLessThan(4)
  })

  test('two separate eaves (a gable) each get their own', () => {
    expect(downspoutSpots(eaveRuns(roofOf(box(20, 12), params('gable'))))).toHaveLength(2)
  })
})

describe('the drawn gutters and downspouts', () => {
  test('gutters hang at the eave, just outside it', () => {
    const roof = roofOf(box(40, 20), params('gable', 'x'))
    const g = bounds(gutterMesh(eaveRuns(roof)))
    const r = bounds(roof)
    expect(g.max[1]).toBeLessThanOrEqual(0)
    expect(g.min[1]).toBeGreaterThan(-0.3)
    expect(g.max[2]).toBeGreaterThan(r.max[2])
    expect(g.max[2] - r.max[2]).toBeLessThan(0.2)
  })

  test('a downspout runs from the gutter down to the ground it is given', () => {
    const d = roofDrainage(roofOf(box(20, 10), params('shed')), { type: 'shed', overhangM: 1 * FT, bottomAt: () => -3.2 })
    const b = bounds(d.downspouts)
    expect(b.min[1]).toBeCloseTo(-3.2, 3)
    expect(b.max[1]).toBeGreaterThan(-0.3)
    expect(d.gutters.positions.length).toBeGreaterThan(0)
  })

  test('a butterfly drains by one downspout at the low end of its valley', () => {
    const roof = buildRoof(box(19, 11.5), { ...params('butterfly', 'z', 1.5, 3), valleyFall: 0.5 }).roof
    const d = roofDrainage(roof, { type: 'butterfly', overhangM: 1.5 * FT, bottomAt: () => -3 })
    expect(d.gutters.positions).toHaveLength(0)
    const b = bounds(d.downspouts)
    // the valley falls toward the back (−z): the downspout is at the back, near the middle
    expect(b.max[2]).toBeLessThan(0)
    expect(Math.abs((b.min[0] + b.max[0]) / 2)).toBeLessThan(0.5)
    expect(b.min[1]).toBeCloseTo(-3, 3)
  })

  test('flat roofs get nothing', () => {
    const flat = roofDrainage(roofOf(box(20, 20), params('flat')), { type: 'flat', overhangM: 0.3, bottomAt: () => -3 })
    expect(flat.gutters.positions).toHaveLength(0)
    expect(flat.downspouts.positions).toHaveLength(0)
  })
})
